/**
 * NEWSLETTER — abonnés (double opt-in) et campagnes.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI LE DOUBLE OPT-IN N'EST PAS OPTIONNEL
 * ---------------------------------------------------------------------------
 * Sans confirmation par e-mail, n'importe qui peut inscrire l'adresse d'un
 * tiers depuis le formulaire public. Ces adresses se plaignent, marquent les
 * envois comme indésirables, et le domaine henri-philippe.com finit signalé :
 * plus aucun message ne part, y compris les devis et les confirmations de
 * séjour. L'inscription crée donc un abonné « en-attente » ; seul le clic sur
 * le lien reçu le fait passer en « confirme », et lui seul reçoit les envois.
 *
 * ---------------------------------------------------------------------------
 * JETONS — jamais stockés en clair
 * ---------------------------------------------------------------------------
 * · Jeton de CONFIRMATION : aléatoire, à usage unique. Seule son empreinte
 *   SHA-256 est enregistrée ; elle est effacée une fois la confirmation faite.
 * · Jeton de DÉSABONNEMENT : dérivé par HMAC-SHA-256 de l'identifiant de
 *   l'abonné avec un secret serveur. Il n'est donc jamais stocké en clair non
 *   plus (la base ne contient que son empreinte SHA-256), tout en restant
 *   reconstructible au moment d'un envoi — ce qui permet de placer un lien de
 *   désabonnement STABLE dans chaque message, comme l'exige la loi, sans
 *   invalider les liens des campagnes précédentes.
 *   Conséquence à connaître : changer NEWSLETTER_TOKEN_SECRET invalide tous
 *   les liens de désabonnement déjà envoyés (les abonnés restent intacts).
 *
 * Stockage : MySQL quand la base répond, fichiers `data/*.json` sinon —
 * exactement la même logique que le reste du projet.
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const SUBSCRIBERS_FILE = 'newsletter-subscribers.json';
const CAMPAIGNS_FILE = 'newsletter-campaigns.json';
const SECRET_FILE = 'app-secret.json';

const STATUSES = ['en-attente', 'confirme', 'desabonne'];
const STATUS_LABELS = {
  'en-attente': 'En attente de confirmation',
  'confirme': 'Confirmé',
  'desabonne': 'Désabonné'
};

const CAMPAIGN_STATUSES = ['brouillon', 'en-cours', 'envoye', 'partiel', 'erreur'];

// ---------------------------------------------------------------------------
// Accès MySQL optionnel (même mécanique que db/auth-store.js)
// ---------------------------------------------------------------------------
let repository = null;
let dbReadyProbe = () => false;

function configure(options = {}) {
  if (typeof options.isDbReady === 'function') dbReadyProbe = options.isDbReady;
}

function useDb() {
  try { return Boolean(dbReadyProbe()); } catch { return false; }
}

function repo() {
  if (repository === null) {
    try { repository = require('./repository'); } catch { repository = false; }
  }
  return repository;
}

async function sql(query, params = []) {
  const active = repo();
  if (!active) throw new Error('MySQL non configuré');
  return active.query(query, params);
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function toMysqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Validation d'adresse volontairement stricte mais non exotique :
 * une partie locale sans espace, un domaine avec au moins un point et une
 * extension alphabétique. Refuse les doubles points et les points en bord,
 * qui sont les fautes de frappe les plus fréquentes.
 */
function isValidEmail(value) {
  const email = String(value ?? '').trim();
  if (email.length < 6 || email.length > 180) return false;
  if (/\.\./.test(email)) return false;
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/.test(email);
}

/**
 * Téléphone — FACULTATIF.
 *
 * Volontairement permissif : la clientèle est internationale (Côte d'Ivoire,
 * France, diaspora) et les habitudes d'écriture varient (« +225 07 07 ... »,
 * « 07.07... », « (225) 07 ... »). Refuser un numéro correct parce qu'il est
 * écrit autrement coûterait des inscriptions pour rien.
 *
 * On ne conserve donc que le « + » initial éventuel et les chiffres, en
 * gardant la saisie lisible. Un champ vide reste vide : c'est un cas normal,
 * pas une erreur.
 */
function normalizePhone(value) {
  const brut = text(value, 40);
  if (!brut) return '';
  let chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return '';
  // « 00225… » est la façon d'écrire « +225… » héritée du fixe : les deux
  // désignent le même numéro international, on garde une seule forme.
  const international = brut.trimStart().startsWith('+') || chiffres.startsWith('00');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  return international ? `+${chiffres}` : chiffres;
}

/**
 * Le numéro WhatsApp est FACULTATIF, mais s'il est donné il doit porter son
 * indicatif pays.
 *
 * Ce n'est pas du formalisme : WhatsApp n'adresse un contact que par son
 * numéro international (wa.me/2250707…). Un « 07 07 12 34 56 » enregistré nu
 * serait inexploitable — on ne saurait pas s'il est ivoirien, français ou
 * autre. Mieux vaut le refuser tout de suite, en l'expliquant, que stocker
 * des numéros que personne ne pourra jamais appeler.
 *
 * Bornes : 8 à 15 chiffres, indicatif compris (plafond de la norme E.164).
 */
function isValidPhone(value) {
  const brut = text(value, 40);
  if (!brut) return true;                    // champ laissé vide : normal
  const normalise = normalizePhone(brut);
  // Une saisie sans indicatif — ou sans le moindre chiffre (« abc ») — est une
  // erreur, pas un champ vide : la passer en silence ferait croire au visiteur
  // que son numéro a été pris en compte.
  if (!normalise.startsWith('+')) return false;
  const chiffres = normalise.length - 1;
  return chiffres >= 8 && chiffres <= 15;
}

function normalizeEmail(value) {
  return text(value, 180).toLowerCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Secret serveur utilisé pour dériver les jetons de désabonnement.
 * Ordre : NEWSLETTER_TOKEN_SECRET, puis ADMIN_SECRET, puis un secret aléatoire
 * généré une seule fois et conservé dans data/app-secret.json (mode local).
 */
let cachedSecret = null;
function tokenSecret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.NEWSLETTER_TOKEN_SECRET || process.env.ADMIN_SECRET || '';
  if (fromEnv && fromEnv !== 'assinie-demo') { cachedSecret = fromEnv; return cachedSecret; }
  const stored = jsonStore.read(SECRET_FILE, null);
  if (stored?.newsletterSecret) { cachedSecret = stored.newsletterSecret; return cachedSecret; }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  try { jsonStore.write(SECRET_FILE, { ...(stored || {}), newsletterSecret: cachedSecret, createdAt: new Date().toISOString() }); }
  catch { /* si le disque est en lecture seule, le secret reste valable le temps du processus */ }
  return cachedSecret;
}

/** Jeton de désabonnement stable, dérivé de l'identifiant de l'abonné. */
function unsubscribeTokenFor(id) {
  return crypto.createHmac('sha256', tokenSecret()).update(`desabonnement:${id}`).digest('base64url');
}

function newConfirmToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// ---------------------------------------------------------------------------
// Conversion / projection
// ---------------------------------------------------------------------------
function subscriberFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    phone: row.phone || '',
    status: row.status,
    confirmTokenHash: row.confirm_token_hash || null,
    unsubscribeTokenHash: row.unsubscribe_token_hash || null,
    source: row.source || 'site',
    confirmedAt: toIso(row.confirmed_at),
    unsubscribedAt: toIso(row.unsubscribed_at),
    ip: row.ip || '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

/** Ce qui peut être renvoyé au studio : aucune empreinte de jeton. */
function publicSubscriber(subscriber) {
  if (!subscriber) return null;
  return {
    id: subscriber.id,
    email: subscriber.email,
    name: subscriber.name || '',
    phone: subscriber.phone || '',
    status: subscriber.status,
    statusLabel: STATUS_LABELS[subscriber.status] || subscriber.status,
    source: subscriber.source || 'site',
    confirmedAt: subscriber.confirmedAt || null,
    unsubscribedAt: subscriber.unsubscribedAt || null,
    createdAt: subscriber.createdAt || null
  };
}

// ---------------------------------------------------------------------------
// Fichiers JSON (mode sans base)
// ---------------------------------------------------------------------------
function readSubscribersFile() {
  const list = jsonStore.read(SUBSCRIBERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function writeSubscribersFile(list) {
  jsonStore.write(SUBSCRIBERS_FILE, list);
}

function readCampaignsFile() {
  const list = jsonStore.read(CAMPAIGNS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function writeCampaignsFile(list) {
  jsonStore.write(CAMPAIGNS_FILE, list);
}

// ---------------------------------------------------------------------------
// ABONNÉS
// ---------------------------------------------------------------------------
async function getByEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM newsletter_subscribers WHERE email = ? LIMIT 1', [key]);
      return rows.length ? subscriberFromRow(rows[0]) : null;
    } catch { /* repli fichier */ }
  }
  return readSubscribersFile().find(item => item.email === key) || null;
}

async function getById(id) {
  const key = text(id, 36);
  if (!key) return null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM newsletter_subscribers WHERE id = ? LIMIT 1', [key]);
      return rows.length ? subscriberFromRow(rows[0]) : null;
    } catch { /* repli fichier */ }
  }
  return readSubscribersFile().find(item => item.id === key) || null;
}

// Dernier basculement en mode dégradé (écriture MySQL refusée, abonné sauvé
// dans le fichier). Exposé au studio pour que l'exploitant voie l'incident
// sans avoir à lire les journaux du serveur.
let lastDegradedWrite = null;

/** Renseigne le studio sur le dernier repli fichier, ou null si tout va bien. */
function degradedWrite() {
  return lastDegradedWrite;
}

/**
 * Écrit un abonné dans le fichier JSON local. Sert à la fois de stockage
 * nominal (sans MySQL) et de filet de sécurité quand la base refuse l'écriture.
 */
function persistToFile(subscriber) {
  const list = readSubscribersFile();
  const index = list.findIndex(item => item.id === subscriber.id);
  if (index >= 0) list[index] = subscriber; else list.push(subscriber);
  writeSubscribersFile(list);
  return subscriber;
}

/**
 * Enregistre un abonné.
 *
 * En mode MySQL, un refus d'écriture NE FAIT PLUS perdre l'adresse : elle est
 * recopiée dans data/newsletter-subscribers.json et l'incident est signalé
 * dans les journaux. La raison est simple — une adresse donnée par un visiteur
 * ne se redemande pas. Les lectures (listSubscribers, counts, confirm,
 * unsubscribe) retombent déjà sur ce même fichier quand la base ne répond
 * pas : l'abonné reste donc visible dans le studio et peut confirmer son
 * inscription. Une fois la base réparée, `npm run migrate` puis
 * `npm run seed` réalignent les deux stockages.
 */
async function persist(subscriber, { insert = false } = {}) {
  if (useDb()) {
    try {
      return await persistToDb(subscriber, insert);
    } catch (error) {
      console.error(`[newsletter] Écriture MySQL refusée pour ${subscriber.email} : ${error.message}`);
      console.error('[newsletter] Adresse conservée dans data/newsletter-subscribers.json. '
        + 'Vérifiez que la table « newsletter_subscribers » existe (npm run migrate).');
      persistToFile(subscriber);
      lastDegradedWrite = { at: new Date().toISOString(), email: subscriber.email, error: error.message };
      // On NE relève PAS l'erreur : l'adresse est enregistrée, le parcours du
      // visiteur doit aller jusqu'au bout. Il reçoit son e-mail de
      // confirmation, et confirm() saura le retrouver dans le fichier.
      // L'incident reste visible dans les journaux et via degradedWrite().
      return subscriber;
    }
  }
  return persistToFile(subscriber);
}

/** Écriture MySQL seule : lève si la table manque ou si la base refuse. */
// La colonne `phone` a été ajoutée après la mise en service. Une base qui n'a
// pas encore reçu la migration refuserait toute écriture citant cette colonne
// — donc TOUTE inscription, même sans numéro. Plutôt que de lier le
// déploiement du code à celui du schéma, on détecte le cas une fois et on
// écrit sans le numéro tant que la colonne manque. Les lectures, elles, n'ont
// rien à gérer : `row.phone || ''` couvre déjà son absence.
let colonnePhoneAbsente = false;

/** La colonne `phone` manque-t-elle en base ? (pour l'alerte du studio) */
function phoneColumnMissing() {
  return colonnePhoneAbsente;
}

async function persistToDb(subscriber, insert) {
  try {
    return await ecrireAbonne(subscriber, insert, !colonnePhoneAbsente);
  } catch (error) {
    const colonneInconnue = /unknown column\s+'?phone'?/i.test(error.message || '');
    if (!colonneInconnue || colonnePhoneAbsente) throw error;
    colonnePhoneAbsente = true;
    console.warn('[newsletter] La colonne « phone » n\'existe pas encore dans newsletter_subscribers.');
    console.warn('[newsletter] Les inscriptions sont enregistrées SANS le numéro WhatsApp. '
      + 'Lancez « npm run migrate » (ou l\'ALTER TABLE) pour l\'ajouter.');
    return ecrireAbonne(subscriber, insert, false);
  }
}

/** Écriture MySQL, avec ou sans la colonne `phone` selon ce que la base accepte. */
async function ecrireAbonne(subscriber, insert, avecPhone) {
  if (insert) {
    const colonnes = ['id', 'email', 'name', ...(avecPhone ? ['phone'] : []), 'status',
      'confirm_token_hash', 'unsubscribe_token_hash', 'source', 'confirmed_at',
      'unsubscribed_at', 'ip', 'created_at', 'updated_at'];
    const valeurs = [subscriber.id, subscriber.email, subscriber.name,
      ...(avecPhone ? [subscriber.phone] : []), subscriber.status,
      subscriber.confirmTokenHash, subscriber.unsubscribeTokenHash, subscriber.source,
      toMysqlDate(subscriber.confirmedAt), toMysqlDate(subscriber.unsubscribedAt),
      subscriber.ip, toMysqlDate(subscriber.createdAt), toMysqlDate(subscriber.updatedAt)];
    await sql(
      `INSERT INTO newsletter_subscribers (${colonnes.join(', ')})
       VALUES (${colonnes.map(() => '?').join(',')})`,
      valeurs
    );
  } else {
    await sql(
      `UPDATE newsletter_subscribers
          SET email = ?, name = ?, ${avecPhone ? 'phone = ?, ' : ''}status = ?,
              confirm_token_hash = ?, unsubscribe_token_hash = ?,
              source = ?, confirmed_at = ?, unsubscribed_at = ?, ip = ?, updated_at = ?
        WHERE id = ?`,
      [subscriber.email, subscriber.name, ...(avecPhone ? [subscriber.phone] : []),
        subscriber.status, subscriber.confirmTokenHash, subscriber.unsubscribeTokenHash,
        subscriber.source, toMysqlDate(subscriber.confirmedAt),
        toMysqlDate(subscriber.unsubscribedAt), subscriber.ip,
        toMysqlDate(subscriber.updatedAt), subscriber.id]
    );
  }
  return subscriber;
}

/**
 * Inscription (première étape du double opt-in).
 *
 * Renvoie toujours un résultat exploitable, jamais une erreur d'existence :
 *   · nouvel abonné            → { created:true,  confirmToken }
 *   · déjà en attente          → { created:false, confirmToken }  (renvoi du lien)
 *   · déjà confirmé            → { created:false, alreadyConfirmed:true }
 *   · désabonné qui revient    → { created:false, confirmToken }  (réinscription)
 * L'appelant renvoie au visiteur un message identique dans tous les cas, pour
 * ne pas révéler qui est déjà inscrit.
 */
async function subscribe({ email, name = '', phone = '', source = 'site', ip = '' }) {
  const key = normalizeEmail(email);
  if (!isValidEmail(key)) throw new Error('Adresse e-mail invalide.');
  const now = new Date().toISOString();
  const existing = await getByEmail(key);

  if (existing && existing.status === 'confirme') {
    return { subscriber: publicSubscriber(existing), created: false, alreadyConfirmed: true, confirmToken: null };
  }

  const confirmToken = newConfirmToken();

  if (existing) {
    const next = {
      ...existing,
      name: text(name, 120) || existing.name,
      phone: normalizePhone(phone) || existing.phone || '',
      status: 'en-attente',
      confirmTokenHash: sha256(confirmToken),
      unsubscribeTokenHash: sha256(unsubscribeTokenFor(existing.id)),
      source: text(source, 60) || existing.source,
      unsubscribedAt: null,
      ip: text(ip, 64),
      updatedAt: now
    };
    await persist(next);
    return { subscriber: publicSubscriber(next), created: false, alreadyConfirmed: false, confirmToken };
  }

  const id = crypto.randomUUID();
  const subscriber = {
    id,
    email: key,
    name: text(name, 120),
    phone: normalizePhone(phone),
    status: 'en-attente',
    confirmTokenHash: sha256(confirmToken),
    unsubscribeTokenHash: sha256(unsubscribeTokenFor(id)),
    source: text(source, 60) || 'site',
    confirmedAt: null,
    unsubscribedAt: null,
    ip: text(ip, 64),
    createdAt: now,
    updatedAt: now
  };
  await persist(subscriber, { insert: true });
  return { subscriber: publicSubscriber(subscriber), created: true, alreadyConfirmed: false, confirmToken };
}

/** Deuxième étape du double opt-in : le clic sur le lien reçu. */
async function confirm(token) {
  const hash = sha256(String(token || ''));
  if (!token) return { ok: false, reason: 'jeton-absent' };
  let subscriber = null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM newsletter_subscribers WHERE confirm_token_hash = ? LIMIT 1', [hash]);
      subscriber = rows.length ? subscriberFromRow(rows[0]) : null;
    } catch { subscriber = null; }
  }
  // Repli fichier : l'abonné peut avoir été enregistré localement parce que la
  // base refusait l'écriture (voir persist). Sans cette relecture, son lien de
  // confirmation serait rejeté alors que son inscription est bien conservée.
  if (!subscriber) {
    subscriber = readSubscribersFile().find(item => item.confirmTokenHash === hash) || null;
  }
  if (!subscriber) return { ok: false, reason: 'jeton-inconnu' };

  const now = new Date().toISOString();
  const next = {
    ...subscriber,
    status: 'confirme',
    confirmTokenHash: null,          // jeton à usage unique : effacé après emploi
    unsubscribeTokenHash: sha256(unsubscribeTokenFor(subscriber.id)),
    confirmedAt: subscriber.confirmedAt || now,
    unsubscribedAt: null,
    updatedAt: now
  };
  await persist(next);
  return { ok: true, subscriber: publicSubscriber(next) };
}

/** Désabonnement — le lien figure dans chaque envoi (obligation légale). */
async function unsubscribe(token) {
  if (!token) return { ok: false, reason: 'jeton-absent' };
  const hash = sha256(String(token));
  let subscriber = null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM newsletter_subscribers WHERE unsubscribe_token_hash = ? LIMIT 1', [hash]);
      subscriber = rows.length ? subscriberFromRow(rows[0]) : null;
    } catch { subscriber = null; }
  }
  // Même repli que pour la confirmation : un lien de désabonnement ne doit
  // JAMAIS échouer, c'est une obligation légale.
  if (!subscriber) {
    subscriber = readSubscribersFile().find(item => item.unsubscribeTokenHash === hash) || null;
  }
  if (!subscriber) return { ok: false, reason: 'jeton-inconnu' };
  if (subscriber.status === 'desabonne') return { ok: true, subscriber: publicSubscriber(subscriber), already: true };

  const now = new Date().toISOString();
  const next = { ...subscriber, status: 'desabonne', confirmTokenHash: null, unsubscribedAt: now, updatedAt: now };
  await persist(next);
  return { ok: true, subscriber: publicSubscriber(next) };
}

/** Changement de statut depuis le studio (désabonnement manuel, réactivation). */
async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Statut inconnu « ${status} ».`);
  const subscriber = await getById(id);
  if (!subscriber) return null;
  const now = new Date().toISOString();
  const next = {
    ...subscriber,
    status,
    confirmedAt: status === 'confirme' ? (subscriber.confirmedAt || now) : subscriber.confirmedAt,
    unsubscribedAt: status === 'desabonne' ? now : null,
    unsubscribeTokenHash: subscriber.unsubscribeTokenHash || sha256(unsubscribeTokenFor(subscriber.id)),
    updatedAt: now
  };
  await persist(next);
  return publicSubscriber(next);
}

async function removeSubscriber(id) {
  const subscriber = await getById(id);
  if (!subscriber) return null;
  if (useDb()) await sql('DELETE FROM newsletter_subscribers WHERE id = ?', [subscriber.id]);
  else writeSubscribersFile(readSubscribersFile().filter(item => item.id !== subscriber.id));
  return publicSubscriber(subscriber);
}

async function listSubscribers({ status = 'all', search = '', limit = 1000 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 1000, 1), 5000);
  let rows = [];
  if (useDb()) {
    try {
      const [result] = await sql(
        `SELECT * FROM newsletter_subscribers ORDER BY created_at DESC LIMIT ${max}`
      );
      rows = result.map(subscriberFromRow);
    } catch { rows = readSubscribersFile(); }
  } else {
    rows = readSubscribersFile().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const needle = String(search || '').trim().toLowerCase();
  return rows
    .filter(item => (status === 'all' || !status ? true : item.status === status))
    .filter(item => (!needle ? true : `${item.email} ${item.name}`.toLowerCase().includes(needle)))
    .slice(0, max)
    .map(publicSubscriber);
}

async function counts() {
  const empty = { total: 0, 'en-attente': 0, confirme: 0, desabonne: 0 };
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT status, COUNT(*) AS total FROM newsletter_subscribers GROUP BY status');
      const result = { ...empty };
      rows.forEach(row => {
        if (result[row.status] !== undefined) result[row.status] = Number(row.total || 0);
        result.total += Number(row.total || 0);
      });
      return result;
    } catch { /* repli fichier */ }
  }
  return readSubscribersFile().reduce((acc, item) => {
    acc.total += 1;
    if (acc[item.status] !== undefined) acc[item.status] += 1;
    return acc;
  }, { ...empty });
}

/**
 * Destinataires d'une campagne : uniquement les abonnés « confirme ».
 * Chaque entrée porte son jeton de désabonnement EN CLAIR, reconstruit ici
 * pour l'insérer dans le message. Cette liste ne quitte jamais le serveur.
 */
async function confirmedRecipients() {
  let rows = [];
  if (useDb()) {
    try {
      const [result] = await sql("SELECT * FROM newsletter_subscribers WHERE status = 'confirme' ORDER BY created_at ASC");
      rows = result.map(subscriberFromRow);
    } catch { rows = readSubscribersFile().filter(item => item.status === 'confirme'); }
  } else {
    rows = readSubscribersFile().filter(item => item.status === 'confirme');
  }
  return rows.map(item => ({
    id: item.id, email: item.email, name: item.name || '',
    unsubscribeToken: unsubscribeTokenFor(item.id)
  }));
}

// ---------------------------------------------------------------------------
// CAMPAGNES
// ---------------------------------------------------------------------------
function campaignFromRow(row) {
  return {
    id: row.id,
    subject: row.subject,
    bodyHtml: row.body_html || '',
    bodyText: row.body_text || '',
    status: row.status,
    sentCount: Number(row.sent_count || 0),
    sentAt: toIso(row.sent_at),
    createdBy: row.created_by || '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

async function createCampaign({ subject, bodyHtml = '', bodyText = '', createdBy = '' }) {
  const cleanSubject = text(subject, 240);
  if (!cleanSubject) throw new Error('L’objet de la campagne est requis.');
  const body = String(bodyText || '').trim() || String(bodyHtml || '').replace(/<[^>]*>/g, ' ').trim();
  if (!body) throw new Error('Le message de la campagne est vide.');
  const now = new Date().toISOString();
  const campaign = {
    id: crypto.randomUUID(),
    subject: cleanSubject,
    bodyHtml: String(bodyHtml || '').slice(0, 200_000),
    bodyText: String(bodyText || '').slice(0, 200_000),
    status: 'brouillon',
    sentCount: 0,
    sentAt: null,
    createdBy: text(createdBy, 60),
    createdAt: now,
    updatedAt: now
  };
  if (useDb()) {
    await sql(
      `INSERT INTO newsletter_campaigns (id, subject, body_html, body_text, status, sent_count, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,0,?,?,?)`,
      [campaign.id, campaign.subject, campaign.bodyHtml, campaign.bodyText, campaign.status,
        campaign.createdBy, toMysqlDate(now), toMysqlDate(now)]
    );
  } else {
    const list = readCampaignsFile();
    list.unshift(campaign);
    writeCampaignsFile(list.slice(0, 500));
  }
  return campaign;
}

async function getCampaign(id) {
  const key = text(id, 36);
  if (!key) return null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM newsletter_campaigns WHERE id = ? LIMIT 1', [key]);
      return rows.length ? campaignFromRow(rows[0]) : null;
    } catch { /* repli fichier */ }
  }
  return readCampaignsFile().find(item => item.id === key) || null;
}

async function updateCampaign(id, patch = {}) {
  const campaign = await getCampaign(id);
  if (!campaign) return null;
  const next = { ...campaign, ...patch, updatedAt: new Date().toISOString() };
  if (patch.status && !CAMPAIGN_STATUSES.includes(patch.status)) throw new Error(`Statut de campagne inconnu « ${patch.status} ».`);
  if (useDb()) {
    await sql(
      'UPDATE newsletter_campaigns SET subject = ?, body_html = ?, body_text = ?, status = ?, sent_count = ?, sent_at = ?, updated_at = ? WHERE id = ?',
      [next.subject, next.bodyHtml, next.bodyText, next.status, Number(next.sentCount || 0),
        toMysqlDate(next.sentAt), toMysqlDate(next.updatedAt), next.id]
    );
  } else {
    const list = readCampaignsFile();
    const index = list.findIndex(item => item.id === next.id);
    if (index >= 0) { list[index] = next; writeCampaignsFile(list); }
  }
  return next;
}

async function listCampaigns(limit = 50) {
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  let rows = [];
  if (useDb()) {
    try {
      const [result] = await sql(`SELECT * FROM newsletter_campaigns ORDER BY created_at DESC LIMIT ${max}`);
      rows = result.map(campaignFromRow);
    } catch { rows = readCampaignsFile(); }
  } else {
    rows = readCampaignsFile();
  }
  // L'interface n'a pas besoin du corps complet dans la liste.
  return rows.slice(0, max).map(item => ({
    id: item.id, subject: item.subject, status: item.status, sentCount: item.sentCount,
    sentAt: item.sentAt, createdBy: item.createdBy, createdAt: item.createdAt,
    preview: String(item.bodyText || item.bodyHtml || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 180)
  }));
}

module.exports = {
  STATUSES, STATUS_LABELS, CAMPAIGN_STATUSES,
  configure, isValidEmail, normalizeEmail, normalizePhone, isValidPhone, unsubscribeTokenFor,
  subscribe, confirm, unsubscribe, setStatus, removeSubscriber,
  listSubscribers, counts, confirmedRecipients, getById, getByEmail, degradedWrite, phoneColumnMissing,
  createCampaign, getCampaign, updateCampaign, listCampaigns
};
