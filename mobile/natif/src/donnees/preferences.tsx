/** Préférences du téléphone : langue, apparence, notifications. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { traducteur, type Langue, type Traduire } from './i18n';
import { activerNotifications, afficherNotification, desactiverNotifications, type EtatNotifications } from './notifications';
import { CLAIR, SOMBRE, type Palette } from './theme';

export type ChoixTheme = 'systeme' | 'clair' | 'sombre';

const CLES = { langue: 'dl:langue', theme: 'dl:theme', notifications: 'dl:notifications' };

type Preferences = {
  pretes: boolean;
  langue: Langue; changerLangue: (l: Langue) => void; t: Traduire;
  theme: ChoixTheme; changerTheme: (c: ChoixTheme) => void; C: Palette;
  notifications: EtatNotifications;
  /** Jeton des notifications distantes (service Expo configuré), sinon null. */
  jeton: string | null;
  basculerNotifications: () => Promise<void>;
  /** Active les notifications si besoin (demande d'autorisation). */
  assurerNotifications: () => Promise<{ actif: boolean; jeton: string | null }>;
};

const Contexte = createContext<Preferences | null>(null);

function langueDuTelephone(): Langue {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' || code === 'es' ? code : 'fr';
}

export function FournisseurPreferences({ children }: { children: ReactNode }) {
  const schema = useColorScheme();
  const [pretes, setPretes] = useState(false);
  const [langue, setLangue] = useState<Langue>(langueDuTelephone());
  const [theme, setTheme] = useState<ChoixTheme>('systeme');
  const [notifications, setNotifications] = useState<EtatNotifications>('inactif');
  const [jeton, setJeton] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [l, th, n] = await Promise.all([
        AsyncStorage.getItem(CLES.langue), AsyncStorage.getItem(CLES.theme), AsyncStorage.getItem(CLES.notifications),
      ]).catch(() => [null, null, null]);
      const langueRetenue = l === 'fr' || l === 'en' || l === 'es' ? l : langueDuTelephone();
      setLangue(langueRetenue);
      AsyncStorage.setItem(CLES.langue, langueRetenue).catch(() => {});
      if (th === 'clair' || th === 'sombre' || th === 'systeme') setTheme(th);
      setPretes(true);
      // Notifications déjà acceptées : réactivées en silence (autorisation, tâche de fond, jeton).
      if (n === '1') {
        const resultat = await activerNotifications(langueRetenue, false);
        setNotifications(resultat.etat === 'actif' ? 'actif' : 'inactif');
        setJeton(resultat.jeton);
        if (resultat.etat !== 'actif') await desactiverNotifications(null);
      }
    })();
  }, []);

  const changerLangue = useCallback((l: Langue) => {
    setLangue(l);
    AsyncStorage.setItem(CLES.langue, l).catch(() => {});
    // La langue des notifications suit celle de l'application.
    if (notifications === 'actif') activerNotifications(l, false).catch(() => {});
  }, [notifications]);

  const changerTheme = useCallback((c: ChoixTheme) => {
    setTheme(c);
    AsyncStorage.setItem(CLES.theme, c).catch(() => {});
  }, []);

  const activer = useCallback(async () => {
    const resultat = await activerNotifications(langue, true);
    setNotifications(resultat.etat);
    setJeton(resultat.jeton);
    if (resultat.etat === 'actif') {
      const t = traducteur(langue);
      // Confirmation visible : l'utilisateur voit tout de suite que cela fonctionne.
      afficherNotification(t('notif.active'), t('notif.activeCorps'), { ecran: 'profil' }).catch(() => {});
    }
    return resultat;
  }, [langue]);

  const basculerNotifications = useCallback(async () => {
    if (notifications === 'actif') {
      await desactiverNotifications(jeton);
      setNotifications('inactif');
      setJeton(null);
      return;
    }
    await activer();
  }, [notifications, jeton, activer]);

  const assurerNotifications = useCallback(async () => {
    if (notifications === 'actif') return { actif: true, jeton };
    const resultat = await activer();
    return { actif: resultat.etat === 'actif', jeton: resultat.jeton };
  }, [notifications, jeton, activer]);

  const sombre = theme === 'sombre' || (theme === 'systeme' && schema === 'dark');
  const valeur = useMemo<Preferences>(() => ({
    pretes, langue, changerLangue, t: traducteur(langue), theme, changerTheme, C: sombre ? SOMBRE : CLAIR,
    notifications, jeton, basculerNotifications, assurerNotifications,
  }), [pretes, langue, changerLangue, theme, changerTheme, sombre, notifications, jeton, basculerNotifications, assurerNotifications]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function usePreferences() {
  const p = useContext(Contexte);
  if (!p) throw new Error('usePreferences doit être utilisé sous FournisseurPreferences');
  return p;
}
