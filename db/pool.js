/**
 * Pool de connexions MySQL (mysql2/promise).
 *
 * PRINCIPE ANTI-RÉGRESSION : si DB_HOST n'est pas défini dans l'environnement,
 * la couche MySQL reste totalement inerte et le site continue de fonctionner
 * sur le stockage JSON de `data/`. Aucun `require('mysql2')` n'est même tenté.
 *
 * Sur un hébergement mutualisé cPanel, le nombre de connexions simultanées
 * autorisées par utilisateur MySQL est très bas (souvent 10 à 25, partagées
 * avec phpMyAdmin et les tâches cron). `connectionLimit: 5` laisse de la marge.
 */

let pool = null;
let driverError = null;

const CONFIG = {
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || ''
};

/** La couche MySQL est-elle activée ? (DB_HOST + DB_NAME + DB_USER requis) */
function isEnabled() {
  return Boolean(CONFIG.host && CONFIG.database && CONFIG.user);
}

/** Retourne le pool mysql2/promise, ou null si MySQL n'est pas configuré. */
function getPool() {
  if (!isEnabled()) return null;
  if (pool) return pool;
  if (driverError) throw driverError;
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (error) {
    driverError = new Error(
      'Le module mysql2 est absent. Lancez « Run NPM Install » dans cPanel ' +
      '(ou `npm install` en local), ou retirez DB_HOST pour rester en mode fichiers JSON.'
    );
    throw driverError;
  }
  pool = mysql.createPool({
    host: CONFIG.host,
    port: CONFIG.port,
    database: CONFIG.database,
    user: CONFIG.user,
    password: CONFIG.password,
    charset: 'utf8mb4_unicode_ci',
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 0,
    timezone: 'Z',              // tout est stocké et relu en UTC
    dateStrings: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 10_000,
    namedPlaceholders: false,
    supportBigNumbers: true,
    bigNumberStrings: false
  });
  return pool;
}

/** Vérifie que la base répond. Retourne { ok, error }. Ne lève jamais. */
async function ping() {
  if (!isEnabled()) return { ok: false, error: 'MySQL non configuré (DB_HOST absent).' };
  try {
    const connection = await getPool().getConnection();
    try { await connection.query('SELECT 1'); } finally { connection.release(); }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/** Ferme le pool (tests, scripts). */
async function close() {
  if (pool) { const current = pool; pool = null; await current.end(); }
}

function describe() {
  return {
    enabled: isEnabled(),
    host: CONFIG.host || null,
    port: CONFIG.port,
    database: CONFIG.database || null,
    user: CONFIG.user || null
  };
}

module.exports = { isEnabled, getPool, ping, close, describe };
