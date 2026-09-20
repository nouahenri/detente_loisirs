/**
 * Inscription du téléphone auprès du site (demande du 19/09/2026).
 *
 * L'app transmet au site son identifiant anonyme, les COORDONNÉES saisies dans
 * le profil (nom, numéro, e-mail — mention affichée dans le Profil) et, si les
 * notifications sont activées, son jeton d'envoi. Le studio rapproche ce numéro
 * des employés, des propriétaires et des demandeurs pour leur adresser des
 * messages (Communication → Notifications de l'app) et administre les profils
 * (Communication → Utilisateurs de l'app).
 *
 * Deux raisons d'être inscrit (20/09/2026) : les notifications, OU un numéro
 * renseigné pour être rappelé. Couper les notifications ne retire donc le
 * téléphone du site que si aucun numéro n'y est enregistré ; effacer ses
 * données personnelles l'en retire toujours.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { jetonVisiteur } from './avis';
import { API } from './config';

const CLES = { active: 'dl:notifications', jeton: 'dl:jeton', langue: 'dl:langue', coordonnees: 'dl:coordonnees', envoi: 'dl:abonnement-le' };
const RAFRAICHISSEMENT_MS = 24 * 3600 * 1000;

type Coordonnees = { nom?: string; tel?: string; email?: string };

/**
 * Envoie (ou rafraîchit, une fois par jour) l'inscription du téléphone.
 * `coordonnees` : celles qui viennent d'être enregistrées (sinon lues sur le téléphone).
 *
 * Deux raisons d'inscrire (20/09/2026) : les notifications activées, OU un
 * profil renseigné avec un numéro. Auparavant, seules les notifications
 * comptaient : une personne qui remplissait son profil pour être rappelée
 * n'arrivait jamais au site, et le studio ne pouvait pas la voir.
 */
export async function synchroniserAbonnement({ force = false, coordonnees }: { force?: boolean; coordonnees?: Coordonnees } = {}) {
  try {
    const valeurs = Object.fromEntries(await AsyncStorage.multiGet([CLES.active, CLES.jeton, CLES.langue, CLES.coordonnees, CLES.envoi]));
    const profil: Coordonnees = coordonnees ?? (() => { try { return JSON.parse(valeurs[CLES.coordonnees] || '{}'); } catch { return {}; } })();
    const notifications = valeurs[CLES.active] === '1';
    // Un numéro suffit : c'est par lui que la conciergerie rappellera.
    const profilUtile = Boolean((profil.tel || '').trim());
    if (!notifications && !profilUtile) return false;
    const dernier = Date.parse(valeurs[CLES.envoi] || '');
    if (!force && Number.isFinite(dernier) && Date.now() - dernier < RAFRAICHISSEMENT_MS) return true;
    const reponse = await fetch(`${API}/api/app/abonnement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        visiteur: await jetonVisiteur(), jeton: notifications ? valeurs[CLES.jeton] || '' : '', telephone: profil.tel || '', nom: profil.nom || '',
        email: profil.email || '', notifications, langue: valeurs[CLES.langue] || 'fr', plateforme: Platform.OS,
      }),
    });
    if (reponse.ok) await AsyncStorage.setItem(CLES.envoi, new Date().toISOString());
    return reponse.ok;
  } catch {
    return false; // nouvelle tentative à la prochaine relève
  }
}

/**
 * Un numéro est-il enregistré dans le profil ? Quand les notifications sont
 * coupées, il décide si le site garde le profil (pour rappeler la personne)
 * ou oublie ce téléphone (20/09/2026).
 */
export async function profilRenseigne() {
  try {
    const brut = await AsyncStorage.getItem(CLES.coordonnees);
    const profil: Coordonnees = JSON.parse(brut || '{}');
    return Boolean((profil.tel || '').trim());
  } catch {
    return false;
  }
}

/** Le site oublie ce téléphone, son numéro et son jeton. */
export async function retirerAbonnement() {
  try {
    await fetch(`${API}/api/app/abonnement`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visiteur: await jetonVisiteur() }),
    });
  } catch { /* sans réseau : le site l'oubliera faute de nouvelles */ }
  await AsyncStorage.removeItem(CLES.envoi).catch(() => {});
}
