/**
 * COMPTABILITÉ de l'entreprise (demande du 17/09/2026).
 *
 * Écritures d'entrées (recettes) et de sorties (dépenses, salaires, charges),
 * employés et paie mensuelle, charges récurrentes, ventes à encaisser tirées
 * des demandes, rapports et export CSV. Montants entiers en FCFA.
 *
 * Décision du propriétaire : une demande CONFIRMÉE devient une vente à
 * encaisser ; les paiements reçus (acompte, solde…) sont saisis comme entrées
 * rattachées à la demande, avec leur mode de paiement, et le reste à payer est
 * suivi. Rien n'est compté comme encaissé tant qu'il n'a pas été saisi.
 *
 * Stockage : MySQL (tables `compta_ecritures`, `compta_employes`,
 * `compta_charges`) quand la base répond, `data/compta.json` sinon.
 * Section « pure » testable sans base, puis section stockage.
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const CATEGORIES = [
  { id: 'sejour', sens: 'entree', libelle: 'Locations & séjours' },
  { id: 'activites', sens: 'entree', libelle: 'Activités & loisirs' },
  { id: 'terrain', sens: 'entree', libelle: 'Ventes de terrains' },
  { id: 'commission', sens: 'entree', libelle: 'Commissions perçues' },
  { id: 'autre_recette', sens: 'entree', libelle: 'Autres recettes' },
  { id: 'salaires', sens: 'sortie', libelle: 'Salaires & primes' },
  { id: 'charges_sociales', sens: 'sortie', libelle: 'Charges sociales (CNPS)' },
  { id: 'loyer', sens: 'sortie', libelle: 'Loyers' },
  { id: 'electricite_eau', sens: 'sortie', libelle: 'Électricité & eau' },
  { id: 'telecom', sens: 'sortie', libelle: 'Internet & téléphone' },
  { id: 'entretien', sens: 'sortie', libelle: 'Entretien & réparations' },
  { id: 'menage', sens: 'sortie', libelle: 'Ménage & blanchisserie' },
  { id: 'carburant', sens: 'sortie', libelle: 'Carburant & transport' },
  { id: 'fournitures', sens: 'sortie', libelle: 'Fournitures & équipements' },
  { id: 'marketing', sens: 'sortie', libelle: 'Publicité & marketing' },
  { id: 'sous_traitance', sens: 'sortie', libelle: 'Prestataires & sous-traitance' },
  { id: 'impots', sens: 'sortie', libelle: 'Impôts & taxes' },
  { id: 'frais_bancaires', sens: 'sortie', libelle: 'Frais bancaires & Mobile Money' },
  { id: 'autre_depense', sens: 'sortie', libelle: 'Autres dépenses' }
];

const MODES = [
  { id: 'especes', libelle: 'Espèces' },
  { id: 'orange_money', libelle: 'Orange Money' },
  { id: 'mtn_momo', libelle: 'MTN MoMo' },
  { id: 'moov_money', libelle: 'Moov Money' },
  { id: 'wave', libelle: 'Wave' },
  { id: 'virement', libelle: 'Virement bancaire' },
  { id: 'cheque', libelle: 'Chèque' },
  { id: 'carte', libelle: 'Carte bancaire' }
];

const SENS = ['entree', 'sortie'];
const STATUTS = ['regle', 'a_regler'];
const BIENS = ['villa', 'terrain', 'activity'];
const MONTANT_MAX = 100_000_000_000;

const texte = (valeur, max) => String(valeur ?? '').trim().slice(0, max);
const dateValide = valeur => /^\d{4}-\d{2}-\d{2}$/.test(valeur) && !Number.isNaN(Date.parse(`${valeur}T12:00:00Z`))
  && new Date(`${valeur}T12:00:00Z`).toISOString().slice(0, 10) === valeur;
const periodeValide = valeur => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valeur ?? ''));
const libelleCategorie = id => CATEGORIES.find(c => c.id === id)?.libelle || id;
const libelleMode = id => MODES.find(m => m.id === id)?.libelle || id || '';

function montantEntier(valeur) {
  const nombre = Number(String(valeur ?? '').replace(/[\s  ]/g, ''));
  return Number.isFinite(nombre) ? Math.round(nombre) : NaN;
}

/** Dernier jour d'une période « AAAA-MM ». */
function finDePeriode(periode) {
  const [annee, mois] = periode.split('-').map(Number);
  return new Date(Date.UTC(annee, mois, 0)).toISOString().slice(0, 10);
}

/**
 * Écriture saisie au studio. `existante` : l'écriture modifiée (identifiant et
 * rattachements conservés). Renvoie { ecriture, erreurs }.
 */
function validerEcriture(source = {}, { existante = null, acteur = '', maintenant = new Date() } = {}) {
  const erreurs = [];
  const sens = SENS.includes(source.sens) ? source.sens : null;
  if (!sens) erreurs.push('Choisissez « Entrée » ou « Sortie ».');
  const date = texte(source.date, 10);
  if (!dateValide(date)) erreurs.push('Date invalide (AAAA-MM-JJ).');
  const montant = montantEntier(source.montant);
  if (!(montant > 0) || montant > MONTANT_MAX) erreurs.push('Le montant doit être un nombre positif (FCFA).');
  const categorie = CATEGORIES.find(c => c.id === source.categorie);
  if (!categorie) erreurs.push('Catégorie inconnue.');
  else if (sens && categorie.sens !== sens) erreurs.push(`« ${categorie.libelle} » est une catégorie de ${categorie.sens === 'entree' ? 'recette' : 'dépense'}.`);
  const libelle = texte(source.libelle, 240);
  if (!libelle) erreurs.push('Le libellé est requis.');
  const mode = source.mode ? MODES.find(m => m.id === source.mode)?.id : '';
  if (source.mode && !mode) erreurs.push('Mode de paiement inconnu.');
  const statut = STATUTS.includes(source.statut) ? source.statut : 'regle';
  const bienKind = BIENS.includes(source.bienKind) ? source.bienKind : '';
  const bienId = bienKind ? texte(source.bienId, 80) : '';
  const leadId = texte(source.leadId, 36);
  if (leadId && sens === 'sortie') erreurs.push('Un paiement de client est une entrée, pas une sortie.');
  const justificatif = texte(source.justificatif, 120);
  if (justificatif && !/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(justificatif)) erreurs.push('Pièce justificative invalide.');
  const horodatage = new Date(maintenant).toISOString();
  return {
    erreurs,
    ecriture: erreurs.length ? null : {
      id: existante?.id || crypto.randomUUID(), date, sens, categorie: categorie.id, montant, libelle,
      tiers: texte(source.tiers, 160), mode, statut, reference: texte(source.reference, 80),
      bienKind, bienId, leadId,
      employeId: existante?.employeId || texte(source.employeId, 36), chargeId: existante?.chargeId || texte(source.chargeId, 36),
      periode: existante?.periode || (periodeValide(source.periode) ? source.periode : ''),
      justificatif, notes: texte(source.notes, 2000),
      creePar: existante?.creePar || texte(acteur, 120), creeLe: existante?.creeLe || horodatage, majLe: horodatage
    }
  };
}

function validerEmploye(source = {}, { existant = null, maintenant = new Date() } = {}) {
  const erreurs = [];
  const nom = texte(source.nom, 120);
  if (!nom) erreurs.push('Le nom de l’employé est requis.');
  const salaire = montantEntier(source.salaireMensuel);
  if (!(salaire >= 0) || salaire > MONTANT_MAX) erreurs.push('Salaire mensuel invalide.');
  const embauche = texte(source.dateEmbauche, 10);
  if (embauche && !dateValide(embauche)) erreurs.push('Date d’embauche invalide.');
  const horodatage = new Date(maintenant).toISOString();
  return {
    erreurs,
    employe: erreurs.length ? null : {
      id: existant?.id || crypto.randomUUID(), nom, poste: texte(source.poste, 120), telephone: texte(source.telephone, 40),
      salaireMensuel: salaire, dateEmbauche: embauche, actif: source.actif !== false && source.actif !== 'false',
      notes: texte(source.notes, 2000), creeLe: existant?.creeLe || horodatage, majLe: horodatage
    }
  };
}

function validerCharge(source = {}, { existante = null, maintenant = new Date() } = {}) {
  const erreurs = [];
  const libelle = texte(source.libelle, 240);
  if (!libelle) erreurs.push('Le libellé de la charge est requis.');
  const categorie = CATEGORIES.find(c => c.id === source.categorie && c.sens === 'sortie');
  if (!categorie) erreurs.push('Choisissez une catégorie de dépense.');
  const montant = montantEntier(source.montant);
  if (!(montant > 0) || montant > MONTANT_MAX) erreurs.push('Le montant doit être un nombre positif (FCFA).');
  const jour = Number(source.jour);
  if (!Number.isInteger(jour) || jour < 1 || jour > 28) erreurs.push('Jour d’échéance : de 1 à 28.');
  const debut = texte(source.debut, 7);
  if (!periodeValide(debut)) erreurs.push('Mois de début invalide (AAAA-MM).');
  const fin = texte(source.fin, 7);
  if (fin && !periodeValide(fin)) erreurs.push('Mois de fin invalide (AAAA-MM).');
  if (periodeValide(debut) && fin && periodeValide(fin) && fin < debut) erreurs.push('Le mois de fin précède le mois de début.');
  const mode = source.mode ? MODES.find(m => m.id === source.mode)?.id : '';
  if (source.mode && !mode) erreurs.push('Mode de paiement inconnu.');
  const bienKind = BIENS.includes(source.bienKind) ? source.bienKind : '';
  const horodatage = new Date(maintenant).toISOString();
  return {
    erreurs,
    charge: erreurs.length ? null : {
      id: existante?.id || crypto.randomUUID(), libelle, categorie: categorie.id, montant, jour, tiers: texte(source.tiers, 160),
      mode, bienKind, bienId: bienKind ? texte(source.bienId, 80) : '', debut, fin,
      actif: source.actif !== false && source.actif !== 'false', notes: texte(source.notes, 2000),
      creeLe: existante?.creeLe || horodatage, majLe: horodatage
    }
  };
}

/**
 * Salaires du mois à enregistrer (« à régler ») : employés actifs, embauchés
 * au plus tard ce mois-là, dont le salaire du mois n'est pas déjà saisi.
 */
function paieDuMois(employes, periode, ecritures, { acteur = '', maintenant = new Date() } = {}) {
  if (!periodeValide(periode)) return [];
  const fin = finDePeriode(periode);
  const dejaPayes = new Set(ecritures.filter(e => e.employeId && e.periode === periode).map(e => e.employeId));
  return employes
    .filter(e => e.actif && e.salaireMensuel > 0 && !dejaPayes.has(e.id) && (!e.dateEmbauche || e.dateEmbauche <= fin))
    .map(e => validerEcriture({
      sens: 'sortie', date: fin, montant: e.salaireMensuel, categorie: 'salaires', statut: 'a_regler',
      libelle: `Salaire ${periode} — ${e.nom}${e.poste ? ` (${e.poste})` : ''}`, tiers: e.nom, employeId: e.id, periode
    }, { acteur, maintenant }).ecriture);
}

/** Charges récurrentes du mois à enregistrer (« à régler »), une fois par charge et par mois. */
function chargesDuMois(charges, periode, ecritures, { acteur = '', maintenant = new Date() } = {}) {
  if (!periodeValide(periode)) return [];
  const deja = new Set(ecritures.filter(e => e.chargeId && e.periode === periode).map(e => e.chargeId));
  return charges
    .filter(c => c.actif && !deja.has(c.id) && c.debut <= periode && (!c.fin || periode <= c.fin))
    .map(c => validerEcriture({
      sens: 'sortie', date: `${periode}-${String(c.jour).padStart(2, '0')}`, montant: c.montant, categorie: c.categorie,
      statut: 'a_regler', libelle: `${c.libelle} — ${periode}`, tiers: c.tiers, mode: c.mode,
      bienKind: c.bienKind, bienId: c.bienId, chargeId: c.id, periode
    }, { acteur, maintenant }).ecriture);
}

/** Catégorie d'un paiement selon la formule de la demande. */
function categorieDeDemande(lead) {
  if (lead?.type === 'terrain' || lead?.terrainRef) return 'terrain';
  if (lead?.type === 'devis-activites') return 'activites';
  return 'sejour';
}

/**
 * Ventes à encaisser : demandes confirmées avec un montant, et toute demande
 * ayant déjà reçu un paiement. Encaissé = entrées réglées rattachées.
 */
function ventes(leads, ecritures) {
  const paiements = new Map();
  for (const e of ecritures) {
    if (!e.leadId || e.sens !== 'entree' || e.statut !== 'regle') continue;
    if (!paiements.has(e.leadId)) paiements.set(e.leadId, []);
    paiements.get(e.leadId).push(e);
  }
  return (Array.isArray(leads) ? leads : [])
    .filter(lead => (lead.status === 'confirme' && Number(lead.amount) > 0) || paiements.has(lead.id))
    .map(lead => {
      const liste = (paiements.get(lead.id) || []).sort((a, b) => a.date.localeCompare(b.date));
      const montant = Math.max(0, Math.round(Number(lead.amount) || 0));
      const encaisse = liste.reduce((total, e) => total + e.montant, 0);
      const reste = montant - encaisse;
      return {
        leadId: lead.id, client: lead.name || lead.email || lead.phone || 'Client', telephone: lead.phone || '',
        type: lead.type || '', lieu: lead.villa || (lead.terrainRef ? `Terrain ${lead.terrainRef}` : ''), dates: lead.dates || '',
        statutDemande: lead.status, montant, encaisse, reste: Math.max(0, reste), tropPercu: Math.max(0, -reste),
        statut: encaisse === 0 ? 'a_encaisser' : reste > 0 ? 'partiel' : 'solde',
        categorie: categorieDeDemande(lead), paiements: liste.map(e => ({ id: e.id, date: e.date, montant: e.montant, mode: e.mode })),
        confirmeeLe: lead.updatedAt || lead.createdAt || null
      };
    })
    .sort((a, b) => (b.reste > 0) - (a.reste > 0) || String(b.confirmeeLe).localeCompare(String(a.confirmeeLe)));
}

function dansPeriode(ecriture, debut, fin) {
  return (!debut || ecriture.date >= debut) && (!fin || ecriture.date <= fin);
}

/** Mois « AAAA-MM » de `debut` à `fin` inclus (au plus 36). */
function moisEntre(debut, fin) {
  const mois = [];
  let [annee, m] = debut.slice(0, 7).split('-').map(Number);
  const [anneeFin, mFin] = fin.slice(0, 7).split('-').map(Number);
  while ((annee < anneeFin || (annee === anneeFin && m <= mFin)) && mois.length < 36) {
    mois.push(`${annee}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; annee += 1; }
  }
  return mois;
}

/**
 * Rapport d'une période : totaux réglés, restes, répartition par catégorie,
 * par mois et par bien. Seules les écritures RÉGLÉES comptent dans le solde.
 */
function rapport(ecritures, { debut, fin }, listeVentes = []) {
  const periode = ecritures.filter(e => dansPeriode(e, debut, fin));
  const reglees = periode.filter(e => e.statut === 'regle');
  const somme = (liste, sens) => liste.filter(e => e.sens === sens).reduce((total, e) => total + e.montant, 0);
  const parCategorie = CATEGORIES.map(c => {
    const lignes = reglees.filter(e => e.categorie === c.id);
    return { categorie: c.id, libelle: c.libelle, sens: c.sens, montant: lignes.reduce((t, e) => t + e.montant, 0), nombre: lignes.length };
  }).filter(ligne => ligne.nombre);
  const parMois = debut && fin ? moisEntre(debut, fin).map(mois => {
    const lignes = reglees.filter(e => e.date.startsWith(mois));
    return { mois, entrees: somme(lignes, 'entree'), sorties: somme(lignes, 'sortie') };
  }) : [];
  const biens = new Map();
  for (const e of reglees.filter(e => e.bienKind && e.bienId)) {
    const cle = `${e.bienKind}:${e.bienId}`;
    if (!biens.has(cle)) biens.set(cle, { bienKind: e.bienKind, bienId: e.bienId, entrees: 0, sorties: 0 });
    biens.get(cle)[e.sens === 'entree' ? 'entrees' : 'sorties'] += e.montant;
  }
  const entrees = somme(reglees, 'entree');
  const sorties = somme(reglees, 'sortie');
  return {
    debut, fin, entrees, sorties, solde: entrees - sorties,
    aPayer: periode.filter(e => e.sens === 'sortie' && e.statut === 'a_regler').reduce((t, e) => t + e.montant, 0),
    aRecevoir: periode.filter(e => e.sens === 'entree' && e.statut === 'a_regler').reduce((t, e) => t + e.montant, 0),
    resteAEncaisser: listeVentes.reduce((total, v) => total + v.reste, 0),
    nombre: periode.length, parCategorie, parMois,
    parBien: [...biens.values()].sort((a, b) => (b.entrees - b.sorties) - (a.entrees - a.sorties))
  };
}

/** Export pour le comptable : séparateur « ; », BOM UTF-8 (Excel français). */
function csv(ecritures, { nomBien = () => '' } = {}) {
  const champ = valeur => {
    const brut = String(valeur ?? '');
    return /[;"\n\r]/.test(brut) ? `"${brut.replace(/"/g, '""')}"` : brut;
  };
  const lignes = [['Date', 'Sens', 'Catégorie', 'Libellé', 'Tiers', 'Entrée (FCFA)', 'Sortie (FCFA)', 'Mode', 'Statut', 'Référence', 'Bien', 'Demande', 'Notes']];
  for (const e of [...ecritures].sort((a, b) => a.date.localeCompare(b.date))) {
    lignes.push([
      e.date, e.sens === 'entree' ? 'Entrée' : 'Sortie', libelleCategorie(e.categorie), e.libelle, e.tiers,
      e.sens === 'entree' ? e.montant : '', e.sens === 'sortie' ? e.montant : '', libelleMode(e.mode),
      e.statut === 'regle' ? 'Réglé' : 'À régler', e.reference, e.bienKind ? nomBien(e.bienKind, e.bienId) : '',
      e.leadId ? e.leadId.slice(0, 8) : '', e.notes
    ]);
  }
  return `﻿${lignes.map(ligne => ligne.map(champ).join(';')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------
const FICHIER = 'compta.json';
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
const versDate = valeur => {
  if (!valeur) return '';
  // Colonne DATE lue par mysql2 avec timezone 'Z' (db/pool.js) : minuit UTC.
  if (valeur instanceof Date) return Number.isFinite(valeur.getTime()) ? valeur.toISOString().slice(0, 10) : '';
  return String(valeur).slice(0, 10);
};

function lireFichier() {
  const brut = jsonStore.read(FICHIER, {});
  return {
    ecritures: Array.isArray(brut?.ecritures) ? brut.ecritures : [],
    employes: Array.isArray(brut?.employes) ? brut.employes : [],
    charges: Array.isArray(brut?.charges) ? brut.charges : []
  };
}

const ecritureDepuisLigne = l => ({
  id: l.id, date: versDate(l.date_ecriture), sens: l.sens, categorie: l.categorie, montant: Number(l.montant), libelle: l.libelle,
  tiers: l.tiers || '', mode: l.mode_paiement || '', statut: l.statut, reference: l.reference || '',
  bienKind: l.bien_kind || '', bienId: l.bien_id || '', leadId: l.lead_id || '', employeId: l.employe_id || '',
  chargeId: l.charge_id || '', periode: l.periode || '', justificatif: l.justificatif || '', notes: l.notes || '',
  creePar: l.cree_par || '', creeLe: versIso(l.created_at), majLe: versIso(l.updated_at)
});
const employeDepuisLigne = l => ({
  id: l.id, nom: l.nom, poste: l.poste || '', telephone: l.telephone || '', salaireMensuel: Number(l.salaire_mensuel),
  dateEmbauche: versDate(l.date_embauche), actif: Boolean(Number(l.actif)), notes: l.notes || '',
  creeLe: versIso(l.created_at), majLe: versIso(l.updated_at)
});
const chargeDepuisLigne = l => ({
  id: l.id, libelle: l.libelle, categorie: l.categorie, montant: Number(l.montant), jour: Number(l.jour), tiers: l.tiers || '',
  mode: l.mode_paiement || '', bienKind: l.bien_kind || '', bienId: l.bien_id || '', debut: l.debut, fin: l.fin || '',
  actif: Boolean(Number(l.actif)), notes: l.notes || '', creeLe: versIso(l.created_at), majLe: versIso(l.updated_at)
});

/** Tout le stockage : { ecritures, employes, charges }. */
async function tout() {
  if (utiliserBase()) {
    try {
      const [[ecritures], [employes], [charges]] = await Promise.all([
        repo().query('SELECT * FROM compta_ecritures ORDER BY date_ecriture DESC, created_at DESC'),
        repo().query('SELECT * FROM compta_employes ORDER BY nom'),
        repo().query('SELECT * FROM compta_charges ORDER BY libelle')
      ]);
      return { ecritures: ecritures.map(ecritureDepuisLigne), employes: employes.map(employeDepuisLigne), charges: charges.map(chargeDepuisLigne) };
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  return lireFichier();
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

const ECRITURE_COLONNES = ['id', 'date_ecriture', 'sens', 'categorie', 'montant', 'libelle', 'tiers', 'mode_paiement', 'statut', 'reference',
  'bien_kind', 'bien_id', 'lead_id', 'employe_id', 'charge_id', 'periode', 'justificatif', 'notes', 'cree_par', 'created_at'];
const valeursEcriture = e => [e.id, e.date, e.sens, e.categorie, e.montant, e.libelle, e.tiers, e.mode, e.statut, e.reference,
  e.bienKind, e.bienId, e.leadId || null, e.employeId || null, e.chargeId || null, e.periode || null, e.justificatif, e.notes, e.creePar, versMysql(e.creeLe)];
const REQUETE_ECRITURE = `INSERT INTO compta_ecritures (${ECRITURE_COLONNES.join(', ')}) VALUES (${ECRITURE_COLONNES.map(() => '?').join(',')})
  ON DUPLICATE KEY UPDATE ${ECRITURE_COLONNES.filter(c => !['id', 'cree_par', 'created_at'].includes(c)).map(c => `${c}=VALUES(${c})`).join(', ')}`;

async function enregistrerEcritures(liste) {
  const ecritures = liste.filter(Boolean);
  if (!ecritures.length) return 0;
  return enBaseOuFichier(async r => {
    await r.transaction(async connexion => {
      for (const e of ecritures) await connexion.execute(REQUETE_ECRITURE, valeursEcriture(e));
    });
    return ecritures.length;
  }, donnees => {
    for (const e of ecritures) {
      const index = donnees.ecritures.findIndex(x => x.id === e.id);
      if (index >= 0) donnees.ecritures[index] = e; else donnees.ecritures.unshift(e);
    }
    return ecritures.length;
  });
}

async function supprimerEcriture(id) {
  return enBaseOuFichier(async r => (await r.query('DELETE FROM compta_ecritures WHERE id = ?', [String(id)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.ecritures.length; donnees.ecritures = donnees.ecritures.filter(e => e.id !== String(id)); return avant - donnees.ecritures.length; });
}

async function enregistrerEmploye(e) {
  return enBaseOuFichier(async r => {
    await r.query(`INSERT INTO compta_employes (id, nom, poste, telephone, salaire_mensuel, date_embauche, actif, notes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nom=VALUES(nom), poste=VALUES(poste), telephone=VALUES(telephone),
      salaire_mensuel=VALUES(salaire_mensuel), date_embauche=VALUES(date_embauche), actif=VALUES(actif), notes=VALUES(notes)`,
    [e.id, e.nom, e.poste, e.telephone, e.salaireMensuel, e.dateEmbauche || null, e.actif ? 1 : 0, e.notes, versMysql(e.creeLe)]);
    return e;
  }, donnees => {
    const index = donnees.employes.findIndex(x => x.id === e.id);
    if (index >= 0) donnees.employes[index] = e; else donnees.employes.push(e);
    return e;
  });
}

async function supprimerEmploye(id) {
  return enBaseOuFichier(async r => (await r.query('DELETE FROM compta_employes WHERE id = ?', [String(id)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.employes.length; donnees.employes = donnees.employes.filter(e => e.id !== String(id)); return avant - donnees.employes.length; });
}

async function enregistrerCharge(c) {
  return enBaseOuFichier(async r => {
    await r.query(`INSERT INTO compta_charges (id, libelle, categorie, montant, jour, tiers, mode_paiement, bien_kind, bien_id, debut, fin, actif, notes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE libelle=VALUES(libelle), categorie=VALUES(categorie), montant=VALUES(montant),
      jour=VALUES(jour), tiers=VALUES(tiers), mode_paiement=VALUES(mode_paiement), bien_kind=VALUES(bien_kind), bien_id=VALUES(bien_id),
      debut=VALUES(debut), fin=VALUES(fin), actif=VALUES(actif), notes=VALUES(notes)`,
    [c.id, c.libelle, c.categorie, c.montant, c.jour, c.tiers, c.mode, c.bienKind, c.bienId, c.debut, c.fin || null, c.actif ? 1 : 0, c.notes, versMysql(c.creeLe)]);
    return c;
  }, donnees => {
    const index = donnees.charges.findIndex(x => x.id === c.id);
    if (index >= 0) donnees.charges[index] = c; else donnees.charges.push(c);
    return c;
  });
}

async function supprimerCharge(id) {
  return enBaseOuFichier(async r => (await r.query('DELETE FROM compta_charges WHERE id = ?', [String(id)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.charges.length; donnees.charges = donnees.charges.filter(c => c.id !== String(id)); return avant - donnees.charges.length; });
}

module.exports = {
  CATEGORIES, MODES, SENS, STATUTS,
  periodeValide, dateValide, finDePeriode, libelleCategorie, libelleMode,
  validerEcriture, validerEmploye, validerCharge, paieDuMois, chargesDuMois, categorieDeDemande, ventes, rapport, csv, moisEntre,
  configure, tout, enregistrerEcritures, supprimerEcriture, enregistrerEmploye, supprimerEmploye, enregistrerCharge, supprimerCharge,
  REQUETE_ECRITURE, valeursEcriture
};
