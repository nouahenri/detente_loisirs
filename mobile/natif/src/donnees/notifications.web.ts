/**
 * Navigateur (mise au point) : notifications du navigateur (API Notification)
 * produites par la même veille que sur téléphone, tant que la page est ouverte.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { retirerAbonnement, synchroniserAbonnement } from './abonnement';
import type { Langue } from './i18n';
import { CLES_VEILLE } from './veille';

export type EtatNotifications = 'inactif' | 'actif' | 'refuse' | 'indisponible' | 'nonConfigure';

const disponible = () => typeof window !== 'undefined' && 'Notification' in window;

export async function afficherNotification(titre: string, corps: string, donnees: Record<string, string>) {
  if (!disponible() || Notification.permission !== 'granted') return;
  const notification = new Notification(titre, { body: corps, icon: '/favicon.ico', data: donnees });
  notification.onclick = () => {
    window.focus();
    if (donnees.type && donnees.id) window.location.href = `/annonce/${donnees.type}/${encodeURIComponent(donnees.id)}`;
    else if (donnees.ecran) window.location.href = `/${donnees.ecran}`;
  };
}

export async function activerNotifications(_langue: Langue, demander = true): Promise<{ etat: EtatNotifications; jeton: string | null }> {
  if (!disponible()) return { etat: 'indisponible', jeton: null };
  let permission = Notification.permission;
  if (permission !== 'granted' && demander) permission = await Notification.requestPermission();
  if (permission !== 'granted') return { etat: 'refuse', jeton: null };
  await AsyncStorage.multiSet([[CLES_VEILLE.active, '1'], [CLES_VEILLE.jeton, '']]);
  await synchroniserAbonnement({ force: true });
  return { etat: 'actif', jeton: null };
}

export async function desactiverNotifications(_jeton: string | null) {
  await retirerAbonnement();
  await AsyncStorage.multiSet([[CLES_VEILLE.active, '0'], [CLES_VEILLE.jeton, '']]).catch(() => {});
}

export function useOuvertureNotifications() {}
