/**
 * Accueil : formulaire de recherche (mêmes critères que la barre de l'accueil
 * du site, plus les dates du séjour), les quatre rubriques et « À la une ».
 * Les dates ne filtrent pas les annonces (le site n'a pas de disponibilités) :
 * elles sont reprises dans le devis.
 */
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChampChoix } from '@/composants/ChampChoix';
import { BoutonProfil } from '@/composants/EnTete';
import { ChampDate } from '@/composants/ChampDate';
import { Ligne, modeleActivite, modeleTerrain, modeleVilla } from '@/composants/Ligne';
import { ouvrirLien, vibrerImpact, vibrerSelection } from '@/composants/outils';
import { Squelettes } from '@/composants/Squelettes';
import { BandeauHorsLigne, Bouton, BoutonRond, EtatVide, Icone, TitreSection, type NomIcone } from '@/composants/ui';
import { TELEPHONE } from '@/donnees/config';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { CRITERES_HORS_THEME, dateISO, libelle } from '@/donnees/regles';
import { creerStyles } from '@/donnees/theme';
import type { Criteres, Segment } from '@/donnees/types';

export default function Accueil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { donnees, horsLigne, majLe, actualiser, recherche, majRecherche, devis, majDevis } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [tire, setTire] = useState(false);

  const allerExplorer = (segment: Segment) => {
    vibrerSelection();
    majRecherche({ segment });
    router.navigate('/explorer');
  };

  const refs = donnees?.refs ?? null;
  const ctx = { refs, t, langue };
  const rubriques: { segment: Segment; icone: NomIcone; nom: string; nb: number }[] = donnees ? [
    { segment: 'villas', icone: 'home-outline', nom: t('rubrique.villas'), nb: donnees.villas.length },
    { segment: 'terrains', icone: 'map-outline', nom: t('rubrique.terrains'), nb: donnees.terrains.length },
    { segment: 'activites', icone: 'boat-outline', nom: t('rubrique.activites'), nb: donnees.activites.length },
    { segment: 'publications', icone: 'logo-facebook', nom: t('rubrique.publications'), nb: donnees.publications.length },
  ] : [];

  // « À la une » : les annonces mises en avant dans le studio ; à défaut, deux
  // résidences, un terrain et une activité pour donner un aperçu de chaque rubrique.
  const vedettes = donnees ? [
    ...donnees.villas.filter(v => v.featured).map(v => modeleVilla(v, ctx)),
    ...donnees.terrains.filter(x => x.featured).map(x => modeleTerrain(x, ctx)),
    ...donnees.activites.filter(a => a.featured).map(a => modeleActivite(a, ctx)),
  ] : [];
  const aLaUne = (vedettes.length ? vedettes : donnees ? [
    ...donnees.villas.slice(0, 2).map(v => modeleVilla(v, ctx)),
    ...donnees.terrains.slice(0, 1).map(x => modeleTerrain(x, ctx)),
    ...donnees.activites.slice(0, 1).map(a => modeleActivite(a, ctx)),
  ] : []).slice(0, 4);

  // Formulaire de recherche : options calculées comme sur le site (une ville
  // n'est proposée que si au moins une résidence ou publication y est rattachée).
  const c = recherche.criteres;
  const choisir = (champ: keyof Criteres) => (valeur: string) => majRecherche({ criteres: { ...recherche.criteres, [champ]: valeur } });
  const logements = donnees ? [...donnees.villas, ...donnees.publications.map(p => p.fiche).filter(Boolean)] as { localisationId?: string }[] : [];
  const villesUtilisees = new Set(logements.map(b => b.localisationId).filter(Boolean));
  const villes = (refs?.localisations || []).filter(v => (v.actif !== false && villesUtilisees.has(v.id)) || v.id === c.ville);
  const categories = (refs?.categories || []).filter(cat => cat.actif !== false && !CRITERES_HORS_THEME.includes(cat.id));
  const aujourdhui = dateISO(new Date());

  const changerArrivee = (arrivee: string) => majDevis(d => {
    if (d.depart && d.depart > arrivee) return { arrivee };
    const lendemain = new Date(`${arrivee}T12:00:00`);
    lendemain.setDate(lendemain.getDate() + 1);
    return { arrivee, depart: dateISO(lendemain) };
  });

  return (
    <View style={s.ecran}>
      <View style={[s.entete, { paddingTop: insets.top + 10 }]}>
        <View style={s.marqueLigne}>
          <View style={s.marque}>
            <View style={s.logo}><Image source={require('@/assets/images/logo.png')} style={{ width: 34, height: 34 }} contentFit="contain" /></View>
            <View>
              <Text style={s.marqueNom}>Détente & Loisirs</Text>
              <Text style={s.marqueLieu}>{t('accueil.lieu')}</Text>
            </View>
          </View>
          <View style={s.boutonsEntete}>
            <BoutonRond icone="call" variante="sombre" label={t('accueil.appeler')} onPress={() => ouvrirLien(`tel:${TELEPHONE}`, t)} />
            <BoutonProfil />
          </View>
        </View>
        <Text style={s.titre}>{t('accueil.titre')}</Text>
      </View>

      {horsLigne && donnees ? <BandeauHorsLigne majLe={majLe} /> : null}

      <ScrollView
        contentContainerStyle={s.contenu}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={tire} tintColor={C.marque} colors={['#151837']} onRefresh={async () => { setTire(true); await actualiser(); setTire(false); }} />}>
        {!donnees ? (
          horsLigne ? (
            <EtatVide icone="cloud-offline-outline" titre={t('horsLigne.titre')} texte={t('horsLigne.texte')} action={<Bouton texte={t('reessayer')} icone="refresh" onPress={actualiser} />} />
          ) : (
            <View style={{ paddingTop: 18 }}><Squelettes nombre={4} /></View>
          )
        ) : (
          <>
            <View style={s.formulaire}>
              <ChampChoix libelle={t('recherche.localisation')} icone="location-outline" valeur={c.ville} onChange={choisir('ville')}
                options={[['all', t('filtres.toutes')], ...villes.map(v => [v.id, v.nom || v.id] as [string, string])]} />
              <View style={s.rangee}>
                <ChampChoix libelle={t('recherche.emplacement')} icone="water-outline" valeur={c.location} onChange={choisir('location')}
                  options={[['all', t('filtres.tous')], ['lagune', t('filtres.lagune')], ['ocean', t('filtres.ocean')]]} />
                <ChampChoix libelle={t('recherche.type')} icone="home-outline" valeur={c.cat} onChange={choisir('cat')}
                  options={[['all', t('filtres.tous')], ['piscine', t('filtres.piscine')], ...categories.map(cat => [cat.id, libelle(refs, 'categories', cat.id, '', langue)] as [string, string])]} />
              </View>
              <View style={s.rangee}>
                <ChampChoix libelle={t('recherche.budget')} icone="pricetag-outline" valeur={c.budget} onChange={choisir('budget')}
                  options={[['all', t('filtres.tous')], ['eco', '≤ 250 000 F'], ['luxe', '≥ 250 000 F']]} />
                <ChampChoix libelle={t('recherche.voyageurs')} icone="people-outline" valeur={c.guests} onChange={choisir('guests')}
                  options={[['all', t('filtres.tous')], ['2-6', t('filtres.v26')], ['8-12', t('filtres.v812')], ['12+', t('filtres.v12')]]} />
              </View>
              {devis.arrivee && devis.depart ? (
                <View style={s.rangee}>
                  <ChampDate plat libelle={t('recherche.arrivee')} valeur={devis.arrivee} minimum={aujourdhui} onChange={changerArrivee} />
                  <ChampDate plat libelle={t('recherche.depart')} valeur={devis.depart} minimum={devis.arrivee} onChange={depart => majDevis({ depart })} />
                </View>
              ) : null}
              <View style={s.boutons}>
                <Pressable
                  onPress={() => { vibrerImpact(); majRecherche({ segment: 'villas', texte: '' }); router.navigate('/explorer'); }}
                  style={({ pressed }) => [s.rechercher, pressed && { transform: [{ scale: 0.98 }] }]}
                  accessibilityRole="search">
                  <Icone nom="search" taille={19} couleur="#151837" />
                  <Text style={s.rechercherTexte}>{t('recherche.bouton')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { vibrerSelection(); router.push({ pathname: '/filtres', params: { rubrique: 'villas' } }); }}
                  style={({ pressed }) => [s.plus, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('recherche.plus')}>
                  <Icone nom="options-outline" taille={22} couleur={C.marque} />
                </Pressable>
              </View>
            </View>

            <View style={s.rubriques}>
              {rubriques.map(r => (
                <Pressable key={r.segment} onPress={() => allerExplorer(r.segment)} style={({ pressed }) => [s.rubrique, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button">
                  <View style={s.rubriqueIcone}><Icone nom={r.icone} taille={22} couleur={C.marque} /></View>
                  <Text style={s.rubriqueNom} numberOfLines={1}>{r.nom}</Text>
                  <Text style={s.rubriqueNb}>{r.nb}</Text>
                </Pressable>
              ))}
            </View>

            {aLaUne.length ? (
              <>
                <TitreSection titre={t('aLaUne')} action={t('toutVoir')} onAction={() => allerExplorer('tout')} />
                {aLaUne.map((modele, i) => <Ligne key={`${modele.type}:${modele.id}`} modele={modele} rang={i} />)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.fond },
  entete: { backgroundColor: C.entete, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  marqueLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boutonsEntete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  marqueNom: { color: C.enteteTexte, fontSize: 15.5, fontWeight: '700' },
  marqueLieu: { color: C.enteteTexte2, fontSize: 12.5 },
  titre: { color: C.enteteTexte, fontSize: 25, fontWeight: '800', letterSpacing: -0.4, marginTop: 16 },
  contenu: { paddingHorizontal: 16, paddingBottom: 32 },
  formulaire: { marginTop: 16, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16, borderRadius: 20, backgroundColor: C.carte, boxShadow: C.ombre, borderWidth: C.sombre ? 1 : 0, borderColor: C.bord },
  rangee: { flexDirection: 'row', gap: 14 },
  boutons: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  rechercher: { flex: 1, height: 50, borderRadius: 999, backgroundColor: C.or, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rechercherTexte: { fontSize: 15.5, fontWeight: '800', color: '#151837', letterSpacing: 0.3, textTransform: 'uppercase' },
  plus: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  rubriques: { flexDirection: 'row', gap: 8, marginTop: 18 },
  rubrique: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: C.carte, boxShadow: C.ombre },
  rubriqueIcone: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  rubriqueNom: { fontSize: 12, fontWeight: '700', color: C.texte },
  rubriqueNb: { fontSize: 11, fontWeight: '600', color: C.texte3 },
}));
