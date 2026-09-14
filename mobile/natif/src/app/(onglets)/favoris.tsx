import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';

import { Ligne, modeleActivite, modelePublication, modeleTerrain, modeleVilla } from '@/composants/Ligne';
import { EnTete } from '@/composants/EnTete';
import { Bouton, EtatVide } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';

export default function Favoris() {
  const router = useRouter();
  const { donnees, favoris, majRecherche } = useMagasin();
  const { C, t, langue } = usePreferences();

  // Seules les annonces encore publiées sont listées.
  const modeles = useMemo(() => {
    if (!donnees) return [];
    const ctx = { refs: donnees.refs, t, langue };
    return favoris.map(cle => {
      const [type, ...reste] = cle.split(':');
      const id = reste.join(':');
      if (type === 'villa') { const v = donnees.villas.find(x => x.id === id); return v ? modeleVilla(v, ctx) : null; }
      if (type === 'terrain') { const x = donnees.terrains.find(y => y.id === id); return x ? modeleTerrain(x, ctx) : null; }
      if (type === 'activite') { const a = donnees.activites.find(x => x.id === id); return a ? modeleActivite(a, ctx) : null; }
      if (type === 'publication') { const p = donnees.publications.find(x => x.id === id); return p ? modelePublication(p, ctx) : null; }
      return null;
    }).filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [donnees, favoris, t, langue]);

  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <EnTete
        titre={t('favoris.titre')}
        sousTitre={modeles.length ? t(modeles.length > 1 ? 'favoris.plusieurs' : 'favoris.un', { n: modeles.length }) : t('favoris.sousTitre')}
      />
      <FlatList
        data={modeles}
        keyExtractor={m => `${m.type}:${m.id}`}
        renderItem={({ item, index }) => <Ligne modele={item} rang={index} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <EtatVide
            icone="heart-outline"
            titre={t('favoris.vide')}
            texte={t('favoris.videTexte')}
            action={<Bouton texte={t('favoris.explorer')} onPress={() => { majRecherche({ segment: 'tout' }); router.navigate('/explorer'); }} />}
          />
        }
      />
    </View>
  );
}
