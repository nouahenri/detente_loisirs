// Migration du 17/09/2026 : tables de gestion (demandeurs, avis, comptabilité,
// mots de passe, rôles) identiques dans le script phpMyAdmin et la migration
// automatique, et colonnes réellement utilisées par le code.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lire = fichier => fs.readFileSync(path.join(__dirname, '..', fichier), 'utf8');
const migration = lire('db/migration-gestion-compta.sql');
const bloc = (sql, table) => {
  const debut = sql.indexOf(`CREATE TABLE IF NOT EXISTS \`${table}\``);
  if (debut < 0) return '';
  return sql.slice(debut, sql.indexOf(';', sql.indexOf(') ENGINE=', debut)) + 1);
};
const colonnes = (sql, table) => [...bloc(sql, table).matchAll(/^\s+`([a-z_]+)`\s/gm)].map(m => m[1]);

const TABLES = {
  'db/schema.sql': ['demandeurs_restrictions', 'avis_jaime', 'avis_commentaires', 'compta_ecritures', 'compta_employes', 'compta_charges', 'compta_parametres'],
  'db/migration-auth-newsletter.sql': ['password_resets', 'roles']
};

test('chaque table du script phpMyAdmin est définie à l’identique pour « npm run migrate »', () => {
  for (const [fichier, tables] of Object.entries(TABLES)) {
    const sql = lire(fichier);
    for (const table of tables) {
      assert.ok(bloc(migration, table), `${table} absente du script phpMyAdmin`);
      assert.equal(bloc(sql, table), bloc(migration, table), `${table} : définitions différentes dans ${fichier}`);
    }
  }
  // Les rôles et liens de réinitialisation dépendent de `users`, créée dans le même fichier.
  const auth = lire('db/migration-auth-newsletter.sql');
  assert.ok(auth.indexOf('CREATE TABLE IF NOT EXISTS `users`') < auth.indexOf('CREATE TABLE IF NOT EXISTS `password_resets`'));
});

test('colonnes écrites par le code présentes dans les tables', () => {
  const sources = { demandeurs: lire('db/demandeurs.js'), avis: lire('db/avis.js'), compta: lire('db/comptabilite.js'), auth: lire('db/auth-store.js') };
  const inserts = (source, table) => [...source.matchAll(new RegExp(`INSERT (?:IGNORE )?INTO ${table} \\(([^)]+)\\)`, 'g'))]
    .flatMap(m => m[1].split(',').map(c => c.trim())).filter(c => !c.includes('$'));
  const attendu = {
    demandeurs_restrictions: inserts(sources.demandeurs, 'demandeurs_restrictions'),
    avis_jaime: inserts(sources.avis, 'avis_jaime'),
    avis_commentaires: inserts(sources.avis, 'avis_commentaires'),
    compta_employes: inserts(sources.compta, 'compta_employes'),
    compta_charges: inserts(sources.compta, 'compta_charges'),
    compta_parametres: inserts(sources.compta, 'compta_parametres'),
    password_resets: inserts(sources.auth, 'password_resets'),
    roles: inserts(sources.auth, 'roles')
  };
  const COMPTA = require('../db/comptabilite');
  assert.ok(COMPTA, 'module comptabilité chargé');
  const ecriture = sources.compta.match(/const ECRITURE_COLONNES = \[([^\]]+)\]/)[1].match(/'([a-z_]+)'/g).map(c => c.slice(1, -1));
  attendu.compta_ecritures = ecriture;
  for (const [table, liste] of Object.entries(attendu)) {
    assert.ok(liste.length > 2, `${table} : colonnes du code introuvables`);
    const definies = colonnes(migration, table);
    for (const colonne of liste) assert.ok(definies.includes(colonne), `${table}.${colonne} manquante`);
  }
});

test('clés d’unicité exigées par INSERT IGNORE / ON DUPLICATE KEY', () => {
  assert.match(bloc(migration, 'avis_jaime'), /PRIMARY KEY \(`kind`, `annonce_id`, `visiteur`\)/);
  assert.match(bloc(migration, 'compta_parametres'), /PRIMARY KEY \(`type`, `id`\)/);
  assert.match(bloc(migration, 'roles'), /PRIMARY KEY \(`code`\)/);
});

test('ordre sûr : tables et réglage d’abord, ALTER TABLE en dernier ; colonnes identiques à la migration automatique', () => {
  const premierAlter = migration.indexOf('\nALTER TABLE `');
  assert.ok(migration.lastIndexOf('\nCREATE TABLE IF NOT EXISTS') < premierAlter);
  assert.ok(migration.indexOf("DELETE FROM `settings` WHERE `setting_key` = 'facebookAutoPublish'") < premierAlter);
  assert.doesNotMatch(migration, /DROP |TRUNCATE /i);
  const migrate = lire('scripts/migrate.js');
  for (const [table, apres] of [['villas', 'translations'], ['terrains', 'translations'], ['activities', 'featured']]) {
    assert.match(migration, new RegExp(`ALTER TABLE \`${table}\`\\s+ADD COLUMN \`etat\`\\s+VARCHAR\\(20\\) NOT NULL DEFAULT 'active' COMMENT '[^']+' AFTER \`${apres}\``));
    assert.ok(migrate.includes(`['${table}', 'etat', "VARCHAR(20) NOT NULL DEFAULT 'active' AFTER \`${apres}\`"]`), table);
    assert.ok(migrate.includes(`['${table}', 'facebook', 'TINYINT(1) NULL DEFAULT NULL AFTER \`etat\`']`), table);
  }
});
