/**
 * Carte des terrains géolocalisés (mêmes filtres que la liste d'Explorer).
 * Repères colorés par statut foncier, un calque par statut.
 * `focus` (depuis une fiche) : tous les terrains, centrés sur celui de la fiche.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { couleurFoncier, type CalqueCarte } from '@/composants/carteHtml';
import { CarteTerrains } from '@/composants/CarteTerrains';
import { libelleFoncier } from '@/composants/Ligne';
import { EtatVide } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { estNombre, fcfa, fiche, libelle, nombre, rechercher } from '@/donnees/regles';

export default function Carte() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { donnees, recherche } = useMagasin();
  const { C, t, langue } = usePreferences();

  const { points, calques } = useMemo(() => {
    if (!donnees) return { points: [], calques: [] };
    const terrains = (focus ? donnees.terrains : rechercher(donnees, recherche.criteres, recherche.terrains, recherche.texte).terrains)
      .filter(x => estNombre(x.latitude) && estNombre(x.longitude));
    const parStatut = new Map<string, CalqueCarte & { n: number }>();
    terrains.forEach(x => {
      const calque = parStatut.get(x.landStatus) ?? { cle: x.landStatus, libelle: libelleFoncier(x, t).split(' (')[0], couleur: couleurFoncier(x.landStatus), n: 0 };
      calque.n += 1;
      parStatut.set(x.landStatus, calque);
    });
    return {
      points: terrains.map(x => ({
        id: x.id,
        titre: fiche(x, 'title', langue),
        detail: [
          libelle(donnees.refs, 'statuts', `terrain:${x.status}`, t(`terrain.${x.status}` as 'terrain.disponible'), langue),
          x.areaSqm > 0 ? `${nombre(x.areaSqm)} m²` : '',
          x.priceTotal > 0 ? fcfa(x.priceTotal) : '',
        ].filter(Boolean).join(' · '),
        latitude: x.latitude as number,
        longitude: x.longitude as number,
        calque: x.landStatus,
      })),
      calques: [...parStatut.values()].map(({ n, ...c }) => ({ ...c, libelle: `${c.libelle} (${n})` })),
    };
  }, [donnees, focus, recherche.criteres, recherche.terrains, recherche.texte, t, langue]);

  if (!points.length) return <View style={{ flex: 1, backgroundColor: C.fond }}><EtatVide icone="map-outline" titre={t('carte.aucun')} /></View>;
  return (
    <CarteTerrains
      points={points}
      calques={calques}
      focus={focus}
      style={{ flex: 1 }}
      onOuvrir={id => router.push({ pathname: '/annonce/[type]/[id]', params: { type: 'terrain', id } })}
    />
  );
}
