/**
 * Location de voitures : copie fidèle des règles du site (js/location-voitures.js).
 * Le serveur recalcule l'estimation à l'envoi : toute évolution côté site doit
 * être reportée ici.
 *
 * Heures toujours à l'heure d'Abidjan (UTC+0, sans heure d'été) : un touriste
 * qui réserve depuis l'Europe saisit l'heure locale de la prise en charge.
 */
import type { Langue } from './i18n';
import type { ReglagesLocation, Vehicule } from './types';

type Libelles = Record<Langue, string>;

export const CATEGORIES_VEHICULE: { id: string; libelle: Libelles }[] = [
  { id: 'citadine', libelle: { fr: 'Citadine', en: 'City car', es: 'Urbano' } },
  { id: 'berline', libelle: { fr: 'Berline', en: 'Sedan', es: 'Berlina' } },
  { id: 'suv', libelle: { fr: 'SUV', en: 'SUV', es: 'SUV' } },
  { id: '4x4', libelle: { fr: '4x4 tout-terrain', en: '4x4 off-road', es: '4x4 todoterreno' } },
  { id: 'minibus', libelle: { fr: 'Minibus', en: 'Minibus', es: 'Minibús' } },
  { id: 'pickup', libelle: { fr: 'Pick-up', en: 'Pickup truck', es: 'Pick-up' } },
  { id: 'prestige', libelle: { fr: 'Prestige', en: 'Luxury', es: 'Lujo' } },
];
export const BOITES: Record<string, Libelles> = {
  automatique: { fr: 'Automatique', en: 'Automatic', es: 'Automática' },
  manuelle: { fr: 'Manuelle', en: 'Manual', es: 'Manual' },
};
export const CARBURANTS: Record<string, Libelles> = {
  essence: { fr: 'Essence', en: 'Petrol', es: 'Gasolina' },
  diesel: { fr: 'Diesel', en: 'Diesel', es: 'Diésel' },
  hybride: { fr: 'Hybride', en: 'Hybrid', es: 'Híbrido' },
  electrique: { fr: 'Électrique', en: 'Electric', es: 'Eléctrico' },
};
export const MODES_CHAUFFEUR: Record<string, Libelles> = {
  avec: { fr: 'Avec chauffeur', en: 'With driver', es: 'Con chófer' },
  sans: { fr: 'Sans chauffeur', en: 'Self-drive', es: 'Sin chófer' },
  choix: { fr: 'Avec ou sans chauffeur', en: 'With or without driver', es: 'Con o sin chófer' },
};

const TOLERANCE_MINUTES = 59;
export const JOURS_SEMAINE = 7;
export const JOURS_MOIS = 30;
export const DUREE_MAX_JOURS = 90;

export const categorieVehicule = (id: string, langue: Langue) => CATEGORIES_VEHICULE.find(c => c.id === id)?.libelle[langue] || id;
export const boiteVehicule = (id: string, langue: Langue) => BOITES[id]?.[langue] || id;
export const carburantVehicule = (id: string, langue: Langue) => CARBURANTS[id]?.[langue] || id;
export const modeChauffeur = (id: string, langue: Langue) => MODES_CHAUFFEUR[id]?.[langue] || id;

const montant = (valeur: unknown) => Math.max(0, Math.round(Number(valeur) || 0));
const entier = (valeur: unknown, min: number, max: number, repli: number) => {
  const n = Math.round(Number(valeur));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli;
};

export const REGLAGES_INITIAUX: ReglagesLocation = {
  lieux: [{ id: 'agence', nom: 'Agence Détente & Loisirs (Assinie)', frais: 0, actif: true }],
  options: [],
  heureOuverture: '07:00', heureFermeture: '20:00', delaiMinHeures: 12, battementHeures: 2,
  conditions: { fr: '', en: '', es: '' },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normaliserReglages(source: any): ReglagesLocation {
  const r = source && typeof source === 'object' ? source : {};
  const heure = (v: unknown, repli: string) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : repli);
  return {
    lieux: (Array.isArray(r.lieux) ? r.lieux : REGLAGES_INITIAUX.lieux).filter((l: any) => l && l.id)
      .map((l: any) => ({ id: String(l.id), nom: String(l.nom || l.id), frais: montant(l.frais), actif: l.actif !== false })),
    options: (Array.isArray(r.options) ? r.options : []).filter((o: any) => o && o.id)
      .map((o: any) => ({ id: String(o.id), nom: String(o.nom || o.id), prix: montant(o.prix), unite: o.unite === 'location' ? 'location' : 'jour', actif: o.actif !== false })),
    heureOuverture: heure(r.heureOuverture, REGLAGES_INITIAUX.heureOuverture),
    heureFermeture: heure(r.heureFermeture, REGLAGES_INITIAUX.heureFermeture),
    delaiMinHeures: entier(r.delaiMinHeures, 0, 168, REGLAGES_INITIAUX.delaiMinHeures),
    battementHeures: entier(r.battementHeures, 0, 48, REGLAGES_INITIAUX.battementHeures),
    conditions: { fr: String(r.conditions?.fr || ''), en: String(r.conditions?.en || ''), es: String(r.conditions?.es || '') },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** « AAAA-MM-JJTHH:MM » à l'heure d'Abidjan (UTC), ou ISO complet. */
export function dateHeure(valeur: string | Date | null | undefined): Date | null {
  if (valeur instanceof Date) return Number.isFinite(valeur.getTime()) ? valeur : null;
  const brut = String(valeur || '').trim();
  if (!brut) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(brut);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(brut);
  return Number.isFinite(d.getTime()) ? d : null;
}

const minutesDuJour = (texte: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texte);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function joursLocation(debut: string | Date, fin: string | Date) {
  const a = dateHeure(debut);
  const b = dateHeure(fin);
  if (!a || !b || b <= a) return 0;
  return Math.max(1, Math.ceil(((b.getTime() - a.getTime()) / 60000 - TOLERANCE_MINUTES) / 1440));
}

export function tarifApplicable(v: Partial<Vehicule> | null, jours: number) {
  const jour = montant(v?.pricePerDay);
  const semaine = montant(v?.pricePerDayWeek);
  const mois = montant(v?.pricePerDayMonth);
  if (jours >= JOURS_MOIS && mois > 0) return { palier: 'mois' as const, tarifJour: mois };
  if (jours >= JOURS_SEMAINE && semaine > 0) return { palier: 'semaine' as const, tarifJour: semaine };
  return { palier: 'jour' as const, tarifJour: jour };
}

export function prixAPartirDe(v: Partial<Vehicule> | null) {
  const tarifs = [v?.pricePerDay, v?.pricePerDayWeek, v?.pricePerDayMonth].map(montant).filter(t => t > 0);
  return tarifs.length ? Math.min(...tarifs) : 0;
}

export function avecChauffeur(v: Partial<Vehicule> | null, choixClient: boolean) {
  if (v?.driverMode === 'avec') return true;
  if (v?.driverMode === 'sans') return false;
  return Boolean(choixClient);
}

export type CodeErreurLocation = 'vehicule' | 'dates' | 'ordre' | 'delai' | 'duree' | 'minimum' | 'horaires' | 'lieu' | 'tarif';
export type LigneDevisLocation = {
  cle: 'vehicule' | 'chauffeur' | 'livraison' | 'option'; quantite: number; prixUnitaire: number; montant: number;
  palier?: 'jour' | 'semaine' | 'mois'; id?: string; nom?: string; sens?: 'prise' | 'retour'; unite?: 'jour' | 'location';
};
export type DemandeLocation = { debut: string; fin: string; lieuPrise: string; lieuRetour: string; chauffeur: boolean; options: string[] };

/** Estimation d'une location, identique à celle du site et du serveur. */
export function devisLocation(v: Vehicule | null, reglagesBruts: unknown, d: DemandeLocation, maintenant = new Date()) {
  const reglages = normaliserReglages(reglagesBruts);
  const erreurs: CodeErreurLocation[] = [];
  const debut = dateHeure(d.debut);
  const fin = dateHeure(d.fin);
  if (!v) erreurs.push('vehicule');
  if (!debut || !fin) erreurs.push('dates');
  else if (fin <= debut) erreurs.push('ordre');
  const jours = debut && fin ? joursLocation(debut, fin) : 0;
  if (debut && debut.getTime() < maintenant.getTime() + reglages.delaiMinHeures * 3600000) erreurs.push('delai');
  if (jours > DUREE_MAX_JOURS) erreurs.push('duree');
  const minDays = entier(v?.minDays, 1, 30, 1);
  if (v && jours && jours < minDays) erreurs.push('minimum');
  const ouverture = minutesDuJour(reglages.heureOuverture);
  const fermeture = minutesDuJour(reglages.heureFermeture);
  const hors = (date: Date | null) => {
    if (!date || ouverture === null || fermeture === null) return false;
    const m = date.getUTCHours() * 60 + date.getUTCMinutes();
    return m < ouverture || m > fermeture;
  };
  if (hors(debut) || hors(fin)) erreurs.push('horaires');
  const lieux = reglages.lieux.filter(l => l.actif);
  const prise = lieux.find(l => l.id === d.lieuPrise) || null;
  const retour = lieux.find(l => l.id === d.lieuRetour) || null;
  if (lieux.length && (!prise || !retour)) erreurs.push('lieu');
  const chauffeur = avecChauffeur(v, d.chauffeur);
  const { palier, tarifJour } = tarifApplicable(v, jours);
  if (v && !(tarifJour > 0)) erreurs.push('tarif');

  const lignes: LigneDevisLocation[] = [];
  if (jours && tarifJour) lignes.push({ cle: 'vehicule', palier, quantite: jours, prixUnitaire: tarifJour, montant: jours * tarifJour });
  const tarifChauffeur = montant(v?.driverPricePerDay);
  if (chauffeur && jours && tarifChauffeur) lignes.push({ cle: 'chauffeur', quantite: jours, prixUnitaire: tarifChauffeur, montant: jours * tarifChauffeur });
  if (prise && prise.frais) lignes.push({ cle: 'livraison', id: prise.id, nom: prise.nom, sens: 'prise', quantite: 1, prixUnitaire: prise.frais, montant: prise.frais });
  if (retour && retour.frais) lignes.push({ cle: 'livraison', id: retour.id, nom: retour.nom, sens: 'retour', quantite: 1, prixUnitaire: retour.frais, montant: retour.frais });
  for (const o of reglages.options.filter(o => o.actif && d.options.includes(o.id))) {
    const quantite = o.unite === 'jour' ? jours : 1;
    if (quantite) lignes.push({ cle: 'option', id: o.id, nom: o.nom, unite: o.unite, quantite, prixUnitaire: o.prix, montant: quantite * o.prix });
  }
  const kmParJour = montant(v?.kmIncludedPerDay);
  return {
    ok: erreurs.length === 0, erreurs, jours, palier, tarifJour, chauffeur, lignes,
    total: lignes.reduce((s, l) => s + l.montant, 0),
    caution: chauffeur ? 0 : montant(v?.deposit),
    kmInclus: kmParJour ? kmParJour * jours : null,
    debut: debut ? debut.toISOString() : null,
    fin: fin ? fin.toISOString() : null,
  };
}

/** Une période occupée (réservation confirmée ou indisponibilité) chevauche-t-elle la demande ? */
export function conflitLocation(occupations: { debut: string; fin: string }[], debut: string | null, fin: string | null) {
  if (!debut || !fin) return null;
  const a = new Date(debut).getTime();
  const b = new Date(fin).getTime();
  return occupations.find(o => new Date(o.debut).getTime() < b && a < new Date(o.fin).getTime()) || null;
}

/** Créneaux proposés : toutes les 30 min entre l'ouverture et la fermeture. */
export function creneaux(reglages: ReglagesLocation) {
  const debut = minutesDuJour(reglages.heureOuverture) ?? 420;
  const fin = minutesDuJour(reglages.heureFermeture) ?? 1200;
  const liste: string[] = [];
  for (let m = debut; m <= fin; m += 30) liste.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return liste;
}
