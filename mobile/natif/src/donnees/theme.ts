/**
 * Palettes claire et sombre. Les écrans ne lisent jamais une couleur en dur :
 * ils passent par `creerStyles` (styles recalculés quand le thème change).
 *
 * Mode clair : fond et en-têtes blancs, textes bleu nuit (demande du 14/09/2026).
 * Mode sombre : fond et en-têtes bleu nuit.
 */
import { StyleSheet } from 'react-native';

export type Palette = {
  sombre: boolean;
  /** En-têtes des écrans et barre du haut des fiches. */
  entete: string; enteteTexte: string; enteteTexte2: string; enteteBouton: string; enteteIcone: string; enteteBord: string;
  /** Champ de recherche posé sur l'en-tête. */
  champEntete: string;
  /** Rubriques (puces) posées sur l'en-tête. */
  segment: string; segmentTexte: string; segmentActif: string; segmentActifTexte: string;
  fond: string; carte: string; surface: string; vignette: string;
  texte: string; texte2: string; texte3: string; bord: string;
  marque: string; primaire: string; surPrimaire: string;
  /** Bleu vif : montants en euros, terrains en titre foncier sur la carte. */
  bleu: string;
  or: string; orTexte: string; orPale: string; orBord: string;
  wa: string; fb: string;
  danger: string; dangerPale: string; ok: string; okPale: string;
  alerte: string; alertePale: string;
  ombre: string; ombreForte: string;
  barreOnglets: string;
  progression: string;
};

export const CLAIR: Palette = {
  sombre: false,
  entete: '#ffffff', enteteTexte: '#151837', enteteTexte2: '#5d6479', enteteBouton: '#f1f2f7', enteteIcone: '#151837', enteteBord: '#eceef4',
  champEntete: '#f1f2f7',
  segment: '#f1f2f7', segmentTexte: '#3f465c', segmentActif: '#151837', segmentActifTexte: '#ffffff',
  fond: '#ffffff', carte: '#ffffff', surface: '#f3f4f9', vignette: '#e8eaf1',
  texte: '#151837', texte2: '#5d6479', texte3: '#8a90a3', bord: '#e6e8ef',
  marque: '#151837', primaire: '#151837', surPrimaire: '#ffffff',
  bleu: '#1f4fb3',
  or: '#e8b904', orTexte: '#a88600', orPale: '#fdf6dc', orBord: '#f3dd8a',
  wa: '#1fae55', fb: '#1877f2',
  danger: '#c0392b', dangerPale: '#fdecea', ok: '#1f8f5a', okPale: '#dff5e8',
  alerte: '#8a5a00', alertePale: '#fff4e0',
  ombre: '0px 2px 12px rgba(21, 24, 55, 0.08)', ombreForte: '0px 8px 24px rgba(14, 16, 38, 0.22)',
  barreOnglets: '#ffffff',
  progression: '#e6e8ef',
};

export const SOMBRE: Palette = {
  sombre: true,
  entete: '#0b0d21', enteteTexte: '#ffffff', enteteTexte2: 'rgba(255,255,255,0.6)', enteteBouton: 'rgba(255,255,255,0.12)', enteteIcone: '#ffffff', enteteBord: 'transparent',
  champEntete: '#ffffff',
  segment: 'rgba(255,255,255,0.12)', segmentTexte: 'rgba(255,255,255,0.85)', segmentActif: '#ffffff', segmentActifTexte: '#151837',
  fond: '#10122a', carte: '#1b1e3d', surface: '#252952', vignette: '#262a4d',
  texte: '#eef0f8', texte2: '#b3b8cc', texte3: '#80869d', bord: '#2c3059',
  marque: '#eef0f8', primaire: '#3b4396', surPrimaire: '#ffffff',
  bleu: '#8fb0ff',
  or: '#e8b904', orTexte: '#f0c93a', orPale: 'rgba(232,185,4,0.15)', orBord: 'rgba(232,185,4,0.35)',
  wa: '#1fae55', fb: '#1877f2',
  danger: '#ff6b5e', dangerPale: 'rgba(255,107,94,0.14)', ok: '#4cd08b', okPale: 'rgba(76,208,139,0.15)',
  alerte: '#f3c96b', alertePale: 'rgba(243,201,107,0.13)',
  ombre: '0px 2px 10px rgba(0, 0, 0, 0.35)', ombreForte: '0px 8px 24px rgba(0, 0, 0, 0.5)',
  barreOnglets: '#151733',
  progression: 'rgba(255,255,255,0.18)',
};

/**
 * Fabrique de feuilles de styles dépendant du thème.
 *   const feuille = creerStyles(C => ({ carte: { backgroundColor: C.carte } }));
 *   const s = feuille(C);
 * Deux palettes seulement : chaque feuille est construite une fois par thème.
 */
export function creerStyles<T extends StyleSheet.NamedStyles<T>>(fabrique: (C: Palette) => T) {
  const cache = new Map<Palette, T>();
  return (C: Palette): T => {
    let feuille = cache.get(C);
    if (!feuille) {
      feuille = StyleSheet.create(fabrique(C));
      cache.set(C, feuille);
    }
    return feuille;
  };
}
