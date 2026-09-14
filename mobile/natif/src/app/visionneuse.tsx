import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FlatList, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageZoomable } from '@/composants/ImageZoomable';
import { urlSite } from '@/composants/ImageSite';
import { revenir } from '@/composants/outils';
import { BoutonRond } from '@/composants/ui';
import { usePreferences } from '@/donnees/preferences';

/** Photos en plein écran, à balayer ; pincer ou double-tap pour agrandir. */
export default function Visionneuse() {
  const { images, depart, titre } = useLocalSearchParams<{ images: string; depart: string; titre: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = usePreferences();
  const { width, height } = useWindowDimensions();
  const liste = useMemo<string[]>(() => { try { return JSON.parse(images || '[]'); } catch { return []; } }, [images]);
  const initial = Math.max(0, Math.min(Number(depart) || 0, liste.length - 1));
  const [rang, setRang] = useState(initial);
  const [zoome, setZoome] = useState(false);

  return (
    <GestureHandlerRootView style={s.ecran}>
      <StatusBar style="light" />
      <FlatList
        data={liste}
        horizontal
        pagingEnabled
        scrollEnabled={!zoome}
        initialScrollIndex={initial}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(source, i) => `${i}-${source}`}
        onMomentumScrollEnd={e => setRang(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <ImageZoomable uri={urlSite(item)} largeur={width} hauteur={height} libelle={titre} onZoom={setZoome} />
        )}
      />
      <View style={[s.barre, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Text style={s.rang}>{rang + 1} / {liste.length}</Text>
        <BoutonRond icone="close" label={t('fermer')} onPress={() => revenir()} />
      </View>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#000' },
  barre: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  rang: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
