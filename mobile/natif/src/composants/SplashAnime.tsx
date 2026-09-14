/**
 * Écran de démarrage animé. Il prend le relais de l'écran natif : même fond
 * blanc, même logo détouré (logo-splash.png), exactement centré et à la taille
 * de l'écran natif (164 dp sur Android, où le système l'inscrit dans un cercle ;
 * 220 sur iOS). Le logo grandit, le trait doré et le lieu apparaissent, puis
 * l'écran s'efface sur l'accueil — dès que les annonces enregistrées sont lues
 * et au plus tôt après 1,8 s.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

const DUREE_MINIMALE = 1800;
const LARGEUR_LOGO = 220;
/** Taille du logo sur l'écran natif (app.json → expo-splash-screen). */
const LARGEUR_NATIVE = Platform.OS === 'android' ? 164 : LARGEUR_LOGO;

export function SplashAnime({ pret, onAffiche }: { pret: boolean; onAffiche?: () => void }) {
  const [visible, setVisible] = useState(true);
  const [animationFinie, setAnimationFinie] = useState(false);
  const echelle = useSharedValue(LARGEUR_NATIVE / LARGEUR_LOGO);
  const trait = useSharedValue(0);
  const texte = useSharedValue(0);
  const fond = useSharedValue(1);

  useEffect(() => {
    onAffiche?.();
    echelle.value = withSequence(
      withTiming(1.08, { duration: 480, easing: Easing.out(Easing.cubic) }),
      withTiming(0.96, { duration: 260, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
    );
    trait.value = withDelay(520, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    texte.value = withDelay(760, withTiming(1, { duration: 520 }));
    const minuteur = setTimeout(() => setAnimationFinie(true), DUREE_MINIMALE);
    return () => clearTimeout(minuteur);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pret || !animationFinie) return;
    fond.value = withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) });
    echelle.value = withTiming(1.15, { duration: 420, easing: Easing.in(Easing.quad) });
    const minuteur = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(minuteur);
  }, [pret, animationFinie]); // eslint-disable-line react-hooks/exhaustive-deps

  const styleFond = useAnimatedStyle(() => ({ opacity: fond.value }));
  const styleLogo = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  const styleTrait = useAnimatedStyle(() => ({ width: 64 * trait.value, opacity: trait.value }));
  const styleTexte = useAnimatedStyle(() => ({ opacity: texte.value, transform: [{ translateY: (1 - texte.value) * 10 }] }));

  if (!visible) return null;
  return (
    <Animated.View style={[s.ecran, styleFond]} pointerEvents="auto" accessibilityLabel="Détente & Loisirs">
      {/* Logo au centre exact de l'écran, comme sur l'écran natif. */}
      <Animated.View style={styleLogo}>
        <Image source={require('@/assets/images/logo-splash.png')} style={{ width: LARGEUR_LOGO, height: LARGEUR_LOGO }} contentFit="contain" />
      </Animated.View>
      <View style={s.dessous} pointerEvents="none">
        <Animated.View style={[s.trait, styleTrait]} />
        <Animated.View style={styleTexte}>
          <Text style={s.lieu}>Assinie · Côte d’Ivoire</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  ecran: { ...StyleSheet.absoluteFill, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  dessous: { position: 'absolute', top: '50%', left: 0, right: 0, marginTop: LARGEUR_LOGO / 2 - 14, alignItems: 'center' },
  trait: { height: 3, borderRadius: 2, backgroundColor: '#e8b904' },
  lieu: { marginTop: 12, fontSize: 13, fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', color: '#5d6479' },
});
