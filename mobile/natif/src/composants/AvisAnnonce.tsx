/**
 * Section « Avis des visiteurs » d'une fiche : moyenne des notes, « J'aime »,
 * commentaires publiés et bouton « Laisser un avis » (mêmes avis que le site).
 * Rechargée à chaque retour sur la fiche, donc aussitôt après un avis publié.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { basculerJaime, lireAvis, typeAvis, type AvisAnnonce as Avis } from '@/donnees/avis';
import { dateCourte, type Langue, type Traduire } from '@/donnees/i18n';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles, type Palette } from '@/donnees/theme';
import type { ResumeAvis, TypeAnnonce } from '@/donnees/types';
import { vibrerErreur, vibrerSelection } from './outils';
import { Bouton, Icone } from './ui';

const APERCU = 3;

export const noteAffichee = (note: number, langue: Langue) => (langue === 'en' ? note.toFixed(1) : note.toFixed(1).replace('.', ','));
export const nombreAvis = (n: number, t: Traduire) => t(n > 1 ? 'avisV.plusieurs' : 'avisV.un', { n });

/** Cinq étoiles, demi-étoile comprise, pour une note de 0 à 5. */
export function Etoiles({ note, taille = 14, couleur }: { note: number; taille?: number; couleur: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Icone key={i} nom={note >= i + 1 ? 'star' : note >= i + 0.5 ? 'star-half' : 'star-outline'} taille={taille} couleur={couleur} />
      ))}
    </View>
  );
}

export function AvisAnnonce({ type, id, titre, resume, onPosition }: {
  type: TypeAnnonce; id: string; titre: string; resume?: ResumeAvis; onPosition?: (y: number) => void;
}) {
  const router = useRouter();
  const { majResumeAvis } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [avis, setAvis] = useState<Avis | null>(null);
  const [chargement, setChargement] = useState(true);
  const [horsLigne, setHorsLigne] = useState(false);
  const [toutVoir, setToutVoir] = useState(false);
  const [envoiJaime, setEnvoiJaime] = useState(false);

  useFocusEffect(useCallback(() => {
    let actif = true;
    if (!typeAvis(type)) return undefined;
    lireAvis(type, id)
      .then(lus => {
        if (!actif) return;
        setAvis(lus);
        setHorsLigne(false);
        majResumeAvis(type, id, { likes: lus.likes, note: lus.note, nombre: lus.nombre });
      })
      .catch(() => { if (actif) setHorsLigne(true); })
      .finally(() => { if (actif) setChargement(false); });
    return () => { actif = false; };
  }, [type, id, majResumeAvis]));

  if (!typeAvis(type)) return null;

  const likes = avis?.likes ?? resume?.likes ?? 0;
  const note = avis ? avis.note : resume?.note ?? null;
  const nombre = avis?.nombre ?? resume?.nombre ?? 0;
  const commentaires = avis?.commentaires ?? [];
  const visibles = toutVoir ? commentaires : commentaires.slice(0, APERCU);

  const aimer = async () => {
    if (!avis || envoiJaime) return;
    vibrerSelection();
    const avant = avis;
    // Affichage immédiat, corrigé par la réponse du site.
    setAvis({ ...avis, jaime: !avis.jaime, likes: Math.max(0, avis.likes + (avis.jaime ? -1 : 1)) });
    setEnvoiJaime(true);
    try {
      const reponse = await basculerJaime(type, id);
      setAvis(actuel => (actuel ? { ...actuel, ...reponse } : actuel));
      majResumeAvis(type, id, { likes: reponse.likes, note: reponse.note, nombre: reponse.nombre });
    } catch {
      vibrerErreur();
      setAvis(avant);
    } finally {
      setEnvoiJaime(false);
    }
  };

  return (
    <View style={s.section} onLayout={(e: LayoutChangeEvent) => onPosition?.(e.nativeEvent.layout.y)}>
      <Text style={s.titre} accessibilityRole="header">{t('avisV.titre')}</Text>

      <View style={s.entete}>
        <View style={s.moyenne}>
          {note !== null && nombre > 0 ? (
            <>
              <Text style={s.note}>{noteAffichee(note, langue)}</Text>
              <View style={{ gap: 3 }}>
                <Etoiles note={note} couleur={C.or} />
                <Text style={s.nombre}>{nombreAvis(nombre, t)}</Text>
              </View>
            </>
          ) : <Text style={s.nombre}>{chargement ? ' ' : nombreAvis(0, t)}</Text>}
        </View>
        <Pressable
          onPress={aimer}
          disabled={!avis || envoiJaime}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(avis?.jaime), disabled: !avis }}
          accessibilityLabel={`${avis?.jaime ? t('avisV.aime') : t('avisV.jaime')} · ${likes}`}
          style={({ pressed }) => [s.jaime, avis?.jaime && s.jaimeActif, !avis && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.96 }] }]}>
          <Icone nom={avis?.jaime ? 'heart' : 'heart-outline'} taille={18} couleur={avis?.jaime ? '#e0245e' : C.texte} />
          <Text style={[s.jaimeTexte, avis?.jaime && { color: '#e0245e' }]}>{avis?.jaime ? t('avisV.aime') : t('avisV.jaime')}</Text>
          <Text style={s.jaimeCompte}>{likes}</Text>
        </Pressable>
      </View>

      {chargement && !avis ? <ActivityIndicator color={C.texte3} style={{ marginVertical: 14 }} /> : null}
      {horsLigne && !avis ? <Text style={s.aide}>{t('avisV.indisponible')}</Text> : null}
      {avis && !commentaires.length ? <Text style={s.aide}>{t('avisV.aucun')}</Text> : null}

      {visibles.map(c => <Commentaire key={c.id} commentaire={c} C={C} t={t} langue={langue} />)}

      {commentaires.length > APERCU ? (
        <Pressable onPress={() => { vibrerSelection(); setToutVoir(v => !v); }} hitSlop={8} accessibilityRole="button" style={s.voirTout}>
          <Text style={s.voirToutTexte}>{toutVoir ? t('avisV.voirMoins') : t('avisV.voirTout', { n: commentaires.length })}</Text>
        </Pressable>
      ) : null}

      <Bouton
        texte={t('avisV.laisser')}
        icone="create-outline"
        variante="contour"
        desactive={horsLigne && !avis}
        style={{ marginTop: 12 }}
        onPress={() => { vibrerSelection(); router.push({ pathname: '/donner-avis', params: { type, id, titre } }); }}
      />
    </View>
  );
}

function Commentaire({ commentaire: c, C, t, langue }: { commentaire: Avis['commentaires'][number]; C: Palette; t: Traduire; langue: Langue }) {
  const s = feuille(C);
  return (
    <View style={s.commentaire} accessible accessibilityLabel={`${c.nom}, ${t(c.note > 1 ? 'avisV.etoiles' : 'avisV.etoile', { n: c.note })}. ${c.commentaire}`}>
      <View style={s.commentaireTete}>
        <View style={s.initiale}><Text style={s.initialeTexte}>{String(c.nom || '?').trim().charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.auteur} numberOfLines={1}>{c.nom}</Text>
          <Text style={s.date}>{dateCourte(c.creeLe, langue)}</Text>
        </View>
        <Etoiles note={c.note} taille={13} couleur={C.or} />
      </View>
      <Text style={s.commentaireTexte}>{c.commentaire}</Text>
    </View>
  );
}

const feuille = creerStyles(C => ({
  section: { marginTop: 14, padding: 16, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre },
  titre: { fontSize: 17, fontWeight: '800', color: C.texte, marginBottom: 12 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  moyenne: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  note: { fontSize: 34, fontWeight: '800', color: C.texte, letterSpacing: -1 },
  nombre: { fontSize: 13, fontWeight: '600', color: C.texte2 },
  jaime: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.surface },
  jaimeActif: { borderColor: '#f4a3bd', backgroundColor: C.sombre ? 'rgba(224,36,94,0.14)' : '#fdecf2' },
  jaimeTexte: { fontSize: 14, fontWeight: '700', color: C.texte },
  jaimeCompte: { fontSize: 14, fontWeight: '800', color: C.texte2 },
  aide: { fontSize: 14, lineHeight: 20, color: C.texte2, marginTop: 8 },
  commentaire: { paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: C.bord },
  commentaireTete: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  initiale: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.orPale, alignItems: 'center', justifyContent: 'center' },
  initialeTexte: { fontSize: 15, fontWeight: '800', color: C.marque },
  auteur: { fontSize: 14.5, fontWeight: '700', color: C.texte },
  date: { fontSize: 12, color: C.texte3 },
  commentaireTexte: { fontSize: 14.5, lineHeight: 21, color: C.texte2 },
  voirTout: { marginTop: 12, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  voirToutTexte: { fontSize: 14, fontWeight: '700', color: C.orTexte },
}));
