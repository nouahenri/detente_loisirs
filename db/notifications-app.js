/**
 * Notifications de l'application mobile (mobile/natif) — module PUR.
 *
 * Deux usages décidés le 14/09/2026 :
 *   · « nouveautés » : une annonce publiée (studio ou Page Facebook) est
 *     annoncée à tous les téléphones inscrits ;
 *   · « suivi de demande » : quand le studio passe une demande de devis à
 *     « Contacté » ou « Confirmé », le téléphone qui l'a envoyée est prévenu.
 *
 * L'envoi passe par le service Expo (exp.host) : aucune clé Firebase ni Apple
 * n'est stockée sur le serveur, elles sont rattachées au projet Expo de l'app.
 * Ce module ne fait aucune entrée/sortie : server.js lit et écrit les fichiers
 * data/app-appareils.json et data/app-notifications.json.
 */

const LANGUES = ['fr', 'en', 'es'];
const MAX_APPAREILS = 20000;
// Une publication plus ancienne (resynchronisée, réimportée) n'est pas une
// nouveauté : on ne réveille pas les téléphones pour elle.
const FRAICHEUR_PUBLICATION_MS = 3 * 24 * 3600 * 1000;
const TAILLE_LOT_EXPO = 100;

function estJetonExpo(jeton) {
  return typeof jeton === 'string' && jeton.length <= 200 && /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,}\]$/.test(jeton);
}

const langueValide = langue => (LANGUES.includes(String(langue || '').slice(0, 2)) ? String(langue).slice(0, 2) : 'fr');

function lireRegistre(brut) {
  return brut && typeof brut === 'object' && brut.appareils && typeof brut.appareils === 'object'
    ? { appareils: { ...brut.appareils } }
    : { appareils: {} };
}

/** Inscrit (ou rafraîchit) un téléphone. Renvoie { registre, erreur }. */
function enregistrerAppareil(brut, { jeton, plateforme, langue } = {}, maintenant = new Date().toISOString()) {
  const registre = lireRegistre(brut);
  if (!estJetonExpo(jeton)) return { registre, erreur: 'Jeton de notification invalide.' };
  const existant = registre.appareils[jeton];
  registre.appareils[jeton] = {
    plateforme: ['ios', 'android'].includes(plateforme) ? plateforme : 'inconnue',
    langue: langueValide(langue),
    inscritLe: existant?.inscritLe || maintenant,
    vuLe: maintenant
  };
  // Plafond : on écarte les téléphones qui ne se sont pas manifestés depuis le plus longtemps.
  const jetons = Object.keys(registre.appareils);
  if (jetons.length > MAX_APPAREILS) {
    jetons
      .sort((a, b) => String(registre.appareils[a].vuLe).localeCompare(String(registre.appareils[b].vuLe)))
      .slice(0, jetons.length - MAX_APPAREILS)
      .forEach(ancien => { delete registre.appareils[ancien]; });
  }
  return { registre, erreur: null };
}

function retirerAppareils(brut, jetons) {
  const registre = lireRegistre(brut);
  (Array.isArray(jetons) ? jetons : [jetons]).forEach(jeton => { delete registre.appareils[jeton]; });
  return registre;
}

/**
 * Annonces publiques du contenu, avec une clé stable « type:id ».
 * Mêmes filtres que le site : fiche masquée ignorée, terrain vendu ignoré.
 * `publicationsExclues` : publications nées d'une fiche du site (déjà
 * annoncée comme résidence, terrain ou activité).
 */
function annoncesPubliques(contenu, { publicationsExclues = new Set(), maintenant = Date.now() } = {}) {
  const c = contenu && typeof contenu === 'object' ? contenu : {};
  const visibles = liste => (Array.isArray(liste) ? liste : []).filter(item => item && item.id && item.visible !== false);
  const annonces = [];
  visibles(c.villas).forEach(v => annonces.push({ cle: `villa:${v.id}`, type: 'villa', id: String(v.id), titre: String(v.name || '') }));
  visibles(c.terrains).filter(t => String(t.status || '').toLowerCase() !== 'vendu')
    .forEach(t => annonces.push({ cle: `terrain:${t.id}`, type: 'terrain', id: String(t.id), titre: String(t.title || '') }));
  visibles(c.activities).forEach(a => annonces.push({ cle: `activite:${a.id}`, type: 'activite', id: String(a.id), titre: String(a.title || '') }));
  (Array.isArray(c.facebookPosts) ? c.facebookPosts : []).forEach(p => {
    if (!p || !p.id || publicationsExclues.has(String(p.id))) return;
    if (!p.message && !p.full_picture) return;
    const date = Date.parse(p.created_time || '');
    const recente = Number.isFinite(date) && maintenant - date <= FRAICHEUR_PUBLICATION_MS;
    const titre = String((p.fiche && p.fiche.name) || String(p.message || '').split('\n').map(l => l.trim()).find(l => l.length > 3) || '');
    annonces.push({ cle: `publication:${p.id}`, type: 'publication', id: String(p.id), titre: titre.slice(0, 80), recente });
  });
  return annonces;
}

/**
 * Nouveautés depuis le dernier passage. Premier passage = amorçage : tout
 * l'existant est mémorisé sans rien envoyer (sinon chaque téléphone recevrait
 * tout le catalogue d'un coup).
 */
function detecterNouveautes(etatBrut, annonces, maintenant = new Date().toISOString()) {
  const etat = etatBrut && typeof etatBrut === 'object' ? etatBrut : {};
  const connues = new Set(Array.isArray(etat.cles) ? etat.cles : []);
  const cles = [...new Set([...connues, ...annonces.map(a => a.cle)])].slice(-5000);
  const suivant = { ...etat, amorce: true, amorceAt: etat.amorceAt || maintenant, cles, dernierPassage: maintenant };
  if (etat.amorce !== true) return { etat: suivant, nouvelles: [] };
  const nouvelles = annonces.filter(a => !connues.has(a.cle) && (a.type !== 'publication' || a.recente));
  return { etat: suivant, nouvelles };
}

const TEXTES = {
  fr: {
    villa: 'Nouvelle résidence', terrain: 'Nouveau terrain à vendre', activite: 'Nouvelle activité', publication: 'Nouvelle publication',
    plusieurs: n => `${n} nouvelles annonces à Assinie`, plusieursCorps: 'Découvrez-les dans l’application.',
    contacte: ['Votre demande est prise en charge', 'Notre conciergerie vous contacte sur WhatsApp.'],
    confirme: ['Votre réservation est confirmée', 'Merci ! Retrouvez le détail avec notre conciergerie.']
  },
  en: {
    villa: 'New residence', terrain: 'New plot for sale', activite: 'New activity', publication: 'New post',
    plusieurs: n => `${n} new listings in Assinie`, plusieursCorps: 'Discover them in the app.',
    contacte: ['Your request is being handled', 'Our concierge will contact you on WhatsApp.'],
    confirme: ['Your booking is confirmed', 'Thank you! Our concierge will share the details.']
  },
  es: {
    villa: 'Nueva residencia', terrain: 'Nuevo terreno en venta', activite: 'Nueva actividad', publication: 'Nueva publicación',
    plusieurs: n => `${n} nuevos anuncios en Assinie`, plusieursCorps: 'Descúbralos en la aplicación.',
    contacte: ['Su solicitud está en curso', 'Nuestra conserjería le contactará por WhatsApp.'],
    confirme: ['Su reserva está confirmada', '¡Gracias! Nuestra conserjería le dará los detalles.']
  }
};

/** Contenu d'une notification de nouveautés, dans la langue du téléphone. */
function messageNouveautes(nouvelles, langue) {
  const t = TEXTES[langueValide(langue)];
  if (!nouvelles.length) return null;
  if (nouvelles.length === 1) {
    const a = nouvelles[0];
    return { title: t[a.type], body: a.titre || t.plusieursCorps, data: { type: a.type, id: a.id } };
  }
  return { title: t.plusieurs(nouvelles.length), body: t.plusieursCorps, data: { ecran: 'explorer' } };
}

const STATUTS_NOTIFIES = ['contacte', 'confirme'];

/**
 * Suivi d'une demande : message à envoyer quand le statut vient de changer
 * vers « contacte » ou « confirme ». Renvoie { suivi, message } où `suivi`
 * est l'entrée mise à jour (statut mémorisé), `message` null si rien à envoyer.
 */
function suiviDemande(suiviBrut, statut) {
  if (!suiviBrut || !estJetonExpo(suiviBrut.jeton)) return { suivi: suiviBrut || null, message: null };
  if (suiviBrut.statut === statut || !STATUTS_NOTIFIES.includes(statut)) {
    return { suivi: { ...suiviBrut, statut }, message: null };
  }
  const [title, body] = TEXTES[langueValide(suiviBrut.langue)][statut];
  return {
    suivi: { ...suiviBrut, statut },
    message: { to: suiviBrut.jeton, title, body, sound: 'default', data: { ecran: 'devis' } }
  };
}

/** Messages Expo pour tous les téléphones, regroupés par lots de 100. */
function lotsNouveautes(registreBrut, nouvelles) {
  const registre = lireRegistre(registreBrut);
  const messages = Object.entries(registre.appareils).map(([jeton, appareil]) => {
    const contenu = messageNouveautes(nouvelles, appareil.langue);
    return contenu ? { to: jeton, sound: 'default', ...contenu } : null;
  }).filter(Boolean);
  return decouper(messages);
}

function decouper(messages, taille = TAILLE_LOT_EXPO) {
  const lots = [];
  for (let i = 0; i < messages.length; i += taille) lots.push(messages.slice(i, i + taille));
  return lots;
}

/** Jetons à oublier d'après la réponse d'Expo (téléphone désinstallé, jeton périmé). */
function jetonsPerimes(lot, reponse) {
  const tickets = reponse && Array.isArray(reponse.data) ? reponse.data : [];
  return tickets
    .map((ticket, rang) => (ticket && ticket.status === 'error' && ticket.details && ticket.details.error === 'DeviceNotRegistered' ? lot[rang]?.to : null))
    .filter(Boolean);
}

/**
 * Suivi sans service de notifications : l'application demande le statut de
 * SES demandes (identifiants reçus à l'envoi, aléatoires et non devinables).
 * Seul le statut est renvoyé — jamais le nom, le téléphone ni le montant.
 */
const MAX_SUIVI = 30;
function statutsDemandes(leads, ids) {
  const demandes = (Array.isArray(ids) ? ids : [])
    .map(id => String(id || ''))
    .filter(id => /^[0-9a-f-]{16,64}$/i.test(id))
    .slice(0, MAX_SUIVI);
  const parId = new Map((Array.isArray(leads) ? leads : []).map(lead => [String(lead && lead.id), lead]));
  const statuts = {};
  demandes.forEach(id => { if (parId.has(id)) statuts[id] = String(parId.get(id).status || 'nouveau'); });
  return statuts;
}

module.exports = {
  statutsDemandes,
  estJetonExpo, enregistrerAppareil, retirerAppareils, annoncesPubliques, detecterNouveautes,
  messageNouveautes, suiviDemande, lotsNouveautes, jetonsPerimes, decouper, STATUTS_NOTIFIES
};
