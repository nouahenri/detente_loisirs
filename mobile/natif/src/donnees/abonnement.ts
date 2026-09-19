/**
 * Inscription du téléphone auprès du site (demande du 19/09/2026).
 *
 * Quand la personne active les notifications, l'app transmet au site son
 * identifiant anonyme, son jeton de notifications distantes s'il existe, et
 * le NUMÉRO (et le nom) saisis dans son profil — mention affichée dans le
 * Profil. Le studio rapproche ce numéro des employés, des propriétaires et des
 * demandeurs pour leur adresser des messages (Messages → Notifications de
 * l'app). Désactiver les notifications ou effacer ses données retire le
 * numéro du site.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { jetonVisiteur } from './avis';
import { API } from './config';

const CLES = { active: 'dl:notifications', jeton: 'dl:jeton', langue: 'dl:langue', coordonnees: 'dl:coordonnees', envoi: 'dl:abonnement-le' };
const RAFRAICHISSEMENT_MS = 24 * 3600 * 1000;

type Coordonnees = { nom?: string; tel?: string };

/**
 * Envoie (ou rafraîchit, une fois par jour) l'inscription du téléphone.
 * `coordonnees` : celles qui viennent d'être enregistrées (sinon lues sur le téléphone).
 * Sans effet si les notifications ne sont pas activées.
 */
export async function synchroniserAbonnement({ force = false, coordonnees }: { force?: boolean; coordonnees?: Coordonnees } = {}) {
  try {
    const valeurs = Object.fromEntries(await AsyncStorage.multiGet([CLES.active, CLES.jeton, CLES.langue, CLES.coordonnees, CLES.envoi]));
    if (valeurs[CLES.active] !== '1') return false;
    const dernier = Date.parse(valeurs[CLES.envoi] || '');
    if (!force && Number.isFinite(dernier) && Date.now() - dernier < RAFRAICHISSEMENT_MS) return true;
    const profil: Coordonnees = coordonnees ?? (() => { try { return JSON.parse(valeurs[CLES.coordonnees] || '{}'); } catch { return {}; } })();
    const reponse = await fetch(`${API}/api/app/abonnement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        visiteur: await jetonVisiteur(), jeton: valeurs[CLES.jeton] || '', telephone: profil.tel || '', nom: profil.nom || '',
        langue: valeurs[CLES.langue] || 'fr', plateforme: Platform.OS,
      }),
    });
    if (reponse.ok) await AsyncStorage.setItem(CLES.envoi, new Date().toISOString());
    return reponse.ok;
  } catch {
    return false; // nouvelle tentative à la prochaine relève
  }
}

/** Notifications désactivées : le site oublie ce téléphone et son numéro. */
export async function retirerAbonnement() {
  try {
    await fetch(`${API}/api/app/abonnement`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visiteur: await jetonVisiteur() }),
    });
  } catch { /* sans réseau : le site l'oubliera faute de nouvelles */ }
  await AsyncStorage.removeItem(CLES.envoi).catch(() => {});
}
