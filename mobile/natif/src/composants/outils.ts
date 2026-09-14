import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform, Share } from 'react-native';

import type { Traduire } from '@/donnees/i18n';

const natif = Platform.OS !== 'web';

/**
 * Retour à l'écran précédent. Sans historique (écran ouvert par une
 * notification, un lien ou un rechargement de page), on remplace l'écran par
 * `repli` au lieu d'appeler un retour qui n'aboutit à rien.
 */
export function revenir(repli: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(repli);
}

/** Retour haptique léger (sélection, favori, puce). */
export const vibrerSelection = () => { if (natif) Haptics.selectionAsync().catch(() => {}); };
export const vibrerImpact = () => { if (natif) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const vibrerSucces = () => { if (natif) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
export const vibrerErreur = () => { if (natif) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };

/**
 * WhatsApp, téléphone, e-mail et cartes : application du téléphone.
 * Pages web (Facebook, site) : navigateur intégré à l'app.
 */
export async function ouvrirLien(url: string, t?: Traduire) {
  const application = /^(tel:|mailto:)/.test(url) || /wa\.me|whatsapp|google\.com\/maps/.test(url);
  try {
    if (!application && /^https?:/.test(url) && natif) {
      await WebBrowser.openBrowserAsync(url, { toolbarColor: '#151837', controlsColor: '#e8b904', secondaryToolbarColor: '#151837' });
    } else {
      await Linking.openURL(url);
    }
  } catch {
    Alert.alert(t ? t('lien.indisponible') : 'Lien indisponible', t ? t('lien.indisponibleTexte') : 'Impossible d’ouvrir ce lien sur cet appareil.');
  }
}

export async function partager({ titre, texte, url }: { titre: string; texte: string; url: string }) {
  try {
    await Share.share(Platform.OS === 'ios' ? { title: titre, message: texte, url } : { title: titre, message: `${texte}\n${url}` });
  } catch { /* partage annulé */ }
}
