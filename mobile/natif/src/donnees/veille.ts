/**
 * Veille des notifications, sans service de notifications distantes :
 *   · nouvelles annonces : comparaison avec les annonces déjà connues ;
 *   · suivi des demandes : statut demandé au site (POST /api/app/suivi).
 * Appelée à chaque actualisation des annonces (app ouverte) et par la tâche
 * de fond (app fermée). Mêmes règles que db/notifications-app.js du site.
 * Si les notifications distantes Expo sont actives (jeton), le site les
 * envoie déjà : la veille ne fait alors que mettre à jour les statuts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API } from './config';
import { traducteur, type Langue } from './i18n';

export const CLES_VEILLE = {
  active: 'dl:notifications',
  jeton: 'dl:jeton',
  langue: 'dl:langue',
  connues: 'dl:annonces-connues',
  historique: 'dl:historique',
};

export type Afficher = (titre: string, corps: string, donnees: Record<string, string>) => Promise<void>;
type DemandeSuivie = { id?: string; statut?: string; suivi?: boolean };

const FRAICHEUR_PUBLICATION_MS = 3 * 24 * 3600 * 1000;
const STATUTS_NOTIFIES = ['contacte', 'confirme'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function annoncesPubliques(contenu: any) {
  const visibles = (liste: unknown) => (Array.isArray(liste) ? liste : []).filter((x: any) => x && x.id && x.visible !== false);
  const maintenant = Date.now();
  const annonces: { cle: string; type: string; id: string; titre: string; recente: boolean }[] = [];
  visibles(contenu.villas).forEach((v: any) => annonces.push({ cle: `villa:${v.id}`, type: 'villa', id: String(v.id), titre: String(v.name || ''), recente: true }));
  visibles(contenu.terrains).filter((x: any) => String(x.status || '').toLowerCase() !== 'vendu')
    .forEach((x: any) => annonces.push({ cle: `terrain:${x.id}`, type: 'terrain', id: String(x.id), titre: String(x.title || ''), recente: true }));
  visibles(contenu.activities).forEach((a: any) => annonces.push({ cle: `activite:${a.id}`, type: 'activite', id: String(a.id), titre: String(a.title || ''), recente: true }));
  (Array.isArray(contenu.facebookPosts) ? contenu.facebookPosts : []).forEach((p: any) => {
    if (!p || !p.id || (!p.message && !p.full_picture)) return;
    const date = Date.parse(p.created_time || '');
    const titre = String((p.fiche && p.fiche.name) || String(p.message || '').split('\n').map((l: string) => l.trim()).find((l: string) => l.length > 3) || '');
    annonces.push({ cle: `publication:${p.id}`, type: 'publication', id: String(p.id), titre: titre.slice(0, 80), recente: Number.isFinite(date) && maintenant - date <= FRAICHEUR_PUBLICATION_MS });
  });
  return annonces;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function lire<T>(cle: string, repli: T): Promise<T> {
  try { const brut = await AsyncStorage.getItem(cle); return brut ? (JSON.parse(brut) as T) : repli; } catch { return repli; }
}

/**
 * Mémorise les annonces actuelles comme « connues » sans rien afficher.
 * Appelée à l'activation : on ne veut pas recevoir tout le catalogue d'un coup.
 */
export async function amorcerVeille(contenu: unknown) {
  if (!contenu) return;
  await AsyncStorage.setItem(CLES_VEILLE.connues, JSON.stringify(annoncesPubliques(contenu).map(a => a.cle))).catch(() => {});
}

/** Renvoie l'historique mis à jour (statuts) pour que l'écran Profil suive. */
export async function executerVeille(afficher: Afficher, contenuFourni?: unknown): Promise<DemandeSuivie[] | null> {
  const [active, jeton, langueLue] = await Promise.all([
    AsyncStorage.getItem(CLES_VEILLE.active), AsyncStorage.getItem(CLES_VEILLE.jeton), AsyncStorage.getItem(CLES_VEILLE.langue),
  ]).catch(() => [null, null, null]);
  if (active !== '1') return null;
  const langue: Langue = langueLue === 'en' || langueLue === 'es' ? langueLue : 'fr';
  const t = traducteur(langue);
  const distantes = Boolean(jeton);

  // --- Nouvelles annonces ---------------------------------------------------
  try {
    const contenu = contenuFourni ?? await fetch(`${API}/api/content`, { headers: { Accept: 'application/json' } }).then(r => (r.ok ? r.json() : null));
    if (contenu) {
      const annonces = annoncesPubliques(contenu);
      const connues = await lire<string[] | null>(CLES_VEILLE.connues, null);
      await AsyncStorage.setItem(CLES_VEILLE.connues, JSON.stringify(annonces.map(a => a.cle).concat(connues || []).slice(0, 5000)));
      if (connues && !distantes) {
        const dejaVues = new Set(connues);
        const nouvelles = annonces.filter(a => !dejaVues.has(a.cle) && a.recente);
        if (nouvelles.length === 1) {
          const a = nouvelles[0];
          await afficher(t(`notif.${a.type}` as 'notif.villa'), a.titre || t('notif.plusieursCorps'), { type: a.type, id: a.id });
        } else if (nouvelles.length > 1) {
          await afficher(t('notif.plusieurs', { n: nouvelles.length }), t('notif.plusieursCorps'), { ecran: 'explorer' });
        }
      }
    }
  } catch { /* réseau indisponible : prochaine fois */ }

  // --- Suivi des demandes ---------------------------------------------------
  const historique = await lire<DemandeSuivie[]>(CLES_VEILLE.historique, []);
  const aSuivre = historique.filter(d => d.id && d.statut !== 'confirme' && d.statut !== 'archive');
  if (!aSuivre.length) return historique;
  try {
    const reponse = await fetch(`${API}/api/app/suivi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: aSuivre.map(d => d.id) }),
    });
    const { statuts } = (await reponse.json()) as { statuts?: Record<string, string> };
    if (!statuts) return historique;
    let modifie = false;
    for (const demande of historique) {
      const nouveau = demande.id ? statuts[demande.id] : undefined;
      if (!nouveau || nouveau === demande.statut) continue;
      if (demande.suivi !== false && !distantes && STATUTS_NOTIFIES.includes(nouveau)) {
        await afficher(t(`notif.${nouveau}` as 'notif.contacte'), t(`notif.${nouveau}Corps` as 'notif.contacteCorps'), { ecran: 'profil' });
      }
      demande.statut = nouveau;
      modifie = true;
    }
    if (modifie) await AsyncStorage.setItem(CLES_VEILLE.historique, JSON.stringify(historique));
    return historique;
  } catch {
    return historique;
  }
}
