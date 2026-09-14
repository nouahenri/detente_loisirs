import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { SITE } from '@/donnees/config';
import { usePreferences } from '@/donnees/preferences';
import { htmlCarte, type CalqueCarte, type PointCarte } from './carteHtml';

export function CarteTerrains({ points, calques, focus, interactive = true, onOuvrir, style }: {
  points: PointCarte[]; calques?: CalqueCarte[]; focus?: string; interactive?: boolean; onOuvrir?: (id: string) => void; style?: StyleProp<ViewStyle>;
}) {
  const { C, t } = usePreferences();
  const html = htmlCarte(points, {
    sombre: C.sombre, libelleVoir: t('carte.voir'), interactive, calques, focus,
    fonds: { plan: t('carte.plan'), satellite: t('carte.satellite'), relief: t('carte.relief') },
  });
  return (
    <View style={[s.cadre, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        originWhitelist={['*']}
        // baseUrl : les serveurs de tuiles OpenStreetMap exigent une origine identifiable.
        source={{ html, baseUrl: SITE }}
        onMessage={e => {
          try {
            const message = JSON.parse(e.nativeEvent.data) as { type?: string; id?: string };
            if (message.type === 'terrain' && message.id && onOuvrir) onOuvrir(message.id);
          } catch { /* message inconnu */ }
        }}
        style={{ backgroundColor: C.fond }}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const s = StyleSheet.create({ cadre: { overflow: 'hidden' } });
