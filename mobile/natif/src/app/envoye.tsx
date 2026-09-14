/** Feuille de confirmation après l'envoi d'une demande de devis. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ouvrirLien, revenir, vibrerSucces } from '@/composants/outils';
import { Bouton, Icone } from '@/composants/ui';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';

export default function Envoye() {
  const { enregistree, total, lien } = useLocalSearchParams<{ enregistree: string; total: string; lien: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const ok = enregistree === '1';

  useEffect(() => { vibrerSucces(); }, []);

  return (
    <View style={[s.ecran, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Animated.View entering={ZoomIn.springify().damping(14)} style={s.icone}>
        <Icone nom={ok ? 'checkmark' : 'logo-whatsapp'} taille={40} couleur={C.ok} />
      </Animated.View>
      <Text style={s.titre}>{ok ? t('envoye.ok') : t('envoye.ko')}</Text>
      <Text style={s.texte}>{ok ? t('envoye.okTexte') : t('envoye.koTexte')}</Text>
      {total ? <Text style={s.total}>{total}</Text> : null}
      <View style={s.boutons}>
        {lien ? <Bouton texte={t('envoye.rouvrir')} icone="logo-whatsapp" variante="wa" plein onPress={() => ouvrirLien(lien, t)} /> : null}
        <Bouton texte={t('envoye.termine')} variante="contour" plein onPress={() => revenir('/devis')} />
      </View>
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.carte, alignItems: 'center', paddingHorizontal: 24, paddingTop: 34 },
  icone: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.okPale, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  titre: { fontSize: 23, fontWeight: '800', color: C.texte, marginBottom: 8, textAlign: 'center' },
  texte: { fontSize: 15, lineHeight: 22, color: C.texte2, textAlign: 'center' },
  total: { fontSize: 22, fontWeight: '800', color: C.marque, marginTop: 14 },
  boutons: { alignSelf: 'stretch', gap: 10, marginTop: 22 },
}));
