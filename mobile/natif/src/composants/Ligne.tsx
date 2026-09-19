/**
 * Ligne de liste : vignette photo à gauche, texte et bouton à droite.
 * Un appui sur la ligne (ou sur « Voir ») ouvre la vue détaillée de l'annonce.
 */
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { dateCourte, type Langue, type Traduire } from '@/donnees/i18n';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import {
  cadreVilla, CRITERES_HORS_THEME, estIndisponible, estNombre, fcfa, fiche, libelle, nombre,
  photosPublication, tarifActivite, titrePublication, uniteActivite,
} from '@/donnees/regles';
import { creerStyles } from '@/donnees/theme';
import type { Activite, Publication, Referentiels, ResumeAvis, Terrain, TypeAnnonce, Villa } from '@/donnees/types';
import { nombreAvis, noteAffichee } from './AvisAnnonce';
import { ImageSite } from './ImageSite';
import { vibrerSelection } from './outils';
import { Etiquette, Icone, type NomIcone } from './ui';

export type Modele = {
  type: TypeAnnonce; id: string; image?: string; iconeVide: NomIcone; nbPhotos?: number;
  etiquette?: { texte?: string; ton: 'blanc' | 'or' | 'vert' | 'gris' | 'fb' };
  surtitre?: string; titre: string; lieu?: string; faits: [NomIcone, string][];
  prix?: { montant: string; unite?: string } | { texte: string };
  /** Avis des visiteurs : « ★ 4,5 · 12 avis » et « ♥ 8 » sur la carte. */
  avis?: ResumeAvis;
  /** Valeurs de tri : prix affiché et « taille » (capacité ou superficie). */
  valeurPrix: number | null; valeurTaille: number | null;
};

function LigneBase({ modele, rang = 0 }: { modele: Modele; rang?: number }) {
  const router = useRouter();
  const { favoris, basculerFavori } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const cle = `${modele.type}:${modele.id}`;
  const avis = modele.avis;
  const favori = favoris.includes(cle);
  const ouvrir = () => router.push({ pathname: '/annonce/[type]/[id]', params: { type: modele.type, id: modele.id } });
  // Comme « N avis » sur les cartes du site : la fiche s'ouvre directement sur les avis.
  const ouvrirAvis = () => { vibrerSelection(); router.push({ pathname: '/annonce/[type]/[id]', params: { type: modele.type, id: modele.id, avis: '1' } }); };

  return (
    <Animated.View entering={FadeInDown.duration(320).delay(Math.min(rang, 8) * 40)}>
      <Pressable onPress={ouvrir} accessibilityRole="link" accessibilityLabel={modele.titre} style={({ pressed }) => [s.ligne, pressed && s.enfoncee]}>
        <View style={s.vignette}>
          <View style={s.sansPhoto}><Icone nom={modele.iconeVide} taille={30} couleur={C.texte3} /></View>
          {modele.image ? <ImageSite source={modele.image} style={StyleSheet.absoluteFill} alt={modele.titre} /> : null}
          {modele.etiquette?.texte ? <View style={s.etiquette}><Etiquette texte={modele.etiquette.texte} ton={modele.etiquette.ton} /></View> : null}
          {modele.nbPhotos && modele.nbPhotos > 1 ? <View style={s.nbPhotos}><Icone nom="images" taille={11} couleur="#fff" /><Text style={s.nbPhotosTexte}>{modele.nbPhotos}</Text></View> : null}
        </View>

        <View style={s.corps}>
          {modele.surtitre ? <Text style={s.surtitre} numberOfLines={1}>{modele.surtitre}</Text> : null}
          <Text style={s.titre} numberOfLines={2}>{modele.titre}</Text>
          {modele.lieu ? (
            <View style={s.lieu}><Icone nom="location-outline" taille={13} couleur={C.texte2} /><Text style={s.lieuTexte} numberOfLines={1}>{modele.lieu}</Text></View>
          ) : null}
          {modele.faits.length ? (
            <View style={s.faits}>
              {modele.faits.map(([icone, texte]) => (
                <View key={texte} style={s.fait}><Icone nom={icone} taille={13} couleur={C.texte3} /><Text style={s.faitTexte}>{texte}</Text></View>
              ))}
            </View>
          ) : null}
          {avis && (avis.nombre > 0 || avis.likes > 0) ? (
            <View style={s.avis}>
              {avis.nombre > 0 && avis.note !== null ? (
                <Pressable onPress={ouvrirAvis} hitSlop={6} accessibilityRole="link" accessibilityLabel={`${t('avisV.titre')} : ${nombreAvis(avis.nombre, t)}`} style={s.avisLien}>
                  <Icone nom="star" taille={12} couleur={C.or} />
                  <Text style={s.avisTexte}>{noteAffichee(avis.note, langue)} · {nombreAvis(avis.nombre, t)}</Text>
                </Pressable>
              ) : null}
              {avis.likes > 0 ? (
                <View style={s.avisJaime} accessibilityLabel={`${t('avisV.jaime')} : ${avis.likes}`}>
                  <Icone nom="heart" taille={11} couleur="#e0245e" />
                  <Text style={s.avisTexte}>{avis.likes}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={s.pied}>
            <View style={{ flex: 1 }}>
              {modele.prix && 'montant' in modele.prix ? (
                <>
                  <Text style={s.prix} numberOfLines={1}>{modele.prix.montant}</Text>
                  {modele.prix.unite ? <Text style={s.unite} numberOfLines={1}>{modele.prix.unite}</Text> : null}
                </>
              ) : modele.prix ? <Text style={s.surDemande} numberOfLines={2}>{modele.prix.texte}</Text> : null}
            </View>
            <Pressable onPress={ouvrir} accessibilityRole="button" style={({ pressed }) => [s.bouton, pressed && { opacity: 0.85 }]}>
              <Text style={s.boutonTexte}>{t('ligne.voir')}</Text>
              <Icone nom="chevron-forward" taille={15} couleur="#fff" />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => { vibrerSelection(); basculerFavori(cle); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={favori ? t('favori.retirer') : t('favori.ajouter')}
          style={s.coeur}>
          <Icone nom={favori ? 'heart' : 'heart-outline'} taille={21} couleur={favori ? '#e0245e' : C.texte3} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export const Ligne = memo(LigneBase);

// ---------------------------------------------------------------------------
// Modèles par type d'annonce
// ---------------------------------------------------------------------------
type Contexte = { refs: Referentiels | null; t: Traduire; langue: Langue };
const faits = (liste: ([NomIcone, string] | null)[]) => liste.filter((f): f is [NomIcone, string] => Boolean(f));

export function modeleVilla(v: Villa, { refs, t, langue }: Contexte): Modele {
  const theme = v.category && !CRITERES_HORS_THEME.includes(v.category) ? libelle(refs, 'categories', v.category, v.categoryLabel, langue) : '';
  return {
    type: 'villa', id: v.id, avis: v.avis, image: v.images[0], iconeVide: 'home-outline', nbPhotos: v.images.length,
    etiquette: estIndisponible(v) ? { texte: t('ligne.indisponible'), ton: 'gris' } : { texte: v.badge ? libelle(refs, 'badges', v.badgeId, v.badge, langue) : '', ton: 'or' },
    surtitre: theme || t(`cadre.${cadreVilla(v)}` as 'cadre.terre'),
    titre: v.name, lieu: v.location,
    faits: faits([
      v.capacity > 0 ? ['people-outline', t('ligne.pers', { n: v.capacity })] : null,
      v.bedrooms > 0 ? ['bed-outline', t('ligne.ch', { n: v.bedrooms })] : null,
      v.bathrooms > 0 ? ['water-outline', t('ligne.sdb', { n: v.bathrooms })] : null,
    ]),
    prix: v.pricePerNight > 0 ? { montant: fcfa(v.pricePerNight), unite: t('ligne.parNuit') } : { texte: t('ligne.surDemande') },
    valeurPrix: v.pricePerNight || null, valeurTaille: v.capacity || null,
  };
}

export const libelleFoncier = (terrain: Terrain, t: Traduire) => {
  const traduit = t(`foncier.${terrain.landStatus}` as 'foncier.acd');
  return traduit.startsWith('foncier.') ? terrain.landStatusLabel : traduit;
};

export function modeleTerrain(te: Terrain, { refs, t, langue }: Contexte): Modele {
  return {
    type: 'terrain', id: te.id, avis: te.avis, image: te.images[0], iconeVide: 'map-outline', nbPhotos: te.images.length,
    etiquette: { texte: libelle(refs, 'statuts', `terrain:${te.status}`, t(`terrain.${te.status}` as 'terrain.disponible'), langue), ton: te.status === 'disponible' ? 'vert' : 'or' },
    surtitre: te.reference ? t('ligne.terrainRef', { ref: te.reference }) : t('ligne.terrainVente'),
    titre: fiche(te, 'title', langue), lieu: te.location,
    faits: faits([
      te.areaSqm > 0 ? ['resize-outline', `${nombre(te.areaSqm)} m²`] : null,
      ['shield-checkmark-outline', libelleFoncier(te, t).split(' (')[0]],
    ]),
    prix: te.priceTotal > 0 ? { montant: fcfa(te.priceTotal), unite: te.pricePerSqm ? t('ligne.prixM2', { x: nombre(te.pricePerSqm) }) : t('ligne.prixTotal') } : { texte: t('ligne.surDemande') },
    valeurPrix: te.priceTotal || null, valeurTaille: te.areaSqm || null,
  };
}

export function modeleActivite(a: Activite, { refs, t, langue }: Contexte): Modele {
  const montant = Math.round(Number(a.priceAmount) || 0);
  const prefixe = String(fiche(a, 'pricePrefix', langue) || '');
  return {
    type: 'activite', id: a.id, avis: a.avis, image: a.image, iconeVide: 'boat-outline',
    etiquette: { texte: a.badge ? libelle(refs, 'badges', a.badgeId, a.badge, langue) : '', ton: 'or' },
    surtitre: fiche(a, 'subtitle', langue) || t('ligne.activite'),
    titre: fiche(a, 'title', langue),
    faits: a.duration ? [['time-outline', String(fiche(a, 'duration', langue))]] : [],
    prix: montant > 0
      ? { montant: /partir|dès|from|desde/i.test(prefixe) ? t('ligne.des', { x: fcfa(montant) }) : fcfa(montant), unite: t(`unite.${uniteActivite(a)}`) }
      : { texte: tarifActivite(a, langue) || t('ligne.surDemande') },
    valeurPrix: montant || null, valeurTaille: null,
  };
}

export function modelePublication(p: Publication, { t, langue }: Contexte): Modele {
  const f = p.fiche || {};
  const photos = photosPublication(p);
  return {
    type: 'publication', id: p.id, image: photos[0], iconeVide: p.video ? 'play-circle-outline' : 'logo-facebook', nbPhotos: photos.length,
    etiquette: { texte: p.video ? t('ligne.video') : t('ligne.facebook'), ton: 'fb' },
    surtitre: dateCourte(p.created_time, langue),
    titre: f.name || titrePublication(p), lieu: f.location || '',
    faits: faits([
      estNombre(f.capacity) ? ['people-outline', t('ligne.pers', { n: f.capacity })] : null,
      estNombre(f.bedrooms) ? ['bed-outline', t('ligne.ch', { n: f.bedrooms })] : null,
    ]),
    prix: estNombre(f.pricePerNight) && f.pricePerNight > 0 ? { montant: fcfa(f.pricePerNight), unite: t('ligne.parNuit') } : undefined,
    valeurPrix: estNombre(f.pricePerNight) ? f.pricePerNight : null, valeurTaille: estNombre(f.capacity) ? f.capacity : null,
  };
}

const feuille = creerStyles(C => ({
  ligne: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre, marginBottom: 10 },
  enfoncee: { transform: [{ scale: 0.985 }], opacity: 0.96 },
  vignette: { width: 112, minHeight: 124, borderRadius: 13, overflow: 'hidden', backgroundColor: C.vignette },
  sansPhoto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  etiquette: { position: 'absolute', top: 6, left: 6, right: 6 },
  nbPhotos: { position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, height: 20, borderRadius: 999, backgroundColor: 'rgba(14,16,38,0.6)' },
  nbPhotosTexte: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  corps: { flex: 1, minWidth: 0, paddingVertical: 2, gap: 3 },
  surtitre: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: C.texte3, paddingRight: 28 },
  titre: { fontSize: 15.5, fontWeight: '700', color: C.texte, lineHeight: 20, paddingRight: 28 },
  lieu: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lieuTexte: { fontSize: 12.5, color: C.texte2, flex: 1 },
  faits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  fait: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  faitTexte: { fontSize: 12, color: C.texte2 },
  avis: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1 },
  avisLien: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, backgroundColor: C.orPale },
  avisJaime: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  avisTexte: { fontSize: 11.5, fontWeight: '700', color: C.texte2 },
  pied: { marginTop: 'auto', paddingTop: 6, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  prix: { fontSize: 15, fontWeight: '800', color: C.marque },
  unite: { fontSize: 11, fontWeight: '600', color: C.texte3 },
  surDemande: { fontSize: 12.5, fontWeight: '700', color: C.texte2 },
  bouton: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingLeft: 14, paddingRight: 10, borderRadius: 999, backgroundColor: C.primaire },
  boutonTexte: { color: '#fff', fontSize: 13, fontWeight: '700' },
  coeur: { position: 'absolute', top: 6, right: 6, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
}));
