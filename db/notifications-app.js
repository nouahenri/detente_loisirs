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

const LV = require('../js/location-voitures.js');

const LANGUES = ['fr', 'en', 'es'];
const MAX_APPAREILS = 20000;
// Une publication plus ancienne (resynchronisée, réimportée) n'est pas une
// nouveauté : on ne réveille pas les téléphones pour elle.
const FRAICHEUR_PUBLICATION_MS = 3 * 24 * 3600 * 1000;
const TAILLE_LOT_EXPO = 100;
// Types annoncés. Un type ajouté après l'amorçage (voitures, 21/09/2026) est
// d'abord mémorisé en silence : ses annonces existantes ne sont pas « nouvelles ».
const TYPES_INITIAUX = ['villa', 'terrain', 'activite', 'publication'];
const TYPES_ANNONCES = [...TYPES_INITIAUX, 'vehicule'];
// Au-delà, une seule notification récapitulative (décision du 21/09/2026).
const MAX_NOTIFICATIONS_PAR_ANNONCE = 3;

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
  // `infos` : ce que dit la notification (lieu, capacité…), jamais le prix (21/09/2026).
  visibles(c.villas).forEach(v => annonces.push({
    cle: `villa:${v.id}`, type: 'villa', id: String(v.id), titre: String(v.name || ''),
    infos: { lieu: v.location, personnes: v.capacity, chambres: v.bedrooms }
  }));
  visibles(c.terrains).filter(t => String(t.status || '').toLowerCase() !== 'vendu')
    .forEach(t => annonces.push({
      cle: `terrain:${t.id}`, type: 'terrain', id: String(t.id), titre: String(t.title || ''),
      infos: { lieu: t.location, surface: t.areaSqm, traductions: t.translations }
    }));
  visibles(c.activities).forEach(a => annonces.push({
    cle: `activite:${a.id}`, type: 'activite', id: String(a.id), titre: String(a.title || ''),
    infos: { duree: a.duration, traductions: a.translations }
  }));
  // Location de voitures (17/09/2026), annoncée depuis le 21/09/2026.
  visibles(c.vehicles).forEach(v => annonces.push({
    cle: `vehicule:${v.id}`, type: 'vehicule', id: String(v.id), titre: String(v.name || ''),
    infos: { categorie: v.category, places: v.seats, chauffeur: v.driverMode }
  }));
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
  // Types déjà suivis avant ce passage (mémoire antérieure au 21/09/2026 : les quatre d'origine).
  const suivis = Array.isArray(etat.typesAmorces) ? etat.typesAmorces : (etat.amorce === true ? TYPES_INITIAUX : []);
  const cles = [...new Set([...connues, ...annonces.map(a => a.cle)])].slice(-5000);
  const suivant = { ...etat, amorce: true, amorceAt: etat.amorceAt || maintenant, cles, typesAmorces: [...TYPES_ANNONCES], dernierPassage: maintenant };
  if (etat.amorce !== true) return { etat: suivant, nouvelles: [] };
  const nouvelles = annonces.filter(a => suivis.includes(a.type) && !connues.has(a.cle) && (a.type !== 'publication' || a.recente));
  return { etat: suivant, nouvelles };
}

/*
 * Textes des notifications de nouveautés (décision du 21/09/2026) : un titre
 * par rubrique avec son emoji, puis le nom, le lieu et deux ou trois infos
 * clés, et l'invitation à toucher. Jamais de prix, comme sur Facebook.
 */
const TEXTES = {
  fr: {
    titres: {
      villa: '🏡 Nouvelle résidence à découvrir', activite: '🌴 Nouvelle activité à Assinie', vehicule: '🚗 Nouvelle voiture à louer',
      terrain: '📍 Nouveau terrain à vendre', publication: '📣 Nouveauté Détente & Loisirs'
    },
    appels: { fiche: 'Touchez pour voir la fiche.', activite: 'Touchez pour découvrir l’activité.', publication: 'Touchez pour la lire.' },
    personnes: n => `${n} pers.`, chambres: n => `${n} chambre${n > 1 ? 's' : ''}`, places: n => `${n} places`,
    plusieurs: n => `✨ ${n} nouvelles annonces à Assinie`, plusieursCorps: 'Découvrez-les dans l’application.',
    contacte: ['Votre demande est prise en charge', 'Notre conciergerie vous contacte sur WhatsApp.'],
    confirme: ['Votre réservation est confirmée', 'Merci ! Retrouvez le détail avec notre conciergerie.']
  },
  en: {
    titres: {
      villa: '🏡 New residence to discover', activite: '🌴 New activity in Assinie', vehicule: '🚗 New car for rent',
      terrain: '📍 New plot for sale', publication: '📣 What’s new at Détente & Loisirs'
    },
    appels: { fiche: 'Tap to see the listing.', activite: 'Tap to discover the activity.', publication: 'Tap to read it.' },
    personnes: n => `${n} guests`, chambres: n => `${n} bedroom${n > 1 ? 's' : ''}`, places: n => `${n} seats`,
    plusieurs: n => `✨ ${n} new listings in Assinie`, plusieursCorps: 'Discover them in the app.',
    contacte: ['Your request is being handled', 'Our concierge will contact you on WhatsApp.'],
    confirme: ['Your booking is confirmed', 'Thank you! Our concierge will share the details.']
  },
  es: {
    titres: {
      villa: '🏡 Nueva residencia por descubrir', activite: '🌴 Nueva actividad en Assinie', vehicule: '🚗 Nuevo coche en alquiler',
      terrain: '📍 Nuevo terreno en venta', publication: '📣 Novedad de Détente & Loisirs'
    },
    appels: { fiche: 'Toque para ver la ficha.', activite: 'Toque para descubrir la actividad.', publication: 'Toque para leerla.' },
    personnes: n => `${n} pers.`, chambres: n => (n > 1 ? `${n} habitaciones` : `${n} habitación`), places: n => `${n} plazas`,
    plusieurs: n => `✨ ${n} nuevos anuncios en Assinie`, plusieursCorps: 'Descúbralos en la aplicación.',
    contacte: ['Su solicitud está en curso', 'Nuestra conserjería le contactará por WhatsApp.'],
    confirme: ['Su reserva está confirmada', '¡Gracias! Nuestra conserjería le dará los detalles.']
  }
};
const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };

const court = (valeur, max) => {
  const texte = String(valeur ?? '').replace(/\s+/g, ' ').trim();
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
};
const entier = valeur => (Number.isFinite(Number(valeur)) && Number(valeur) > 0 ? Math.round(Number(valeur)) : 0);
/** Texte traduit d'une fiche (saisi dans le studio), repli sur le français. */
const traduit = (infos, champ, langue, repli) => court(infos?.traductions?.[langue]?.[champ] || repli, 90);
const minusculeInitiale = texte => (texte ? texte.charAt(0).toLocaleLowerCase('fr') + texte.slice(1) : '');

/** Notification d'UNE annonce : ouvre sa fiche au toucher. */
function messageAnnonce(annonce, langue) {
  const l = langueValide(langue);
  const t = TEXTES[l];
  const i = annonce.infos || {};
  const nom = annonce.type === 'activite' || annonce.type === 'terrain' ? traduit(i, 'title', l, annonce.titre) : court(annonce.titre, 90);
  let phrase = nom;
  if (annonce.type === 'villa') {
    const faits = [entier(i.personnes) && t.personnes(entier(i.personnes)), entier(i.chambres) && t.chambres(entier(i.chambres))].filter(Boolean).join(', ');
    phrase = [nom, court(i.lieu, 60)].filter(Boolean).join(' · ') + (faits ? ` — ${faits}` : '');
  } else if (annonce.type === 'activite') {
    phrase = [nom, traduit(i, 'duration', l, i.duree)].filter(Boolean).join(' · ');
  } else if (annonce.type === 'vehicule') {
    const modele = [i.categorie ? LV.libelle(LV.CATEGORIES, i.categorie, l) : '', entier(i.places) && t.places(entier(i.places))].filter(Boolean).join(', ');
    const chauffeur = LV.MODES_CHAUFFEUR[i.chauffeur] ? minusculeInitiale(LV.libelle(LV.MODES_CHAUFFEUR, i.chauffeur, l)) : '';
    phrase = [nom, modele, chauffeur].filter(Boolean).join(' · ');
  } else if (annonce.type === 'terrain') {
    // Le lieu n'est repris que s'il n'est pas déjà dans le titre du terrain.
    const lieu = court(i.lieu, 60);
    const surface = entier(i.surface) ? `${new Intl.NumberFormat(LOCALES[l]).format(entier(i.surface))} m²` : '';
    phrase = [nom, lieu && !nom.toLowerCase().includes(lieu.toLowerCase()) ? lieu : '', surface].filter(Boolean).join(' · ');
  }
  const appel = annonce.type === 'activite' ? t.appels.activite : annonce.type === 'publication' ? t.appels.publication : t.appels.fiche;
  const corps = phrase ? `${court(phrase, 150)}${/[.!?…]$/.test(phrase) ? '' : '.'} ${appel}` : appel;
  return { title: t.titres[annonce.type] || t.titres.publication, body: corps, data: { type: annonce.type, id: annonce.id } };
}

/**
 * Notifications de nouveautés d'un téléphone, dans sa langue : une par
 * annonce (chacune ouvre sa fiche), trois au plus ; au-delà, un récapitulatif
 * qui ouvre Explorer (décision du 21/09/2026).
 */
function messagesNouveautes(nouvelles, langue) {
  if (!nouvelles.length) return [];
  if (nouvelles.length <= MAX_NOTIFICATIONS_PAR_ANNONCE) return nouvelles.map(a => messageAnnonce(a, langue));
  const t = TEXTES[langueValide(langue)];
  return [{ title: t.plusieurs(nouvelles.length), body: t.plusieursCorps, data: { ecran: 'explorer' } }];
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
  const messages = Object.entries(registre.appareils).flatMap(([jeton, appareil]) =>
    messagesNouveautes(nouvelles, appareil.langue).map(contenu => ({ to: jeton, sound: 'default', ...contenu })));
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
  messageAnnonce, messagesNouveautes, suiviDemande, lotsNouveautes, jetonsPerimes, decouper, STATUTS_NOTIFIES, TYPES_ANNONCES
};
