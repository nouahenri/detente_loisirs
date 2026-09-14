import { Image, type ImageStyle } from 'expo-image';
import { useMemo } from 'react';
import { Platform, type StyleProp } from 'react-native';

import { SITE } from '@/donnees/config';
import { useMagasin } from '@/donnees/magasin';

export function urlSite(source?: string) {
  if (!source) return '';
  if (/^(https?:)?\/\//.test(source) || source.startsWith('data:')) return source;
  return `${SITE}/${String(source).replace(/^\.?\//, '')}`;
}

/**
 * Image du site. Les variantes WebP du manifeste (data/image-manifest.json)
 * sont proposées à expo-image, qui retient la plus adaptée à la taille affichée.
 */
export function ImageSite({ source, style, alt = '', priorite = 'normal' }: {
  source?: string; style?: StyleProp<ImageStyle>; alt?: string; priorite?: 'low' | 'normal' | 'high';
}) {
  const { manifeste } = useMagasin();
  const sources = useMemo(() => {
    if (!source) return null;
    const entree = manifeste ? (manifeste[source.split('?')[0].replace(/^\.?\//, '')] || manifeste[source]) : null;
    const variantes = entree && entree.webp
      ? Object.entries(entree.webp)
        .map(([largeur, url]) => ({ uri: urlSite(url), width: Number(largeur), height: Math.round(Number(largeur) * ((entree.height || 3) / (entree.width || 4))) }))
        .filter(v => v.width > 0 && v.uri)
      : [];
    return variantes.length ? variantes : [{ uri: urlSite(source) }];
  }, [source, manifeste]);

  if (!sources) return null;
  return (
    <Image
      source={sources}
      style={style}
      contentFit="cover"
      // Le fondu d'apparition laisse parfois l'image invisible dans le
      // navigateur de mise au point : il est réservé aux téléphones.
      transition={Platform.OS === 'web' ? undefined : 180}
      cachePolicy="memory-disk"
      priority={priorite}
      accessibilityLabel={alt}
    />
  );
}
