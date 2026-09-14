#!/usr/bin/env node
/**
 * Obtention d'un jeton de Page Facebook QUI N'EXPIRE PAS.
 *
 *   node scripts/jeton-facebook.js              le jeton est demandé sans écho
 *   node scripts/jeton-facebook.js --verifier   contrôle seulement .env
 *
 * Préférez la première forme : un jeton passé en argument reste inscrit dans
 * l'historique du terminal, lisible longtemps après son expiration.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE SCRIPT EXISTE
 * ---------------------------------------------------------------------------
 * L'explorateur de l'API Graph délivre un jeton UTILISATEUR valable une heure.
 * Collé tel quel dans la configuration, il fait fonctionner la passerelle une
 * après-midi puis l'arrête — sans erreur explicite, juste des publications qui
 * cessent de remonter. C'est le piège classique de cette intégration.
 *
 * Le jeton utilisable en production s'obtient en deux conversions :
 *
 *   1. jeton utilisateur court  →  jeton utilisateur longue durée (60 jours)
 *   2. jeton utilisateur long   →  jeton de PAGE (n'expire jamais)
 *
 * L'ordre compte : un jeton de Page dérivé d'un jeton COURT expire avec lui.
 * C'est toute la raison de l'étape 1.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT NE FAIT PAS
 * ---------------------------------------------------------------------------
 * Il n'écrit rien, ne modifie aucun fichier et n'envoie rien ailleurs qu'à
 * l'API Graph. Il affiche le résultat, à vous de le recopier dans cPanel.
 *
 * Lancez-le depuis VOTRE terminal : le jeton affiché est un secret d'accès à
 * votre Page, il n'a pas à transiter par une conversation.
 */

const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');
require(path.join(__dirname, '..', 'db', 'env')).load();

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}`;
const APP_ID = process.env.META_APP_ID || '';
const APP_SECRET = process.env.META_APP_SECRET || '';

/** Appel Graph avec délai d'expiration : une API muette ne doit pas figer le script. */
async function graph(chemin, params = {}) {
  const url = new URL(`${GRAPH}/${chemin}`);
  for (const [cle, valeur] of Object.entries(params)) url.searchParams.set(cle, valeur);

  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), 15_000);
  let reponse;
  try {
    reponse = await fetch(url, { signal: stop.signal });
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'Graph API ne répond pas (15 s). Vérifiez votre connexion.'
      : `Appel Graph impossible : ${error.message}`);
  } finally {
    clearTimeout(minuteur);
  }

  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok || corps.error) {
    const detail = corps.error?.message || `HTTP ${reponse.status}`;
    throw new Error(detail);
  }
  return corps;
}

/** Masque un jeton dans les messages d'erreur : il ne doit jamais fuiter. */
function masque(valeur) {
  const texte = String(valeur || '');
  return texte.length > 12 ? `${texte.slice(0, 6)}…${texte.slice(-4)}` : '(vide)';
}

function exigence(condition, message) {
  if (!condition) {
    console.error(`\n✗ ${message}\n`);
    process.exit(1);
  }
}

/**
 * Saisie sans écho.
 *
 * Passer un jeton en argument de ligne de commande le grave dans l'historique
 * du terminal, où il reste lisible longtemps après son usage. La saisie
 * masquée évite cela : rien n'est affiché, rien n'est mémorisé.
 */
function demanderJetonMasque() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write('Collez le jeton court (rien ne s’affichera), puis Entrée : ');
    rl._writeToOutput = () => {};                    // supprime l'écho des caractères
    rl.question('', reponse => {
      rl.close();
      process.stdout.write('\n');
      resolve(String(reponse || '').trim());
    });
  });
}

/** Contrôle que la paire APP_ID / APP_SECRET est acceptée par Meta. */
async function verifierIdentifiants() {
  exigence(APP_ID && APP_SECRET, 'META_APP_ID et META_APP_SECRET sont absents de .env.');
  await graph('oauth/access_token', {
    client_id: APP_ID, client_secret: APP_SECRET, grant_type: 'client_credentials'
  });
  console.log(`\n✓ Meta accepte l'application ${APP_ID} et sa clé secrète.\n`);
}

/**
 * Lit le presse-papiers du système.
 *
 * Pourquoi : coller un jeton de 200 caractères dans un terminal est une source
 * d'erreur — collé avant la validation de la commande, il se soude au nom du
 * fichier et Node cherche un module inexistant. Le jeton vient d'être copié
 * depuis l'explorateur : autant le lire directement.
 *
 * Rien n'est écrit ni transmis : la valeur ne sert qu'à l'échange auprès de Meta.
 */
function lirePressePapiers() {
  const outils = process.platform === 'win32'
    ? [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]]
    : process.platform === 'darwin'
      ? [['pbpaste', []]]
      : [['wl-paste', []], ['xclip', ['-selection', 'clipboard', '-o']], ['xsel', ['--clipboard', '--output']]];

  for (const [commande, arguments_] of outils) {
    try {
      const sortie = execFileSync(commande, arguments_, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
      // Get-Clipboard peut rendre le jeton sur plusieurs lignes : on recolle
      // les morceaux. Seuls les blancs sont retirés, jamais un caractère du jeton.
      const valeur = String(sortie || '').replace(/\s+/g, '').trim();
      if (valeur) return valeur;
    } catch { /* outil absent : on essaie le suivant */ }
  }
  return '';
}

async function main() {
  if (process.argv.includes('--verifier')) return verifierIdentifiants();
  if (process.argv.includes('--presse-papiers')) {
    const copie = lirePressePapiers();
    exigence(copie, [
      'Le presse-papiers est vide ou illisible.',
      '',
      'Copiez d\'abord le jeton depuis l\'explorateur de l\'API Graph',
      '(l\'icône de copie à droite du champ « Token d\'accès »), puis relancez.'
    ].join('\n'));
    exigence(/^EA[A-Za-z0-9]/.test(copie), [
      'Le presse-papiers ne contient pas un jeton Facebook.',
      `Il commence par « ${copie.slice(0, 12)}… » alors qu'un jeton commence par « EAA ».`,
      '',
      'Recopiez le champ « Token d\'accès » de l\'explorateur, puis relancez.'
    ].join('\n'));
    console.log(`\nJeton lu depuis le presse-papiers (${copie.length} caractères).`);
    return traiter(copie);
  }

  // Un argument commençant par « -- » est une option, jamais un jeton : sans
  // ce filtre, une faute de frappe comme « --aide » partirait chez Meta.
  const premier = (process.argv[2] || '').trim();
  let court = premier.startsWith('--') ? '' : premier;
  if (!court && process.stdin.isTTY) court = await demanderJetonMasque();

  exigence(court, [
    'Usage : node scripts/jeton-facebook.js',
    '        (le jeton vous sera demandé sans être affiché ni mémorisé)',
    '',
    'Autres options :',
    '  --presse-papiers   lit le jeton déjà copié (le plus simple sous Windows)',
    '  --verifier         contrôle META_APP_ID / META_APP_SECRET sans jeton',
    '',
    'Le jeton court se récupère dans l\'explorateur de l\'API Graph :',
    '  https://developers.facebook.com/tools/explorer/?app_id=' + (APP_ID || '<votre-app-id>'),
    'Cliquez « Generate Access Token », autorisez l\'app, cochez votre Page,',
    'puis copiez la valeur du champ « Token d\'accès ».'
  ].join('\n'));

  return traiter(court);
}

/** Conversion court → longue durée → jeton de Page, puis contrôles. */
async function traiter(court) {
  exigence(APP_ID && APP_SECRET, [
    'META_APP_ID et META_APP_SECRET sont introuvables.',
    '',
    'Renseignez-les dans le fichier .env à la racine du projet :',
    '  META_APP_ID=1394121669475304',
    '  META_APP_SECRET=<Paramètres → Général → Clé secrète, bouton « Afficher »>',
    '',
    'Ce fichier ne doit jamais être publié ni versionné.'
  ].join('\n'));

  console.log('\n── Étape 1 : jeton utilisateur court → longue durée ──');
  const long = await graph('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: court
  });
  exigence(long.access_token, 'Meta n\'a pas renvoyé de jeton longue durée.');
  const jours = long.expires_in ? Math.round(long.expires_in / 86400) : null;
  console.log(`  ✓ obtenu (${masque(long.access_token)})${jours ? `, valable ~${jours} jours` : ''}`);

  console.log('\n── Étape 2 : Pages accessibles avec ce jeton ──');
  const comptes = await graph('me/accounts', {
    fields: 'id,name,access_token',
    access_token: long.access_token
  });
  const pages = comptes.data || [];
  exigence(pages.length, [
    'Aucune Page n\'est accessible avec ce jeton.',
    '',
    'Causes habituelles :',
    '  · la Page n\'a pas été cochée dans la fenêtre d\'autorisation ;',
    '  · vous n\'êtes pas administrateur de la Page ;',
    '  · l\'autorisation pages_show_list n\'a pas été accordée.',
    '',
    'Régénérez un jeton court en cochant bien la Page, puis relancez.'
  ].join('\n'));

  console.log('\n── Étape 3 : contrôle de chaque jeton de Page ──');
  const resultats = [];
  for (const page of pages) {
    let expire = 'inconnu';
    let portees = [];
    let type = 'inconnu';
    try {
      const info = await graph('debug_token', {
        input_token: page.access_token,
        access_token: `${APP_ID}|${APP_SECRET}`
      });
      const d = info.data || {};
      type = d.type || 'inconnu';
      portees = d.scopes || [];
      expire = d.expires_at === 0 ? 'jamais'
        : d.expires_at ? new Date(d.expires_at * 1000).toLocaleString('fr-FR')
          : 'non communiqué';
    } catch (error) {
      expire = `contrôle impossible (${error.message})`;
    }
    resultats.push({ page, type, expire, portees });
    console.log(`  · ${page.name} — type ${type}, expire : ${expire}`);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log(' À RECOPIER DANS cPanel → Setup Node.js App → Variables');
  console.log('════════════════════════════════════════════════════════');

  const requises = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata'];
  for (const { page, type, expire, portees } of resultats) {
    console.log(`\nPage « ${page.name} »`);
    console.log(`  META_PAGE_ID           = ${page.id}`);
    console.log(`  META_PAGE_ACCESS_TOKEN = ${page.access_token}`);

    if (type !== 'PAGE') console.log(`  ⚠ type « ${type} » au lieu de PAGE.`);
    if (expire !== 'jamais') {
      console.log(`  ⚠ ce jeton EXPIRE (${expire}).`);
      console.log('    La passerelle s\'arrêterait à cette date, en silence.');
      console.log('    Refaites l\'étape 1 : le jeton court a probablement été réutilisé.');
    }
    const manquantes = requises.filter(p => !portees.includes(p));
    if (portees.length && manquantes.length) {
      console.log(`  ⚠ autorisations manquantes : ${manquantes.join(', ')}`);
    }
    if (type === 'PAGE' && expire === 'jamais' && !manquantes.length) {
      console.log('  ✓ jeton permanent et complet : utilisable en production.');
    }
  }

  console.log('\nAutres variables à renseigner :');
  console.log('  META_APP_SECRET        = (celui de votre .env)');
  console.log('  META_VERIFY_TOKEN      = (la chaîne de votre choix, identique côté Meta)');
  console.log('  PUBLIC_SITE_URL        = https://henri-philippe.com');
  console.log('\nRappel : ces valeurs sont des secrets. Ne les collez pas dans une');
  console.log('conversation, un ticket ou un dépôt de code.\n');
}

main().catch(error => {
  console.error(`\n✗ Échec : ${error.message}\n`);
  process.exitCode = 1;
});
