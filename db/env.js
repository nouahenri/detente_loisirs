/**
 * Chargeur `.env` minimal, sans dépendance (pas de `dotenv` à installer).
 *
 * Pourquoi : sur cPanel, « Setup Node.js App » injecte les variables
 * d'environnement dans le processus Passenger — le serveur n'a donc besoin de
 * rien. Mais les scripts lancés à la main (SSH, cron), comme
 * `scripts/creer-utilisateur.js`, ne bénéficient pas de cette injection : sans
 * ce chargeur, ils ne trouveraient ni la base MySQL ni le SMTP.
 *
 * RÈGLE : une variable déjà définie dans l'environnement n'est JAMAIS écrasée.
 * L'environnement réel prime toujours sur le fichier.
 */

const fs = require('fs');
const path = require('path');

function load(file = path.join(__dirname, '..', '.env')) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return { loaded: false, count: 0 }; }
  let count = 0;
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
    if (process.env[key] !== undefined) return;      // l'environnement réel gagne
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    count += 1;
  });
  return { loaded: true, count };
}

module.exports = { load };
