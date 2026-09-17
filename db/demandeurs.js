/**
 * DEMANDEURS — blocage, suspension et suppression (décisions du 17/09/2026).
 *
 *  · Bloquer : les nouvelles demandes du même téléphone OU de la même adresse
 *    e-mail sont refusées sur le site et dans l'application, avec un message
 *    neutre, jusqu'au déblocage.
 *  · Suspendre : même effet pendant 7, 30 ou 90 jours, levé automatiquement.
 *  · Supprimer : efface les coordonnées et toutes les demandes du demandeur
 *    (server.js). Un blocage en cours est conservé : il ne garde que le
 *    téléphone et l'e-mail normalisés, nécessaires pour refuser.
 *
 * Stockage : MySQL (table `demandeurs_restrictions`) quand la base répond,
 * fichier `data/demandeurs-restrictions.json` sinon — même logique que le
 * reste du projet (voir db/newsletter-store.js).
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const FICHIER = 'demandeurs-restrictions.json';
const TYPES = ['bloque', 'suspendu'];
const DUREES = [7, 30, 90];
const MESSAGE_REFUS = 'Votre demande n’a pas pu être enregistrée. Merci de nous contacter directement par téléphone.';

const texte = (valeur, max) => String(valeur ?? '').trim().slice(0, max);

/**
 * Téléphone comparable : chiffres seuls, sans préfixe international 00 ni
 * indicatif ivoirien 225 (les numéros ivoiriens ont 10 chiffres). Vide sous
 * 8 chiffres : trop court pour identifier quelqu'un.
 */
function normaliserTelephone(valeur) {
  let chiffres = String(valeur ?? '').replace(/\D/g, '');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.startsWith('225') && chiffres.length === 13) chiffres = chiffres.slice(3);
  return chiffres.length >= 8 ? chiffres : '';
}

function normaliserEmail(valeur) {
  const email = texte(valeur, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

/** Vrai quand deux coordonnées désignent la même personne (téléphone ou e-mail). */
function memeDemandeur(a, b) {
  const telA = normaliserTelephone(a?.phone ?? a?.telephone);
  const telB = normaliserTelephone(b?.phone ?? b?.telephone);
  const mailA = normaliserEmail(a?.email);
  const mailB = normaliserEmail(b?.email);
  return Boolean((telA && telA === telB) || (mailA && mailA === mailB));
}

/** Restriction encore en vigueur à `maintenant` (un blocage n'expire jamais). */
function estActive(restriction, maintenant = new Date()) {
  if (!restriction || !TYPES.includes(restriction.type)) return false;
  if (restriction.type === 'bloque') return true;
  const fin = Date.parse(restriction.jusquAu || '');
  return Number.isFinite(fin) && fin > new Date(maintenant).getTime();
}

/** Première restriction active qui vise ces coordonnées, sinon null. */
function restrictionPour(restrictions, coordonnees, maintenant = new Date()) {
  return (Array.isArray(restrictions) ? restrictions : [])
    .find(restriction => estActive(restriction, maintenant) && memeDemandeur(restriction, coordonnees)) || null;
}

/**
 * Nouvelle restriction à partir d'une demande. Renvoie { restriction, erreur }.
 * @param {object} p { type, jours, motif, lead, acteur }
 */
function creerRestriction({ type, jours, motif = '', lead = {}, acteur = '' }, maintenant = new Date()) {
  if (!TYPES.includes(type)) return { erreur: 'Action inconnue : bloquer ou suspendre.' };
  const telephone = normaliserTelephone(lead.phone);
  const email = normaliserEmail(lead.email);
  if (!telephone && !email) return { erreur: 'Ce demandeur n’a laissé ni téléphone ni e-mail : impossible de refuser ses prochaines demandes.' };
  const duree = Number(jours);
  if (type === 'suspendu' && !DUREES.includes(duree)) return { erreur: 'Durée de suspension : 7, 30 ou 90 jours.' };
  const debut = new Date(maintenant);
  return {
    restriction: {
      id: crypto.randomUUID(), type, telephone, email, nom: texte(lead.name, 120),
      motif: texte(motif, 500), leadId: texte(lead.id, 36),
      jusquAu: type === 'suspendu' ? new Date(debut.getTime() + duree * 86_400_000).toISOString() : null,
      creePar: texte(acteur, 120), creeLe: debut.toISOString()
    }
  };
}

/** Demandes d'un même demandeur (même téléphone ou même e-mail que `lead`). */
function demandesDuDemandeur(leads, lead) {
  return (Array.isArray(leads) ? leads : []).filter(autre => autre?.id === lead?.id || memeDemandeur(autre, lead));
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

const versIso = valeur => {
  if (!valeur) return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const versMysql = valeur => {
  const iso = versIso(valeur);
  return iso ? iso.slice(0, 19).replace('T', ' ') : null;
};

function depuisLigne(ligne) {
  return {
    id: ligne.id, type: ligne.type, telephone: ligne.telephone || '', email: ligne.email || '', nom: ligne.nom || '',
    motif: ligne.motif || '', leadId: ligne.lead_id || '', jusquAu: versIso(ligne.jusqu_au),
    creePar: ligne.cree_par || '', creeLe: versIso(ligne.created_at)
  };
}

async function lister() {
  if (utiliserBase()) {
    try {
      const [lignes] = await repo().query('SELECT * FROM demandeurs_restrictions ORDER BY created_at DESC');
      return lignes.map(depuisLigne);
    } catch (error) {
      // Table absente (migration pas encore passée) : repli sur le fichier.
      if (!(error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146)) throw error;
    }
  }
  const brut = jsonStore.read(FICHIER, []);
  return Array.isArray(brut) ? brut : [];
}

async function ajouter(restriction) {
  if (utiliserBase()) {
    await repo().query(
      `INSERT INTO demandeurs_restrictions (id, type, telephone, email, nom, motif, lead_id, jusqu_au, cree_par, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [restriction.id, restriction.type, restriction.telephone, restriction.email, restriction.nom, restriction.motif,
        restriction.leadId, versMysql(restriction.jusquAu), restriction.creePar, versMysql(restriction.creeLe)]
    );
  }
  // Miroir JSON : lecture de secours si la base devient injoignable.
  const liste = jsonStore.read(FICHIER, []);
  jsonStore.write(FICHIER, [restriction, ...(Array.isArray(liste) ? liste : []).filter(entree => entree.id !== restriction.id)].slice(0, 2000));
  return restriction;
}

async function lever(id) {
  const identifiant = texte(id, 36);
  let retirees = 0;
  if (utiliserBase()) {
    const [resultat] = await repo().query('DELETE FROM demandeurs_restrictions WHERE id = ?', [identifiant]);
    retirees = resultat?.affectedRows || 0;
  }
  const liste = jsonStore.read(FICHIER, []);
  const restantes = (Array.isArray(liste) ? liste : []).filter(entree => entree.id !== identifiant);
  if (!utiliserBase()) retirees = (Array.isArray(liste) ? liste.length : 0) - restantes.length;
  jsonStore.write(FICHIER, restantes);
  return retirees;
}

module.exports = {
  TYPES, DUREES, MESSAGE_REFUS,
  normaliserTelephone, normaliserEmail, memeDemandeur, estActive, restrictionPour, creerRestriction, demandesDuDemandeur,
  configure, lister, ajouter, lever
};
