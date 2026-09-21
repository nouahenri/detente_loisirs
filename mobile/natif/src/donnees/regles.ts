/**
 * Règles métier de l'app — COPIES CONFORMES de celles du site (js/app.js,
 * js/premium.js), pour que l'app affiche, filtre et chiffre exactement comme
 * henri-philippe.com. Toute évolution côté site doit être reportée ici.
 */
import { TAUX_EUR, WHATSAPP } from './config';
import type { Langue, Traduire } from './i18n';
import type {
  Activite, Vehicule, Criteres, CriteresTerrains, Donnees, FichePublication, Publication, Referentiels, Segment, Terrain, Villa,
} from './types';
import {
  categorieVehicule, demandeDeSaisie, devisLocation, normaliserReglages, saisieAvecSejour, saisieVoitureInitiale, type SaisieVoiture,
} from './location';

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------
const separerMilliers = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const nombre = (n: number) => separerMilliers(n);
export const fcfa = (n: number) => `${separerMilliers(n)} FCFA`;
export const euro = (n: number) => `~ ${separerMilliers(n)} €`;
export const sansAccents = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const lienWhatsApp = (message: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;

export const dateNumerique = (iso?: string) => { const d = new Date(iso || Date.now()); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
export const dateISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Normalisation (normalizeManaged* du site)
// ---------------------------------------------------------------------------
const nombreOu = (v: unknown, repli = 0) => { const n = Number(v); return Number.isFinite(n) ? n : Number(repli) || 0; };
const textes = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map(x => x.trim());

export const STATUTS_TERRAIN: Record<string, string> = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu' };
export const STATUTS_FONCIERS: Record<string, string> = {
  'titre-foncier': 'Titre foncier',
  acd: 'ACD (Arrêté de Concession Définitive)',
  'lettre-attribution': 'Lettre d’attribution',
  'certificat-propriete': 'Certificat de propriété',
};
export const VIABILISATION: Record<string, string> = {
  eau: 'Eau courante', electricite: 'Électricité', 'voie-bitumee': 'Voie bitumée',
  assainissement: 'Assainissement', cloture: 'Clôturé', borne: 'Bornage réalisé',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function normaliserVehicule(item: any): Vehicule {
  const mode = ['avec', 'sans', 'choix'].includes(item.driverMode) ? item.driverMode : 'choix';
  return {
    ...item,
    id: String(item.id), name: String(item.name || ''), category: String(item.category || 'berline'),
    transmission: String(item.transmission || 'manuelle'), fuel: String(item.fuel || 'essence'),
    seats: nombreOu(item.seats, 5), doors: nombreOu(item.doors, 4), luggage: nombreOu(item.luggage, 2), airConditioning: item.airConditioning !== false,
    driverMode: mode, pricePerDay: nombreOu(item.pricePerDay), pricePerDayWeek: nombreOu(item.pricePerDayWeek), pricePerDayMonth: nombreOu(item.pricePerDayMonth),
    driverPricePerDay: nombreOu(item.driverPricePerDay), deposit: nombreOu(item.deposit), minAge: nombreOu(item.minAge), licenseYears: nombreOu(item.licenseYears),
    kmIncludedPerDay: nombreOu(item.kmIncludedPerDay), extraKmPrice: nombreOu(item.extraKmPrice), minDays: nombreOu(item.minDays, 1),
    features: textes(item.features), images: textes(item.images),
  };
}

function normaliserVilla(item: any): Villa {
  const images = textes(item.images);
  return {
    ...item,
    id: String(item.id),
    name: String(item.name || ''),
    capacity: nombreOu(item.capacity), bedrooms: nombreOu(item.bedrooms), bathrooms: nombreOu(item.bathrooms),
    pricePerNight: nombreOu(item.pricePerNight), priceEuro: nombreOu(item.priceEuro),
    weekendPackage: nombreOu(item.weekendPackage), rating: nombreOu(item.rating, 5), reviewsCount: nombreOu(item.reviewsCount),
    images: images.length ? images : ['assets/images/residence-villa-luxe.jpg'],
    features: textes(item.features), highlights: textes(item.highlights),
  };
}

function normaliserActivite(item: any): Activite {
  const images = textes(item.images);
  const principale = String(item.image || images[0] || 'assets/images/plage-assinie-passe.jpg');
  const galerie = images.length ? images : [principale];
  if (!galerie.includes(principale)) galerie.unshift(principale);
  return { ...item, id: String(item.id), title: String(item.title || ''), image: principale, images: galerie };
}

function normaliserTerrain(item: any): Terrain {
  const images = textes(item.images);
  const areaSqm = nombreOu(item.areaSqm);
  const priceTotal = nombreOu(item.priceTotal);
  const landStatus = String(item.landStatus || 'titre-foncier');
  const status = String(item.status || 'disponible').toLowerCase();
  return {
    ...item,
    id: String(item.id),
    reference: String(item.reference || ''), title: String(item.title || 'Terrain à Assinie'),
    location: String(item.location || 'Assinie'), district: String(item.district || ''),
    areaSqm, priceTotal,
    pricePerSqm: nombreOu(item.pricePerSqm) || (areaSqm ? Math.round(priceTotal / areaSqm) : 0),
    priceEuro: nombreOu(item.priceEuro) || Math.round(priceTotal / TAUX_EUR),
    landStatus,
    landStatusLabel: String(item.landStatusLabel || STATUTS_FONCIERS[landStatus] || 'Statut foncier à préciser'),
    utilities: textes(item.utilities),
    status: STATUTS_TERRAIN[status] ? status : 'disponible',
    images: images.length ? images : ['assets/images/plage-assinie-passe.jpg'],
    highlights: textes(item.highlights),
  };
}

export function lireContenu(contenu: any): Donnees {
  const visibles = (liste: unknown) => (Array.isArray(liste) ? liste : []).filter((item: any) => item && item.visible !== false);
  return {
    villas: visibles(contenu.villas).map(normaliserVilla),
    // Un terrain vendu n'est plus une annonce (règle du site, 13/09/2026).
    terrains: visibles(contenu.terrains).map(normaliserTerrain).filter(t => t.status !== 'vendu'),
    activites: visibles(contenu.activities).map(normaliserActivite),
    // Location de voitures (17/09/2026).
    vehicules: visibles(contenu.vehicles).map(normaliserVehicule),
    location: normaliserReglages(contenu.location),
    publications: (Array.isArray(contenu.facebookPosts) ? contenu.facebookPosts : [])
      .filter((p: any) => p && (p.message || p.full_picture))
      .map((p: any) => ({ ...p, id: String(p.id) })),
    avis: visibles(contenu.reviews).filter((a: any) => String(a.comment || '').trim()),
    // Une question sans texte n'est pas affichée (fiche encore vide dans le studio).
    faq: visibles(contenu.faq).filter((f: any) => String(f.q || '').trim() && String(f.a || '').trim()),
    refs: contenu.referentiels || null,
    reglages: contenu.settings || {},
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function libelle(refs: Referentiels | null, type: keyof Referentiels, id?: string, repli = '', langue: Langue = 'fr'): string {
  const liste = refs && refs[type];
  if (!liste || !id) return repli;
  const entree = liste.find(item => item.id === String(id));
  if (!entree) return repli;
  if (entree.nom !== undefined) return entree.nom;
  return (entree.libelle && (entree.libelle[langue] || entree.libelle.fr)) || repli;
}

/**
 * Texte d'une fiche dans la langue affichée : traduction saisie dans le studio,
 * repli sur le français si elle est absente ou vide (I18N.fiche du site).
 */
export function fiche<T extends { translations?: Record<string, Record<string, unknown>> }, K extends keyof T>(item: T, champ: K, langue: Langue): T[K] {
  const original = item[champ];
  if (langue === 'fr') return original;
  const valeur = item.translations?.[langue]?.[champ as string];
  if (valeur === null || valeur === undefined) return original;
  if (typeof valeur === 'string' && !valeur.trim()) return original;
  if (Array.isArray(valeur) && !valeur.length) return original;
  return valeur as T[K];
}

/** Toutes les traductions d'une fiche, pour que la recherche trouve « pool » comme « piscine ». */
const textesTraduits = (item: { translations?: Record<string, Record<string, unknown>> }) =>
  Object.values(item.translations || {}).flatMap(champs => Object.values(champs || {})).flat().filter(v => typeof v === 'string').join(' ');

// ---------------------------------------------------------------------------
// Recherche (correspondRecherche, cadreVilla)
// ---------------------------------------------------------------------------
const TRANCHES_VOYAGEURS: Record<string, [number, number]> = { '2-6': [2, 6], '8-12': [8, 12], '12+': [12, Infinity] };
const CADRES_VILLA = ['mer-lagune', 'ocean', 'lagune', 'terre'];
const CATEGORIES_LIEU = ['lagune', 'ocean'];
export const CRITERES_HORS_THEME = ['lagune', 'ocean', 'piscine'];
export const LIBELLES_CADRE: Record<string, string> = { 'mer-lagune': 'Mer & lagune', ocean: "Bord d'océan", lagune: 'Bord de lagune', terre: 'Terre ferme' };

export const criteresVides = (): Criteres => ({ cat: 'all', ville: 'all', location: 'all', budget: 'all', guests: 'all', equip: 'all', chambres: 'all' });
export const criteresTerrainsVides = (): CriteresTerrains => ({ ville: 'all', foncier: 'all' });

export function cadreVilla(villa: { environment?: string; category?: string }) {
  if (villa.environment && CADRES_VILLA.includes(villa.environment)) return villa.environment;
  if (villa.category === 'lagune') return 'lagune';
  if (villa.category === 'ocean') return 'ocean';
  return 'terre';
}

type Bien = {
  category?: string; environment?: string; localisationId?: string; pricePerNight?: number | null;
  capacity?: number | null; bedrooms?: number | null; features?: string[]; equipements?: string[];
};

export function correspondRecherche(bien: Bien, criteres: Criteres, cadreDe: (b: Bien) => string = b => b.environment || '') {
  const { cat, ville, location, budget, guests } = criteres;
  const features = Array.isArray(bien.features) ? bien.features : [];
  const hasPool = features.some(f => String(f).toLowerCase().includes('piscine'))
    || (Array.isArray(bien.equipements) && bien.equipements.includes('piscine'));

  const cadre = cadreDe(bien);
  const auBordDe = (lieu: string) => (lieu === 'lagune' && (cadre === 'lagune' || cadre === 'mer-lagune'))
    || (lieu === 'ocean' && (cadre === 'ocean' || cadre === 'mer-lagune'));
  const matchesCategory = cat === 'all' || bien.category === cat
    || (cat === 'piscine' && hasPool) || (CATEGORIES_LIEU.includes(cat) && auBordDe(cat));
  const matchesLocation = location === 'all' || auBordDe(location);

  const prix = bien.pricePerNight;
  const matchesBudget = budget === 'all' || (estNombre(prix) && (budget === 'eco' ? prix <= 250000 : prix >= 250000));

  const tranche = TRANCHES_VOYAGEURS[guests];
  const capacite = bien.capacity;
  const matchesGuests = !tranche || (estNombre(capacite) && capacite >= tranche[0] && capacite <= tranche[1]);

  const matchesVille = ville === 'all' || bien.localisationId === ville;

  const demandes = !criteres.equip || criteres.equip === 'all' ? [] : String(criteres.equip).split(',').filter(Boolean);
  const coches = Array.isArray(bien.equipements) ? bien.equipements : [];
  const matchesEquipements = demandes.every(code => coches.includes(code));

  const minimumChambres = Number(criteres.chambres);
  const matchesChambres = !criteres.chambres || criteres.chambres === 'all'
    || (estNombre(bien.bedrooms) && Number.isFinite(minimumChambres) && bien.bedrooms >= minimumChambres);

  return matchesCategory && matchesVille && matchesLocation && matchesBudget && matchesGuests && matchesEquipements && matchesChambres;
}

export function criteresPublication(post: Publication): Bien {
  const f: FichePublication = post.fiche || {};
  return {
    category: f.category || '', environment: f.environment || '', localisationId: f.localisationId || '',
    pricePerNight: f.pricePerNight ?? null, capacity: f.capacity ?? null, bedrooms: f.bedrooms ?? null,
    features: Array.isArray(f.features) ? f.features : [], equipements: Array.isArray(f.equipements) ? f.equipements : [],
  };
}

const texteVilla = (v: Villa, refs: Referentiels | null) => sansAccents([
  v.name, v.tagline, v.location, v.categoryLabel, libelle(refs, 'categories', v.category), LIBELLES_CADRE[cadreVilla(v)],
  v.description, v.beds, v.badge, ...v.features, ...v.highlights, ...(v.equipements || []).map(c => libelle(refs, 'equipements', c, c)),
  ...(v.equipements || []).flatMap(c => ['en', 'es'].map(l => libelle(refs, 'equipements', c, '', l as Langue))), textesTraduits(v),
].join(' '));
const texteTerrain = (t: Terrain) => sansAccents([t.title, t.reference, t.location, t.district, t.landStatusLabel, t.description, t.badge,
  ...t.highlights, ...t.utilities.map(u => VIABILISATION[u] || u), textesTraduits(t)].join(' '));
const texteActivite = (a: Activite) => sansAccents([a.title, a.subtitle, a.description, a.duration, a.badge, a.price, textesTraduits(a)].join(' '));
const textePublication = (p: Publication) => {
  const f = p.fiche || {};
  return sansAccents([p.message, f.name, f.tagline, f.categoryLabel, f.location, f.beds, f.badge, ...(f.features || []), ...(f.highlights || [])].join(' '));
};

/** Filtres propres à chaque rubrique : les critères de logement ne s'appliquent
 *  qu'aux résidences et publications, ceux des terrains qu'aux terrains, et les
 *  activités n'ont que la recherche texte (comme sur le site). */
export const filtresLogement = (segment: Segment) => segment === 'tout' || segment === 'villas' || segment === 'publications';
export const filtresTerrain = (segment: Segment) => segment === 'tout' || segment === 'terrains';

export function rechercher(d: Donnees, criteres: Criteres, terrains: CriteresTerrains, texte: string) {
  const mots = sansAccents(texte.trim()).split(/\s+/).filter(Boolean);
  const contient = (t: string) => mots.every(mot => t.includes(mot));
  const criteresActifs = Object.values(criteres).some(v => v !== 'all');
  return {
    villas: d.villas.filter(v => correspondRecherche(v, criteres, cadreVilla) && contient(texteVilla(v, d.refs))),
    terrains: d.terrains.filter(t => (terrains.ville === 'all' || t.localisationId === terrains.ville)
      && (terrains.foncier === 'all' || t.landStatus === terrains.foncier) && contient(texteTerrain(t))),
    activites: d.activites.filter(a => contient(texteActivite(a))),
    voitures: d.vehicules.filter(v => contient(sansAccents([v.name, v.brand, v.model, categorieVehicule(v.category, 'fr'), v.tagline].filter(Boolean).join(' ')))),
    // Publications : filtrées par les critères seulement quand il y en a (règle du catalogue).
    publications: d.publications.filter(p => (!criteresActifs || correspondRecherche(criteresPublication(p), criteres)) && contient(textePublication(p))),
  };
}

// ---------------------------------------------------------------------------
// Activités et publications
// ---------------------------------------------------------------------------
/** Copie de texteTarifActivite (db/fiches.js du site), dans la langue affichée. */
const TEXTES_TARIF: Record<Langue, Record<string, string>> = {
  fr: { personne: '/ personne', jour: '/ jour', forfait: '', groupe: 'les', surDemande: 'Tarif sur demande' },
  en: { personne: '/ person', jour: '/ day', forfait: '', groupe: 'for', surDemande: 'Price on request' },
  es: { personne: '/ persona', jour: '/ día', forfait: '', groupe: 'para', surDemande: 'Precio a consultar' },
};

export function tarifActivite(a: Activite, langue: Langue = 'fr') {
  if (a.pricePrefix === undefined && a.priceSuffix === undefined) return a.price || '';
  const mots = TEXTES_TARIF[langue];
  const traduction = (langue !== 'fr' && a.translations?.[langue]) || {};
  const mention = (champ: 'pricePrefix' | 'priceSuffix') => String((traduction as Record<string, unknown>)[champ] || a[champ] || '').trim();
  const montant = Math.round(Number(a.priceAmount) || 0);
  if (montant <= 0) return mots.surDemande;
  const unite = ['forfait', 'jour', 'personne'].includes(a.priceUnit || '') ? (a.priceUnit as string) : 'forfait';
  let texte = [mention('pricePrefix'), `${separerMilliers(montant)} FCFA`, mots[unite], mention('priceSuffix')].filter(Boolean).join(' ');
  const groupe = Math.round(Number(a.groupPriceAmount) || 0);
  const taille = Math.round(Number(a.groupSize) || 0);
  if (unite === 'personne' && groupe > 0 && taille > 1) texte += ` · ${separerMilliers(groupe)} FCFA ${mots.groupe} ${taille}`;
  return texte;
}

export const uniteActivite = (a: Activite): 'personne' | 'jour' | 'forfait' =>
  a.priceUnit === 'personne' || a.priceUnit === 'jour' ? a.priceUnit : 'forfait';

// ---------------------------------------------------------------------------
// Tri des résultats (propre à l'app : le site n'en propose pas)
// ---------------------------------------------------------------------------
export type Tri = 'recommande' | 'prixCroissant' | 'prixDecroissant' | 'taille';

/**
 * Trie une liste sans perdre l'ordre du studio à valeur égale. Une annonce
 * sans prix (ou sans taille) reste en fin de liste, quel que soit le sens.
 */
export function trier<T>(liste: T[], tri: Tri, prix: (x: T) => number | null, taille: (x: T) => number | null): T[] {
  if (tri === 'recommande') return liste;
  const valeur = tri === 'taille' ? taille : prix;
  const sens = tri === 'prixDecroissant' || tri === 'taille' ? -1 : 1;
  return liste
    .map((item, rang) => ({ item, rang, v: valeur(item) }))
    .sort((a, b) => {
      const aConnu = estNombre(a.v) && a.v > 0;
      const bConnu = estNombre(b.v) && b.v > 0;
      if (aConnu !== bConnu) return aConnu ? -1 : 1;
      if (aConnu && bConnu && a.v !== b.v) return ((a.v as number) - (b.v as number)) * sens;
      return a.rang - b.rang;
    })
    .map(x => x.item);
}

export function titrePublication(post: Publication) {
  const premiere = String(post.message || '').split('\n').map(l => l.trim()).find(l => l.length > 3);
  if (!premiere) return 'Publication de la Page';
  return premiere.length > 64 ? `${premiere.slice(0, 63).trimEnd()}…` : premiere;
}

export const photosPublication = (post: Publication) =>
  (Array.isArray(post.images) && post.images.length ? post.images : [post.full_picture]).filter((u): u is string => Boolean(u));

// ---------------------------------------------------------------------------
// Messages WhatsApp (mêmes textes que le site)
// ---------------------------------------------------------------------------
export const messageVilla = (v: Villa) =>
  `Bonjour Détente & Loisirs à Assinie ! Je souhaite avoir des informations et réserver la villa : ${v.name} (${v.location}). Pouvez-vous me confirmer les disponibilités ?`;
export const messageTerrain = (t: Terrain) =>
  `Bonjour Henri & Philippe - Détente & Loisirs ! Je suis intéressé(e) par le terrain ${t.reference || t.id} — ${t.title} (${t.location}), ${nombre(t.areaSqm)} m² au prix de ${fcfa(t.priceTotal)}. Pouvez-vous me communiquer les documents fonciers et organiser une visite ?`;
export const messageActivite = (a: Activite) =>
  `Bonjour Henri & Philippe - Détente & Loisirs ! Je souhaite réserver l'activité : ${a.title} (${a.price || tarifActivite(a)}).`;
export const messagePublication = (p: Publication) => [
  'Bonjour Détente & Loisirs à Assinie !',
  `Je vous écris au sujet de votre publication du ${dateNumerique(p.created_time)} : « ${titrePublication(p)} ».`,
  'Pouvez-vous me donner les disponibilités et les tarifs ?',
].join(' ');

// ---------------------------------------------------------------------------
// Devis (initSimulator du site)
// ---------------------------------------------------------------------------
export const VOYAGEURS = ['2', '4', '6', '8', '10', '12', '15+'];

export type Devis = {
  pret: boolean; etape: number; mode: 'sejour' | 'activites' | 'voiture'; filtre: string; villaId: string;
  arrivee: string; depart: string; voyageurs: string; activites: string[];
  /** Voiture facultative (séjour, activités) ou seule (formule « voiture »), 19/09/2026. */
  voiture: SaisieVoiture;
  nom: string; tel: string; email: string; optin: boolean; suiviNotif: boolean;
};

export const devisVide = (): Devis => ({
  pret: false, etape: 1, mode: 'sejour', filtre: 'all', villaId: '', arrivee: '', depart: '', voyageurs: '8',
  activites: [], nom: '', tel: '', email: '', optin: false, suiviNotif: true, voiture: saisieVoitureInitiale(undefined),
});

export const estIndisponible = (v: Villa) => String(v.status || '').toLowerCase() === 'indisponible';

const villaTexte = (v: Villa) => [v.features.join(' '), v.highlights.join(' '), v.tagline, v.description].join(' ').toLowerCase();
const estLagune = (v: Villa) => cadreVilla(v) === 'lagune' || cadreVilla(v) === 'mer-lagune';
const estOcean = (v: Villa) => cadreVilla(v) === 'ocean' || cadreVilla(v) === 'mer-lagune';
export const FILTRES_VILLA: { value: string; label: string; test: (v: Villa) => boolean }[] = [
  { value: 'all', label: 'Toutes', test: () => true },
  { value: 'eau', label: 'Mer & lagune', test: v => estOcean(v) || estLagune(v) },
  { value: 'ocean', label: 'Bord de mer', test: estOcean },
  { value: 'lagune', label: 'Bord de lagune', test: estLagune },
  { value: 'piscine', label: 'Avec piscine', test: v => (Array.isArray(v.equipements) && v.equipements.includes('piscine')) || /piscine/.test(villaTexte(v)) },
  { value: 'terre', label: 'Terre ferme', test: v => cadreVilla(v) === 'terre' },
];

export function villasFiltrees(villas: Villa[], filtre: string) {
  const critere = FILTRES_VILLA.find(f => f.value === filtre) || FILTRES_VILLA[0];
  const liste = villas.filter(critere.test);
  return liste.length ? liste : villas;
}

/**
 * Valeurs de départ du simulateur : vendredi prochain → dimanche. Rien n'est
 * choisi d'office : ni activité (19/09/2026), ni résidence (21/09/2026) — la
 * première résidence s'ajoutait à l'estimation sans que le client l'ait choisie.
 */
export function preparerDevis(d: Donnees, actuel: Devis, coordonnees: { nom?: string; tel?: string; email?: string }): Devis {
  if (actuel.pret) return actuel;
  const aujourdhui = new Date();
  const vendredi = new Date();
  vendredi.setDate(aujourdhui.getDate() + ((7 - aujourdhui.getDay() + 5) % 7 || 7));
  const dimanche = new Date(vendredi);
  dimanche.setDate(vendredi.getDate() + 2);
  return {
    ...actuel,
    pret: true,
    // Dates déjà choisies (formulaire de recherche de l'accueil) : conservées.
    arrivee: actuel.arrivee || dateISO(vendredi),
    depart: actuel.depart || dateISO(dimanche),
    mode: d.villas.length || actuel.mode === 'voiture' ? actuel.mode : 'activites',
    // Horaires, délai et lieux de la location connus : dates et lieu par défaut.
    voiture: { ...saisieVoitureInitiale(d.location), vehiculeId: actuel.voiture.vehiculeId, chauffeur: actuel.voiture.chauffeur },
    nom: actuel.nom || coordonnees.nom || '',
    tel: actuel.tel || coordonnees.tel || '',
    email: actuel.email || coordonnees.email || '',
  };
}

/**
 * Choix encore valables dans une autre formule : les activités hors « Voiture
 * seule », la voiture partout. La résidence n'appartient qu'au séjour.
 */
export function choixCompatibles(devis: Devis, mode: Devis['mode']) {
  return { activites: mode === 'voiture' ? [] : devis.activites, vehiculeId: devis.voiture.vehiculeId };
}

/**
 * Changement de formule (21/09/2026). `garder` : les choix compatibles sont
 * repris tels quels ; sinon l'estimation repart de zéro (dates, voyageurs et
 * coordonnées restent). Dans les deux cas, rien d'incompatible ne reste caché
 * dans le devis pour réapparaître au retour sur l'ancienne formule.
 */
export function changerFormule(d: Donnees, devis: Devis, mode: Devis['mode'], garder: boolean): Partial<Devis> {
  const repris = choixCompatibles(devis, mode);
  return {
    mode,
    villaId: '',
    activites: garder ? repris.activites : [],
    voiture: garder && repris.vehiculeId ? devis.voiture : saisieVoitureInitiale(d.location),
  };
}

/** « Tout effacer » et après un envoi : plus aucun choix chiffré, la formule reste. */
export const choixEffaces = (d: Donnees): Partial<Devis> => ({ villaId: '', activites: [], voiture: saisieVoitureInitiale(d.location) });

type Prix ={ montant: number; parJour: boolean; parPersonne: boolean; forfaitGroupe: { montant: number; taille: number } | null };

export function prixActivite(item: Activite): Prix {
  const groupe = Number(item.groupPriceAmount) || 0;
  const taille = Number(item.groupSize) || 0;
  const forfaitGroupe = groupe > 0 && taille > 1 ? { montant: groupe, taille } : null;
  const montantSaisi = Number(item.priceAmount) || 0;
  if (montantSaisi > 0) {
    const unite = item.priceUnit || 'forfait';
    return { montant: montantSaisi, parJour: unite === 'jour', parPersonne: unite === 'personne', forfaitGroupe };
  }
  const texte = String(item.price || '');
  const montant = Number((texte.match(/\d[\d\s  ]*/)?.[0] || '0').replace(/[\s  ]/g, ''));
  return {
    montant: Number.isFinite(montant) ? montant : 0,
    parJour: /\/\s*(jour|nuit|journ[ée]e)|par\s+(jour|nuit|journ[ée]e)/i.test(texte),
    parPersonne: /\/\s*personne|par\s+personne/i.test(texte),
    forfaitGroupe,
  };
}

function coutParPersonne(prix: Prix, personnes: number, t?: Traduire) {
  const plein = prix.montant * personnes;
  const f = prix.forfaitGroupe;
  const detailPlein = t ? t('devis.calcPers', { x: fcfa(prix.montant), n: personnes }) : `${fcfa(prix.montant)} × ${personnes} pers.`;
  if (!f || personnes < f.taille) return { total: plein, detail: detailPlein };
  const lots = Math.floor(personnes / f.taille);
  const reste = personnes % f.taille;
  const total = lots * f.montant + reste * prix.montant;
  if (total >= plein) return { total: plein, detail: detailPlein };
  const morceaux = [t ? t('devis.calcLot', { lots, taille: f.taille, x: fcfa(f.montant) }) : `${lots} × forfait ${f.taille} pers. (${fcfa(f.montant)})`];
  if (reste) morceaux.push(`${reste} × ${fcfa(prix.montant)}`);
  return { total, detail: morceaux.join(' + ') };
}

/**
 * Voiture du devis : véhicule choisi, saisie (dates du séjour reprises tant
 * qu'elles n'ont pas été changées à la main) et estimation.
 */
export function voitureDuDevis(d: Donnees, devis: Devis) {
  const vehicule = d.vehicules.find(v => v.id === devis.voiture.vehiculeId) || null;
  const saisie = saisieAvecSejour(devis.voiture, devis.mode === 'voiture' ? null : { arrivee: devis.arrivee, depart: devis.depart });
  const estimation = vehicule ? devisLocation(vehicule, d.location, demandeDeSaisie(saisie)) : null;
  return { vehicule, saisie, estimation };
}

/**
 * `t` et `langue` ne servent qu'au récapitulatif affiché. Le message WhatsApp
 * et la demande enregistrée restent en français, comme ceux du site.
 * `appareil` : jeton de notification, joint quand le client veut être prévenu du suivi.
 * Formules (19/09/2026) : séjour (+ activités, + voiture), activités (+ voiture),
 * voiture seule. UNE seule demande : la voiture y est jointe (`location`), le
 * serveur recalcule son prix et crée sa réservation dans le planning.
 */
export function calculDevis(d: Donnees, devis: Devis, reglages: { t?: Traduire; langue?: Langue; appareil?: string | null } = {}) {
  const { t, langue = 'fr', appareil } = reglages;
  const voitureSeule = devis.mode === 'voiture';
  const sansResidence = devis.mode !== 'sejour';
  // Pas de repli sur la première résidence : sans choix du client, le séjour vaut zéro.
  const villa = sansResidence ? null : (d.villas.find(v => v.id === devis.villaId) || null);
  let jours = Math.ceil((new Date(devis.depart).getTime() - new Date(devis.arrivee).getTime()) / 86400000);
  if (Number.isNaN(jours) || jours < 1) jours = 1;
  const sousTotalVilla = sansResidence || !villa ? 0 : villa.pricePerNight * jours;
  const personnes = parseInt(devis.voyageurs, 10) || 1;

  let totalActivites = 0;
  const options: string[] = [];
  const lignes: { libelle: string; calcul: string; montant: number | null }[] = [];
  d.activites.forEach(item => {
    if (voitureSeule || !devis.activites.includes(item.id)) return;
    const prix = prixActivite(item);
    const titre = fiche(item, 'title', langue);
    if (prix.montant <= 0) {
      options.push(`${item.title} (sur devis)`);
      lignes.push({ libelle: titre, calcul: t ? t('devis.calcSurDevis') : 'sur devis', montant: null });
    } else if (prix.parJour) {
      const total = prix.montant * jours;
      totalActivites += total;
      options.push(`${item.title} (${jours}j)`);
      lignes.push({ libelle: titre, calcul: t ? t('devis.calcJours', { x: fcfa(prix.montant), n: jours }) : `${fcfa(prix.montant)} × ${jours} j`, montant: total });
    } else if (prix.parPersonne) {
      const { total, detail } = coutParPersonne(prix, personnes, t);
      totalActivites += total;
      options.push(`${item.title} (${personnes} pers.)`);
      lignes.push({ libelle: titre, calcul: detail, montant: total });
    } else {
      totalActivites += prix.montant;
      options.push(item.title);
      lignes.push({ libelle: titre, calcul: t ? t('devis.calcForfait') : 'forfait', montant: prix.montant });
    }
  });

  const { vehicule, saisie, estimation } = voitureDuDevis(d, devis);
  const avecVoiture = Boolean(vehicule && estimation);
  const montantVoiture = estimation?.ok ? estimation.total : 0;
  const total = sousTotalVilla + totalActivites + montantVoiture;
  const totalEuro = total / TAUX_EUR;
  const nom = devis.nom.trim();
  const tel = devis.tel.trim();
  const email = devis.email.trim();
  const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const lignesContact = [nom ? `👤 Nom : ${nom}` : '', tel ? `📞 WhatsApp : ${tel}` : '', email ? `✉️ E-mail : ${email}` : '']
    .filter(Boolean).map(l => `${l}\n`).join('');
  const joursVoiture = estimation?.jours || 0;
  const periodeVoiture = `Du ${saisie.debutJour} ${saisie.debutHeure} au ${saisie.finJour} ${saisie.finHeure} (${joursVoiture} jour${joursVoiture > 1 ? 's' : ''})`;
  const formuleVoiture = estimation?.chauffeur ? 'avec chauffeur' : 'sans chauffeur';
  const ligneVoiture = vehicule && estimation
    ? `🚗 Voiture : ${vehicule.name}, ${formuleVoiture}\n🗓️ ${periodeVoiture} : ${estimation.ok ? fcfa(estimation.total) : 'à préciser'}\n`
      + (estimation.lieuPrise ? `📍 Prise en charge : ${estimation.lieuPrise.nom}${estimation.adressePrise ? ` — ${estimation.adressePrise}` : ''}\n` : '')
      + (estimation.lieuRetour && estimation.adresseRetour ? `📍 Retour : ${estimation.lieuRetour.nom} — ${estimation.adresseRetour}\n` : '')
    : '';
  const entete = voitureSeule
    ? '✨ Demande de Location de Voiture - Détente & Loisirs à Assinie ✨'
    : sansResidence
      ? '✨ Demande d’Activités - Détente & Loisirs à Assinie ✨'
      : '✨ Demande de Réservation - Détente & Loisirs à Assinie ✨';
  const ligneSejour = voitureSeule
    ? ''
    : sansResidence
      ? `🎯 Formule : Activités uniquement (sans hébergement)\n📅 Dates : Du ${devis.arrivee} au ${devis.depart} (${jours} journée${jours > 1 ? 's' : ''})\n`
      : `📍 Résidence : ${villa ? villa.name : ''}\n📅 Dates : Du ${devis.arrivee} au ${devis.depart} (${jours} nuit${jours > 1 ? 's' : ''})\n`;
  const cloture = voitureSeule
    ? 'Pouvez-vous me confirmer la disponibilité du véhicule ? Merci !'
    : sansResidence
      ? 'Pouvez-vous me confirmer la disponibilité de ces activités ? Merci !'
      : 'Pouvez-vous me confirmer la disponibilité pour ces dates ? Merci !';
  const lignesSejour = voitureSeule ? '' : `👥 Voyageurs : ${devis.voyageurs} personnes
🎁 Options choisies : ${options.length > 0 ? options.join(', ') : 'Aucune'}
`;
  const message = `${entete}
━━━━━━━━━━━━━━━━━━━━━
${lignesContact}${ligneSejour}${lignesSejour}${ligneVoiture}💰 Estimation Totale : ${fcfa(total)} (${euro(totalEuro)})
━━━━━━━━━━━━━━━━━━━━━
${cloture}`;

  return {
    voitureSeule, sansResidence, villa, jours, personnes, sousTotalVilla, totalActivites, lignes, total, totalEuro,
    voiture: avecVoiture && vehicule && estimation ? { vehicule, saisie, estimation, montant: montantVoiture } : null,
    lien: lienWhatsApp(message),
    // Même contenu que la demande du simulateur du site (POST /api/leads).
    lead: {
      type: voitureSeule ? 'location-voiture' : sansResidence ? 'devis-activites' : 'devis-whatsapp',
      name: nom, phone: tel, email: emailValide ? email : '',
      whatsappOptIn: devis.optin,
      villa: voitureSeule ? '' : sansResidence ? 'Activités uniquement' : (villa ? villa.name : ''),
      dates: voitureSeule ? `${saisie.debutJour} ${saisie.debutHeure} → ${saisie.finJour} ${saisie.finHeure}` : `${devis.arrivee} → ${devis.depart}`,
      amount: total,
      message: voitureSeule ? '' : `${devis.voyageurs} voyageur(s) · ${options.join(', ') || 'Sans option'}`,
      source: 'app',
      ...(vehicule ? {
        location: { vehicule: vehicule.id, ...demandeDeSaisie(saisie), conditionsConducteur: saisie.attestation, montant: montantVoiture },
      } : {}),
      ...(appareil ? { appareil, langue } : {}),
    },
  };
}

/** Nom et téléphone obligatoires (décision du 13/09/2026) ; e-mail facultatif. */
export function champEnDefaut(devis: Devis): 'nom' | 'tel' | null {
  if (!devis.nom.trim()) return 'nom';
  if (devis.tel.replace(/\D/g, '').length < 8) return 'tel';
  return null;
}
