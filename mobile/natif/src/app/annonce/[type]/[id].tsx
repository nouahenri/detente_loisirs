/**
 * Vue détaillée d'une annonce : résidence, terrain, activité ou publication.
 * Galerie plein cadre, fiche complète, barre d'actions fixée en bas.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvisAnnonce } from '@/composants/AvisAnnonce';
import { couleurFoncier } from '@/composants/carteHtml';
import { CarteTerrains } from '@/composants/CarteTerrains';
import { Galerie } from '@/composants/Galerie';
import { libelleFoncier } from '@/composants/Ligne';
import { ouvrirLien, partager, revenir, vibrerImpact, vibrerSelection } from '@/composants/outils';
import { Bouton, BoutonRond, Carte, EtatVide, Etiquette, Icone, type NomIcone } from '@/composants/ui';
import { lienPartage, TAUX_EUR, TELEPHONE } from '@/donnees/config';
import { boiteVehicule, carburantVehicule, categorieVehicule, modeChauffeur, prixAPartirDe } from '@/donnees/location';
import { dateLongue } from '@/donnees/i18n';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import {
  cadreVilla, changerFormule, CRITERES_HORS_THEME, estIndisponible, estNombre, euro, fcfa, fiche, libelle, lienWhatsApp,
  messageActivite, messagePublication, messageTerrain, messageVilla, nombre, photosPublication,
  tarifActivite, titrePublication, uniteActivite, VIABILISATION,
} from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';
import type { ResumeAvis, TypeAnnonce } from '@/donnees/types';

const ICONES_VIABILISATION: Record<string, NomIcone> = {
  eau: 'water-outline', electricite: 'flash-outline', 'voie-bitumee': 'trail-sign-outline',
  assainissement: 'filter-outline', cloture: 'grid-outline', borne: 'flag-outline',
};

type Contenu = {
  titre: string; images: string[]; avis?: ResumeAvis; etiquettes: ReactNode; accroche?: string; lieu?: string;
  specs: [NomIcone, string, string][]; corps: ReactNode; partage?: { titre: string; texte: string; url: string } | null;
  prix?: { montant: string; detail?: string } | null;
  actions: ReactNode;
};

const specs = (liste: ([NomIcone, string, string] | null)[]) => liste.filter((x): x is [NomIcone, string, string] => Boolean(x));

export default function Annonce() {
  // `avis=1` : ouverte depuis le lien « N avis » d'une carte, la fiche descend jusqu'aux avis.
  const { type, id, avis: versAvis } = useLocalSearchParams<{ type: TypeAnnonce; id: string; avis?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { donnees, favoris, basculerFavori, majDevis } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [barrePleine, setBarrePleine] = useState(false);
  const defilement = useRef<ScrollView>(null);
  const ancreFaite = useRef(false);
  const hauteurGalerie = Math.round(Math.min(height * 0.48, 440));
  const cle = `${type}:${id}`;
  const favori = favoris.includes(cle);
  const refs = donnees?.refs ?? null;
  const lien = (url: string) => ouvrirLien(url, t);

  const allerAuDevis = (modif: Parameters<typeof majDevis>[0]) => {
    vibrerImpact();
    majDevis(modif);
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/devis');
  };

  let contenu: Contenu | null = null;

  if (donnees && type === 'villa') {
    const v = donnees.villas.find(x => x.id === id);
    if (v) {
      const indispo = estIndisponible(v);
      const theme = v.category && !CRITERES_HORS_THEME.includes(v.category) ? libelle(refs, 'categories', v.category, v.categoryLabel, langue) : '';
      const equipements = (v.equipements || []).map(code => libelle(refs, 'equipements', code, '', langue)).filter(Boolean);
      const couchages = fiche(v, 'beds', langue);
      contenu = {
        titre: v.name, images: v.images, avis: v.avis, accroche: fiche(v, 'tagline', langue), lieu: v.location,
        etiquettes: <>
          {indispo ? <Etiquette texte={t('ligne.indisponible')} ton="gris" /> : <Etiquette texte={v.badge ? libelle(refs, 'badges', v.badgeId, v.badge, langue) : ''} ton="or" />}
          <Etiquette texte={t(`cadre.${cadreVilla(v)}` as 'cadre.terre')} ton="gris" />
          <Etiquette texte={theme} ton="gris" />
        </>,
        specs: specs([
          v.capacity > 0 ? ['people-outline', String(v.capacity), t('fiche.personnes')] : null,
          v.bedrooms > 0 ? ['bed-outline', String(v.bedrooms), v.bedrooms > 1 ? t('fiche.chambres') : t('fiche.chambre')] : null,
          v.bathrooms > 0 ? ['water-outline', String(v.bathrooms), v.bathrooms > 1 ? t('fiche.sdbs') : t('fiche.sdb')] : null,
        ]),
        corps: <>
          {v.weekendPackage > 0 ? <Carte titre={t('fiche.forfaitWeekend')}><Text style={s.montant}>{fcfa(v.weekendPackage)}</Text></Carte> : null}
          <TexteLong titre={t('fiche.aPropos')} texte={fiche(v, 'description', langue)} C={C} />
          {couchages ? <Carte titre={t('fiche.couchages')}><Text style={s.texte}>{couchages}</Text></Carte> : null}
          {equipements.length ? <Carte titre={t('fiche.equipements')}><View style={s.pastilles}>{equipements.map(e => <Text key={e} style={s.pastille}>{e}</Text>)}</View></Carte> : null}
          <ListeCoches titre={t('fiche.prestations')} elements={fiche(v, 'features', langue)} C={C} />
          <ListeCoches titre={t('fiche.pointsForts')} elements={fiche(v, 'highlights', langue)} C={C} />
        </>,
        partage: { titre: v.name, texte: t('fiche.partageVilla', { x: v.name }), url: lienPartage('villa', v.id) },
        prix: v.pricePerNight > 0 ? { montant: fcfa(v.pricePerNight), detail: t('fiche.parNuitEuro', { x: euro(v.priceEuro || v.pricePerNight / TAUX_EUR) }) } : null,
        actions: <>
          <Bouton texte={t('fiche.devis')} variante="contour" desactive={indispo} onPress={() => allerAuDevis(d => ({
            // Autre formule en cours : nouvelle demande, rien d'ancien ne s'ajoute en silence (21/09/2026).
            ...(d.mode === 'sejour' ? {} : changerFormule(donnees, d, 'sejour', false)), villaId: v.id, filtre: 'all', etape: 2,
          }))} />
          <Bouton texte={t('fiche.reserver')} icone="logo-whatsapp" variante="wa" onPress={() => lien(lienWhatsApp(messageVilla(v)))} />
        </>,
      };
    }
  } else if (donnees && type === 'terrain') {
    const te = donnees.terrains.find(x => x.id === id);
    if (te) {
      const viabilisation = te.utilities.filter(u => VIABILISATION[u]);
      const coordonnees = estNombre(te.latitude) && estNombre(te.longitude);
      const titre = fiche(te, 'title', langue);
      contenu = {
        titre, images: te.images, avis: te.avis, accroche: te.district, lieu: te.location,
        etiquettes: <>
          <Etiquette texte={libelle(refs, 'statuts', `terrain:${te.status}`, t(`terrain.${te.status}` as 'terrain.disponible'), langue)} ton={te.status === 'disponible' ? 'vert' : 'or'} />
          <Etiquette texte={te.badge ? libelle(refs, 'badges', te.badgeId, te.badge, langue) : ''} ton="or" />
          <Etiquette texte={te.reference} ton="gris" />
        </>,
        specs: specs([
          te.areaSqm > 0 ? ['resize-outline', `${nombre(te.areaSqm)} m²`, t('fiche.superficie')] : null,
          te.pricePerSqm > 0 ? ['pricetag-outline', `${nombre(te.pricePerSqm)} F`, t('fiche.prixM2')] : null,
          ['shield-checkmark-outline', libelleFoncier(te, t).split(' (')[0], t('fiche.statutFoncier')],
        ]),
        corps: <>
          <TexteLong titre={t('fiche.description')} texte={fiche(te, 'description', langue)} C={C} />
          <Carte titre={t('fiche.viabilisation')}>
            {viabilisation.length ? viabilisation.map(u => (
              <View key={u} style={s.coche}><Icone nom={ICONES_VIABILISATION[u] || 'checkmark'} taille={18} couleur={C.ok} /><Text style={s.cocheTexte}>{t(`viab.${u}` as 'viab.eau')}</Text></View>
            )) : <Text style={s.texte}>{t('fiche.viabAConfirmer')}</Text>}
          </Carte>
          <ListeCoches titre={t('fiche.pointsForts')} elements={fiche(te, 'highlights', langue)} C={C} />
          {coordonnees ? (
            <Carte titre={t('fiche.emplacement')}>
              <CarteTerrains
                interactive={false}
                points={[{ id: te.id, titre, detail: '', latitude: te.latitude as number, longitude: te.longitude as number, calque: te.landStatus }]}
                calques={[{ cle: te.landStatus, libelle: '', couleur: couleurFoncier(te.landStatus) }]}
                focus={te.id}
                style={s.miniCarte}
              />
              <Bouton texte={t('fiche.voirCarte')} icone="map-outline" variante="contour" style={{ marginTop: 12 }}
                onPress={() => { vibrerSelection(); router.push({ pathname: '/carte', params: { focus: te.id } }); }} />
            </Carte>
          ) : null}
        </>,
        partage: { titre, texte: t('fiche.partageTerrain', { x: titre }), url: lienPartage('terrain', te.id) },
        prix: te.priceTotal > 0 ? { montant: fcfa(te.priceTotal), detail: euro(te.priceEuro) } : null,
        actions: <>
          <BoutonRond icone="call" variante="clair" label={t('fiche.appeler')} taille={50} onPress={() => lien(`tel:${TELEPHONE}`)} />
          <Bouton texte={t('fiche.visiter')} icone="logo-whatsapp" variante="wa" onPress={() => lien(lienWhatsApp(messageTerrain(te)))} />
        </>,
      };
    }
  } else if (donnees && type === 'activite') {
    const a = donnees.activites.find(x => x.id === id);
    if (a) {
      const montant = Math.round(Number(a.priceAmount) || 0);
      const titre = fiche(a, 'title', langue);
      contenu = {
        titre, images: a.images, avis: a.avis, accroche: fiche(a, 'subtitle', langue),
        etiquettes: <Etiquette texte={a.badge ? libelle(refs, 'badges', a.badgeId, a.badge, langue) : ''} ton="or" />,
        specs: a.duration ? [['time-outline', String(fiche(a, 'duration', langue)), t('fiche.duree')]] : [],
        corps: <>
          <Carte titre={t('fiche.tarif')}><Text style={s.montant}>{tarifActivite(a, langue)}</Text></Carte>
          <TexteLong titre={t('fiche.description')} texte={fiche(a, 'description', langue)} C={C} />
        </>,
        partage: { titre, texte: t('fiche.partageVilla', { x: titre }), url: lienPartage('activite', a.id) },
        prix: montant > 0 ? { montant: fcfa(montant), detail: t(`unite.${uniteActivite(a)}`) } : null,
        actions: <>
          <Bouton texte={t('fiche.devis')} variante="contour" onPress={() => allerAuDevis(d => {
            const avec = d.activites.includes(a.id) ? d.activites : [...d.activites, a.id];
            // Séjour déjà choisi : l'activité s'y ajoute, à l'étape « Activités » (3e) du séjour.
            if (d.mode === 'sejour' && d.villaId) return { activites: avec, etape: 3 };
            if (d.mode === 'activites') return { activites: avec, etape: 1 };
            return { ...changerFormule(donnees, d, 'activites', false), activites: [a.id], etape: 1 };
          })} />
          <Bouton texte={t('fiche.reserver')} icone="logo-whatsapp" variante="wa" onPress={() => lien(lienWhatsApp(messageActivite(a)))} />
        </>,
      };
    }
  } else if (donnees && type === 'vehicule') {
    // Location de voitures (17/09/2026) : formule, tarifs dégressifs, conditions, réservation.
    const v = donnees.vehicules.find(x => x.id === id);
    if (v) {
      const aPartir = prixAPartirDe(v);
      const conditions = donnees.location.conditions[langue] || donnees.location.conditions.fr;
      const tarifs: [string, number][] = [
        [t('fiche.tarifJour'), v.pricePerDay],
        [t('fiche.tarifSemaine'), v.pricePerDayWeek || v.pricePerDay],
        [t('fiche.tarifMois'), v.pricePerDayMonth || v.pricePerDayWeek || v.pricePerDay],
      ];
      const ligneTarif = (libelleTarif: string, valeur: string) => (
        <View key={libelleTarif} style={s.tarifLigne}><Text style={s.tarifLibelle}>{libelleTarif}</Text><Text style={s.tarifValeur}>{valeur}</Text></View>
      );
      contenu = {
        titre: v.name, images: v.images, avis: v.avis, accroche: fiche(v, 'tagline', langue),
        etiquettes: <>
          <Etiquette texte={v.badge ? libelle(refs, 'badges', v.badgeId, v.badge, langue) : ''} ton="or" />
          <Etiquette texte={categorieVehicule(v.category, langue) + (v.year ? ` · ${v.year}` : '')} ton="gris" />
          <Etiquette texte={modeChauffeur(v.driverMode, langue)} ton="gris" />
        </>,
        specs: specs([
          ['people-outline', String(v.seats || 5), t('fiche.places')],
          ['settings-outline', boiteVehicule(v.transmission, langue), t('fiche.boite')],
          ['water-outline', carburantVehicule(v.fuel, langue), t('fiche.carburant')],
        ]),
        corps: <>
          <Carte titre={t('fiche.formule')}>
            <Text style={s.texte}>{t(v.driverMode === 'avec' ? 'fiche.modeAvec' : v.driverMode === 'sans' ? 'fiche.modeSans' : 'fiche.modeChoix')}</Text>
            {v.driverMode !== 'avec' ? <Text style={[s.texte, { marginTop: 6 }]}>{t('fiche.conducteur', { age: v.minAge || 21, n: v.licenseYears || 0 })}</Text> : null}
          </Carte>
          {v.pricePerDay > 0 ? (
            <Carte titre={t('fiche.tarifs')}>
              {tarifs.map(([periode, prix]) => ligneTarif(periode, `${fcfa(prix)} ${t('louer.parJour')}`))}
              {v.driverMode !== 'sans' ? ligneTarif(t('fiche.chauffeurJour'), v.driverPricePerDay ? fcfa(v.driverPricePerDay) : t('fiche.inclus')) : null}
              {v.driverMode !== 'avec' && v.deposit ? ligneTarif(t('fiche.caution'), fcfa(v.deposit)) : null}
              {ligneTarif(t('fiche.km'), v.kmIncludedPerDay ? t('fiche.kmInclus', { n: v.kmIncludedPerDay, x: fcfa(v.extraKmPrice) }) : t('fiche.kmIllimite'))}
              {v.minDays > 1 ? <Text style={[s.texte, { marginTop: 6 }]}>{t('fiche.minJours', { n: v.minDays })}</Text> : null}
            </Carte>
          ) : null}
          <TexteLong titre={t('fiche.description')} texte={fiche(v, 'description', langue)} C={C} />
          {/* La climatisation est un équipement coché au studio (20/09/2026) :
              elle arrive dans `features`, sans être ajoutée une seconde fois. */}
          <ListeCoches titre={t('fiche.equipements')} elements={fiche(v, 'features', langue) || []} C={C} />
          {conditions ? <TexteLong titre={t('louer.conditions')} texte={conditions} C={C} /> : null}
        </>,
        partage: { titre: v.name, texte: t('fiche.partageVoiture', { x: v.name }), url: lienPartage('vehicule', v.id) },
        prix: aPartir > 0 ? { montant: t('ligne.des', { x: fcfa(aPartir) }), detail: t('ligne.parJour') } : null,
        actions: <>
          <BoutonRond icone="logo-whatsapp" variante="clair" label="WhatsApp" taille={50} onPress={() => lien(lienWhatsApp(`Bonjour Henri & Philippe, je souhaite louer « ${v.name} ».`))} />
          <Bouton texte={t('fiche.louer')} icone="car-sport-outline" onPress={() => { vibrerImpact(); router.push({ pathname: '/louer-voiture', params: { id: v.id } }); }} />
        </>,
      };
    }
  } else if (donnees && type === 'publication') {
    const p = donnees.publications.find(x => x.id === id);
    if (p) {
      const f = p.fiche || {};
      const paragraphes = String(p.message || t('fiche.nouvellePublication')).split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
      contenu = {
        titre: f.name || titrePublication(p), images: photosPublication(p), accroche: f.tagline, lieu: f.location,
        etiquettes: <>
          <Etiquette texte={p.video ? t('fiche.videoFb') : t('fiche.publicationFb')} ton="fb" />
          <Etiquette texte={dateLongue(p.created_time, langue)} ton="gris" />
        </>,
        specs: specs([
          estNombre(f.capacity) ? ['people-outline', String(f.capacity), t('fiche.personnes')] : null,
          estNombre(f.bedrooms) ? ['bed-outline', String(f.bedrooms), t('fiche.chambres')] : null,
          estNombre(f.bathrooms) ? ['water-outline', String(f.bathrooms), t('fiche.sdbs')] : null,
        ]),
        corps: <>
          <Carte>{paragraphes.map((texte, i) => <Text key={i} style={[s.texte, i > 0 && { marginTop: 10 }]}>{texte}</Text>)}</Carte>
          {p.video && p.video.url ? (
            <Bouton texte={t('fiche.regarderVideo')} icone="play-circle-outline" style={{ marginTop: 14 }} onPress={() => lien(p.permalink_url || p.video?.url || '')} />
          ) : null}
          {p.permalink_url ? <Bouton texte={t('fiche.voirFacebook')} icone="logo-facebook" variante="contour" style={{ marginTop: 12 }} onPress={() => lien(p.permalink_url || '')} /> : null}
        </>,
        partage: p.permalink_url ? { titre: titrePublication(p), texte: titrePublication(p), url: p.permalink_url } : null,
        prix: estNombre(f.pricePerNight) && f.pricePerNight > 0 ? { montant: fcfa(f.pricePerNight), detail: t('ligne.parNuit') } : null,
        actions: <Bouton texte={t('fiche.disponibilites')} icone="logo-whatsapp" variante="wa" onPress={() => lien(lienWhatsApp(messagePublication(p)))} />,
      };
    }
  }

  const boutonsHaut = (pleine: boolean) => (
    <>
      <BoutonRond icone="chevron-back" variante={pleine ? 'sombre' : 'verre'} label={t('fiche.retour')} onPress={() => revenir()} />
      <View style={{ flex: 1 }} />
      {contenu?.partage ? <BoutonRond icone="share-outline" variante={pleine ? 'sombre' : 'verre'} label={t('fiche.partager')} onPress={() => contenu?.partage && partager(contenu.partage)} /> : null}
      {contenu ? (
        <BoutonRond
          icone={favori ? 'heart' : 'heart-outline'}
          couleur={favori ? '#ff4d7e' : pleine ? C.enteteIcone : '#fff'}
          variante={pleine ? 'sombre' : 'verre'}
          label={favori ? t('favori.retirer') : t('favori.ajouter')}
          onPress={() => { vibrerSelection(); basculerFavori(cle); }}
        />
      ) : null}
    </>
  );

  if (!contenu) {
    return (
      <View style={[s.ecran, { paddingTop: insets.top + 10 }]}>
        <View style={[s.barreHaut, s.barreHautPleine, { position: 'relative' }]}>{boutonsHaut(true)}</View>
        <EtatVide icone="alert-circle-outline" titre={t('fiche.introuvable')} texte={t('fiche.introuvableTexte')} />
      </View>
    );
  }

  return (
    <View style={s.ecran}>
      {/* Texte clair sur la photo ; sombre sur la barre blanche du mode clair. */}
      <StatusBar style={barrePleine && !C.sombre ? 'dark' : 'light'} />
      <ScrollView
        ref={defilement}
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={32}
        onScroll={e => {
          const pleine = e.nativeEvent.contentOffset.y > hauteurGalerie - insets.top - 70;
          if (pleine !== barrePleine) setBarrePleine(pleine);
        }}
        contentContainerStyle={{ paddingBottom: 24 }}>
        <Galerie images={contenu.images} titre={contenu.titre} hauteur={hauteurGalerie} />
        <View style={s.fiche}>
          <View style={s.etiquettes}>{contenu.etiquettes}</View>
          <Text style={s.titre} accessibilityRole="header">{contenu.titre}</Text>
          {contenu.accroche ? <Text style={s.accroche}>{contenu.accroche}</Text> : null}
          {contenu.lieu ? <View style={s.lieu}><Icone nom="location" taille={17} couleur={C.orTexte} /><Text style={s.lieuTexte}>{contenu.lieu}</Text></View> : null}
          {contenu.specs.length ? (
            <View style={s.specs}>
              {contenu.specs.map(([icone, valeur, legende]) => (
                <View key={legende} style={s.spec}>
                  <Icone nom={icone} taille={22} couleur={C.orTexte} />
                  <Text style={s.specValeur} numberOfLines={1}>{valeur}</Text>
                  <Text style={s.specLegende} numberOfLines={1}>{legende}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {contenu.corps}
          <AvisAnnonce
            type={type}
            id={id}
            titre={contenu.titre}
            resume={contenu.avis}
            onPosition={y => {
              if (versAvis !== '1' || ancreFaite.current) return;
              ancreFaite.current = true;
              // Position dans la fiche + hauteur de la galerie, moins la barre du haut.
              setTimeout(() => defilement.current?.scrollTo({ y: Math.max(0, hauteurGalerie - 20 + y - insets.top - 64), animated: true }), 250);
            }}
          />
        </View>
      </ScrollView>

      <View style={[s.barreHaut, { paddingTop: insets.top + 6 }, barrePleine && s.barreHautPleine]}>
        {boutonsHaut(barrePleine)}
        {barrePleine ? <Text style={s.barreTitre} numberOfLines={1} pointerEvents="none">{contenu.titre}</Text> : null}
      </View>

      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {contenu.prix ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.actionsPrix} numberOfLines={1} adjustsFontSizeToFit>{contenu.prix.montant}</Text>
            {contenu.prix.detail ? <Text style={s.actionsDetail} numberOfLines={1}>{contenu.prix.detail}</Text> : null}
          </View>
        ) : <View style={{ flex: 1 }} />}
        {contenu.actions}
      </View>
    </View>
  );
}

function TexteLong({ titre, texte, C }: { titre: string; texte?: string; C: Palette }) {
  const { t } = usePreferences();
  const s = feuille(C);
  const [ouvert, setOuvert] = useState(false);
  if (!texte) return null;
  const long = texte.length > 320;
  return (
    <Carte titre={titre}>
      <Text style={s.texte} numberOfLines={long && !ouvert ? 6 : undefined}>{texte}</Text>
      {long ? (
        <Pressable onPress={() => setOuvert(o => !o)} hitSlop={8}>
          <Text style={s.lireSuite}>{ouvert ? t('fiche.reduire') : t('fiche.lireSuite')}</Text>
        </Pressable>
      ) : null}
    </Carte>
  );
}

function ListeCoches({ titre, elements, C }: { titre: string; elements: string[]; C: Palette }) {
  const s = feuille(C);
  if (!elements || !elements.length) return null;
  return (
    <Carte titre={titre}>
      {elements.map(e => (
        <View key={e} style={s.coche}><Icone nom="checkmark-circle" taille={18} couleur={C.ok} /><Text style={s.cocheTexte}>{e}</Text></View>
      ))}
    </Carte>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.fond },
  fiche: { marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: C.fond, paddingHorizontal: 16, paddingTop: 20 },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  titre: { fontSize: 25, fontWeight: '800', color: C.texte, letterSpacing: -0.4, lineHeight: 30 },
  accroche: { fontSize: 15, color: C.texte2, marginTop: 4 },
  lieu: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  lieuTexte: { fontSize: 14.5, fontWeight: '600', color: C.texte2, flex: 1 },
  specs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  spec: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14, backgroundColor: C.carte, boxShadow: C.ombre },
  specValeur: { fontSize: 15, fontWeight: '800', color: C.texte, marginTop: 2 },
  specLegende: { fontSize: 11.5, color: C.texte2 },
  texte: { fontSize: 15, lineHeight: 23, color: C.texte2 },
  montant: { fontSize: 17, fontWeight: '800', color: C.marque },
  lireSuite: { marginTop: 8, fontSize: 14, fontWeight: '700', color: C.orTexte },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surface, fontSize: 13, fontWeight: '600', color: C.texte, overflow: 'hidden' },
  coche: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  cocheTexte: { flex: 1, fontSize: 14.5, color: C.texte, lineHeight: 20 },
  miniCarte: { height: 170, borderRadius: 12 },
  tarifLigne: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.bord },
  tarifLibelle: { flex: 1, fontSize: 14, color: C.texte2 },
  tarifValeur: { fontSize: 14, fontWeight: '800', color: C.texte, textAlign: 'right', flexShrink: 1 },
  barreHaut: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  barreHautPleine: { backgroundColor: C.entete, boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' },
  barreTitre: { position: 'absolute', left: 64, right: 110, bottom: 18, color: C.enteteTexte, fontSize: 16.5, fontWeight: '700', textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.carte, borderTopWidth: 1, borderTopColor: C.bord },
  actionsPrix: { fontSize: 18, fontWeight: '800', color: C.marque },
  actionsDetail: { fontSize: 12.5, color: C.bleu, fontWeight: '800' },
}));
