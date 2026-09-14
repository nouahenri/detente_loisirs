/**
 * Barre d'onglets NATIVE : UITabBarController sur iOS, barre de navigation
 * Material 3 sur Android (expo-router/unstable-native-tabs).
 */
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';

export default function Onglets() {
  const { favoris, donnees } = useMagasin();
  const { C, t } = usePreferences();
  // Favoris encore publiés (une annonce retirée du site ne compte plus).
  const nbFavoris = donnees
    ? favoris.filter(cle => {
      const [type, ...reste] = cle.split(':');
      const id = reste.join(':');
      const liste = { villa: donnees.villas, terrain: donnees.terrains, activite: donnees.activites, publication: donnees.publications }[type] as { id: string }[] | undefined;
      return Boolean(liste && liste.some(item => item.id === id));
    }).length
    : 0;
  const actif = C.sombre ? C.or : '#151837';

  return (
    <NativeTabs
      tintColor={actif}
      backgroundColor={C.barreOnglets}
      iconColor={{ default: C.texte3, selected: actif }}
      indicatorColor={C.orPale}
      badgeBackgroundColor={C.danger}
      labelStyle={{ default: { color: C.texte3 }, selected: { color: actif } }}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>{t('onglet.accueil')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explorer">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>{t('onglet.explorer')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="devis">
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="request_quote" />
        <NativeTabs.Trigger.Label>{t('onglet.devis')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="favoris">
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        <NativeTabs.Trigger.Label>{t('onglet.favoris')}</NativeTabs.Trigger.Label>
        {nbFavoris > 0 ? <NativeTabs.Trigger.Badge>{String(nbFavoris)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contact">
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="chat" />
        <NativeTabs.Trigger.Label>{t('onglet.contact')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
