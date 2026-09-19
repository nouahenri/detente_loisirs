/**
 * Messages reçus (19/09/2026) : messages envoyés par Détente & Loisirs depuis
 * le studio (Messages → Notifications de l'app), relevés par la veille et
 * gardés sur le téléphone. Tirer vers le bas pour relever tout de suite.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { EtatVide } from '@/composants/ui';
import { dateHeure } from '@/donnees/i18n';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles } from '@/donnees/theme';
import { messagesRecus, releverMessages, type MessageRecu } from '@/donnees/veille';

export default function Messages() {
  const { C, t, langue, notifications } = usePreferences();
  const s = feuille(C);
  const [messages, setMessages] = useState<MessageRecu[] | null>(null);
  const [tire, setTire] = useState(false);
  const actif = notifications === 'actif';

  // Liste relue à chaque retour sur l'écran, puis relevée sur le site.
  useFocusEffect(useCallback(() => {
    let vivant = true;
    messagesRecus().then(liste => { if (vivant) setMessages(liste); });
    if (actif) releverMessages(null, langue).then(liste => { if (vivant) setMessages(liste); });
    return () => { vivant = false; };
  }, [actif, langue]));

  const actualiser = async () => {
    setTire(true);
    setMessages(actif ? await releverMessages(null, langue) : await messagesRecus());
    setTire(false);
  };

  if (messages && !messages.length) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fond }}>
        <EtatVide icone="chatbubbles-outline" titre={t('messages.vide')} texte={actif ? t('messages.videTexte') : t('messages.activer')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: C.fond }}
      contentContainerStyle={s.contenu}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={tire} tintColor={C.marque} colors={['#151837']} onRefresh={actualiser} />}>
      {(messages || []).map(m => (
        <View key={m.id} style={s.carte}>
          <View style={s.tete}>
            <Text style={s.titre} numberOfLines={2}>{m.titre}</Text>
            <Text style={s.date}>{dateHeure(m.le, langue)}</Text>
          </View>
          <Text style={s.corps} selectable>{m.corps}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const feuille = creerStyles(C => ({
  contenu: { padding: 16, gap: 12 },
  carte: { padding: 14, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre, gap: 8 },
  tete: { gap: 2 },
  titre: { fontSize: 16, fontWeight: '800', color: C.texte },
  date: { fontSize: 12, color: C.texte3 },
  corps: { fontSize: 14.5, lineHeight: 21, color: C.texte2 },
}));
