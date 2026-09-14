/** Navigateur (mise au point) : même carte, dans une iframe. */
import { createElement, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { usePreferences } from '@/donnees/preferences';
import { htmlCarte, type CalqueCarte, type PointCarte } from './carteHtml';

export function CarteTerrains({ points, calques, focus, interactive = true, onOuvrir, style }: {
  points: PointCarte[]; calques?: CalqueCarte[]; focus?: string; interactive?: boolean; onOuvrir?: (id: string) => void; style?: StyleProp<ViewStyle>;
}) {
  const { C, t } = usePreferences();
  useEffect(() => {
    const ecouter = (e: MessageEvent) => {
      try {
        const message = JSON.parse(String(e.data)) as { type?: string; id?: string };
        if (message.type === 'terrain' && message.id && onOuvrir) onOuvrir(message.id);
      } catch { /* message étranger */ }
    };
    window.addEventListener('message', ecouter);
    return () => window.removeEventListener('message', ecouter);
  }, [onOuvrir]);

  return (
    <View style={[{ overflow: 'hidden' }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      {createElement('iframe', {
        srcDoc: htmlCarte(points, {
          sombre: C.sombre, libelleVoir: t('carte.voir'), interactive, calques, focus,
          fonds: { plan: t('carte.plan'), satellite: t('carte.satellite'), relief: t('carte.relief') },
        }),
        style: { border: 0, width: '100%', height: '100%' },
        title: t('carte.titre'),
      })}
    </View>
  );
}
