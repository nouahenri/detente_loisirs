/**
 * Feuille « Laisser un avis » sur une annonce : nom, note de 1 à 5 étoiles et
 * commentaire, publiés tout de suite sur le site et dans l'app (le studio peut
 * ensuite masquer ou supprimer un avis inapproprié).
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { revenir, vibrerErreur, vibrerSelection, vibrerSucces } from '@/composants/outils';
import { Bouton, Icone } from '@/composants/ui';
import { ErreurAvis, erreurSaisie, publierAvis } from '@/donnees/avis';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';
import type { TypeAnnonce } from '@/donnees/types';

const LONGUEUR_MAX = 1000;

export default function DonnerAvis() {
  const { type, id, titre } = useLocalSearchParams<{ type: TypeAnnonce; id: string; titre?: string }>();
  const insets = useSafeAreaInsets();
  const { coordonnees, majResumeAvis } = useMagasin();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const [nom, setNom] = useState(coordonnees.nom);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState('');
  const [publie, setPublie] = useState(false);
  const [focus, setFocus] = useState<'nom' | 'commentaire' | null>(null);

  const envoyer = async () => {
    const erreur = erreurSaisie({ nom, note, commentaire });
    if (erreur) { vibrerErreur(); setMessage(t(erreur)); return; }
    setEnvoi(true);
    setMessage('');
    try {
      const reponse = await publierAvis(type, id, { nom, note, commentaire });
      majResumeAvis(type, id, { likes: reponse.likes, note: reponse.note, nombre: reponse.nombre });
      vibrerSucces();
      setPublie(true);
      setTimeout(() => revenir(), 1200);
    } catch (e) {
      vibrerErreur();
      // Les refus du site (débit, annonce retirée…) sont rédigés en français.
      setMessage(e instanceof ErreurAvis && e.message && e.statut !== 0 ? e.message : t('avisV.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (publie) {
    return (
      <View style={[s.ecran, s.merci]}>
        <View style={s.merciIcone}><Icone nom="checkmark" taille={38} couleur={C.ok} /></View>
        <Text style={s.titre}>{t('avisV.merci')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.ecran} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.contenu, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.titre} accessibilityRole="header">{t('avisV.laisser')}</Text>
        {titre ? <Text style={s.annonce} numberOfLines={2}>{titre}</Text> : null}

        <Text style={s.libelle}>{t('avisV.note')}</Text>
        <View style={s.etoiles} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable
              key={n}
              onPress={() => { vibrerSelection(); setNote(n); setMessage(''); }}
              hitSlop={4}
              accessibilityRole="radio"
              accessibilityState={{ checked: note === n }}
              accessibilityLabel={t(n > 1 ? 'avisV.etoiles' : 'avisV.etoile', { n })}
              style={({ pressed }) => [s.etoile, pressed && { transform: [{ scale: 0.9 }] }]}>
              <Icone nom={n <= note ? 'star' : 'star-outline'} taille={34} couleur={n <= note ? C.or : C.texte3} />
            </Pressable>
          ))}
        </View>

        <Text style={s.libelle}>{t('avisV.nom')}</Text>
        <TextInput
          value={nom}
          onChangeText={v => { setNom(v); setMessage(''); }}
          placeholder={t('avisV.nomPlaceholder')}
          placeholderTextColor={C.texte3}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={60}
          onFocus={() => setFocus('nom')}
          onBlur={() => setFocus(null)}
          style={[s.champ, focus === 'nom' && s.champActif]}
        />

        <Text style={s.libelle}>{t('avisV.commentaire')}</Text>
        <TextInput
          value={commentaire}
          onChangeText={v => { setCommentaire(v.slice(0, LONGUEUR_MAX)); setMessage(''); }}
          placeholder={t('avisV.commentairePlaceholder')}
          placeholderTextColor={C.texte3}
          multiline
          textAlignVertical="top"
          maxLength={LONGUEUR_MAX}
          onFocus={() => setFocus('commentaire')}
          onBlur={() => setFocus(null)}
          style={[s.champ, s.zone, focus === 'commentaire' && s.champActif]}
        />
        <Text style={s.compteur}>{commentaire.length} / {LONGUEUR_MAX}</Text>

        {message ? <Text style={s.erreur} accessibilityLiveRegion="polite">{message}</Text> : null}
        <Text style={s.aide}>{t('avisV.moderation')}</Text>

        <Bouton texte={t('avisV.publier')} icone="send" plein charge={envoi} onPress={envoyer} style={{ marginTop: 14 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.carte },
  contenu: { paddingHorizontal: 20, paddingTop: 24 },
  titre: { fontSize: 22, fontWeight: '800', color: C.texte, textAlign: 'center' },
  annonce: { fontSize: 14, color: C.texte2, textAlign: 'center', marginTop: 4 },
  libelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginTop: 18, marginBottom: 6, marginLeft: 4 },
  etoiles: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  etoile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  champ: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.surface, fontSize: 16, color: C.texte },
  champActif: { borderColor: C.sombre ? C.or : '#151837' },
  zone: { minHeight: 130, paddingTop: 12 },
  compteur: { fontSize: 12, color: C.texte3, textAlign: 'right', marginTop: 4 },
  erreur: { fontSize: 14, fontWeight: '600', color: C.danger, marginTop: 10 },
  aide: { fontSize: 12.5, lineHeight: 18, color: C.texte3, marginTop: 8 },
  merci: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  merciIcone: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.okPale, alignItems: 'center', justifyContent: 'center' },
}));
