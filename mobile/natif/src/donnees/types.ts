/** Formes des données de /api/content (champs utilisés par l'app). */

export type Libelles = { fr?: string; en?: string; es?: string };
/** Avis des visiteurs (ajouté par le site à chaque annonce) : J'aime, moyenne des notes, nombre d'avis. */
export type ResumeAvis = { likes: number; note: number | null; nombre: number };
/** Traductions saisies dans le studio : { en: { title: '…' }, es: { … } }. */
export type Traductions = Record<string, Record<string, unknown>>;
export type EntreeReferentiel = { id: string; nom?: string; libelle?: Libelles; ordre?: number; actif?: boolean; cible?: string; code?: string };
export type Referentiels = {
  localisations?: EntreeReferentiel[];
  categories?: EntreeReferentiel[];
  equipements?: EntreeReferentiel[];
  badges?: EntreeReferentiel[];
  statuts?: EntreeReferentiel[];
};

export type Villa = {
  id: string; name: string; tagline?: string; category?: string; categoryLabel?: string; environment?: string;
  location?: string; localisationId?: string; badgeId?: string; badge?: string; equipements?: string[];
  description?: string; pricePerNight: number; priceEuro: number; weekendPackage: number;
  /** Tarif de la villa entière (défaut) ou d'une chambre, par nuit (21/09/2026). */
  priceUnit?: 'villa' | 'chambre';
  capacity: number; bedrooms: number; bathrooms: number; beds?: string; status?: string;
  visible?: boolean; featured?: boolean; rating: number; reviewsCount: number;
  images: string[]; features: string[]; highlights: string[];
  translations?: Traductions; avis?: ResumeAvis;
};

export type Terrain = {
  id: string; reference: string; title: string; location: string; localisationId?: string; district: string;
  areaSqm: number; priceTotal: number; pricePerSqm: number; priceEuro: number;
  landStatus: string; landStatusLabel: string; utilities: string[]; status: string;
  description?: string; images: string[]; highlights: string[]; visible?: boolean; featured?: boolean;
  badge?: string; badgeId?: string; latitude?: number | null; longitude?: number | null;
  translations?: Traductions; avis?: ResumeAvis;
};

export type Activite = {
  id: string; title: string; subtitle?: string; description?: string; image: string; images: string[];
  duration?: string; price?: string; priceAmount?: number; groupPriceAmount?: number; groupSize?: number;
  priceUnit?: string; pricePrefix?: string; priceSuffix?: string; badge?: string; badgeId?: string;
  visible?: boolean; featured?: boolean;
  translations?: Traductions; avis?: ResumeAvis;
};

/** Véhicule de location (17/09/2026) : mêmes champs que le studio et le site. */
export type Vehicule = {
  id: string; name: string; brand?: string; model?: string; year?: number | null; category: string;
  transmission: string; fuel: string; seats: number; doors: number; luggage: number; airConditioning: boolean;
  driverMode: 'avec' | 'sans' | 'choix'; pricePerDay: number; pricePerDayWeek: number; pricePerDayMonth: number;
  driverPricePerDay: number; deposit: number; minAge: number; licenseYears: number;
  kmIncludedPerDay: number; extraKmPrice: number; minDays: number;
  tagline?: string; description?: string; features: string[]; images: string[];
  badge?: string; badgeId?: string; visible?: boolean; featured?: boolean;
  translations?: Traductions; avis?: ResumeAvis;
};
/** `precision` : lieu « à préciser » (domicile, bureau, autre), le client indique l'adresse. */
export type LieuLocation = { id: string; nom: string; frais: number; actif: boolean; precision?: boolean };
export type OptionLocation = { id: string; nom: string; prix: number; unite: 'jour' | 'location'; actif: boolean };
export type ReglagesLocation = {
  lieux: LieuLocation[]; options: OptionLocation[]; heureOuverture: string; heureFermeture: string;
  delaiMinHeures: number; battementHeures: number; conditions: { fr: string; en: string; es: string };
};

export type FichePublication = {
  name?: string; tagline?: string; category?: string; categoryLabel?: string; environment?: string; location?: string;
  pricePerNight?: number | null; capacity?: number | null; bedrooms?: number | null; bathrooms?: number | null;
  beds?: string; badge?: string; features?: string[]; highlights?: string[]; localisationId?: string; equipements?: string[];
};

export type Publication = {
  id: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string;
  images?: string[]; fiche?: FichePublication; video?: { url?: string; vertical?: boolean } | null;
};

export type Avis = { id: string; author?: string; city?: string; stay?: string; rating?: number; date?: string; comment?: string };
export type Faq = { id: string; q: string; a: string };
export type Reglages = { officeHours?: string; phone?: string; facebookPage?: string };

export type Donnees = {
  villas: Villa[];
  terrains: Terrain[];
  activites: Activite[];
  vehicules: Vehicule[];
  /** Lieux de prise en charge, options, horaires et conditions de la location de voitures. */
  location: ReglagesLocation;
  publications: Publication[];
  avis: Avis[];
  faq: Faq[];
  refs: Referentiels | null;
  reglages: Reglages;
};

export type TypeAnnonce = 'villa' | 'terrain' | 'activite' | 'vehicule' | 'publication';

export type Criteres = { cat: string; ville: string; location: string; budget: string; guests: string; equip: string; chambres: string };
export type CriteresTerrains = { ville: string; foncier: string };
export type Segment = 'tout' | 'villas' | 'terrains' | 'activites' | 'voitures' | 'publications';

export type Manifeste = Record<string, { webp?: Record<string, string>; width?: number; height?: number }>;
