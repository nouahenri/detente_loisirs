import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { usePreferences } from '@/donnees/preferences';
import { ImageSite } from './ImageSite';

/** Galerie à balayer ; un appui ouvre la visionneuse plein écran. */
export function Galerie({ images, titre, hauteur }: { images: string[]; titre: string; hauteur: number }) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { t } = usePreferences();
  const [rang, setRang] = useState(0);

  if (!images.length) return <View style={{ height: hauteur, backgroundColor: '#232859' }} />;
  return (
    <View style={{ height: hauteur, backgroundColor: '#0e1026' }}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(source, i) => `${i}-${source}`}
        onMomentumScrollEnd={e => setRang(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={e => { const r = Math.round(e.nativeEvent.contentOffset.x / width); if (r !== rang) setRang(r); }}
        scrollEventThrottle={32}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/visionneuse', params: { images: JSON.stringify(images), depart: String(index), titre } })}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${titre} — ${t('photo', { n: index + 1, total: images.length })}`}>
            <ImageSite source={item} style={{ width, height: hauteur }} priorite={index === 0 ? 'high' : 'normal'} />
          </Pressable>
        )}
      />
      {images.length > 1 ? (
        <>
          {images.length <= 10 ? (
            <View style={s.points} pointerEvents="none">
              {images.map((_, i) => <View key={i} style={[s.point, i === rang && s.pointActif]} />)}
            </View>
          ) : null}
          <View style={s.compteur} pointerEvents="none"><Text style={s.compteurTexte}>{rang + 1} / {images.length}</Text></View>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  points: { position: 'absolute', left: 0, right: 0, bottom: 32, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  pointActif: { width: 18, backgroundColor: '#fff' },
  compteur: { position: 'absolute', right: 12, bottom: 28, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(14,16,38,0.6)' },
  compteurTexte: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
