import { Platform } from 'react-native';

/** Site public : même API et mêmes images que henri-philippe.com. */
export const SITE = 'https://henri-philippe.com';

/**
 * Sur téléphone, l'API du site est appelée directement. Dans le navigateur de
 * mise au point (`npm run web`), le relais local `scripts/relais-dev.js` sert
 * la même API avec les autorisations d'origine, et simule l'envoi des demandes.
 */
export const API = Platform.OS === 'web' && __DEV__ ? 'http://localhost:5175' : SITE;

export const WHATSAPP = '2250767696318';
export const TELEPHONE = '+2250767696318';
export const EMAIL = 'contact@henri-philippe.com';
export const TAUX_EUR = 655.957;

/** Adresse partageable d'une annonce (le site ouvre la fiche depuis le « # »). */
export const lienPartage = (type: string, id: string) => ({
  villa: `${SITE}/residences.html#${encodeURIComponent(id)}`,
  terrain: `${SITE}/terrains.html#${encodeURIComponent(id)}`,
  activite: `${SITE}/loisirs.html#${encodeURIComponent(id)}`,
} as Record<string, string>)[type] || `${SITE}/`;
