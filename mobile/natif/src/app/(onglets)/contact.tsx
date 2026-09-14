import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ouvrirLien, vibrerSelection } from '@/composants/outils';
import { EnTete } from '@/composants/EnTete';
import { Icone, type NomIcone } from '@/composants/ui';
import { EMAIL, SITE, TELEPHONE } from '@/donnees/config';
import { dateHeure } from '@/donnees/i18n';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { lienWhatsApp } from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';

export default function Contact() {
  const router = useRouter();
  const { donnees, majLe, actualiser, majRecherche } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [actualisation, setActualisation] = useState<'' | 'encours' | 'ok' | 'erreur'>('');
  const reglages = donnees?.reglages || {};
  const horaires = reglages.officeHours || '7j/7 · 7h–22h';
  const telephone = reglages.phone || '+225 07 67 69 63 18';
  const lien = (url: string) => ouvrirLien(url, t);

  const nbFaq = donnees?.faq.length ?? 0;
  const nbAvis = donnees?.avis.length ?? 0;
  const nbPublications = donnees?.publications.length ?? 0;

  return (
    <View style={s.ecran}>
      <EnTete titre={t('contact.titre')} sousTitre={t('contact.sousTitre')} />
      <ScrollView contentContainerStyle={s.contenu}>
        <View style={s.conciergerie}>
          <Text style={s.conciergerieTitre}>{t('contact.question')}</Text>
          <Text style={s.conciergerieTexte}>{telephone} · {horaires}</Text>
          <View style={s.actions}>
            <Action C={C} icone="call" texte={t('contact.appeler')} onPress={() => lien(`tel:${TELEPHONE}`)} />
            <Action C={C} icone="logo-whatsapp" texte={t('contact.whatsapp')} onPress={() => lien(lienWhatsApp(t('contact.messageWa')))} />
            <Action C={C} icone="mail" texte={t('contact.email')} onPress={() => lien(`mailto:${EMAIL}`)} />
          </View>
        </View>

        <Text style={s.menuTitre}>{t('contact.informations')}</Text>
        <View style={s.menu}>
          {nbFaq ? <Element C={C} icone="help-circle-outline" texte={t('contact.faq')} detail={t(nbFaq > 1 ? 'contact.reponses' : 'contact.reponse', { n: nbFaq })} onPress={() => router.push('/faq')} /> : null}
          {nbAvis ? <Element C={C} icone="star-outline" texte={t('contact.avis')} detail={t('contact.avisN', { n: nbAvis })} onPress={() => router.push('/avis')} /> : null}
          <Element C={C} icone="newspaper-outline" texte={t('contact.actus')} detail={donnees ? t(nbPublications > 1 ? 'contact.publications' : 'contact.publication', { n: nbPublications }) : ''} onPress={() => { majRecherche({ segment: 'publications' }); router.navigate('/explorer'); }} dernier />
        </View>

        <Text style={s.menuTitre}>{t('contact.liens')}</Text>
        <View style={s.menu}>
          <Element C={C} icone="logo-facebook" texte={t('contact.pageFb')} onPress={() => lien(reglages.facebookPage || 'https://web.facebook.com/profile.php?id=100075922063365')} />
          <Element C={C} icone="globe-outline" texte={t('contact.site')} onPress={() => lien(`${SITE}/`)} />
          <Element C={C} icone="lock-closed-outline" texte={t('contact.confidentialite')} onPress={() => lien(`${SITE}/confidentialite.html`)} dernier />
        </View>

        <View style={[s.menu, { marginTop: 16 }]}>
          <Element
            C={C}
            icone="refresh"
            texte={t('contact.actualiser')}
            detail={actualisation === 'ok' ? t('contact.aJour') : actualisation === 'erreur' ? t('contact.impossible') : majLe ? t('contact.derniereMaj', { date: dateHeure(majLe, langue) }) : t('contact.jamais')}
            charge={actualisation === 'encours'}
            onPress={async () => { setActualisation('encours'); setActualisation((await actualiser()) ? 'ok' : 'erreur'); }}
            dernier
            sansFleche
          />
        </View>

        <Text style={s.version}>{t('contact.version', { v: Constants.expoConfig?.version ?? '' })}</Text>
      </ScrollView>
    </View>
  );
}

function Action({ C, icone, texte, onPress }: { C: Palette; icone: NomIcone; texte: string; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} style={({ pressed }) => [s.action, pressed && { backgroundColor: 'rgba(255,255,255,0.2)' }]} accessibilityRole="button">
      <Icone nom={icone} taille={24} couleur="#fff" />
      <Text style={s.actionTexte}>{texte}</Text>
    </Pressable>
  );
}

function Element({ C, icone, texte, detail, onPress, dernier, charge, sansFleche }: {
  C: Palette; icone: NomIcone; texte: string; detail?: string; onPress: () => void; dernier?: boolean; charge?: boolean; sansFleche?: boolean;
}) {
  const s = feuille(C);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.element, !dernier && s.bordure, pressed && { backgroundColor: C.surface }]} accessibilityRole="button">
      <View style={s.elementIcone}><Icone nom={icone} taille={19} couleur={C.marque} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.elementTexte}>{texte}</Text>
        {detail ? <Text style={s.elementDetail}>{detail}</Text> : null}
      </View>
      {charge ? <ActivityIndicator color={C.marque} /> : sansFleche ? null : <Icone nom="chevron-forward" taille={18} couleur={C.texte3} />}
    </Pressable>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.fond },
  contenu: { padding: 16, paddingBottom: 32 },
  conciergerie: { padding: 18, borderRadius: 22, backgroundColor: C.sombre ? '#1f2350' : '#232859', boxShadow: C.ombre },
  conciergerieTitre: { color: '#fff', fontSize: 18, fontWeight: '800' },
  conciergerieTexte: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  actionTexte: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  menuTitre: { marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', color: C.texte3 },
  menu: { borderRadius: 16, backgroundColor: C.carte, boxShadow: C.ombre, overflow: 'hidden' },
  element: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  bordure: { borderBottomWidth: 1, borderBottomColor: C.bord },
  elementIcone: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  elementTexte: { fontSize: 15, fontWeight: '600', color: C.texte },
  elementDetail: { fontSize: 12.5, color: C.texte3, marginTop: 1 },
  reglage: { padding: 13, gap: 10 },
  reglageTete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  version: { textAlign: 'center', color: C.texte3, fontSize: 12, marginTop: 20 },
}));
