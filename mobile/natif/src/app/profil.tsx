/**
 * Profil : coordonnées (pré-remplissage des devis), réglages (langue,
 * apparence, notifications), activité (favoris, demandes envoyées) et
 * effacement des données. Tout reste sur le téléphone : l'app n'a pas de compte.
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { ChampChoix, type OptionChoix } from '@/composants/ChampChoix';
import { ouvrirLien, vibrerSelection, vibrerSucces } from '@/composants/outils';
import { Bouton, Icone, type NomIcone } from '@/composants/ui';
import { SITE } from '@/donnees/config';
import { dateCourte, LANGUES, type Langue } from '@/donnees/i18n';
import { useMagasin, type Coordonnees } from '@/donnees/magasin';
import { usePreferences, type ChoixTheme } from '@/donnees/preferences';
import { creerStyles, type Palette } from '@/donnees/theme';

export default function Profil() {
  const router = useRouter();
  const { coordonnees, enregistrerCoordonnees, historique, favoris, effacerDonneesPersonnelles } = useMagasin();
  const { C, t, langue, changerLangue, theme, changerTheme, notifications, basculerNotifications } = usePreferences();
  const s = feuille(C);
  const [saisie, setSaisie] = useState<Coordonnees>(coordonnees);
  const [enregistre, setEnregistre] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [notifEnCours, setNotifEnCours] = useState(false);

  // Coordonnées modifiées ailleurs (envoi d'un devis, effacement) : le formulaire suit.
  useEffect(() => { setSaisie(coordonnees); }, [coordonnees]);

  const modifie = saisie.nom !== coordonnees.nom || saisie.tel !== coordonnees.tel || saisie.email !== coordonnees.email;
  const nom = coordonnees.nom.trim();
  const detailNotifications = {
    actif: t('contact.notifDetail'), inactif: t('contact.notifDetail'), refuse: t('contact.notifRefusees'),
    indisponible: t('contact.notifIndispo'), nonConfigure: t('contact.notifNonConfigurees'),
  }[notifications];

  const confirmerEffacement = () => {
    const effacer = () => { effacerDonneesPersonnelles(); vibrerSucces(); };
    if (Platform.OS === 'web') { effacer(); return; }
    Alert.alert(t('profil.effacerTitre'), t('profil.effacerTexte'), [
      { text: t('profil.annuler'), style: 'cancel' },
      { text: t('profil.effacerOk'), style: 'destructive', onPress: effacer },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.fond }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <ScrollView contentContainerStyle={s.contenu} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <View style={s.identite}>
          <View style={s.avatar}>
            {nom ? <Text style={s.initiale}>{nom.charAt(0).toUpperCase()}</Text> : <Icone nom="person" taille={34} couleur={C.marque} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nom} numberOfLines={1}>{nom || t('profil.invite')}</Text>
            <Text style={s.local}>{coordonnees.tel || t('profil.local')}</Text>
          </View>
        </View>

        <Text style={s.menuTitre}>{t('profil.coordonnees')}</Text>
        {/* Tuile repliable : résumé fermé, formulaire ouvert, refermée après l'enregistrement. */}
        <View style={s.menu}>
          <Pressable
            onPress={() => { vibrerSelection(); LayoutAnimation.easeInEaseOut(); setOuvert(o => !o); setEnregistre(false); }}
            style={({ pressed }) => [s.element, pressed && { backgroundColor: C.surface }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: ouvert }}>
            <View style={s.elementIcone}><Icone nom="id-card-outline" taille={19} couleur={C.marque} /></View>
            <View style={{ flex: 1 }}>
              {enregistre ? (
                <View style={s.confirmation}><Icone nom="checkmark-circle" taille={16} couleur={C.ok} /><Text style={s.confirmationTexte}>{t('profil.enregistre')}</Text></View>
              ) : (
                <Text style={s.elementTexte} numberOfLines={1}>{coordonnees.nom || coordonnees.tel ? coordonnees.nom || coordonnees.tel : t('profil.ajouterCoord')}</Text>
              )}
              <Text style={s.elementDetail} numberOfLines={1}>
                {[coordonnees.nom ? coordonnees.tel : '', coordonnees.email].filter(Boolean).join(' · ') || t('profil.coordAide')}
              </Text>
            </View>
            <Text style={s.modifier}>{ouvert ? '' : t('profil.modifier')}</Text>
            <Icone nom={ouvert ? 'chevron-up' : 'chevron-down'} taille={18} couleur={C.texte3} />
          </Pressable>
          {ouvert ? (
            <View style={s.formulaire}>
              <Text style={s.aide}>{t('profil.coordAide')}</Text>
              <Champ C={C} libelle={t('devis.nom')} valeur={saisie.nom} placeholder={t('devis.exNom')} autoComplete="name" onChange={v => setSaisie(x => ({ ...x, nom: v }))} />
              <Champ C={C} libelle={t('devis.tel')} valeur={saisie.tel} placeholder={t('devis.exTel')} clavier="phone-pad" autoComplete="tel" onChange={v => setSaisie(x => ({ ...x, tel: v }))} />
              <Champ C={C} libelle={t('devis.email')} valeur={saisie.email} placeholder={t('devis.exEmail')} clavier="email-address" autoComplete="email" onChange={v => setSaisie(x => ({ ...x, email: v }))} />
              <Bouton
                texte={t('profil.enregistrer')}
                desactive={!modifie}
                onPress={() => {
                  enregistrerCoordonnees(saisie);
                  vibrerSucces();
                  LayoutAnimation.easeInEaseOut();
                  setOuvert(false);
                  setEnregistre(true);
                }}
              />
            </View>
          ) : null}
        </View>

        <Text style={s.menuTitre}>{t('contact.reglages')}</Text>
        <View style={s.menu}>
          <View style={s.bordure}>
            <ChampChoix
              variante="reglage"
              icone="language-outline"
              libelle={t('contact.langue')}
              valeur={langue}
              options={LANGUES.map(l => [l.code, `${l.drapeau}  ${l.nom}`] as OptionChoix)}
              onChange={v => changerLangue(v as Langue)}
            />
          </View>
          <View style={s.bordure}>
            <ChampChoix
              variante="reglage"
              icone="contrast-outline"
              libelle={t('contact.apparence')}
              valeur={theme}
              options={([['systeme', 'phone-portrait-outline'], ['clair', 'sunny-outline'], ['sombre', 'moon-outline']] as [ChoixTheme, NomIcone][])
                .map(([v, icone]) => [v, t(`theme.${v}`), icone] as OptionChoix)}
              onChange={v => changerTheme(v as ChoixTheme)}
            />
          </View>
          <View style={s.element}>
            <View style={s.elementIcone}><Icone nom="notifications-outline" taille={19} couleur={C.marque} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.elementTexte}>{t('contact.notifications')}</Text>
              <Text style={s.elementDetail}>{detailNotifications}</Text>
            </View>
            {notifEnCours ? <ActivityIndicator color={C.marque} /> : (
              <Switch
                value={notifications === 'actif'}
                disabled={notifications === 'indisponible' || notifications === 'nonConfigure'}
                onValueChange={async () => { vibrerSelection(); setNotifEnCours(true); await basculerNotifications(); setNotifEnCours(false); }}
                trackColor={{ true: C.or, false: C.bord }}
                thumbColor="#ffffff"
              />
            )}
          </View>
        </View>

        <Text style={s.menuTitre}>{t('profil.activite')}</Text>
        <View style={s.menu}>
          <Pressable onPress={() => { if (router.canGoBack()) router.back(); router.navigate('/favoris'); }} style={({ pressed }) => [s.element, s.bordure, pressed && { backgroundColor: C.surface }]} accessibilityRole="button">
            <View style={s.elementIcone}><Icone nom="heart-outline" taille={19} couleur={C.marque} /></View>
            <Text style={[s.elementTexte, { flex: 1 }]}>{t('profil.favoris')}</Text>
            <Text style={s.compteur}>{favoris.length}</Text>
            <Icone nom="chevron-forward" taille={18} couleur={C.texte3} />
          </Pressable>
          <Pressable onPress={() => { vibrerSelection(); router.push('/demandes'); }} style={({ pressed }) => [s.element, pressed && { backgroundColor: C.surface }]} accessibilityRole="button">
            <View style={s.elementIcone}><Icone nom="receipt-outline" taille={19} couleur={C.marque} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.elementTexte}>{t('profil.demandes')}</Text>
              <Text style={s.elementDetail} numberOfLines={1}>
                {historique.length
                  ? `${historique[0].objet} · ${t(`statut.${historique[0].statut || 'nouveau'}` as 'statut.nouveau')}`
                  : t('profil.aucuneDemande')}
              </Text>
            </View>
            <Text style={s.compteur}>{historique.length}</Text>
            <Icone nom="chevron-forward" taille={18} couleur={C.texte3} />
          </Pressable>
        </View>

        <Text style={s.menuTitre}>{t('profil.donnees')}</Text>
        <View style={s.menu}>
          <Pressable onPress={() => ouvrirLien(`${SITE}/confidentialite.html`, t)} style={({ pressed }) => [s.element, s.bordure, pressed && { backgroundColor: C.surface }]} accessibilityRole="button">
            <View style={s.elementIcone}><Icone nom="lock-closed-outline" taille={19} couleur={C.marque} /></View>
            <Text style={[s.elementTexte, { flex: 1 }]}>{t('contact.confidentialite')}</Text>
            <Icone nom="chevron-forward" taille={18} couleur={C.texte3} />
          </Pressable>
          <Pressable onPress={confirmerEffacement} style={({ pressed }) => [s.element, pressed && { backgroundColor: C.surface }]} accessibilityRole="button">
            <View style={[s.elementIcone, { backgroundColor: C.dangerPale }]}><Icone nom="trash-outline" taille={19} couleur={C.danger} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.elementTexte, { color: C.danger }]}>{t('profil.effacer')}</Text>
              <Text style={s.elementDetail}>{t('profil.effacerDetail')}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={s.version}>{t('contact.version', { v: Constants.expoConfig?.version ?? '' })}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tete({ C, icone, texte }: { C: Palette; icone: NomIcone; texte: string }) {
  const s = feuille(C);
  return (
    <View style={s.reglageTete}>
      <View style={s.elementIcone}><Icone nom={icone} taille={19} couleur={C.marque} /></View>
      <Text style={s.elementTexte}>{texte}</Text>
    </View>
  );
}

function Champ({ C, libelle, valeur, onChange, placeholder, clavier, autoComplete }: {
  C: Palette; libelle: string; valeur: string; onChange: (v: string) => void; placeholder: string;
  clavier?: 'phone-pad' | 'email-address'; autoComplete?: 'name' | 'tel' | 'email';
}) {
  const s = feuille(C);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.champLibelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.texte3}
        keyboardType={clavier}
        autoComplete={autoComplete}
        autoCapitalize={clavier ? 'none' : 'words'}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.champ, focus && { borderColor: C.sombre ? C.or : '#151837' }]}
      />
    </View>
  );
}

const feuille = creerStyles(C => ({
  contenu: { padding: 16, paddingBottom: 40 },
  identite: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: C.carte, boxShadow: C.ombre, borderWidth: 1, borderColor: C.bord },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.orPale, borderWidth: 2, borderColor: C.or, alignItems: 'center', justifyContent: 'center' },
  initiale: { fontSize: 26, fontWeight: '800', color: C.marque },
  nom: { fontSize: 20, fontWeight: '800', color: C.texte },
  local: { fontSize: 13.5, color: C.texte2, marginTop: 2 },
  menuTitre: { marginTop: 22, marginBottom: 8, marginLeft: 4, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', color: C.texte3 },
  menu: { borderRadius: 16, backgroundColor: C.carte, boxShadow: C.ombre, borderWidth: 1, borderColor: C.bord, overflow: 'hidden' },
  aide: { fontSize: 13, color: C.texte3, marginBottom: 10 },
  champLibelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginBottom: 6, marginLeft: 4 },
  champ: { height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.surface, fontSize: 16, color: C.texte },
  confirmation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmationTexte: { fontSize: 15, fontWeight: '700', color: C.ok },
  formulaire: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.bord },
  modifier: { fontSize: 13.5, fontWeight: '700', color: C.orTexte },
  element: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  bordure: { borderBottomWidth: 1, borderBottomColor: C.bord },
  elementIcone: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  elementTexte: { fontSize: 15, fontWeight: '600', color: C.texte },
  elementDetail: { fontSize: 12.5, color: C.texte3, marginTop: 1 },
  compteur: { fontSize: 14, fontWeight: '700', color: C.texte2 },
  reglage: { padding: 13, gap: 10 },
  reglageTete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demande: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  demandeObjet: { fontSize: 14.5, fontWeight: '700', color: C.texte },
  demandeDetail: { fontSize: 12.5, color: C.texte3, marginTop: 1 },
  demandeTotal: { fontSize: 14.5, fontWeight: '800', color: C.marque },
  lien: { fontSize: 13, fontWeight: '700', color: C.orTexte, marginTop: 4 },
  version: { textAlign: 'center', color: C.texte3, fontSize: 12, marginTop: 20 },
}));
