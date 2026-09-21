#!/usr/bin/env node
/**
 * Applique le schéma MySQL complet : db/schema.sql PUIS les migrations
 * idempotentes de db/ qui créent les tables hors catalogue.
 *
 *   npm run migrate
 *
 * Crée les tables absentes puis ajoute les colonnes du catalogue manquantes.
 * Les colonnes existantes et les données éditées ne sont jamais réinitialisées.
 *
 * Pourquoi deux fichiers : db/schema.sql ne décrit que le catalogue public
 * (villas, terrains, activités, demandes, Facebook). Les comptes du studio, la
 * newsletter et la file d'attente e-mail vivent dans
 * db/migration-auth-newsletter.sql, qui devait jusqu'ici être importé à la main
 * dans phpMyAdmin. Une base créée uniquement avec `npm run migrate` se
 * retrouvait donc sans `users`, `sessions`, `newsletter_subscribers`,
 * `newsletter_campaigns` ni `mail_queue`.
 * Les deux fichiers sont donc appliqués ensemble ; ils n'emploient que
 * CREATE TABLE IF NOT EXISTS, rejouer la migration ne détruit rien.
 *
 * Si DB_HOST n'est pas défini, le script s'arrête proprement en expliquant que
 * le site fonctionne en mode fichiers JSON — ce n'est pas une erreur.
 */

const fs = require('fs');
const path = require('path');
require('../db/env').load();
const pool = require('../db/pool');

const DB_DIR = path.join(__dirname, '..', 'db');

// Appliqués dans cet ordre. N'ajouter ici que des fichiers strictement
// idempotents (CREATE TABLE IF NOT EXISTS) : ce script est rejoué à chaque
// déploiement.
const SCHEMA_FILES = [
  path.join(DB_DIR, 'schema.sql'),
  path.join(DB_DIR, 'migration-auth-newsletter.sql')
];

/**
 * Découpe le fichier SQL en instructions.
 * Gère les commentaires `--`, `#`, `/* *\/` et les chaînes quotées, afin qu'un
 * point-virgule à l'intérieur d'un commentaire ou d'un texte ne coupe pas une
 * instruction en deux.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) { if (char === '\n') { inLineComment = false; current += char; } continue; }
    if (inBlockComment) { if (char === '*' && next === '/') { inBlockComment = false; i += 1; } continue; }

    if (!quote) {
      if (char === '-' && next === '-') { inLineComment = true; i += 1; continue; }
      if (char === '#') { inLineComment = true; continue; }
      if (char === '/' && next === '*') { inBlockComment = true; i += 1; continue; }
      if (char === "'" || char === '"' || char === '`') { quote = char; current += char; continue; }
      if (char === ';') { if (current.trim()) statements.push(current.trim()); current = ''; continue; }
    } else {
      if (char === '\\') { current += char + (next ?? ''); i += 1; continue; }
      if (char === quote) { quote = null; }
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function main() {
  if (!pool.isEnabled()) {
    console.log('MySQL n\'est pas configuré (DB_HOST absent).');
    console.log('Le site fonctionne en mode fichiers JSON : aucune migration nécessaire.');
    console.log('Pour activer MySQL, renseignez DB_HOST, DB_NAME, DB_USER et DB_PASSWORD.');
    return;
  }

  const target = pool.describe();
  console.log(`Base cible : ${target.user}@${target.host}:${target.port}/${target.database}`);

  const health = await pool.ping();
  if (!health.ok) {
    console.error(`Connexion impossible : ${health.error}`);
    console.error('Vérifiez que l\'utilisateur MySQL est bien rattaché à la base avec TOUS LES PRIVILÈGES.');
    process.exitCode = 1;
    return;
  }

  const statements = [];
  for (const file of SCHEMA_FILES) {
    if (!fs.existsSync(file)) {
      console.error(`Fichier SQL introuvable : ${file}`);
      process.exitCode = 1;
      return;
    }
    const found = splitStatements(fs.readFileSync(file, 'utf8'));
    console.log(`  ${path.basename(file)} : ${found.length} instruction(s).`);
    statements.push(...found);
  }
  console.log(`${statements.length} instruction(s) à exécuter au total.`);

  const connection = await pool.getPool().getConnection();
  let applied = 0;
  try {
    for (const statement of statements) {
      const label = statement.replace(/\s+/g, ' ').slice(0, 70);
      try {
        await connection.query(statement);
        applied += 1;
        console.log(`  ✓ ${label}…`);
      } catch (error) {
        console.error(`  ✗ ${label}…`);
        console.error(`    ${error.message}`);
        throw error;
      }
    }
    // CREATE TABLE IF NOT EXISTS ne met pas à niveau les anciennes tables.
    // Ces ajouts sont explicites : aucune migration de données ni seed implicite.
    const additions = [
      ['villas', 'environment', "VARCHAR(32) NOT NULL DEFAULT 'terre'"],
      ['activities', 'price_amount', 'INT UNSIGNED NOT NULL DEFAULT 0'],
      ['activities', 'price_unit', "VARCHAR(20) NOT NULL DEFAULT 'forfait'"],
      ['activities', 'group_price_amount', 'INT UNSIGNED NOT NULL DEFAULT 0'],
      ['activities', 'group_size', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
      ['newsletter_subscribers', 'phone', "VARCHAR(40) NOT NULL DEFAULT ''"],
      // Fiche du bien sur les publications Facebook (db/migration-fiche-publications.sql).
      // Ordre et positions identiques au script phpMyAdmin et à db/schema.sql.
      ['facebook_posts', 'name', "VARCHAR(160) NOT NULL DEFAULT '' AFTER `full_picture`"],
      ['facebook_posts', 'tagline', "VARCHAR(240) NOT NULL DEFAULT '' AFTER `name`"],
      ['facebook_posts', 'category', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `tagline`"],
      ['facebook_posts', 'category_label', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `category`"],
      ['facebook_posts', 'environment', "VARCHAR(32) NOT NULL DEFAULT '' AFTER `category_label`"],
      ['facebook_posts', 'location', "VARCHAR(240) NOT NULL DEFAULT '' AFTER `environment`"],
      ['facebook_posts', 'price_per_night', 'BIGINT UNSIGNED NULL AFTER `location`'],
      ['facebook_posts', 'price_euro', 'INT UNSIGNED NULL AFTER `price_per_night`'],
      ['facebook_posts', 'weekend_package', 'BIGINT UNSIGNED NULL AFTER `price_euro`'],
      ['facebook_posts', 'capacity', 'SMALLINT UNSIGNED NULL AFTER `weekend_package`'],
      ['facebook_posts', 'bedrooms', 'SMALLINT UNSIGNED NULL AFTER `capacity`'],
      ['facebook_posts', 'bathrooms', 'SMALLINT UNSIGNED NULL AFTER `bedrooms`'],
      ['facebook_posts', 'beds', "VARCHAR(160) NOT NULL DEFAULT '' AFTER `bathrooms`"],
      ['facebook_posts', 'status', "VARCHAR(40) NOT NULL DEFAULT '' AFTER `beds`"],
      ['facebook_posts', 'badge', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `status`"],
      ['facebook_posts', 'featured', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER `badge`'],
      ['facebook_posts', 'features', 'JSON NULL AFTER `featured`'],
      ['facebook_posts', 'highlights', 'JSON NULL AFTER `features`'],
      // Rattachement aux référentiels (db/migration-referentiels.sql).
      ['villas', 'localisation_id', 'VARCHAR(80) NULL AFTER `location`'],
      ['villas', 'localisation_precision', "VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`"],
      ['villas', 'badge_id', 'VARCHAR(80) NULL AFTER `badge`'],
      ['villas', 'equipements', 'JSON NULL AFTER `features`'],
      ['terrains', 'localisation_id', 'VARCHAR(80) NULL AFTER `location`'],
      ['terrains', 'localisation_precision', "VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`"],
      ['terrains', 'badge_id', 'VARCHAR(80) NULL AFTER `badge`'],
      ['activities', 'badge_id', 'VARCHAR(80) NULL AFTER `badge`'],
      ['facebook_posts', 'localisation_id', 'VARCHAR(80) NULL AFTER `location`'],
      ['facebook_posts', 'localisation_precision', "VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`"],
      ['facebook_posts', 'badge_id', 'VARCHAR(80) NULL AFTER `badge`'],
      ['facebook_posts', 'equipements', 'JSON NULL AFTER `features`'],
      // Points de l'audit du 13/09/2026 (db/migration-5-points.sql).
      ['villas', 'translations', 'JSON NULL AFTER `highlights`'],
      ['terrains', 'translations', 'JSON NULL AFTER `longitude`'],
      ['activities', 'price_prefix', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `group_size`"],
      ['activities', 'price_suffix', "VARCHAR(80) NOT NULL DEFAULT '' AFTER `price_prefix`"],
      ['activities', 'translations', 'JSON NULL AFTER `price_suffix`'],
      // Accord pour les offres WhatsApp (db/migration-whatsapp.sql).
      ['leads', 'whatsapp_optin', 'TINYINT(1) NULL DEFAULT NULL AFTER `source_ip`'],
      ['leads', 'whatsapp_optin_at', 'DATETIME NULL DEFAULT NULL AFTER `whatsapp_optin`'],
      // Gestion des annonces (db/migration-gestion-compta.sql).
      ['villas', 'etat', "VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `translations`"],
      ['villas', 'facebook', 'TINYINT(1) NULL DEFAULT NULL AFTER `etat`'],
      ['terrains', 'etat', "VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `translations`"],
      ['terrains', 'facebook', 'TINYINT(1) NULL DEFAULT NULL AFTER `etat`'],
      ['activities', 'etat', "VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `featured`"],
      ['activities', 'facebook', 'TINYINT(1) NULL DEFAULT NULL AFTER `etat`'],
      // Propriétaire du bien (db/migration-proprietaires-annonces.sql).
      ['villas', 'proprietaire', 'JSON NULL AFTER `facebook`'],
      ['terrains', 'proprietaire', 'JSON NULL AFTER `facebook`'],
      ['activities', 'proprietaire', 'JSON NULL AFTER `facebook`'],
      // Villas facturées par chambre (db/migration-prix-par-chambre.sql).
      ['villas', 'price_unit', "VARCHAR(16) NOT NULL DEFAULT 'villa' AFTER `price_per_night`"]
    ];
    for (const [table, column, definition] of additions) {
      const [existing] = await connection.execute(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, column]
      );
      if (existing.length) continue;
      // Identifiants issus uniquement de la liste constante ci-dessus.
      await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`  ✓ Colonne ajoutée : ${table}.${column}`);
    }
    // Valeurs initiales des référentiels. INSERT IGNORE : une valeur déjà
    // présente — ou modifiée dans le studio — n'est jamais écrasée.
    const { DEFAUTS } = require('../db/referentiels');
    const repository = require('../db/repository');
    const semees = await repository.semerReferentiels(DEFAUTS, connection);
    if (semees) console.log(`  ✓ Référentiels : ${semees} valeur(s) initiale(s) ajoutée(s)`);
  } finally {
    connection.release();
  }

  const [tables] = await pool.getPool().query('SHOW TABLES');
  console.log(`\n${applied} instruction(s) appliquée(s). ${tables.length} table(s) présente(s) dans la base :`);
  tables.forEach(row => console.log(`  · ${Object.values(row)[0]}`));
  console.log('\nÉtape suivante : `npm run seed` pour importer data/site-content.json.');
}

main()
  .catch(error => { console.error(`\nÉchec de la migration : ${error.message}`); process.exitCode = 1; })
  .finally(() => pool.close().catch(() => {}));
