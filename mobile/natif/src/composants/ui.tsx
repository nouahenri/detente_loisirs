import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { dateJourMois } from '@/donnees/i18n';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';
import { vibrerSelection } from './outils';

export type NomIcone = ComponentProps<typeof Ionicons>['name'];

export function Icone({ nom, taille = 20, couleur, style }: { nom: NomIcone; taille?: number; couleur?: string; style?: StyleProp<TextStyle> }) {
  const { C } = usePreferences();
  return <Ionicons name={nom} size={taille} color={couleur ?? C.texte} style={style} />;
}

// « empile » : libellé centré (deux lignes si le texte contient un saut de ligne)
// avec le nombre d'annonces dessous — les filtres d'Explorer (20/09/2026).
export function Puce({ texte, actif, onPress, compte, sombre, icone, empile }: { texte: string; actif?: boolean; onPress: () => void; compte?: number; sombre?: boolean; icone?: NomIcone; empile?: boolean }) {
  const { C } = usePreferences();
  const s = feuille(C);
  const couleurTexte = actif ? (sombre ? C.segmentActifTexte : C.surPrimaire) : sombre ? C.segmentTexte : C.texte;
  return (
    <Pressable
      onPress={() => { vibrerSelection(); onPress(); }}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(actif) }}
      accessibilityLabel={empile ? `${texte.replace('\n', ' ')}${compte !== undefined ? ` (${compte})` : ''}` : undefined}
      style={({ pressed }) => [
        s.puce,
        sombre && s.puceSombre,
        empile && s.puceEmpilee,
        actif && (sombre ? s.puceSombreActive : s.puceActive),
        pressed && { opacity: 0.8 },
      ]}>
      {icone ? <Icone nom={icone} taille={15} couleur={couleurTexte} /> : null}
      {empile ? (
        <View style={s.puceColonne}>
          {texte.split('\n').map(ligne => <Text key={ligne} style={[s.puceTexteEmpile, { color: couleurTexte }]} numberOfLines={1}>{ligne}</Text>)}
          {compte !== undefined ? <Text style={[s.puceCompte, { color: couleurTexte }]}>{compte}</Text> : null}
        </View>
      ) : (
        <Text style={[s.puceTexte, { color: couleurTexte }]}>
          {texte}
          {compte !== undefined ? <Text style={{ opacity: 0.55 }}>{`  ${compte}`}</Text> : null}
        </Text>
      )}
    </Pressable>
  );
}

type VarianteBouton = 'or' | 'primaire' | 'wa' | 'contour';
export function Bouton({ texte, icone, variante = 'primaire', onPress, desactive, charge, style, plein }: {
  texte: string; icone?: NomIcone; variante?: VarianteBouton; onPress: () => void; desactive?: boolean; charge?: boolean; style?: StyleProp<ViewStyle>; plein?: boolean;
}) {
  const { C } = usePreferences();
  const s = feuille(C);
  const fond = { or: C.or, primaire: C.primaire, wa: C.wa, contour: C.carte }[variante];
  const couleur = variante === 'or' ? '#151837' : variante === 'contour' ? C.marque : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive || charge}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.bouton,
        { backgroundColor: fond },
        variante === 'contour' && s.boutonContour,
        plein && { alignSelf: 'stretch', flexGrow: 1 },
        desactive && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}>
      {charge ? <ActivityIndicator color={couleur} /> : icone ? <Icone nom={icone} taille={19} couleur={couleur} /> : null}
      <Text style={[s.boutonTexte, { color: couleur }]} numberOfLines={1}>{texte}</Text>
    </Pressable>
  );
}

export function BoutonRond({ icone, onPress, variante = 'verre', couleur, label, taille = 42, children }: {
  icone: NomIcone; onPress: () => void; variante?: 'verre' | 'clair' | 'sombre'; couleur?: string; label: string; taille?: number; children?: ReactNode;
}) {
  const { C } = usePreferences();
  const s = feuille(C);
  const fond = { verre: 'rgba(14,16,38,0.45)', clair: C.carte, sombre: C.enteteBouton }[variante];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [s.rond, { width: taille, height: taille, backgroundColor: fond }, variante === 'clair' && { boxShadow: C.ombre }, pressed && { transform: [{ scale: 0.92 }] }]}>
      <Icone nom={icone} taille={Math.round(taille * 0.48)} couleur={couleur || (variante === 'clair' ? C.marque : variante === 'sombre' ? C.enteteIcone : '#fff')} />
      {children}
    </Pressable>
  );
}

export function Etiquette({ texte, ton = 'blanc' }: { texte?: string; ton?: 'blanc' | 'or' | 'vert' | 'gris' | 'fb' }) {
  const { C } = usePreferences();
  const s = feuille(C);
  if (!texte) return null;
  const tons = {
    blanc: { fond: 'rgba(255,255,255,0.95)', texte: '#151837' },
    or: { fond: C.or, texte: '#151837' },
    vert: { fond: C.sombre ? '#1f8f5a' : C.okPale, texte: C.sombre ? '#ffffff' : C.ok },
    gris: { fond: C.surface, texte: C.texte2 },
    fb: { fond: C.fb, texte: '#fff' },
  }[ton];
  return (
    <View style={[s.etiquette, { backgroundColor: tons.fond }]}>
      <Text style={[s.etiquetteTexte, { color: tons.texte }]} numberOfLines={1}>{texte}</Text>
    </View>
  );
}

export function EtatVide({ icone, titre, texte, action }: { icone: NomIcone; titre: string; texte?: string; action?: ReactNode }) {
  const { C } = usePreferences();
  const s = feuille(C);
  return (
    <View style={s.vide}>
      <View style={s.videIcone}><Icone nom={icone} taille={30} couleur={C.texte3} /></View>
      <Text style={s.videTitre}>{titre}</Text>
      {texte ? <Text style={s.videTexte}>{texte}</Text> : null}
      {action}
    </View>
  );
}

export function BandeauHorsLigne({ majLe }: { majLe: string | null }) {
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  return (
    <View style={s.horsLigne}>
      <Icone nom="cloud-offline-outline" taille={16} couleur={C.alerte} />
      <Text style={s.horsLigneTexte}>{majLe ? t('horsLigne.bandeau', { date: dateJourMois(majLe, langue) }) : t('horsLigne.seul')}</Text>
    </View>
  );
}

export function Carte({ titre, children, style }: { titre?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { C } = usePreferences();
  const s = feuille(C);
  return (
    <View style={[s.carte, style]}>
      {titre ? <Text style={s.carteTitre}>{titre}</Text> : null}
      {children}
    </View>
  );
}

export function TitreSection({ titre, action, onAction }: { titre: string; action?: string; onAction?: () => void }) {
  const { C } = usePreferences();
  const s = feuille(C);
  return (
    <View style={s.titreSection}>
      <Text style={s.titreSectionTexte} accessibilityRole="header">{titre}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}><Text style={s.titreSectionAction}>{action}</Text></Pressable>
      ) : null}
    </View>
  );
}

const feuille = creerStyles(C => ({
  puce: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.carte, flexDirection: 'row', alignItems: 'center', gap: 6 },
  puceActive: { backgroundColor: C.primaire, borderColor: C.primaire },
  puceSombre: { backgroundColor: C.segment, borderColor: 'transparent', minHeight: 34 },
  puceSombreActive: { backgroundColor: C.segmentActif },
  puceTexte: { fontSize: 14, fontWeight: '600' },
  puceEmpilee: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18 },
  puceColonne: { alignItems: 'center' },
  puceTexteEmpile: { fontSize: 12.5, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  puceCompte: { fontSize: 10.5, lineHeight: 13, fontWeight: '700', opacity: 0.6 },

  bouton: { height: 50, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  boutonContour: { borderWidth: 1.5, borderColor: C.bord },
  boutonTexte: { fontSize: 15.5, fontWeight: '700' },

  rond: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  etiquette: { alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', maxWidth: '100%' },
  etiquetteTexte: { fontSize: 10.5, fontWeight: '800' },

  vide: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 28, gap: 10 },
  videIcone: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.carte, alignItems: 'center', justifyContent: 'center', boxShadow: C.ombre },
  videTitre: { fontSize: 17, fontWeight: '800', color: C.texte, textAlign: 'center' },
  videTexte: { fontSize: 14.5, color: C.texte2, textAlign: 'center', lineHeight: 21, marginBottom: 6 },

  horsLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.alertePale, paddingHorizontal: 16, paddingVertical: 9 },
  horsLigneTexte: { color: C.alerte, fontSize: 12.5, fontWeight: '600', flex: 1 },

  carte: { backgroundColor: C.carte, borderRadius: 16, padding: 14, marginTop: 14, boxShadow: C.ombre },
  carteTitre: { fontSize: 15, fontWeight: '800', color: C.texte, marginBottom: 10 },

  titreSection: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  titreSectionTexte: { fontSize: 19, fontWeight: '800', color: C.texte, letterSpacing: -0.2 },
  titreSectionAction: { fontSize: 14, fontWeight: '700', color: C.orTexte },
}));
