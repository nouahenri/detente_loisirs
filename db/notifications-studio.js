/**
 * Notifications envoyées depuis le studio (Messages → Notifications de l'app),
 * demande du 19/09/2026.
 *
 * Audiences : tous les téléphones inscrits, les demandeurs, les employés, les
 * propriétaires des biens (tous, ceux d'un type d'annonce, ou un propriétaire
 * précis). Les propriétaires se renseignent dans la fiche de chaque annonce
 * (studio seulement) : `proprietairesDesAnnonces` les regroupe par numéro.
 *
 * Identification (décision du propriétaire) : le NUMÉRO DU PROFIL de l'app,
 * transmis quand la personne active les notifications. Il est rapproché des
 * numéros (téléphone ou WhatsApp) des demandes, des fiches employés de la
 * comptabilité et des propriétaires. Comparaison sur les 8 derniers chiffres :
 * « +225 07 07 07 07 07 », « 0707070707 » et « 00225 0707070707 » désignent
 * la même personne.
 *
 * Canaux : notification push (service Expo) aux téléphones qui ont un jeton ;
 * sinon l'app relève ses messages d'elle-même (GET /api/app/messages, « veille »).
 * E-mail en plus aux contacts de l'audience qui ont une adresse (employés ;
 * demandeurs : seulement ceux qui ont accepté nos offres). La fiche du
 * propriétaire d'un bien ne porte pas d'e-mail : notification seulement.
 *
 * Stockage : tables `app_abonnes` et `app_messages`
 * (db/migration-notifications-contacts.sql), sinon data/notifications-studio.json.
 * La table `proprietaires` de cette migration n'est plus utilisée : depuis la
 * précision du propriétaire (19/09/2026), le propriétaire se saisit dans la
 * fiche de chaque annonce (db/fiches.js → proprietaireAnnonce).
 */

const jsonStore = require('./json-store');

const FICHIER = 'notifications-studio.json';
const CIBLES = ['tous', 'demandeurs', 'employes', 'proprietaires'];
// Écrans de l'application qu'une notification peut ouvrir (20/09/2026) :
// « messages » est le comportement d'origine (la boîte de réception de l'app).
const ECRANS = ['messages', 'explorer', 'devis', 'profil'];
const TYPES_ANNONCE = ['villa', 'vehicle', 'activity', 'terrain'];
const LIBELLES_TYPES = { villa: 'résidences', vehicle: 'véhicules', activity: 'activités', terrain: 'terrains' };
const LANGUES = ['fr', 'en', 'es'];
const TITRE_MAX = 80;
const CORPS_MAX = 1000;
const MESSAGES_GARDES = 200;

const texte = (valeur, max) => String(valeur ?? '').trim().slice(0, max);
const emailValide = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Clé de comparaison d'un numéro : ses 8 derniers chiffres ('' si trop court). */
function cleTelephone(numero) {
  const chiffres = String(numero ?? '').replace(/\D/g, '');
  return chiffres.length >= 8 ? chiffres.slice(-8) : '';
}

const estVisiteur = v => /^[A-Za-z0-9-]{16,64}$/.test(String(v || ''));
const estJetonExpo = j => typeof j === 'string' && j.length <= 200 && /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,}\]$/.test(j);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Propriétaires des biens, lus dans les fiches d'annonces (villas, voitures,
 * activités, terrains) et regroupés : même numéro (téléphone ou WhatsApp) ou,
 * à défaut, même nom = même personne. `id` sert au ciblage d'un propriétaire.
 */
function proprietairesDesAnnonces(contenu) {
  const c = contenu && typeof contenu === 'object' ? contenu : {};
  const groupes = new Map();
  const sources = [['villa', c.villas, a => a.name], ['vehicle', c.vehicles, a => a.name], ['activity', c.activities, a => a.title], ['terrain', c.terrains, a => a.title || a.reference]];
  for (const [kind, liste, titre] of sources) {
    for (const annonce of Array.isArray(liste) ? liste : []) {
      const p = annonce && annonce.proprietaire;
      if (!p || typeof p !== 'object') continue;
      const nomComplet = [p.prenom, p.nom].map(v => texte(v, 120)).filter(Boolean).join(' ');
      const cle = cleTelephone(p.telephone) || cleTelephone(p.whatsapp) || nomComplet.toLowerCase();
      if (!cle) continue;
      const id = `p-${cle.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
      if (!groupes.has(id)) groupes.set(id, { id, prenom: texte(p.prenom, 80), nom: texte(p.nom, 120), telephone: texte(p.telephone, 40), whatsapp: texte(p.whatsapp, 40), email: '', actif: true, annonces: [] });
      const g = groupes.get(id);
      // Coordonnées complétées d'une fiche à l'autre (une fiche peut n'avoir que le WhatsApp).
      for (const champ of ['prenom', 'nom', 'telephone', 'whatsapp']) if (!g[champ] && p[champ]) g[champ] = texte(p[champ], champ === 'nom' ? 120 : 80);
      g.annonces.push({ kind, id: annonce.id, titre: texte(titre(annonce), 120), etat: annonce.etat || 'active' });
    }
  }
  return [...groupes.values()].sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
}

/** Annonces dont le propriétaire n'est pas renseigné (rappel dans le studio). */
function annoncesSansProprietaire(contenu) {
  const c = contenu && typeof contenu === 'object' ? contenu : {};
  return [['villa', c.villas, a => a.name], ['vehicle', c.vehicles, a => a.name], ['activity', c.activities, a => a.title], ['terrain', c.terrains, a => a.title || a.reference]]
    .flatMap(([kind, liste, titre]) => (Array.isArray(liste) ? liste : [])
      .filter(a => a && a.id && !(a.proprietaire && Object.values(a.proprietaire).some(Boolean)) && (a.etat || 'active') !== 'archivee')
      .map(a => ({ kind, id: a.id, titre: texte(titre(a), 120) })));
}

/** Inscription d'un téléphone : identifiant de l'app, jeton Expo facultatif, numéro du profil. */
function validerAbonne(source = {}, { existant = null, maintenant = new Date() } = {}) {
  if (!estVisiteur(source.visiteur)) return { erreur: 'Téléphone non identifié.' };
  const horodatage = new Date(maintenant).toISOString();
  const telephone = texte(source.telephone, 40);
  return {
    abonne: {
      visiteur: String(source.visiteur),
      jeton: estJetonExpo(source.jeton) ? source.jeton : '',
      telephone, cleTelephone: cleTelephone(telephone),
      nom: texte(source.nom, 120),
      langue: LANGUES.includes(String(source.langue || '').slice(0, 2)) ? String(source.langue).slice(0, 2) : 'fr',
      plateforme: ['ios', 'android', 'web'].includes(source.plateforme) ? source.plateforme : '',
      inscritLe: existant?.inscritLe || horodatage, vuLe: horodatage
    }
  };
}

/** Message et audience saisis au studio. */
function validerMessage(source = {}) {
  const erreurs = [];
  const titre = texte(source.titre, TITRE_MAX);
  const corps = texte(source.corps, CORPS_MAX);
  if (titre.length < 3) erreurs.push('Le titre doit contenir au moins 3 caractères.');
  if (!corps) erreurs.push('Le message est requis.');
  // Écran ouvert quand la personne touche la notification (20/09/2026).
  // L'application sait déjà router sur ces écrans (useOuvertureNotifications).
  const ecran = ECRANS.includes(source.ecran) ? source.ecran : 'messages';
  const a = source.audience && typeof source.audience === 'object' ? source.audience : {};
  const cible = CIBLES.includes(a.cible) ? a.cible : '';
  if (!cible) erreurs.push('Choisissez à qui envoyer la notification.');
  const audience = {
    cible,
    type: cible === 'proprietaires' && TYPES_ANNONCE.includes(a.type) ? a.type : 'tous',
    proprietaireId: cible === 'proprietaires' ? texte(a.proprietaireId, 90) : ''
  };
  return { erreurs, message: erreurs.length ? null : { titre, corps, ecran, audience, email: source.email !== false && cible !== 'tous' } };
}

// ---------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------

/**
 * Personnes visées par une audience, avec leurs numéros et e-mails :
 * [{ nom, cles: Set de clés téléphone, email }].
 * `donnees` : { leads, employes, proprietaires, jetonsDemandes (lead → jeton Expo) }.
 */
function personnesDe(audience, { leads = [], employes = [], proprietaires = [] } = {}) {
  if (audience.cible === 'demandeurs') {
    return leads.filter(Boolean).map(l => ({
      nom: texte(l.name, 120), cles: new Set([cleTelephone(l.phone)].filter(Boolean)),
      // E-mail aux demandeurs : seulement s'ils ont accepté nos offres.
      email: l.whatsappOptIn === true && emailValide(String(l.email || '')) ? String(l.email).toLowerCase() : '',
      leadId: l.id
    }));
  }
  if (audience.cible === 'employes') {
    return employes.filter(e => e && e.actif !== false).map(e => ({
      nom: [e.prenom, e.nom].filter(Boolean).join(' '), cles: new Set([cleTelephone(e.telephone), cleTelephone(e.whatsapp)].filter(Boolean)),
      email: emailValide(String(e.email || '')) ? String(e.email).toLowerCase() : ''
    }));
  }
  if (audience.cible === 'proprietaires') {
    return proprietaires
      .filter(p => p && p.actif !== false)
      .filter(p => !audience.proprietaireId || p.id === audience.proprietaireId)
      .filter(p => audience.type === 'tous' || (p.annonces || []).some(a => a.kind === audience.type))
      .map(p => ({
        nom: [p.prenom, p.nom].filter(Boolean).join(' '), cles: new Set([cleTelephone(p.telephone), cleTelephone(p.whatsapp)].filter(Boolean)),
        email: emailValide(String(p.email || '')) ? String(p.email).toLowerCase() : ''
      }));
  }
  return [];
}

/**
 * Destinataires d'un message : téléphones inscrits visés (push ou relève) et
 * e-mails. `jetonsDemandes` : { leadId: jeton Expo } des demandes envoyées
 * depuis l'app avec le suivi activé (un demandeur sans numéro de profil est
 * quand même retrouvé par son jeton).
 */
function destinataires(audience, { abonnes = [], leads = [], employes = [], proprietaires = [], jetonsDemandes = {} } = {}) {
  if (audience.cible === 'tous') {
    return { abonnes: abonnes.slice(), emails: [], personnes: 0 };
  }
  const personnes = personnesDe(audience, { leads, employes, proprietaires });
  const cles = new Set(personnes.flatMap(p => [...p.cles]));
  const jetons = new Set(audience.cible === 'demandeurs'
    ? personnes.map(p => jetonsDemandes[p.leadId]).filter(Boolean)
    : []);
  const vises = abonnes.filter(a => (a.cleTelephone && cles.has(a.cleTelephone)) || (a.jeton && jetons.has(a.jeton)));
  const emails = [...new Map(personnes.filter(p => p.email).map(p => [p.email, { email: p.email, nom: p.nom }])).values()];
  const uniques = new Set(personnes.map(p => [...p.cles].sort().join('|') || p.email || p.nom).filter(Boolean));
  return { abonnes: vises, emails, personnes: uniques.size };
}

/** Libellé lisible d'une audience (historique du studio). */
function libelleAudience(audience, proprietaires = []) {
  if (audience.cible === 'tous') return 'Tous les utilisateurs de l’app';
  if (audience.cible === 'demandeurs') return 'Demandeurs';
  if (audience.cible === 'employes') return 'Employés';
  if (audience.proprietaireId) {
    const p = proprietaires.find(x => x.id === audience.proprietaireId);
    return `Propriétaire : ${p ? [p.prenom, p.nom].filter(Boolean).join(' ') : 'supprimé'}`;
  }
  return audience.type === 'tous' ? 'Propriétaires' : `Propriétaires des ${LIBELLES_TYPES[audience.type]}`;
}

/** Messages d'un téléphone, les plus récents d'abord (relève de l'app). */
function messagesPour(visiteur, messages = [], depuis = '') {
  const apres = Date.parse(depuis || '') || 0;
  return messages
    .filter(m => (m.destinataires || []).includes(visiteur) && (Date.parse(m.creeLe) || 0) > apres)
    .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)))
    .slice(0, 20)
    .map(m => ({ id: m.id, titre: m.titre, corps: m.corps, le: m.creeLe }));
}

/** Notifications Expo d'un message (lots de 100 au plus, découpés par l'appelant). */
function messagesExpo(message, abonnes) {
  return abonnes.filter(a => a.jeton).map(a => ({
    to: a.jeton, sound: 'default', title: message.titre, body: message.corps,
    data: { ecran: message.ecran || 'messages', message: message.id }
  }));
}

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------
let sondeBase = () => false;
let depot = null;

function configure(options = {}) {
  if (typeof options.isDbReady === 'function') sondeBase = options.isDbReady;
}
function utiliserBase() {
  try { return Boolean(sondeBase()); } catch { return false; }
}
function repo() {
  if (depot === null) {
    try { depot = require('./repository'); } catch { depot = false; }
  }
  return depot;
}
const tableAbsente = error => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
const versIso = valeur => {
  if (!valeur) return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const versMysql = valeur => (versIso(valeur) || new Date().toISOString()).slice(0, 19).replace('T', ' ');
const json = (valeur, repli) => {
  if (valeur && typeof valeur === 'object') return valeur;
  try { return JSON.parse(valeur || ''); } catch { return repli; }
};

function lireFichier() {
  const brut = jsonStore.read(FICHIER, {});
  return {
    abonnes: Array.isArray(brut?.abonnes) ? brut.abonnes : [],
    messages: Array.isArray(brut?.messages) ? brut.messages : []
  };
}

async function enBaseOuFichier(requeteBase, modifierFichier) {
  if (utiliserBase()) {
    try { return await requeteBase(repo()); }
    catch (error) { if (!tableAbsente(error)) throw error; }
  }
  const donnees = lireFichier();
  const resultat = modifierFichier(donnees);
  jsonStore.write(FICHIER, donnees);
  return resultat;
}

const abonneDepuisLigne = l => ({
  visiteur: l.visiteur, jeton: l.jeton || '', telephone: l.telephone || '', cleTelephone: l.cle_telephone || '', nom: l.nom || '',
  langue: l.langue || 'fr', plateforme: l.plateforme || '', inscritLe: versIso(l.inscrit_le), vuLe: versIso(l.vu_le)
});
const messageDepuisLigne = l => ({
  id: l.id, titre: l.titre, corps: l.corps, audience: json(l.audience, { cible: 'tous' }), destinataires: json(l.destinataires, []),
  bilan: json(l.bilan, {}), creePar: l.cree_par || '', creeLe: versIso(l.created_at)
});

/** { abonnes, messages } — messages du plus récent au plus ancien. */
async function tout() {
  if (utiliserBase()) {
    try {
      const [[abonnes], [messages]] = await Promise.all([
        repo().query('SELECT * FROM app_abonnes ORDER BY vu_le DESC'),
        repo().query(`SELECT * FROM app_messages ORDER BY created_at DESC LIMIT ${MESSAGES_GARDES}`)
      ]);
      return {
        abonnes: abonnes.map(abonneDepuisLigne),
        messages: messages.map(messageDepuisLigne)
      };
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  return { ...donnees, messages: donnees.messages.slice().sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe))) };
}

async function enregistrerAbonne(a) {
  return enBaseOuFichier(async r => {
    await r.query(`INSERT INTO app_abonnes (visiteur, jeton, telephone, cle_telephone, nom, langue, plateforme, inscrit_le, vu_le)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE jeton=VALUES(jeton), telephone=VALUES(telephone), cle_telephone=VALUES(cle_telephone),
      nom=VALUES(nom), langue=VALUES(langue), plateforme=VALUES(plateforme), vu_le=VALUES(vu_le)`,
    [a.visiteur, a.jeton, a.telephone, a.cleTelephone, a.nom, a.langue, a.plateforme, versMysql(a.inscritLe), versMysql(a.vuLe)]);
    return a;
  }, donnees => {
    const index = donnees.abonnes.findIndex(x => x.visiteur === a.visiteur);
    if (index >= 0) donnees.abonnes[index] = a; else donnees.abonnes.push(a);
    return a;
  });
}

async function retirerAbonne(visiteur) {
  return enBaseOuFichier(async r => (await r.query('DELETE FROM app_abonnes WHERE visiteur = ?', [String(visiteur)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.abonnes.length; donnees.abonnes = donnees.abonnes.filter(a => a.visiteur !== String(visiteur)); return avant - donnees.abonnes.length; });
}

/** Jetons Expo périmés (appli désinstallée) : retirés des abonnés. */
async function oublierJetons(jetons) {
  const liste = [...new Set((jetons || []).filter(estJetonExpo))];
  if (!liste.length) return 0;
  return enBaseOuFichier(async r => (await r.query(`UPDATE app_abonnes SET jeton = '' WHERE jeton IN (${liste.map(() => '?').join(',')})`, liste))[0]?.affectedRows || 0,
    donnees => { let n = 0; donnees.abonnes.forEach(a => { if (liste.includes(a.jeton)) { a.jeton = ''; n += 1; } }); return n; });
}

async function enregistrerMessage(m) {
  return enBaseOuFichier(async r => {
    await r.query(`INSERT INTO app_messages (id, titre, corps, audience, destinataires, bilan, cree_par, created_at)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE bilan=VALUES(bilan)`,
    [m.id, m.titre, m.corps, JSON.stringify(m.audience), JSON.stringify(m.destinataires || []), JSON.stringify(m.bilan || {}), m.creePar || '', versMysql(m.creeLe)]);
    return m;
  }, donnees => {
    const index = donnees.messages.findIndex(x => x.id === m.id);
    if (index >= 0) donnees.messages[index] = m; else donnees.messages.unshift(m);
    donnees.messages = donnees.messages.slice(0, MESSAGES_GARDES);
    return m;
  });
}

module.exports = {
  FICHIER, CIBLES, TYPES_ANNONCE, TITRE_MAX, CORPS_MAX,
  cleTelephone, validerAbonne, validerMessage, proprietairesDesAnnonces, annoncesSansProprietaire,
  personnesDe, destinataires, libelleAudience, messagesPour, messagesExpo,
  configure, tout, enregistrerAbonne, retirerAbonne, oublierJetons, enregistrerMessage
};
