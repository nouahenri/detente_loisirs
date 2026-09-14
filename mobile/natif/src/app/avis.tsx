import { ScrollView, Text, View } from 'react-native';

import { EtatVide, Icone } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';

export default function Avis() {
  const { donnees } = useMagasin();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const avis = donnees?.avis ?? [];

  return (
    <ScrollView style={{ backgroundColor: C.fond }} contentContainerStyle={s.contenu} contentInsetAdjustmentBehavior="automatic">
      {!avis.length ? <EtatVide icone="star-outline" titre={t('avis.vide')} /> : null}
      {avis.map(a => {
        const note = Math.max(0, Math.min(5, Math.round(Number(a.rating) || 5)));
        return (
          <View key={a.id} style={s.carte}>
            <View style={s.tete}>
              <View style={s.initiale}><Text style={s.initialeTexte}>{String(a.author || '?').trim().charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.auteur}>{a.author}</Text>
                <Text style={s.meta}>{[a.city, a.date].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={s.etoiles} accessibilityLabel={t('avis.note', { n: note })}>
              {Array.from({ length: 5 }, (_, i) => <Icone key={i} nom={i < note ? 'star' : 'star-outline'} taille={15} couleur={C.or} />)}
            </View>
            {a.stay ? <Text style={s.sejour}>{a.stay}</Text> : null}
            {a.comment ? <Text style={s.commentaire}>{a.comment}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const feuille = creerStyles(C => ({
  contenu: { padding: 16, gap: 10 },
  carte: { backgroundColor: C.carte, borderRadius: 16, padding: 14, boxShadow: C.ombre },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  initiale: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.orPale, alignItems: 'center', justifyContent: 'center' },
  initialeTexte: { fontSize: 17, fontWeight: '800', color: C.marque },
  auteur: { fontSize: 15, fontWeight: '700', color: C.texte },
  meta: { fontSize: 12.5, color: C.texte3 },
  etoiles: { flexDirection: 'row', gap: 2, marginBottom: 6 },
  sejour: { fontSize: 14, fontWeight: '700', color: C.texte, marginBottom: 4 },
  commentaire: { fontSize: 14.5, lineHeight: 22, color: C.texte2 },
}));
