/**
 * Écran « Louer une voiture » (demande du 17/09/2026), ouvert depuis la fiche
 * d'un véhicule ou la carte d'accueil. Le formulaire est partagé avec l'onglet
 * Devis (formule « Location de voiture ») : composants/FormulaireLocation.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormulaireLocation } from '@/composants/FormulaireLocation';
import { usePreferences } from '@/donnees/preferences';

export default function LouerVoiture() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { C } = usePreferences();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.fond }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <FormulaireLocation
          vehiculeImpose={id || undefined}
          onEnvoye={({ total, lien }) => router.replace({ pathname: '/envoye', params: { enregistree: '1', total, lien } })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
