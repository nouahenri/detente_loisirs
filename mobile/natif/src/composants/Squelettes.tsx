import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';

/** Lignes fantômes pendant le premier chargement. */
export function Squelettes({ nombre = 3 }: { nombre?: number }) {
  const { C } = usePreferences();
  const s = feuille(C);
  const opacite = useSharedValue(1);
  useEffect(() => {
    opacite.value = withRepeat(withTiming(0.45, { duration: 750 }), -1, true);
  }, [opacite]);
  const pulsation = useAnimatedStyle(() => ({ opacity: opacite.value }));

  return (
    <View>
      {Array.from({ length: nombre }, (_, i) => (
        <View key={i} style={s.ligne}>
          <Animated.View style={[s.vignette, pulsation]} />
          <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
            <Animated.View style={[s.barre, { width: '40%', height: 10 }, pulsation]} />
            <Animated.View style={[s.barre, { width: '85%', height: 16 }, pulsation]} />
            <Animated.View style={[s.barre, { width: '60%', height: 12 }, pulsation]} />
            <Animated.View style={[s.barre, { width: '100%', height: 30, marginTop: 'auto' }, pulsation]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const feuille = creerStyles(C => ({
  ligne: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre, marginBottom: 10 },
  vignette: { width: 112, height: 124, borderRadius: 13, backgroundColor: C.vignette },
  barre: { borderRadius: 6, backgroundColor: C.vignette },
}));
