/**
 * Feuille « Filtres » (feuille native iOS / Android).
 * Mêmes critères que la barre de recherche du site ; une ville ou un
 * équipement n'est proposé que s'il est utilisé par au moins une annonce.
 * Chaque rubrique n'affiche que ses propres filtres : résidences et actus
 * (critères de logement), terrains (localisation, statut foncier) ; « Tout »
 * affiche les deux. Le paramètre `rubrique` force la rubrique (accueil).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChampChoix, type OptionChoix } from '@/composants/ChampChoix';
import { libelleFoncier } from '@/composants/Ligne';
import { revenir, vibrerImpact } from '@/composants/outils';
import { Bouton, Icone, type NomIcone } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { criteresTerrainsVides, criteresVides, CRITERES_HORS_THEME, filtresLogement, filtresTerrain, libelle, rechercher } from '@/donnees/regles';
import { creerStyles } from '@/donnees/theme';
import type { Criteres, CriteresTerrains, Segment } from '@/donnees/types';

const SEGMENTS: Segment[] = ['tout', 'villas', 'terrains', 'activites', 'publications'];

export default function Filtres() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rubrique } = useLocalSearchParams<{ rubrique?: string }>();
  const { donnees, recherche, majRecherche } = useMagasin();
  const segment: Segment = SEGMENTS.includes(rubrique as Segment) ? (rubrique as Segment) : recherche.segment;
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [criteres, setCriteres] = useState<Criteres>(recherche.criteres);
  const [terrains, setTerrains] = useState<CriteresTerrains>(recherche.terrains);

  const refs = donnees?.refs ?? null;
  const options = useMemo(() => {
    if (!donnees) return null;
    const logements = [...donnees.villas, ...donnees.publications.map(p => p.fiche).filter(Boolean)] as { localisationId?: string; equipements?: string[] }[];
    const villesDe = (biens: { localisationId?: string }[], choisie: string) => {
      const utilisees = new Set(biens.map(b => b.localisationId).filter(Boolean));
      return (refs?.localisations || []).filter(v => (v.actif !== false && utilisees.has(v.id)) || v.id === choisie);
    };
    const equipementsUtilises = new Set(logements.flatMap(b => (Array.isArray(b.equipements) ? b.equipements : [])));
    const fonciers = [...new Set(donnees.terrains.map(x => x.landStatus))];
    return {
      villes: villesDe(logements, criteres.ville),
      villesTerrains: villesDe(donnees.terrains, terrains.ville),
      categories: (refs?.categories || []).filter(cat => cat.actif !== false && !CRITERES_HORS_THEME.includes(cat.id)),
      equipements: (refs?.equipements || []).filter(e => e.actif !== false && equipementsUtilises.has(e.id)),
      fonciers: fonciers.map(code => [code, libelleFoncier(donnees.terrains.find(x => x.landStatus === code)!, t)] as [string, string]),
      aDesTerrains: donnees.terrains.length > 0,
    };
  }, [donnees, refs, criteres.ville, terrains.ville, t]);

  const nombre = useMemo(() => {
    if (!donnees) return 0;
    const r = rechercher(donnees, criteres, terrains, recherche.texte);
    return segment === 'tout' ? r.villas.length + r.terrains.length + r.activites.length + r.publications.length : r[segment].length;
  }, [donnees, criteres, terrains, recherche.texte, segment]);

  if (!options) return null;

  const logement = filtresLogement(segment);
  const terrain = filtresTerrain(segment) && options.aDesTerrains;

  // Menu déroulant ; masqué quand il n'y a rien à choisir.
  const champ = (libelleChamp: string, icone: NomIcone, valeur: string, choix: OptionChoix[], choisir: (v: string) => void) =>
    choix.length <= 1 ? null : <ChampChoix key={libelleChamp + icone} libelle={libelleChamp} icone={icone} valeur={valeur} options={choix} onChange={choisir} />;
  const rangee = (...champs: ReactNode[]) => {
    const presents = champs.filter(Boolean);
    return presents.length ? <View style={s.rangee}>{presents}</View> : null;
  };
  const pour = (cle: keyof Criteres) => (v: string) => setCriteres(x => ({ ...x, [cle]: v }));
  const pourTerrain = (cle: keyof CriteresTerrains) => (v: string) => setTerrains(x => ({ ...x, [cle]: v }));

  const effacer = () => {
    if (logement) setCriteres(criteresVides());
    if (terrain) setTerrains(criteresTerrainsVides());
  };

  return (
    <View style={s.ecran}>
      <View style={s.tete}>
        <View style={{ flex: 1 }}>
          <Text style={s.titre}>{t('filtres')}</Text>
          {segment !== 'tout' ? <Text style={s.sousTitre}>{t(`rubrique.${segment}` as 'rubrique.villas')}</Text> : null}
        </View>
        <Pressable onPress={() => revenir('/explorer')} hitSlop={10} style={s.fermer} accessibilityLabel={t('fermer')}>
          <Icone nom="close" taille={20} couleur={C.texte} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.corps}>
        {logement ? (
          <View style={s.bloc}>
            {terrain ? <Text style={s.intertitre}>{t('filtres.logements')}</Text> : null}
            {rangee(champ(t('filtres.localisation'), 'location-outline', criteres.ville, [['all', t('filtres.toutes')], ...options.villes.map(v => [v.id, v.nom || v.id] as OptionChoix)], pour('ville')))}
            {rangee(
              champ(t('filtres.emplacement'), 'water-outline', criteres.location, [['all', t('filtres.tous')], ['lagune', t('filtres.lagune')], ['ocean', t('filtres.ocean')]], pour('location')),
              champ(t('filtres.type'), 'home-outline', criteres.cat, [['all', t('filtres.tous')], ['piscine', t('filtres.piscine')], ...options.categories.map(cat => [cat.id, libelle(refs, 'categories', cat.id, '', langue)] as OptionChoix)], pour('cat')),
            )}
            {rangee(
              champ(t('filtres.budget'), 'pricetag-outline', criteres.budget, [['all', t('filtres.tous')], ['eco', '≤ 250 000 F'], ['luxe', '≥ 250 000 F']], pour('budget')),
              champ(t('filtres.voyageurs'), 'people-outline', criteres.guests, [['all', t('filtres.tous')], ['2-6', t('filtres.v26')], ['8-12', t('filtres.v812')], ['12+', t('filtres.v12')]], pour('guests')),
            )}
            {rangee(
              champ(t('filtres.chambres'), 'bed-outline', criteres.chambres, [['all', t('filtres.indifferent')], ['1', '1+'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5+']], pour('chambres')),
              options.equipements.length ? (
                <ChampChoix key={t('filtres.equipements')} multiple libelle={t('filtres.equipements')} icone="sparkles-outline" valeur={criteres.equip} vide={t('filtres.indifferent')}
                  aide={t('filtres.equipementsAide')} onChange={pour('equip')}
                  options={options.equipements.map(e => [e.id, libelle(refs, 'equipements', e.id, '', langue)] as OptionChoix)} />
              ) : null,
            )}
          </View>
        ) : null}

        {terrain ? (
          <View style={s.bloc}>
            {logement ? <Text style={[s.intertitre, { marginTop: 18 }]}>{t('filtres.terrains')}</Text> : null}
            {rangee(
              champ(t('filtres.localisation'), 'map-outline', terrains.ville, [['all', t('filtres.toutes')], ...options.villesTerrains.map(v => [v.id, v.nom || v.id] as OptionChoix)], pourTerrain('ville')),
              champ(t('filtres.foncier'), 'document-text-outline', terrains.foncier, [['all', t('filtres.tous')], ...options.fonciers], pourTerrain('foncier')),
            )}
          </View>
        ) : null}

        {!logement && !terrain ? <Text style={s.aucun}>{t('filtres.aucun')}</Text> : null}
      </ScrollView>

      <View style={[s.pied, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Bouton texte={t('explorer.effacer')} variante="contour" onPress={effacer} />
        <Bouton
          texte={t('filtres.voir', { x: t(nombre > 1 ? 'annonce.plusieurs' : 'annonce.un', { n: nombre }) })}
          plein
          onPress={() => { vibrerImpact(); majRecherche({ criteres, terrains }); revenir('/explorer'); }}
        />
      </View>
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.carte },
  tete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  titre: { fontSize: 22, fontWeight: '800', color: C.texte },
  sousTitre: { fontSize: 13.5, fontWeight: '600', color: C.texte3, marginTop: 1 },
  fermer: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  corps: { paddingHorizontal: 18, paddingBottom: 24 },
  bloc: { gap: 4 },
  intertitre: { marginTop: 8, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surface, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: C.texte2, overflow: 'hidden' },
  rangee: { flexDirection: 'row', gap: 14 },
  aucun: { fontSize: 14.5, color: C.texte2, textAlign: 'center', marginTop: 30 },
  pied: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.bord, backgroundColor: C.carte },
}));
