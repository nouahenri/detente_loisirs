/**
 * Version navigateur (mise au point uniquement) : barre d'onglets dessinée,
 * les téléphones utilisent la barre native de _layout.tsx.
 */
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icone, type NomIcone } from '@/composants/ui';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';

type Props = TabTriggerSlotProps & { icone: NomIcone; iconeActive: NomIcone; texte: string };

const BoutonOnglet = forwardRef<View, Props>(({ icone, iconeActive, texte, isFocused, ...props }, ref) => {
  const { C } = usePreferences();
  const s = feuille(C);
  const actif = C.sombre ? C.or : '#151837';
  return (
    <Pressable ref={ref} {...props} style={s.bouton}>
      <View style={[s.pastille, isFocused && s.pastilleActive]}>
        <Icone nom={isFocused ? iconeActive : icone} taille={22} couleur={isFocused ? actif : C.texte3} />
      </View>
      <Text style={[s.texte, isFocused && { color: actif }]}>{texte}</Text>
    </Pressable>
  );
});
BoutonOnglet.displayName = 'BoutonOnglet';

export default function OngletsWeb() {
  const { C, t } = usePreferences();
  const s = feuille(C);
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={s.barre}>
        <TabTrigger name="index" href="/" asChild><BoutonOnglet icone="home-outline" iconeActive="home" texte={t('onglet.accueil')} /></TabTrigger>
        <TabTrigger name="explorer" href="/explorer" asChild><BoutonOnglet icone="search-outline" iconeActive="search" texte={t('onglet.explorer')} /></TabTrigger>
        <TabTrigger name="devis" href="/devis" asChild><BoutonOnglet icone="receipt-outline" iconeActive="receipt" texte={t('onglet.devis')} /></TabTrigger>
        <TabTrigger name="favoris" href="/favoris" asChild><BoutonOnglet icone="heart-outline" iconeActive="heart" texte={t('onglet.favoris')} /></TabTrigger>
        <TabTrigger name="contact" href="/contact" asChild><BoutonOnglet icone="chatbubbles-outline" iconeActive="chatbubbles" texte={t('onglet.contact')} /></TabTrigger>
      </TabList>
    </Tabs>
  );
}

const feuille = creerStyles(C => ({
  barre: { flexDirection: 'row', backgroundColor: C.barreOnglets, borderTopWidth: 1, borderTopColor: C.bord, paddingTop: 6, paddingBottom: 10 },
  bouton: { flex: 1, alignItems: 'center', gap: 2 },
  pastille: { width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pastilleActive: { backgroundColor: C.orPale },
  texte: { fontSize: 11.5, fontWeight: '600', color: C.texte3 },
}));
