#!/usr/bin/env node
/**
 * Importe le contenu des fichiers JSON vers MySQL.
 *
 *   npm run seed                  import complet
 *   npm run seed -- --no-webp     sans réécriture des chemins d'images
 *   npm run seed -- --dry-run     simulation, aucune écriture
 *
 * Sources :
 *   data/site-content.json  → villas, terrains, activities, reviews, faq, settings, facebookPosts
 *   data/leads.json         → leads
 *   data/audit-log.json     → audit_log (facultatif)
 *   data/image-manifest.json (facultatif, produit par le designer)
 *       → réécrit les chemins d'images vers les versions WebP optimisées.
 *
 * IDEMPOTENT : tout passe par INSERT ... ON DUPLICATE KEY UPDATE.
 * Relancer le script met la base à jour sans créer de doublon.
 * Contrairement à une publication depuis l'admin, ce script ne SUPPRIME rien :
 * une fiche retirée du JSON reste en base (retrait volontaire, pour ne jamais
 * perdre de données lors d'un import).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../db/env').load();
const pool = require('../db/pool');
const repo = require('../db/repository');

const DATA_DIR = path.join(__dirname, '..', 'data');
const args = new Set(process.argv.slice(2));
const USE_WEBP = !args.has('--no-webp');
const DRY_RUN = args.has('--dry-run');

const EURO_RATE = 655.957;
const LAND_STATUS = {
  'titre-foncier': 'Titre foncier',
  'acd': 'ACD (Arrêté de Concession Définitive)',
  'lettre-attribution': 'Lettre d’attribution',
  'certificat-propriete': 'Certificat de propriété'
};
const TERRAIN_STATUS = ['disponible', 'reserve', 'vendu'];
const TERRAIN_UTILITIES = ['eau', 'electricite', 'voie-bitumee', 'assainissement', 'cloture', 'borne'];

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return fallback; }
}

// --------------------------------------------------------------------------
// Réécriture des chemins d'images vers les WebP optimisées
// --------------------------------------------------------------------------
function buildImageRewriter() {
  const manifest = readJSON('image-manifest.json', null);
  const stats = { rewritten: 0, untouched: 0, available: 0 };
  if (!USE_WEBP || !manifest || typeof manifest !== 'object') {
    return { rewrite: value => { stats.untouched += 1; return value; }, stats, active: false };
  }
  stats.available = Object.keys(manifest).length;
  return {
    active: true,
    stats,
    rewrite(value) {
      const source = String(value || '').trim();
      if (!source) return source;
      const entry = manifest[source] || manifest[source.replace(/^\.?\//, '')];
      const webp = entry?.webp;
      if (!webp) { stats.untouched += 1; return source; }
      // On privilégie la plus grande variante disponible : le navigateur
      // choisira la bonne taille via le srcset côté front, et la base garde
      // une image de référence de bonne qualité.
      const best = webp['1600'] || webp['960'] || webp['480'] || Object.values(webp)[0];
      if (!best) { stats.untouched += 1; return source; }
      stats.rewritten += 1;
      return String(best);
    }
  };
}

function rewriteList(list, rewriter) {
  return (Array.isArray(list) ? list : []).map(value => rewriter.rewrite(value)).filter(Boolean);
}

// --------------------------------------------------------------------------
// Normalisation (mêmes règles que validateAndSanitizeContent côté serveur)
// --------------------------------------------------------------------------
function slug(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return normalized || fallback;
}

function normalizeTerrain(item, index, rewriter, problems) {
  const title = String(item?.title || '').trim();
  const id = slug(item?.id || title, `terrain-${index + 1}`);
  const areaSqm = Math.round(Number(item?.areaSqm) || 0);
  const priceTotal = Math.round(Number(item?.priceTotal) || 0);
  const landStatus = LAND_STATUS[item?.landStatus] ? item.landStatus : 'titre-foncier';
  if (!LAND_STATUS[item?.landStatus]) problems.push(`Terrain ${id} : statut foncier « ${item?.landStatus} » inconnu, remplacé par titre-foncier.`);
  const status = TERRAIN_STATUS.includes(item?.status) ? item.status : 'disponible';
  if (item?.status && !TERRAIN_STATUS.includes(item.status)) problems.push(`Terrain ${id} : statut « ${item.status} » inconnu, remplacé par disponible.`);
  const utilities = (Array.isArray(item?.utilities) ? item.utilities : []).filter(value => {
    if (TERRAIN_UTILITIES.includes(value)) return true;
    problems.push(`Terrain ${id} : viabilisation « ${value} » ignorée.`);
    return false;
  });
  if (!areaSqm) problems.push(`Terrain ${id} : superficie nulle, prix au m² impossible à calculer.`);
  return {
    ...item, id, title,
    reference: String(item?.reference || '').slice(0, 40),
    location: String(item?.location || '').slice(0, 240),
    district: String(item?.district || '').slice(0, 120),
    areaSqm, priceTotal,
    // Recalcul systématique, jamais repris du fichier.
    pricePerSqm: areaSqm ? Math.round(priceTotal / areaSqm) : 0,
    priceEuro: Math.round(priceTotal / EURO_RATE),
    landStatus, landStatusLabel: LAND_STATUS[landStatus], utilities, status,
    images: rewriteList(item?.images, rewriter),
    highlights: Array.isArray(item?.highlights) ? item.highlights : [],
    visible: item?.visible !== false, featured: Boolean(item?.featured)
  };
}

// --------------------------------------------------------------------------
async function main() {
  if (!pool.isEnabled()) {
    console.log('MySQL n\'est pas configuré (DB_HOST absent).');
    console.log('Le site fonctionne en mode fichiers JSON : aucun import nécessaire.');
    return;
  }

  const health = await pool.ping();
  if (!health.ok) { console.error(`Connexion impossible : ${health.error}`); process.exitCode = 1; return; }

  const content = readJSON('site-content.json', {});
  const leads = readJSON('leads.json', []);
  const auditEntries = readJSON('audit-log.json', []);
  const rewriter = buildImageRewriter();
  const problems = [];

  const villas = (Array.isArray(content.villas) ? content.villas : []).map((item, index) => ({
    ...item, id: slug(item?.id || item?.name, `villa-${index + 1}`),
    images: rewriteList(item?.images, rewriter)
  }));
  const terrains = (Array.isArray(content.terrains) ? content.terrains : [])
    .map((item, index) => normalizeTerrain(item, index, rewriter, problems));
  const activities = (Array.isArray(content.activities) ? content.activities : []).map((item, index) => {
    const images = rewriteList(item?.images?.length ? item.images : [item?.image], rewriter);
    return { ...item, id: slug(item?.id || item?.title, `activite-${index + 1}`), images, image: images[0] || '' };
  });
  const reviews = Array.isArray(content.reviews) ? content.reviews : [];
  const faq = Array.isArray(content.faq) ? content.faq : [];
  const facebookPosts = Array.isArray(content.facebookPosts) ? content.facebookPosts : [];

  console.log('--- À importer -----------------------------------------');
  console.log(`  villas          : ${villas.length}`);
  console.log(`  terrains        : ${terrains.length}`);
  console.log(`  activities      : ${activities.length}`);
  console.log(`  reviews         : ${reviews.length}`);
  console.log(`  faq             : ${faq.length}`);
  console.log(`  settings        : ${Object.keys(content.settings || {}).length} clé(s)`);
  console.log(`  leads           : ${leads.length}`);
  console.log(`  facebook_posts  : ${facebookPosts.length}`);
  console.log(`  audit_log       : ${auditEntries.length}`);
  console.log(rewriter.active
    ? `  images WebP     : ${rewriter.stats.rewritten} chemin(s) réécrit(s) (${rewriter.stats.available} entrée(s) au manifeste)`
    : `  images WebP     : désactivé (${USE_WEBP ? 'data/image-manifest.json absent' : 'option --no-webp'})`);
  problems.forEach(message => console.warn(`  ! ${message}`));

  if (DRY_RUN) { console.log('\n--dry-run : aucune écriture effectuée.'); return; }

  const connection = await pool.getPool().getConnection();
  try {
    await connection.beginTransaction();

    for (let i = 0; i < villas.length; i += 1) await connection.execute(repo.VILLA_UPSERT, repo.villaParams(villas[i], i));
    for (let i = 0; i < terrains.length; i += 1) await connection.execute(repo.TERRAIN_UPSERT, repo.terrainParams(terrains[i], i));
    for (let i = 0; i < activities.length; i += 1) await connection.execute(repo.ACTIVITY_UPSERT, repo.activityParams(activities[i], i));
    for (let i = 0; i < reviews.length; i += 1) await connection.execute(repo.REVIEW_UPSERT, repo.reviewParams(reviews[i], i));
    for (let i = 0; i < faq.length; i += 1) await connection.execute(repo.FAQ_UPSERT, repo.faqParams(faq[i], i));

    for (const [key, value] of Object.entries(content.settings || {})) {
      await connection.execute(
        'INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [String(key).slice(0, 120), JSON.stringify({ v: value })]
      );
    }
    if (content.updatedAt) {
      await connection.execute(
        'INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        ['updatedAt', JSON.stringify({ v: content.updatedAt })]
      );
    }

    for (const lead of leads) {
      await connection.execute(
        `INSERT INTO leads (id, type, name, email, phone, villa, terrain_ref, terrain_id, dates, amount, message, admin_notes, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           type=VALUES(type), name=VALUES(name), email=VALUES(email), phone=VALUES(phone),
           villa=VALUES(villa), terrain_ref=VALUES(terrain_ref), terrain_id=VALUES(terrain_id),
           dates=VALUES(dates), amount=VALUES(amount), message=VALUES(message),
           admin_notes=VALUES(admin_notes), status=VALUES(status)`,
        [lead.id || crypto.randomUUID(), lead.type || 'demande', lead.name || '', lead.email || '',
          lead.phone || '', lead.villa || '', lead.terrainRef || '', lead.terrainId || '',
          lead.dates || '', Math.round(Number(lead.amount) || 0), lead.message || '',
          lead.adminNotes || '', ['nouveau', 'contacte', 'confirme', 'archive'].includes(lead.status) ? lead.status : 'nouveau',
          new Date(lead.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' ')]
      );
    }

    for (const post of facebookPosts) {
      if (!post?.id) continue;
      await connection.execute(
        `INSERT INTO facebook_posts (id, message, created_time, permalink_url, full_picture, raw)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE message=VALUES(message), created_time=VALUES(created_time),
           permalink_url=VALUES(permalink_url), full_picture=VALUES(full_picture), raw=VALUES(raw)`,
        [String(post.id).slice(0, 200), post.message || '',
          post.created_time ? new Date(post.created_time).toISOString().slice(0, 19).replace('T', ' ') : null,
          post.permalink_url || '', post.full_picture || '', JSON.stringify(post)]
      );
    }

    for (const entry of auditEntries) {
      await connection.execute(
        `INSERT INTO audit_log (id, action, details, actor, created_at) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE action=VALUES(action), details=VALUES(details)`,
        [entry.id || crypto.randomUUID(), String(entry.action || 'inconnu').slice(0, 120),
          JSON.stringify(entry.details ?? {}), 'import',
          new Date(entry.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' ')]
      );
    }

    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch { /* best-effort */ }
    throw error;
  } finally {
    connection.release();
  }

  const [[counts]] = await pool.getPool().query(`SELECT
    (SELECT COUNT(*) FROM villas) AS villas,
    (SELECT COUNT(*) FROM terrains) AS terrains,
    (SELECT COUNT(*) FROM activities) AS activities,
    (SELECT COUNT(*) FROM reviews) AS reviews,
    (SELECT COUNT(*) FROM faq) AS faq,
    (SELECT COUNT(*) FROM leads) AS leads,
    (SELECT COUNT(*) FROM facebook_posts) AS facebook_posts`);
  console.log('\n--- En base après import -------------------------------');
  Object.entries(counts).forEach(([table, count]) => console.log(`  ${table.padEnd(16)}: ${count}`));
  console.log('\nImport terminé. Le script est rejouable sans créer de doublon.');
}

main()
  .catch(error => { console.error(`\nÉchec de l'import : ${error.message}`); process.exitCode = 1; })
  .finally(() => pool.close().catch(() => {}));
