/**
 * Couche d'accès aux données MySQL.
 *
 * RÈGLE ABSOLUE : uniquement des requêtes préparées (`connection.execute` avec
 * des « ? » et un tableau de valeurs). Aucune concaténation de chaîne SQL avec
 * une valeur venant du client. Les seuls fragments SQL construits en JavaScript
 * sont des listes de « ? » (placeholders), jamais des données.
 *
 * Les fonctions exposées ici ont la MÊME SIGNATURE et le MÊME format de retour
 * que le mode fichiers JSON de server.js : basculer d'un mode à l'autre se fait
 * sur une simple condition `dbPool.isEnabled()`.
 */

const crypto = require('crypto');
const pool = require('./pool');

const EURO_RATE = 655.957;

// --------------------------------------------------------------------------
// Utilitaires de conversion
// --------------------------------------------------------------------------
function query(sql, params = []) {
  const active = pool.getPool();
  if (!active) throw new Error('MySQL non configuré');
  return active.execute(sql, params);
}

/** Exécute une fonction dans une transaction (rollback automatique en cas d'erreur). */
async function transaction(handler) {
  const active = pool.getPool();
  if (!active) throw new Error('MySQL non configuré');
  const connection = await active.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* rollback best-effort */ }
    throw error;
  } finally {
    connection.release();
  }
}

/** JSON stocké : mysql2 renvoie déjà un objet pour les colonnes JSON MySQL,
 *  mais une chaîne pour MariaDB (LONGTEXT). On gère les deux. */
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/** Colonne `proprietaire` (JSON) : objet non vide ou null. Colonne absente avant la migration : null. */
function proprietaireDeLigne(value) {
  const objet = parseObject(value);
  return objet && Object.values(objet).some(Boolean) ? objet : null;
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
  }
  return {};
}

function jsonColumn(value) {
  return JSON.stringify(value ?? []);
}

function bool(value) { return value ? 1 : 0; }

/** État d'une annonce ; toute valeur inconnue vaut « active ». */
function etatAnnonce(item) {
  return ['active', 'suspendue', 'archivee'].includes(item?.etat) ? item.etat : 'active';
}

/** Date ISO ↔ DATETIME UTC MySQL. */
function toMysqlDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Borne une limite SQL à un entier sûr.
 * `LIMIT ?` n'est pas fiable sur toutes les versions de MySQL/MariaDB via les
 * requêtes préparées : la valeur est donc forcée en entier borné puis
 * interpolée. Ce n'est jamais une donnée client brute — le résultat est
 * mathématiquement garanti d'être un entier positif.
 */
function intLimit(value, fallback, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, max);
}

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

// --------------------------------------------------------------------------
// VILLAS
// --------------------------------------------------------------------------
function villaFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    categoryLabel: row.category_label,
    environment: row.environment || 'terre',
    location: row.location,
    // Référentiels (db/migration-referentiels.sql). Colonnes absentes avant
    // la migration : valeurs vides, le texte enregistré fait alors foi.
    localisationId: row.localisation_id || '',
    localisationPrecision: row.localisation_precision || '',
    badgeId: row.badge_id || '',
    equipements: parseArray(row.equipements),
    description: row.description || '',
    pricePerNight: Number(row.price_per_night),
    // Tarif de la villa entière, ou d'une chambre (db/migration-prix-par-chambre.sql).
    priceUnit: row.price_unit === 'chambre' ? 'chambre' : 'villa',
    priceEuro: Number(row.price_euro),
    weekendPackage: Number(row.weekend_package),
    capacity: Number(row.capacity),
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    beds: row.beds,
    status: row.status,
    badge: row.badge,
    visible: Boolean(row.visible),
    featured: Boolean(row.featured),
    rating: row.rating === null ? undefined : Number(row.rating),
    reviewsCount: Number(row.reviews_count),
    images: parseArray(row.images),
    features: parseArray(row.features),
    highlights: parseArray(row.highlights),
    // Traductions EN/ES de la fiche (db/migration-5-points.sql).
    translations: parseObject(row.translations),
    // Gestion de l'annonce (db/migration-gestion-compta.sql) : état et case
    // « Publier sur Facebook » (NULL = jamais enregistrée).
    etat: row.etat || 'active',
    facebook: row.facebook === null || row.facebook === undefined ? null : Boolean(Number(row.facebook)),
    // Propriétaire du bien (19/09/2026) : visible seulement dans le studio.
    proprietaire: proprietaireDeLigne(row.proprietaire),
  };
}

const VILLA_UPSERT = `INSERT INTO villas
  (id, name, tagline, category, category_label, environment, location, description, price_per_night, price_unit, price_euro,
   weekend_package, capacity, bedrooms, bathrooms, beds, status, badge, visible, featured,
   rating, reviews_count, images, features, highlights, sort_order,
   localisation_id, localisation_precision, badge_id, equipements, translations, etat, facebook, proprietaire)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE
    name=VALUES(name), tagline=VALUES(tagline), category=VALUES(category),
    category_label=VALUES(category_label), environment=VALUES(environment),
    location=VALUES(location), description=VALUES(description),
    price_per_night=VALUES(price_per_night), price_unit=VALUES(price_unit), price_euro=VALUES(price_euro),
    weekend_package=VALUES(weekend_package), capacity=VALUES(capacity), bedrooms=VALUES(bedrooms),
    bathrooms=VALUES(bathrooms), beds=VALUES(beds), status=VALUES(status), badge=VALUES(badge),
    visible=VALUES(visible), featured=VALUES(featured), rating=VALUES(rating),
    reviews_count=VALUES(reviews_count), images=VALUES(images), features=VALUES(features),
    highlights=VALUES(highlights), sort_order=VALUES(sort_order),
    localisation_id=VALUES(localisation_id), localisation_precision=VALUES(localisation_precision),
    badge_id=VALUES(badge_id), equipements=VALUES(equipements), translations=VALUES(translations),
    etat=VALUES(etat), facebook=VALUES(facebook), proprietaire=VALUES(proprietaire)`;

function villaParams(item, index) {
  return [
    item.id, item.name || '', item.tagline || '', item.category || '', item.categoryLabel || '',
    item.environment || 'terre', item.location || '', item.description || '', Math.round(Number(item.pricePerNight) || 0),
    item.priceUnit === 'chambre' ? 'chambre' : 'villa', Math.round(Number(item.priceEuro) || 0), Math.round(Number(item.weekendPackage) || 0),
    Number(item.capacity) || 1, Number(item.bedrooms) || 1, Number(item.bathrooms) || 1,
    item.beds || '', item.status || 'disponible', item.badge || '',
    bool(item.visible !== false), bool(item.featured),
    item.rating === undefined || item.rating === null ? null : Number(item.rating),
    Number(item.reviewsCount) || 0,
    jsonColumn(item.images), jsonColumn(item.features), jsonColumn(item.highlights), index,
    item.localisationId || null, item.localisationPrecision || '', item.badgeId || null, jsonColumn(item.equipements),
    JSON.stringify(item.translations && typeof item.translations === 'object' ? item.translations : {}),
    etatAnnonce(item), item.facebook === true ? 1 : item.facebook === false ? 0 : null,
    item.proprietaire ? JSON.stringify(item.proprietaire) : null
  ];
}

async function listVillas() {
  const [rows] = await query('SELECT * FROM villas ORDER BY sort_order ASC, name ASC');
  return rows.map(villaFromRow);
}

// --------------------------------------------------------------------------
// TERRAINS
// --------------------------------------------------------------------------
function terrainFromRow(row) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    location: row.location,
    localisationId: row.localisation_id || '',
    localisationPrecision: row.localisation_precision || '',
    district: row.district,
    areaSqm: Number(row.area_sqm),
    priceTotal: Number(row.price_total),
    pricePerSqm: Number(row.price_per_sqm),
    priceEuro: Number(row.price_euro),
    landStatus: row.land_status,
    landStatusLabel: row.land_status_label,
    utilities: parseArray(row.utilities),
    status: row.status,
    description: row.description || '',
    images: parseArray(row.images),
    highlights: parseArray(row.highlights),
    visible: Boolean(row.visible),
    featured: Boolean(row.featured),
    badge: row.badge,
    badgeId: row.badge_id || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    translations: parseObject(row.translations),
    // Gestion de l'annonce (db/migration-gestion-compta.sql) : état et case
    // « Publier sur Facebook » (NULL = jamais enregistrée).
    etat: row.etat || 'active',
    facebook: row.facebook === null || row.facebook === undefined ? null : Boolean(Number(row.facebook)),
    // Propriétaire du bien (19/09/2026) : visible seulement dans le studio.
    proprietaire: proprietaireDeLigne(row.proprietaire),
  };
}

const TERRAIN_UPSERT = `INSERT INTO terrains
  (id, reference, title, location, district, area_sqm, price_total, price_per_sqm, price_euro,
   land_status, land_status_label, utilities, status, description, images, highlights,
   visible, featured, badge, latitude, longitude, sort_order,
   localisation_id, localisation_precision, badge_id, translations, etat, facebook, proprietaire)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE
    reference=VALUES(reference), title=VALUES(title), location=VALUES(location),
    district=VALUES(district), area_sqm=VALUES(area_sqm), price_total=VALUES(price_total),
    price_per_sqm=VALUES(price_per_sqm), price_euro=VALUES(price_euro),
    land_status=VALUES(land_status), land_status_label=VALUES(land_status_label),
    utilities=VALUES(utilities), status=VALUES(status), description=VALUES(description),
    images=VALUES(images), highlights=VALUES(highlights), visible=VALUES(visible),
    featured=VALUES(featured), badge=VALUES(badge), latitude=VALUES(latitude),
    longitude=VALUES(longitude), sort_order=VALUES(sort_order),
    localisation_id=VALUES(localisation_id), localisation_precision=VALUES(localisation_precision),
    badge_id=VALUES(badge_id), translations=VALUES(translations),
    etat=VALUES(etat), facebook=VALUES(facebook), proprietaire=VALUES(proprietaire)`;

function terrainParams(item, index) {
  // Sécurité de dernier rempart : les prix dérivés sont recalculés ici aussi,
  // pour qu'aucun chemin d'écriture ne puisse enregistrer une valeur du client.
  const areaSqm = Math.round(Number(item.areaSqm) || 0);
  const priceTotal = Math.round(Number(item.priceTotal) || 0);
  const pricePerSqm = areaSqm ? Math.round(priceTotal / areaSqm) : 0;
  const priceEuro = Math.round(priceTotal / EURO_RATE);
  return [
    item.id, item.reference || '', item.title || '', item.location || '', item.district || '',
    areaSqm, priceTotal, pricePerSqm, priceEuro,
    item.landStatus || 'titre-foncier', item.landStatusLabel || '',
    jsonColumn(item.utilities), item.status || 'disponible', item.description || '',
    jsonColumn(item.images), jsonColumn(item.highlights),
    bool(item.visible !== false), bool(item.featured), item.badge || '',
    item.latitude === null || item.latitude === undefined || item.latitude === '' ? null : Number(item.latitude),
    item.longitude === null || item.longitude === undefined || item.longitude === '' ? null : Number(item.longitude),
    index,
    item.localisationId || null, item.localisationPrecision || '', item.badgeId || null,
    JSON.stringify(item.translations && typeof item.translations === 'object' ? item.translations : {}),
    etatAnnonce(item), item.facebook === true ? 1 : item.facebook === false ? 0 : null,
    item.proprietaire ? JSON.stringify(item.proprietaire) : null
  ];
}

async function listTerrains() {
  const [rows] = await query('SELECT * FROM terrains ORDER BY sort_order ASC, reference ASC');
  return rows.map(terrainFromRow);
}

async function getTerrain(id) {
  const [rows] = await query('SELECT * FROM terrains WHERE id = ? LIMIT 1', [String(id)]);
  return rows.length ? terrainFromRow(rows[0]) : null;
}

// --------------------------------------------------------------------------
// ACTIVITÉS
// --------------------------------------------------------------------------
function activityFromRow(row) {
  return {
    id: row.id, title: row.title, subtitle: row.subtitle, description: row.description || '',
    image: row.image, images: parseArray(row.images), duration: row.duration, price: row.price,
    // Colonnes ajoutées après coup : `?? 0` / `|| 'forfait'` couvrent les bases
    // où la migration n'a pas encore été appliquée (colonnes absentes).
    priceAmount: Number(row.price_amount) || 0,
    groupPriceAmount: Number(row.group_price_amount) || 0,
    groupSize: Number(row.group_size) || 0,
    priceUnit: row.price_unit || 'forfait',
    // Mentions libres du tarif affiché, généré depuis le montant (db/fiches.js).
    pricePrefix: row.price_prefix || '',
    priceSuffix: row.price_suffix || '',
    translations: parseObject(row.translations),
    badge: row.badge, badgeId: row.badge_id || '', visible: Boolean(row.visible), featured: Boolean(row.featured),
    // Gestion de l'annonce (db/migration-gestion-compta.sql) : état et case
    // « Publier sur Facebook » (NULL = jamais enregistrée).
    etat: row.etat || 'active',
    facebook: row.facebook === null || row.facebook === undefined ? null : Boolean(Number(row.facebook)),
    // Propriétaire du bien (19/09/2026) : visible seulement dans le studio.
    proprietaire: proprietaireDeLigne(row.proprietaire),
  };
}

const ACTIVITY_UPSERT = `INSERT INTO activities
  (id, title, subtitle, description, image, images, duration, price, price_amount, price_unit,
   group_price_amount, group_size, badge, visible, featured, sort_order, badge_id,
   price_prefix, price_suffix, translations, etat, facebook, proprietaire)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE
    title=VALUES(title), subtitle=VALUES(subtitle), description=VALUES(description),
    image=VALUES(image), images=VALUES(images), duration=VALUES(duration), price=VALUES(price),
    price_amount=VALUES(price_amount), price_unit=VALUES(price_unit),
    group_price_amount=VALUES(group_price_amount), group_size=VALUES(group_size),
    badge=VALUES(badge), visible=VALUES(visible), featured=VALUES(featured), sort_order=VALUES(sort_order),
    badge_id=VALUES(badge_id), price_prefix=VALUES(price_prefix), price_suffix=VALUES(price_suffix),
    translations=VALUES(translations), etat=VALUES(etat), facebook=VALUES(facebook), proprietaire=VALUES(proprietaire)`;

function activityParams(item, index) {
  return [
    item.id, item.title || '', item.subtitle || '', item.description || '',
    item.image || (item.images || [])[0] || '', jsonColumn(item.images),
    item.duration || '', item.price || '',
    Number(item.priceAmount) || 0,
    ['forfait', 'jour', 'personne'].includes(item.priceUnit) ? item.priceUnit : 'forfait',
    Number(item.groupPriceAmount) || 0, Number(item.groupSize) || 0,
    item.badge || '',
    bool(item.visible !== false), bool(item.featured), index,
    item.badgeId || null,
    item.pricePrefix || '', item.priceSuffix || '',
    JSON.stringify(item.translations && typeof item.translations === 'object' ? item.translations : {}),
    etatAnnonce(item), item.facebook === true ? 1 : item.facebook === false ? 0 : null,
    item.proprietaire ? JSON.stringify(item.proprietaire) : null
  ];
}

async function listActivities() {
  const [rows] = await query('SELECT * FROM activities ORDER BY sort_order ASC, title ASC');
  return rows.map(activityFromRow);
}

// --------------------------------------------------------------------------
// VÉHICULES — location de voitures (17/09/2026)
// La fiche complète (tarifs, chauffeur, caution, équipements, traductions…)
// est gardée en JSON ; les colonnes à part servent au tri et à la lecture.
// --------------------------------------------------------------------------
function vehicleFromRow(row) {
  return {
    ...parseObject(row.donnees),
    id: row.id, name: row.name, category: row.category,
    visible: Boolean(row.visible), featured: Boolean(row.featured), etat: row.etat || 'active'
  };
}

const VEHICLE_UPSERT = `INSERT INTO vehicles (id, name, category, price_per_day, visible, featured, etat, sort_order, donnees)
  VALUES (?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), price_per_day=VALUES(price_per_day),
    visible=VALUES(visible), featured=VALUES(featured), etat=VALUES(etat), sort_order=VALUES(sort_order), donnees=VALUES(donnees)`;

function vehicleParams(item, index) {
  return [
    item.id, item.name || '', item.category || '', Number(item.pricePerDay) || 0,
    bool(item.visible !== false), bool(item.featured), etatAnnonce(item), index, JSON.stringify(item)
  ];
}

/** Véhicules du catalogue ; null tant que la table n'existe pas (migration à passer). */
async function listVehicles() {
  try {
    const [rows] = await query('SELECT * FROM vehicles ORDER BY sort_order ASC, name ASC');
    return rows.map(vehicleFromRow);
  } catch (error) {
    if (tableAbsente(error)) return null;
    throw error;
  }
}

// --------------------------------------------------------------------------
// AVIS & FAQ
// --------------------------------------------------------------------------
const REVIEW_UPSERT = `INSERT INTO reviews
  (id, author, city, stay, rating, date_label, comment, avatar, visible, sort_order)
  VALUES (?,?,?,?,?,?,?,?,?,?)
  ON DUPLICATE KEY UPDATE
    author=VALUES(author), city=VALUES(city), stay=VALUES(stay), rating=VALUES(rating),
    date_label=VALUES(date_label), comment=VALUES(comment), avatar=VALUES(avatar),
    visible=VALUES(visible), sort_order=VALUES(sort_order)`;

function reviewParams(item, index) {
  const id = item.id || stableId('review', item.author || '', item.stay || '');
  return [id, item.author || '', item.city || '', item.stay || '', Number(item.rating) || 5,
    item.date || item.dateLabel || '', item.comment || '', item.avatar || '',
    bool(item.visible !== false), index];
}

async function listReviews() {
  const [rows] = await query('SELECT * FROM reviews ORDER BY sort_order ASC');
  return rows.map(row => ({
    id: row.id, author: row.author, city: row.city, stay: row.stay, rating: Number(row.rating),
    date: row.date_label, comment: row.comment || '', avatar: row.avatar, visible: Boolean(row.visible)
  }));
}

const FAQ_UPSERT = `INSERT INTO faq (id, question, answer, visible, sort_order)
  VALUES (?,?,?,?,?)
  ON DUPLICATE KEY UPDATE
    question=VALUES(question), answer=VALUES(answer), visible=VALUES(visible), sort_order=VALUES(sort_order)`;

function faqParams(item, index) {
  const id = item.id || stableId('faq', item.q || item.question || String(index));
  return [id, item.q || item.question || '', item.a || item.answer || '', bool(item.visible !== false), index];
}

async function listFaq() {
  const [rows] = await query('SELECT * FROM faq ORDER BY sort_order ASC');
  return rows.map(row => ({ id: row.id, q: row.question, a: row.answer || '', visible: Boolean(row.visible) }));
}

// --------------------------------------------------------------------------
// RÉGLAGES
// --------------------------------------------------------------------------
async function getSettings() {
  const [rows] = await query('SELECT setting_key, value FROM settings');
  const settings = {};
  rows.forEach(row => {
    const parsed = typeof row.value === 'string' ? (() => { try { return JSON.parse(row.value); } catch { return row.value; } })() : row.value;
    settings[row.setting_key] = parsed && typeof parsed === 'object' && 'v' in parsed ? parsed.v : parsed;
  });
  return settings;
}

async function saveSettings(settings, connection = null) {
  const runner = connection || { execute: (sql, params) => query(sql, params) };
  const entries = Object.entries(settings || {});
  for (const [key, value] of entries) {
    await runner.execute(
      'INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [String(key).slice(0, 120), JSON.stringify({ v: value })]
    );
  }
  return entries.length;
}

// --------------------------------------------------------------------------
// RÉFÉRENTIELS (db/referentiels.js, db/migration-referentiels.sql)
// --------------------------------------------------------------------------
// Noms de tables issus de cette seule constante : jamais d'une saisie.
const TABLES_REFERENTIELS = {
  localisations: 'ref_localisations',
  categories: 'ref_categories',
  equipements: 'ref_equipements',
  'equipements-voiture': 'ref_equipements_voiture',
  badges: 'ref_badges',
  statuts: 'ref_statuts'
};

/** Vrai quand MySQL signale une table inconnue : migration pas encore passée. */
function tableAbsente(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
}

function referentielDepuisLigne(type, row) {
  if (type === 'localisations') {
    return { id: row.id, nom: row.nom || '', ordre: Number(row.ordre) || 0, actif: Boolean(row.actif) };
  }
  const libelle = { fr: row.libelle_fr || '', en: row.libelle_en || '', es: row.libelle_es || '' };
  if (type === 'statuts') {
    return { id: `${row.cible}:${row.code}`, cible: row.cible, code: row.code, libelle, ordre: Number(row.ordre) || 0, actif: true };
  }
  return { id: row.id, libelle, ordre: Number(row.ordre) || 0, actif: Boolean(row.actif) };
}

/** Tables de référentiels absentes à la dernière lecture (migration pas encore importée). */
let referentielsSansTable = [];
const tablesReferentielsManquantes = () => [...referentielsSansTable];

/**
 * Tous les référentiels, table par table. Une table absente ne prive plus
 * les autres de la base (21/09/2026) : ref_equipements_voiture manquait en
 * production et les localisations ajoutées au studio n'étaient plus lues —
 * le serveur servait son miroir JSON. Le type sans table reçoit ses valeurs
 * initiales (REF.normaliserReferentiels) et le studio signale la table.
 * `null` seulement si AUCUNE table n'existe : repli sur le miroir JSON.
 */
async function listReferentiels() {
  const resultat = {};
  const manquantes = [];
  for (const [type, table] of Object.entries(TABLES_REFERENTIELS)) {
    try {
      const [rows] = await query(`SELECT * FROM \`${table}\` ORDER BY ordre ASC`);
      resultat[type] = rows.map(row => referentielDepuisLigne(type, row));
    } catch (error) {
      if (!tableAbsente(error)) throw error;
      manquantes.push(table);
    }
  }
  referentielsSansTable = manquantes;
  return manquantes.length === Object.keys(TABLES_REFERENTIELS).length ? null : resultat;
}

/** Crée ou met à jour une entrée déjà validée (normaliserEntree). */
async function saveReferentiel(type, entree, connection = null) {
  const runner = connection || { execute: (sql, params) => query(sql, params) };
  if (type === 'localisations') {
    await runner.execute(
      `INSERT INTO ref_localisations (id, nom, ordre, actif) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE nom=VALUES(nom), ordre=VALUES(ordre), actif=VALUES(actif)`,
      [entree.id, entree.nom, entree.ordre, bool(entree.actif)]
    );
    return;
  }
  if (type === 'statuts') {
    // Codes fixes : seuls les libellés changent, jamais de nouvelle ligne.
    await runner.execute(
      'UPDATE ref_statuts SET libelle_fr=?, libelle_en=?, libelle_es=? WHERE cible=? AND code=?',
      [entree.libelle.fr, entree.libelle.en, entree.libelle.es, entree.cible, entree.code]
    );
    return;
  }
  const table = TABLES_REFERENTIELS[type];
  if (!table) throw new Error(`Référentiel « ${type} » inconnu.`);
  await runner.execute(
    `INSERT INTO \`${table}\` (id, libelle_fr, libelle_en, libelle_es, ordre, actif) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE libelle_fr=VALUES(libelle_fr), libelle_en=VALUES(libelle_en),
       libelle_es=VALUES(libelle_es), ordre=VALUES(ordre), actif=VALUES(actif)`,
    [entree.id, entree.libelle.fr, entree.libelle.en, entree.libelle.es, entree.ordre, bool(entree.actif)]
  );
}

/**
 * Nouvel ordre d'un référentiel (glisser-déposer du studio) : `ids` est la
 * liste complète, dans l'ordre voulu. Transactionnel : tout ou rien.
 */
async function ordonnerReferentiel(type, ids) {
  if (type === 'statuts') throw new Error('L’ordre des statuts est fixe.');
  const table = TABLES_REFERENTIELS[type];
  if (!table) throw new Error(`Référentiel « ${type} » inconnu.`);
  return transaction(async connection => {
    for (let index = 0; index < ids.length; index += 1) {
      await connection.execute(`UPDATE \`${table}\` SET ordre = ? WHERE id = ?`, [index + 1, String(ids[index])]);
    }
    return ids.length;
  });
}

async function deleteReferentiel(type, id) {
  if (type === 'statuts') throw new Error('Les statuts ne peuvent pas être supprimés.');
  const table = TABLES_REFERENTIELS[type];
  if (!table) throw new Error(`Référentiel « ${type} » inconnu.`);
  const [resultat] = await query(`DELETE FROM \`${table}\` WHERE id = ?`, [String(id)]);
  return resultat?.affectedRows || 0;
}

/**
 * Valeurs initiales, sans jamais écraser l'existant (INSERT IGNORE).
 * Utilisé par scripts/migrate.js. Renvoie le nombre de lignes ajoutées.
 */
async function semerReferentiels(defauts, connection) {
  let ajoutees = 0;
  for (const entree of defauts.localisations) {
    const [r] = await connection.execute('INSERT IGNORE INTO ref_localisations (id, nom, ordre, actif) VALUES (?,?,?,1)',
      [entree.id, entree.nom, entree.ordre]);
    ajoutees += r.affectedRows || 0;
  }
  for (const type of ['categories', 'equipements', 'badges']) {
    for (const entree of defauts[type]) {
      const [r] = await connection.execute(
        `INSERT IGNORE INTO \`${TABLES_REFERENTIELS[type]}\` (id, libelle_fr, libelle_en, libelle_es, ordre, actif) VALUES (?,?,?,?,?,1)`,
        [entree.id, entree.libelle.fr, entree.libelle.en, entree.libelle.es, entree.ordre]
      );
      ajoutees += r.affectedRows || 0;
    }
  }
  for (const entree of defauts.statuts) {
    const [r] = await connection.execute(
      'INSERT IGNORE INTO ref_statuts (cible, code, libelle_fr, libelle_en, libelle_es, ordre) VALUES (?,?,?,?,?,?)',
      [entree.cible, entree.code, entree.libelle.fr, entree.libelle.en, entree.libelle.es, entree.ordre]
    );
    ajoutees += r.affectedRows || 0;
  }
  return ajoutees;
}

// --------------------------------------------------------------------------
// CONTENU COMPLET (équivalent de data/site-content.json)
// --------------------------------------------------------------------------
async function readContent() {
  const [villas, terrains, activities, reviews, faq, settings, facebookPosts, vehicles] = await Promise.all([
    listVillas(), listTerrains(), listActivities(), listReviews(), listFaq(), getSettings(), listFacebookPosts(20, { toutesVideos: true }), listVehicles()
  ]);
  return {
    // `vehicles` vaut null sans la table : server.js reprend alors le miroir JSON.
    villas, terrains, activities, vehicles, reviews, faq, settings, facebookPosts,
    updatedAt: settings.updatedAt || new Date().toISOString()
  };
}

/**
 * Écrit tout le contenu validé. Transactionnel : soit tout passe, soit rien.
 * `content` a exactement la forme produite par validateAndSanitizeContent().
 */
async function writeContent(content) {
  return transaction(async connection => {
    const keep = async (table, ids) => {
      if (!ids.length) { await connection.execute(`DELETE FROM \`${table}\``); return; }
      // Les « ? » sont des placeholders, pas des données : aucune injection possible.
      const placeholders = ids.map(() => '?').join(',');
      await connection.execute(`DELETE FROM \`${table}\` WHERE id NOT IN (${placeholders})`, ids);
    };

    const villas = content.villas || [];
    for (let index = 0; index < villas.length; index += 1) await connection.execute(VILLA_UPSERT, villaParams(villas[index], index));
    await keep('villas', villas.map(item => item.id));

    const terrains = content.terrains || [];
    for (let index = 0; index < terrains.length; index += 1) await connection.execute(TERRAIN_UPSERT, terrainParams(terrains[index], index));
    await keep('terrains', terrains.map(item => item.id));

    const activities = content.activities || [];
    for (let index = 0; index < activities.length; index += 1) await connection.execute(ACTIVITY_UPSERT, activityParams(activities[index], index));
    await keep('activities', activities.map(item => item.id));

    // Véhicules : table créée par db/migration-location-voitures.sql. Tant
    // qu'elle manque, ils ne vivent que dans le miroir JSON (écrit ensuite).
    const [tableVehicules] = await connection.execute(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles'");
    if (Number(tableVehicules[0]?.n) > 0) {
      const vehicles = content.vehicles || [];
      for (let index = 0; index < vehicles.length; index += 1) await connection.execute(VEHICLE_UPSERT, vehicleParams(vehicles[index], index));
      await keep('vehicles', vehicles.map(item => item.id));
    }

    const reviews = content.reviews || [];
    const reviewIds = [];
    for (let index = 0; index < reviews.length; index += 1) {
      const params = reviewParams(reviews[index], index);
      reviewIds.push(params[0]);
      await connection.execute(REVIEW_UPSERT, params);
    }
    await keep('reviews', reviewIds);

    const faq = content.faq || [];
    const faqIds = [];
    for (let index = 0; index < faq.length; index += 1) {
      const params = faqParams(faq[index], index);
      faqIds.push(params[0]);
      await connection.execute(FAQ_UPSERT, params);
    }
    await keep('faq', faqIds);

    await saveSettings({ ...(content.settings || {}), updatedAt: content.updatedAt || new Date().toISOString() }, connection);
    return { villas: villas.length, terrains: terrains.length, activities: activities.length, vehicles: (content.vehicles || []).length };
  });
}

// --------------------------------------------------------------------------
// LEADS
// --------------------------------------------------------------------------
function leadFromRow(row) {
  return {
    id: row.id, type: row.type, name: row.name, email: row.email, phone: row.phone,
    villa: row.villa, terrainRef: row.terrain_ref, terrainId: row.terrain_id,
    dates: row.dates, amount: Number(row.amount), message: row.message || '',
    adminNotes: row.admin_notes || '', status: row.status,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
    // Colonne absente (avant migration) ou NULL : accord non recueilli.
    whatsappOptIn: row.whatsapp_optin === null || row.whatsapp_optin === undefined ? null : Boolean(Number(row.whatsapp_optin)),
    whatsappOptInAt: toIso(row.whatsapp_optin_at)
  };
}

async function listLeads(limit = 2000) {
  const [rows] = await query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT ${intLimit(limit, 2000, 5000)}`);
  return rows.map(leadFromRow);
}

async function createLead(lead) {
  const valeurs = [lead.id, lead.type || 'demande', lead.name || '', lead.email || '', lead.phone || '',
    lead.villa || '', lead.terrainRef || '', lead.terrainId || '', lead.dates || '',
    Math.round(Number(lead.amount) || 0), lead.message || '', lead.status || 'nouveau',
    lead.sourceIp || '', toMysqlDate(lead.createdAt) || toMysqlDate(new Date())];
  // Accord WhatsApp (db/migration-whatsapp.sql) : NULL = non recueilli.
  const accord = typeof lead.whatsappOptIn === 'boolean' ? bool(lead.whatsappOptIn) : null;
  try {
    await query(
      `INSERT INTO leads (id, type, name, email, phone, villa, terrain_ref, terrain_id, dates, amount, message, status, source_ip, created_at, whatsapp_optin, whatsapp_optin_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...valeurs, accord, toMysqlDate(lead.whatsappOptInAt)]
    );
  } catch (error) {
    // Migration pas encore passée : la demande est enregistrée quand même,
    // l'accord reste dans le miroir JSON.
    if (!colonneAbsente(error)) throw error;
    await query(
      `INSERT INTO leads (id, type, name, email, phone, villa, terrain_ref, terrain_id, dates, amount, message, status, source_ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      valeurs
    );
  }
  return lead;
}

/** Suppression définitive de demandes (fiche de la demande, demandeur supprimé). */
async function deleteLeads(ids = []) {
  const liste = ids.map(id => String(id)).filter(Boolean);
  if (!liste.length) return 0;
  // Les « ? » sont des placeholders, pas des données : aucune injection.
  const [resultat] = await query(`DELETE FROM leads WHERE id IN (${liste.map(() => '?').join(',')})`, liste);
  return resultat?.affectedRows || 0;
}

async function updateLead(id, patch) {
  const [rows] = await query('SELECT * FROM leads WHERE id = ? LIMIT 1', [String(id)]);
  if (!rows.length) return null;
  const current = leadFromRow(rows[0]);
  const status = ['nouveau', 'contacte', 'confirme', 'archive'].includes(patch.status) ? patch.status : current.status;
  const amount = patch.amount === undefined ? current.amount : Math.round(Number(patch.amount) || 0);
  const notes = patch.adminNotes === undefined ? current.adminNotes : String(patch.adminNotes).slice(0, 2000);
  await query('UPDATE leads SET status = ?, amount = ?, admin_notes = ? WHERE id = ?', [status, amount, notes, String(id)]);
  const [updated] = await query('SELECT * FROM leads WHERE id = ? LIMIT 1', [String(id)]);
  return updated.length ? leadFromRow(updated[0]) : null;
}

// --------------------------------------------------------------------------
// FACEBOOK
// --------------------------------------------------------------------------
/**
 * Galerie d'une publication, relue depuis la colonne `raw`.
 *
 * Un album n'a pas de colonne dédiée : `raw` conserve déjà la publication
 * normalisée entière, `images` compris. La lire de là évite une migration de
 * schéma pour une donnée qui est stockée depuis toujours — et le site
 * retrouve ses albums sans qu'il faille toucher à la base en production.
 */
function imagesDepuisRaw(row) {
  const secours = row.full_picture ? [row.full_picture] : [];
  let brut = row.raw;
  if (!brut) return secours;
  // Selon le pilote et la version de MySQL, une colonne JSON revient déjà
  // décodée ou sous forme de chaîne. On accepte les deux.
  if (typeof brut === 'string') {
    try { brut = JSON.parse(brut); } catch { return secours; }
  }
  const images = Array.isArray(brut?.images) ? brut.images.filter(Boolean) : [];
  return images.length ? images : secours;
}

/**
 * Fiche du bien d'une publication : colonnes reprises de la table `villas`
 * (db/migration-fiche-publications.sql). Liste constante, jamais issue du
 * client : c'est le seul fragment SQL construit ici.
 */
const COLONNES_FICHE = 'name, tagline, category, category_label, environment, location, '
  + 'price_per_night, price_euro, weekend_package, capacity, bedrooms, bathrooms, '
  + 'beds, status, badge, featured, features, highlights, '
  + 'localisation_id, localisation_precision, badge_id, equipements';

/** Vrai quand MySQL signale une colonne inconnue : migration pas encore passée. */
function colonneAbsente(error) {
  return error?.code === 'ER_BAD_FIELD_ERROR' || error?.errno === 1054;
}

/**
 * Ligne SQL → fiche. NULL et chaîne vide restent « non renseigné » : un
 * nombre absent vaut `null`, jamais 0, pour qu'une fiche vide ne réponde pas
 * au critère de budget le plus bas.
 */
function ficheDepuisLigne(row) {
  const nombre = valeur => (valeur === null || valeur === undefined ? null : Number(valeur));
  return {
    name: row.name || '',
    tagline: row.tagline || '',
    category: row.category || '',
    categoryLabel: row.category_label || '',
    environment: row.environment || '',
    location: row.location || '',
    pricePerNight: nombre(row.price_per_night),
    priceEuro: nombre(row.price_euro),
    weekendPackage: nombre(row.weekend_package),
    capacity: nombre(row.capacity),
    bedrooms: nombre(row.bedrooms),
    bathrooms: nombre(row.bathrooms),
    beds: row.beds || '',
    status: row.status || '',
    badge: row.badge || '',
    featured: Boolean(row.featured),
    features: parseArray(row.features),
    highlights: parseArray(row.highlights),
    localisationId: row.localisation_id || '',
    localisationPrecision: row.localisation_precision || '',
    badgeId: row.badge_id || '',
    equipements: parseArray(row.equipements)
  };
}

async function listFacebookPosts(limit = 50, { toutesVideos = false } = {}) {
  const borne = intLimit(limit, 50, 200);
  const base = 'SELECT id, message, created_time, permalink_url, full_picture, raw';
  // Toutes les vidéos, même au-delà des `limit` plus récentes (demande du
  // 13/09/2026). Repérées par l'entrée « video_ » ou par `video` dans `raw`.
  // `"video":` suivi de n'importe quoi : MySQL réécrit le JSON avec une espace
  // après les deux-points, MariaDB le garde tel quel.
  const filtreVideos = "WHERE id LIKE 'video\\_%' OR raw LIKE '%\"video\":%'";
  const lire = async colonnes => {
    const [recentes] = await query(`${base}${colonnes} FROM facebook_posts ORDER BY created_time DESC LIMIT ${borne}`);
    if (!toutesVideos) return recentes;
    const [videos] = await query(`${base}${colonnes} FROM facebook_posts ${filtreVideos} ORDER BY created_time DESC LIMIT 500`);
    const vus = new Set(recentes.map(row => String(row.id)));
    return [...recentes, ...videos.filter(row => !vus.has(String(row.id)))];
  };
  let rows;
  let avecFiche = true;
  try {
    rows = await lire(`, ${COLONNES_FICHE}`);
  } catch (error) {
    // Code déployé avant la migration : on sert les publications comme
    // avant plutôt que de faire échouer toute la lecture du contenu — le
    // site retomberait sinon sur sa copie JSON, moins fraîche.
    if (!colonneAbsente(error)) throw error;
    avecFiche = false;
    rows = await lire('');
  }
  return rows.map(row => {
    const video = videoDepuisRaw(row);
    return {
      id: row.id, message: row.message || '', created_time: toIso(row.created_time) || '',
      permalink_url: row.permalink_url || '', full_picture: row.full_picture || '',
      images: imagesDepuisRaw(row),
      ...(video ? { video } : {}),
      ...(avecFiche ? { fiche: ficheDepuisLigne(row) } : {})
    };
  });
}

/** Vidéo d'une publication, conservée dans `raw` par la synchronisation. */
function videoDepuisRaw(row) {
  let brut = row.raw;
  if (typeof brut === 'string') {
    try { brut = JSON.parse(brut); } catch { return null; }
  }
  const video = brut?.video;
  const id = String(video?.id || '');
  if (!/^\d+$/.test(id)) return null;
  return { id, url: `https://www.facebook.com/watch/?v=${id}`, vertical: video.vertical === true };
}

/**
 * Fiches de toutes les publications en base, par identifiant.
 * `null` quand les colonnes n'existent pas encore : l'appelant se replie
 * alors sur le miroir JSON.
 */
async function listFacebookPostFiches() {
  try {
    const [rows] = await query(`SELECT id, ${COLONNES_FICHE} FROM facebook_posts`);
    return new Map(rows.map(row => [String(row.id), ficheDepuisLigne(row)]));
  } catch (error) {
    if (colonneAbsente(error)) return null;
    throw error;
  }
}

/**
 * Enregistre la fiche d'une publication. `fiche` est déjà validée par
 * server.js (normaliserFichePublication). Ne touche à aucune colonne
 * alimentée par Facebook : message, photos et dates restent intacts.
 * Renvoie false si la publication n'existe pas en base.
 */
async function updateFacebookPostFiche(id, fiche) {
  const [trouvees] = await query('SELECT id FROM facebook_posts WHERE id = ?', [String(id).slice(0, 200)]);
  if (!trouvees.length) return false;
  await query(
    `UPDATE facebook_posts SET name=?, tagline=?, category=?, category_label=?, environment=?, location=?,
       price_per_night=?, price_euro=?, weekend_package=?, capacity=?, bedrooms=?, bathrooms=?,
       beds=?, status=?, badge=?, featured=?, features=?, highlights=?,
       localisation_id=?, localisation_precision=?, badge_id=?, equipements=?
     WHERE id = ?`,
    [fiche.name, fiche.tagline, fiche.category, fiche.categoryLabel, fiche.environment, fiche.location,
      fiche.pricePerNight, fiche.priceEuro, fiche.weekendPackage, fiche.capacity, fiche.bedrooms, fiche.bathrooms,
      fiche.beds, fiche.status, fiche.badge, bool(fiche.featured), jsonColumn(fiche.features), jsonColumn(fiche.highlights),
      fiche.localisationId || null, fiche.localisationPrecision || '', fiche.badgeId || null, jsonColumn(fiche.equipements),
      String(id).slice(0, 200)]
  );
  return true;
}

/**
 * Retire les publications que Facebook ne renvoie plus : elles ont été
 * supprimées sur la Page.
 *
 * `upsertFacebookPosts` n'insère et ne met à jour que — jamais il n'efface.
 * Résultat constaté le 12/09/2026 : une publication retirée de la Page
 * disparaissait bien du miroir JSON, mais survivait en base, et le site,
 * qui lit la base, continuait de l’afficher.
 *
 * Même règle prudente que la fusion côté fichier : on ne supprime que dans
 * la FENÊTRE couverte par l'import, depuis la plus ancienne publication
 * reçue. Au-delà, Graph ne renvoie simplement pas tout — ce n’est pas une
 * suppression, et effacer là serait une perte de données.
 */
/** Publication supprimée de la Page depuis le site (case décochée, annonce retirée). */
async function deleteFacebookPost(id) {
  const [resultat] = await query('DELETE FROM facebook_posts WHERE id = ?', [String(id)]);
  return resultat?.affectedRows || 0;
}

async function pruneFacebookPosts(posts = [], { fenetre = posts } = {}) {
  const ids = posts.map(post => String(post?.id || '')).filter(Boolean);
  if (!ids.length) return 0;

  // `fenetre` : publications qui fixent la borne. Les vidéos anciennes, lues
  // en entier par ailleurs, ne doivent pas la reculer (voir recupererVideos).
  const instants = fenetre
    .map(post => new Date(post?.created_time || 0).getTime())
    .filter(instant => Number.isFinite(instant) && instant > 0);
  if (!instants.length) return 0;

  const depuis = toMysqlDate(new Date(Math.min(...instants)).toISOString());
  if (!depuis) return 0;

  // Les « ? » sont des placeholders, pas des données : aucune injection.
  const placeholders = ids.map(() => '?').join(',');
  const [resultat] = await query(
    `DELETE FROM facebook_posts WHERE created_time >= ? AND id NOT IN (${placeholders})`,
    [depuis, ...ids]
  );
  return resultat?.affectedRows || 0;
}

/**
 * Retire les entrées « video_<id> » dont la vidéo n'existe plus sur la Page.
 * Appelé seulement après une lecture COMPLÈTE des vidéos : `ids` est alors la
 * liste exacte de celles qui doivent rester.
 */
async function pruneFacebookVideos(ids = []) {
  const garder = ids.map(String).filter(id => id.startsWith('video_'));
  const [resultat] = garder.length
    ? await query(`DELETE FROM facebook_posts WHERE id LIKE 'video\\_%' AND id NOT IN (${garder.map(() => '?').join(',')})`, garder)
    : await query("DELETE FROM facebook_posts WHERE id LIKE 'video\\_%'");
  return resultat?.affectedRows || 0;
}

/** Import dédupliqué : la clé primaire est l'id Facebook. */
async function upsertFacebookPosts(posts = []) {
  if (!posts.length) return 0;
  return transaction(async connection => {
    for (const post of posts) {
      if (!post?.id) continue;
      await connection.execute(
        `INSERT INTO facebook_posts (id, message, created_time, permalink_url, full_picture, raw)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE message=VALUES(message), created_time=VALUES(created_time),
           permalink_url=VALUES(permalink_url), full_picture=VALUES(full_picture), raw=VALUES(raw)`,
        [String(post.id).slice(0, 200), post.message || '', toMysqlDate(post.created_time),
          post.permalink_url || '', post.full_picture || '', JSON.stringify(post)]
      );
    }
    return posts.length;
  });
}

/**
 * Réservation d'une clé d'idempotence de publication.
 * Retourne { fresh: true } si la publication peut partir, ou
 * { fresh: false, entry } si elle a déjà été traitée.
 * L'index UNIQUE sur idempotency_key rend l'opération sûre même si deux
 * instances Passenger appellent cette fonction au même instant.
 */
async function claimPublishKey(idempotencyKey, meta = {}) {
  const key = String(idempotencyKey).slice(0, 191);
  try {
    await query(
      `INSERT INTO facebook_publish_log (idempotency_key, status, content_kind, content_id, has_image, has_link)
       VALUES (?, 'en-cours', ?, ?, ?, ?)`,
      [key, meta.kind || '', meta.id || '', bool(meta.hasImage), bool(meta.hasLink)]
    );
    return { fresh: true, key };
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows] = await query('SELECT * FROM facebook_publish_log WHERE idempotency_key = ? LIMIT 1', [key]);
    return { fresh: false, key, entry: rows[0] || null };
  }
}

async function completePublish(idempotencyKey, facebookId) {
  await query(
    "UPDATE facebook_publish_log SET status = 'publie', facebook_id = ?, error = '' WHERE idempotency_key = ?",
    [String(facebookId || '').slice(0, 200), String(idempotencyKey).slice(0, 191)]
  );
}

async function failPublish(idempotencyKey, message) {
  // L'échec libère la clé : une nouvelle tentative doit rester possible.
  await query(
    "UPDATE facebook_publish_log SET status = 'echec', error = ? WHERE idempotency_key = ? AND status <> 'publie'",
    [String(message || '').slice(0, 500), String(idempotencyKey).slice(0, 191)]
  );
}

async function listPublishLog(limit = 100) {
  const [rows] = await query(`SELECT * FROM facebook_publish_log ORDER BY created_at DESC LIMIT ${intLimit(limit, 100, 500)}`);
  return rows.map(row => ({
    idempotencyKey: row.idempotency_key, facebookId: row.facebook_id, status: row.status,
    contentKind: row.content_kind, contentId: row.content_id,
    hasImage: Boolean(row.has_image), hasLink: Boolean(row.has_link),
    error: row.error, createdAt: toIso(row.created_at)
  }));
}

async function recordFacebookEvents(events = []) {
  if (!events.length) return 0;
  let inserted = 0;
  for (const event of events) {
    const [result] = await query(
      `INSERT INTO facebook_events (id, page_id, field, value, received_at)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE id = id`,
      [String(event.id).slice(0, 64), String(event.pageId || '').slice(0, 100),
        String(event.field || '').slice(0, 100), JSON.stringify(event.value ?? null),
        toMysqlDate(event.receivedAt) || toMysqlDate(new Date())]
    );
    if (result.affectedRows === 1) inserted += 1;
  }
  return inserted;
}

// --------------------------------------------------------------------------
// AUDIT
// --------------------------------------------------------------------------
async function appendAudit(entry) {
  await query(
    'INSERT INTO audit_log (id, action, details, actor, created_at) VALUES (?,?,?,?,?)',
    [entry.id || crypto.randomUUID(), String(entry.action).slice(0, 120),
      JSON.stringify(entry.details ?? {}), String(entry.actor || 'admin').slice(0, 120),
      toMysqlDate(entry.createdAt) || toMysqlDate(new Date())]
  );
}

async function listAudit(limit = 100) {
  const [rows] = await query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${intLimit(limit, 100, 500)}`);
  return rows.map(row => ({
    id: row.id, action: row.action, details: parseObject(row.details),
    actor: row.actor, createdAt: toIso(row.created_at)
  }));
}

// --------------------------------------------------------------------------
// VERROUS PARTAGÉS (remplacent le verrou en mémoire mono-processus)
// --------------------------------------------------------------------------
/**
 * Tente de prendre un verrou nommé pour `ttlSeconds`. Retourne un booléen.
 * Basé sur l'unicité de la clé primaire + expiration, ce qui fonctionne aussi
 * bien sur MySQL que sur MariaDB, et survit au redémarrage d'une instance.
 */
async function acquireLock(name, ttlSeconds = 120, owner = `${process.pid}@${require('os').hostname()}`) {
  const lockName = String(name).slice(0, 80);
  // On purge d'abord les verrous périmés (un processus tué ne libère rien).
  await query('DELETE FROM app_locks WHERE lock_name = ? AND expires_at < UTC_TIMESTAMP()', [lockName]);
  try {
    await query(
      'INSERT INTO app_locks (lock_name, owner, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
      [lockName, String(owner).slice(0, 120), Number(ttlSeconds) || 120]
    );
    return true;
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
}

async function releaseLock(name, owner = `${process.pid}@${require('os').hostname()}`) {
  await query('DELETE FROM app_locks WHERE lock_name = ? AND owner = ?', [String(name).slice(0, 80), String(owner).slice(0, 120)]);
}

module.exports = {
  // infrastructure
  isEnabled: pool.isEnabled, ping: pool.ping, close: pool.close, describe: pool.describe,
  query, transaction,
  // contenu
  readContent, writeContent,
  listVillas, listTerrains, getTerrain, listActivities, listVehicles, listReviews, listFaq,
  getSettings, saveSettings,
  // référentiels
  listReferentiels, tablesReferentielsManquantes, saveReferentiel, ordonnerReferentiel, deleteReferentiel, semerReferentiels,
  // leads
  listLeads, createLead, updateLead, deleteLeads,
  // facebook
  listFacebookPosts, listFacebookPostFiches, updateFacebookPostFiche, upsertFacebookPosts, deleteFacebookPost, pruneFacebookPosts, pruneFacebookVideos, claimPublishKey, completePublish, failPublish,
  listPublishLog, recordFacebookEvents,
  // audit & verrous
  appendAudit, listAudit, acquireLock, releaseLock,
  // exposés pour les scripts d'import
  VILLA_UPSERT, villaParams, TERRAIN_UPSERT, terrainParams,
  ACTIVITY_UPSERT, activityParams, VEHICLE_UPSERT, vehicleParams, REVIEW_UPSERT, reviewParams, FAQ_UPSERT, faqParams
};
