/**
 * Explorer : recherche texte, rubriques, filtres et tri (feuilles natives),
 * carte des terrains et liste en lignes.
 * Mêmes règles de filtrage que le catalogue du site (donnees/regles.ts).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';

import { libelleFoncier, Ligne, modeleActivite, modelePublication, modeleTerrain, modeleVilla, type Modele } from '@/composants/Ligne';
import { vibrerSelection } from '@/composants/outils';
import { Squelettes } from '@/composants/Squelettes';
import { EnTete } from '@/composants/EnTete';
import { BandeauHorsLigne, Bouton, EtatVide, Icone, Puce, type NomIcone } from '@/composants/ui';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { criteresTerrainsVides, criteresVides, estNombre, filtresLogement, filtresTerrain, libelle, rechercher, trier } from '@/donnees/regles';
import { creerStyles } from '@/donnees/theme';
import type { Segment } from '@/donnees/types';

export default function Explorer() {
  const router = useRouter();
  const { donnees, horsLigne, majLe, actualiser, recherche, majRecherche } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const champ = useRef<TextInput>(null);
  const liste = useRef<SectionList<Modele>>(null);
  const [texte, setTexte] = useState(recherche.texte);
  const [tire, setTire] = useState(false);

  // Frappe : la liste suit après une courte pause.
  useEffect(() => {
    const minuteur = setTimeout(() => { if (texte !== recherche.texte) majRecherche({ texte }); }, 150);
    return () => clearTimeout(minuteur);
  }, [texte, recherche.texte, majRecherche]);

  // « Rechercher » depuis l'accueil : le clavier s'ouvre.
  const dernierFocus = useRef(0);
  useFocusEffect(useCallback(() => {
    if (recherche.focus && recherche.focus !== dernierFocus.current) {
      dernierFocus.current = recherche.focus;
      const minuteur = setTimeout(() => champ.current?.focus(), 250);
      return () => clearTimeout(minuteur);
    }
    return undefined;
  }, [recherche.focus]));

  const resultats = useMemo(
    () => (donnees ? rechercher(donnees, recherche.criteres, recherche.terrains, recherche.texte) : null),
    [donnees, recherche.criteres, recherche.terrains, recherche.texte],
  );

  const refs = donnees?.refs ?? null;
  const sections = useMemo(() => {
    if (!resultats) return [];
    const ctx = { refs, t, langue };
    const ordonner = (modeles: Modele[]) => trier(modeles, recherche.tri, m => m.valeurPrix, m => m.valeurTaille);
    return [
      { cle: 'villas' as const, titre: t('groupe.villas'), data: ordonner(resultats.villas.map(v => modeleVilla(v, ctx))) },
      { cle: 'terrains' as const, titre: t('groupe.terrains'), data: ordonner(resultats.terrains.map(x => modeleTerrain(x, ctx))) },
      { cle: 'activites' as const, titre: t('groupe.activites'), data: ordonner(resultats.activites.map(a => modeleActivite(a, ctx))) },
      { cle: 'publications' as const, titre: t('groupe.publications'), data: ordonner(resultats.publications.map(p => modelePublication(p, ctx))) },
    ].filter(sec => sec.data.length && (recherche.segment === 'tout' || recherche.segment === sec.cle));
  }, [resultats, refs, t, langue, recherche.segment, recherche.tri]);

  const total = sections.reduce((n, sec) => n + sec.data.length, 0);
  const comptes: Record<Segment, number> = resultats
    ? { villas: resultats.villas.length, terrains: resultats.terrains.length, activites: resultats.activites.length, publications: resultats.publications.length, tout: 0 }
    : { villas: 0, terrains: 0, activites: 0, publications: 0, tout: 0 };
  comptes.tout = comptes.villas + comptes.terrains + comptes.activites + comptes.publications;
  const segments: [Segment, string][] = [['tout', t('segment.tout')], ['villas', t('rubrique.villas')], ['terrains', t('rubrique.terrains')], ['activites', t('rubrique.activites')], ['publications', t('rubrique.publications')]];

  // Carte : proposée dès qu'un terrain affiché est géolocalisé.
  const terrainsGeolocalises = (resultats?.terrains ?? []).filter(x => estNombre(x.latitude) && estNombre(x.longitude));
  const carteDisponible = terrainsGeolocalises.length > 0 && (recherche.segment === 'tout' || recherche.segment === 'terrains');

  // Critères actifs de la rubrique affichée, retirables d'un geste.
  const c = recherche.criteres;
  const logement = filtresLogement(recherche.segment);
  const terrain = filtresTerrain(recherche.segment);
  const aDesFiltres = logement || terrain;
  const actifs: { cle: string; texte: string; retirer: () => void }[] = [];
  const retirer = (champCritere: keyof typeof c) => () => majRecherche({ criteres: { ...c, [champCritere]: 'all' } });
  if (logement) {
    if (c.ville !== 'all') actifs.push({ cle: 'ville', texte: libelle(refs, 'localisations', c.ville, c.ville, langue), retirer: retirer('ville') });
    if (c.location !== 'all') actifs.push({ cle: 'location', texte: c.location === 'lagune' ? t('filtres.lagune') : t('filtres.ocean'), retirer: retirer('location') });
    if (c.cat !== 'all') actifs.push({ cle: 'cat', texte: c.cat === 'piscine' ? t('filtres.piscine') : libelle(refs, 'categories', c.cat, c.cat, langue), retirer: retirer('cat') });
    if (c.budget !== 'all') actifs.push({ cle: 'budget', texte: c.budget === 'eco' ? '≤ 250 000 F' : '≥ 250 000 F', retirer: retirer('budget') });
    if (c.guests !== 'all') actifs.push({ cle: 'guests', texte: ({ '2-6': t('filtres.v26'), '8-12': t('filtres.v812'), '12+': t('filtres.v12') } as Record<string, string>)[c.guests] || c.guests, retirer: retirer('guests') });
    if (c.chambres !== 'all') actifs.push({ cle: 'chambres', texte: t('filtres.chambresMin', { n: c.chambres }), retirer: retirer('chambres') });
    if (c.equip !== 'all') {
      c.equip.split(',').forEach(code => actifs.push({
        cle: `equip:${code}`, texte: libelle(refs, 'equipements', code, code, langue),
        retirer: () => { const reste = c.equip.split(',').filter(x => x !== code); majRecherche({ criteres: { ...c, equip: reste.length ? reste.join(',') : 'all' } }); },
      }));
    }
  }
  if (terrain && recherche.terrains.ville !== 'all') actifs.push({ cle: 't-ville', texte: t('filtres.prefixeTerrains', { x: libelle(refs, 'localisations', recherche.terrains.ville, recherche.terrains.ville, langue) }), retirer: () => majRecherche({ terrains: { ...recherche.terrains, ville: 'all' } }) });
  if (terrain && recherche.terrains.foncier !== 'all') {
    const exemple = donnees?.terrains.find(x => x.landStatus === recherche.terrains.foncier);
    actifs.push({ cle: 't-foncier', texte: t('filtres.prefixeTerrains', { x: exemple ? libelleFoncier(exemple, t) : recherche.terrains.foncier }), retirer: () => majRecherche({ terrains: { ...recherche.terrains, foncier: 'all' } }) });
  }

  const toutEffacer = () => {
    setTexte('');
    majRecherche({ texte: '', criteres: criteresVides(), terrains: criteresTerrainsVides() });
  };

  const Action = ({ icone, texte: libelleAction, actif, onPress }: { icone: NomIcone; texte: string; actif?: boolean; onPress: () => void }) => (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} style={({ pressed }) => [s.action, actif && s.actionActive, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <Icone nom={icone} taille={15} couleur={actif ? '#151837' : C.marque} />
      <Text style={[s.actionTexte, actif && { color: '#151837' }]}>{libelleAction}</Text>
    </Pressable>
  );

  return (
    <View style={s.ecran}>
      <EnTete titre={t('explorer.titre')}>
        <View style={s.rechercheLigne}>
          <View style={s.champ}>
            <Icone nom="search" taille={19} couleur="#151837" />
            <TextInput
              ref={champ}
              value={texte}
              onChangeText={setTexte}
              placeholder={t('explorer.placeholder')}
              placeholderTextColor="#8a90a3"
              style={s.champTexte}
              returnKeyType="search"
              autoCorrect={false}
            />
            {texte ? (
              <Pressable onPress={() => { setTexte(''); majRecherche({ texte: '' }); }} hitSlop={10} accessibilityLabel={t('explorer.effacer')}>
                <Icone nom="close-circle" taille={20} couleur="#8a90a3" />
              </Pressable>
            ) : null}
          </View>
          {/* Les activités n'ont pas de filtres (recherche texte seulement, comme sur le site). */}
          {aDesFiltres ? (
            <Pressable onPress={() => { vibrerSelection(); router.push({ pathname: '/filtres', params: { rubrique: recherche.segment } }); }} style={({ pressed }) => [s.filtres, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={t('filtres')}>
              <Icone nom="options-outline" taille={22} couleur={C.enteteIcone} />
              {actifs.length ? <View style={s.compte}><Text style={s.compteTexte}>{actifs.length}</Text></View> : null}
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.segments} style={{ marginHorizontal: -16 }}>
          {segments.map(([cle, nom]) => (
            <Puce key={cle} sombre texte={nom} compte={donnees ? comptes[cle] : undefined} actif={recherche.segment === cle}
              onPress={() => { majRecherche({ segment: cle }); liste.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false }); }} />
          ))}
        </ScrollView>
      </EnTete>

      {horsLigne && donnees ? <BandeauHorsLigne majLe={majLe} /> : null}

      {!donnees ? (
        horsLigne
          ? <EtatVide icone="cloud-offline-outline" titre={t('horsLigne.titre')} texte={t('horsLigne.court')} action={<Bouton texte={t('reessayer')} icone="refresh" onPress={actualiser} />} />
          : <View style={{ padding: 16 }}><Squelettes nombre={5} /></View>
      ) : (
        <SectionList
          ref={liste}
          sections={sections}
          keyExtractor={item => `${item.type}:${item.id}`}
          renderItem={({ item, index }) => <Ligne modele={item} rang={index} />}
          renderSectionHeader={({ section }) => recherche.segment === 'tout'
            ? <View style={s.groupe}><Text style={s.groupeTitre}>{section.titre}</Text><Text style={s.groupeNb}>{section.data.length}</Text></View>
            : null}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={s.contenu}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          refreshControl={<RefreshControl refreshing={tire} tintColor={C.marque} colors={['#151837']} onRefresh={async () => { setTire(true); await actualiser(); setTire(false); }} />}
          ListHeaderComponent={
            <View>
              {actifs.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actifs} style={{ marginHorizontal: -16 }}>
                  {actifs.map(a => (
                    <Pressable key={a.cle} onPress={() => { vibrerSelection(); a.retirer(); }} style={s.actif} accessibilityRole="button" accessibilityLabel={t('retirer', { x: a.texte })}>
                      <Text style={s.actifTexte}>{a.texte}</Text>
                      <Icone nom="close" taille={15} couleur={C.marque} />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={s.barreResultats}>
                <Text style={s.resultat}>{t(total > 1 ? 'annonce.plusieurs' : 'annonce.un', { n: total })}</Text>
                <View style={s.actions}>
                  {carteDisponible ? <Action icone="map-outline" texte={t('carte')} onPress={() => router.push('/carte')} /> : null}
                  <Action icone="swap-vertical" texte={t('trier')} actif={recherche.tri !== 'recommande'} onPress={() => router.push('/tri')} />
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EtatVide icone="search" titre={t('vide.titre')} texte={t('vide.texte')}
              action={actifs.length || recherche.texte ? <Bouton texte={t('vide.effacer')} onPress={toutEffacer} /> : undefined} />
          }
        />
      )}
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.fond },
  rechercheLigne: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  champ: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 999, backgroundColor: C.champEntete, paddingHorizontal: 14 },
  champTexte: { flex: 1, fontSize: 16, color: '#151837', paddingVertical: 0, outlineStyle: 'none' } as never,
  filtres: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.enteteBouton, alignItems: 'center', justifyContent: 'center' },
  compte: { position: 'absolute', top: -2, right: -2, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: C.or, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  compteTexte: { fontSize: 11, fontWeight: '800', color: '#151837' },
  segments: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  contenu: { paddingHorizontal: 16, paddingBottom: 32 },
  actifs: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  actif: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 999, backgroundColor: C.orPale, borderWidth: 1, borderColor: C.orBord },
  actifTexte: { fontSize: 13, fontWeight: '700', color: C.marque },
  barreResultats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  resultat: { fontSize: 13, fontWeight: '600', color: C.texte2 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.carte, borderWidth: 1, borderColor: C.bord },
  actionActive: { backgroundColor: C.or, borderColor: C.or },
  actionTexte: { fontSize: 13, fontWeight: '700', color: C.marque },
  groupe: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  groupeTitre: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: C.texte3 },
  groupeNb: { fontSize: 12.5, fontWeight: '800', color: C.texte3 },
}));
