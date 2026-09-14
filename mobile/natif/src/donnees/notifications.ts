/**
 * Notifications (téléphone).
 *   · Toujours : notifications locales produites par la veille (donnees/veille.ts),
 *     à l'ouverture de l'app et par une tâche de fond (toutes les heures environ).
 *   · Si le projet Expo est configuré (extra.eas.projectId + Firebase / APNs) :
 *     jeton enregistré sur le site, qui envoie aussi les notifications distantes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { API } from './config';
import type { Langue } from './i18n';
import { CLES_VEILLE, executerVeille } from './veille';

export type EtatNotifications = 'inactif' | 'actif' | 'refuse' | 'indisponible' | 'nonConfigure';

const TACHE_VEILLE = 'detente-loisirs-veille';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Notification locale immédiate. */
export async function afficherNotification(titre: string, corps: string, donnees: Record<string, string>) {
  await Notifications.scheduleNotificationAsync({ content: { title: titre, body: corps, data: donnees, sound: 'default' }, trigger: null });
}

// Tâche de fond : déclarée au chargement du module (exigence d'expo-task-manager).
TaskManager.defineTask(TACHE_VEILLE, async () => {
  try {
    await executerVeille(afficherNotification);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

const identifiantProjet = () =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

async function envoyerAuSite(methode: 'POST' | 'DELETE', corps: Record<string, string>) {
  try {
    await fetch(`${API}/api/app/appareils`, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  } catch { /* nouvelle tentative au prochain démarrage */ }
}

/**
 * Demande l'autorisation, active la veille (locale + tâche de fond) et, si le
 * service Expo est configuré, enregistre le jeton sur le site.
 */
export async function activerNotifications(langue: Langue, demander = true): Promise<{ etat: EtatNotifications; jeton: string | null }> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Détente & Loisirs',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#e8b904',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && demander) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return { etat: 'refuse', jeton: null };

    // Veille en tâche de fond (le système choisit le moment exact, au mieux toutes les heures).
    try {
      if ((await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available
        && !(await TaskManager.isTaskRegisteredAsync(TACHE_VEILLE))) {
        await BackgroundTask.registerTaskAsync(TACHE_VEILLE, { minimumInterval: 60 });
      }
    } catch { /* tâche de fond refusée par le système : la veille à l'ouverture suffit */ }

    let jeton: string | null = null;
    const projectId = identifiantProjet();
    if (projectId) {
      try {
        jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await envoyerAuSite('POST', { jeton, plateforme: Platform.OS, langue });
      } catch { jeton = null; /* service distant indisponible : mode local */ }
    }
    await AsyncStorage.multiSet([[CLES_VEILLE.active, '1'], [CLES_VEILLE.jeton, jeton || '']]);
    return { etat: 'actif', jeton };
  } catch {
    return { etat: 'indisponible', jeton: null };
  }
}

export async function desactiverNotifications(jeton: string | null) {
  if (jeton) await envoyerAuSite('DELETE', { jeton });
  try { if (await TaskManager.isTaskRegisteredAsync(TACHE_VEILLE)) await BackgroundTask.unregisterTaskAsync(TACHE_VEILLE); } catch { /* déjà retirée */ }
  await AsyncStorage.multiSet([[CLES_VEILLE.active, '0'], [CLES_VEILLE.jeton, '']]).catch(() => {});
}

/** Ouvre l'écran visé quand on touche une notification (application ouverte ou fermée). */
export function useOuvertureNotifications() {
  const router = useRouter();
  const derniere = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!derniere) return;
    const donnees = (derniere.notification.request.content.data || {}) as { type?: string; id?: string; ecran?: string };
    if (donnees.type && donnees.id) {
      router.push({ pathname: '/annonce/[type]/[id]', params: { type: donnees.type, id: donnees.id } });
    } else if (donnees.ecran === 'devis' || donnees.ecran === 'explorer') {
      router.navigate(`/${donnees.ecran}`);
    } else if (donnees.ecran === 'profil') {
      router.push('/profil');
    }
  }, [derniere, router]);
}
