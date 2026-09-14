/**
 * MESSAGES WHATSAPP PROMOTIONNELS — studio → clients ayant fait une demande.
 *
 * Décisions du propriétaire (13/09/2026) :
 *   · envoi par LIENS WhatsApp : le studio prépare pour chaque client un lien
 *     wa.me avec le message personnalisé ; l'administrateur appuie sur
 *     « Envoyer » dans WhatsApp. Pas d'API Meta, pas de coût, son numéro actuel ;
 *   · ACCORD EXPLICITE : seuls les clients qui ont coché « J'accepte de
 *     recevoir vos offres par WhatsApp » dans le simulateur sont destinataires.
 *     Les demandes antérieures à cette case restent « accord non recueilli ».
 *
 * Module pur : aucune écriture ici. server.js lit et écrit le fichier
 * data/whatsapp-promo.json ({ campagnes, stops }).
 */

const crypto = require('crypto');

/** Mention ajoutée à chaque message : le client doit pouvoir refuser. */
const MENTION_STOP = 'Répondez STOP pour ne plus recevoir nos offres.';
const MESSAGE_MAX = 1500;
const TITRE_MAX = 120;
const STATUTS = ['a-envoyer', 'envoye', 'ignore'];

/**
 * Numéro saisi librement → chiffres internationaux, ou '' s'il est inutilisable.
 * 10 chiffres = numéro ivoirien sans indicatif (même règle que le studio).
 */
function normaliserTelephone(valeur) {
  let chiffres = String(valeur || '').replace(/\D/g, '');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.length === 10) chiffres = `225${chiffres}`;
  return chiffres.length >= 8 && chiffres.length <= 15 ? chiffres : '';
}

/**
 * Contacts dédoublonnés par numéro, à partir des demandes.
 *
 * Accord : le DERNIER choix exprimé fait foi (une demande plus récente sans
 * la case cochée retire l'accord). Les demandes sans choix (antérieures à la
 * case) ne comptent pas. « Ne plus contacter » l'emporte toujours.
 */
function contactsDepuisDemandes(demandes = [], stops = {}) {
  const parNumero = new Map();
  const triees = [...demandes]
    .filter(demande => demande && normaliserTelephone(demande.phone))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  for (const demande of triees) {
    const cle = normaliserTelephone(demande.phone);
    const contact = parNumero.get(cle) || {
      cle, nom: '', telephone: '', email: '', demandes: 0, derniereDemande: null,
      accord: null, accordLe: null
    };
    contact.demandes += 1;
    contact.derniereDemande = demande.createdAt || contact.derniereDemande;
    if (demande.name) contact.nom = String(demande.name).trim();
    if (demande.phone) contact.telephone = String(demande.phone).trim();
    if (demande.email) contact.email = String(demande.email).trim();
    if (demande.whatsappOptIn === true || demande.whatsappOptIn === false) {
      contact.accord = demande.whatsappOptIn;
      contact.accordLe = demande.whatsappOptIn ? (demande.whatsappOptInAt || demande.createdAt || null) : null;
    }
    parNumero.set(cle, contact);
  }
  return [...parNumero.values()]
    .map(contact => {
      const stop = stops && stops[contact.cle] ? stops[contact.cle] : null;
      return { ...contact, stop: Boolean(stop), stopLe: stop ? stop.le || null : null, eligible: contact.accord === true && !stop };
    })
    .sort((a, b) => new Date(b.derniereDemande || 0) - new Date(a.derniereDemande || 0));
}

function prenomDe(nom) {
  return String(nom || '').trim().split(/\s+/)[0] || '';
}

/** Message tel qu'il part : variables remplacées, mention STOP en pied. */
function personnaliser(message, contact = {}) {
  const nom = String(contact.nom || '').trim();
  // Variable vide : on retire aussi l'espace qui la précède, pour éviter
  // « Bonjour , ». La ponctuation française (« ! », « ? ») reste intacte.
  const remplacer = (texte, motif, valeur) => texte.replace(motif, trouve => (valeur ? trouve.replace(/\{\w+\}/, valeur) : ''));
  const texte = remplacer(remplacer(String(message || ''), /[ \t]*\{prenom\}/gi, prenomDe(nom)), /[ \t]*\{nom\}/gi, nom).trim();
  return `${texte}\n\n${MENTION_STOP}`;
}

function lienWhatsApp(cle, texte) {
  return `https://wa.me/${cle}?text=${encodeURIComponent(texte)}`;
}

/** Validation d'une nouvelle campagne. Lève une Error lisible. */
function validerCampagne(entree = {}) {
  const titre = String(entree.titre || '').trim().slice(0, TITRE_MAX);
  const message = String(entree.message || '').replace(/\r\n/g, '\n').trim();
  if (!titre) throw new Error('Donnez un titre à la campagne (visible dans le studio seulement).');
  if (!message) throw new Error('Le message est vide.');
  if (message.length > MESSAGE_MAX) throw new Error(`Message trop long : ${MESSAGE_MAX} caractères maximum.`);
  return { titre, message };
}

/**
 * Nouvelle campagne : la liste des destinataires est FIGÉE à la création
 * (contacts avec accord, hors « ne plus contacter »), pour que la progression
 * ait un sens. Un client qui donne son accord ensuite ira à la suivante.
 */
function creerCampagne(entree, contacts, auteur = '') {
  const { titre, message } = validerCampagne(entree);
  const eligibles = contacts.filter(contact => contact.eligible);
  if (!eligibles.length) throw new Error('Aucun client n’a encore donné son accord pour recevoir vos offres par WhatsApp.');
  // Sélection du studio (un, plusieurs ou tous). Un numéro sans accord ou en
  // « ne plus contacter » est écarté même s'il est envoyé : l'accord prime.
  // Sans liste (ancien studio) : tous les clients avec accord.
  const choisis = Array.isArray(entree.destinataires)
    ? new Set(entree.destinataires.map(cle => normaliserTelephone(cle)).filter(Boolean))
    : null;
  const retenus = choisis ? eligibles.filter(contact => choisis.has(contact.cle)) : eligibles;
  if (!retenus.length) throw new Error('Sélectionnez au moins un destinataire.');
  const destinataires = retenus.map(contact => ({
    cle: contact.cle, nom: contact.nom, telephone: contact.telephone, statut: 'a-envoyer', le: null, par: ''
  }));
  return {
    id: crypto.randomUUID(), titre, message, creeeLe: new Date().toISOString(), creeePar: String(auteur || ''),
    destinataires
  };
}

/** Marque un destinataire. Renvoie la campagne modifiée (copie). */
function marquerDestinataire(campagne, cle, statut, auteur = '') {
  if (!STATUTS.includes(statut)) throw new Error('Statut inconnu.');
  const destinataire = campagne.destinataires.find(entree => entree.cle === String(cle));
  if (!destinataire) throw new Error('Destinataire introuvable dans cette campagne.');
  destinataire.statut = statut;
  destinataire.le = statut === 'a-envoyer' ? null : new Date().toISOString();
  destinataire.par = statut === 'a-envoyer' ? '' : String(auteur || '');
  return campagne;
}

/**
 * Campagne prête pour le studio : liens personnalisés, compteurs, et
 * destinataires passés en « ne plus contacter » depuis signalés.
 */
function campagnePourStudio(campagne, stops = {}) {
  const destinataires = campagne.destinataires.map(entree => {
    const texte = personnaliser(campagne.message, entree);
    return { ...entree, stop: Boolean(stops[entree.cle]), lien: lienWhatsApp(entree.cle, texte) };
  });
  const compter = statut => destinataires.filter(entree => entree.statut === statut).length;
  return {
    ...campagne, destinataires,
    compteurs: { total: destinataires.length, envoyes: compter('envoye'), ignores: compter('ignore'), restants: compter('a-envoyer') }
  };
}

module.exports = {
  MENTION_STOP, MESSAGE_MAX, STATUTS,
  normaliserTelephone, contactsDepuisDemandes, personnaliser, lienWhatsApp,
  validerCampagne, creerCampagne, marquerDestinataire, campagnePourStudio
};
