/**
 * État partagé de l'app : annonces (API du site + cache hors ligne), favoris,
 * recherche en cours, devis en préparation, et profil (coordonnées et
 * historique des demandes, conservés sur le téléphone uniquement).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { retirerAbonnement, synchroniserAbonnement } from './abonnement';
import { oublierVisiteur } from './avis';
import { API } from './config';
import { afficherNotification } from './notifications';
import { executerVeille } from './veille';
import {
  criteresTerrainsVides, criteresVides, devisVide, lireContenu, preparerDevis, type Devis, type Tri,
} from './regles';
import type { Criteres, CriteresTerrains, Donnees, Manifeste, ResumeAvis, Segment, TypeAnnonce } from './types';

const CLES = {
  contenu: 'dl:contenu:v1',
  manifeste: 'dl:images:v1',
  favoris: 'dl:favoris',
  coordonnees: 'dl:coordonnees',
  historique: 'dl:historique',
};

type Recherche = { texte: string; segment: Segment; criteres: Criteres; terrains: CriteresTerrains; focus: number; tri: Tri };
export type Coordonnees = { nom: string; tel: string; email: string };
/**
 * Demande envoyée depuis ce téléphone (écran « Mes demandes »).
 * `id` : identifiant renvoyé par le site, qui permet de suivre le `statut`
 * (nouveau, contacte, confirme, archive) ; `suivi` : notification souhaitée.
 */
export type DemandeEnvoyee = {
  le: string; objet: string; dates: string; voyageurs: string; total: string; enregistree: boolean; lien: string;
  id?: string; statut?: string; suivi?: boolean;
};

type Magasin = {
  donnees: Donnees | null;
  manifeste: Manifeste | null;
  horsLigne: boolean;
  majLe: string | null;
  actualisation: boolean;
  demarre: boolean;
  actualiser: () => Promise<boolean>;
  favoris: string[];
  basculerFavori: (cle: string) => boolean;
  recherche: Recherche;
  majRecherche: (modif: Partial<Recherche>) => void;
  devis: Devis;
  majDevis: (modif: Partial<Devis> | ((d: Devis) => Partial<Devis>)) => void;
  coordonnees: Coordonnees;
  enregistrerCoordonnees: (valeurs: Coordonnees) => void;
  memoriserCoordonnees: () => void;
  historique: DemandeEnvoyee[];
  ajouterDemande: (demande: DemandeEnvoyee) => void;
  /** Demande au site le statut à jour des demandes enregistrées. */
  actualiserStatuts: () => Promise<boolean>;
  effacerDonneesPersonnelles: () => void;
  /** Après un « J'aime » ou un avis : les cartes de la liste affichent aussitôt les nouveaux compteurs. */
  majResumeAvis: (type: TypeAnnonce, id: string, resume: ResumeAvis) => void;
};

const Contexte = createContext<Magasin | null>(null);
const COORDONNEES_VIDES: Coordonnees = { nom: '', tel: '', email: '' };

const avecDelai = <T,>(promesse: Promise<T>, ms: number) =>
  Promise.race([promesse, new Promise<T>((_, rejet) => setTimeout(() => rejet(new Error('délai dépassé')), ms))]);

async function lireJSON(adresse: string) {
  const reponse = await fetch(adresse, { headers: { Accept: 'application/json' } });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return reponse.json();
}

async function lireStockage<T>(cle: string, repli: T): Promise<T> {
  try {
    const brut = await AsyncStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : repli;
  } catch {
    return repli;
  }
}
const ecrireStockage = (cle: string, valeur: unknown) => AsyncStorage.setItem(cle, JSON.stringify(valeur)).catch(() => {});

export function FournisseurMagasin({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [manifeste, setManifeste] = useState<Manifeste | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [majLe, setMajLe] = useState<string | null>(null);
  const [actualisation, setActualisation] = useState(false);
  const [demarre, setDemarre] = useState(false);
  const [favoris, setFavoris] = useState<string[]>([]);
  const [recherche, setRecherche] = useState<Recherche>({ texte: '', segment: 'tout', criteres: criteresVides(), terrains: criteresTerrainsVides(), focus: 0, tri: 'recommande' });
  const [devis, setDevis] = useState<Devis>(devisVide());
  const [coordonnees, setCoordonnees] = useState<Coordonnees>(COORDONNEES_VIDES);
  const [historique, setHistorique] = useState<DemandeEnvoyee[]>([]);

  const actualiser = useCallback(async () => {
    setActualisation(true);
    try {
      const [contenu, images] = await Promise.all([
        avecDelai(lireJSON(`${API}/api/content`), 15000),
        avecDelai(lireJSON(`${API}/data/image-manifest.json`), 15000).catch(() => null),
      ]);
      const lues = lireContenu(contenu);
      const maintenant = new Date().toISOString();
      setDonnees(lues);
      setHorsLigne(false);
      setMajLe(maintenant);
      ecrireStockage(CLES.contenu, { enregistreLe: maintenant, contenu });
      if (images && typeof images === 'object') {
        setManifeste(images);
        ecrireStockage(CLES.manifeste, images);
      }
      // Veille des notifications (nouvelles annonces, suivi des demandes).
      executerVeille(afficherNotification, contenu)
        .then(histo => { if (histo) setHistorique(histo as DemandeEnvoyee[]); })
        .catch(() => {});
      return true;
    } catch {
      setHorsLigne(true);
      return false;
    } finally {
      setActualisation(false);
    }
  }, []);

  // Démarrage : annonces enregistrées d'abord (affichage immédiat, hors ligne
  // compris), puis mise à jour depuis le site.
  useEffect(() => {
    let annule = false;
    (async () => {
      const [cache, images, favorisLus, coord, histo] = await Promise.all([
        lireStockage<{ enregistreLe?: string; contenu?: unknown } | null>(CLES.contenu, null),
        lireStockage<Manifeste | null>(CLES.manifeste, null),
        lireStockage<string[]>(CLES.favoris, []),
        lireStockage<Partial<Coordonnees>>(CLES.coordonnees, {}),
        lireStockage<DemandeEnvoyee[]>(CLES.historique, []),
      ]);
      if (annule) return;
      setCoordonnees({ ...COORDONNEES_VIDES, ...(coord || {}) });
      setFavoris(Array.isArray(favorisLus) ? favorisLus : []);
      setHistorique(Array.isArray(histo) ? histo : []);
      if (images) setManifeste(images);
      if (cache && cache.contenu) {
        try {
          setDonnees(lireContenu(cache.contenu));
          setMajLe(cache.enregistreLe || null);
        } catch { /* cache illisible : ignoré */ }
      }
      setDemarre(true);
      actualiser();
    })();
    return () => { annule = true; };
  }, [actualiser]);

  // Le devis prend ses valeurs de départ dès que les annonces et le profil sont connus.
  useEffect(() => {
    if (donnees && demarre && !devis.pret) setDevis(actuel => preparerDevis(donnees, actuel, coordonnees));
  }, [donnees, demarre, devis.pret, coordonnees]);

  const basculerFavori = useCallback((cle: string) => {
    const ajout = !favoris.includes(cle);
    const suivants = ajout ? [cle, ...favoris] : favoris.filter(f => f !== cle);
    setFavoris(suivants);
    ecrireStockage(CLES.favoris, suivants);
    return ajout;
  }, [favoris]);

  const majRecherche = useCallback((modif: Partial<Recherche>) => setRecherche(r => ({ ...r, ...modif })), []);

  const majDevis = useCallback((modif: Partial<Devis> | ((d: Devis) => Partial<Devis>)) => {
    setDevis(actuel => {
      const suivant = { ...actuel, ...(typeof modif === 'function' ? modif(actuel) : modif) };
      return donnees && !suivant.pret ? preparerDevis(donnees, suivant, coordonnees) : suivant;
    });
  }, [donnees, coordonnees]);

  /** Profil : coordonnées enregistrées, reportées aussitôt dans le devis. */
  const enregistrerCoordonnees = useCallback((valeurs: Coordonnees) => {
    const propres = { nom: valeurs.nom.trim(), tel: valeurs.tel.trim(), email: valeurs.email.trim() };
    setCoordonnees(propres);
    ecrireStockage(CLES.coordonnees, propres);
    setDevis(actuel => ({ ...actuel, ...propres }));
    // Numéro du profil transmis au site si les notifications sont activées.
    synchroniserAbonnement({ force: true, coordonnees: propres }).catch(() => {});
  }, []);

  /** Après un envoi : les coordonnées saisies dans le devis deviennent celles du profil. */
  const memoriserCoordonnees = useCallback(() => {
    const valeurs = { nom: devis.nom.trim(), tel: devis.tel.trim(), email: devis.email.trim() };
    setCoordonnees(valeurs);
    ecrireStockage(CLES.coordonnees, valeurs);
    synchroniserAbonnement({ force: true, coordonnees: valeurs }).catch(() => {});
  }, [devis.nom, devis.tel, devis.email]);

  const ajouterDemande = useCallback((demande: DemandeEnvoyee) => {
    setHistorique(actuel => {
      const suivant = [demande, ...actuel].slice(0, 30);
      ecrireStockage(CLES.historique, suivant);
      return suivant;
    });
  }, []);

  const actualiserStatuts = useCallback(async () => {
    const ids = historique.map(d => d.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return true;
    try {
      const reponse = await avecDelai(fetch(`${API}/api/app/suivi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ids }),
      }), 12000);
      const { statuts } = (await reponse.json()) as { statuts?: Record<string, string> };
      if (!statuts) return false;
      setHistorique(actuel => {
        const suivant = actuel.map(d => (d.id && statuts[d.id] ? { ...d, statut: statuts[d.id] } : d));
        ecrireStockage(CLES.historique, suivant);
        return suivant;
      });
      return true;
    } catch {
      return false;
    }
  }, [historique]);

  const effacerDonneesPersonnelles = useCallback(() => {
    setFavoris([]);
    setHistorique([]);
    setCoordonnees(COORDONNEES_VIDES);
    setDevis(actuel => ({ ...actuel, ...COORDONNEES_VIDES, optin: false }));
    AsyncStorage.multiRemove([CLES.favoris, CLES.historique, CLES.coordonnees, 'dl:messages', 'dl:messages-depuis']).catch(() => {});
    // Le site oublie ce téléphone et son numéro ; nouvelle inscription anonyme si les notifications restent actives.
    (async () => {
      await retirerAbonnement();
      await oublierVisiteur();
      await synchroniserAbonnement({ force: true, coordonnees: {} });
    })().catch(() => {});
  }, []);

  const majResumeAvis = useCallback((type: TypeAnnonce, id: string, resume: ResumeAvis) => {
    const rubrique = ({ villa: 'villas', terrain: 'terrains', activite: 'activites', vehicule: 'vehicules' } as const)[type as 'villa'];
    if (!rubrique) return;
    setDonnees(actuelles => {
      if (!actuelles) return actuelles;
      const liste = actuelles[rubrique] as { id: string; avis?: ResumeAvis }[];
      if (!liste.some(item => item.id === id)) return actuelles;
      return { ...actuelles, [rubrique]: liste.map(item => (item.id === id ? { ...item, avis: resume } : item)) } as Donnees;
    });
  }, []);

  const valeur = useMemo<Magasin>(() => ({
    donnees, manifeste, horsLigne, majLe, actualisation, demarre, actualiser,
    favoris, basculerFavori, recherche, majRecherche, devis, majDevis,
    coordonnees, enregistrerCoordonnees, memoriserCoordonnees, historique, ajouterDemande, actualiserStatuts, effacerDonneesPersonnelles, majResumeAvis,
  }), [donnees, manifeste, horsLigne, majLe, actualisation, demarre, actualiser, favoris, basculerFavori, recherche, majRecherche, devis, majDevis,
    coordonnees, enregistrerCoordonnees, memoriserCoordonnees, historique, ajouterDemande, actualiserStatuts, effacerDonneesPersonnelles, majResumeAvis]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useMagasin() {
  const magasin = useContext(Contexte);
  if (!magasin) throw new Error('useMagasin doit être utilisé sous FournisseurMagasin');
  return magasin;
}
