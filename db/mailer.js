/**
 * ENVOI D'E-MAILS — SMTP cPanel via nodemailer, avec file d'attente.
 *
 * ---------------------------------------------------------------------------
 * PRINCIPE : L'E-MAIL NE DOIT JAMAIS FAIRE TOMBER LE SITE
 * ---------------------------------------------------------------------------
 * `nodemailer` est chargé PARESSEUSEMENT (require à l'intérieur d'une
 * fonction), exactement comme `mysql2` dans db/pool.js. Si le module n'est pas
 * installé, si le SMTP n'est pas configuré, ou si le serveur de messagerie est
 * injoignable, aucune exception ne remonte à l'appelant :
 *   · le message est déposé dans la file d'attente (`mail_queue` en base, ou
 *     `data/mail-queue.json` sans base) avec le statut « en-attente » ;
 *   · l'appelant reçoit { sent:false, queued:true } et poursuit son travail.
 * Une inscription à la newsletter et surtout une demande client sont donc
 * TOUJOURS enregistrées, e-mail ou pas. Le studio affiche le nombre de
 * messages en attente et permet de relancer l'envoi une fois le SMTP réglé.
 *
 * ---------------------------------------------------------------------------
 * VARIABLES D'ENVIRONNEMENT
 * ---------------------------------------------------------------------------
 *   SMTP_HOST       mail.henri-philippe.com
 *   SMTP_PORT       465 (SSL implicite) ou 587 (STARTTLS)
 *   SMTP_USER       contact@henri-philippe.com
 *   SMTP_PASSWORD   mot de passe de la boîte cPanel
 *   SMTP_SECURE     auto (défaut) | true | false
 *   MAIL_FROM       Henri & Philippe <contact@henri-philippe.com>
 *   MAIL_REPLY_TO   contact@henri-philippe.com
 *   MAIL_TO         destinataire des notifications internes
 *                   (défaut : contact@henri-philippe.com)
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const QUEUE_FILE = 'mail-queue.json';
const DEFAULT_MAILBOX = 'contact@henri-philippe.com';
const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
function readConfig() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secureSetting = String(process.env.SMTP_SECURE || 'auto').toLowerCase();
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number.isFinite(port) && port > 0 ? port : 465,
    // 465 = SSL implicite ; 587 = STARTTLS (nodemailer attend secure:false et
    // négocie le chiffrement après la commande STARTTLS).
    secure: secureSetting === 'true' ? true : secureSetting === 'false' ? false : port === 465,
    user: String(process.env.SMTP_USER || '').trim(),
    password: String(process.env.SMTP_PASSWORD || ''),
    from: String(process.env.MAIL_FROM || `Henri & Philippe <${DEFAULT_MAILBOX}>`).trim(),
    replyTo: String(process.env.MAIL_REPLY_TO || DEFAULT_MAILBOX).trim(),
    notifyTo: String(process.env.MAIL_TO || DEFAULT_MAILBOX).trim()
  };
}

function isConfigured() {
  const config = readConfig();
  return Boolean(config.host && config.user && config.password);
}

// ---------------------------------------------------------------------------
// Transport nodemailer (chargement paresseux)
// ---------------------------------------------------------------------------
let transporter = null;
let driverError = null;
let lastError = null;

function getTransport() {
  if (!isConfigured()) throw new Error('SMTP non configuré (SMTP_HOST, SMTP_USER et SMTP_PASSWORD requis).');
  if (transporter) return transporter;
  if (driverError) throw driverError;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    driverError = new Error(
      'Le module nodemailer est absent. Lancez « Run NPM Install » dans cPanel ' +
      '(ou `npm install` en local). En attendant, les messages restent en file d’attente.'
    );
    throw driverError;
  }
  const config = readConfig();
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    pool: true,             // réutilise la connexion pour les envois par lots
    maxConnections: 2,      // un mutualisé n'accepte pas davantage
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
  return transporter;
}

/** Réinitialise le transport (après changement de configuration). */
function resetTransport() {
  try { transporter?.close?.(); } catch { /* rien à fermer */ }
  transporter = null;
  driverError = null;
}

/** Teste réellement la connexion SMTP. Ne lève jamais. */
async function verify() {
  try {
    const transport = getTransport();
    await transport.verify();
    lastError = null;
    return { ok: true };
  } catch (error) {
    lastError = String(error?.message || error).slice(0, 400);
    return { ok: false, error: lastError };
  }
}

// ---------------------------------------------------------------------------
// File d'attente (MySQL si disponible, fichier JSON sinon)
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

function readQueueFile() {
  const list = jsonStore.read(QUEUE_FILE, []);
  return Array.isArray(list) ? list : [];
}

function writeQueueFile(list) {
  // On conserve au plus 2000 entrées : au-delà, les plus anciennes envoyées
  // sont supprimées (les « en-attente » et « echec » sont toujours gardées).
  const pending = list.filter(item => item.status !== 'envoye');
  const sent = list.filter(item => item.status === 'envoye').slice(0, Math.max(0, 2000 - pending.length));
  jsonStore.write(QUEUE_FILE, [...pending, ...sent]);
}

/**
 * La table `mail_queue` n'a pas de colonne `reply_to` : l'adresse de réponse
 * est rangée dans le JSON des en-têtes sous une clé technique, puis extraite
 * au moment d'un nouvel essai. Un message rejoué garde ainsi exactement les
 * mêmes en-têtes que le message d'origine.
 */
const REPLY_TO_KEY = '__replyTo';

function packHeaders(message) {
  const headers = { ...(message.headers || {}) };
  if (message.replyTo) headers[REPLY_TO_KEY] = message.replyTo;
  return Object.keys(headers).length ? JSON.stringify(headers) : null;
}

function unpackHeaders(value) {
  const parsed = parseHeaders(value) || {};
  const replyTo = parsed[REPLY_TO_KEY] || null;
  delete parsed[REPLY_TO_KEY];
  return { headers: Object.keys(parsed).length ? parsed : undefined, replyTo };
}

function queueRecord(message, status, error = '') {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind: String(message.kind || 'generique').slice(0, 40),
    recipient: String(message.to || '').slice(0, 240),
    subject: String(message.subject || '').slice(0, 240),
    bodyHtml: String(message.html || ''),
    bodyText: String(message.text || ''),
    headers: packHeaders(message),
    status,
    attempts: status === 'envoye' ? 1 : 1,
    lastError: String(error || '').slice(0, 500),
    lastTryAt: now,
    sentAt: status === 'envoye' ? now : null,
    createdAt: now,
    updatedAt: now
  };
}

async function enqueue(record) {
  if (useDb()) {
    try {
      await sql(
        `INSERT INTO mail_queue (id, kind, recipient, subject, body_html, body_text, headers, status, attempts, last_error, last_try_at, sent_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [record.id, record.kind, record.recipient, record.subject, record.bodyHtml, record.bodyText,
          record.headers, record.status, record.attempts, record.lastError,
          toMysqlDate(record.lastTryAt), toMysqlDate(record.sentAt),
          toMysqlDate(record.createdAt), toMysqlDate(record.updatedAt)]
      );
      return record;
    } catch { /* repli fichier ci-dessous : on ne perd jamais un message */ }
  }
  const list = readQueueFile();
  list.unshift(record);
  writeQueueFile(list);
  return record;
}

async function markQueued(id, { status, error = '', attempts }) {
  const now = new Date().toISOString();
  if (useDb()) {
    try {
      await sql(
        'UPDATE mail_queue SET status = ?, attempts = ?, last_error = ?, last_try_at = ?, sent_at = ?, updated_at = ? WHERE id = ?',
        [status, attempts, String(error || '').slice(0, 500), toMysqlDate(now),
          status === 'envoye' ? toMysqlDate(now) : null, toMysqlDate(now), id]
      );
      return;
    } catch { /* repli fichier */ }
  }
  const list = readQueueFile();
  const index = list.findIndex(item => item.id === id);
  if (index >= 0) {
    list[index] = { ...list[index], status, attempts, lastError: String(error || '').slice(0, 500),
      lastTryAt: now, sentAt: status === 'envoye' ? now : list[index].sentAt, updatedAt: now };
    writeQueueFile(list);
  }
}

async function pendingMessages(limit = 50) {
  const max = Math.min(Math.max(Number(limit) || 50, 1), 500);
  if (useDb()) {
    try {
      const [rows] = await sql(
        `SELECT * FROM mail_queue WHERE status = 'en-attente' ORDER BY created_at ASC LIMIT ${max}`
      );
      return rows.map(row => ({
        id: row.id, kind: row.kind, recipient: row.recipient, subject: row.subject,
        bodyHtml: row.body_html || '', bodyText: row.body_text || '',
        headers: row.headers, attempts: Number(row.attempts || 0)
      }));
    } catch { /* repli fichier */ }
  }
  return readQueueFile().filter(item => item.status === 'en-attente')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, max);
}

async function queueStats() {
  const empty = { 'en-attente': 0, envoye: 0, echec: 0, total: 0 };
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT status, COUNT(*) AS total FROM mail_queue GROUP BY status');
      const result = { ...empty };
      rows.forEach(row => {
        if (result[row.status] !== undefined) result[row.status] = Number(row.total || 0);
        result.total += Number(row.total || 0);
      });
      return result;
    } catch { /* repli fichier */ }
  }
  return readQueueFile().reduce((acc, item) => {
    acc.total += 1;
    if (acc[item.status] !== undefined) acc[item.status] += 1;
    return acc;
  }, { ...empty });
}

async function listQueue(limit = 40) {
  const max = Math.min(Math.max(Number(limit) || 40, 1), 200);
  let rows = [];
  if (useDb()) {
    try {
      const [result] = await sql(`SELECT * FROM mail_queue ORDER BY created_at DESC LIMIT ${max}`);
      rows = result.map(row => ({
        id: row.id, kind: row.kind, recipient: row.recipient, subject: row.subject,
        status: row.status, attempts: Number(row.attempts || 0), lastError: row.last_error || '',
        createdAt: toIso(row.created_at), sentAt: toIso(row.sent_at)
      }));
      return rows;
    } catch { /* repli fichier */ }
  }
  return readQueueFile().slice(0, max).map(item => ({
    id: item.id, kind: item.kind, recipient: item.recipient, subject: item.subject,
    status: item.status, attempts: Number(item.attempts || 0), lastError: item.lastError || '',
    createdAt: item.createdAt, sentAt: item.sentAt || null
  }));
}

// ---------------------------------------------------------------------------
// ENVOI
// ---------------------------------------------------------------------------
function parseHeaders(value) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

async function rawSend({ to, subject, html, text, headers, replyTo }) {
  const config = readConfig();
  const transport = getTransport();
  await transport.sendMail({
    from: config.from,
    to,
    // `replyTo` du message (l'adresse du client pour une notification de
    // demande) prime sur la valeur par défaut : répondre au message doit
    // écrire au client, pas à soi-même.
    replyTo: replyTo || config.replyTo || undefined,
    subject,
    text,
    html,
    headers: parseHeaders(headers)
  });
}

/**
 * Envoie un message. Ne lève JAMAIS.
 * Retourne { sent, queued, error } :
 *   · sent:true              → accepté par le serveur SMTP
 *   · queued:true            → déposé en file d'attente (SMTP absent ou en panne)
 */
async function deliver(message) {
  const to = String(message?.to || '').trim();
  if (!to) return { sent: false, queued: false, error: 'Destinataire absent.' };

  if (!isConfigured()) {
    await enqueue(queueRecord(message, 'en-attente', 'SMTP non configuré'));
    return { sent: false, queued: true, error: 'SMTP non configuré : message mis en file d’attente.' };
  }

  try {
    await rawSend(message);
    lastError = null;
    await enqueue(queueRecord(message, 'envoye'));
    return { sent: true, queued: false, error: null };
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 400);
    lastError = detail;
    await enqueue(queueRecord(message, 'en-attente', detail));
    return { sent: false, queued: true, error: detail };
  }
}

/**
 * Version « au fil de l'eau » utilisée pour les campagnes : ne consigne dans
 * la file d'attente que les échecs, pour ne pas gonfler la table avec un
 * doublon de chaque message envoyé.
 */
async function deliverCampaignMessage(message) {
  if (!isConfigured()) {
    await enqueue(queueRecord(message, 'en-attente', 'SMTP non configuré'));
    return { sent: false, queued: true, error: 'SMTP non configuré' };
  }
  try {
    await rawSend(message);
    return { sent: true, queued: false, error: null };
  } catch (error) {
    const detail = String(error?.message || error).slice(0, 400);
    lastError = detail;
    await enqueue(queueRecord(message, 'en-attente', detail));
    return { sent: false, queued: true, error: detail };
  }
}

/** Relance les messages en attente. Retourne un compte rendu. */
async function flushQueue(limit = 50) {
  if (!isConfigured()) {
    return { attempted: 0, sent: 0, failed: 0, error: 'SMTP non configuré : aucun envoi tenté.' };
  }
  const messages = await pendingMessages(limit);
  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    const attempts = Number(message.attempts || 0) + 1;
    try {
      const { headers, replyTo } = unpackHeaders(message.headers);
      await rawSend({
        to: message.recipient, subject: message.subject,
        html: message.bodyHtml, text: message.bodyText, headers, replyTo
      });
      await markQueued(message.id, { status: 'envoye', attempts });
      sent += 1;
    } catch (error) {
      const detail = String(error?.message || error).slice(0, 400);
      lastError = detail;
      // Au-delà de MAX_ATTEMPTS, on cesse de réessayer indéfiniment : le
      // message passe en « echec » et reste consultable dans le studio.
      await markQueued(message.id, {
        status: attempts >= MAX_ATTEMPTS ? 'echec' : 'en-attente',
        attempts, error: detail
      });
      failed += 1;
    }
  }
  return { attempted: messages.length, sent, failed, error: null };
}

function status() {
  const config = readConfig();
  let driverAvailable = true;
  try { require.resolve('nodemailer'); } catch { driverAvailable = false; }
  return {
    configured: isConfigured(),
    driverAvailable,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    user: config.user || null,
    from: config.from,
    replyTo: config.replyTo,
    notifyTo: config.notifyTo,
    lastError
  };
}

module.exports = {
  DEFAULT_MAILBOX, MAX_ATTEMPTS,
  configure, readConfig, isConfigured, status, verify, resetTransport,
  deliver, deliverCampaignMessage, flushQueue, queueStats, listQueue
};
