/**
 * Menu déroulant : libellé + valeur choisie, un appui ouvre une feuille
 * (fenêtre modale native) avec la liste des options.
 *   · variante « formulaire » : champ du formulaire de recherche de l'accueil ;
 *   · variante « reglage » : ligne de réglage (profil).
 * Choix multiple (`multiple`) : la valeur est une liste « a,b » (« all » si
 * rien n'est coché), la feuille reste ouverte jusqu'à « Valider ».
 * Liste longue (SEUIL_RECHERCHE options ou plus, demande du 17/09/2026) : un
 * champ de recherche en tête de feuille filtre les options, sans tenir compte
 * des accents ni des majuscules.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';
import { vibrerSelection } from './outils';
import { Icone, type NomIcone } from './ui';

export type OptionChoix = [valeur: string, texte: string, icone?: NomIcone];

/** À partir de ce nombre d'options, la feuille propose une recherche. */
export const SEUIL_RECHERCHE = 6;

const sansAccents = (texte: string) => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Options dont le texte contient la recherche (accents et majuscules ignorés). */
export function filtrerOptions(options: OptionChoix[], recherche: string): OptionChoix[] {
  const cle = sansAccents(recherche);
  return cle ? options.filter(([, texte]) => sansAccents(texte).includes(cle)) : options;
}

export function ChampChoix({ libelle, icone, valeur, options, onChange, variante = 'formulaire', aide, multiple, vide }: {
  libelle: string; icone: NomIcone; valeur: string; options: OptionChoix[]; onChange: (v: string) => void;
  variante?: 'formulaire' | 'reglage'; aide?: string; multiple?: boolean; vide?: string;
}) {
  const { C, t } = usePreferences();
  const s = feuille(C);
  const insets = useSafeAreaInsets();
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const avecRecherche = options.length >= SEUIL_RECHERCHE;
  const visibles = avecRecherche ? filtrerOptions(options, recherche) : options;
  const fermer = () => { setOuvert(false); setRecherche(''); };
  const cochees = multiple && valeur && valeur !== 'all' ? valeur.split(',') : [];
  const choisie = multiple ? options.find(([v]) => v === cochees[0]) : options.find(([v]) => v === valeur) ?? options[0];
  const affiche = multiple
    ? (cochees.length ? `${choisie?.[1] ?? cochees[0]}${cochees.length > 1 ? ` +${cochees.length - 1}` : ''}` : vide ?? '')
    : choisie?.[1] ?? '';
  const ouvrir = () => { vibrerSelection(); setOuvert(true); };
  const basculer = (v: string) => {
    const suivantes = cochees.includes(v) ? cochees.filter(x => x !== v) : [...cochees, v];
    onChange(suivantes.length ? suivantes.join(',') : 'all');
  };

  return (
    <>
      {variante === 'reglage' ? (
        <Pressable
          onPress={ouvrir}
          style={({ pressed }) => [s.reglage, pressed && { backgroundColor: C.surface }]}
          accessibilityRole="button"
          accessibilityLabel={`${libelle} : ${affiche}`}>
          <View style={s.reglageIcone}><Icone nom={icone} taille={19} couleur={C.marque} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.reglageLibelle}>{libelle}</Text>
            {aide ? <Text style={s.reglageAide}>{aide}</Text> : null}
          </View>
          <View style={s.reglageValeur}>
            {choisie?.[2] ? <Icone nom={choisie[2]} taille={16} couleur={C.texte2} /> : null}
            <Text style={s.reglageValeurTexte} numberOfLines={1}>{affiche}</Text>
            <Icone nom="chevron-down" taille={16} couleur={C.texte2} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={ouvrir}
          style={({ pressed }) => [s.champ, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${libelle} : ${affiche}`}>
          <View style={s.tete}>
            <Icone nom={icone} taille={14} couleur={C.orTexte} />
            <Text style={s.libelle} numberOfLines={1}>{libelle}</Text>
          </View>
          <View style={s.valeurLigne}>
            <Text style={s.valeur} numberOfLines={1}>{affiche}</Text>
            <Icone nom="chevron-down" taille={16} couleur={C.texte} />
          </View>
        </Pressable>
      )}

      <Modal visible={ouvert} transparent animationType="slide" onRequestClose={fermer} statusBarTranslucent>
        {/* Clavier ouvert pour la recherche : la feuille remonte au-dessus. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <Pressable style={s.fond} onPress={fermer} accessibilityLabel={t('fermer')} />
        <View style={[s.feuille, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.poignee} />
          <Text style={s.titre}>{libelle}</Text>
          {multiple && aide ? <Text style={s.aideFeuille}>{aide}</Text> : null}
          {avecRecherche ? (
            <View style={s.recherche}>
              <Icone nom="search" taille={18} couleur={C.texte3} />
              <TextInput
                value={recherche}
                onChangeText={setRecherche}
                placeholder={t('choix.rechercher')}
                placeholderTextColor={C.texte3}
                style={s.rechercheChamp}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel={`${t('choix.rechercher')} ${libelle}`}
              />
              {recherche ? (
                <Pressable onPress={() => setRecherche('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('fermer')}>
                  <Icone nom="close-circle" taille={18} couleur={C.texte3} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {avecRecherche && !visibles.length ? <Text style={s.aucun}>{t('choix.aucun')}</Text> : null}
            {visibles.map(([v, texte, iconeOption]) => {
              const actif = multiple ? cochees.includes(v) : v === valeur;
              return (
                <Pressable
                  key={v}
                  onPress={() => { vibrerSelection(); if (multiple) basculer(v); else { onChange(v); fermer(); } }}
                  style={({ pressed }) => [s.option, pressed && { backgroundColor: C.surface }]}
                  accessibilityRole={multiple ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: actif }}>
                  {iconeOption ? <Icone nom={iconeOption} taille={19} couleur={C.texte2} /> : null}
                  <Text style={[s.optionTexte, actif && s.optionActive]}>{texte}</Text>
                  {multiple
                    ? <View style={[s.case, actif && s.caseCochee]}>{actif ? <Icone nom="checkmark" taille={15} couleur="#fff" /> : null}</View>
                    : actif ? <Icone nom="checkmark" taille={20} couleur={C.sombre ? C.or : '#151837'} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {multiple ? (
            <Pressable onPress={() => { vibrerSelection(); fermer(); }} style={({ pressed }) => [s.valider, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Text style={s.validerTexte}>{t('valider')}</Text>
            </Pressable>
          ) : null}
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const feuille = creerStyles(C => ({
  champ: { flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.bord },
  tete: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  libelle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.texte2, flexShrink: 1 },
  valeurLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  valeur: { flex: 1, fontSize: 15.5, fontWeight: '700', color: C.texte },

  reglage: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  reglageIcone: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  reglageLibelle: { fontSize: 15, fontWeight: '600', color: C.texte },
  reglageAide: { fontSize: 12.5, color: C.texte3, marginTop: 1 },
  reglageValeur: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.bord, backgroundColor: C.surface },
  reglageValeurTexte: { fontSize: 14.5, fontWeight: '700', color: C.texte, flexShrink: 1 },

  fond: { flex: 1, backgroundColor: 'rgba(10,12,30,0.45)' },
  feuille: { backgroundColor: C.carte, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8 },
  poignee: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.bord, marginBottom: 12 },
  titre: { fontSize: 19, fontWeight: '800', color: C.texte, marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.bord },
  optionTexte: { fontSize: 16, color: C.texte, flex: 1 },
  optionActive: { fontWeight: '800' },
  aideFeuille: { fontSize: 13, color: C.texte3, marginBottom: 4 },
  recherche: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6, paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.bord, backgroundColor: C.surface },
  rechercheChamp: { flex: 1, fontSize: 16, color: C.texte, paddingVertical: 0 },
  aucun: { fontSize: 15, color: C.texte3, textAlign: 'center', paddingVertical: 22 },
  case: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.texte3, alignItems: 'center', justifyContent: 'center' },
  caseCochee: { backgroundColor: C.primaire, borderColor: C.primaire },
  valider: { height: 50, borderRadius: 999, marginTop: 14, backgroundColor: C.sombre ? C.or : '#151837', alignItems: 'center', justifyContent: 'center' },
  validerTexte: { fontSize: 16, fontWeight: '800', color: C.sombre ? '#151837' : '#fff' },
}));
