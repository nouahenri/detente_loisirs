import { useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, Text, View } from 'react-native';

import { vibrerSelection } from '@/composants/outils';
import { EtatVide, Icone } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';

export default function Faq() {
  const { donnees } = useMagasin();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const [ouverte, setOuverte] = useState<string | null>(donnees?.faq[0]?.id ?? null);
  const questions = donnees?.faq ?? [];

  return (
    <ScrollView style={{ backgroundColor: C.fond }} contentContainerStyle={s.contenu} contentInsetAdjustmentBehavior="automatic">
      {!questions.length ? <EtatVide icone="help-circle-outline" titre={t('faq.vide')} /> : null}
      {questions.map(q => {
        const active = ouverte === q.id;
        return (
          <View key={q.id} style={s.carte}>
            <Pressable
              onPress={() => { vibrerSelection(); LayoutAnimation.easeInEaseOut(); setOuverte(active ? null : q.id); }}
              style={s.question}
              accessibilityRole="button"
              accessibilityState={{ expanded: active }}>
              <Text style={s.questionTexte}>{q.q}</Text>
              <Icone nom={active ? 'chevron-up' : 'chevron-down'} taille={20} couleur={C.texte3} />
            </Pressable>
            {active ? <Text style={s.reponse}>{q.a}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const feuille = creerStyles(C => ({
  contenu: { padding: 16, gap: 10 },
  carte: { backgroundColor: C.carte, borderRadius: 16, boxShadow: C.ombre, overflow: 'hidden' },
  question: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15 },
  questionTexte: { flex: 1, fontSize: 15.5, fontWeight: '700', color: C.texte, lineHeight: 21 },
  reponse: { paddingHorizontal: 15, paddingBottom: 16, fontSize: 15, lineHeight: 23, color: C.texte2 },
}));
