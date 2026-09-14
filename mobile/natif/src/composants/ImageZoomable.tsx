/**
 * Photo plein écran agrandissable : pincer pour zoomer (jusqu'à 4×) autour des
 * doigts, glisser pour se déplacer dans la photo agrandie, double-tap pour
 * zoomer / revenir. Tant que la photo est agrandie, le balayage entre photos
 * est suspendu (`onZoom`).
 */
import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const ECHELLE_MAX = 4;
const ECHELLE_DOUBLE_TAP = 2.5;

export function ImageZoomable({ uri, largeur, hauteur, libelle, onZoom }: {
  uri: string; largeur: number; hauteur: number; libelle?: string; onZoom?: (zoome: boolean) => void;
}) {
  const [zoome, setZoome] = useState(false);
  const echelle = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const debut = useSharedValue({ echelle: 1, x: 0, y: 0, focaleX: 0, focaleY: 0 });
  // Taille de la photo affichée (contentFit « contain »), pour borner le déplacement.
  const affichee = useSharedValue({ l: largeur, h: hauteur });

  const signalerZoom = (valeur: boolean) => {
    setZoome(valeur);
    onZoom?.(valeur);
  };

  const surChargement = (e: ImageLoadEventData) => {
    const { width: l, height: h } = e.source;
    if (!l || !h) return;
    const ratio = Math.min(largeur / l, hauteur / h);
    affichee.value = { l: l * ratio, h: h * ratio };
  };

  const borner = (valeur: number, max: number) => {
    'worklet';
    return Math.min(max, Math.max(-max, valeur));
  };
  const bornes = (s: number) => {
    'worklet';
    return {
      x: Math.max(0, (affichee.value.l * s - largeur) / 2),
      y: Math.max(0, (affichee.value.h * s - hauteur) / 2),
    };
  };
  const recadrer = (s: number) => {
    'worklet';
    const b = bornes(s);
    x.value = withTiming(borner(x.value, b.x), { duration: 180 });
    y.value = withTiming(borner(y.value, b.y), { duration: 180 });
  };
  const reinitialiser = () => {
    'worklet';
    echelle.value = withTiming(1, { duration: 220 });
    x.value = withTiming(0, { duration: 220 });
    y.value = withTiming(0, { duration: 220 });
    scheduleOnRN(signalerZoom, false);
  };

  const pincer = Gesture.Pinch()
    .onStart(e => {
      debut.value = { echelle: echelle.value, x: x.value, y: y.value, focaleX: e.focalX - largeur / 2, focaleY: e.focalY - hauteur / 2 };
      scheduleOnRN(signalerZoom, true);
    })
    .onUpdate(e => {
      const d = debut.value;
      const s = Math.min(ECHELLE_MAX, Math.max(0.8, d.echelle * e.scale));
      const k = s / d.echelle;
      // Le point sous les doigts reste sous les doigts.
      x.value = d.focaleX - (d.focaleX - d.x) * k;
      y.value = d.focaleY - (d.focaleY - d.y) * k;
      echelle.value = s;
    })
    .onEnd(() => {
      if (echelle.value <= 1.02) reinitialiser();
      else recadrer(echelle.value);
    });

  const deplacer = Gesture.Pan()
    .enabled(zoome)
    .averageTouches(true)
    .onStart(() => {
      debut.value = { ...debut.value, x: x.value, y: y.value };
    })
    .onUpdate(e => {
      const b = bornes(echelle.value);
      x.value = borner(debut.value.x + e.translationX, b.x + 40);
      y.value = borner(debut.value.y + e.translationY, b.y + 40);
    })
    .onEnd(() => recadrer(echelle.value));

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(e => {
      if (echelle.value > 1.02) {
        reinitialiser();
        return;
      }
      const b = bornes(ECHELLE_DOUBLE_TAP);
      echelle.value = withTiming(ECHELLE_DOUBLE_TAP, { duration: 240 });
      x.value = withTiming(borner((e.x - largeur / 2) * (1 - ECHELLE_DOUBLE_TAP), b.x), { duration: 240 });
      y.value = withTiming(borner((e.y - hauteur / 2) * (1 - ECHELLE_DOUBLE_TAP), b.y), { duration: 240 });
      scheduleOnRN(signalerZoom, true);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: echelle.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pincer, deplacer, doubleTap)}>
      <Animated.View style={[{ width: largeur, height: hauteur, overflow: 'hidden' }]} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" accessibilityLabel={libelle} onLoad={surChargement} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
