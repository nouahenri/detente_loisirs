#!/usr/bin/env node
/**
 * CRÉATION DU PREMIER COMPTE DU STUDIO (et des suivants).
 *
 *   node scripts/creer-utilisateur.js --username henri --role proprietaire
 *   node scripts/creer-utilisateur.js --username awa --role commercial --email awa@henri-philippe.com
 *   node scripts/creer-utilisateur.js --username henri --reinitialiser
 *   node scripts/creer-utilisateur.js --liste
 *
 * LE MOT DE PASSE N'EST JAMAIS ACCEPTÉ EN ARGUMENT.
 * Il est demandé en saisie masquée, puis confirmé. Raison : tout ce qui passe
 * en argument de commande atterrit dans l'historique du shell (~/.bash_history)
 * et reste visible dans la liste des processus (`ps aux`) pendant l'exécution.
 * Un mot de passe passé ainsi doit être considéré comme compromis.
 *
 * Le script écrit là où le serveur lira :
 *   · MySQL si DB_HOST / DB_NAME / DB_USER sont renseignés (.env ou variables
 *     d'environnement cPanel) et que la base répond ;
 *   · sinon `data/users.json` (mode local, sans base).
 */

require('../db/env').load();

const auth = require('../db/auth-store');
const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Analyse des arguments
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) { options._.push(arg); continue; }
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.trim();
    if (inlineValue !== undefined) { options[key] = inlineValue; continue; }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) { options[key] = next; index += 1; }
    else options[key] = true;
  }
  return options;
}

function usage() {
  console.log(`
Création et gestion des comptes du studio Henri & Philippe

  node scripts/creer-utilisateur.js --username <nom> --role <role> [--email <adresse>]
  node scripts/creer-utilisateur.js --username <nom> --reinitialiser
  node scripts/creer-utilisateur.js --liste

Rôles disponibles :
  proprietaire   ${auth.ROLE_DESCRIPTIONS.proprietaire}
  editeur        ${auth.ROLE_DESCRIPTIONS.editeur}
  commercial     ${auth.ROLE_DESCRIPTIONS.commercial}

Le mot de passe est demandé de façon interactive (saisie masquée).
Il n'est jamais accepté en argument de commande.
`);
}

// ---------------------------------------------------------------------------
// Saisie masquée
// ---------------------------------------------------------------------------
// Lecture de l'entrée standard SANS `readline`.
//
// Pourquoi ne pas utiliser readline : son mode « terminal » réaffiche la ligne
// complète à chaque frappe, ce qui oblige à détourner une méthode privée
// (`_writeToOutput`) pour masquer le mot de passe — un montage fragile, qui se
// comporte différemment selon que l'entrée est un vrai terminal ou une
// redirection, et qui perd le tampon d'avance dès qu'on ouvre une deuxième
// interface. Ici, on lit les octets nous-mêmes :
//   · vrai terminal → mode brut, AUCUN écho (pas même des astérisques : leur
//     nombre indiquerait la longueur du mot de passe à qui regarde l'écran) ;
//   · redirection / tube → lecture ligne par ligne, sans écho non plus.
const input = process.stdin;
let buffer = '';
let inputEnded = false;
let waiter = null;

function ensureInput() {
  if (input.listenerCount('data')) return;
  input.setEncoding('utf8');
  input.on('data', chunk => { buffer += chunk; pump(); });
  input.on('end', () => { inputEnded = true; pump(); });
  input.on('error', () => { inputEnded = true; pump(); });
}

function settle(value) {
  const pending = waiter;
  waiter = null;
  if (pending.raw && input.isTTY) { try { input.setRawMode(false); } catch { /* ignoré */ } }
  if (pending.hidden) process.stdout.write('\n');
  pending.resolve(value);
}

function pump() {
  if (!waiter) return;

  // Mode brut : on interprète les touches spéciales nous-mêmes.
  if (waiter.raw) {
    while (buffer.length) {
      const char = buffer[0];
      buffer = buffer.slice(1);
      if (char === '\u0003') {                        // Ctrl+C : on rend la main
        try { input.setRawMode(false); } catch { /* ignoré */ }
        process.stdout.write('\n');
        process.exit(130);
      }
      if (char === '\r' || char === '\n' || char === '\u0004') return settle(waiter.value);
      if (char === '\u007f' || char === '\b') { waiter.value = waiter.value.slice(0, -1); continue; }
      if (char < ' ') continue;                    // autres touches de contrôle : ignorées
      waiter.value += char;
    }
    if (inputEnded) settle(waiter.value);
    return;
  }

  const index = buffer.search(/\r\n|\n|\r/);
  if (index >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + (buffer.slice(index, index + 2) === '\r\n' ? 2 : 1));
    return settle(line);
  }
  // Entrée terminée sans saut de ligne final : on rend ce qui reste.
  if (inputEnded) { const rest = buffer; buffer = ''; return settle(rest); }
}

function question(prompt, hidden) {
  return new Promise(resolve => {
    ensureInput();
    process.stdout.write(prompt);
    const raw = Boolean(hidden) && Boolean(input.isTTY);
    if (raw) { try { input.setRawMode(true); } catch { /* terminal restreint */ } }
    input.resume();
    waiter = { resolve, hidden: Boolean(hidden), raw, value: '' };
    pump();                                        // de quoi consommer un tampon déjà rempli
  });
}

function closeTerminal() {
  if (input.isTTY) { try { input.setRawMode(false); } catch { /* ignoré */ } }
  input.pause();
}

function askHidden(prompt) { return question(prompt, true); }

async function ask(prompt) { return String(await question(prompt, false)).trim(); }

async function askPasswordTwice() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const first = await askHidden('Mot de passe (la saisie reste invisible) : ');
    const problem = auth.passwordProblem(first);
    if (problem) { console.error(`  ✗ ${problem}`); continue; }
    const second = await askHidden('Confirmez le mot de passe : ');
    if (first !== second) { console.error('  ✗ Les deux saisies diffèrent.'); continue; }
    return first;
  }
  throw new Error('Trop de tentatives infructueuses.');
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || options.aide || options.h) { usage(); return; }

  // Refus explicite de toute tentative de passer le mot de passe en argument.
  const forbidden = ['password', 'motdepasse', 'mot-de-passe', 'pass', 'pwd', 'p'];
  const offending = forbidden.find(key => options[key] !== undefined);
  if (offending) {
    console.error(`\n✗ L'option --${offending} n'existe pas et n'existera pas.`);
    console.error('  Un mot de passe passé en argument reste dans l’historique du shell');
    console.error('  et dans la liste des processus. Il vous sera demandé de façon interactive.\n');
    process.exitCode = 2;
    return;
  }

  // Détection du mode de stockage réellement utilisé.
  let dbReady = false;
  if (pool.isEnabled()) {
    const health = await pool.ping();
    dbReady = health.ok;
    if (!health.ok) {
      console.error(`\n✗ MySQL est configuré mais injoignable : ${health.error}`);
      console.error('  Corrigez DB_HOST / DB_NAME / DB_USER / DB_PASSWORD avant de créer un compte,');
      console.error('  sinon le compte serait écrit dans data/users.json et ignoré par le site en production.\n');
      process.exitCode = 1;
      return;
    }
  }
  auth.configure({ isDbReady: () => dbReady });
  const target = dbReady ? `MySQL ${pool.describe().database}` : 'fichier data/users.json (mode sans base)';
  console.log(`\nStockage des comptes : ${target}`);

  // --- Liste ---------------------------------------------------------------
  if (options.liste || options.list) {
    const users = await auth.listUsers();
    if (!users.length) { console.log('\nAucun compte enregistré.\n'); return; }
    console.log(`\n${users.length} compte(s) :\n`);
    users.forEach(user => {
      const view = auth.publicUser(user);
      console.log(`  ${view.username.padEnd(20)} ${view.roleLabel.padEnd(14)} ${view.active ? 'actif' : 'DÉSACTIVÉ'}` +
        `${view.locked ? '  VERROUILLÉ' : ''}` +
        `${view.lastLoginAt ? `  dernière connexion : ${new Date(view.lastLoginAt).toLocaleString('fr-FR')}` : '  jamais connecté'}`);
    });
    console.log('');
    return;
  }

  const username = auth.normalizeUsername(options.username || options.utilisateur || '');
  if (!username) {
    usage();
    console.error('✗ L’option --username est requise.\n');
    process.exitCode = 2;
    return;
  }

  const existing = await auth.getUserByUsername(username);

  // --- Réinitialisation d'un mot de passe existant -------------------------
  if (options.reinitialiser || options.reset) {
    if (!existing) {
      console.error(`\n✗ Aucun compte « ${username} ».\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nRéinitialisation du mot de passe de « ${username} » (${existing.role}).`);
    console.log('Toutes les sessions ouvertes de ce compte seront fermées.\n');
    const password = await askPasswordTwice();
    await auth.setPassword(existing.id, password);
    console.log(`\n✓ Mot de passe de « ${username} » réinitialisé.\n`);
    return;
  }

  if (existing) {
    console.error(`\n✗ Le compte « ${username} » existe déjà.`);
    console.error('  Pour changer son mot de passe : --reinitialiser\n');
    process.exitCode = 1;
    return;
  }

  // --- Création ------------------------------------------------------------
  let role = String(options.role || '').trim();
  if (!role) {
    const total = await auth.countUsers();
    // Le tout premier compte doit être un propriétaire : sans lui, personne ne
    // pourrait créer les comptes suivants.
    const suggestion = total === 0 ? 'proprietaire' : 'editeur';
    role = (await ask(`Rôle [${auth.ROLES.join(' / ')}] (${suggestion}) : `)) || suggestion;
  }
  if (!auth.ROLES.includes(role)) {
    console.error(`\n✗ Rôle inconnu « ${role} ». Attendus : ${auth.ROLES.join(', ')}.\n`);
    process.exitCode = 2;
    return;
  }

  let email = String(options.email || '').trim();
  if (!email) email = await ask('Adresse e-mail (facultative) : ');

  console.log(`\nCompte à créer : ${username} — ${auth.ROLE_LABELS[role]}`);
  console.log(`  ${auth.ROLE_DESCRIPTIONS[role]}\n`);

  const password = await askPasswordTwice();
  const created = await auth.createUser({ username, email, password, role, active: true });

  console.log(`\n✓ Compte « ${created.username} » créé avec le rôle ${created.roleLabel}.`);
  console.log('  Connectez-vous sur /admin.html avec ce nom d’utilisateur et ce mot de passe.');
  if (process.env.ADMIN_SECRET) {
    console.log('\n  Rappel : dès qu’un compte existe, la connexion de secours par clé');
    console.log('  ADMIN_SECRET est automatiquement désactivée. Vous pouvez retirer');
    console.log('  cette variable de la configuration cPanel.');
  }
  console.log('');
}

main()
  .catch(error => {
    console.error(`\n✗ ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    closeTerminal();
    pool.close().catch(() => {});
  });
