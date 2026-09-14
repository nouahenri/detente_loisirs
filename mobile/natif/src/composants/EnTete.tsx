/**
 * Barre de navigation supérieure des onglets : bouton retour, titre, accès au
 * profil ; en dessous, le contenu propre à l'écran (recherche, rubriques…).
 */
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';
import { vibrerSelection } from './outils';
import { Icone } from './ui';

/** Pastille du profil : initiale du nom enregistré, sinon silhouette. */
export function BoutonProfil() {
  const router = useRouter();
  const { coordonnees } = useMagasin();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const nom = coordonnees.nom.trim();
  return (
    <Pressable
      onPress={() => { vibrerSelection(); router.push('/profil'); }}
      style={({ pressed }) => [s.profil, pressed && { transform: [{ scale: 0.92 }] }]}
      accessibilityRole="button"
      accessibilityLabel={t('profil.ouvrir')}
      hitSlop={6}>
      {nom ? <Text style={s.profilInitiale}>{nom.charAt(0).toUpperCase()}</Text> : <Icone nom="person-outline" taille={20} couleur={C.enteteIcone} />}
    </Pressable>
  );
}

/**
 * `retour` : action du bouton retour. Par défaut, l'onglet Accueil : les
 * onglets n'ont pas d'écran « précédent » (un retour natif y serait refusé).
 */
export function EnTete({ titre, sousTitre, children, style, retour, sansRetour, droite }: {
  titre: string; sousTitre?: string; children?: ReactNode; style?: StyleProp<ViewStyle>;
  retour?: () => void; sansRetour?: boolean; droite?: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { C, t } = usePreferences();
  const s = feuille(C);
  const revenir = retour ?? (() => router.navigate('/'));

  return (
    <View style={[s.entete, { paddingTop: insets.top + 6 }, style]}>
      <View style={s.barre}>
        {sansRetour ? null : (
          <Pressable
            onPress={() => { vibrerSelection(); revenir(); }}
            style={({ pressed }) => [s.retour, pressed && { transform: [{ scale: 0.92 }] }]}
            accessibilityRole="button"
            accessibilityLabel={t('fiche.retour')}
            hitSlop={6}>
            <Icone nom="chevron-back" taille={22} couleur={C.enteteIcone} />
          </Pressable>
        )}
        <Text style={s.titre} numberOfLines={1} accessibilityRole="header">{titre}</Text>
        {droite ?? <BoutonProfil />}
      </View>
      {sousTitre ? <Text style={s.sousTitre}>{sousTitre}</Text> : null}
      {children}
    </View>
  );
}

const feuille = creerStyles(C => ({
  entete: { backgroundColor: C.entete, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.enteteBord },
  barre: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  retour: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.enteteBouton, alignItems: 'center', justifyContent: 'center' },
  titre: { flex: 1, color: C.enteteTexte, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  sousTitre: { color: C.enteteTexte2, fontSize: 14, marginTop: 2 },
  profil: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.enteteBouton, borderWidth: 2, borderColor: C.or, alignItems: 'center', justifyContent: 'center' },
  profilInitiale: { fontSize: 16, fontWeight: '800', color: C.enteteIcone },
}));
