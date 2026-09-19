/**
 * Avis des visiteurs sur une annonce : « J'aime » et commentaires notés,
 * les mêmes que sur le site (API /api/avis de henri-philippe.com).
 *
 * Pas de compte : un jeton aléatoire gardé sur le téléphone identifie le
 * « J'aime » (le site n'en stocke que l'empreinte). Un commentaire est publié
 * tout de suite ; le studio peut ensuite le masquer ou le supprimer.
 * Les publications Facebook n'ont pas d'avis (comme sur le site).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API } from './config';
import type { ResumeAvis, TypeAnnonce } from './types';

export type CommentaireAvis = { id: string; nom: string; note: number; commentaire: string; creeLe: string };
export type AvisAnnonce = ResumeAvis & { jaime: boolean; commentaires: CommentaireAvis[] };

const CLE_VISITEUR = 'dl:visiteur';
const DELAI_MS = 12000;

/** Type d'annonce attendu par le site ; null quand l'annonce n'accepte pas d'avis. */
export function typeAvis(type: TypeAnnonce | string | undefined): 'villa' | 'terrain' | 'activity' | null {
  if (type === 'villa' || type === 'terrain') return type;
  if (type === 'activite') return 'activity';
  return null;
}

let jetonEnCours: Promise<string> | null = null;

/** Jeton du visiteur (16 à 64 caractères alphanumériques, format exigé par le site). */
export function jetonVisiteur(): Promise<string> {
  if (!jetonEnCours) {
    jetonEnCours = (async () => {
      const existant = await AsyncStorage.getItem(CLE_VISITEUR).catch(() => null);
      if (existant && /^[A-Za-z0-9-]{16,64}$/.test(existant)) return existant;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const nouveau = `app-${Date.now().toString(36)}-${Array.from({ length: 24 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
      await AsyncStorage.setItem(CLE_VISITEUR, nouveau).catch(() => {});
      return nouveau;
    })();
  }
  return jetonEnCours;
}

/** « Effacer mes données » : le téléphone reçoit un nouveau jeton anonyme. */
export async function oublierVisiteur() {
  jetonEnCours = null;
  await AsyncStorage.removeItem(CLE_VISITEUR).catch(() => {});
}

/** Erreur renvoyée par le site, affichable telle quelle (messages en français du site). */
export class ErreurAvis extends Error {
  constructor(message: string, public statut = 0) { super(message); }
}

async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), DELAI_MS);
  try {
    const reponse = await fetch(`${API}${chemin}`, {
      ...options,
      signal: controle.signal,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok || corps.ok === false) throw new ErreurAvis(String(corps.error || ''), reponse.status);
    return corps as T;
  } catch (erreur) {
    if (erreur instanceof ErreurAvis) throw erreur;
    throw new ErreurAvis('', 0);
  } finally {
    clearTimeout(minuterie);
  }
}

const resume = (corps: Partial<ResumeAvis>): ResumeAvis => ({
  likes: Number(corps.likes) || 0,
  note: typeof corps.note === 'number' ? corps.note : null,
  nombre: Number(corps.nombre) || 0,
});

export async function lireAvis(type: TypeAnnonce, id: string): Promise<AvisAnnonce> {
  const kind = typeAvis(type);
  if (!kind) throw new ErreurAvis('');
  const visiteur = await jetonVisiteur();
  const corps = await appeler<AvisAnnonce>(`/api/avis?kind=${kind}&id=${encodeURIComponent(id)}&visiteur=${encodeURIComponent(visiteur)}`);
  return { ...resume(corps), jaime: Boolean(corps.jaime), commentaires: Array.isArray(corps.commentaires) ? corps.commentaires : [] };
}

export async function basculerJaime(type: TypeAnnonce, id: string): Promise<ResumeAvis & { jaime: boolean }> {
  const kind = typeAvis(type);
  if (!kind) throw new ErreurAvis('');
  const visiteur = await jetonVisiteur();
  const corps = await appeler<ResumeAvis & { jaime: boolean }>('/api/avis/jaime', { method: 'POST', body: JSON.stringify({ kind, id, visiteur }) });
  return { ...resume(corps), jaime: Boolean(corps.jaime) };
}

export async function publierAvis(type: TypeAnnonce, id: string, saisie: { nom: string; note: number; commentaire: string }) {
  const kind = typeAvis(type);
  if (!kind) throw new ErreurAvis('');
  const visiteur = await jetonVisiteur();
  const corps = await appeler<ResumeAvis & { commentaire: CommentaireAvis }>('/api/avis/commentaires', {
    method: 'POST',
    body: JSON.stringify({ kind, id, visiteur, nom: saisie.nom.trim(), note: saisie.note, commentaire: saisie.commentaire.trim() }),
  });
  return { ...resume(corps), commentaire: corps.commentaire };
}

/** Règles de saisie identiques au site (db/avis.js). Renvoie la clé du message d'erreur ou null. */
export function erreurSaisie(saisie: { nom: string; note: number; commentaire: string }) {
  if (saisie.nom.trim().length < 2) return 'avisV.erreurNom' as const;
  if (!Number.isInteger(saisie.note) || saisie.note < 1 || saisie.note > 5) return 'avisV.erreurNote' as const;
  if (saisie.commentaire.trim().length < 3) return 'avisV.erreurCommentaire' as const;
  return null;
}
