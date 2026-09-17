const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Charge un éventuel fichier `.env` AVANT toute lecture de process.env.
// Aucune variable déjà définie par l'environnement (Passenger / cPanel) n'est
// écrasée : l'environnement réel prime toujours. Voir db/env.js.
require('./db/env').load();

// Modules maison, tous sans dépendance obligatoire (nodemailer et mysql2 sont
// chargés paresseusement et leur absence ne fait jamais tomber le serveur).
const auth = require('./db/auth-store');
const newsletter = require('./db/newsletter-store');
const mailer = require('./db/mailer');
const templates = require('./db/mail-templates');
const REF = require('./db/referentiels');
const FICHES = require('./db/fiches');
const WA = require('./db/whatsapp-promo');
const NOTIF = require('./db/notifications-app');
const SYNC = require('./db/synchro-facebook');
const DEMANDEURS = require('./db/demandeurs');
const AVIS = require('./db/avis');
const COMPTA = require('./db/comptabilite');

const PORT = Number(process.env.PORT || 3456);
const ROOT = __dirname;
const STORE_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(STORE_DIR, 'site-content.json');
const LEADS_FILE = path.join(STORE_DIR, 'leads.json');
const FB_EVENTS_FILE = path.join(STORE_DIR, 'facebook-events.json');
const FB_STATE_FILE = path.join(STORE_DIR, 'facebook-sync-state.json');
const FB_POSTS_FILE = path.join(STORE_DIR, 'facebook-posts.json');
const FB_PUBLISH_FILE = path.join(STORE_DIR, 'facebook-publish-log.json');
// Annonces ⇄ publications : texte et photos au dernier accord entre le site et
// la Page, par identifiant Facebook (db/synchro-facebook.js).
const FB_SYNCHRO_FILE = path.join(STORE_DIR, 'facebook-synchro.json');
// Publications volontairement retirées du site depuis le studio. Un simple
// fichier suffit : aucune colonne à ajouter en base, donc aucune migration
// à faire passer en production.
const FB_MASQUEES_FILE = path.join(STORE_DIR, 'facebook-masquees.json');
const FB_FICHES_FILE = path.join(STORE_DIR, 'facebook-fiches.json');
// Miroir JSON des référentiels (mode fichiers et lectures de secours).
const REFERENTIELS_FILE = path.join(STORE_DIR, 'referentiels.json');
const AUDIT_FILE = path.join(STORE_DIR, 'audit-log.json');
// Menu « Messages » du studio : campagnes WhatsApp et liste « ne plus
// contacter » ({ campagnes, stops }). Voir db/whatsapp-promo.js.
const WA_FILE = path.join(STORE_DIR, 'whatsapp-promo.json');
// Application mobile (mobile/natif) : téléphones inscrits aux notifications,
// et mémoire des envois ({ amorce, cles, demandes }). Fichiers : aucune
// migration de base. Voir db/notifications-app.js.
const APP_APPAREILS_FILE = path.join(STORE_DIR, 'app-appareils.json');
const APP_NOTIF_FILE = path.join(STORE_DIR, 'app-notifications.json');
const BACKUP_DIR = path.join(STORE_DIR, 'backups');
// Pièces justificatives de la comptabilité : dans data/, jamais servi
// publiquement (FORBIDDEN_PREFIXES) ; lues seulement par le studio.
const JUSTIFICATIFS_DIR = path.join(STORE_DIR, 'compta-justificatifs');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'assinie-demo';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const PAGE_ID = process.env.META_PAGE_ID || '';
const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
const APP_SECRET = process.env.META_APP_SECRET || '';
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
const META_SYNC_INTERVAL_MS = Math.max(60_000, Number(process.env.META_SYNC_INTERVAL_MS || 900_000));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

// ---------------------------------------------------------------------------
// Sécurité du serveur de fichiers statiques.
// Deux barrières cumulatives : seules ces extensions sont servables (liste
// blanche) ET aucun chemin commençant par un préfixe interdit n'est servi
// (liste noire). Tout ce qui est refusé renvoie 404, jamais 403 : un 403
// confirmerait l'existence du fichier.
// ---------------------------------------------------------------------------
const SERVABLE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.map',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico',
  '.woff', '.woff2', '.ttf',
  '.txt', '.xml', '.pdf', '.mp4', '.webm', '.webmanifest'
]);

// `mobile/` : application native Android / iOS (mobile/natif), jamais servie.
// `tests/` : bancs d'essai, sans intérêt pour un visiteur.
const FORBIDDEN_PREFIXES = [
  'data/', 'db/', 'scripts/', 'node_modules/', 'docs/', 'logs/', 'tmp/', 'mobile/', 'tests/'
];

const FORBIDDEN_FILES = new Set([
  'server.js', 'app.js', 'package.json', 'package-lock.json',
  '.env', '.env.example', '.htaccess', 'desktop.ini'
]);

// Le manifeste d'images du designer doit rester lisible : il est explicitement
// ré-autorisé malgré le préfixe `data/`.
const ALLOWED_DATA_FILES = new Set(['data/image-manifest.json']);

function isServablePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return false;
  if (ALLOWED_DATA_FILES.has(normalized.toLowerCase())) return true;
  // Aucun segment caché (.env, .git, .htaccess, .well-known exclu volontairement).
  if (normalized.split('/').some(segment => segment.startsWith('.'))) return false;
  const lower = normalized.toLowerCase();
  if (FORBIDDEN_PREFIXES.some(prefix => lower === prefix.slice(0, -1) || lower.startsWith(prefix))) return false;
  if (FORBIDDEN_FILES.has(lower)) return false;
  return SERVABLE_EXTENSIONS.has(path.extname(lower));
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.fbcdn.net https://scontent.xx.fbcdn.net",
  "connect-src 'self'",
  // Lecteur vidéo Facebook intégré (vidéos et Reels de la Page).
  "frame-src https://www.facebook.com https://web.facebook.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'"
].join('; ');

function securityHeaders(isHtml) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  if (isHtml) {
    headers['X-Frame-Options'] = 'SAMEORIGIN';
    headers['Content-Security-Policy'] = CSP;
    headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(), payment=()';
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Limitation de débit en mémoire (anti-spam du formulaire public).
// Volontairement simple : pas de dépendance, fenêtre glissante par IP.
// Limite du procédé : en cas de démarrage multi-instance (Passenger), chaque
// instance possède son propre compteur. Voir docs/AUDIT-WEBSERVICE-FACEBOOK.md.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 600_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const rateBuckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'inconnue';
}

function rateLimit(req, bucketName, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) {
  const key = `${bucketName}:${clientIp(req)}`;
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter(stamp => now - stamp < windowMs);
  if (hits.length >= max) {
    rateBuckets.set(key, hits);
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 5000) {
    for (const [name, stamps] of rateBuckets) {
      if (!stamps.length || now - stamps[stamps.length - 1] > windowMs) rateBuckets.delete(name);
    }
  }
  return { allowed: true, remaining: max - hits.length };
}

fs.mkdirSync(STORE_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// COUCHE DE STOCKAGE — MySQL optionnel, fichiers JSON par défaut.
//
// Exigence anti-régression : sans DB_HOST, rien ne change, le site tourne
// exactement comme avant sur `data/*.json`, sans aucune dépendance npm.
//
// Avec DB_HOST renseigné :
//   · LECTURE  : MySQL en priorité, repli automatique sur le JSON si la base
//                est injoignable (le site reste debout, il ne tombe jamais).
//   · ÉCRITURE : double écriture JSON + MySQL. Le JSON reste la source des
//                sauvegardes/exports et le filet de sécurité ; MySQL devient
//                le stockage durable et partagé entre instances Passenger.
// ---------------------------------------------------------------------------
let repository = null;
let databaseReady = false;
let databaseError = null;

function loadRepository() {
  if (repository !== null) return repository;
  try {
    const candidate = require('./db/repository');
    repository = candidate.isEnabled() ? candidate : false;
  } catch (error) {
    repository = false;
    databaseError = error.message;
    console.warn(`Couche MySQL indisponible (${error.message}). Mode fichiers JSON.`);
  }
  return repository;
}

function dbEnabled() { return Boolean(loadRepository()) && databaseReady; }

// Les modules comptes / newsletter / e-mail choisissent leur stockage avec la
// même sonde que le reste du serveur : MySQL quand la base répond, fichiers
// de `data/` sinon. Ils n'ont ainsi jamais leur propre idée de l'état de la base.
auth.configure({ isDbReady: dbEnabled });
newsletter.configure({ isDbReady: dbEnabled });
DEMANDEURS.configure({ isDbReady: dbEnabled });
AVIS.configure({ isDbReady: dbEnabled });
COMPTA.configure({ isDbReady: dbEnabled });
mailer.configure({ isDbReady: dbEnabled });

/** Exécute une opération MySQL sans jamais faire tomber la requête HTTP. */
async function tryDb(label, handler, fallback = null) {
  if (!dbEnabled()) return fallback;
  try { return await handler(repository); }
  catch (error) {
    databaseError = `${label} : ${error.message}`;
    console.error(`MySQL — ${databaseError}`);
    return fallback;
  }
}

/** Message d'erreur base pour les référentiels : nomme la migration si elle manque. */
function erreurReferentielBase(error) {
  const migrationManquante = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code) || [1146, 1054].includes(error?.errno);
  return migrationManquante
    ? 'Les tables de référentiels n’existent pas encore en base : appliquez db/migration-referentiels.sql.'
    : 'Base de données injoignable : rien n’a été enregistré. Réessayez.';
}

/** Toutes les fiches susceptibles d'utiliser une entrée de référentiel. */
async function biensPourUsages(referentiels) {
  const contenu = await lireContenuBrut();
  const fiches = await store.lireFichesPublications(referentiels);
  return {
    villas: Array.isArray(contenu.villas) ? contenu.villas : [],
    terrains: Array.isArray(contenu.terrains) ? contenu.terrains : [],
    activities: Array.isArray(contenu.activities) ? contenu.activities : [],
    fiches: [...fiches.values()]
  };
}

/** Contenu tel qu’il est stocké, base d’abord puis miroir JSON. */
async function lireContenuBrut() {
  const fromDb = await tryDb('lecture du contenu', repo => repo.readContent());
  if (fromDb && (fromDb.villas.length || fromDb.terrains.length || fromDb.activities.length)) {
    if (!Array.isArray(fromDb.terrains)) fromDb.terrains = [];
    return fromDb;
  }
  const content = readJSON(CONTENT_FILE, {});
  if (!Array.isArray(content.terrains)) content.terrains = [];
  return content;
}

const store = {
  async readContent() {
    const contenu = await lireContenuBrut();
    // Point de passage unique du site public : on y retire les publications
    // que le studio a décochées, quelle que soit la source (base ou fichier).
    const masquees = publicationsMasquees();
    if (masquees.size && Array.isArray(contenu.facebookPosts)) {
      contenu.facebookPosts = contenu.facebookPosts.filter(post => !masquees.has(String(post?.id)));
    }
    // Publication envoyée PAR le site depuis une fiche : la fiche est déjà
    // affichée, la publication revenue de Facebook ferait doublon.
    const origines = originesPublications();
    if (origines.size && Array.isArray(contenu.facebookPosts)) {
      contenu.facebookPosts = contenu.facebookPosts.filter(post => !origines.has(String(post?.id)));
    }
    // Fiche du bien : lue en base avec les publications quand les colonnes
    // existent. Sinon — mode fichiers, migration pas encore passée, lecture
    // de secours — elle vient du miroir JSON. Chaque publication en porte une,
    // vide au besoin, pour que le site n'ait jamais à tester sa présence.
    const referentiels = await this.lireReferentiels();
    if (Array.isArray(contenu.facebookPosts) && contenu.facebookPosts.some(post => post && !post.fiche)) {
      const fiches = fichesPublicationsFichier(referentiels);
      contenu.facebookPosts = contenu.facebookPosts.map(post => (post && !post.fiche
        ? { ...post, fiche: fiches.get(String(post.id)) || normaliserFichePublication({}, referentiels).fiche }
        : post));
    }
    // Textes affichés recalculés d'après les référentiels : renommer une
    // ville ou un badge dans le studio les renomme sur toutes les fiches.
    const resoudre = liste => (Array.isArray(liste) ? liste.map(bien => REF.resoudreBien(bien, referentiels)) : liste);
    contenu.villas = resoudre(contenu.villas);
    contenu.terrains = resoudre(contenu.terrains);
    contenu.activities = resoudre(contenu.activities);
    if (Array.isArray(contenu.facebookPosts)) {
      contenu.facebookPosts = contenu.facebookPosts.map(post => (post && post.fiche
        ? { ...post, fiche: REF.resoudreBien(post.fiche, referentiels) }
        : post));
    }
    contenu.referentiels = referentiels;
    return contenu;
  },
  /** Fiches de toutes les publications : base d'abord, miroir JSON sinon. */
  async lireFichesPublications(referentiels) {
    const depuisBase = await tryDb('lecture des fiches de publication', repo => repo.listFacebookPostFiches());
    return depuisBase instanceof Map ? depuisBase : fichesPublicationsFichier(referentiels);
  },
  /**
   * Référentiels : base d'abord, puis miroir JSON, puis valeurs initiales.
   * Toujours complets et sûrs (REF.normaliserReferentiels) : le site ne se
   * retrouve jamais sans libellé, même avant la migration.
   */
  async lireReferentiels() {
    const depuisBase = await tryDb('lecture des référentiels', repo => repo.listReferentiels());
    if (depuisBase) return REF.normaliserReferentiels(depuisBase);
    return REF.normaliserReferentiels(readJSON(REFERENTIELS_FILE, null));
  },
  /**
   * Crée ou modifie une entrée. Base d'abord ; le miroir JSON n'est réécrit
   * qu'après, d'après ce que la base contient réellement.
   */
  async ecrireReferentiel(type, entree, nouveau) {
    const actuels = await this.lireReferentiels();
    const existe = actuels[type].some(item => item.id === entree.id);
    if (nouveau && existe) return { statut: 409, erreur: `L’identifiant « ${entree.id} » est déjà utilisé dans ce référentiel.` };
    if (!nouveau && !existe) return { statut: 404, erreur: 'Entrée introuvable : elle a peut-être été supprimée entre-temps.' };

    const repo = loadRepository();
    if (repo) {
      try {
        await repo.saveReferentiel(type, entree);
        databaseReady = true;
      } catch (error) {
        databaseError = `référentiel ${type} : ${error.message}`;
        console.error(`MySQL — ${databaseError}`);
        return { statut: 503, erreur: erreurReferentielBase(error) };
      }
    }
    const apres = repo
      ? await this.lireReferentiels()
      : { ...actuels, [type]: existe ? actuels[type].map(item => (item.id === entree.id ? entree : item)) : [...actuels[type], entree] };
    const referentiels = REF.normaliserReferentiels(apres);
    try { writeJSON(REFERENTIELS_FILE, referentiels); }
    catch (error) {
      if (!repo) return { statut: 500, erreur: `Enregistrement impossible : ${text(error.message, 200)}` };
    }
    return { statut: 200, referentiels };
  },
  /**
   * Nouvel ordre d'un référentiel. `ids` doit contenir exactement les entrées
   * existantes : une liste partielle ou périmée (autre onglet ouvert) est
   * refusée plutôt que d'enregistrer un ordre incohérent.
   */
  async ordonnerReferentiel(type, ids) {
    if (type === 'statuts') return { statut: 400, erreur: 'L’ordre des statuts est fixe.' };
    const actuels = await this.lireReferentiels();
    const existants = actuels[type].map(item => item.id);
    const demandes = Array.isArray(ids) ? ids.map(id => String(id)) : [];
    const identique = demandes.length === existants.length
      && new Set(demandes).size === demandes.length
      && demandes.every(id => existants.includes(id));
    if (!identique) return { statut: 409, erreur: 'La liste a changé entre-temps : rechargez la page puis recommencez.' };

    const repo = loadRepository();
    if (repo) {
      try { await repo.ordonnerReferentiel(type, demandes); databaseReady = true; }
      catch (error) {
        databaseError = `ordre référentiel ${type} : ${error.message}`;
        console.error(`MySQL — ${databaseError}`);
        return { statut: 503, erreur: erreurReferentielBase(error) };
      }
    }
    const referentiels = REF.normaliserReferentiels(repo
      ? await this.lireReferentiels()
      : { ...actuels, [type]: actuels[type].map(item => ({ ...item, ordre: demandes.indexOf(item.id) + 1 })) });
    try { writeJSON(REFERENTIELS_FILE, referentiels); }
    catch (error) {
      if (!repo) return { statut: 500, erreur: `Enregistrement impossible : ${text(error.message, 200)}` };
    }
    return { statut: 200, referentiels };
  },
  /** Supprime une entrée inutilisée ; une entrée utilisée se désactive. */
  async supprimerReferentiel(type, id) {
    if (type === 'statuts') return { statut: 400, erreur: 'Les statuts ne se suppriment pas : leur code est utilisé par le site.' };
    const actuels = await this.lireReferentiels();
    if (!actuels[type]?.some(item => item.id === id)) return { statut: 404, erreur: 'Entrée introuvable.' };
    const usages = REF.compterUsages(type, id, await biensPourUsages(actuels));
    if (usages) {
      return { statut: 409, erreur: `Utilisé par ${usages} fiche${usages > 1 ? 's' : ''} : désactivez-le plutôt que de le supprimer, ou changez d’abord ces fiches.` };
    }
    const repo = loadRepository();
    if (repo) {
      try { await repo.deleteReferentiel(type, id); databaseReady = true; }
      catch (error) {
        databaseError = `suppression référentiel ${type} : ${error.message}`;
        console.error(`MySQL — ${databaseError}`);
        return { statut: 503, erreur: erreurReferentielBase(error) };
      }
    }
    const referentiels = REF.normaliserReferentiels(repo
      ? await this.lireReferentiels()
      : { ...actuels, [type]: actuels[type].filter(item => item.id !== id) });
    try { writeJSON(REFERENTIELS_FILE, referentiels); }
    catch (error) {
      if (!repo) return { statut: 500, erreur: `Suppression impossible : ${text(error.message, 200)}` };
    }
    return { statut: 200, referentiels };
  },
  /**
   * Enregistre la fiche d'une publication. Même règle que writeContent :
   * base attendue mais refusée → on le dit, et le miroir n'est actualisé
   * qu'après l'écriture en base.
   */
  async ecrireFichePublication(id, fiche) {
    const repo = loadRepository();
    if (repo) {
      let trouvee;
      try {
        trouvee = await repo.updateFacebookPostFiche(id, fiche);
        databaseReady = true;
      } catch (error) {
        databaseError = `fiche de publication : ${error.message}`;
        console.error(`MySQL — ${databaseError}`);
        const migrationManquante = error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054;
        return {
          statut: 503,
          erreur: migrationManquante
            ? 'Les colonnes de fiche n’existent pas encore en base : appliquez db/migration-fiche-publications.sql.'
            : 'Base de données injoignable : la fiche n’a pas été enregistrée. Réessayez.'
        };
      }
      if (!trouvee) return { statut: 404, erreur: 'Publication introuvable en base. Synchronisez les publications puis réessayez.' };
    } else {
      const connue = readJSON(FB_POSTS_FILE, []).some(post => String(post?.id) === id);
      if (!connue) return { statut: 404, erreur: 'Publication introuvable. Synchronisez les publications puis réessayez.' };
    }
    const brut = readJSON(FB_FICHES_FILE, {});
    const fiches = brut && typeof brut.fiches === 'object' && brut.fiches ? brut.fiches : {};
    fiches[id] = fiche;
    let avertissement = null;
    try { writeJSON(FB_FICHES_FILE, { fiches, updatedAt: new Date().toISOString() }); }
    catch (error) {
      if (!repo) return { statut: 500, erreur: `Enregistrement impossible : ${text(error.message, 200)}` };
      avertissement = 'Fiche enregistrée en base, mais la copie de secours JSON n’a pas pu être actualisée.';
    }
    return { statut: 200, enBase: Boolean(repo), avertissement };
  },
  /**
   * Écrit le contenu du site.
   *
   * Renvoie l'état RÉEL de l'écriture en base. Auparavant le résultat de
   * `tryDb` était ignoré : quand MySQL refusait l'écriture, le fichier JSON
   * était bien mis à jour, l'API répondait « ok » et le studio affichait
   * « Publié » — alors que la base n'avait rien reçu. L'administrateur croyait
   * son travail enregistré et le perdait à la prochaine lecture depuis MySQL.
   * Une erreur visible vaut mieux qu'une perte de données silencieuse.
   */
  async writeContent(content) {
    // On se fie à la CONFIGURATION, pas à `databaseReady`. Un worker Passenger
    // dont la sonde de démarrage a échoué gardait `databaseReady = false` à vie :
    // il écrivait alors le seul JSON et répondait « publié » sans jamais
    // retoucher MySQL. En tentant l'écriture, soit elle passe (et la sonde se
    // répare), soit elle échoue et l'administrateur le voit.
    const repo = loadRepository();
    if (!repo) {
      writeJSON(CONTENT_FILE, content);
      return { persistedToDb: false, dbExpected: false, error: null };
    }
    databaseError = null;
    try {
      await repo.writeContent(content);
      databaseReady = true;
    } catch (error) {
      databaseError = `écriture du contenu : ${error.message}`;
      console.error(`MySQL — ${databaseError}`);
      return { persistedToDb: false, dbExpected: true, error: error.message };
    }
    // Ne remplacer le miroir qu'après le COMMIT. Un refus SQL laisse ainsi
    // le dernier contenu publié intact, y compris lors d'une lecture de secours.
    let warning = null;
    try { writeJSON(CONTENT_FILE, content); }
    catch (error) {
      warning = 'Contenu enregistré en base, mais la copie de secours JSON n’a pas pu être actualisée.';
      console.error(`Miroir du contenu : ${error.message}`);
    }
    return { persistedToDb: true, dbExpected: true, error: null, warning };
  },
  /**
   * Supprime définitivement des demandes. Base d'abord : un refus SQL remonte
   * et le miroir reste intact, sinon la demande « supprimée » reviendrait à
   * la prochaine lecture depuis la base.
   */
  async deleteLeads(ids) {
    const liste = new Set((Array.isArray(ids) ? ids : []).map(String));
    if (!liste.size) return 0;
    const repo = loadRepository();
    let supprimees = 0;
    if (repo) {
      try { supprimees = await repo.deleteLeads([...liste]); }
      catch (error) {
        databaseError = `suppression de demandes : ${error.message}`;
        throw new Error('Suppression refusée par la base de données. Réessayez.');
      }
    }
    const leads = readJSON(LEADS_FILE, []);
    const restantes = leads.filter(lead => !liste.has(String(lead?.id)));
    if (!repo) supprimees = leads.length - restantes.length;
    try { writeJSON(LEADS_FILE, restantes); }
    catch (error) { if (!repo) throw error; console.error(`Miroir des demandes : ${error.message}`); }
    // Suivi par notification dans l'application : plus rien à suivre.
    const memoire = readJSON(APP_NOTIF_FILE, {});
    if (memoire.demandes && [...liste].some(id => memoire.demandes[id])) {
      [...liste].forEach(id => { delete memoire.demandes[id]; });
      writeJSON(APP_NOTIF_FILE, memoire);
    }
    return supprimees;
  },
  async readLeads() {
    const fromDb = await tryDb('lecture des demandes', repo => repo.listLeads());
    return Array.isArray(fromDb) ? fromDb : readJSON(LEADS_FILE, []);
  },
  async createLead(lead) {
    const leads = readJSON(LEADS_FILE, []);
    leads.unshift(lead);
    writeJSON(LEADS_FILE, leads.slice(0, 2000));
    await tryDb('création d’une demande', repo => repo.createLead(lead));
    return lead;
  },
  async updateLead(id, patch) {
    const leads = readJSON(LEADS_FILE, []);
    const repo = loadRepository();
    if (repo) {
      const normalized = {};
      if (['nouveau', 'contacte', 'confirme', 'archive'].includes(patch.status)) normalized.status = patch.status;
      if (patch.amount !== undefined) normalized.amount = positiveNumber(patch.amount, 0, 1_000_000_000);
      if (patch.adminNotes !== undefined) normalized.adminNotes = text(patch.adminNotes, 2000);
      let updated;
      try { updated = await repo.updateLead(id, normalized); }
      catch (error) {
        databaseError = `mise à jour d’une demande : ${error.message}`;
        throw new Error('Enregistrement du dossier en base refusé. Réessayez après vérification de la connexion MySQL.');
      }
      if (!updated) return null;
      const index = leads.findIndex(item => item.id === id);
      if (index < 0) leads.unshift(updated); else leads[index] = updated;
      try { writeJSON(LEADS_FILE, leads); }
      catch (error) { console.error(`Miroir des demandes : ${error.message}`); }
      return updated;
    }
    const lead = leads.find(item => item.id === id);
    if (!lead) return null;
    const allowed = ['nouveau', 'contacte', 'confirme', 'archive'];
    if (allowed.includes(patch.status)) lead.status = patch.status;
    if (patch.amount !== undefined) lead.amount = positiveNumber(patch.amount, lead.amount || 0, 1_000_000_000);
    if (patch.adminNotes !== undefined) lead.adminNotes = text(patch.adminNotes, 2000);
    lead.updatedAt = new Date().toISOString();
    writeJSON(LEADS_FILE, leads);
    return lead;
  },
  async readAudit(limit = 100) {
    const fromDb = await tryDb('lecture du journal', repo => repo.listAudit(limit));
    return Array.isArray(fromDb) && fromDb.length ? fromDb : readJSON(AUDIT_FILE, []).slice(0, limit);
  }
};

function writeJSON(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function positiveNumber(value, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(number, max) : fallback;
}

function numberBetween(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function slug(value, fallback) {
  const normalized = text(value, 100).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return normalized || fallback;
}

function audit(action, details = {}, actor = 'systeme') {
  const entry = { id: crypto.randomUUID(), action, details, actor: text(actor, 120) || 'systeme', createdAt: new Date().toISOString() };
  const entries = readJSON(AUDIT_FILE, []);
  entries.unshift(entry);
  writeJSON(AUDIT_FILE, entries.slice(0, 300));
  // Le journal part aussi en base quand MySQL est branché (best-effort :
  // un échec d'écriture du journal ne doit jamais casser l'action métier).
  tryDb('journal d’audit', repo => repo.appendAudit(entry)).catch(() => {});
}

function createBackup(reason = 'manuel') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `sauvegarde-${stamp}.json`;
  const snapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    content: readJSON(CONTENT_FILE, {}),
    leads: readJSON(LEADS_FILE, [])
  };
  writeJSON(path.join(BACKUP_DIR, filename), snapshot);
  const files = fs.readdirSync(BACKUP_DIR).filter(name => name.endsWith('.json')).sort().reverse();
  files.slice(20).forEach(name => fs.unlinkSync(path.join(BACKUP_DIR, name)));
  return { filename, createdAt: snapshot.createdAt, reason };
}

function listBackups() {
  return fs.readdirSync(BACKUP_DIR).filter(name => /^sauvegarde-.*\.json$/.test(name)).sort().reverse().slice(0, 20).map(filename => {
    const stat = fs.statSync(path.join(BACKUP_DIR, filename));
    return { filename, size: stat.size, createdAt: stat.mtime.toISOString() };
  });
}

function saveUploadedImage(payload) {
  const allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const extension = allowed[text(payload.mimeType, 40)];
  if (!extension) throw new Error('Format refusé. Utilisez JPG, PNG ou WebP.');
  const raw = text(payload.data, 12_000_000).replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
  let buffer;
  try { buffer = Buffer.from(raw, 'base64'); } catch { throw new Error('Image invalide'); }
  if (!buffer.length || buffer.length > 8_000_000) throw new Error('L’image doit peser moins de 8 Mo.');
  const signatures = {
    '.jpg': buffer[0] === 0xff && buffer[1] === 0xd8,
    '.png': buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
    '.webp': buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
  };
  if (!signatures[extension]) throw new Error('Le contenu du fichier ne correspond pas à son format.');
  const base = slug(path.parse(text(payload.filename, 180)).name, 'image');
  const filename = `${base}-${crypto.randomUUID().slice(0, 8)}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer, { flag: 'wx' });
  const url = `assets/uploads/${filename}`;
  audit('media.uploaded', { filename, bytes: buffer.length });
  return { url, filename, bytes: buffer.length };
}

// ---------------------------------------------------------------------------
// Vente de terrain — schéma de référence (docs/CONTRAT-EQUIPE.md).
// ---------------------------------------------------------------------------
const EURO_RATE = 655.957;
const LAND_STATUS = {
  'titre-foncier': 'Titre foncier',
  'acd': 'ACD (Arrêté de Concession Définitive)',
  'lettre-attribution': 'Lettre d’attribution',
  'certificat-propriete': 'Certificat de propriété'
};
const TERRAIN_STATUS = ['disponible', 'reserve', 'vendu'];
const TERRAIN_UTILITIES = ['eau', 'electricite', 'voie-bitumee', 'assainissement', 'cloture', 'borne'];

function optionalDecimal(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function validateTerrains(payload, errors, warnings) {
  const seenTerrainIds = new Set();
  const seenReferences = new Set();
  return (Array.isArray(payload.terrains) ? payload.terrains : []).slice(0, 200).map((item, index) => {
    const label = `Terrain ${index + 1}`;
    const title = text(item?.title, 160);
    const id = slug(item?.id || title, `terrain-${index + 1}`);
    if (!title) errors.push(`${label} : le titre est requis.`);
    if (seenTerrainIds.has(id)) errors.push(`Terrain : l'identifiant « ${id} » est utilisé plusieurs fois.`);
    seenTerrainIds.add(id);

    const reference = text(item?.reference, 40);
    if (!reference) errors.push(`${title || label} : la référence est requise.`);
    else if (seenReferences.has(reference.toLowerCase())) errors.push(`Terrain : la référence « ${reference} » est utilisée plusieurs fois.`);
    seenReferences.add(reference.toLowerCase());

    const areaSqm = Math.round(positiveNumber(item?.areaSqm, 0, 100_000_000));
    if (!areaSqm) errors.push(`${title || label} : la superficie en m² doit être supérieure à zéro.`);

    const priceTotal = Math.round(positiveNumber(item?.priceTotal, 0, 100_000_000_000));
    if (!priceTotal) errors.push(`${title || label} : le prix de vente total est requis.`);

    const landStatus = LAND_STATUS[text(item?.landStatus, 40)] ? text(item?.landStatus, 40) : null;
    if (!landStatus) {
      errors.push(`${title || label} : statut foncier invalide (attendu : ${Object.keys(LAND_STATUS).join(', ')}).`);
    }

    const rawStatus = text(item?.status, 40) || 'disponible';
    if (!TERRAIN_STATUS.includes(rawStatus)) {
      errors.push(`${title || label} : statut invalide « ${rawStatus} » (attendu : ${TERRAIN_STATUS.join(', ')}).`);
    }
    const status = TERRAIN_STATUS.includes(rawStatus) ? rawStatus : 'disponible';

    const rawUtilities = Array.isArray(item?.utilities) ? item.utilities : [];
    const utilities = [];
    rawUtilities.slice(0, 20).forEach(value => {
      const entry = text(value, 40);
      if (!entry) return;
      if (!TERRAIN_UTILITIES.includes(entry)) {
        errors.push(`${title || label} : viabilisation inconnue « ${entry} » (attendu : ${TERRAIN_UTILITIES.join(', ')}).`);
        return;
      }
      if (!utilities.includes(entry)) utilities.push(entry);
    });

    const images = (Array.isArray(item?.images) ? item.images : []).map(value => text(value, 1000)).filter(Boolean).slice(0, 12);
    if (!images.length) warnings.push(`${title || label} : aucune image.`);

    // Prix dérivés : TOUJOURS recalculés ici, jamais repris du client.
    const pricePerSqm = areaSqm ? Math.round(priceTotal / areaSqm) : 0;
    const priceEuro = Math.round(priceTotal / EURO_RATE);

    const clean = { ...item };
    delete clean.pricePerSqm;
    delete clean.priceEuro;

    return {
      ...clean,
      id,
      reference,
      title,
      location: text(item?.location, 240),
      district: text(item?.district, 120),
      areaSqm,
      priceTotal,
      pricePerSqm,
      priceEuro,
      landStatus: landStatus || 'titre-foncier',
      landStatusLabel: LAND_STATUS[landStatus] || text(item?.landStatusLabel, 80),
      utilities,
      status,
      description: text(item?.description, 8000),
      images,
      highlights: (Array.isArray(item?.highlights) ? item.highlights : []).map(value => text(value, 160)).filter(Boolean).slice(0, 20),
      visible: item?.visible !== false,
      featured: Boolean(item?.featured),
      badge: text(item?.badge, 80),
      latitude: optionalDecimal(item?.latitude, -90, 90),
      longitude: optionalDecimal(item?.longitude, -180, 180),
      translations: FICHES.nettoyerTraductions(item?.translations, 'terrain')
    };
  });
}

/**
 * Rattachement d’une fiche aux référentiels (villa, terrain, activité).
 * Appliqué APRÈS les règles propres à chaque type, qu’il ne remplace pas.
 * Références inconnues → erreur explicite ; textes affichés (adresse, badge,
 * libellé de catégorie) recalculés depuis le référentiel, jamais saisis.
 */
/**
 * Gestion d'une annonce (17/09/2026) : état (active, suspendue, archivée) et
 * case « Publier sur Facebook » — vraie, fausse, ou null tant qu'elle n'a
 * jamais été enregistrée (annonce antérieure : l'état de la Page fait foi).
 * L'ancien drapeau à usage unique `shareToFacebook` disparaît.
 */
function gestionAnnonce(item) {
  const { shareToFacebook, ...reste } = item;
  return { ...reste, etat: SYNC.etatAnnonce(item), facebook: item.facebook === true ? true : item.facebook === false ? false : null };
}

function appliquerReferentiels(item, referentiels, errors, options) {
  const { nom, avecCategorie = false, avecStatutVilla = false, avecLocalisation = false, avecEquipements = false } = options;
  const resultat = { ...item };
  const ids = type => referentiels[type].map(entree => entree.id);
  const reference = (valeur, type, libelle) => {
    const code = text(valeur, 80);
    if (!code) return '';
    if (ids(type).includes(code)) return code;
    errors.push(`${nom} : ${libelle} « ${code} » ne figure pas dans le référentiel.`);
    return '';
  };

  if (avecLocalisation) {
    const localisationId = reference(item?.localisationId, 'localisations', 'localisation');
    const precision = text(item?.localisationPrecision, 240);
    resultat.localisationId = localisationId;
    resultat.localisationPrecision = localisationId ? precision : '';
    // Sans ville rattachée (fiche antérieure aux référentiels), le texte
    // d’origine reste affiché tel quel.
    resultat.location = localisationId
      ? REF.composerLocalisation(referentiels, localisationId, precision)
      : text(item?.location, 240);
  }

  const badgeId = reference(item?.badgeId, 'badges', 'badge');
  resultat.badgeId = badgeId;
  resultat.badge = badgeId
    ? REF.libelleDe(REF.trouver(referentiels, 'badges', badgeId))
    : (item?.badgeId === undefined ? text(item?.badge, 80) : '');

  if (avecCategorie) {
    // Catégorie = thème, facultative : vide veut dire « aucun thème ».
    const code = text(item?.category, 80);
    const categorie = REF.trouver(referentiels, 'categories', code);
    if (code && !categorie) errors.push(`${nom} : catégorie « ${code} » absente du référentiel.`);
    resultat.category = categorie ? code : '';
    resultat.categoryLabel = categorie ? REF.libelleDe(categorie) : '';
  }

  if (avecStatutVilla) {
    const codes = referentiels.statuts.filter(statut => statut.cible === 'villa').map(statut => statut.code);
    const statut = text(item?.status, 40) || 'disponible';
    if (!codes.includes(statut)) errors.push(`${nom} : statut « ${statut} » invalide (attendu : ${codes.join(', ')}).`);
    resultat.status = codes.includes(statut) ? statut : 'disponible';
  }

  if (avecEquipements) {
    const equipements = [];
    (Array.isArray(item?.equipements) ? item.equipements : []).slice(0, 60).forEach(valeur => {
      const code = reference(valeur, 'equipements', 'équipement');
      if (code && !equipements.includes(code)) equipements.push(code);
    });
    resultat.equipements = equipements;
  }
  return resultat;
}

function validateAndSanitizeContent(payload, referentiels = REF.normaliserReferentiels(null)) {
  const errors = [];
  const warnings = [];
  const seenVillaIds = new Set();
  const seenActivityIds = new Set();
  const villas = (Array.isArray(payload.villas) ? payload.villas : []).slice(0, 100).map((item, index) => {
    const name = text(item?.name, 160);
    const id = slug(item?.id || name, `villa-${index + 1}`);
    if (!name) errors.push(`Villa ${index + 1} : le nom est requis.`);
    if (seenVillaIds.has(id)) errors.push(`Villa : l'identifiant « ${id} » est utilisé plusieurs fois.`);
    seenVillaIds.add(id);
    const images = (Array.isArray(item?.images) ? item.images : []).map(value => text(value, 1000)).filter(Boolean).slice(0, 12);
    if (!images.length) warnings.push(`${name || `Villa ${index + 1}`} : aucune image principale.`);
    const pricePerNight = positiveNumber(item?.pricePerNight, 0, 100_000_000);
    if (!pricePerNight) warnings.push(`${name || `Villa ${index + 1}`} : tarif par nuit nul.`);
    // Cadre = lieu ; catégorie = thème (décision du 13/09/2026). Une ancienne
    // catégorie de lieu (lagune, océan, piscine) sert encore à déduire le
    // cadre d'une fiche qui n'en a pas, puis disparaît.
    const categorieBrute = slug(item?.category, '');
    return {
      ...item, id, name, tagline: text(item?.tagline, 240),
      category: REF.CATEGORIES_RESERVEES.includes(categorieBrute) ? '' : categorieBrute,
      environment: FICHES.CADRES.includes(item?.environment)
        ? item.environment
        : (categorieBrute === 'ocean' ? 'ocean' : categorieBrute === 'lagune' ? 'lagune' : 'terre'),
      categoryLabel: text(item?.categoryLabel, 80), location: text(item?.location, 240),
      description: text(item?.description, 8000), pricePerNight, priceEuro: Math.round(pricePerNight / 655.957),
      weekendPackage: positiveNumber(item?.weekendPackage, 0, 100_000_000), capacity: numberBetween(item?.capacity, 1, 100, 1),
      bedrooms: numberBetween(item?.bedrooms, 1, 50, 1), bathrooms: numberBetween(item?.bathrooms, 1, 50, 1),
      visible: item?.visible !== false, featured: Boolean(item?.featured), badge: text(item?.badge, 80),
      status: text(item?.status || 'disponible', 40), beds: text(item?.beds, 160), images,
      features: (Array.isArray(item?.features) ? item.features : []).map(value => text(value, 160)).filter(Boolean).slice(0, 40),
      highlights: (Array.isArray(item?.highlights) ? item.highlights : []).map(value => text(value, 160)).filter(Boolean).slice(0, 20),
      translations: FICHES.nettoyerTraductions(item?.translations, 'villa')
    };
  });
  const activities =(Array.isArray(payload.activities) ? payload.activities : []).slice(0, 100).map((item, index) => {
    const title = text(item?.title, 160);
    const id = slug(item?.id || title, `activite-${index + 1}`);
    if (!title) errors.push(`Activité ${index + 1} : le titre est requis.`);
    if (seenActivityIds.has(id)) errors.push(`Activité : l'identifiant « ${id} » est utilisé plusieurs fois.`);
    seenActivityIds.add(id);
    const images = (Array.isArray(item?.images) ? item.images : [item?.image]).map(value => text(value, 1000)).filter(Boolean).slice(0, 12);
    if (!images.length) warnings.push(`${title || `Activité ${index + 1}`} : aucune image.`);
    // Tarification chiffrée, utilisée par le simulateur de devis.
    // `priceAmount` et `priceUnit` donnent le montant exact et sa base de
    // facturation. Depuis le 13/09/2026, `price` (libellé affiché) en est
    // GÉNÉRÉ, avec deux mentions libres facultatives : il ne peut plus
    // annoncer un autre tarif que celui du devis.
    const priceAmount = positiveNumber(item?.priceAmount, 0, 100_000_000);
    const allowedUnits = ['forfait', 'jour', 'personne'];
    const priceUnit = allowedUnits.includes(item?.priceUnit) ? item.priceUnit : 'forfait';
    // Forfait groupe facultatif : un prix pour un nombre de participants donné.
    // Les deux valeurs vont ensemble — l'une sans l'autre serait ignorée par le
    // simulateur, on neutralise donc la paire incomplète dès la validation.
    const groupSize = numberBetween(item?.groupSize, 0, 50, 0);
    const groupPriceAmount = positiveNumber(item?.groupPriceAmount, 0, 100_000_000);
    const forfaitComplet = groupSize > 1 && groupPriceAmount > 0;
    if ((groupSize > 1) !== (groupPriceAmount > 0)) {
      warnings.push(`${title || `Activité ${index + 1}`} : forfait groupe incomplet (montant ET taille requis) — ignoré.`);
    } else if (forfaitComplet && priceUnit !== 'personne') {
      warnings.push(`${title || `Activité ${index + 1}`} : le forfait groupe ne s'applique qu'à une facturation « par personne ».`);
    }
    const tarif = {
      priceAmount, priceUnit,
      pricePrefix: text(item?.pricePrefix, 80), priceSuffix: text(item?.priceSuffix, 80),
      groupPriceAmount: forfaitComplet ? groupPriceAmount : 0,
      groupSize: forfaitComplet ? groupSize : 0
    };
    return { ...item, id, title, subtitle: text(item?.subtitle, 240), description: text(item?.description, 8000),
      image: images[0] || '', images, visible: item?.visible !== false, featured: Boolean(item?.featured),
      badge: text(item?.badge, 80), duration: text(item?.duration, 80),
      ...tarif, price: FICHES.texteTarifActivite(tarif).slice(0, 80),
      translations: FICHES.nettoyerTraductions(item?.translations, 'activity') };
  });
  const settings = payload.settings && typeof payload.settings === 'object' ? {
    ...payload.settings, heroTitle: text(payload.settings.heroTitle, 180), heroSubtitle: text(payload.settings.heroSubtitle, 500),
    phone: text(payload.settings.phone, 60), facebookPage: text(payload.settings.facebookPage, 1000),
    officeHours: text(payload.settings.officeHours, 120), currency: text(payload.settings.currency, 20) || 'FCFA'
  } : {};
  // Relais automatique retiré le 17/09/2026 : seule la case de chaque annonce
  // décide de sa publication sur Facebook.
  delete settings.facebookAutoPublish;
  const terrains = validateTerrains(payload, errors, warnings).map((item, index) => gestionAnnonce(appliquerReferentiels(item, referentiels, errors,
    { nom: item.title || `Terrain ${index + 1}`, avecLocalisation: true })));
  const villasRattachees = villas.map((item, index) => gestionAnnonce(appliquerReferentiels(item, referentiels, errors,
    { nom: item.name || `Villa ${index + 1}`, avecCategorie: true, avecStatutVilla: true, avecLocalisation: true, avecEquipements: true })));
  const activitiesRattachees = activities.map((item, index) => gestionAnnonce(appliquerReferentiels(item, referentiels, errors,
    { nom: item.title || `Activité ${index + 1}` })));
  return {
    content: { villas: villasRattachees, terrains, activities: activitiesRattachees, reviews: Array.isArray(payload.reviews) ? payload.reviews.slice(0, 100) : [],
      faq: Array.isArray(payload.faq) ? payload.faq.slice(0, 100) : [], settings,
      facebookPosts: Array.isArray(payload.facebookPosts) ? publicationsSansFiche(payload.facebookPosts.slice(0, 20)) : [], updatedAt: new Date().toISOString() },
    errors, warnings
  };
}

/**
 * Contenu vu par les visiteurs (site, application) : les annonces suspendues
 * ou archivées depuis le studio en sont retirées. Le studio lit le contenu
 * complet sur GET /api/admin/content.
 */
function contenuPublic(contenu) {
  const actives = liste => (Array.isArray(liste) ? liste.filter(item => SYNC.etatAnnonce(item) === 'active') : liste);
  return { ...contenu, villas: actives(contenu.villas), terrains: actives(contenu.terrains), activities: actives(contenu.activities) };
}

/**
 * Ajoute à chaque annonce le résumé de ses avis visiteurs : { likes, note,
 * nombre }. Un stockage des avis indisponible n'empêche jamais le contenu
 * d'être servi.
 */
async function avecAvis(contenu) {
  let resumes;
  try { resumes = AVIS.resumes(await AVIS.tout()); }
  catch (error) { console.error(`Avis visiteurs : ${error.message}`); return contenu; }
  const vide = { likes: 0, note: null, nombre: 0 };
  const ajouter = (kind, liste) => (Array.isArray(liste)
    ? liste.map(item => ({ ...item, avis: resumes.get(`${kind}:${item.id}`) || vide }))
    : liste);
  return { ...contenu, villas: ajouter('villa', contenu.villas), terrains: ajouter('terrain', contenu.terrains), activities: ajouter('activity', contenu.activities) };
}

/** Annonce en ligne (active et visible) : seule une telle annonce reçoit des avis. */
async function annonceEnLigne(kind, id) {
  const contenu = await lireContenuBrut();
  const liste = contenu[{ villa: 'villas', terrain: 'terrains', activity: 'activities' }[kind]];
  const item = Array.isArray(liste) ? liste.find(entree => entree?.id === id) : null;
  return Boolean(item && item.visible !== false && SYNC.etatAnnonce(item) === 'active');
}

/** Vrai quand un contenu n'a ni villa, ni terrain, ni activité. */
function catalogueVide(contenu) {
  return ['villas', 'terrains', 'activities'].every(cle => !(Array.isArray(contenu?.[cle]) && contenu[cle].length));
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

/** Réponse HTML autonome (pages de confirmation / désabonnement newsletter). */
function html(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': MIME['.html'], 'Cache-Control': 'no-store',
    ...securityHeaders(true), ...extraHeaders
  });
  res.end(body);
}

function parseBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > limit) reject(new Error('Payload trop volumineux'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      // Un <form> HTML sans JavaScript envoie du x-www-form-urlencoded, pas du
      // JSON. L'accepter permet au formulaire newsletter de fonctionner même
      // si le script de la page ne s'est pas chargé.
      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/x-www-form-urlencoded')) {
        try { return resolve(Object.fromEntries(new URLSearchParams(raw))); }
        catch { return reject(new Error('Formulaire illisible')); }
      }
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

/**
 * Vrai quand la requête vient d'un <form> HTML classique et non de fetch().
 * Dans ce cas le visiteur attend une PAGE, pas du JSON : lui renvoyer du JSON
 * afficherait une accolade nue dans son navigateur.
 */
function wantsHtmlResponse(req) {
  const type = String(req.headers['content-type'] || '');
  const accept = String(req.headers.accept || '');
  return type.includes('application/x-www-form-urlencoded')
    && accept.includes('text/html');
}

// ===========================================================================
// AUTHENTIFICATION PAR COMPTE UTILISATEUR
//
// Historique : le studio était protégé par une clé partagée unique
// (ADMIN_SECRET + en-tête `x-admin-key`). Une clé partagée ne permet ni de
// savoir qui a fait quoi, ni de retirer l'accès à une seule personne, ni de
// limiter les droits. Elle est remplacée par de vrais comptes (db/auth-store).
//
// TRANSITION SANS COUPURE : tant qu'AUCUN compte n'existe, l'ancienne clé
// continue d'ouvrir le studio, en « mode dégradé » — clairement affiché comme
// tel dans l'interface et journalisé à chaque usage. Dès la création du
// premier compte, la clé cesse immédiatement de fonctionner.
// ===========================================================================
const SESSION_COOKIE = 'dl_session';

/** Acteur virtuel du mode dégradé (clé de secours). */
const LEGACY_ACTOR = {
  id: 'cle-de-secours',
  username: 'cle-de-secours',
  email: '',
  role: 'proprietaire',
  roleLabel: 'Accès de secours par clé',
  active: true,
  permissions: auth.permissionsFor('proprietaire'),
  degraded: true,
  viaCookie: false
};

function legacyKeyMatches(req) {
  const left = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const right = Buffer.from(String(ADMIN_SECRET));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// La question « existe-t-il au moins un compte ? » est posée à chaque requête :
// on met la réponse en cache 5 secondes pour ne pas interroger la base à
// chaque appel, tout en réagissant vite à la création du premier compte.
let legacyProbe = { checkedAt: 0, allowed: true };

async function legacyKeyAllowed() {
  const now = Date.now();
  if (now - legacyProbe.checkedAt < 5000) return legacyProbe.allowed;
  let total = 0;
  try { total = await auth.countUsers(); } catch { total = 0; }
  legacyProbe = { checkedAt: now, allowed: total === 0 };
  return legacyProbe.allowed;
}

/** Invalide le cache après création/suppression d'un compte. */
function resetLegacyProbe() { legacyProbe = { checkedAt: 0, allowed: true }; }

// Journalisation du mode dégradé, limitée à une entrée par IP et par quart
// d'heure : l'objectif est de tracer l'usage, pas de noyer le journal.
const degradedNotices = new Map();
function noteDegradedUse(req, context) {
  const ip = clientIp(req);
  const now = Date.now();
  const last = degradedNotices.get(ip) || 0;
  if (now - last < 15 * 60_000) return;
  degradedNotices.set(ip, now);
  if (degradedNotices.size > 200) degradedNotices.clear();
  audit('auth.degraded_key_used', { ip, context }, 'cle-de-secours');
}

function parseCookies(req) {
  const jar = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    const name = part.slice(0, separator).trim();
    if (!name) return;
    const value = part.slice(separator + 1).trim();
    try { jar[name] = decodeURIComponent(value); } catch { jar[name] = value; }
  });
  return jar;
}

function requestIsSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (proto) return proto === 'https';
  return Boolean(req.socket?.encrypted);
}

function isLocalRequest(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * L'attribut `Secure` est obligatoire en production : sans lui, le cookie de
 * session partirait aussi en clair sur une éventuelle requête http://.
 * Il est cependant impossible en développement local (le navigateur refuse
 * d'enregistrer un cookie Secure servi en http://localhost) — d'où le mode
 * `auto`, qui n'ouvre l'exception QUE pour localhost en http.
 * COOKIE_SECURE=true force l'attribut en toutes circonstances.
 */
function cookieSecure(req) {
  const setting = String(process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (setting === 'true' || setting === 'always') return true;
  if (setting === 'false' || setting === 'never') return false;
  return requestIsSecure(req) || !isLocalRequest(req);
}

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',                 // inaccessible au JavaScript de la page
    'SameSite=Strict',          // jamais envoyé depuis un autre site (anti-CSRF)
    `Max-Age=${maxAgeSeconds}`
  ];
  if (cookieSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearedSessionCookie(req) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (cookieSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Identifie l'auteur d'une requête : session par cookie d'abord, clé de
 * secours ensuite (et uniquement si aucun compte n'existe encore).
 * Retourne null si la requête n'est pas authentifiée.
 */
/**
 * Erreur signalant que la base n'a pas pu répondre pendant la vérification de
 * la session. À NE PAS confondre avec « session inconnue » : l'une signifie
 * « reconnectez-vous », l'autre « le serveur a un problème ».
 */
class SessionUnavailableError extends Error {}

async function resolveActor(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    let resolved = null;
    try {
      resolved = await auth.resolveSession(token);
    } catch (error) {
      // Une panne MySQL ne doit JAMAIS être interprétée comme une déconnexion.
      // Avant ce correctif, le `catch` renvoyait `null` : la requête repartait
      // en 401 et le studio remplaçait tout l'écran par le formulaire de
      // connexion — en pleine saisie, l'administrateur perdait son travail
      // sans comprendre pourquoi.
      console.error(`Session — base injoignable : ${error.message}`);
      throw new SessionUnavailableError(error.message);
    }
    if (resolved) {
      return { ...resolved.actor, viaCookie: true, token, session: resolved.session };
    }
  }
  if (legacyKeyMatches(req) && await legacyKeyAllowed()) {
    noteDegradedUse(req, 'en-tete-x-admin-key');
    return { ...LEGACY_ACTOR };
  }
  return null;
}

// ---------------------------------------------------------------------------
// PERMISSIONS PAR ROUTE
//
// Chaque route /api/admin/* exige une permission précise : être authentifié ne
// suffit jamais. Le tableau est la seule source de vérité, et le défaut est le
// REFUS : une route ajoutée sans entrée ici renvoie 403. C'est volontaire —
// mieux vaut une route momentanément inaccessible qu'une route ouverte à tous.
// ---------------------------------------------------------------------------
const ADMIN_ROUTE_PERMISSIONS = [
  ['GET', /^\/api\/admin\/dashboard$/, 'dashboard:view'],
  ['GET', /^\/api\/admin\/content$/, 'content:read'],
  ['GET', /^\/api\/admin\/avis$/, 'content:read'],
  ['PATCH', /^\/api\/admin\/avis\/commentaires\/[^/]+$/, 'content:write'],
  ['DELETE', /^\/api\/admin\/avis\/commentaires\/[^/]+$/, 'content:write'],
  ['POST', /^\/api\/admin\/content$/, 'content:write'],
  ['POST', /^\/api\/admin\/content\/validate$/, 'content:write'],
  ['GET', /^\/api\/admin\/referentiels$/, 'content:write'],
  ['POST', /^\/api\/admin\/referentiels\/[a-z]+$/, 'content:write'],
  ['POST', /^\/api\/admin\/referentiels\/[a-z]+\/ordre$/, 'content:write'],
  ['DELETE', /^\/api\/admin\/referentiels\/[a-z]+\/[^/]+$/, 'content:write'],
  ['POST', /^\/api\/admin\/media$/, 'content:write'],
  ['GET', /^\/api\/admin\/leads$/, 'leads:read'],
  ['PATCH', /^\/api\/admin\/leads\/[^/]+$/, 'leads:write'],
  ['DELETE', /^\/api\/admin\/leads\/[^/]+$/, 'leads:write'],
  ['GET', /^\/api\/admin\/demandeurs\/restrictions$/, 'leads:read'],
  ['POST', /^\/api\/admin\/demandeurs\/restrictions$/, 'leads:write'],
  ['DELETE', /^\/api\/admin\/demandeurs\/restrictions\/[^/]+$/, 'leads:write'],
  ['POST', /^\/api\/admin\/demandeurs\/supprimer$/, 'leads:write'],
  ['GET', /^\/api\/admin\/whatsapp$/, 'leads:read'],
  ['POST', /^\/api\/admin\/whatsapp\/campagnes$/, 'leads:write'],
  ['PATCH', /^\/api\/admin\/whatsapp\/campagnes\/[^/]+$/, 'leads:write'],
  ['DELETE', /^\/api\/admin\/whatsapp\/campagnes\/[^/]+$/, 'leads:write'],
  ['POST', /^\/api\/admin\/whatsapp\/stop$/, 'leads:write'],
  ['GET', /^\/api\/admin\/export$/, 'leads:export'],
  ['GET', /^\/api\/admin\/compta$/, 'compta:manage'],
  ['GET', /^\/api\/admin\/compta\/export$/, 'compta:manage'],
  ['POST', /^\/api\/admin\/compta\/(ecritures|employes|charges|paie|charges-du-mois|justificatifs)$/, 'compta:manage'],
  ['PATCH', /^\/api\/admin\/compta\/(ecritures|employes|charges)\/[^/]+$/, 'compta:manage'],
  ['DELETE', /^\/api\/admin\/compta\/(ecritures|employes|charges)\/[^/]+$/, 'compta:manage'],
  ['GET', /^\/api\/admin\/compta\/justificatifs\/[^/]+$/, 'compta:manage'],
  ['POST', /^\/api\/admin\/compta\/parametres\/(categories|modes|statuts)$/, 'compta:manage'],
  ['DELETE', /^\/api\/admin\/compta\/parametres\/(categories|modes|statuts)\/[^/]+$/, 'compta:manage'],
  ['POST', /^\/api\/admin\/backups$/, 'backup:manage'],
  ['GET', /^\/api\/admin\/backups$/, 'backup:manage'],
  ['GET', /^\/api\/admin\/audit$/, 'audit:read'],
  ['GET', /^\/api\/admin\/facebook\/posts$/, 'facebook:read'],
  ['GET', /^\/api\/admin\/facebook\/identite$/, 'facebook:read'],
  ['GET', /^\/api\/admin\/facebook\/subscriptions$/, 'facebook:read'],
  ['POST', /^\/api\/admin\/facebook\/abonner-page$/, 'facebook:write'],
  ['POST', /^\/api\/admin\/facebook\/visibilite$/, 'facebook:write'],
  ['POST', /^\/api\/admin\/facebook\/fiche$/, 'facebook:write'],
  ['POST', /^\/api\/admin\/facebook\/publish$/, 'facebook:write'],
  ['POST', /^\/api\/admin\/facebook\/sync-to-site$/, 'facebook:write'],
  ['GET', /^\/api\/admin\/users$/, 'users:manage'],
  ['POST', /^\/api\/admin\/users$/, 'users:manage'],
  ['PATCH', /^\/api\/admin\/users\/[^/]+$/, 'users:manage'],
  ['DELETE', /^\/api\/admin\/users\/[^/]+$/, 'users:manage'],
  ['POST', /^\/api\/admin\/users\/[^/]+\/mot-de-passe$/, 'users:manage'],
  ['GET', /^\/api\/admin\/newsletter$/, 'newsletter:read'],
  ['GET', /^\/api\/admin\/newsletter\/export$/, 'newsletter:read'],
  ['GET', /^\/api\/admin\/newsletter\/campagnes$/, 'newsletter:read'],
  ['POST', /^\/api\/admin\/newsletter\/campagnes$/, 'newsletter:write'],
  ['POST', /^\/api\/admin\/newsletter\/campagnes\/[^/]+\/envoyer$/, 'newsletter:write'],
  ['PATCH', /^\/api\/admin\/newsletter\/abonnes\/[^/]+$/, 'newsletter:write'],
  ['DELETE', /^\/api\/admin\/newsletter\/abonnes\/[^/]+$/, 'newsletter:write'],
  ['POST', /^\/api\/admin\/newsletter\/file\/relancer$/, 'newsletter:write'],
  ['POST', /^\/api\/admin\/newsletter\/test$/, 'newsletter:write']
];

function requiredPermission(method, pathname) {
  const found = ADMIN_ROUTE_PERMISSIONS.find(([verb, pattern]) => verb === method && pattern.test(pathname));
  return found ? found[2] : null;
}

function actorLabel(actor) {
  return actor ? `${actor.username}${actor.degraded ? ' (secours)' : ''}` : 'anonyme';
}

function verifyMetaSignature(req, rawBody) {
  if (!APP_SECRET) return false;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
  const left = Buffer.from(String(signature));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const GRAPH_TIMEOUT_MS = Math.max(2000, Number(process.env.META_TIMEOUT_MS || 12_000));
// Téléverser une photo, c’est pousser plusieurs centaines de kilo-octets sur
// le lien montant du serveur : douze secondes suffisent à interroger Graph,
// pas à lui envoyer un album. Constaté le 12/09/2026, où la publication
// échouait sur « Meta n’a pas répondu en 12 s » alors que tout était correct.
const GRAPH_UPLOAD_TIMEOUT_MS = Math.max(GRAPH_TIMEOUT_MS, Number(process.env.META_UPLOAD_TIMEOUT_MS || 90_000));

async function graphRequest(endpoint, options = {}) {
  if (!PAGE_ID || !PAGE_TOKEN) throw new Error('Connexion Meta non configurée');
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${endpoint}`);
  // fetch() n'a aucun délai d'expiration par défaut : sans AbortController une
  // Graph API injoignable bloquerait la requête jusqu'au timeout TCP système.
  const controller = new AbortController();
  // `timeoutMs` est propre à cet appel : on le retire avant de passer les
  // options à fetch, qui ne le connaît pas.
  const { timeoutMs, ...optionsFetch } = options;
  const plafond = Math.max(2000, Number(timeoutMs) || GRAPH_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), plafond);
  let response;
  try {
    response = await fetch(url, {
      ...optionsFetch,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${PAGE_TOKEN}`, ...(optionsFetch.headers || {}) }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Meta n'a pas répondu en ${Math.round(plafond / 1000)} s.`);
    throw new Error(`Meta injoignable : ${text(error?.message, 200) || 'erreur réseau'}`);
  } finally {
    clearTimeout(timer);
  }
  const body = await response.text();
  let payload;
  try { payload = body ? JSON.parse(body) : {}; }
  catch { throw new Error(`Réponse Meta illisible (HTTP ${response.status}).`); }
  if (!response.ok || payload.error) {
    const detail = payload.error?.message || `Erreur Meta (${response.status})`;
    const err = new Error(detail);
    err.metaCode = payload.error?.code;
    err.httpStatus = response.status;
    throw err;
  }
  return payload;
}

/**
 * Publications de la Page.
 *
 * Deux edges coexistent chez Meta selon l'âge de la Page :
 *
 *   · `published_posts` — Pages classiques. Ne renvoie que ce que la Page a
 *     publié elle-même, ce qui est exactement ce qu'on veut afficher.
 *   · `feed` — Pages migrées vers le « New Pages Experience » (celles dont
 *     l'adresse est en profile.php). Sur ces Pages, `published_posts`
 *     n'existe pas : Meta répond « (#100) Tried accessing nonexisting field ».
 *
 * Impossible de deviner le type depuis l'identifiant : on tente donc l'edge
 * la plus précise, et on bascule sur `feed` uniquement sur cette erreur-là.
 * Le choix est mémorisé pour ne pas payer deux appels à chaque synchronisation.
 */
let edgePublications = null;      // null = inconnue, puis 'published_posts' | 'feed'

// Les albums sont demandés tant que Graph les accepte. Si la permission ou
// la version de l’API venait à les refuser, on retombe sur les champs de
// base plutôt que de laisser la synchronisation entière échouer : mieux vaut
// une image par publication que plus aucune publication sur le site.
//
// Trois niveaux, du plus complet au plus sûr :
//   · 'complet'  — sous-pièces demandées par 100 : un album entier d’un coup.
//   · 'standard' — sous-pièces sans limite : Graph n’en renvoie qu’une page.
//   · 'aucun'    — champs de base, une image par publication.
// Constaté le 13/09/2026 : sans `.limit()`, Graph coupe `subattachments` à
// 12 éléments. Les dix albums de la Page s’arrêtaient tous à 12 photos, et
// la vue de détail du studio comme le site n’en montraient pas davantage.
let niveauAlbums = 'complet';
const PHOTOS_PAR_PAGE_ALBUM = 100;

function champsPublications() {
  const base = 'fields=id,message,created_time,permalink_url,full_picture';
  // `target{id}` : identifiant de la vidéo d'une publication vidéo ou Reel,
  // pour la lire sur le site (voir videoDuPost).
  // `subattachments{target{id}}` : identifiant de chaque photo d'un album,
  // pour savoir quelles photos ont été ajoutées ou retirées sur Facebook
  // (synchronisation des annonces, db/synchro-facebook.js).
  const album = {
    complet: `,attachments{media_type,media,target{id},subattachments.limit(${PHOTOS_PAR_PAGE_ALBUM}){media,target{id}}}`,
    standard: ',attachments{media_type,media,target{id},subattachments{media,target{id}}}',
    aucun: ''
  }[niveauAlbums];
  return `${base}${album}&limit=20`;
}

/** Vrai quand l’erreur porte sur le champ `attachments` et lui seul. */
function erreurDAlbum(error) {
  return /attachments|subattachments/i.test(error?.message || '');
}

/** Vrai quand Graph refuse la syntaxe `.limit()` sur les sous-pièces. */
function erreurDeLimite(error) {
  return /limit|syntax|path component/i.test(error?.message || '');
}

/**
 * Photos d’album au-delà de la première page.
 *
 * Même avec `.limit(100)`, Graph reste libre de paginer : on suit donc
 * `paging.next` tant qu’il existe. Seules les URL de graph.facebook.com
 * sont suivies — le jeton part avec chaque appel, il ne doit aller nulle
 * part ailleurs. Un échec ici n’interrompt jamais la synchronisation : on
 * garde les photos déjà obtenues.
 */
async function completerAlbums(publications = []) {
  for (const publication of publications) {
    for (const piece of publication?.attachments?.data || []) {
      const sous = piece?.subattachments;
      if (!sous || !Array.isArray(sous.data)) continue;
      let suivante = sous.paging?.next;
      for (let page = 0; suivante && page < 10; page += 1) {
        let adresse;
        try { adresse = new URL(suivante); } catch { break; }
        if (adresse.hostname !== 'graph.facebook.com') break;
        // graphRequest préfixe déjà la version : on retire `/vXX.X/` du chemin.
        const chemin = adresse.pathname.replace(/^\/v\d+(?:\.\d+)?\//, '');
        try {
          const suite = await graphRequest(`${chemin}${adresse.search}`);
          if (Array.isArray(suite?.data)) sous.data.push(...suite.data);
          suivante = suite?.paging?.next;
        } catch (error) {
          console.warn(`[facebook] Album ${text(publication?.id, 80)} incomplet : ${text(error?.message, 160)}`);
          break;
        }
      }
    }
  }
  return publications;
}

async function recupererPublications() {
  const champs = champsPublications();

  if (edgePublications) return graphRequest(`${PAGE_ID}/${edgePublications}?${champs}`);

  try {
    const resultat = await graphRequest(`${PAGE_ID}/published_posts?${champs}`);
    edgePublications = 'published_posts';
    return resultat;
  } catch (error) {
    if (!/nonexisting field \(published_posts\)/i.test(error.message || '')) throw error;
    console.warn('[facebook] Page « New Pages Experience » : published_posts est indisponible, '
      + 'bascule définitive sur /feed pour cette instance.');
    const resultat = await graphRequest(`${PAGE_ID}/feed?${champs}`);
    edgePublications = 'feed';
    return resultat;
  }
}

async function getFacebookPosts() {
  for (;;) {
    try {
      const resultat = await recupererPublications();
      if (niveauAlbums !== 'aucun') await completerAlbums(resultat?.data);
      return resultat;
    } catch (error) {
      if (niveauAlbums === 'complet' && (erreurDAlbum(error) || erreurDeLimite(error))) {
        console.warn('[facebook] Sous-pièces par 100 refusées par Graph : '
          + 'repli sur la pagination par défaut.');
        niveauAlbums = 'standard';
        continue;
      }
      if (niveauAlbums === 'standard' && erreurDAlbum(error)) {
        console.warn('[facebook] Champ « attachments » refusé par Graph : '
          + 'repli sur full_picture seul. Les albums n’afficheront qu’une image.');
        niveauAlbums = 'aucun';
        continue;
      }
      throw error;
    }
  }
}

// ===========================================================================
// VIDÉOS DE LA PAGE (demande du 13/09/2026 : « toutes les vidéos de la Page »)
// ---------------------------------------------------------------------------
// Constat : la synchronisation ne lit que les 20 dernières publications ; les
// vidéos plus anciennes n'arrivaient jamais sur le site, et les Reels récents
// n'y étaient qu'une image fixe (le type de média était jeté à l'import).
//
// Deux sources :
//   · les publications : une publication vidéo porte `video` (id + adresse)
//     et se lit sur place ;
//   · les edges `videos` et `video_reels`, lus EN ENTIER (pagination suivie) :
//     toute vidéo qu'aucune publication ne porte devient une entrée « video_<id> ».
// La lecture passe par le lecteur Facebook intégré (plugins/video.php) : les
// adresses de fichier que renvoie Graph expirent au bout de quelques jours.
// ===========================================================================
const PREFIXE_VIDEO = 'video_';
const PAGES_VIDEOS_MAX = 30;

function adresseVideo(id) {
  return `https://www.facebook.com/watch/?v=${encodeURIComponent(id)}`;
}

/** Vidéo portée par une publication (Graph ou déjà normalisée), sinon null. */
function videoDuPost(post) {
  for (const piece of post?.attachments?.data || []) {
    const id = text(piece?.target?.id, 40);
    if (/video/i.test(String(piece?.media_type || '')) && /^\d+$/.test(id)) {
      const image = piece?.media?.image || {};
      return { id, url: adresseVideo(id), vertical: Number(image.height) > Number(image.width) };
    }
  }
  const deja = post?.video;
  const id = text(deja?.id, 40);
  return /^\d+$/.test(id) ? { id, url: adresseVideo(id), vertical: deja.vertical === true } : null;
}

/** Vidéo lue sur l'edge `videos` ou `video_reels` → entrée de publication. */
function videoEnPublication(video) {
  const id = text(video?.id, 40);
  if (!/^\d+$/.test(id)) return null;
  const vignettes = Array.isArray(video?.thumbnails?.data) ? video.thumbnails.data : [];
  const vignette = vignettes.find(v => v?.is_preferred) || vignettes.sort((a, b) => Number(b?.height || 0) - Number(a?.height || 0))[0];
  const image = vignette?.uri || video?.picture || '';
  const permalien = String(video?.permalink_url || '');
  return normalizeFacebookPost({
    id: `${PREFIXE_VIDEO}${id}`,
    message: [video?.title, video?.description].filter(Boolean).join('\n\n'),
    created_time: video?.created_time,
    permalink_url: permalien.startsWith('/') ? `https://www.facebook.com${permalien}` : permalien,
    full_picture: image,
    video: { id, vertical: Number(vignette?.height) > Number(vignette?.width) }
  });
}

/**
 * Toutes les vidéos de la Page. Renvoie { videos, complet } : `complet` est
 * faux si une lecture a échoué — on ne retire alors aucune vidéo du site.
 */
async function recupererVideos() {
  const champs = 'fields=id,title,description,created_time,permalink_url,picture,thumbnails{uri,height,width,is_preferred}&limit=50';
  const parId = new Map();
  let complet = true;
  for (const edge of ['videos', 'video_reels']) {
    let chemin = `${PAGE_ID}/${edge}?${champs}`;
    try {
      for (let page = 0; chemin && page < PAGES_VIDEOS_MAX; page += 1) {
        const reponse = await graphRequest(chemin);
        for (const video of reponse?.data || []) if (video?.id && !parId.has(String(video.id))) parId.set(String(video.id), video);
        const suivante = reponse?.paging?.next;
        chemin = null;
        if (suivante) {
          const adresse = new URL(suivante);
          // Le jeton part avec chaque appel : on ne suit que Graph.
          if (adresse.hostname === 'graph.facebook.com') chemin = `${adresse.pathname.replace(/^\/v\d+(?:\.\d+)?\//, '')}${adresse.search}`;
        }
      }
    } catch (error) {
      // Page sans Reels : l'edge n'existe pas, ce n'est pas un échec.
      if (edge === 'video_reels' && /nonexisting field|unknown path|does not exist/i.test(error.message || '')) continue;
      console.warn(`[facebook] Lecture des vidéos (${edge}) impossible : ${text(error.message, 160)}`);
      complet = false;
    }
  }
  return { videos: [...parId.values()], complet };
}

/**
 * Ajoute les vidéos à la liste des publications fusionnées.
 * `anciennes` : entrées « video_ » déjà connues, gardées si la lecture a échoué.
 */
function fusionnerVideos(publications, lecture, anciennes = []) {
  const portees = new Set(publications.map(post => post?.video?.id).filter(Boolean));
  const source = lecture?.complet
    ? lecture.videos.map(videoEnPublication).filter(Boolean)
    : anciennes;
  const ajoutees = source.filter(entree => entree?.video?.id && !portees.has(entree.video.id));
  const liste = [...publications, ...ajoutees]
    .sort((a, b) => new Date(b.created_time || 0) - new Date(a.created_time || 0));
  liste.removed = publications.removed;
  liste.skipped = publications.skipped;
  liste.degraded = publications.degraded;
  return liste;
}

function facebookConfig() {
  return {
    pageId: PAGE_ID || '100075922063365',
    pageUrl: 'https://web.facebook.com/profile.php?id=100075922063365',
    connected: Boolean(PAGE_ID && PAGE_TOKEN),
    webhookReady: Boolean(VERIFY_TOKEN && APP_SECRET),
    publicSiteReady: Boolean(PUBLIC_SITE_URL),
    publicSiteUrl: PUBLIC_SITE_URL,
    graphVersion: GRAPH_VERSION
  };
}

/**
 * Chemin d'image local que le site sert publiquement.
 *
 * La liste blanche ne couvrait que `assets/uploads/`, le dossier des envois
 * depuis le studio. Or les quatorze visuels historiques du catalogue vivent
 * dans `assets/images/` : toute fiche les utilisant faisait échouer la
 * publication Facebook sur un « Image invalide », alors que l'URL est aussi
 * publique que les autres. On accepte donc tout le dossier `assets/`, en
 * gardant les deux garde-fous qui comptent : aucun segment de remontée
 * (`..`) et une extension d’image connue — le but reste d’empêcher qu’un
 * chemin arbitraire soit transformé en URL publique et envoyé à Meta.
 */
const CHEMIN_ASSET_PUBLIC = /^assets(?:\/[A-Za-z0-9._-]+)+\.(?:jpe?g|png|webp|gif|avif)$/i;

function estAssetLocalPublic(chemin) {
  if (!CHEMIN_ASSET_PUBLIC.test(chemin)) return false;
  return !chemin.split('/').includes('..');
}

function cleanPublicUrl(value, label, allowLocalAsset = false) {
  const raw = text(value, 2000);
  if (!raw) return '';
  if (allowLocalAsset && estAssetLocalPublic(raw)) {
    if (!PUBLIC_SITE_URL) throw new Error(`Configurez PUBLIC_SITE_URL pour utiliser cette ${label} locale sur Facebook.`);
    return `${PUBLIC_SITE_URL}/${raw}`;
  }
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error(`${label} invalide.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} doit commencer par http:// ou https://.`);
  return parsed.toString();
}

// Variante tolérante de cleanPublicUrl : renvoie '' au lieu de lever.
// Indispensable pour la synchronisation entrante : une seule URL mal formée
// renvoyée par Graph ne doit jamais faire échouer tout le lot.
function safePublicUrl(value) {
  try { return cleanPublicUrl(value, 'Lien'); } catch { return ''; }
}

/**
 * Toutes les images d'une publication, dans l'ordre de l'album.
 *
 * `full_picture` ne renvoie qu'UN visuel — la vignette de couverture choisie
 * par Meta. Une publication de dix photos n'en montrait donc qu'une sur le
 * site. Les autres vivent dans `attachments.subattachments`, qu'il faut
 * demander explicitement à Graph.
 *
 * Pour un album, on prend les sous-pièces : la pièce parente porte souvent
 * une composition générée par Meta, pas la première photo d'origine.
 */
function facebookPostImages(post) {
  const urls = [];
  const vus = new Set();
  const ajouter = valeur => {
    const url = safePublicUrl(valeur);
    if (!url) return;
    // Meta sert la MÊME photo sous plusieurs URL : `full_picture` et
    // `attachments` portent des jetons et des tailles différents pour un
    // seul et même fichier. Comparer les chaînes entières laissait donc
    // passer des doublons — une publication à une photo en annonçait deux.
    // Le chemin, lui, identifie le fichier de façon stable.
    let cle = url;
    try { cle = new URL(url).pathname; } catch { /* on garde l’URL brute */ }
    if (vus.has(cle)) return;
    vus.add(cle);
    urls.push(url);
  };
  (post?.attachments?.data || []).forEach(piece => {
    const sousPieces = piece?.subattachments?.data || [];
    if (sousPieces.length) sousPieces.forEach(sous => ajouter(sous?.media?.image?.src));
    else ajouter(piece?.media?.image?.src);
  });
  // Repli : publication sans attachments, ou déjà stockée avant cette
  // évolution. La déduplication évite de compter deux fois la couverture.
  ajouter(post?.full_picture);
  if (Array.isArray(post?.images)) post.images.forEach(ajouter);
  // Plafond de sécurité seulement : un album Facebook dépasse rarement
  // quelques dizaines de photos, et la vue de détail doit les montrer toutes.
  return urls.slice(0, 80);
}

/**
 * Photos d'une publication avec leur identifiant Facebook, dans l'ordre de
 * l'album : [{ id, src }]. Vide quand Graph ne donne pas les identifiants
 * (repli sans pièces jointes) — la synchronisation ne conclut alors rien.
 */
function photosDuPost(post) {
  const photos = [];
  for (const piece of post?.attachments?.data || []) {
    const sousPieces = piece?.subattachments?.data || [];
    const pieces = sousPieces.length ? sousPieces : (/photo/i.test(String(piece?.media_type || '')) ? [piece] : []);
    for (const sous of pieces) {
      const id = text(sous?.target?.id, 40);
      const src = safePublicUrl(sous?.media?.image?.src);
      if (/^\d+$/.test(id) && src) photos.push({ id, src });
    }
  }
  if (photos.length) return photos.slice(0, 80);
  // Publication déjà normalisée (miroir) : ses photos sont conservées.
  return (Array.isArray(post?.photos) ? post.photos : [])
    .filter(photo => /^\d+$/.test(text(photo?.id, 40)) && safePublicUrl(photo?.src))
    .map(photo => ({ id: text(photo.id, 40), src: safePublicUrl(photo.src) })).slice(0, 80);
}

function normalizeFacebookPost(post) {
  const id = text(post?.id, 200);
  const permalink = safePublicUrl(post?.permalink_url);
  const picture = safePublicUrl(post?.full_picture);
  const dropped = [];
  if (post?.permalink_url && !permalink) dropped.push('permalink_url');
  if (post?.full_picture && !picture) dropped.push('full_picture');
  const images = facebookPostImages(post);
  const video = videoDuPost(post);
  const photos = photosDuPost(post);
  return {
    id,
    message: text(post?.message, 60000),
    created_time: text(post?.created_time, 80),
    permalink_url: permalink,
    // `full_picture` reste renseigné pour ne rien casser de ce qui le lit
    // déjà ; `images` porte la galerie entière.
    full_picture: picture || images[0] || '',
    images,
    ...(photos.length ? { photos } : {}),
    ...(video ? { video } : {}),
    ...(dropped.length ? { _droppedFields: dropped } : {})
  };
}

/**
 * Identifiants des publications que le studio a retirées du site.
 * Elles restent sur la Page Facebook et dans le studio : seule leur
 * présence sur le site public est en jeu.
 */
function publicationsMasquees() {
  const brut = readJSON(FB_MASQUEES_FILE, {});
  return new Set(Array.isArray(brut.ids) ? brut.ids.map(String) : []);
}

/**
 * Publications Facebook nées d'une fiche du site, par identifiant Facebook :
 * { kind, id } de la fiche d'origine.
 *
 * Point de l'audit du 13/09/2026 : une villa publiée automatiquement sur la
 * Page revenait sur le site dans « Depuis Facebook », fiche vide, en doublon
 * de sa propre carte. Le journal des publications porte l'origine : écrite
 * explicitement depuis cette date, déduite de la clé « auto:kind:id » pour
 * les publications automatiques antérieures.
 */
function originesPublications() {
  const origines = new Map();
  for (const entree of readJSON(FB_PUBLISH_FILE, [])) {
    if (!entree || entree.status !== 'publie' || !entree.facebookId) continue;
    const origine = origineEntree(entree);
    if (origine) origines.set(String(entree.facebookId), origine);
  }
  return origines;
}

/** Fiche d'origine d'une entrée du journal des publications, ou null. */
function origineEntree(entree) {
  let origine = entree.origine && typeof entree.origine === 'object' ? entree.origine : null;
  if (!origine) {
    const cle = /^auto:(villa|terrain|activity):(.+)$/.exec(String(entree.idempotencyKey || ''));
    if (cle) origine = { kind: cle[1], id: cle[2] };
  }
  return origine && ['villa', 'terrain', 'activity'].includes(origine.kind) && origine.id
    ? { kind: origine.kind, id: text(origine.id, 80) } : null;
}

/**
 * Publications du journal supprimées depuis sur la Page (identifiants Facebook).
 *
 * Déduction prudente, à partir du miroir des publications synchronisées :
 * absente du miroir ALORS QU'elle devrait y figurer, c'est-à-dire
 *   · publiée après la plus ancienne publication du miroir (sinon elle est
 *     simplement sortie de la fenêtre des publications récupérées),
 *   · et avant la dernière synchronisation réussie (sinon elle n'a pas
 *     encore été vérifiée : juste après l'envoi, elle n'est pas encore
 *     redescendue de Facebook).
 * Dans le doute, une publication est réputée toujours en ligne.
 */
function publicationsSupprimees() {
  const posts = readJSON(FB_POSTS_FILE, []);
  const dates = (Array.isArray(posts) ? posts : []).map(post => Date.parse(post?.created_time || '')).filter(Number.isFinite);
  const derniereSynchro = Date.parse(readJSON(FB_STATE_FILE, {}).lastSyncAt || '');
  const supprimees = new Set();
  if (!dates.length || !Number.isFinite(derniereSynchro)) return supprimees;
  const presentes = new Set(posts.map(post => String(post?.id || '')));
  const plusAncienne = Math.min(...dates);
  for (const entree of readJSON(FB_PUBLISH_FILE, [])) {
    if (!entree || entree.status !== 'publie' || !entree.facebookId) continue;
    const id = String(entree.facebookId);
    const publieeLe = Date.parse(entree.createdAt || '');
    if (presentes.has(id) || !Number.isFinite(publieeLe)) continue;
    // Marge d'une minute : l'horodatage du journal suit de quelques secondes
    // le `created_time` attribué par Facebook.
    if (publieeLe < plusAncienne + 60_000 || publieeLe >= derniereSynchro) continue;
    supprimees.add(id);
  }
  return supprimees;
}

/**
 * Fiches actuellement présentes sur la Page, par « kind:id » (demande du
 * 13/09/2026) : le studio garde leur case « Publier aussi sur Facebook »
 * cochée et verrouillée, et le serveur refuse de les republier. Supprimer la
 * publication sur Facebook libère la fiche à la synchronisation suivante.
 */
function fichesPubliees() {
  const supprimees = publicationsSupprimees();
  const permaliens = new Map(readJSON(FB_POSTS_FILE, []).map(post => [String(post?.id || ''), post?.permalink_url || '']));
  const fiches = new Map();
  // Journal du plus récent au plus ancien : la première entrée trouvée l'emporte.
  for (const entree of readJSON(FB_PUBLISH_FILE, [])) {
    if (!entree || entree.status !== 'publie' || !entree.facebookId) continue;
    const id = String(entree.facebookId);
    const origine = origineEntree(entree);
    if (!origine || supprimees.has(id)) continue;
    const cle = `${origine.kind}:${origine.id}`;
    if (!fiches.has(cle)) fiches.set(cle, { facebookId: id, publieeLe: entree.createdAt || null, lien: permaliens.get(id) || '' });
  }
  return fiches;
}

/** Affiche ou retire une publication du site. Renvoie le nouvel état. */
function definirVisibilitePublication(id, visible) {
  const identifiant = text(id, 200);
  if (!identifiant) throw new Error('Identifiant de publication manquant.');
  const masquees = publicationsMasquees();
  if (visible) masquees.delete(identifiant);
  else masquees.add(identifiant);
  writeJSON(FB_MASQUEES_FILE, { ids: [...masquees], updatedAt: new Date().toISOString() });
  return { id: identifiant, visible: !masquees.has(identifiant), masquees: masquees.size };
}

/**
 * FICHE DU BIEN d'une publication Facebook.
 *
 * Demande du 13/09/2026 : une publication ne dit ni sa localisation, ni sa
 * capacité, ni son tarif, et la recherche du site ne pouvait donc pas la
 * retenir. Le studio la complète avec les colonnes descriptives de la table
 * `villas` — mêmes noms, mêmes bornes que le formulaire d'une villa.
 *
 * Différence voulue avec une villa : tout est facultatif, et « vide » veut
 * dire « non renseigné ». Aucune valeur par défaut n'est inventée — une
 * capacité à 1 ou un cadre « terre ferme » feraient apparaître la
 * publication sous des critères qu'elle ne remplit pas.
 *
 * Stockage : colonnes de `facebook_posts` en base, miroir JSON pour le mode
 * fichiers et les lectures de secours. Les synchronisations Facebook ne
 * touchent jamais ni l'un ni l'autre.
 */
// Catégories, statuts, localisations, badges et équipements viennent des
// référentiels administrables (db/referentiels.js). Le cadre reste une liste
// fixe : il pilote le filtre « Emplacement » et le simulateur de devis.
const CADRES_FICHE = FICHES.CADRES;

function normaliserFichePublication(entree = {}, referentiels = REF.normaliserReferentiels(null)) {
  const source = entree && typeof entree === 'object' ? entree : {};
  const erreurs = [];
  const idsDe = type => referentiels[type].map(item => item.id);
  const CATEGORIES_FICHE = idsDe('categories');
  const STATUTS_FICHE = referentiels.statuts.filter(statut => statut.cible === 'villa').map(statut => statut.code);
  // Référence facultative : vide → aucune ; inconnue → erreur explicite.
  const reference = (champ, type, libelle) => {
    const valeur = text(source[champ], 80);
    if (!valeur) return '';
    if (idsDe(type).includes(valeur)) return valeur;
    erreurs.push(`${libelle} : « ${valeur} » ne figure pas dans le référentiel.`);
    return '';
  };

  const choix = (champ, valeurs, libelle) => {
    const valeur = text(source[champ], 80);
    if (!valeur) return '';
    if (valeurs.includes(valeur)) return valeur;
    erreurs.push(`${libelle} : valeur « ${valeur} » inconnue.`);
    return '';
  };
  // Entier facultatif : vide → null ; hors bornes ou décimal → erreur
  // explicite, jamais une valeur corrigée en silence.
  const entier = (champ, min, max, libelle) => {
    const brut = source[champ];
    if (brut === null || brut === undefined || String(brut).trim() === '') return null;
    const nombre = Number(brut);
    if (!Number.isInteger(nombre) || nombre < min || nombre > max) {
      erreurs.push(`${libelle} : nombre entier entre ${min} et ${max} attendu.`);
      return null;
    }
    return nombre;
  };
  const liste = (champ, max) => {
    const brut = Array.isArray(source[champ]) ? source[champ] : String(source[champ] ?? '').split('\n');
    return brut.map(valeur => text(valeur, 160)).filter(Boolean).slice(0, max);
  };

  const pricePerNight = entier('pricePerNight', 0, 100_000_000, 'Tarif par nuit');
  // Ancienne catégorie de lieu (lagune, océan, piscine), envoyée par un
  // studio resté ouvert : retirée sans erreur, le cadre et les équipements
  // la remplacent (décision du 13/09/2026).
  const category = REF.CATEGORIES_RESERVEES.includes(text(source.category, 80)) ? '' : choix('category', CATEGORIES_FICHE, 'Catégorie');
  const localisationId = reference('localisationId', 'localisations', 'Localisation');
  const localisationPrecision = text(source.localisationPrecision, 240);
  const badgeId = reference('badgeId', 'badges', 'Badge');
  const equipements = [];
  (Array.isArray(source.equipements) ? source.equipements : []).slice(0, 60).forEach(valeur => {
    const code = text(valeur, 80);
    if (!code || equipements.includes(code)) return;
    if (idsDe('equipements').includes(code)) equipements.push(code);
    else erreurs.push(`Équipement : « ${code} » ne figure pas dans le référentiel.`);
  });
  const fiche = {
    name: text(source.name, 160),
    tagline: text(source.tagline, 240),
    category,
    // Libellé tiré du référentiel, plus jamais saisi à part.
    categoryLabel: REF.libelleDe(REF.trouver(referentiels, 'categories', category)),
    environment: choix('environment', CADRES_FICHE, 'Cadre'),
    // Ville du référentiel + repère libre ; sans ville, texte d’origine.
    location: REF.composerLocalisation(referentiels, localisationId, localisationPrecision, localisationId ? '' : text(source.location, 240)),
    localisationId,
    localisationPrecision,
    pricePerNight,
    // Valeur dérivée, comme pour les villas : jamais saisie.
    priceEuro: pricePerNight === null ? null : Math.round(pricePerNight / 655.957),
    weekendPackage: entier('weekendPackage', 0, 100_000_000, 'Forfait week-end'),
    capacity: entier('capacity', 1, 100, 'Capacité'),
    bedrooms: entier('bedrooms', 1, 50, 'Chambres'),
    bathrooms: entier('bathrooms', 1, 50, 'Salles de bain'),
    beds: text(source.beds, 160),
    status: choix('status', STATUTS_FICHE, 'Statut'),
    // Sans badge rattaché : texte d’origine seulement si la saisie ne dit rien
    // du badge (fiche antérieure aux référentiels) ; « aucun badge » sinon.
    badge: badgeId
      ? REF.libelleDe(REF.trouver(referentiels, 'badges', badgeId))
      : (source.badgeId === undefined ? text(source.badge, 80) : ''),
    badgeId,
    featured: source.featured === true || source.featured === 'yes' || source.featured === 'true',
    features: liste('features', 40),
    equipements,
    highlights: liste('highlights', 20)
  };
  return { fiche, erreurs };
}

/** Fiches du miroir JSON, par identifiant de publication. */
function fichesPublicationsFichier(referentiels) {
  const brut = readJSON(FB_FICHES_FILE, {});
  const fiches = brut && typeof brut.fiches === 'object' && brut.fiches ? brut.fiches : {};
  return new Map(Object.entries(fiches).map(([id, fiche]) => [String(id), normaliserFichePublication(fiche, referentiels).fiche]));
}

/**
 * Retire la fiche des publications avant de les recopier dans le contenu du
 * site : la fiche n'a qu'une source de vérité (la base, ou son miroir), et
 * une copie figée dans site-content.json finirait par la contredire.
 */
function publicationsSansFiche(posts) {
  return posts.map(post => {
    if (!post || typeof post !== 'object') return post;
    const { fiche, ...reste } = post;
    return reste;
  });
}

function mergeFacebookPosts(incoming, existing = []) {
  const byId = new Map();
  let skipped = 0;
  const degraded = [];
  [...incoming, ...existing].forEach(post => {
    let normalized;
    try { normalized = normalizeFacebookPost(post); }
    catch { skipped += 1; return; }
    if (!normalized.id) { skipped += 1; return; }
    if (normalized._droppedFields) degraded.push(normalized.id);
    delete normalized._droppedFields;
    if (!byId.has(normalized.id)) byId.set(normalized.id, normalized);
  });
  // ---- Purge des publications supprimées sur la Page ----
  // Sans cela, une publication retirée de Facebook restait affichée sur le
  // site indéfiniment : la fusion ne faisait qu’ajouter. On ne peut pas pour
  // autant vider ce qui manque, car Graph ne renvoie que les vingt plus
  // récentes — les anciennes seraient balayées à chaque synchronisation.
  // La règle sûre : dans la FENÊTRE couverte par la réponse (depuis la plus
  // ancienne publication reçue), ce qui n’y figure plus a été supprimé.
  const idsRecus = new Set();
  let bordFenetre = null;
  incoming.forEach(post => {
    const id = text(post?.id, 200);
    if (!id) return;
    idsRecus.add(id);
    const instant = new Date(post?.created_time || 0).getTime();
    if (Number.isFinite(instant) && instant > 0 && (bordFenetre === null || instant < bordFenetre)) {
      bordFenetre = instant;
    }
  });

  const survivantes = [...byId.values()].filter(post => {
    if (!idsRecus.size || bordFenetre === null) return true;   // rien reçu : on ne purge rien
    if (idsRecus.has(post.id)) return true;
    const instant = new Date(post.created_time || 0).getTime();
    if (!Number.isFinite(instant) || instant <= 0) return true; // date inconnue : dans le doute, on garde
    return instant < bordFenetre;                               // plus ancienne que la fenêtre : hors de portée
  });

  const posts = survivantes
    .sort((a, b) => new Date(b.created_time || 0) - new Date(a.created_time || 0))
    .slice(0, 50);
  posts.removed = byId.size - survivantes.length;
  posts.skipped = skipped;
  posts.degraded = degraded;
  return posts;
}

function updateFacebookState(patch) {
  const state = { status: 'non-configure', lastSyncAt: null, lastWebhookAt: null, lastPublishAt: null, lastError: null, ...readJSON(FB_STATE_FILE, {}), ...patch };
  writeJSON(FB_STATE_FILE, state);
  return state;
}

let facebookSyncPromise = null;
async function syncFacebookPosts(reason = 'manuel') {
  // Verrou n°1 : en mémoire. Suffisant en mono-processus (node server.js),
  // INOPÉRANT dès que Passenger lance plusieurs instances.
  if (facebookSyncPromise) return facebookSyncPromise;
  facebookSyncPromise = (async () => {
    const config = facebookConfig();
    if (!config.connected) throw new Error('Connexion Meta non configurée');

    // Verrou n°2 : en base, partagé par toutes les instances du processus.
    // Actif uniquement quand MySQL est branché.
    let heldLock = false;
    if (dbEnabled()) {
      heldLock = await tryDb('verrou de synchronisation', repo => repo.acquireLock('facebook_sync', 180), false);
      if (!heldLock) {
        // Une autre instance synchronise déjà : on ne double pas les appels Graph.
        audit('facebook.sync_skipped', { reason, cause: 'verrou-detenu-ailleurs' });
        return { posts: readJSON(FB_POSTS_FILE, []), state: readJSON(FB_STATE_FILE, {}) };
      }
    }
    try {
      return await runFacebookSync(reason);
    } finally {
      if (heldLock) await tryDb('libération du verrou', repo => repo.releaseLock('facebook_sync'));
    }
  })().finally(() => { facebookSyncPromise = null; });
  return facebookSyncPromise;
}

async function runFacebookSync(reason) {
  updateFacebookState({ status: 'synchronisation', lastError: null });
  {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await getFacebookPosts();
        const miroir = readJSON(FB_POSTS_FILE, []);
        const estEntreeVideo = post => String(post?.id || '').startsWith(PREFIXE_VIDEO);
        // Les entrées « video_ » ne passent pas par la purge par fenêtre : elles
        // ne figurent jamais dans la réponse des publications.
        const publications = mergeFacebookPosts(result.data || [], miroir.filter(post => !estEntreeVideo(post)));
        const lectureVideos = await recupererVideos().catch(error => {
          console.warn(`[facebook] Vidéos non lues : ${text(error.message, 160)}`);
          return { videos: [], complet: false };
        });
        const posts = fusionnerVideos(publications, lectureVideos, miroir.filter(estEntreeVideo));
        writeJSON(FB_POSTS_FILE, posts);
        // En base, la clé primaire = id Facebook : la déduplication est garantie
        // par le moteur, pas seulement par mergeFacebookPosts().
        await tryDb('import des publications Facebook', repo => repo.upsertFacebookPosts(posts));
        // Puis on retire de la base ce que la Page n'expose plus : sans cela
        // une publication supprimée sur Facebook restait affichée sur le site,
        // car /api/content lit la base et non le miroir JSON. La fenêtre est
        // celle des PUBLICATIONS : les vidéos anciennes ne doivent pas l'élargir.
        const retirees = await tryDb('retrait des publications supprimées',
          repo => repo.pruneFacebookPosts(posts, { fenetre: publications }), 0);
        if (retirees) audit('facebook.posts_pruned', { count: retirees, reason });
        // Vidéos : lues en entier, donc toute entrée « video_ » absente a été
        // supprimée de la Page. Seulement si la lecture est complète.
        if (lectureVideos.complet) {
          const videosRetirees = await tryDb('retrait des vidéos supprimées',
            repo => repo.pruneFacebookVideos(posts.filter(estEntreeVideo).map(post => post.id)), 0);
          if (videosRetirees) audit('facebook.videos_pruned', { count: videosRetirees, reason });
        }
        const content = readJSON(CONTENT_FILE, {});
        // Miroir de secours du site : 20 dernières publications + toutes les vidéos.
        content.facebookPosts = posts.filter((post, rang) => rang < 20 || post.video);
        content.facebookUpdatedAt = new Date().toISOString();
        writeJSON(CONTENT_FILE, content);
        // Facebook → site : texte et photos modifiés sur la publication d'une
        // annonce reportés sur l'annonce. Isolé : un échec ici ne fait pas
        // repasser toute la synchronisation.
        const versSite = await appliquerFacebookVersSite(posts)
          .catch(error => ({ annonces: [], references: 0, erreurs: [text(error.message, 300)] }));
        const state = updateFacebookState({
          status: 'connecte', lastSyncAt: content.facebookUpdatedAt, lastSyncReason: reason,
          lastError: null, postCount: posts.length,
          lastSkippedPosts: posts.skipped || 0, lastDegradedPosts: (posts.degraded || []).length,
          lastAnnoncesDepuisFacebook: versSite.annonces.length, lastErreursAnnonces: versSite.erreurs
        });
        audit('facebook.synced', { reason, count: posts.length, attempt, skipped: posts.skipped || 0, degraded: (posts.degraded || []).length,
          videos: posts.filter(post => post.video).length, videosCompletes: lectureVideos.complet,
          annoncesDepuisFacebook: versSite.annonces.length, erreursAnnonces: versSite.erreurs.length });
        notifierNouveautesApp('facebook').catch(() => {});
        return { posts, state, annonces: versSite.annonces };
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 350));
      }
    }
    const message = text(lastError?.message || 'Synchronisation Facebook impossible', 500);
    updateFacebookState({ status: 'erreur', lastError: message, lastErrorAt: new Date().toISOString() });
    audit('facebook.sync_failed', { reason, error: message });
    throw lastError;
  }
}


// ===========================================================================
// ENVOI DES VISUELS À META — octets plutôt qu'URL
// ---------------------------------------------------------------------------
// Constaté en production le 12/09/2026 : aucune publication n'avait jamais
// abouti (`lastPublishAt` resté à null). En passant une URL à Graph, c'est
// Meta qui vient télécharger l'image sur le site — et le pare-feu de
// l'hébergeur refuse son robot (« identifying as from a known bot but is not
// received from the correct network »). Résultat côté Graph : « Missing or
// invalid image file ».
//
// On inverse donc le sens : pour un visuel qui vit sur le disque du serveur,
// on POSTe directement les octets en multipart. Meta n'a plus rien à venir
// chercher, et la règle anti-robots de l'hébergeur devient sans effet. Les
// URL externes (déjà publiques ailleurs) continuent d'être passées telles
// quelles, il n'y a rien à téléverser.
// ===========================================================================

// Meta plafonne les photos ; au-delà on préfère un message clair à un envoi
// qui échouerait après avoir chargé plusieurs mégaoctets en mémoire.
const TAILLE_MAX_PHOTO = 8 * 1024 * 1024;

/**
 * Décrit un visuel pour Meta : soit un fichier local à téléverser, soit une
 * URL publique à lui faire lire. Lève si la valeur n'est ni l'un ni l'autre.
 */
function resoudreVisuel(valeur) {
  const brut = text(valeur, 2000);
  if (!brut) return null;

  if (estAssetLocalPublic(brut)) {
    const chemin = path.join(ROOT, brut);
    // Ceinture et bretelles : `estAssetLocalPublic` interdit déjà « .. », on
    // vérifie malgré tout que le chemin résolu ne quitte pas la racine.
    if (chemin.startsWith(path.join(ROOT, 'assets')) && fs.existsSync(chemin)) {
      const taille = fs.statSync(chemin).size;
      if (taille > TAILLE_MAX_PHOTO) {
        throw new Error(`Image trop lourde pour Facebook (${Math.round(taille / 1024 / 1024)} Mo, maximum 8 Mo) : ${brut}`);
      }
      return {
        fichier: chemin,
        nom: path.basename(chemin),
        type: MIME[path.extname(chemin).toLowerCase()] || 'image/jpeg'
      };
    }
  }

  // Repli : URL publique (externe, ou fichier local absent du disque).
  return { url: cleanPublicUrl(brut, 'Image', true) };
}

/**
 * Publie une photo sur la Page.
 * @param {object} visuel issu de resoudreVisuel
 * @param {{publie: boolean, legende?: string}} options
 */
async function envoyerPhoto(visuel, { publie, legende }) {
  if (visuel.fichier) {
    const donnees = new FormData();
    donnees.set('published', publie ? 'true' : 'false');
    if (legende) donnees.set('caption', legende);
    const octets = await fs.promises.readFile(visuel.fichier);
    donnees.set('source', new Blob([octets], { type: visuel.type }), visuel.nom);
    // Pas d'en-tête Content-Type explicite : fetch pose lui-même la frontière
    // multipart, qu'on ne peut pas deviner.
    return graphRequest(`${PAGE_ID}/photos`, { method: 'POST', body: donnees, timeoutMs: GRAPH_UPLOAD_TIMEOUT_MS });
  }

  const params = new URLSearchParams({ url: visuel.url, published: publie ? 'true' : 'false' });
  if (legende) params.set('caption', legende);
  return graphRequest(`${PAGE_ID}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
}

/**
 * Envoi final d'une publication (non idempotent chez Meta).
 *
 * Un délai dépassé ne prouve pas l'échec : le 13/09/2026, Graph a créé la
 * publication à la 10e seconde puis n'a jamais répondu. Le site a noté un
 * échec, la publication n'a pas été rattachée à sa fiche et est revenue sur le
 * site dans « Depuis Facebook ». Avant de conclure, on cherche donc parmi les
 * dernières publications de la Page celle qui porte ce texte.
 */
async function publierSansDoublon(envoi, message, debutMs) {
  try {
    return await envoi();
  } catch (error) {
    if (!/n'a pas répondu/.test(error.message || '')) throw error;
    for (const attente of [0, 5000]) {
      if (attente) await new Promise(resolve => setTimeout(resolve, attente));
      const trouvee = await retrouverPublicationRecente(message, debutMs);
      if (trouvee) {
        audit('facebook.publish_recovered', { facebookId: trouvee.id, cause: text(error.message, 120) });
        return { id: trouvee.id, post_id: trouvee.id, recovered: true };
      }
    }
    throw error;
  }
}

async function retrouverPublicationRecente(message, depuisMs) {
  // Début du texte seulement : la publication porte aussi le lien ajouté en fin.
  const cle = valeur => String(valeur || '').replace(/\s+/g, ' ').trim();
  const attendu = cle(message).slice(0, 80);
  if (!attendu) return null;
  const champs = 'fields=id,message,created_time&limit=10';
  const lire = edge => graphRequest(`${PAGE_ID}/${edge}?${champs}`);
  try {
    let resultat;
    try { resultat = await lire(edgePublications || 'published_posts'); }
    catch (error) {
      if (!/nonexisting field \(published_posts\)/i.test(error.message || '')) throw error;
      resultat = await lire('feed');
    }
    return (resultat?.data || []).find(post =>
      cle(post.message).startsWith(attendu) && Date.parse(post.created_time) >= depuisMs - 60_000) || null;
  } catch (error) {
    console.warn(`[facebook] Vérification après délai dépassé impossible : ${text(error.message, 160)}`);
    return null;
  }
}

async function publishFacebookPost(payload) {
  const message = text(payload.message, 60000);
  if (!message) throw new Error('Le texte de la publication est requis');
  const link = cleanPublicUrl(payload.link, 'Lien associé');

  // Une ou plusieurs images. `imageUrl` (singulier) reste accepté : il est
  // employé par le partage automatique depuis le catalogue, qui n'envoie
  // jamais qu'un visuel. Plafond à 10, limite d'un post multi-photos chez Meta.
  const imagesBrutes = Array.isArray(payload.imageUrls) && payload.imageUrls.length
    ? payload.imageUrls
    : [payload.imageUrl];
  const visuels = imagesBrutes
    .map(resoudreVisuel)
    .filter(Boolean)
    .slice(0, 10);
  // Valeurs telles que saisies sur le site (« assets/uploads/… »), rang pour
  // rang avec `visuels` : resoudreVisuel n'écarte que les valeurs vides.
  const sourcesVisuels = imagesBrutes.map(valeur => text(valeur, 2000)).filter(Boolean).slice(0, 10);
  // Conservé pour la clé d’idempotence et le journal : la valeur d’origine
  // identifie la publication aussi bien qu’une URL, fichier local compris.
  const imageUrls = visuels.map(v => v.url || v.fichier);
  const imageUrl = imageUrls[0] || '';

  const idempotencyKey = text(payload.idempotencyKey, 160)
    || crypto.createHash('sha256').update(JSON.stringify({ message, link, imageUrls })).digest('hex');
  // Fiche du site à l'origine de la publication (partage manuel ou
  // automatique) : voir originesPublications.
  const origine = payload.origine && ['villa', 'terrain', 'activity'].includes(payload.origine.kind) && text(payload.origine.id, 80)
    ? { kind: payload.origine.kind, id: text(payload.origine.id, 80) } : null;
  const history = readJSON(FB_PUBLISH_FILE, []);
  // Une publication supprimée depuis sur la Page ne bloque plus : sans cela,
  // republier une fiche inchangée (même clé) rendait « doublon » sans rien
  // envoyer, et la fiche restait absente de Facebook.
  const supprimees = publicationsSupprimees();
  const previous = history.find(entry => entry.idempotencyKey === idempotencyKey && entry.status === 'publie'
    && !supprimees.has(String(entry.facebookId)));
  if (previous) {
    if (origine && !previous.origine) { previous.origine = origine; writeJSON(FB_PUBLISH_FILE, history); }
    return { id: previous.facebookId, duplicate: true, publishedAt: previous.createdAt };
  }

  // Réservation de la clé en base : l'index UNIQUE sur `idempotency_key`
  // garantit qu'une seule instance Passenger enverra réellement la publication,
  // là où le fichier JSON ne protège que le processus courant.
  if (dbEnabled()) {
    const claim = await tryDb('réservation de la clé de publication',
      repo => repo.claimPublishKey(idempotencyKey, { hasImage: Boolean(imageUrl), hasLink: Boolean(link) }), null);
    if (claim && claim.fresh === false) {
      const entry = claim.entry || {};
      if (entry.status === 'publie' && !supprimees.has(String(entry.facebook_id))) {
        return { id: entry.facebook_id, duplicate: true, publishedAt: entry.created_at || null };
      }
      // 'en-cours' : une autre instance est en train de publier ce contenu.
      if (entry.status === 'en-cours') {
        return { id: null, duplicate: true, pending: true, publishedAt: null };
      }
    }
  }

  let result;
  // Photos parties sur la Page, avec leur identifiant Facebook et leur valeur
  // d'origine sur le site : référence de la synchronisation des annonces.
  const photosEnvoyees = [];
  const debutEnvoi = Date.now();
  try {
    if (visuels.length >= 1) {
      // Album : Meta n'accepte pas plusieurs images en un seul appel. On
      // téléverse chaque photo SANS la publier (published=false) — elle reste
      // invisible sur la Page — puis un unique post les rassemble via
      // attached_media. Le visiteur voit une publication, pas une rafale.
      // Une photo seule suit le même chemin depuis le 17/09/2026 : le texte
      // d'une publication photo simple (légende) ne se modifie pas par Graph,
      // celui d'une publication du fil, si.
      const identifiants = [];
      for (const [index, visuel] of visuels.entries()) {
        const photo = await envoyerPhoto(visuel, { publie: false });
        const id = text(photo.id, 200);
        if (id) {
          identifiants.push(id);
          photosEnvoyees.push({ fbId: id, local: sourcesVisuels[index] || null });
        }
      }
      if (!identifiants.length) throw new Error('Aucune image n’a pu être téléversée sur Facebook.');

      // Le lien va dans le TEXTE, jamais en paramètre `link` : avec `link`,
      // Graph crée une publication de lien et ignore attached_media. Constaté
      // en production le 13/09/2026 : villa à 5 photos publiée avec la seule
      // vignette d'aperçu du lien. Facebook rend l'adresse cliquable.
      const params = new URLSearchParams({ message: [message, link].filter(Boolean).join('\n\n') });
      identifiants.forEach((id, index) => {
        params.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
      });
      result = await publierSansDoublon(() => graphRequest(`${PAGE_ID}/feed`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
        timeoutMs: GRAPH_UPLOAD_TIMEOUT_MS
      }), message, debutEnvoi);
    } else {
      const params = new URLSearchParams({ message });
      if (link) params.set('link', link);
      result = await publierSansDoublon(() => graphRequest(`${PAGE_ID}/feed`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
        timeoutMs: GRAPH_UPLOAD_TIMEOUT_MS
      }), message, debutEnvoi);
    }
  } catch (error) {
    // L'échec libère la clé réservée : une nouvelle tentative reste possible.
    await tryDb('libération de la clé de publication', repo => repo.failPublish(idempotencyKey, error.message));
    throw error;
  }
  const createdAt = new Date().toISOString();
  await tryDb('clôture de la publication', repo => repo.completePublish(idempotencyKey, result.post_id || result.id));
  history.unshift({ idempotencyKey, facebookId: text(result.post_id || result.id, 200), status: 'publie', createdAt, hasImage: Boolean(imageUrl), imageCount: imageUrls.length, hasLink: Boolean(link), ...(origine ? { origine } : {}) });
  writeJSON(FB_PUBLISH_FILE, history.slice(0, 300));
  updateFacebookState({ status: 'connecte', lastPublishAt: createdAt, lastError: null });
  audit('facebook.published', { facebookId: result.post_id || result.id, images: imageUrls.length, hasLink: Boolean(link) });
  return { ...result, duplicate: false, publishedAt: createdAt, photos: photosEnvoyees };
}

function facebookImportedIds() {
  return new Set(readJSON(FB_POSTS_FILE, []).map(post => String(post?.id || '')).filter(Boolean));
}

/**
 * Titre d'annonce pour Facebook : MAJUSCULES et gras (décision du 13/09/2026).
 * Facebook n'interprète ni HTML ni Markdown ; le seul gras qui s'affiche
 * partout, ce sont les lettres « Mathematical Sans-Serif Bold » d'Unicode.
 * Les accents n'y existent pas précomposés : la lettre est décomposée (NFD)
 * et l'accent combinant posé sur la lettre grasse (É → 𝗘́).
 * Copie identique dans js/admin.js (test d'égalité dans les tests).
 */
function titreFacebook(texte) {
  return String(texte || '').toLocaleUpperCase('fr-FR').normalize('NFD').replace(/[A-Z0-9]/g, lettre => {
    const code = lettre.charCodeAt(0);
    return String.fromCodePoint(code <= 57 ? 0x1D7EC + code - 48 : 0x1D5D4 + code - 65);
  });
}

function buildShareMessage(item, kind) {
  if (kind === 'terrain') {
    const price = Number(item.priceTotal || 0).toLocaleString('fr-FR');
    const perSqm = Number(item.pricePerSqm || 0).toLocaleString('fr-FR');
    return [
      titreFacebook(`${item.reference ? `${item.reference} — ` : ''}${item.title}`),
      item.location,
      `${Number(item.areaSqm || 0).toLocaleString('fr-FR')} m² · ${price} FCFA (${perSqm} FCFA/m²)`,
      item.landStatusLabel ? `Statut foncier : ${item.landStatusLabel}` : '',
      item.description
    ].filter(Boolean).join('\n\n').slice(0, 60000);
  }
  // Villas et activités : titre et description seulement, jamais de prix
  // (décision du propriétaire, 13/09/2026). Les terrains, eux, gardent toute
  // leur fiche, prix compris. L'accroche ne sert que si la description manque.
  if (kind === 'villa') {
    return [titreFacebook(item.name), item.description || item.tagline]
      .filter(Boolean).join('\n\n').slice(0, 60000);
  }
  return [titreFacebook(item.title), item.description || item.subtitle]
    .filter(Boolean).join('\n\n').slice(0, 60000);
}

// ===========================================================================
// ANNONCES DU SITE ⇄ PUBLICATIONS FACEBOOK (décisions du 17/09/2026)
// ---------------------------------------------------------------------------
// Une annonce part sur la Page SI ET SEULEMENT SI sa case « Publier sur
// Facebook » est cochée. Décocher la case, suspendre, archiver ou supprimer
// l'annonce supprime sa publication. Une annonce publiée reste synchronisée
// dans les deux sens, texte et photos. Logique pure : db/synchro-facebook.js.
//
// Remplace le partage « à la prochaine publication » (case à usage unique,
// verrouillée ensuite) et le relais automatique des nouvelles fiches (réglage
// facebookAutoPublish), qui publiait aussi les annonces dont la case n'était
// pas cochée.
// ===========================================================================
const visuelsFiche = SYNC.visuelsFiche;
const PAGES_ANNONCES = { villa: 'residences.html', terrain: 'terrains.html', activity: 'loisirs.html' };
// Envois lourds (photos à téléverser) par publication du contenu : une
// importation massive ne sature ni la Page ni le quota Graph. Le reste part à
// la publication suivante ; retraits et textes ne sont pas plafonnés.
const FB_ENVOIS_MAX_PAR_PUBLICATION = 5;

function lienAnnonce(kind) {
  return PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/${PAGES_ANNONCES[kind]}` : '';
}

function nomAnnonce(item) {
  return text(item?.name || item?.title || item?.id, 160);
}

/** Garde anti-boucle : une fiche née d'une publication Facebook n'y retourne jamais. */
function annonceImportee(item, importees = facebookImportedIds()) {
  return item?.source === 'facebook' || Boolean(item?.facebookOriginId && importees.has(String(item.facebookOriginId)));
}

/** facebookId → { kind, id, message, photos: [{ fbId, local }], majLe }. */
function lireReferencesFacebook() {
  const brut = readJSON(FB_SYNCHRO_FILE, {});
  return brut && brut.references && typeof brut.references === 'object' ? brut.references : {};
}

function ecrireReferencesFacebook(modifier) {
  const references = lireReferencesFacebook();
  modifier(references);
  writeJSON(FB_SYNCHRO_FILE, { references, updatedAt: new Date().toISOString() });
  return references;
}

function planFacebook(contenu, precedent) {
  const importees = facebookImportedIds();
  return SYNC.planVersFacebook({
    contenu, precedent, publiees: fichesPubliees(), references: lireReferencesFacebook(),
    message: buildShareMessage, importee: item => annonceImportee(item, importees), siteUrl: PUBLIC_SITE_URL
  });
}

/** Plan lisible pour la confirmation du studio. */
function resumePlanFacebook(plan) {
  const noms = type => plan.filter(action => action.type === type).map(action => nomAnnonce(action.item));
  return {
    publier: noms('publier'), photos: noms('photos'), texte: noms('texte'),
    retirer: plan.filter(action => action.type === 'retirer').map(action => ({ nom: nomAnnonce(action.item), raison: action.raison }))
  };
}

/** Publication retirée de la Page : le journal ne la compte plus comme en ligne. */
function marquerPublicationRetiree(facebookId, raison) {
  const journal = readJSON(FB_PUBLISH_FILE, []);
  let modifie = false;
  for (const entree of Array.isArray(journal) ? journal : []) {
    if (entree && String(entree.facebookId) === String(facebookId) && entree.status === 'publie') {
      Object.assign(entree, { status: 'retire', retireLe: new Date().toISOString(), raisonRetrait: raison });
      modifie = true;
    }
  }
  if (modifie) writeJSON(FB_PUBLISH_FILE, journal);
}

async function retirerPublicationFacebook(facebookId, raison) {
  try {
    await graphRequest(encodeURIComponent(facebookId), { method: 'DELETE' });
  } catch (error) {
    // Déjà supprimée à la main sur la Page : le but est atteint.
    if (!/does not exist/i.test(error.message || '')) throw error;
  }
  marquerPublicationRetiree(facebookId, raison);
  ecrireReferencesFacebook(references => { delete references[facebookId]; });
  const posts = readJSON(FB_POSTS_FILE, []);
  if (Array.isArray(posts) && posts.some(post => String(post?.id) === String(facebookId))) {
    writeJSON(FB_POSTS_FILE, posts.filter(post => String(post?.id) !== String(facebookId)));
  }
  await tryDb('retrait d’une publication', repo => repo.deleteFacebookPost(facebookId));
  audit('facebook.publication_retiree', { facebookId, raison });
}

async function publierAnnonceFacebook(kind, item) {
  const message = buildShareMessage(item, kind);
  const link = lienAnnonce(kind);
  const imageUrls = visuelsFiche(item);
  // Une annonce retirée puis recochée repart : le rang de publication entre
  // dans la clé, sinon l'envoi précédent la ferait passer pour un doublon.
  const rang = readJSON(FB_PUBLISH_FILE, []).filter(entree => {
    const origine = entree?.status === 'retire' ? origineEntree(entree) : null;
    return origine && origine.kind === kind && origine.id === item.id;
  }).length;
  const idempotencyKey = crypto.createHash('sha256')
    .update(JSON.stringify({ kind, id: item.id, message, link, imageUrls, rang })).digest('hex');
  const resultat = await publishFacebookPost({ message, link, imageUrls, idempotencyKey, origine: { kind, id: item.id } });
  // post_id d'abord : pour une photo, `id` désigne la photo, pas la publication.
  const facebookId = text(resultat.post_id || resultat.id, 200);
  if (facebookId && !resultat.duplicate) {
    ecrireReferencesFacebook(references => {
      references[facebookId] = { kind, id: item.id, ...SYNC.referenceApresEnvoi(message, resultat.photos, PUBLIC_SITE_URL), majLe: new Date().toISOString() };
    });
  }
  return { facebookId, duplicate: Boolean(resultat.duplicate) };
}

async function modifierTexteFacebook(facebookId, kind, item) {
  const message = buildShareMessage(item, kind);
  const complet = [message, lienAnnonce(kind)].filter(Boolean).join('\n\n');
  await graphRequest(encodeURIComponent(facebookId), {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: complet })
  });
  ecrireReferencesFacebook(references => {
    if (!references[facebookId]) return;
    references[facebookId].message = SYNC.texteDeReference(message, PUBLIC_SITE_URL);
    references[facebookId].majLe = new Date().toISOString();
  });
  // Le studio montre aussitôt le nouveau texte, sans attendre la synchronisation.
  const posts = readJSON(FB_POSTS_FILE, []);
  const post = Array.isArray(posts) ? posts.find(entree => String(entree?.id) === String(facebookId)) : null;
  if (post) { post.message = complet; writeJSON(FB_POSTS_FILE, posts); }
  audit('facebook.texte_modifie', { facebookId, kind, id: item.id });
}

/**
 * Site → Facebook, après l'enregistrement du contenu : publie, retire,
 * met à jour le texte ou republie (photos changées) selon le plan. Un échec
 * Facebook ne fait jamais échouer l'enregistrement : le site prime sur la Page.
 */
async function synchroniserAnnoncesVersFacebook(contenu, precedent) {
  const bilan = { publiees: [], republiees: [], textes: [], retirees: [], enAttente: [], erreurs: [] };
  const plan = planFacebook(contenu, precedent);
  if (!plan.length) return bilan;
  if (!facebookConfig().connected) {
    bilan.erreurs.push('Connexion Meta non configurée : Facebook n’a pas été mis à jour.');
    return bilan;
  }
  let envoisLourds = 0;
  for (const action of plan) {
    const nom = nomAnnonce(action.item);
    try {
      if (action.type === 'retirer') {
        await retirerPublicationFacebook(action.facebookId, action.raison);
        bilan.retirees.push(nom);
      } else if (action.type === 'texte') {
        await modifierTexteFacebook(action.facebookId, action.kind, action.item);
        bilan.textes.push(nom);
      } else {
        if (envoisLourds >= FB_ENVOIS_MAX_PAR_PUBLICATION) { bilan.enAttente.push(nom); continue; }
        envoisLourds += 1;
        // Graph ne change pas les photos d'une publication : on la remplace.
        if (action.type === 'photos') await retirerPublicationFacebook(action.facebookId, 'photos-modifiees');
        await publierAnnonceFacebook(action.kind, action.item);
        (action.type === 'photos' ? bilan.republiees : bilan.publiees).push(nom);
      }
    } catch (error) {
      bilan.erreurs.push(`${nom} : ${text(error.message, 300)}`);
    }
  }
  if (bilan.publiees.length || bilan.republiees.length) syncFacebookPosts('apres-publication-contenu').catch(() => {});
  audit('facebook.annonces_synchronisees', {
    publiees: bilan.publiees.length, republiees: bilan.republiees.length, textes: bilan.textes.length,
    retirees: bilan.retirees.length, enAttente: bilan.enAttente.length, erreurs: bilan.erreurs.length
  });
  return bilan;
}

/**
 * Photo ajoutée sur Facebook → fichier du site. Les adresses fbcdn expirent au
 * bout de quelques jours : une annonce ne peut pas en dépendre.
 */
async function telechargerPhotoFacebook(photo) {
  const identifiant = text(photo?.fbId, 40).replace(/\D/g, '');
  if (!identifiant) throw new Error('Photo Facebook sans identifiant.');
  const base = `facebook-${identifiant}`;
  for (const extension of ['.jpg', '.png', '.webp']) {
    if (fs.existsSync(path.join(UPLOAD_DIR, `${base}${extension}`))) return `assets/uploads/${base}${extension}`;
  }
  let adresse;
  try { adresse = new URL(photo.src); } catch { throw new Error('Adresse de photo Facebook invalide.'); }
  if (adresse.protocol !== 'https:' || !/(^|\.)(fbcdn\.net|facebook\.com)$/i.test(adresse.hostname)) {
    throw new Error('Adresse de photo Facebook inattendue.');
  }
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), 30_000);
  let reponse;
  try { reponse = await fetch(adresse, { signal: controleur.signal }); }
  catch (error) { throw new Error(`Photo Facebook injoignable : ${text(error.message, 120)}`); }
  finally { clearTimeout(minuterie); }
  if (!reponse.ok) throw new Error(`Photo Facebook illisible (HTTP ${reponse.status}).`);
  const type = String(reponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[type];
  if (!extension) throw new Error(`Format de photo Facebook inattendu (${text(type, 40) || 'inconnu'}).`);
  const octets = Buffer.from(await reponse.arrayBuffer());
  if (!octets.length || octets.length > TAILLE_MAX_PHOTO) throw new Error('Photo Facebook vide ou trop lourde.');
  const fichier = `${base}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fichier), octets);
  audit('media.facebook_telechargee', { fichier, octets: octets.length });
  return `assets/uploads/${fichier}`;
}

/**
 * Facebook → site, après chaque synchronisation : texte et photos modifiés
 * sur la publication d'une annonce sont reportés sur l'annonce.
 */
async function appliquerFacebookVersSite(posts) {
  const contenu = await lireContenuBrut();
  const references = lireReferencesFacebook();
  const plan = SYNC.planVersSite({ posts, origines: originesPublications(), references, contenu, siteUrl: PUBLIC_SITE_URL });
  const bilan = { annonces: [], references: 0, erreurs: [] };
  if (!plan.length) return bilan;
  const maintenant = new Date().toISOString();
  const collections = { villa: 'villas', terrain: 'terrains', activity: 'activities' };
  for (const action of plan) {
    if (action.type === 'reference') {
      references[action.facebookId] = { kind: action.kind, id: action.id, ...action.reference, majLe: maintenant };
      bilan.references += 1;
      continue;
    }
    const liste = contenu[collections[action.kind]];
    const index = Array.isArray(liste) ? liste.findIndex(item => item.id === action.id) : -1;
    if (index < 0) continue;
    const reference = references[action.facebookId];
    let images = null;
    let photos = reference.photos;
    if (action.photos) {
      const locales = new Map((reference.photos || []).filter(photo => photo.local).map(photo => [photo.fbId, photo.local]));
      try {
        for (const photo of action.photos) {
          if (!locales.has(photo.fbId)) locales.set(photo.fbId, await telechargerPhotoFacebook(photo));
        }
      } catch (error) {
        // Galerie incomplète : l'annonce reste telle quelle, nouvel essai à la prochaine synchronisation.
        bilan.erreurs.push(`${nomAnnonce(liste[index])} : ${text(error.message, 200)}`);
        continue;
      }
      images = SYNC.galerieDepuisFacebook(liste[index], action.photos, reference, locales);
      photos = action.photos.map(photo => ({ fbId: photo.fbId, local: locales.get(photo.fbId) }));
    }
    liste[index] = SYNC.appliquerChangementSite(action.kind, liste[index], { champs: action.champs, images });
    references[action.facebookId] = { ...reference, message: action.texte, photos, majLe: maintenant };
    bilan.annonces.push({ kind: action.kind, id: action.id, texte: Boolean(action.champs), photos: Boolean(images) });
  }
  if (bilan.annonces.length) {
    if (fs.existsSync(CONTENT_FILE)) createBackup('avant-synchro-facebook');
    // Nouvel horodatage : un studio ouvert avant ce changement ne peut plus
    // l'écraser en publiant (verrou de POST /api/admin/content).
    contenu.updatedAt = maintenant;
    const ecriture = await store.writeContent(contenu);
    if (ecriture.dbExpected && !ecriture.persistedToDb) {
      // Références inchangées : la synchronisation suivante réessaiera.
      bilan.erreurs.push(`Enregistrement en base refusé : ${text(ecriture.error, 200)}`);
      bilan.annonces = [];
      return bilan;
    }
    bilan.annonces.forEach(annonce => audit('facebook.annonce_depuis_facebook', annonce));
  }
  writeJSON(FB_SYNCHRO_FILE, { references, updatedAt: maintenant });
  return bilan;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/content') {
    // `terrains` fait partie du contrat d'API : la clé existe toujours,
    // même si le stockage est antérieur à la rubrique.
    return json(res, 200, await avecAvis(contenuPublic(await store.readContent())));
  }

  // --- Avis des visiteurs sur les annonces (17/09/2026) --------------------
  if (req.method === 'GET' && url.pathname === '/api/avis') {
    const annonce = AVIS.annonceDemandee({ kind: url.searchParams.get('kind'), id: url.searchParams.get('id') });
    if (annonce.erreur) return json(res, 400, { ok: false, error: annonce.erreur });
    try {
      const { jaime, commentaires } = await AVIS.avisAnnonce(annonce.kind, annonce.id);
      const visiteur = AVIS.empreinteVisiteur(url.searchParams.get('visiteur'));
      return json(res, 200, {
        ok: true, ...AVIS.resume(jaime, commentaires),
        jaime: Boolean(visiteur) && jaime.some(j => j.visiteur === visiteur),
        commentaires: commentaires.filter(c => c.statut !== 'masque').slice(0, 100).map(AVIS.commentairePublic)
      });
    } catch (error) { return json(res, 503, { ok: false, error: 'Avis momentanément indisponibles.' }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/avis/jaime') {
    const limite = rateLimit(req, 'avis-jaime', 60);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de clics : réessayez dans quelques minutes.' });
    try {
      const payload = await parseBody(req, 5_000);
      const annonce = AVIS.annonceDemandee(payload);
      const visiteur = AVIS.empreinteVisiteur(payload.visiteur);
      if (annonce.erreur || !visiteur) return json(res, 400, { ok: false, error: annonce.erreur || 'Visiteur non identifié.' });
      if (!(await annonceEnLigne(annonce.kind, annonce.id))) return json(res, 404, { ok: false, error: 'Annonce introuvable.' });
      const jaimeMaintenant = await AVIS.basculerJaime(annonce.kind, annonce.id, visiteur);
      const { jaime, commentaires } = await AVIS.avisAnnonce(annonce.kind, annonce.id);
      return json(res, 200, { ok: true, jaime: jaimeMaintenant, ...AVIS.resume(jaime, commentaires) });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 200) }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/avis/commentaires') {
    const limite = rateLimit(req, 'avis-commentaires', 6);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de commentaires envoyés : réessayez dans quelques minutes.' });
    try {
      const payload = await parseBody(req, 20_000);
      const { commentaire, erreur, robot } = AVIS.validerCommentaire(payload);
      if (robot) { audit('avis.robot', { ip: clientIp(req) }); return json(res, 400, { ok: false, error: erreur }); }
      if (erreur) return json(res, 422, { ok: false, error: erreur });
      if (!(await annonceEnLigne(commentaire.kind, commentaire.annonceId))) return json(res, 404, { ok: false, error: 'Annonce introuvable.' });
      await AVIS.ajouterCommentaire(commentaire);
      audit('avis.commentaire', { id: commentaire.id, kind: commentaire.kind, annonce: commentaire.annonceId, note: commentaire.note });
      const { jaime, commentaires } = await AVIS.avisAnnonce(commentaire.kind, commentaire.annonceId);
      return json(res, 201, { ok: true, commentaire: AVIS.commentairePublic(commentaire), ...AVIS.resume(jaime, commentaires) });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 200) }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/leads') {
    const limit = rateLimit(req, 'leads');
    if (!limit.allowed) {
      res.writeHead(429, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'Retry-After': String(limit.retryAfter), 'X-Content-Type-Options': 'nosniff' });
      audit('lead.rate_limited', { ip: clientIp(req) });
      return res.end(JSON.stringify({ ok: false, error: 'Trop de demandes envoyées. Merci de réessayer dans quelques minutes.' }));
    }
    try {
      const payload = await parseBody(req, 200_000);
      const email = text(payload.email, 180);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail invalide');
      const lead = {
        id: crypto.randomUUID(), type: text(payload.type || 'demande', 40),
        name: text(payload.name, 120), email,
        phone: text(payload.phone, 40), villa: text(payload.villa, 160),
        terrainRef: text(payload.terrainRef, 40), terrainId: slug(payload.terrainId, ''),
        dates: text(payload.dates, 160), amount: positiveNumber(payload.amount, 0, 1_000_000_000),
        message: text(payload.message, 2000), status: 'nouveau', createdAt: new Date().toISOString()
      };
      // Accord pour les offres WhatsApp (case du simulateur, décochée par
      // défaut). Absent = formulaire sans cette case : « non recueilli ».
      if (typeof payload.whatsappOptIn === 'boolean') {
        lead.whatsappOptIn = payload.whatsappOptIn;
        lead.whatsappOptInAt = payload.whatsappOptIn ? lead.createdAt : null;
      }
      // Demandeur bloqué ou suspendu depuis le studio (17/09/2026) : refus avec
      // un message neutre, qui ne dit pas au visiteur qu'il est bloqué.
      const restriction = DEMANDEURS.restrictionPour(await DEMANDEURS.lister().catch(() => []), lead);
      if (restriction) {
        audit('lead.refuse_restriction', { restriction: restriction.id, type: restriction.type, ip: clientIp(req) });
        return json(res, 403, { ok: false, error: DEMANDEURS.MESSAGE_REFUS });
      }
      await store.createLead(lead);
      // Demande envoyée depuis l'application avec les notifications activées :
      // on retient le téléphone pour le prévenir du suivi (« Contacté », « Confirmé »).
      if (NOTIF.estJetonExpo(payload.appareil)) {
        const memoire = readJSON(APP_NOTIF_FILE, {});
        const demandes = memoire.demandes && typeof memoire.demandes === 'object' ? memoire.demandes : {};
        writeJSON(APP_NOTIF_FILE, { ...memoire, demandes: { ...demandes, [lead.id]: { jeton: payload.appareil, langue: text(payload.langue, 5) || 'fr', statut: lead.status, le: lead.createdAt } } });
      }
      // Notification interne à contact@henri-philippe.com. Volontairement
      // détachée : un SMTP en panne ne doit JAMAIS faire échouer
      // l'enregistrement d'une demande client. La demande prime sur l'e-mail.
      notifyNewLead(lead, req).catch(() => {});
      // Accusé de réception au client, même principe détaché.
      confirmLeadToClient(lead, req).catch(() => {});
      return json(res, 201, { ok: true, lead });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  // --- Application mobile : inscription aux notifications ----------------
  if (url.pathname === '/api/app/appareils' && (req.method === 'POST' || req.method === 'DELETE')) {
    const limite = rateLimit(req, 'app-appareils', 30);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de requêtes.' });
    try {
      const payload = await parseBody(req, 5_000);
      if (req.method === 'DELETE') {
        if (NOTIF.estJetonExpo(payload.jeton)) writeJSON(APP_APPAREILS_FILE, NOTIF.retirerAppareils(readJSON(APP_APPAREILS_FILE, {}), payload.jeton));
        return json(res, 200, { ok: true });
      }
      const { registre, erreur } = NOTIF.enregistrerAppareil(readJSON(APP_APPAREILS_FILE, {}), payload);
      if (erreur) return json(res, 400, { ok: false, error: erreur });
      writeJSON(APP_APPAREILS_FILE, registre);
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 200) }); }
  }

  // --- Application mobile : statut de ses propres demandes (suivi sans push) ---
  if (req.method === 'POST' && url.pathname === '/api/app/suivi') {
    const limite = rateLimit(req, 'app-suivi', 120);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de requêtes.' });
    try {
      const payload = await parseBody(req, 5_000);
      return json(res, 200, { ok: true, statuts: NOTIF.statutsDemandes(await store.readLeads(), payload.ids) });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 200) }); }
  }

  // --- Authentification (routes publiques par nature : on ne peut pas exiger
  //     d'être connecté pour se connecter) ---------------------------------
  if (url.pathname.startsWith('/api/auth/')) return handleAuthApi(req, res, url);

  // --- Newsletter, côté visiteur ----------------------------------------
  if (url.pathname === '/api/newsletter' || url.pathname.startsWith('/api/newsletter/')) {
    const handled = await handlePublicNewsletter(req, res, url);
    if (handled) return;
  }

  // ---------------------------------------------------------------------
  // GARDE DES ROUTES D'ADMINISTRATION
  // Deux contrôles distincts et cumulatifs :
  //   1. authentification — qui es-tu ?
  //   2. autorisation     — ce rôle a-t-il le droit de faire CELA ?
  // Une route sans permission déclarée est refusée (défaut = refus).
  // ---------------------------------------------------------------------
  let actor = null;
  if (url.pathname.startsWith('/api/admin/')) {
    try {
      actor = await resolveActor(req);
    } catch (error) {
      // 503, pas 401 : la session est peut-être parfaitement valide, c'est la
      // base qui n'a pas répondu. Le studio affiche un message et LAISSE
      // l'écran en place au lieu de déconnecter l'administrateur en pleine
      // saisie.
      if (error instanceof SessionUnavailableError) {
        return json(res, 503, {
          ok: false, retryable: true, authenticated: true,
          error: 'Base de données momentanément injoignable. Votre session est intacte — réessayez dans quelques secondes.'
        });
      }
      throw error;
    }
    if (!actor) {
      return json(res, 401, { ok: false, error: 'Session expirée ou accès refusé. Reconnectez-vous.', authenticated: false });
    }
    // Défense en profondeur contre le CSRF : SameSite=Strict empêche déjà
    // l'envoi du cookie depuis un autre site, cet en-tête (impossible à poser
    // sur un formulaire HTML classique) ferme le cas des navigateurs anciens.
    if (actor.viaCookie && req.method !== 'GET' && req.method !== 'HEAD'
        && String(req.headers['x-requested-with'] || '') !== 'studio') {
      return json(res, 403, { ok: false, error: 'Requête refusée (en-tête d’origine manquant).' });
    }
    const permission = requiredPermission(req.method, url.pathname);
    if (!permission || !auth.can(actor, permission)) {
      audit('auth.forbidden', { path: url.pathname, method: req.method, role: actor.role, permission }, actorLabel(actor));
      return json(res, 403, {
        ok: false, authenticated: true, role: actor.role,
        error: `Votre rôle (${actor.roleLabel || actor.role}) ne permet pas cette action.`
      });
    }
  }

  // Contenu complet pour le studio, annonces suspendues et archivées comprises.
  if (req.method === 'GET' && url.pathname === '/api/admin/content') {
    return json(res, 200, await avecAvis(await store.readContent()));
  }

  // Avis d'une annonce pour sa fiche au studio : commentaires masqués compris.
  if (req.method === 'GET' && url.pathname === '/api/admin/avis') {
    const annonce = AVIS.annonceDemandee({ kind: url.searchParams.get('kind'), id: url.searchParams.get('id') });
    if (annonce.erreur) return json(res, 400, { ok: false, error: annonce.erreur });
    const { jaime, commentaires } = await AVIS.avisAnnonce(annonce.kind, annonce.id);
    return json(res, 200, { ok: true, ...AVIS.resume(jaime, commentaires),
      commentaires: commentaires.map(c => ({ ...AVIS.commentairePublic(c), statut: c.statut })) });
  }

  const routeCommentaire = url.pathname.match(/^\/api\/admin\/avis\/commentaires\/([^/]+)$/);
  if (routeCommentaire && (req.method === 'PATCH' || req.method === 'DELETE')) {
    try {
      const id = decodeURIComponent(routeCommentaire[1]);
      if (req.method === 'DELETE') {
        if (!(await AVIS.supprimerCommentaire(id))) return json(res, 404, { ok: false, error: 'Commentaire introuvable.' });
        audit('avis.commentaire_supprime', { id }, actorLabel(actor));
        return json(res, 200, { ok: true });
      }
      const payload = await parseBody(req, 2_000);
      if (!(await AVIS.modererCommentaire(id, text(payload.statut, 10)))) return json(res, 404, { ok: false, error: 'Commentaire introuvable.' });
      audit('avis.commentaire_modere', { id, statut: payload.statut }, actorLabel(actor));
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 200) }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
    const leads = await store.readLeads();
    const content = await store.readContent();
    const confirmed = leads.filter(item => item.status === 'confirme');
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const weeklyLeads = Array.from({ length: 8 }, (_, index) => {
      const end = now - (7 - index) * week;
      const start = end - week;
      return leads.filter(item => {
        const date = new Date(item.createdAt).getTime();
        return Number.isFinite(date) && date > start && date <= end;
      }).length;
    });
    const revenue = confirmed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const activeLeads = leads.filter(item => item.status !== 'archive');
    return json(res, 200, {
      ok: true,
      kpis: { leads: leads.length, newLeads: leads.filter(item => item.status === 'nouveau').length,
        contacted: leads.filter(item => item.status === 'contacte').length, confirmed: confirmed.length,
        archived: leads.filter(item => item.status === 'archive').length, revenue,
        averageBooking: confirmed.length ? Math.round(revenue / confirmed.length) : 0,
        conversionRate: activeLeads.length ? Math.round((confirmed.length / activeLeads.length) * 100) : 0,
        villas: content.villas?.length || 0, terrains: content.terrains?.length || 0,
        terrainsAvailable: (content.terrains || []).filter(item => item.status === 'disponible').length,
        activities: content.activities?.length || 0 },
      weeklyLeads, recentLeads: leads.slice(0, 8), facebookConnected: Boolean(PAGE_ID && PAGE_TOKEN),
      facebookStatus: PAGE_ID && PAGE_TOKEN ? 'connecte' : 'non-configure', lastUpdate: content.updatedAt || null,
      storage: { mode: dbEnabled() ? 'mysql' : 'fichiers-json', databaseConfigured: Boolean(loadRepository()), databaseReady, databaseError },
      backups: listBackups().slice(0, 3)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/content') {
    try {
      const payload = await parseBody(req, 4_000_000);
      const result = validateAndSanitizeContent(payload, await store.lireReferentiels());
      if (result.errors.length) return json(res, 422, { ok: false, error: result.errors[0], errors: result.errors, warnings: result.warnings });
      // Incident du 16/09/2026 : « Publier » cliqué avant la fin du chargement
      // du studio a envoyé son état initial vide, et toutes les tables du
      // catalogue ont été effacées. Aucun usage du studio ne vide d'un coup
      // villas, terrains ET activités : on refuse.
      const precedent = await lireContenuBrut();
      if (catalogueVide(result.content) && !catalogueVide(precedent)) {
        audit('content.publish_refused_empty', {}, actorLabel(actor));
        return json(res, 409, { ok: false, error: 'Publication refusée : elle aurait vidé tout le catalogue (aucune villa, aucun terrain, aucune activité). Rechargez le studio puis recommencez.' });
      }
      // Contenu modifié depuis l'ouverture du studio (annonce mise à jour
      // depuis Facebook, autre onglet) : publier cet état périmé effacerait ces
      // changements, puis les renverrait effacés sur la Page.
      const base = text(payload.baseUpdatedAt, 40);
      if (base && precedent.updatedAt && base !== String(precedent.updatedAt)) {
        audit('content.publish_refused_stale', { base, actuel: precedent.updatedAt }, actorLabel(actor));
        return json(res, 409, { ok: false, code: 'contenu-modifie', error: 'Le contenu a été modifié depuis l’ouverture du studio (mise à jour reçue de Facebook ou d’un autre onglet). Rechargez la page avant de publier : vos modifications non publiées seront à refaire.' });
      }
      if (fs.existsSync(CONTENT_FILE)) createBackup('avant-publication');
      const currentContent = await store.readContent();
      // Les réglages du site (téléphone, liens, identité éditoriale) sont
      // « sensibles » au sens du cahier des charges : un éditeur publie le
      // catalogue mais ne peut pas les modifier. Plutôt que de refuser toute
      // la publication, on conserve simplement les réglages en place.
      if (!auth.can(actor, 'settings:write')) {
        result.content.settings = currentContent.settings || result.content.settings;
        result.warnings.push('Réglages du site inchangés : votre rôle ne permet pas de les modifier.');
      }
      result.content.facebookPosts = publicationsSansFiche(readJSON(FB_POSTS_FILE, currentContent.facebookPosts || []).slice(0, 20));
      result.content.facebookUpdatedAt = currentContent.facebookUpdatedAt || null;
      const ecriture = await store.writeContent(result.content);
      if (ecriture.warning) result.warnings.push(ecriture.warning);
      // MySQL attendu mais refusé : on le DIT. Répondre « ok » alors que la
      // base n'a rien reçu ferait croire à l'administrateur que son travail est
      // enregistré, jusqu'à ce qu'il disparaisse à la prochaine lecture.
      if (ecriture.dbExpected && !ecriture.persistedToDb) {
        audit('content.publish_failed', { error: ecriture.error }, actorLabel(actor));
        return json(res, 502, {
          ok: false,
          error: `Enregistrement en base refusé : ${ecriture.error}. Vos modifications ne sont PAS publiées.`,
          detail: ecriture.error
        });
      }
      audit('content.published', { villas: result.content.villas.length, terrains: result.content.terrains.length, activities: result.content.activities.length, warnings: result.warnings.length }, actorLabel(actor));
      // Cases « Publier sur Facebook » et états des annonces → Page. Un échec
      // Facebook ne fait jamais échouer l'enregistrement : le site prime.
      let facebook;
      try { facebook = await synchroniserAnnoncesVersFacebook(result.content, precedent); }
      catch (error) { facebook = { publiees: [], republiees: [], textes: [], retirees: [], enAttente: [], erreurs: [text(error.message, 300)] }; }
      notifierNouveautesApp('studio').catch(() => {});
      return json(res, 200, { ok: true, updatedAt: result.content.updatedAt, warnings: result.warnings, facebook, storage: ecriture.dbExpected ? 'mysql' : 'fichiers' });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  // ---- Référentiels administrables (db/referentiels.js) ----
  if (req.method === 'GET' && url.pathname === '/api/admin/referentiels') {
    const referentiels = await store.lireReferentiels();
    const biens = await biensPourUsages(referentiels);
    // Nombre de fiches par entrée : le studio l’affiche, et sait ainsi qu’une
    // entrée utilisée se désactive au lieu de se supprimer.
    const usages = Object.fromEntries(REF.TYPES.map(type => [type,
      Object.fromEntries(referentiels[type].map(entree => [entree.id, REF.compterUsages(type, entree.id, biens)]))]));
    return json(res, 200, { ok: true, referentiels, usages });
  }

  const routeReferentiel = url.pathname.match(/^\/api\/admin\/referentiels\/([a-z]+)(?:\/([^/]+))?$/);
  if (routeReferentiel && REF.TYPES.includes(routeReferentiel[1])) {
    const type = routeReferentiel[1];
    if (req.method === 'POST' && !routeReferentiel[2]) {
      let payload;
      try { payload = await parseBody(req, 20_000); }
      catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
      const nouveau = payload?.nouveau === true;
      if (type === 'statuts' && nouveau) return json(res, 400, { ok: false, error: 'Les statuts ne se créent pas : seuls leurs libellés se modifient.' });
      const { entree, erreurs } = REF.normaliserEntree(type, payload?.entree);
      if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
      const resultat = await store.ecrireReferentiel(type, entree, nouveau);
      if (resultat.statut !== 200) return json(res, resultat.statut, { ok: false, error: resultat.erreur });
      audit(nouveau ? 'referentiel.cree' : 'referentiel.modifie', { type, id: entree.id }, actorLabel(actor));
      return json(res, 200, { ok: true, entree, referentiels: resultat.referentiels });
    }
    if (req.method === 'POST' && routeReferentiel[2] === 'ordre') {
      let payload;
      try { payload = await parseBody(req, 20_000); }
      catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
      const resultat = await store.ordonnerReferentiel(type, payload?.ids);
      if (resultat.statut !== 200) return json(res, resultat.statut, { ok: false, error: resultat.erreur });
      audit('referentiel.ordonne', { type }, actorLabel(actor));
      return json(res, 200, { ok: true, referentiels: resultat.referentiels });
    }
    if (req.method === 'DELETE' && routeReferentiel[2]) {
      let id;
      try { id = decodeURIComponent(routeReferentiel[2]); }
      catch { return json(res, 400, { ok: false, error: 'Identifiant invalide.' }); }
      const resultat = await store.supprimerReferentiel(type, id);
      if (resultat.statut !== 200) return json(res, resultat.statut, { ok: false, error: resultat.erreur });
      audit('referentiel.supprime', { type, id }, actorLabel(actor));
      return json(res, 200, { ok: true, referentiels: resultat.referentiels });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/content/validate') {
    try {
      const result = validateAndSanitizeContent(await parseBody(req, 4_000_000), await store.lireReferentiels());
      // Ce que la publication fera sur Facebook : le studio le fait confirmer.
      const facebook = result.errors.length ? null : resumePlanFacebook(planFacebook(result.content, await lireContenuBrut()));
      return json(res, result.errors.length ? 422 : 200, { ok: !result.errors.length, errors: result.errors, warnings: result.warnings, facebook });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/media') {
    try {
      const media = saveUploadedImage(await parseBody(req, 12_000_000));
      return json(res, 201, { ok: true, ...media });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/leads') {
    const [leads, restrictions] = await Promise.all([store.readLeads(), DEMANDEURS.lister().catch(() => [])]);
    return json(res, 200, { ok: true, leads: leads.map(lead => ({ ...lead, restriction: DEMANDEURS.restrictionPour(restrictions, lead) })) });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/leads/')) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const payload = await parseBody(req);
      const lead = await store.updateLead(id, payload);
      if (!lead) return json(res, 404, { ok: false, error: 'Demande introuvable' });
      audit('lead.updated', { id, status: lead.status, amount: lead.amount }, actorLabel(actor));
      notifierSuiviDemandeApp(lead).catch(() => {});
      return json(res, 200, { ok: true, lead });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  // ---- Gestion des demandes et des demandeurs (17/09/2026) ---------------
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/leads/')) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const supprimees = await store.deleteLeads([id]);
      if (!supprimees) return json(res, 404, { ok: false, error: 'Demande introuvable' });
      audit('lead.deleted', { id }, actorLabel(actor));
      return json(res, 200, { ok: true, supprimees });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
  }

  if (url.pathname === '/api/admin/demandeurs/restrictions' || url.pathname.startsWith('/api/admin/demandeurs/')) {
    try {
      if (req.method === 'GET' && url.pathname === '/api/admin/demandeurs/restrictions') {
        return json(res, 200, { ok: true, restrictions: await DEMANDEURS.lister() });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/demandeurs/restrictions') {
        const payload = await parseBody(req, 10_000);
        const lead = (await store.readLeads()).find(entree => String(entree.id) === text(payload.leadId, 36));
        if (!lead) return json(res, 404, { ok: false, error: 'Demande introuvable' });
        const existante = DEMANDEURS.restrictionPour(await DEMANDEURS.lister(), lead);
        if (existante) return json(res, 409, { ok: false, error: 'Ce demandeur est déjà bloqué ou suspendu : levez d’abord la mesure en cours.' });
        const { restriction, erreur } = DEMANDEURS.creerRestriction({ type: payload.type, jours: payload.jours, motif: payload.motif, lead, acteur: actorLabel(actor) });
        if (erreur) return json(res, 422, { ok: false, error: erreur });
        await DEMANDEURS.ajouter(restriction);
        audit('demandeur.restreint', { id: restriction.id, type: restriction.type, jusquAu: restriction.jusquAu, leadId: lead.id }, actorLabel(actor));
        return json(res, 201, { ok: true, restriction });
      }
      const levee = url.pathname.match(/^\/api\/admin\/demandeurs\/restrictions\/([^/]+)$/);
      if (req.method === 'DELETE' && levee) {
        const retirees = await DEMANDEURS.lever(decodeURIComponent(levee[1]));
        if (!retirees) return json(res, 404, { ok: false, error: 'Mesure introuvable (déjà levée ?)' });
        audit('demandeur.leve', { id: levee[1] }, actorLabel(actor));
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/demandeurs/supprimer') {
        const payload = await parseBody(req, 10_000);
        const leads = await store.readLeads();
        const lead = leads.find(entree => String(entree.id) === text(payload.leadId, 36));
        if (!lead) return json(res, 404, { ok: false, error: 'Demande introuvable' });
        const ids = DEMANDEURS.demandesDuDemandeur(leads, lead).map(entree => entree.id);
        const supprimees = await store.deleteLeads(ids);
        audit('demandeur.supprime', { demandes: supprimees }, actorLabel(actor));
        return json(res, 200, { ok: true, supprimees, ids });
      }
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
  }

  // ---- Messages WhatsApp promotionnels (menu « Messages ») ----------------
  if (url.pathname === '/api/admin/whatsapp' || url.pathname.startsWith('/api/admin/whatsapp/')) {
    const lireWa = () => {
      const brut = readJSON(WA_FILE, {});
      return {
        campagnes: Array.isArray(brut.campagnes) ? brut.campagnes : [],
        stops: brut.stops && typeof brut.stops === 'object' ? brut.stops : {}
      };
    };
    const etatPourStudio = async wa => ({
      ok: true, mentionStop: WA.MENTION_STOP, messageMax: WA.MESSAGE_MAX,
      contacts: WA.contactsDepuisDemandes(await store.readLeads(), wa.stops),
      campagnes: wa.campagnes.map(campagne => WA.campagnePourStudio(campagne, wa.stops))
    });
    try {
      if (req.method === 'GET' && url.pathname === '/api/admin/whatsapp') {
        return json(res, 200, await etatPourStudio(lireWa()));
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/whatsapp/campagnes') {
        const wa = lireWa();
        const contacts = WA.contactsDepuisDemandes(await store.readLeads(), wa.stops);
        const campagne = WA.creerCampagne(await parseBody(req), contacts, actorLabel(actor));
        wa.campagnes.unshift(campagne);
        writeJSON(WA_FILE, { ...wa, campagnes: wa.campagnes.slice(0, 200) });
        audit('whatsapp.campagne_creee', { id: campagne.id, destinataires: campagne.destinataires.length }, actorLabel(actor));
        return json(res, 201, await etatPourStudio(wa));
      }
      // /api/admin/whatsapp/campagnes/<id> → segment 5.
      const idCampagne = decodeURIComponent(url.pathname.split('/')[5] || '');
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/whatsapp/campagnes/')) {
        const wa = lireWa();
        const campagne = wa.campagnes.find(entree => entree.id === idCampagne);
        if (!campagne) return json(res, 404, { ok: false, error: 'Campagne introuvable.' });
        const { cle, statut } = await parseBody(req);
        WA.marquerDestinataire(campagne, text(cle, 20), text(statut, 20), actorLabel(actor));
        writeJSON(WA_FILE, wa);
        return json(res, 200, await etatPourStudio(wa));
      }
      if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/whatsapp/campagnes/')) {
        const wa = lireWa();
        const avant = wa.campagnes.length;
        wa.campagnes = wa.campagnes.filter(entree => entree.id !== idCampagne);
        if (wa.campagnes.length === avant) return json(res, 404, { ok: false, error: 'Campagne introuvable.' });
        writeJSON(WA_FILE, wa);
        audit('whatsapp.campagne_supprimee', { id: idCampagne }, actorLabel(actor));
        return json(res, 200, await etatPourStudio(wa));
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/whatsapp/stop') {
        const wa = lireWa();
        const payload = await parseBody(req);
        const cle = WA.normaliserTelephone(payload.cle);
        if (!cle) return json(res, 400, { ok: false, error: 'Numéro invalide.' });
        if (payload.stop === true) wa.stops[cle] = { le: new Date().toISOString(), par: actorLabel(actor) };
        else delete wa.stops[cle];
        writeJSON(WA_FILE, wa);
        // Le numéro n'est pas journalisé en clair : seulement ses 4 derniers chiffres.
        audit(payload.stop === true ? 'whatsapp.stop' : 'whatsapp.reprise', { fin: cle.slice(-4) }, actorLabel(actor));
        return json(res, 200, await etatPourStudio(wa));
      }
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
  }

  // =========================================================================
  // COMPTABILITÉ (17/09/2026) — propriétaire seulement (compta:manage)
  // =========================================================================
  if (url.pathname === '/api/admin/compta' || url.pathname.startsWith('/api/admin/compta/')) {
    try {
      const acteur = actorLabel(actor);
      const periodeDemandee = () => {
        const debut = url.searchParams.get('debut') || '';
        const fin = url.searchParams.get('fin') || '';
        if (!COMPTA.dateValide(debut) || !COMPTA.dateValide(fin) || fin < debut) throw new Error('Période invalide.');
        return { debut, fin };
      };
      const nomBien = (kind, id, contenu) => {
        const liste = contenu[{ villa: 'villas', terrain: 'terrains', activity: 'activities' }[kind]] || [];
        const bien = liste.find(item => item.id === id);
        return bien ? (bien.name || bien.title || id) : id;
      };

      if (req.method === 'GET' && url.pathname === '/api/admin/compta') {
        const { debut, fin } = periodeDemandee();
        const [donnees, leads] = await Promise.all([COMPTA.tout(), store.readLeads()]);
        const listeVentes = COMPTA.ventes(leads, donnees.ecritures, donnees.parametres);
        const p = donnees.parametres;
        // Nombre d'utilisations de chaque paramètre : décide suppression ou désactivation.
        const usages = Object.fromEntries(COMPTA.TYPES_PARAMETRES.map(type => [type,
          Object.fromEntries(p[type].map(entree => [entree.id, COMPTA.usagesParametre(type, entree.id, donnees)]))]));
        return json(res, 200, {
          ok: true, debut, fin, categories: p.categories, modes: p.modes, statuts: p.statuts, effets: COMPTA.EFFETS, usages,
          ecritures: donnees.ecritures.filter(e => e.date >= debut && e.date <= fin),
          employes: donnees.employes, charges: donnees.charges, ventes: listeVentes,
          rapport: COMPTA.rapport(donnees.ecritures, { debut, fin }, listeVentes, p)
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/compta/export') {
        const { debut, fin } = periodeDemandee();
        const [donnees, contenu] = await Promise.all([COMPTA.tout(), lireContenuBrut()]);
        const lignes = donnees.ecritures.filter(e => e.date >= debut && e.date <= fin);
        audit('compta.export', { debut, fin, lignes: lignes.length }, acteur);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comptabilite-${debut}-${fin}.csv"`, 'Cache-Control': 'no-store' });
        return res.end(COMPTA.csv(lignes, { nomBien: (kind, id) => nomBien(kind, id, contenu), parametres: donnees.parametres }));
      }

      const route = url.pathname.match(/^\/api\/admin\/compta\/(ecritures|employes|charges)(?:\/([^/]+))?$/);
      if (route) {
        const [, collection, idBrut] = route;
        const id = idBrut ? decodeURIComponent(idBrut) : '';
        const donnees = await COMPTA.tout();
        const liste = donnees[collection];
        const existant = id ? liste.find(entree => entree.id === id) : null;
        if (id && !existant) return json(res, 404, { ok: false, error: 'Élément introuvable.' });

        if (req.method === 'DELETE' && id) {
          if (collection === 'ecritures') await COMPTA.supprimerEcriture(id);
          if (collection === 'employes') {
            if (donnees.ecritures.some(e => e.employeId === id)) return json(res, 409, { ok: false, error: 'Des salaires sont déjà enregistrés pour cet employé : désactivez-le plutôt que de le supprimer.' });
            await COMPTA.supprimerEmploye(id);
          }
          if (collection === 'charges') await COMPTA.supprimerCharge(id);
          audit(`compta.${collection}_supprime`, { id }, acteur);
          return json(res, 200, { ok: true });
        }

        if ((req.method === 'POST' && !id) || (req.method === 'PATCH' && id)) {
          const payload = await parseBody(req, 50_000);
          const source = existant ? { ...existant, ...payload } : payload;
          if (collection === 'ecritures') {
            const { ecriture, erreurs } = COMPTA.validerEcriture(source, { existante: existant, acteur, parametres: donnees.parametres });
            if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
            if (ecriture.justificatif && !fs.existsSync(path.join(JUSTIFICATIFS_DIR, ecriture.justificatif))) return json(res, 422, { ok: false, error: 'Pièce justificative introuvable : déposez-la de nouveau.' });
            await COMPTA.enregistrerEcritures([ecriture]);
            audit(existant ? 'compta.ecriture_modifiee' : 'compta.ecriture_creee', { id: ecriture.id, sens: ecriture.sens, montant: ecriture.montant, categorie: ecriture.categorie, leadId: ecriture.leadId || undefined }, acteur);
            return json(res, existant ? 200 : 201, { ok: true, ecriture });
          }
          if (collection === 'employes') {
            const { employe, erreurs } = COMPTA.validerEmploye(source, { existant });
            if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
            await COMPTA.enregistrerEmploye(employe);
            audit(existant ? 'compta.employe_modifie' : 'compta.employe_cree', { id: employe.id }, acteur);
            return json(res, existant ? 200 : 201, { ok: true, employe });
          }
          const { charge, erreurs } = COMPTA.validerCharge(source, { existante: existant, parametres: donnees.parametres });
          if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
          await COMPTA.enregistrerCharge(charge);
          audit(existant ? 'compta.charge_modifiee' : 'compta.charge_creee', { id: charge.id }, acteur);
          return json(res, existant ? 200 : 201, { ok: true, charge });
        }
      }

      if (req.method === 'POST' && (url.pathname === '/api/admin/compta/paie' || url.pathname === '/api/admin/compta/charges-du-mois')) {
        const payload = await parseBody(req, 2_000);
        if (!COMPTA.periodeValide(payload.periode)) return json(res, 422, { ok: false, error: 'Mois invalide (AAAA-MM).' });
        const donnees = await COMPTA.tout();
        const paie = url.pathname.endsWith('/paie');
        const nouvelles = paie
          ? COMPTA.paieDuMois(donnees.employes, payload.periode, donnees.ecritures, { acteur, parametres: donnees.parametres })
          : COMPTA.chargesDuMois(donnees.charges, payload.periode, donnees.ecritures, { acteur, parametres: donnees.parametres });
        await COMPTA.enregistrerEcritures(nouvelles);
        audit(paie ? 'compta.paie_generee' : 'compta.charges_generees', { periode: payload.periode, ecritures: nouvelles.length }, acteur);
        return json(res, 200, { ok: true, creees: nouvelles.length, total: nouvelles.reduce((t, e) => t + e.montant, 0) });
      }

      // Paramètres : catégories, modes de paiement, statuts (Comptabilité → Paramètres).
      const routeParametre = url.pathname.match(/^\/api\/admin\/compta\/parametres\/(categories|modes|statuts)(?:\/([^/]+))?$/);
      if (routeParametre) {
        const [, type, idBrut] = routeParametre;
        const donnees = await COMPTA.tout();
        if (req.method === 'DELETE' && idBrut) {
          const id = decodeURIComponent(idBrut);
          const entree = donnees.parametres[type].find(p => p.id === id);
          if (!entree) return json(res, 404, { ok: false, error: 'Paramètre introuvable.' });
          if (entree.systeme) return json(res, 409, { ok: false, error: `« ${entree.libelle} » est indispensable au fonctionnement de la comptabilité : renommez-le si besoin.` });
          const usages = COMPTA.usagesParametre(type, id, donnees);
          if (usages) return json(res, 409, { ok: false, error: `Utilisé par ${usages} écriture${usages > 1 ? 's' : ''} ou charge${usages > 1 ? 's' : ''} : désactivez-le plutôt que de le supprimer.` });
          await COMPTA.supprimerParametre(type, id);
          audit('compta.parametre_supprime', { type, id }, acteur);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && !idBrut) {
          const payload = await parseBody(req, 5_000);
          const existante = payload.id ? donnees.parametres[type].find(p => p.id === text(payload.id, 40)) : null;
          if (payload.id && !existante) return json(res, 404, { ok: false, error: 'Paramètre introuvable.' });
          const { entree, erreurs } = COMPTA.validerParametre(type, payload, { existante, parametres: donnees.parametres });
          if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
          await COMPTA.enregistrerParametre(entree);
          audit(existante ? 'compta.parametre_modifie' : 'compta.parametre_cree', { type, id: entree.id }, acteur);
          return json(res, existante ? 200 : 201, { ok: true, entree });
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/admin/compta/justificatifs') {
        const payload = await parseBody(req, 12_000_000);
        const formats = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
        const extension = formats[text(payload.mimeType, 40)];
        if (!extension) return json(res, 422, { ok: false, error: 'Format refusé : photo (JPG, PNG, WebP) ou PDF.' });
        const octets = Buffer.from(text(payload.data, 12_000_000).replace(/^data:[^;]+;base64,/, ''), 'base64');
        if (!octets.length || octets.length > 8_000_000) return json(res, 422, { ok: false, error: 'La pièce doit peser moins de 8 Mo.' });
        const signatures = {
          '.jpg': octets[0] === 0xff && octets[1] === 0xd8,
          '.png': octets.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
          '.webp': octets.subarray(0, 4).toString() === 'RIFF' && octets.subarray(8, 12).toString() === 'WEBP',
          '.pdf': octets.subarray(0, 5).toString() === '%PDF-'
        };
        if (!signatures[extension]) return json(res, 422, { ok: false, error: 'Le contenu du fichier ne correspond pas à son format.' });
        fs.mkdirSync(JUSTIFICATIFS_DIR, { recursive: true });
        const fichier = `${crypto.randomUUID()}${extension}`;
        fs.writeFileSync(path.join(JUSTIFICATIFS_DIR, fichier), octets, { flag: 'wx' });
        audit('compta.justificatif_depose', { fichier, octets: octets.length }, acteur);
        return json(res, 201, { ok: true, fichier, nom: text(payload.filename, 180) });
      }

      const piece = url.pathname.match(/^\/api\/admin\/compta\/justificatifs\/([a-f0-9-]{36}\.(jpg|png|webp|pdf))$/);
      if (req.method === 'GET' && piece) {
        const chemin = path.join(JUSTIFICATIFS_DIR, piece[1]);
        if (!fs.existsSync(chemin)) return json(res, 404, { ok: false, error: 'Pièce introuvable.' });
        const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
        res.writeHead(200, { 'Content-Type': types[piece[2]], 'Content-Disposition': `inline; filename="justificatif-${piece[1]}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(chemin).pipe(res);
      }
      return json(res, 404, { ok: false, error: 'Route de comptabilité inconnue.' });
    } catch (error) {
      const indisponible = /ECONN|PROTOCOL|ETIMEDOUT|ER_/.test(String(error.code || error.message || ''));
      return json(res, indisponible ? 503 : 400, { ok: false, error: indisponible ? 'Base de données injoignable : rien n’a été enregistré. Réessayez.' : text(error.message, 300) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export') {
    const format = url.searchParams.get('format') || 'json';
    const leads = await store.readLeads();
    if (format === 'csv') {
      const columns = ['id','createdAt','type','status','name','email','phone','villa','terrainRef','terrainId','dates','amount','message'];
      const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = '\ufeff' + [columns.join(';'), ...leads.map(item => columns.map(key => quote(item[key])).join(';'))].join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="demandes-assinie.csv"', 'Cache-Control': 'no-store' });
      audit('leads.exported', { format: 'csv', count: leads.length }, actorLabel(actor));
      return res.end(csv);
    }
    const snapshot = { version: 1, exportedAt: new Date().toISOString(), content: await store.readContent(), leads };
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Content-Disposition': 'attachment; filename="sauvegarde-assinie.json"', 'Cache-Control': 'no-store' });
    audit('data.exported', { format: 'json', leads: leads.length }, actorLabel(actor));
    return res.end(JSON.stringify(snapshot, null, 2));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/backups') {
    try {
      const backup = createBackup('manuel');
      audit('backup.created', backup, actorLabel(actor));
      return json(res, 201, { ok: true, backup, backups: listBackups() });
    } catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/backups') {
    return json(res, 200, { ok: true, backups: listBackups() });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
    return json(res, 200, { ok: true, entries: await store.readAudit(100) });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/facebook/posts') {
    const config = facebookConfig();
    const state = readJSON(FB_STATE_FILE, {});
    const posts = readJSON(FB_POSTS_FILE, readJSON(CONTENT_FILE, {}).facebookPosts || []);
    // Le studio affiche TOUTES les publications, chacune avec son état :
    // c'est là qu'on choisit celles qui paraissent sur le site.
    const masquees = publicationsMasquees();
    const referentiels = await store.lireReferentiels();
    const fiches = await store.lireFichesPublications(referentiels);
    const origines = originesPublications();
    const liste = posts.slice(0, 50).map(post => ({
      ...post,
      // Née d'une fiche du site : jamais affichée en doublon sur le site.
      origine: origines.get(String(post?.id)) || null,
      surLeSite: !masquees.has(String(post?.id)) && !origines.has(String(post?.id)),
      fiche: REF.resoudreBien(fiches.get(String(post?.id)) || normaliserFichePublication({}, referentiels).fiche, referentiels)
    }));
    return json(res, 200, { ok: true, ...config, state, posts: liste, masquees: masquees.size,
      fichesPubliees: Object.fromEntries(fichesPubliees()) });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/facebook/fiche') {
    let payload;
    try { payload = await parseBody(req, 60_000); }
    catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
    const id = text(payload?.id, 200);
    if (!id) return json(res, 400, { ok: false, error: 'Identifiant de publication manquant.' });
    const { fiche, erreurs } = normaliserFichePublication(payload?.fiche, await store.lireReferentiels());
    if (erreurs.length) return json(res, 422, { ok: false, error: erreurs[0], errors: erreurs });
    const resultat = await store.ecrireFichePublication(id, fiche);
    if (resultat.statut !== 200) {
      audit('facebook.fiche_refusee', { id, erreur: resultat.erreur }, actorLabel(actor));
      return json(res, resultat.statut, { ok: false, error: resultat.erreur });
    }
    audit('facebook.fiche', { id, enBase: resultat.enBase }, actorLabel(actor));
    return json(res, 200, { ok: true, id, fiche, enBase: resultat.enBase, warning: resultat.avertissement });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/facebook/visibilite') {
    try {
      const payload = await parseBody(req, 10_000);
      const resultat = definirVisibilitePublication(payload.id, payload.visible !== false);
      audit('facebook.visibilite', resultat, actorLabel(actor));
      return json(res, 200, { ok: true, ...resultat });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
  }

  // Diagnostic : à quelle Page le jeton donne-t-il réellement accès ?
  //
  // Utile quand META_PAGE_ID est soupçonné d'être faux : Meta répond alors
  // « Object with ID … does not exist », sans dire quel identifiant il aurait
  // fallu employer. Un jeton de Page s'identifie lui-même via /me : on obtient
  // donc l'identifiant exact sans jamais exposer le jeton.
  if (req.method === 'GET' && url.pathname === '/api/admin/facebook/identite') {
    if (!PAGE_TOKEN) return json(res, 503, { ok: false, error: 'META_PAGE_ACCESS_TOKEN absent.' });
    try {
      const moi = await graphRequest('me?fields=id,name');
      return json(res, 200, {
        ok: true,
        identifiantConfigure: PAGE_ID || null,
        identifiantReel: moi.id || null,
        concordance: Boolean(PAGE_ID) && String(moi.id) === String(PAGE_ID),
        nom: moi.name || null
      });
    } catch (error) {
      return json(res, 502, { ok: false, error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/facebook/publish') {
    try {
      const payload = await parseBody(req);
      const result = await publishFacebookPost(payload);
      syncFacebookPosts('apres-publication').catch(() => {});
      return json(res, 201, { ok: true, result });
    } catch (error) {
      const message = text(error.message, 500);
      updateFacebookState({ status: facebookConfig().connected ? 'erreur' : 'non-configure', lastError: message, lastErrorAt: new Date().toISOString() });
      audit('facebook.publish_failed', { error: message }, actorLabel(actor));
      return json(res, facebookConfig().connected ? 502 : 503, { ok: false, error: message });
    }
  }

  // Point de contrôle : la Page est-elle réellement abonnée au champ `feed` ?
  // Sans cet abonnement, aucun webhook n'arrive et le sens Facebook → site
  // ne repose plus que sur la resynchronisation périodique.
  // Abonnement de la PAGE à l'application.
  //
  // Meta demande deux abonnements distincts, et c'est la source d'erreur la
  // plus courante :
  //   1. l'app déclare les champs qu'elle veut recevoir (tableau de bord Meta) ;
  //   2. la PAGE installe l'app et lui ouvre ces champs — c'est ce que fait
  //      cet appel, via POST /{page-id}/subscribed_apps.
  // Sans le second, /{page-id}/subscribed_apps reste vide et aucune
  // notification n'arrive, alors que tout paraît configuré côté Meta.
  if (req.method === 'POST' && url.pathname === '/api/admin/facebook/abonner-page') {
    if (!facebookConfig().connected) {
      return json(res, 503, { ok: false, error: 'Connexion Meta non configurée.' });
    }
    try {
      const resultat = await graphRequest(`${PAGE_ID}/subscribed_apps`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ subscribed_fields: 'feed' })
      });
      audit('facebook.page_subscribed', { pageId: PAGE_ID, reponse: Boolean(resultat?.success) }, actorLabel(actor));
      return json(res, 200, { ok: true, souscrit: Boolean(resultat?.success), resultat });
    } catch (error) {
      const message = text(error.message, 400);
      audit('facebook.page_subscribe_failed', { error: message }, actorLabel(actor));
      return json(res, 502, { ok: false, error: message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/facebook/subscriptions') {
    if (!facebookConfig().connected) {
      return json(res, 200, { ok: false, connected: false, error: 'Connexion Meta non configurée', apps: [], feedSubscribed: false });
    }
    try {
      const result = await graphRequest(`${PAGE_ID}/subscribed_apps?fields=subscribed_fields`);
      const apps = (result.data || []).map(app => ({
        id: text(app?.id, 100), name: text(app?.name, 160),
        fields: (Array.isArray(app?.subscribed_fields) ? app.subscribed_fields : []).map(field => text(field, 60))
      }));
      const feedSubscribed = apps.some(app => app.fields.includes('feed'));
      audit('facebook.subscriptions_checked', { apps: apps.length, feedSubscribed }, actorLabel(actor));
      return json(res, 200, { ok: true, connected: true, apps, feedSubscribed, checkedAt: new Date().toISOString() });
    } catch (error) {
      return json(res, 200, { ok: false, connected: true, apps: [], feedSubscribed: false, error: text(error.message, 400) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/facebook/sync-to-site') {
    try {
      const result = await syncFacebookPosts('manuel');
      return json(res, 200, { ok: true, count: result.posts.length, state: result.state });
    } catch (error) { return json(res, facebookConfig().connected ? 502 : 503, { ok: false, error: error.message }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/facebook/webhook') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(url.searchParams.get('hub.challenge') || '');
    }
    return json(res, 403, { ok: false, error: 'Échec de vérification Meta' });
  }

  if (req.method === 'POST' && url.pathname === '/api/facebook/webhook') {
    if (!APP_SECRET) return json(res, 503, { ok: false, error: 'Webhook Meta non configuré' });
    // Le HMAC de Meta porte sur les OCTETS bruts du corps. On accumule donc des
    // Buffer : concaténer les chunks dans une chaîne les décode en UTF-8 et,
    // si un caractère multi-octets est coupé entre deux chunks, le ré-encodage
    // produit U+FFFD et invalide la signature d'une charge pourtant légitime.
    const chunks = [];
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > 1_000_000) { aborted = true; req.destroy(); return; }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (aborted) return;
      const rawBuffer = Buffer.concat(chunks);
      const raw = rawBuffer.toString('utf8');
      if (!verifyMetaSignature(req, rawBuffer)) {
        audit('facebook.webhook_rejected', { reason: 'signature-invalide' });
        return json(res, 401, { ok: false, error: 'Signature Meta invalide' });
      }
      try {
        const payload = JSON.parse(raw || '{}');
        const events = readJSON(FB_EVENTS_FILE, []);
        const knownIds = new Set(events.map(event => event.id));
        const receivedAt = new Date().toISOString();
        const additions = (payload.entry || []).flatMap(entry => (entry.changes || []).map(change => {
          const signature = JSON.stringify({ pageId: entry.id, time: entry.time, field: change.field, value: change.value });
          return { id: crypto.createHash('sha256').update(signature).digest('hex'), pageId: text(entry.id, 100), field: text(change.field, 100), value: change.value, receivedAt };
        })).filter(event => !knownIds.has(event.id));
        writeJSON(FB_EVENTS_FILE, additions.concat(events).slice(0, 200));
        // En base, la clé primaire (SHA-256 de l'événement) rejette les rejeux.
        tryDb('enregistrement des événements webhook', repo => repo.recordFacebookEvents(additions)).catch(() => {});
        updateFacebookState({ lastWebhookAt: receivedAt, lastWebhookEvents: additions.length });
        audit('facebook.webhook_received', { events: additions.length, pageIds: [...new Set(additions.map(event => event.pageId))] });
        if (PAGE_ID && PAGE_TOKEN && additions.some(event => !event.pageId || event.pageId === PAGE_ID)) syncFacebookPosts('webhook').catch(() => {});
        return json(res, 200, { ok: true });
      } catch (error) {
        audit('facebook.webhook_rejected', { reason: 'json-invalide' });
        return json(res, 400, { ok: false, error: 'Événement Meta invalide' });
      }
    });
    return;
  }

  // =========================================================================
  // GESTION DES UTILISATEURS (rôle « proprietaire » uniquement)
  // =========================================================================
  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const users = await auth.listUsers();
    return json(res, 200, {
      ok: true,
      users: users.map(auth.publicUser),
      roles: auth.ROLES.map(role => ({
        value: role, label: auth.ROLE_LABELS[role],
        description: auth.ROLE_DESCRIPTIONS[role], permissions: auth.permissionsFor(role)
      })),
      currentUserId: actor.id,
      degraded: Boolean(actor.degraded)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/users') {
    try {
      const payload = await parseBody(req, 100_000);
      const created = await auth.createUser({
        username: payload.username, email: payload.email,
        password: payload.password, role: payload.role, active: payload.active !== false
      });
      resetLegacyProbe();
      audit('user.created', { username: created.username, role: created.role }, actorLabel(actor));
      return json(res, 201, { ok: true, user: created });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'PATCH' && /^\/api\/admin\/users\/[^/]+$/.test(url.pathname)) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const payload = await parseBody(req, 100_000);
      const target = await auth.getUserById(id);
      if (!target) return json(res, 404, { ok: false, error: 'Compte introuvable.' });
      // Un propriétaire ne peut ni se désactiver, ni se rétrograder lui-même :
      // c'est le moyen le plus courant de se retrouver enfermé dehors.
      if (target.id === actor.id && (payload.active === false || (payload.role && payload.role !== 'proprietaire'))) {
        return json(res, 400, { ok: false, error: 'Vous ne pouvez pas désactiver ni rétrograder votre propre compte.' });
      }
      const willLoseOwner = target.role === 'proprietaire'
        && (payload.active === false || (payload.role && payload.role !== 'proprietaire'));
      if (willLoseOwner && (await auth.countActiveOwners(target.id)) === 0) {
        return json(res, 400, { ok: false, error: 'Il doit rester au moins un propriétaire actif.' });
      }
      const updated = await auth.updateUser(id, payload);
      audit('user.updated', { username: updated.username, role: updated.role, active: updated.active }, actorLabel(actor));
      return json(res, 200, { ok: true, user: updated });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'POST' && /^\/api\/admin\/users\/[^/]+\/mot-de-passe$/.test(url.pathname)) {
    try {
      const id = decodeURIComponent(url.pathname.split('/')[4]);
      const payload = await parseBody(req, 100_000);
      const target = await auth.getUserById(id);
      if (!target) return json(res, 404, { ok: false, error: 'Compte introuvable.' });
      await auth.setPassword(id, payload.password);
      audit('user.password_reset', { username: target.username }, actorLabel(actor));
      return json(res, 200, { ok: true, message: `Mot de passe de « ${target.username} » réinitialisé. Ses sessions ouvertes ont été fermées.` });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'DELETE' && /^\/api\/admin\/users\/[^/]+$/.test(url.pathname)) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const target = await auth.getUserById(id);
      if (!target) return json(res, 404, { ok: false, error: 'Compte introuvable.' });
      if (target.id === actor.id) return json(res, 400, { ok: false, error: 'Vous ne pouvez pas supprimer votre propre compte.' });
      if (target.role === 'proprietaire' && (await auth.countActiveOwners(target.id)) === 0) {
        return json(res, 400, { ok: false, error: 'Il doit rester au moins un propriétaire actif.' });
      }
      const removed = await auth.deleteUser(id);
      resetLegacyProbe();
      audit('user.deleted', { username: removed.username, role: removed.role }, actorLabel(actor));
      return json(res, 200, { ok: true, user: removed });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  // =========================================================================
  // NEWSLETTER — côté studio
  // =========================================================================
  if (req.method === 'GET' && url.pathname === '/api/admin/newsletter') {
    const status = text(url.searchParams.get('status') || 'all', 20);
    const search = text(url.searchParams.get('recherche') || '', 120);
    const [subscribers, counters, campaigns, queue, queueList] = await Promise.all([
      newsletter.listSubscribers({ status, search, limit: 2000 }),
      newsletter.counts(),
      newsletter.listCampaigns(30),
      mailer.queueStats(),
      mailer.listQueue(20)
    ]);
    return json(res, 200, {
      ok: true, subscribers, counters, campaigns,
      mail: { ...mailer.status(), queue, recent: queueList },
      // Non nul si une inscription a dû être écrite en fichier faute de base :
      // le studio doit le dire, sinon l'exploitant croit tout normal alors que
      // les abonnés récents ne sont pas dans MySQL.
      degradedWrite: newsletter.degradedWrite(),
      // Vrai si la base tourne encore sans la colonne « phone » : les numéros
      // WhatsApp ne sont alors pas enregistrés, et l'exploitant doit le savoir.
      phoneColumnMissing: newsletter.phoneColumnMissing(),
      publicUrl: publicBaseUrl(req)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/newsletter/export') {
    const subscribers = await newsletter.listSubscribers({ status: text(url.searchParams.get('status') || 'all', 20), limit: 5000 });
    const columns = ['email', 'name', 'phone', 'status', 'source', 'createdAt', 'confirmedAt', 'unsubscribedAt'];
    // Les numéros sont préfixés d'une apostrophe : sans elle, Excel lit
    // « +2250707… » comme une formule et affiche une erreur, et « 0707… »
    // perd son zéro initial.
    const quote = (value, key) => {
      const brut = String(value ?? '');
      const cellule = key === 'phone' && brut ? `'${brut}` : brut;
      return `"${cellule.replace(/"/g, '""')}"`;
    };
    const csv = '﻿' + [columns.join(';'), ...subscribers.map(item => columns.map(key => quote(item[key], key)).join(';'))].join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="newsletter-abonnes.csv"', 'Cache-Control': 'no-store' });
    audit('newsletter.exported', { count: subscribers.length }, actorLabel(actor));
    return res.end(csv);
  }

  if (req.method === 'PATCH' && /^\/api\/admin\/newsletter\/abonnes\/[^/]+$/.test(url.pathname)) {
    try {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const payload = await parseBody(req);
      const updated = await newsletter.setStatus(id, text(payload.status, 20));
      if (!updated) return json(res, 404, { ok: false, error: 'Abonné introuvable.' });
      audit('newsletter.subscriber_updated', { email: updated.email, status: updated.status }, actorLabel(actor));
      return json(res, 200, { ok: true, subscriber: updated });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'DELETE' && /^\/api\/admin\/newsletter\/abonnes\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const removed = await newsletter.removeSubscriber(id);
    if (!removed) return json(res, 404, { ok: false, error: 'Abonné introuvable.' });
    audit('newsletter.subscriber_deleted', { email: removed.email }, actorLabel(actor));
    return json(res, 200, { ok: true, subscriber: removed });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/newsletter/campagnes') {
    return json(res, 200, { ok: true, campaigns: await newsletter.listCampaigns(50) });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/newsletter/campagnes') {
    try {
      const payload = await parseBody(req, 500_000);
      const campaign = await newsletter.createCampaign({
        subject: payload.subject, bodyText: payload.bodyText, bodyHtml: payload.bodyHtml,
        createdBy: actor.username
      });
      audit('newsletter.campaign_created', { id: campaign.id, subject: campaign.subject }, actorLabel(actor));
      return json(res, 201, { ok: true, campaign: { id: campaign.id, subject: campaign.subject, status: campaign.status } });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'POST' && /^\/api\/admin\/newsletter\/campagnes\/[^/]+\/envoyer$/.test(url.pathname)) {
    try {
      const id = decodeURIComponent(url.pathname.split('/')[5]);
      const report = await sendCampaign(id, actor, req);
      return json(res, 200, { ok: true, report });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/newsletter/file/relancer') {
    const report = await mailer.flushQueue(100);
    audit('newsletter.queue_flushed', report, actorLabel(actor));
    return json(res, 200, { ok: !report.error, report, mail: { ...mailer.status(), queue: await mailer.queueStats() } });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/newsletter/test') {
    try {
      const payload = await parseBody(req);
      const to = newsletter.normalizeEmail(payload.email || mailer.readConfig().notifyTo);
      if (!newsletter.isValidEmail(to)) return json(res, 400, { ok: false, error: 'Adresse de test invalide.' });
      const check = await mailer.verify();
      const message = templates.smtpTest({ requestedBy: actor.username });
      const result = await mailer.deliver({ kind: 'test', to, subject: message.subject, html: message.html, text: message.text });
      audit('newsletter.test_sent', { to, sent: result.sent, error: result.error }, actorLabel(actor));
      return json(res, 200, { ok: result.sent, connection: check, result, mail: { ...mailer.status(), queue: await mailer.queueStats() } });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  return json(res, 404, { ok: false, error: 'Route API inconnue' });
}

// ===========================================================================
// ROUTES D'AUTHENTIFICATION
// ===========================================================================
async function handleAuthApi(req, res, url) {
  // --- Qui suis-je ? (appelée au chargement du studio) ---------------------
  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    const actor = await resolveActor(req);
    const noAccounts = await legacyKeyAllowed();
    if (!actor) {
      return json(res, 200, { ok: true, authenticated: false, setupRequired: noAccounts, degradedAvailable: noAccounts });
    }
    return json(res, 200, {
      ok: true, authenticated: true,
      user: {
        id: actor.id, username: actor.username, email: actor.email || '',
        role: actor.role, roleLabel: actor.roleLabel || auth.ROLE_LABELS[actor.role] || actor.role,
        permissions: actor.permissions || auth.permissionsFor(actor.role),
        degraded: Boolean(actor.degraded)
      },
      roles: auth.ROLES.map(role => ({ value: role, label: auth.ROLE_LABELS[role], description: auth.ROLE_DESCRIPTIONS[role] })),
      setupRequired: noAccounts
    });
  }

  // --- Connexion -----------------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    // Limitation de débit par IP, EN PLUS du verrouillage par compte : sans
    // elle, un attaquant essaierait un même mot de passe sur mille comptes
    // différents sans jamais déclencher le moindre verrou (« password spraying »).
    const limit = rateLimit(req, 'login', Number(process.env.LOGIN_RATE_MAX || 20), 15 * 60_000);
    if (!limit.allowed) {
      audit('auth.rate_limited', { ip: clientIp(req) });
      return json(res, 429, { ok: false, error: 'Trop de tentatives depuis cette adresse. Réessayez dans quelques minutes.' },
        { 'Retry-After': String(limit.retryAfter) });
    }

    let payload;
    try { payload = await parseBody(req, 20_000); }
    catch { return json(res, 400, { ok: false, error: 'Requête invalide.' }); }

    const ip = clientIp(req);
    const userAgent = text(req.headers['user-agent'], 255);

    // Connexion de secours par clé partagée — uniquement tant qu'aucun compte
    // n'existe. Journalisée systématiquement et signalée à l'interface.
    if (payload.key !== undefined && !payload.username) {
      if (!(await legacyKeyAllowed())) {
        return json(res, 401, { ok: false, error: 'La connexion par clé est désactivée : un compte utilisateur existe.' });
      }
      const provided = Buffer.from(String(payload.key || ''));
      const expected = Buffer.from(String(ADMIN_SECRET));
      const matches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
      if (!matches) {
        audit('auth.login_failed', { mode: 'cle', ip });
        return json(res, 401, { ok: false, error: auth.GENERIC_LOGIN_ERROR });
      }
      audit('auth.degraded_login', { ip, userAgent }, 'cle-de-secours');
      return json(res, 200, {
        ok: true, degraded: true,
        user: { id: LEGACY_ACTOR.id, username: LEGACY_ACTOR.username, role: LEGACY_ACTOR.role,
          roleLabel: LEGACY_ACTOR.roleLabel, permissions: LEGACY_ACTOR.permissions, degraded: true },
        message: 'Mode dégradé : accès par clé partagée. Créez un compte nominatif dès que possible.'
      });
    }

    const result = await auth.authenticate(payload.username, payload.password);
    if (!result.ok) {
      // Le détail (utilisateur inconnu / mot de passe faux / compte désactivé)
      // ne part QUE dans le journal. La réponse HTTP reste indifférenciée.
      audit('auth.login_failed', {
        username: result.username || text(payload.username, 60), reason: result.reason,
        attempts: result.attempts || 0, locked: Boolean(result.lockedUntil), ip
      });
      return json(res, 401, { ok: false, error: result.error, locked: Boolean(result.lockedUntil) });
    }

    const session = await auth.createSession(result.user.id, { ip, userAgent });
    audit('auth.login', { username: result.user.username, role: result.user.role, ip }, result.user.username);
    return json(res, 200, {
      ok: true,
      user: { ...result.user, permissions: auth.permissionsFor(result.user.role), degraded: false },
      expiresAt: session.expiresAt
    }, { 'Set-Cookie': sessionCookie(req, session.token, session.ttlSeconds) });
  }

  // --- Déconnexion : la session est réellement détruite côté serveur -------
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      const resolved = await auth.resolveSession(token).catch(() => null);
      await auth.deleteSession(token).catch(() => {});
      if (resolved) audit('auth.logout', { username: resolved.actor.username }, resolved.actor.username);
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearedSessionCookie(req) });
  }

  // --- Changement de son propre mot de passe -------------------------------
  if (req.method === 'POST' && url.pathname === '/api/auth/mot-de-passe') {
    const actor = await resolveActor(req);
    if (!actor || actor.degraded) {
      return json(res, 401, { ok: false, error: 'Connectez-vous avec un compte nominatif pour changer un mot de passe.' });
    }
    try {
      const payload = await parseBody(req, 20_000);
      // Demande du 17/09/2026 : l'ancien mot de passe est facultatif (oublié).
      // En contrepartie, un e-mail d'alerte part à l'adresse du compte.
      const sansActuel = !String(payload.currentPassword || '');
      if (!sansActuel) {
        const check = await auth.authenticate(actor.username, payload.currentPassword);
        if (!check.ok) return json(res, 401, { ok: false, error: 'Mot de passe actuel incorrect.' });
      }
      await auth.setPassword(actor.id, payload.newPassword);
      audit('auth.password_changed', { username: actor.username, sansMotDePasseActuel: sansActuel }, actor.username);
      alerterChangementMotDePasse(actor, { withoutCurrent: sansActuel }).catch(() => {});
      // setPassword ferme toutes les sessions : le cookie courant est effacé.
      return json(res, 200, { ok: true, message: 'Mot de passe modifié. Reconnectez-vous.' },
        { 'Set-Cookie': clearedSessionCookie(req) });
    } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  }

  // ---- Mot de passe oublié : lien par e-mail (17/09/2026) ----
  if (req.method === 'POST' && url.pathname === '/api/auth/mot-de-passe-oublie') {
    const limite = rateLimit(req, 'mot-de-passe-oublie', 5);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de demandes : réessayez dans quelques minutes.' });
    // Même réponse que le compte existe ou non : personne ne peut s'en servir
    // pour deviner les noms d'utilisateur ou les adresses du studio.
    const reponse = { ok: true, message: 'Si un compte actif correspond et possède une adresse e-mail, un lien pour choisir un nouveau mot de passe vient d’y être envoyé. Il est valable 1 heure.' };
    try {
      const payload = await parseBody(req, 2_000);
      const demande = await auth.createPasswordReset(payload.identifiant);
      if (!demande) {
        audit('auth.reset_sans_compte', { ip: clientIp(req) });
        return json(res, 200, reponse);
      }
      const lien = `${publicBaseUrl(req)}/admin.html#reinitialiser=${encodeURIComponent(demande.token)}`;
      const message = templates.passwordReset({ username: demande.user.username, resetUrl: lien, expiresMinutes: Math.round(auth.RESET_TTL_MS / 60000) });
      const envoi = await mailer.deliver({ kind: 'reinitialisation-mot-de-passe', to: demande.user.email, subject: message.subject, html: message.html, text: message.text });
      audit(envoi.sent ? 'auth.reset_envoye' : 'auth.reset_en_file', { username: demande.user.username, ip: clientIp(req), ...(envoi.sent ? {} : { error: envoi.error }) });
    } catch (error) {
      audit('auth.reset_echec', { error: text(error.message, 300) });
    }
    return json(res, 200, reponse);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/reinitialiser') {
    const limite = rateLimit(req, 'reinitialiser', 10);
    if (!limite.allowed) return json(res, 429, { ok: false, error: 'Trop de tentatives : réessayez dans quelques minutes.' });
    try {
      const payload = await parseBody(req, 5_000);
      const user = await auth.consumePasswordReset(payload.token, payload.newPassword);
      audit('auth.password_reset', { username: user.username, ip: clientIp(req) }, user.username);
      alerterChangementMotDePasse(user, { byReset: true }).catch(() => {});
      return json(res, 200, { ok: true, message: 'Mot de passe modifié : connectez-vous avec le nouveau.' });
    } catch (error) { return json(res, 400, { ok: false, error: text(error.message, 300) }); }
  }

  return json(res, 404, { ok: false, error: 'Route d’authentification inconnue' });
}

/** E-mail de sécurité après un changement de mot de passe (si le compte a une adresse). */
async function alerterChangementMotDePasse(user, options = {}) {
  if (!user?.email) return;
  const message = templates.passwordChanged({ username: user.username, when: new Date(), ...options });
  const envoi = await mailer.deliver({ kind: 'alerte-mot-de-passe', to: user.email, subject: message.subject, html: message.html, text: message.text });
  if (!envoi.sent) audit('auth.alerte_mot_de_passe_en_file', { username: user.username, error: envoi.error });
}

// ===========================================================================
// NEWSLETTER — côté visiteur (double opt-in)
// ===========================================================================

/** Adresse publique du site, pour construire les liens des e-mails. */
function publicBaseUrl(req) {
  if (PUBLIC_SITE_URL) return PUBLIC_SITE_URL;
  const host = text(req?.headers?.host, 200) || `localhost:${PORT}`;
  const protocol = req && requestIsSecure(req) ? 'https' : 'http';
  return `${protocol}://${host}`;
}

/**
 * Page de résultat autonome (confirmation, désabonnement, erreur de jeton).
 * Elle est rendue par le serveur et n'appartient à aucune des sept pages
 * publiques : celles-ci ne sont pas touchées.
 */
function newsletterResultPage({ title, heading, message, tone = 'ok', backUrl }) {
  const accent = tone === 'ok' ? '#e8b904' : '#8a1c1c';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${templates.escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:2rem 1rem;
         font-family:'DM Sans','Segoe UI',system-ui,sans-serif; color:#151837; background:#f4f5f9; }
  .carte { width:min(560px,100%); background:#fff; border:1px solid #e2e4ec; border-top:4px solid ${accent}; padding:2.5rem 2rem; }
  .marque { margin:0 0 1.6rem; font-size:.7rem; font-weight:800; letter-spacing:.18em; color:#5b6070; text-transform:uppercase; }
  h1 { margin:0 0 1rem; font:600 1.6rem/1.25 Georgia,'Times New Roman',serif; }
  p { margin:0 0 1rem; font-size:.95rem; line-height:1.7; color:#39405a; }
  a.retour { display:inline-block; margin-top:.8rem; padding:.85rem 1.4rem; background:#151837; color:#fff;
             font-size:.82rem; font-weight:700; text-decoration:none; }
  footer { margin-top:1.8rem; padding-top:1.2rem; border-top:1px solid #e2e4ec; font-size:.75rem; color:#5b6070; }
</style>
</head>
<body>
  <main class="carte">
    <p class="marque">Henri &amp; Philippe — Assinie</p>
    <h1>${templates.escapeHtml(heading)}</h1>
    <p>${message}</p>
    <a class="retour" href="${templates.escapeHtml(backUrl)}">Retour au site</a>
    <footer>Une question&nbsp;? Écrivez-nous à <a href="mailto:contact@henri-philippe.com" style="color:#151837;">contact@henri-philippe.com</a>.</footer>
  </main>
</body>
</html>`;
}

/**
 * Traite les routes publiques de la newsletter.
 * Retourne `true` si la requête a été prise en charge, `false` sinon (auquel
 * cas la suite de handleApi continue son chemin).
 */
async function handlePublicNewsletter(req, res, url) {
  const base = publicBaseUrl(req);

  // --- Inscription -------------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/api/newsletter') {
    // Limitation stricte par IP : 5 inscriptions par heure. Au-delà, il ne
    // s'agit plus d'un visiteur mais d'un robot qui remplit la liste.
    const limit = rateLimit(req, 'newsletter', Number(process.env.NEWSLETTER_RATE_MAX || 5), 3_600_000);
    if (!limit.allowed) {
      audit('newsletter.rate_limited', { ip: clientIp(req) });
      const trop = 'Trop de demandes envoyées depuis cette adresse. Réessayez plus tard.';
      if (wantsHtmlResponse(req)) {
        html(res, 429, newsletterResultPage({
          title: 'Trop de demandes',
          heading: 'Trop de demandes depuis cette connexion',
          tone: 'erreur',
          message: trop,
          backUrl: `${base}/index.html`
        }), { 'Retry-After': String(limit.retryAfter) });
        return true;
      }
      json(res, 429, { ok: false, error: trop }, { 'Retry-After': String(limit.retryAfter) });
      return true;
    }
    try {
      const payload = await parseBody(req, 50_000);
      const email = newsletter.normalizeEmail(payload.email);
      if (!newsletter.isValidEmail(email)) {
        // Sans JavaScript, le visiteur attend une page : lui répondre en JSON
        // afficherait une accolade nue dans son navigateur.
        if (wantsHtmlResponse(req)) {
          html(res, 400, newsletterResultPage({
            title: 'Adresse non valide',
            heading: 'Cette adresse e-mail n’est pas valide',
            tone: 'erreur',
            message: 'Vérifiez votre saisie (une seule arobase, un domaine complet) puis réessayez depuis le site.',
            backUrl: `${base}/index.html`
          }));
          return true;
        }
        json(res, 400, { ok: false, error: 'Adresse e-mail invalide.' });
        return true;
      }
      // Téléphone facultatif : une saisie manifestement erronée est signalée,
      // un champ vide ne bloque rien.
      if (!newsletter.isValidPhone(payload.phone)) {
        const message = 'Numéro WhatsApp invalide : indiquez l’indicatif pays, par exemple +225 07 07 12 34 56.';
        if (wantsHtmlResponse(req)) {
          html(res, 400, newsletterResultPage({
            title: 'Numéro non valide',
            heading: 'Ce numéro WhatsApp n’est pas valide',
            tone: 'erreur',
            message: 'Indiquez votre numéro WhatsApp avec son indicatif pays — par exemple +225 07 07 12 34 56 — ou laissez le champ vide : il est facultatif. Sans indicatif, nous ne pourrions pas vous joindre sur WhatsApp.',
            backUrl: `${base}/index.html`
          }));
          return true;
        }
        json(res, 400, { ok: false, error: message });
        return true;
      }
      const result = await newsletter.subscribe({
        email, name: text(payload.name, 120), phone: text(payload.phone, 40),
        source: text(payload.source, 60) || 'site', ip: clientIp(req)
      });

      let mail = { sent: false, queued: false, error: null };
      if (result.confirmToken) {
        const confirmUrl = `${base}/api/newsletter/confirmer?token=${encodeURIComponent(result.confirmToken)}`;
        const message = templates.newsletterConfirmation({ name: result.subscriber.name, confirmUrl });
        mail = await mailer.deliver({
          kind: 'newsletter-confirmation', to: email,
          subject: message.subject, html: message.html, text: message.text
        });
      }
      audit('newsletter.subscribed', {
        email, created: result.created, alreadyConfirmed: result.alreadyConfirmed,
        mailSent: mail.sent, mailQueued: mail.queued
      });

      // Message IDENTIQUE dans tous les cas : il ne doit pas révéler si une
      // adresse est déjà inscrite (ce serait un moyen de tester des adresses).
      const message = 'Merci. Si cette adresse est valide, vous allez recevoir un e-mail de confirmation. '
        + 'Votre inscription ne sera effective qu’après avoir cliqué sur le lien qu’il contient.';
      if (wantsHtmlResponse(req)) {
        html(res, 200, newsletterResultPage({
          title: 'Inscription enregistrée',
          heading: 'Votre demande est enregistrée',
          message,
          backUrl: `${base}/index.html`
        }));
        return true;
      }
      json(res, 202, { ok: true, message, pendingDelivery: Boolean(result.confirmToken) && !mail.sent });
      return true;
    } catch (error) {
      // Une adresse invalide est une faute de saisie : on le dit au visiteur.
      // Tout le reste est une panne de notre côté (table absente, base
      // injoignable) : le message technique ne le regarde pas et ne doit pas
      // sortir — il décrirait notre schéma à un attaquant. L'incident part
      // dans les journaux et l'audit, où l'exploitant le verra.
      const invalide = /adresse e-mail invalide/i.test(error.message || '');
      if (!invalide) {
        console.error(`[newsletter] Inscription en échec : ${error.message}`);
        audit('newsletter.subscribe_failed', { error: error.message, savedToFile: Boolean(error.savedToFile) });
      }
      const visible = invalide
        ? 'Adresse e-mail invalide.'
        : 'Inscription momentanément indisponible. Merci de réessayer dans quelques minutes.';
      if (wantsHtmlResponse(req)) {
        html(res, invalide ? 400 : 503, newsletterResultPage({
          title: 'Inscription impossible',
          heading: 'Nous n’avons pas pu enregistrer votre adresse',
          tone: 'erreur',
          message: visible,
          backUrl: `${base}/index.html`
        }));
        return true;
      }
      json(res, invalide ? 400 : 503, { ok: false, error: visible });
      return true;
    }
  }

  // --- Confirmation (2e étape du double opt-in) --------------------------
  if (req.method === 'GET' && url.pathname === '/api/newsletter/confirmer') {
    const token = url.searchParams.get('token') || '';
    const result = await newsletter.confirm(token);
    if (!result.ok) {
      audit('newsletter.confirm_failed', { reason: result.reason, ip: clientIp(req) });
      html(res, 404, newsletterResultPage({
        title: 'Lien de confirmation invalide',
        heading: 'Ce lien n’est plus valable',
        tone: 'erreur',
        message: 'Le lien de confirmation est incorrect, expiré, ou a déjà été utilisé. Vous pouvez vous inscrire à nouveau depuis la page d’accueil du site.',
        backUrl: `${base}/index.html`
      }));
      return true;
    }
    // Message de bienvenue, avec son lien de désabonnement — jamais bloquant.
    const unsubscribeUrl = `${base}/api/newsletter/desabonnement?token=${encodeURIComponent(newsletter.unsubscribeTokenFor(result.subscriber.id))}`;
    const welcome = templates.newsletterWelcome({ name: result.subscriber.name, unsubscribeUrl, siteUrl: base });
    mailer.deliver({ kind: 'newsletter-bienvenue', to: result.subscriber.email, subject: welcome.subject, html: welcome.html, text: welcome.text }).catch(() => {});
    audit('newsletter.confirmed', { email: result.subscriber.email });
    html(res, 200, newsletterResultPage({
      title: 'Inscription confirmée',
      heading: 'Votre inscription est confirmée',
      message: 'Vous recevrez désormais nos actualités : nouvelles villas, terrains disponibles et informations pratiques. Chaque message contient un lien de désabonnement.',
      backUrl: `${base}/index.html`
    }));
    return true;
  }

  // --- Désabonnement (obligation légale : lien présent dans chaque envoi) --
  if (req.method === 'GET' && url.pathname === '/api/newsletter/desabonnement') {
    const token = url.searchParams.get('token') || '';
    const result = await newsletter.unsubscribe(token);
    if (!result.ok) {
      html(res, 404, newsletterResultPage({
        title: 'Lien de désabonnement invalide',
        heading: 'Ce lien n’est pas reconnu',
        tone: 'erreur',
        message: 'Nous n’avons pas pu identifier votre inscription. Écrivez-nous à <a href="mailto:contact@henri-philippe.com" style="color:#151837;">contact@henri-philippe.com</a> et nous retirerons votre adresse manuellement.',
        backUrl: `${base}/index.html`
      }));
      return true;
    }
    audit('newsletter.unsubscribed', { email: result.subscriber.email, already: Boolean(result.already) });
    html(res, 200, newsletterResultPage({
      title: 'Désabonnement pris en compte',
      heading: result.already ? 'Vous étiez déjà désabonné' : 'Désabonnement effectué',
      message: 'Votre adresse ne recevra plus nos actualités. Cette décision est immédiate et définitive tant que vous ne vous réinscrivez pas vous-même depuis le site.',
      backUrl: `${base}/index.html`
    }));
    return true;
  }

  return false;
}

// ===========================================================================
// ENVOIS SORTANTS
// ===========================================================================

/**
 * Notification interne d'une nouvelle demande client.
 * Aucun `throw` ne sort d'ici : l'appelant l'invoque en « tire et oublie ».
 */
async function notifyNewLead(lead, req) {
  try {
    const to = mailer.readConfig().notifyTo;
    if (!to) return;
    const message = templates.leadNotification({ lead, siteUrl: publicBaseUrl(req) });
    const result = await mailer.deliver({
      kind: 'demande-client', to, subject: message.subject, html: message.html, text: message.text,
      // Répondre à la notification doit écrire au client, pas à soi-même.
      replyTo: lead.email || undefined
    });
    if (!result.sent) audit('lead.notification_queued', { leadId: lead.id, error: result.error });
  } catch (error) {
    audit('lead.notification_failed', { leadId: lead?.id, error: text(error.message, 300) });
  }
}

// Demandes du simulateur de devis (js/app.js, initSimulator).
const TYPES_DEMANDE_SIMULATEUR = new Set(['devis-whatsapp', 'devis-activites']);

/**
 * E-mail au client : sa demande de réservation est prise en charge.
 * Seulement pour le simulateur, et seulement si une adresse a été saisie
 * (champ facultatif). Aucun `throw` ne sort d'ici.
 */
async function confirmLeadToClient(lead, req) {
  try {
    if (!lead?.email || !TYPES_DEMANDE_SIMULATEUR.has(lead.type)) return;
    const message = templates.leadConfirmation({ lead, siteUrl: publicBaseUrl(req) });
    const result = await mailer.deliver({
      kind: 'confirmation-demande', to: lead.email,
      subject: message.subject, html: message.html, text: message.text
    });
    audit(result.sent ? 'lead.confirmation_sent' : 'lead.confirmation_queued',
      { leadId: lead.id, ...(result.sent ? {} : { error: result.error }) });
  } catch (error) {
    audit('lead.confirmation_failed', { leadId: lead?.id, error: text(error.message, 300) });
  }
}

// ===========================================================================
// NOTIFICATIONS DE L'APPLICATION MOBILE (service Expo)
// Tout est « tire et oublie » : une notification qui échoue ne doit jamais
// faire échouer une publication, une synchronisation ou une demande.
// ===========================================================================
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function envoyerLotsExpo(lots, origine) {
  let envoyes = 0;
  const perimes = [];
  for (const lot of lots) {
    try {
      const reponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
        },
        body: JSON.stringify(lot),
        signal: AbortSignal.timeout(15_000)
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw new Error(`Expo ${reponse.status}`);
      envoyes += lot.length;
      perimes.push(...NOTIF.jetonsPerimes(lot, corps));
    } catch (error) {
      audit('app.notification_failed', { origine, error: text(error.message, 300) });
    }
  }
  if (perimes.length) writeJSON(APP_APPAREILS_FILE, NOTIF.retirerAppareils(readJSON(APP_APPAREILS_FILE, {}), perimes));
  return { envoyes, perimes: perimes.length };
}

/** Annonce aux téléphones inscrits les annonces apparues depuis le dernier passage. */
async function notifierNouveautesApp(origine) {
  try {
    const contenu = contenuPublic(await store.readContent());
    const exclues = new Set(originesPublications().keys());
    const annonces = NOTIF.annoncesPubliques(contenu, { publicationsExclues: exclues });
    const etat = readJSON(APP_NOTIF_FILE, {});
    const { etat: suivant, nouvelles } = NOTIF.detecterNouveautes(etat, annonces);
    writeJSON(APP_NOTIF_FILE, { ...readJSON(APP_NOTIF_FILE, {}), amorce: suivant.amorce, amorceAt: suivant.amorceAt, cles: suivant.cles, dernierPassage: suivant.dernierPassage });
    if (!nouvelles.length) return;
    const resultat = await envoyerLotsExpo(NOTIF.lotsNouveautes(readJSON(APP_APPAREILS_FILE, {}), nouvelles), origine);
    audit('app.nouveautes_notifiees', { origine, annonces: nouvelles.map(a => a.cle).slice(0, 20), ...resultat });
  } catch (error) {
    audit('app.notification_failed', { origine, error: text(error.message, 300) });
  }
}

/** Prévient le téléphone d'origine quand le studio fait avancer une demande. */
async function notifierSuiviDemandeApp(lead) {
  try {
    const memoire = readJSON(APP_NOTIF_FILE, {});
    const demandes = memoire.demandes && typeof memoire.demandes === 'object' ? memoire.demandes : {};
    if (!lead || !demandes[lead.id]) return;
    const { suivi, message } = NOTIF.suiviDemande(demandes[lead.id], lead.status);
    writeJSON(APP_NOTIF_FILE, { ...memoire, demandes: { ...demandes, [lead.id]: suivi } });
    if (!message) return;
    const resultat = await envoyerLotsExpo([[message]], 'suivi-demande');
    audit('app.suivi_notifie', { leadId: lead.id, status: lead.status, ...resultat });
  } catch (error) {
    audit('app.notification_failed', { origine: 'suivi-demande', error: text(error.message, 300) });
  }
}

/**
 * Envoi d'une campagne, par lots.
 *
 * Deux garde-fous :
 *   · lots de NEWSLETTER_BATCH_SIZE messages espacés de NEWSLETTER_BATCH_DELAY_MS,
 *     pour ne pas déclencher les limites d'envoi d'un hébergement mutualisé ;
 *   · chaque message porte SON lien de désabonnement et l'en-tête
 *     List-Unsubscribe, exigés par la loi et par les filtres anti-spam.
 * Sans SMTP, rien n'échoue : tout part en file d'attente et le studio l'indique.
 */
async function sendCampaign(campaignId, actor, req) {
  const campaign = await newsletter.getCampaign(campaignId);
  if (!campaign) throw new Error('Campagne introuvable.');
  if (campaign.status === 'envoye') throw new Error('Cette campagne a déjà été envoyée.');

  const recipients = await newsletter.confirmedRecipients();
  if (!recipients.length) throw new Error('Aucun abonné confirmé : il n’y a personne à qui envoyer.');

  const base = publicBaseUrl(req);
  const batchSize = Math.max(1, Math.min(Number(process.env.NEWSLETTER_BATCH_SIZE || 25), 100));
  const batchDelay = Math.max(0, Math.min(Number(process.env.NEWSLETTER_BATCH_DELAY_MS || 1000), 10_000));

  await newsletter.updateCampaign(campaign.id, { status: 'en-cours' });

  let sent = 0;
  let queued = 0;
  const failures = [];

  for (let index = 0; index < recipients.length; index += batchSize) {
    const batch = recipients.slice(index, index + batchSize);
    for (const recipient of batch) {
      const unsubscribeUrl = `${base}/api/newsletter/desabonnement?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
      const message = templates.newsletterCampaign({
        subject: campaign.subject, bodyHtml: campaign.bodyHtml, bodyText: campaign.bodyText, unsubscribeUrl
      });
      const result = await mailer.deliverCampaignMessage({
        kind: 'newsletter-campagne', to: recipient.email,
        subject: message.subject, html: message.html, text: message.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:contact@henri-philippe.com?subject=desabonnement>`,
          'Auto-Submitted': 'auto-generated'
        }
      });
      if (result.sent) sent += 1;
      else {
        queued += 1;
        if (failures.length < 10) failures.push({ email: recipient.email, error: result.error });
      }
    }
    if (batchDelay && index + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  const status = sent === recipients.length ? 'envoye' : sent > 0 ? 'partiel' : 'erreur';
  await newsletter.updateCampaign(campaign.id, { status, sentCount: sent, sentAt: new Date().toISOString() });
  audit('newsletter.campaign_sent', {
    id: campaign.id, subject: campaign.subject, recipients: recipients.length, sent, queued, status
  }, actorLabel(actor));

  return {
    campaignId: campaign.id, subject: campaign.subject, status,
    recipients: recipients.length, sent, queued, batchSize, failures,
    smtpConfigured: mailer.isConfigured(),
    message: sent === recipients.length
      ? `Campagne envoyée à ${sent} abonné(s) confirmé(s).`
      : sent > 0
        ? `${sent} message(s) envoyé(s), ${queued} en file d’attente (voir l’état de la messagerie).`
        : `Aucun envoi n’a pu partir : ${queued} message(s) sont en file d’attente. Vérifiez la configuration SMTP puis relancez la file.`
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // La sonde MySQL doit avoir répondu AVANT de traiter la moindre requête API.
  // Sans cette attente, la première requête d'un processus fraîchement démarré
  // voit `databaseReady === false` et bascule sur les fichiers JSON : session
  // introuvable (déconnexion) et écritures perdues hors de la base.
  // Sous Passenger, l'application est relancée à la demande : le cas n'est pas
  // théorique, il se produit à chaque réveil du processus.
  if (url.pathname.startsWith('/api/')) {
    await ensureDatabaseProbed();
    return handleApi(req, res, url);
  }

  const notFound = () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders(false) });
    res.end('404 — Page introuvable');
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound();

  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch { return notFound(); }
  if (requested === '/' || requested === '') requested = '/index.html';
  if (requested.includes('\0')) return notFound();

  const relative = requested.replace(/^\/+/, '');
  // 1) barrière logique (liste blanche d'extensions + liste noire de préfixes)
  if (!isServablePath(relative)) return notFound();

  // 2) barrière physique (aucune sortie de la racine, même via ../ encodé)
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) return notFound();

  fs.readFile(filePath, (error, data) => {
    if (error) return notFound();
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    const normalizedPath = relative.replace(/\\/g, '/');
    // Cache long UNIQUEMENT sur assets/ : ce sont des fichiers ajoutés, jamais
    // modifiés sur place. En revanche css/ et js/ n'ont pas de nom versionné :
    // les mettre en cache long servirait du code périmé après une mise à jour.
    // Exception : assets/app/ (icônes de l'application), régénérées sous le
    // même nom quand le logo haute définition arrive.
    const isAsset = /^assets\//i.test(normalizedPath) && !/^assets\/app\//i.test(normalizedPath);
    const isCode = /^(css|js)\//i.test(normalizedPath);
    // Service worker et manifeste : toujours revalidés. Un sw.js gardé une
    // heure en cache retarderait d'autant chaque correction de l'application.
    const isApp = normalizedPath === 'sw.js' || normalizedPath === 'manifest.webmanifest';
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      ...securityHeaders(isHtml),
      'Cache-Control': isApp ? 'no-cache'
        : isAsset
          ? 'public, max-age=31536000, immutable'
          : (isHtml || isCode) ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  });
});

/**
 * Sonde MySQL au démarrage. Tant que `databaseReady` est faux, toutes les
 * lectures/écritures passent par les fichiers JSON : une base absente ou mal
 * configurée ne peut donc jamais empêcher le site de démarrer.
 */
/**
 * Sonde MySQL exécutée UNE SEULE FOIS, partagée par toutes les requêtes.
 *
 * `ensureDatabaseProbed()` est appelé en tête de chaque requête API : la
 * première attend réellement la sonde, les suivantes reçoivent la promesse
 * déjà résolue et ne coûtent rien. C'est ce qui garantit qu'aucune requête ne
 * peut être servie pendant que `databaseReady` vaut encore `false`.
 */
let databaseProbe = null;
let sondeEnCours = false;
let dernierEssaiSonde = 0;
const DELAI_NOUVELLE_SONDE_MS = 10_000;
function ensureDatabaseProbed() {
  // Une sonde qui ÉCHOUE ne doit pas être définitive. Sans cela, un worker
  // démarré pendant une indisponibilité de MySQL servait le reste de sa vie en
  // mode fichiers, silencieusement. On réessaie donc, au plus une fois toutes
  // les 10 s pour ne pas marteler la base.
  const doitReessayer = databaseProbe
    && !sondeEnCours
    && Boolean(loadRepository()) && !databaseReady
    && Date.now() - dernierEssaiSonde > DELAI_NOUVELLE_SONDE_MS;
  if (!databaseProbe || doitReessayer) {
    sondeEnCours = true;
    dernierEssaiSonde = Date.now();
    databaseProbe = initDatabase()
      .catch(error => { console.warn(`Initialisation MySQL : ${error.message}`); })
      .then(() => reportAuthState())
      .catch(() => {})
      .finally(() => { sondeEnCours = false; });
  }
  return databaseProbe;
}

async function initDatabase() {
  const repo = loadRepository();
  if (!repo) {
    console.log('Stockage : fichiers JSON (data/). DB_HOST non défini — mode local / secours.');
    return;
  }
  const health = await repo.ping();
  databaseReady = health.ok;
  if (health.ok) {
    databaseError = null;
    const target = repo.describe();
    console.log(`Stockage : MySQL ${target.user}@${target.host}:${target.port}/${target.database} (repli JSON actif en cas de panne).`);
  } else {
    databaseError = health.error;
    console.warn(`MySQL injoignable (${health.error}). Repli sur les fichiers JSON.`);
  }
}

/**
 * Contrôle de l'état des comptes au démarrage : tant qu'aucun compte n'existe,
 * la clé de secours ouvre encore le studio. On le dit clairement dans les logs
 * plutôt que de laisser croire que l'authentification est en place.
 */
async function reportAuthState() {
  let total = 0;
  try { total = await auth.countUsers(); } catch { total = 0; }
  if (total === 0) {
    console.warn('Comptes : AUCUN. Le studio accepte encore la clé ADMIN_SECRET (mode dégradé).');
    console.warn('          Créez le premier compte : node scripts/creer-utilisateur.js --username <nom> --role proprietaire');
  } else {
    console.log(`Comptes : ${total} compte(s) actif(s). La connexion par clé partagée est désactivée.`);
  }
  const mail = mailer.status();
  console.log(mail.configured
    ? `Messagerie : SMTP ${mail.host}:${mail.port}${mail.driverAvailable ? '' : ' — module nodemailer ABSENT, envois en file d’attente'}`
    : 'Messagerie : SMTP non configuré. Les e-mails sont mis en file d’attente, rien n’est perdu.');
}

server.listen(PORT, () => {
  console.log(`Détente & Loisirs : http://localhost:${PORT}`);
  // Lancée ici pour que les journaux de démarrage s'affichent tout de suite ;
  // les requêtes API l'attendent de toute façon via `ensureDatabaseProbed()`.
  ensureDatabaseProbed();

  // Purge des sessions expirées : sans elle, la table `sessions` (ou le
  // fichier data/sessions.json) grossirait indéfiniment.
  auth.purgeExpiredSessions().catch(() => {});
  const sessionTimer = setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 30 * 60_000);
  sessionTimer.unref();

  // Relance périodique de la file d'attente e-mail : dès que le SMTP devient
  // joignable, les messages en souffrance repartent sans intervention.
  if (mailer.isConfigured()) {
    const mailTimer = setInterval(() => mailer.flushQueue(25).catch(() => {}), 10 * 60_000);
    mailTimer.unref();
  }
  console.log(PAGE_ID && PAGE_TOKEN ? 'Passerelle Facebook connectée' : 'Passerelle Facebook prête, identifiants Meta manquants');
  if (PAGE_ID && PAGE_TOKEN) {
    syncFacebookPosts('demarrage').catch(() => {});
    const facebookTimer = setInterval(() => syncFacebookPosts('planifiee').catch(() => {}), META_SYNC_INTERVAL_MS);
    facebookTimer.unref();
  } else {
    updateFacebookState({ status: 'non-configure', lastError: null });
  }
});
