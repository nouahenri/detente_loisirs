/**
 * Petit utilitaire de persistance JSON atomique, partagé par les modules
 * `db/auth-store.js`, `db/newsletter-store.js` et `db/mailer.js`.
 *
 * Pourquoi un fichier séparé : ces trois modules doivent fonctionner À
 * L'IDENTIQUE avec ou sans MySQL. Sans base (poste local, ou serveur dont
 * la base est momentanément injoignable), le stockage retombe sur des
 * fichiers de `data/`, écrits de façon atomique (écriture dans un fichier
 * temporaire puis renommage) pour ne jamais laisser un JSON tronqué.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* déjà présent */ }
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, value) {
  ensureDir();
  const target = filePath(name);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, target);
}

module.exports = { DATA_DIR, filePath, read, write };
