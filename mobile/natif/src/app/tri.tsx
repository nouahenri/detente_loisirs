/** Feuille « Trier les annonces ». */
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { revenir, vibrerSelection } from '@/composants/outils';
import { Icone, type NomIcone } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import type { Tri } from '@/donnees/regles';
import { creerStyles } from '@/donnees/theme';

export default function Trier() {
  const router = useRouter();
  const { recherche, majRecherche } = useMagasin();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const choix: [Tri, NomIcone, string][] = [
    ['recommande', 'sparkles-outline', t('tri.recommande')],
    ['prixCroissant', 'trending-up', t('tri.prixCroissant')],
    ['prixDecroissant', 'trending-down', t('tri.prixDecroissant')],
    ['taille', 'resize-outline', t('tri.taille')],
  ];

  return (
    <View style={s.ecran}>
      <Text style={s.titre}>{t('tri.titre')}</Text>
      <View style={s.liste}>
        {choix.map(([valeur, icone, texte], i) => {
          const actif = recherche.tri === valeur;
          return (
            <Pressable
              key={valeur}
              onPress={() => { vibrerSelection(); majRecherche({ tri: valeur }); revenir('/explorer'); }}
              style={({ pressed }) => [s.option, i > 0 && s.bordure, pressed && { backgroundColor: C.surface }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: actif }}>
              <Icone nom={icone} taille={20} couleur={C.marque} />
              <Text style={[s.texte, actif && { fontWeight: '800' }]}>{texte}</Text>
              {actif ? <Icone nom="checkmark-circle" taille={22} couleur={C.sombre ? C.or : '#151837'} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={s.aide}>{t('tri.aide')}</Text>
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.carte, paddingHorizontal: 18, paddingTop: 22 },
  titre: { fontSize: 22, fontWeight: '800', color: C.texte, marginBottom: 12 },
  liste: { borderRadius: 16, backgroundColor: C.fond, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 15 },
  bordure: { borderTopWidth: 1, borderTopColor: C.bord },
  texte: { flex: 1, fontSize: 15.5, fontWeight: '600', color: C.texte },
  aide: { fontSize: 12.5, color: C.texte3, marginTop: 12, marginLeft: 4 },
}));
