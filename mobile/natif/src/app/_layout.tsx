import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashAnime } from '@/composants/SplashAnime';
import { FournisseurMagasin, useMagasin } from '@/donnees/magasin';
import { useOuvertureNotifications } from '@/donnees/notifications';
import { FournisseurPreferences, usePreferences } from '@/donnees/preferences';

// L'écran natif reste affiché jusqu'au montage de l'écran de démarrage animé.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Un écran ouvert directement (notification, lien, rechargement de page) est
// posé au-dessus des onglets : son bouton retour ramène toujours à l'app.
export const unstable_settings = { anchor: '(onglets)' };

function Navigation() {
  const { C, t, pretes } = usePreferences();
  const { demarre } = useMagasin();
  useOuvertureNotifications();

  const theme = useMemo(() => {
    const base = C.sombre ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: C.fond, card: C.entete, text: C.texte, primary: C.marque, border: C.bord } };
  }, [C]);

  const enTeteNatif = {
    headerShown: true,
    headerStyle: { backgroundColor: C.entete },
    headerTintColor: C.enteteTexte,
    headerTitleStyle: { fontWeight: '700' as const },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
  };
  const feuilleNative = (hauteur: number) => ({
    presentation: 'formSheet' as const,
    sheetAllowedDetents: [hauteur],
    sheetGrabberVisible: true,
    sheetCornerRadius: 26,
    contentStyle: { backgroundColor: C.carte },
  });

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={C.sombre ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: C.fond }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fond } }}>
          <Stack.Screen name="(onglets)" />
          <Stack.Screen name="annonce/[type]/[id]" />
          <Stack.Screen name="filtres" options={feuilleNative(0.92)} />
          <Stack.Screen name="tri" options={feuilleNative(0.5)} />
          <Stack.Screen name="envoye" options={feuilleNative(0.62)} />
          <Stack.Screen name="visionneuse" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
          <Stack.Screen name="profil" options={{ ...enTeteNatif, title: t('profil.titre') }} />
          <Stack.Screen name="demandes" options={{ ...enTeteNatif, title: t('demandes.titre') }} />
          <Stack.Screen name="carte" options={{ ...enTeteNatif, title: t('carte.titre') }} />
          <Stack.Screen name="faq" options={{ ...enTeteNatif, title: t('faq.titre') }} />
          <Stack.Screen name="avis" options={{ ...enTeteNatif, title: t('avis.titre') }} />
        </Stack>
        {/* Écran de démarrage animé, puis l'accueil (route initiale). */}
        <SplashAnime pret={demarre && pretes} onAffiche={() => { SplashScreen.hideAsync().catch(() => {}); }} />
      </View>
    </ThemeProvider>
  );
}

export default function Racine() {
  return (
    <SafeAreaProvider>
      <FournisseurPreferences>
        <FournisseurMagasin>
          <Navigation />
        </FournisseurMagasin>
      </FournisseurPreferences>
    </SafeAreaProvider>
  );
}
