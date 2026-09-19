/**
 * LOCATION DE VOITURES — côté serveur (demande du 17/09/2026).
 *
 *  · les VÉHICULES sont des annonces du catalogue (content.vehicles), comme
 *    les villas : validés ici, publiés par « Publier les changements » ;
 *  · les RÉSERVATIONS (demandes du site et de l'app, saisies du studio), les
 *    INDISPONIBILITÉS (entretien, panne…) et les RÉGLAGES (lieux de prise en
 *    charge et leurs frais, options, horaires, conditions) sont des données
 *    d'exploitation, enregistrées aussitôt : MySQL (tables `location_*`) quand
 *    la base répond, fichier `data/location.json` sinon.
 *
 * Les tarifs et le planning suivent js/location-voitures.js, partagé avec le
 * site : l'estimation vue par le visiteur est celle que le serveur recalcule.
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');
const L = require('../js/location-voitures.js');

const FICHIER = 'location.json';
const texte = (valeur, max) => String(valeur ?? '').trim().slice(0, max);
const montant = (valeur, max = 100_000_000) => {
  const n = Math.round(Number(valeur));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};
const entier = (valeur, min, max, repli) => {
  const n = Math.round(Number(valeur));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli;
};
const slug = (valeur, repli) => texte(valeur, 100).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || repli;
const liste = (valeur, nombre, longueur) => (Array.isArray(valeur) ? valeur : String(valeur ?? '').split('\n'))
  .map(ligne => texte(ligne, longueur)).filter(Boolean).slice(0, nombre);
const CATEGORIES = L.CATEGORIES.map(c => c.id);

// ---------------------------------------------------------------------------
// Fiches véhicules (catalogue)
// ---------------------------------------------------------------------------

/**
 * Fiche véhicule saisie au studio. Les erreurs bloquent la publication, les
 * avertissements la laissent passer (comme pour les villas).
 */
function validerVehicule(item = {}, index = 0, { vus = new Set(), errors = [], warnings = [] } = {}) {
  const name = texte(item.name, 160);
  const nom = name || `Véhicule ${index + 1}`;
  const id = slug(item.id || name, `vehicule-${index + 1}`);
  if (!name) errors.push(`Véhicule ${index + 1} : le nom (marque et modèle) est requis.`);
  if (vus.has(id)) errors.push(`Véhicule : l'identifiant « ${id} » est utilisé plusieurs fois.`);
  vus.add(id);
  const images = (Array.isArray(item.images) ? item.images : []).map(v => texte(v, 1000)).filter(Boolean).slice(0, 12);
  if (!images.length) warnings.push(`${nom} : aucune photo.`);
  const pricePerDay = montant(item.pricePerDay);
  const pricePerDayWeek = montant(item.pricePerDayWeek);
  const pricePerDayMonth = montant(item.pricePerDayMonth);
  if (!pricePerDay) warnings.push(`${nom} : tarif par jour nul (affiché « sur demande »).`);
  if (pricePerDayWeek && pricePerDay && pricePerDayWeek > pricePerDay) warnings.push(`${nom} : le tarif semaine dépasse le tarif jour.`);
  if (pricePerDayMonth && (pricePerDayWeek || pricePerDay) && pricePerDayMonth > (pricePerDayWeek || pricePerDay)) warnings.push(`${nom} : le tarif mois dépasse le tarif semaine.`);
  const driverMode = Object.keys(L.MODES_CHAUFFEUR).includes(item.driverMode) ? item.driverMode : 'choix';
  const category = CATEGORIES.includes(item.category) ? item.category : 'berline';
  const annee = entier(item.year, 1990, new Date().getFullYear() + 1, 0);
  return {
    ...item,
    id, name,
    brand: texte(item.brand, 60), model: texte(item.model, 80), year: annee || null,
    category,
    transmission: Object.keys(L.BOITES).includes(item.transmission) ? item.transmission : 'manuelle',
    fuel: Object.keys(L.CARBURANTS).includes(item.fuel) ? item.fuel : 'essence',
    seats: entier(item.seats, 1, 60, 5), doors: entier(item.doors, 0, 6, 4), luggage: entier(item.luggage, 0, 30, 2),
    airConditioning: item.airConditioning !== false,
    driverMode,
    pricePerDay, pricePerDayWeek, pricePerDayMonth,
    driverPricePerDay: driverMode === 'sans' ? 0 : montant(item.driverPricePerDay),
    // Caution et conditions de conduite : sans objet quand un chauffeur conduit toujours.
    deposit: driverMode === 'avec' ? 0 : montant(item.deposit),
    minAge: driverMode === 'avec' ? 0 : entier(item.minAge, 18, 35, 21),
    licenseYears: driverMode === 'avec' ? 0 : entier(item.licenseYears, 0, 15, 2),
    kmIncludedPerDay: entier(item.kmIncludedPerDay, 0, 5000, 0),
    extraKmPrice: montant(item.extraKmPrice, 100_000),
    minDays: entier(item.minDays, 1, 30, 1),
    tagline: texte(item.tagline, 240), description: texte(item.description, 8000),
    features: liste(item.features, 30, 160),
    images,
    visible: item.visible !== false, featured: Boolean(item.featured),
    badge: texte(item.badge, 80)
  };
}

// ---------------------------------------------------------------------------
// Réglages (lieux, options, horaires, conditions)
// ---------------------------------------------------------------------------

function validerReglages(source = {}) {
  const erreurs = [];
  const idsVus = new Set();
  const identifiant = (valeur, nom, prefixe) => {
    let id = slug(valeur || nom, `${prefixe}-${idsVus.size + 1}`);
    while (idsVus.has(id)) id = `${id}-2`;
    idsVus.add(id);
    return id;
  };
  const lieux = (Array.isArray(source.lieux) ? source.lieux : []).slice(0, 30).map((l, i) => {
    const nom = texte(l?.nom, 120);
    if (!nom) erreurs.push(`Lieu ${i + 1} : le nom est requis.`);
    return { id: identifiant(l?.id, nom, 'lieu'), nom, frais: montant(l?.frais, 10_000_000), actif: l?.actif !== false };
  });
  const options = (Array.isArray(source.options) ? source.options : []).slice(0, 30).map((o, i) => {
    const nom = texte(o?.nom, 120);
    if (!nom) erreurs.push(`Option ${i + 1} : le nom est requis.`);
    return { id: identifiant(o?.id, nom, 'option'), nom, prix: montant(o?.prix, 10_000_000), unite: o?.unite === 'location' ? 'location' : 'jour', actif: o?.actif !== false };
  });
  if (!lieux.some(l => l.actif)) erreurs.push('Gardez au moins un lieu de prise en charge actif.');
  const conditions = source.conditions && typeof source.conditions === 'object' ? source.conditions : {};
  const reglages = L.normaliserReglages({
    ...source, lieux, options,
    conditions: { fr: texte(conditions.fr, 3000), en: texte(conditions.en, 3000), es: texte(conditions.es, 3000) }
  });
  const minutes = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  if (minutes(reglages.heureFermeture) <= minutes(reglages.heureOuverture)) erreurs.push('L’heure de fermeture doit suivre l’heure d’ouverture.');
  return { reglages, erreurs };
}

/** Ce que voient le site et l'app : lieux et options actifs, sans les inactifs. */
function reglagesPublics(reglages) {
  const r = L.normaliserReglages(reglages);
  return { ...r, lieux: r.lieux.filter(l => l.actif), options: r.options.filter(o => o.actif) };
}

// ---------------------------------------------------------------------------
// Réservations et indisponibilités
// ---------------------------------------------------------------------------

const MOTIFS = Object.keys(L.MOTIFS_INDISPONIBILITE);
const SOURCES = ['site', 'app', 'studio'];

/**
 * Demande publique (site, app) : estimation recalculée, disponibilité
 * vérifiée. Renvoie { reservation, devis, erreur, statut }.
 */
function preparerDemande(payload = {}, { vehicule, reglages, reservations = [], indisponibilites = [], maintenant = new Date() } = {}) {
  const nom = texte(payload.nom ?? payload.name, 120);
  const telephone = texte(payload.telephone ?? payload.phone, 40);
  const email = texte(payload.email, 180).toLowerCase();
  if (!vehicule) return { erreur: 'Ce véhicule n’est plus proposé à la location.', statut: 404 };
  if (nom.length < 2) return { erreur: 'Indiquez votre nom.', statut: 422 };
  if (telephone.replace(/\D/g, '').length < 8) return { erreur: 'Indiquez un numéro de téléphone joignable (WhatsApp de préférence).', statut: 422 };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erreur: 'Adresse e-mail invalide.', statut: 422 };
  const devis = L.devis(vehicule, reglages, {
    debut: payload.debut, fin: payload.fin, lieuPrise: payload.lieuPrise, lieuRetour: payload.lieuRetour,
    adressePrise: payload.adressePrise, adresseRetour: payload.adresseRetour,
    chauffeur: payload.chauffeur === true, options: Array.isArray(payload.options) ? payload.options.map(String) : []
  }, { maintenant });
  if (!devis.ok) return { erreur: devis.erreurs[0].message, statut: 422, devis };
  // Sans chauffeur, le client atteste l'âge et l'ancienneté de permis exigés.
  if (!devis.chauffeur && (vehicule.minAge || vehicule.licenseYears) && payload.conditionsConducteur !== true) {
    return { erreur: `Confirmez avoir au moins ${vehicule.minAge || 18} ans et votre permis depuis ${vehicule.licenseYears || 0} an${(vehicule.licenseYears || 0) > 1 ? 's' : ''}.`, statut: 422, devis };
  }
  const reglagesNormaux = L.normaliserReglages(reglages);
  const occupees = L.occupations(vehicule.id, reservations, indisponibilites, { battementHeures: reglagesNormaux.battementHeures });
  const gene = L.conflit(occupees, devis.debut, devis.fin);
  if (gene) return { erreur: 'Ce véhicule n’est pas disponible sur ces dates. Choisissez d’autres dates ou un autre véhicule.', statut: 409, devis, conflit: gene };
  const reservation = {
    id: crypto.randomUUID(), vehiculeId: vehicule.id, vehiculeNom: vehicule.name, leadId: '',
    statut: 'demande', debut: devis.debut, fin: devis.fin, chauffeur: devis.chauffeur,
    lieuPrise: devis.lieuPrise?.id || '', lieuRetour: devis.lieuRetour?.id || '',
    adressePrise: devis.adressePrise || '', adresseRetour: devis.adresseRetour || '', options: devis.options,
    montant: devis.total, caution: devis.caution, jours: devis.jours,
    client: { nom, telephone, email }, notes: texte(payload.message, 1000),
    source: SOURCES.includes(payload.source) ? payload.source : 'site',
    creePar: '', modifiePar: '', creeLe: new Date(maintenant).toISOString(), majLe: new Date(maintenant).toISOString()
  };
  return { reservation, devis };
}

/**
 * Voiture jointe à une demande de devis (19/09/2026) : séjour + activités +
 * voiture, activités + voiture, ou voiture seule (type « location-voiture »).
 * UNE seule demande : son montant devient « reste de la demande + prix de la
 * voiture recalculé ici » (le prix envoyé par le client pour la voiture est
 * remplacé), son libellé et son message décrivent la voiture, et une
 * réservation « demande » est préparée pour le planning, à lier à la demande.
 * `lead` : demande déjà nettoyée par le serveur ; elle n'est pas modifiée.
 */
function joindreVoiture(lead, location = {}, contexte = {}) {
  const preparation = preparerDemande({
    ...location, nom: lead.name, telephone: lead.phone, email: lead.email,
    message: lead.type === 'location-voiture' ? '' : texte(`Avec la demande : ${lead.villa || 'devis'} · ${lead.dates}`, 1000),
    source: contexte.source
  }, contexte);
  if (preparation.erreur) return preparation;
  const { reservation, devis } = preparation;
  const vehicule = contexte.vehicule;
  const seule = lead.type === 'location-voiture';
  const montantClient = Math.max(0, Math.round(Number(location.montant) || 0));
  const reste = seule ? 0 : Math.max(0, (Number(lead.amount) || 0) - montantClient);
  return {
    reservation, devis,
    lead: {
      ...lead,
      amount: reste + devis.total,
      villa: texte(seule ? `Location · ${vehicule.name}` : `${lead.villa || 'Demande'} + voiture ${vehicule.name}`, 160),
      dates: seule ? texte(`${formatDate(devis.debut)} → ${formatDate(devis.fin)}`, 160) : lead.dates,
      message: texte([lead.message, recapitulatif(vehicule, devis)].filter(Boolean).join('\n\n'), 2000)
    }
  };
}

/**
 * Report d'une réservation modifiée au studio sur sa demande. Voiture seule :
 * statut et montant suivent la réservation. Demande combinée (séjour ou
 * activités + voiture) : seul l'écart du prix de la voiture est reporté — le
 * séjour ne se confirme ni ne s'annule depuis le planning des voitures.
 */
function patchDemandeDepuisReservation(lead, reservation, avant) {
  if (!lead) return {};
  const patch = {};
  const seule = lead.type === 'location-voiture';
  const statut = { confirmee: 'confirme', en_cours: 'confirme', terminee: 'confirme', annulee: 'archive' }[reservation.statut];
  if (seule && statut && (!avant || avant.statut !== reservation.statut)) patch.status = statut;
  if (avant && avant.montant !== reservation.montant) {
    patch.amount = seule ? reservation.montant : Math.max(0, (Number(lead.amount) || 0) - (Number(avant.montant) || 0) + (Number(reservation.montant) || 0));
  } else if (!avant && seule) patch.amount = reservation.montant;
  return patch;
}

const formatDate = iso => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const deux = n => String(n).padStart(2, '0');
  return `${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}`;
};
const fcfa = n => L.fcfa(n);

/** Récapitulatif en français enregistré avec la demande (studio, e-mail, WhatsApp). */
function recapitulatif(vehicule, devis) {
  const lignes = [
    `Location de véhicule : ${vehicule.name}`,
    `Du ${formatDate(devis.debut)} au ${formatDate(devis.fin)} (${devis.jours} jour${devis.jours > 1 ? 's' : ''})`,
    devis.chauffeur ? 'Avec chauffeur' : 'Sans chauffeur (le client conduit)',
    devis.lieuPrise ? `Prise en charge : ${devis.lieuPrise.nom}${devis.adressePrise ? ` — ${devis.adressePrise}` : ''}` : '',
    devis.lieuRetour ? `Retour : ${devis.lieuRetour.nom}${devis.adresseRetour ? ` — ${devis.adresseRetour}` : ''}` : '',
    ...devis.lignes.map(l => {
      if (l.cle === 'vehicule') return `Véhicule : ${l.quantite} j × ${fcfa(l.prixUnitaire)} (tarif ${l.palier}) = ${fcfa(l.montant)}`;
      if (l.cle === 'chauffeur') return `Chauffeur : ${l.quantite} j × ${fcfa(l.prixUnitaire)} = ${fcfa(l.montant)}`;
      if (l.cle === 'livraison') return `${l.sens === 'prise' ? 'Livraison' : 'Reprise'} (${l.nom}) : ${fcfa(l.montant)}`;
      return `${l.nom} : ${l.unite === 'jour' ? `${l.quantite} j × ${fcfa(l.prixUnitaire)} = ` : ''}${fcfa(l.montant)}`;
    }),
    `Total estimé : ${fcfa(devis.total)}`,
    devis.caution ? `Caution (restituée) : ${fcfa(devis.caution)}` : '',
    devis.kmInclus ? `Kilométrage inclus : ${devis.kmInclus} km, puis ${fcfa(devis.prixKmSupplementaire)} / km` : 'Kilométrage illimité'
  ];
  return lignes.filter(Boolean).join('\n');
}

/**
 * Réservation saisie ou modifiée au studio (appel, passage à l'agence…).
 * Le montant est recalculé sauf s'il est saisi à la main (remise négociée).
 */
function validerReservationStudio(source = {}, { existante = null, vehicules = [], reglages, acteur = '', maintenant = new Date() } = {}) {
  const erreurs = [];
  const vehicule = vehicules.find(v => v.id === (source.vehiculeId ?? existante?.vehiculeId)) || null;
  if (!vehicule) erreurs.push('Choisissez un véhicule du catalogue.');
  const debut = L.dateHeure(source.debut ?? existante?.debut);
  const fin = L.dateHeure(source.fin ?? existante?.fin);
  if (!debut || !fin) erreurs.push('Dates de prise en charge et de retour requises.');
  else if (fin <= debut) erreurs.push('Le retour doit suivre la prise en charge.');
  const client = {
    nom: texte(source.client?.nom ?? existante?.client?.nom, 120),
    telephone: texte(source.client?.telephone ?? existante?.client?.telephone, 40),
    email: texte(source.client?.email ?? existante?.client?.email, 180).toLowerCase()
  };
  if (client.nom.length < 2) erreurs.push('Nom du client requis.');
  if (erreurs.length) return { erreurs };
  const devis = L.devis(vehicule, reglages, {
    debut, fin, chauffeur: source.chauffeur ?? existante?.chauffeur,
    lieuPrise: source.lieuPrise ?? existante?.lieuPrise, lieuRetour: source.lieuRetour ?? existante?.lieuRetour,
    adressePrise: source.adressePrise ?? existante?.adressePrise, adresseRetour: source.adresseRetour ?? existante?.adresseRetour,
    options: Array.isArray(source.options) ? source.options : existante?.options || []
  }, { maintenant, controlerDelai: false });
  // Au studio, seules comptent les erreurs de fond ; horaires et lieu restent libres.
  const bloquantes = devis.erreurs.filter(e => ['dates', 'ordre', 'duree'].includes(e.code));
  if (bloquantes.length) return { erreurs: bloquantes.map(e => e.message) };
  const montantSaisi = source.montant === '' || source.montant === undefined || source.montant === null ? null : montant(source.montant);
  const horodatage = new Date(maintenant).toISOString();
  return {
    erreurs: [],
    devis,
    reservation: {
      id: existante?.id || crypto.randomUUID(), vehiculeId: vehicule.id, vehiculeNom: vehicule.name, leadId: existante?.leadId || '',
      statut: existante?.statut || 'demande', debut: devis.debut, fin: devis.fin, chauffeur: devis.chauffeur,
      lieuPrise: devis.lieuPrise?.id || texte(source.lieuPrise ?? existante?.lieuPrise, 80),
      lieuRetour: devis.lieuRetour?.id || texte(source.lieuRetour ?? existante?.lieuRetour, 80),
      // Adresse d'un lieu « à préciser » (domicile, bureau, autre).
      adressePrise: devis.lieuPrise ? devis.adressePrise : texte(source.adressePrise ?? existante?.adressePrise, 200),
      adresseRetour: devis.lieuRetour ? devis.adresseRetour : texte(source.adresseRetour ?? existante?.adresseRetour, 200),
      options: devis.options, jours: devis.jours,
      montant: montantSaisi ?? devis.total, caution: devis.caution,
      client, notes: texte(source.notes ?? existante?.notes, 1000),
      source: existante?.source || 'studio',
      creePar: existante ? existante.creePar || '' : texte(acteur, 120), modifiePar: existante ? texte(acteur, 120) : '',
      creeLe: existante?.creeLe || horodatage, majLe: horodatage
    }
  };
}

/**
 * Changement de statut d'une réservation. Passer à « confirmée » (ou « en
 * cours ») vérifie le planning : pas de chevauchement avec une autre
 * réservation confirmée ou une indisponibilité.
 */
function changerStatut(reservation, statut, { reservations = [], indisponibilites = [], reglages, acteur = '', maintenant = new Date() } = {}) {
  if (!L.STATUTS[statut]) return { erreur: 'Statut inconnu.' };
  if (reservation.statut === statut) return { reservation };
  if (!(L.TRANSITIONS[reservation.statut] || []).includes(statut)) {
    return { erreur: `Passage impossible de « ${L.STATUTS[reservation.statut]} » à « ${L.STATUTS[statut]} ».` };
  }
  if (L.STATUTS_BLOQUANTS.includes(statut)) {
    const { battementHeures } = L.normaliserReglages(reglages);
    const occupees = L.occupations(reservation.vehiculeId, reservations, indisponibilites, { battementHeures, ignorer: reservation.id });
    const gene = L.conflit(occupees, reservation.debut, reservation.fin);
    if (gene) {
      const quoi = gene.type === 'indisponibilite' ? 'une indisponibilité' : 'une autre réservation confirmée';
      return { erreur: `Chevauchement avec ${quoi} (${formatDate(gene.debut)} → ${formatDate(gene.fin)}, préparation comprise). Modifiez les dates avant de confirmer.`, conflit: gene };
    }
  }
  return { reservation: { ...reservation, statut, modifiePar: texte(acteur, 120), majLe: new Date(maintenant).toISOString() } };
}

function validerIndisponibilite(source = {}, { existante = null, vehicules = [], acteur = '', maintenant = new Date() } = {}) {
  const erreurs = [];
  const vehiculeId = texte(source.vehiculeId ?? existante?.vehiculeId, 80);
  if (!vehicules.some(v => v.id === vehiculeId)) erreurs.push('Choisissez un véhicule du catalogue.');
  const debut = L.dateHeure(source.debut ?? existante?.debut);
  const fin = L.dateHeure(source.fin ?? existante?.fin);
  if (!debut || !fin) erreurs.push('Dates de début et de fin requises.');
  else if (fin <= debut) erreurs.push('La fin doit suivre le début.');
  if (erreurs.length) return { erreurs };
  const horodatage = new Date(maintenant).toISOString();
  return {
    erreurs: [],
    indisponibilite: {
      id: existante?.id || crypto.randomUUID(), vehiculeId,
      motif: MOTIFS.includes(source.motif) ? source.motif : existante?.motif || 'entretien',
      debut: debut.toISOString(), fin: fin.toISOString(), notes: texte(source.notes ?? existante?.notes, 500),
      creePar: existante ? existante.creePar || '' : texte(acteur, 120), creeLe: existante?.creeLe || horodatage, majLe: horodatage
    }
  };
}

/** Périodes occupées d'un véhicule, telles que montrées au public (sans nom ni motif). */
function occupationsPubliques(vehiculeId, { reservations = [], indisponibilites = [], reglages } = {}, maintenant = new Date()) {
  const { battementHeures } = L.normaliserReglages(reglages);
  const depuis = new Date(maintenant).getTime();
  return L.occupations(vehiculeId, reservations, indisponibilites, { battementHeures })
    .filter(o => new Date(o.fin).getTime() > depuis)
    .map(o => ({ debut: o.debut, fin: o.fin }));
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
    reservations: Array.isArray(brut?.reservations) ? brut.reservations : [],
    indisponibilites: Array.isArray(brut?.indisponibilites) ? brut.indisponibilites : [],
    reglages: brut?.reglages && typeof brut.reglages === 'object' ? brut.reglages : null
  };
}

const reservationDepuisLigne = l => ({
  id: l.id, vehiculeId: l.vehicule_id, vehiculeNom: l.vehicule_nom || '', leadId: l.lead_id || '', statut: l.statut,
  debut: versIso(l.debut), fin: versIso(l.fin), chauffeur: Boolean(Number(l.chauffeur)),
  lieuPrise: l.lieu_prise || '', lieuRetour: l.lieu_retour || '', adressePrise: l.adresse_prise || '', adresseRetour: l.adresse_retour || '',
  options: json(l.options, []),
  jours: Number(l.jours) || 0, montant: Number(l.montant) || 0, caution: Number(l.caution) || 0,
  client: { nom: l.client_nom || '', telephone: l.client_telephone || '', email: l.client_email || '' },
  notes: l.notes || '', source: l.source || 'site', creePar: l.cree_par || '', modifiePar: l.modifie_par || '',
  creeLe: versIso(l.created_at), majLe: versIso(l.updated_at)
});
const indisponibiliteDepuisLigne = l => ({
  id: l.id, vehiculeId: l.vehicule_id, motif: l.motif, debut: versIso(l.debut), fin: versIso(l.fin),
  notes: l.notes || '', creePar: l.cree_par || '', creeLe: versIso(l.created_at), majLe: versIso(l.updated_at)
});

/** Tout le stockage : { reservations, indisponibilites, reglages (normalisés) }. */
async function tout() {
  if (utiliserBase()) {
    try {
      const [[reservations], [indisponibilites], [reglages]] = await Promise.all([
        repo().query('SELECT * FROM location_reservations ORDER BY debut DESC'),
        repo().query('SELECT * FROM location_indisponibilites ORDER BY debut DESC'),
        repo().query("SELECT donnees FROM location_reglages WHERE id = 'general'")
      ]);
      return {
        reservations: reservations.map(reservationDepuisLigne),
        indisponibilites: indisponibilites.map(indisponibiliteDepuisLigne),
        reglages: L.normaliserReglages(reglages[0] ? json(reglages[0].donnees, null) : null)
      };
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  return { ...donnees, reglages: L.normaliserReglages(donnees.reglages) };
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

const REQUETE_RESERVATION = `INSERT INTO location_reservations
  (id, vehicule_id, vehicule_nom, lead_id, statut, debut, fin, chauffeur, lieu_prise, lieu_retour, adresse_prise, adresse_retour, options, jours,
   montant, caution, client_nom, client_telephone, client_email, notes, source, cree_par, modifie_par, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE vehicule_id=VALUES(vehicule_id), vehicule_nom=VALUES(vehicule_nom), lead_id=VALUES(lead_id),
    statut=VALUES(statut), debut=VALUES(debut), fin=VALUES(fin), chauffeur=VALUES(chauffeur), lieu_prise=VALUES(lieu_prise),
    lieu_retour=VALUES(lieu_retour), adresse_prise=VALUES(adresse_prise), adresse_retour=VALUES(adresse_retour), options=VALUES(options), jours=VALUES(jours), montant=VALUES(montant), caution=VALUES(caution),
    client_nom=VALUES(client_nom), client_telephone=VALUES(client_telephone), client_email=VALUES(client_email),
    notes=VALUES(notes), modifie_par=VALUES(modifie_par)`;

async function enregistrerReservation(r) {
  return enBaseOuFichier(async depotBase => {
    await depotBase.query(REQUETE_RESERVATION, [
      r.id, r.vehiculeId, r.vehiculeNom || '', r.leadId || '', r.statut, versMysql(r.debut), versMysql(r.fin), r.chauffeur ? 1 : 0,
      r.lieuPrise || '', r.lieuRetour || '', r.adressePrise || '', r.adresseRetour || '', JSON.stringify(r.options || []), Number(r.jours) || 0,
      Number(r.montant) || 0, Number(r.caution) || 0, r.client?.nom || '', r.client?.telephone || '', r.client?.email || '',
      r.notes || '', r.source || 'site', r.creePar || '', r.modifiePar || '', versMysql(r.creeLe)
    ]);
    return r;
  }, donnees => {
    const index = donnees.reservations.findIndex(x => x.id === r.id);
    if (index >= 0) donnees.reservations[index] = r; else donnees.reservations.unshift(r);
    return r;
  });
}

async function supprimerReservation(id) {
  return enBaseOuFichier(async depotBase => (await depotBase.query('DELETE FROM location_reservations WHERE id = ?', [String(id)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.reservations.length; donnees.reservations = donnees.reservations.filter(r => r.id !== String(id)); return avant - donnees.reservations.length; });
}

async function enregistrerIndisponibilite(b) {
  return enBaseOuFichier(async depotBase => {
    await depotBase.query(`INSERT INTO location_indisponibilites (id, vehicule_id, motif, debut, fin, notes, cree_par, created_at)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE vehicule_id=VALUES(vehicule_id), motif=VALUES(motif),
      debut=VALUES(debut), fin=VALUES(fin), notes=VALUES(notes)`,
    [b.id, b.vehiculeId, b.motif, versMysql(b.debut), versMysql(b.fin), b.notes || '', b.creePar || '', versMysql(b.creeLe)]);
    return b;
  }, donnees => {
    const index = donnees.indisponibilites.findIndex(x => x.id === b.id);
    if (index >= 0) donnees.indisponibilites[index] = b; else donnees.indisponibilites.unshift(b);
    return b;
  });
}

async function supprimerIndisponibilite(id) {
  return enBaseOuFichier(async depotBase => (await depotBase.query('DELETE FROM location_indisponibilites WHERE id = ?', [String(id)]))[0]?.affectedRows || 0,
    donnees => { const avant = donnees.indisponibilites.length; donnees.indisponibilites = donnees.indisponibilites.filter(b => b.id !== String(id)); return avant - donnees.indisponibilites.length; });
}

async function enregistrerReglages(reglages) {
  return enBaseOuFichier(async depotBase => {
    await depotBase.query(`INSERT INTO location_reglages (id, donnees) VALUES ('general', ?) ON DUPLICATE KEY UPDATE donnees = VALUES(donnees)`,
      [JSON.stringify(reglages)]);
    return reglages;
  }, donnees => { donnees.reglages = reglages; return reglages; });
}

module.exports = {
  FICHIER, MOTIFS, SOURCES,
  validerVehicule, validerReglages, reglagesPublics,
  preparerDemande, joindreVoiture, patchDemandeDepuisReservation, recapitulatif, formatDate, validerReservationStudio, changerStatut, validerIndisponibilite, occupationsPubliques,
  configure, tout, enregistrerReservation, supprimerReservation, enregistrerIndisponibilite, supprimerIndisponibilite, enregistrerReglages
};
