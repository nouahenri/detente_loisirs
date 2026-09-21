// Villas et résidences facturées par chambre (demande du 21/09/2026) :
// tarif « par chambre et par nuit », nombre de chambres au devis, et plus
// aucune résidence choisie d'office dans le simulateur du site.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const repository = require('../db/repository');

test('base : colonne price_unit dans le schéma, la migration phpMyAdmin et la migration automatique', () => {
  assert.match(lire('db/schema.sql'), /`price_unit`\s+VARCHAR\(16\)\s+NOT NULL DEFAULT 'villa'/);
  const migration = lire('db/migration-prix-par-chambre.sql');
  assert.match(migration, /ALTER TABLE `villas`\s+ADD COLUMN IF NOT EXISTS `price_unit` VARCHAR\(16\) NOT NULL DEFAULT 'villa'/);
  // Piège phpMyAdmin : un script qui finit par un SELECT sur information_schema n'applique rien.
  assert.doesNotMatch(migration, /information_schema/i);
  assert.match(lire('scripts/migrate.js'), /\['villas', 'price_unit', "VARCHAR\(16\) NOT NULL DEFAULT 'villa' AFTER `price_per_night`"\]/);
});

test('dépôt : autant de colonnes que de valeurs, « chambre » écrit et relu, « villa » par défaut', () => {
  const sql = repository.VILLA_UPSERT;
  const colonnes = sql.match(/\(([^)]*)\)\s*VALUES/)[1].split(',').map(c => c.trim());
  const marqueurs = sql.match(/VALUES \(([^)]*)\)/)[1].split(',').length;
  const valeurs = repository.villaParams({ id: 'grace', priceUnit: 'chambre' }, 0);
  assert.equal(colonnes.length, marqueurs);
  assert.equal(valeurs.length, marqueurs);
  assert.equal(valeurs[colonnes.indexOf('price_unit')], 'chambre');
  assert.equal(repository.villaParams({ id: 'oasis' }, 0)[colonnes.indexOf('price_unit')], 'villa');
  assert.equal(repository.villaParams({ id: 'x', priceUnit: '<script>' }, 0)[colonnes.indexOf('price_unit')], 'villa');
  assert.match(sql, /price_unit=VALUES\(price_unit\)/);
  assert.match(lire('db/repository.js'), /priceUnit: row\.price_unit === 'chambre' \? 'chambre' : 'villa',/);
});

test('serveur et studio : unité de tarif limitée à « villa » ou « chambre »', () => {
  assert.match(lire('server.js'), /priceUnit: item\?\.priceUnit === 'chambre' \? 'chambre' : 'villa',/);
  const studio = lire('js/admin.js');
  assert.match(studio, /<select name="priceUnit"><option value="villa"/);
  assert.match(studio, /priceUnit: v\.priceUnit === 'chambre' \? 'chambre' : 'villa'/);
});

test('site : tarif × chambres × nuits, aucune résidence d’office, envoi bloqué sans résidence', () => {
  const site = lire('js/app.js');
  assert.match(site, /const villaSubtotal = selectedVilla \? selectedVilla\.pricePerNight \* chambres \* diffDays : 0;/);
  assert.doesNotMatch(site, /\|\| VILLAS_DATA\[0\]\);/);
  assert.match(site, /villaSelect\.value = liste\.some\(v => v\.id === avant && !estIndisponible\(v\)\) \? avant : "";/);
  assert.match(site, /if \(residenceManquante\(\)\) \{\n\s+event\.preventDefault\(\);/);
  assert.match(site, /T\(parChambre\(villa\) \? "js\.parChambreNuitee" : "js\.parNuitee"\)/);
  const page = lire('devis.html');
  for (const id of ['simChambresField', 'simChambres', 'simVillaAlerte']) assert.match(page, new RegExp(`id="${id}"`));
  const i18n = lire('js/i18n.js');
  for (const cle of ['js.parChambreNuitee', 'js.choisirResidence', 'js.residenceRequise', 't.nombre-de-chambres']) {
    assert.equal(i18n.split(`"${cle}": `).length - 1, 3, `${cle} : FR, EN, ES`);
  }
});

test('app : même calcul que le site, chambres bornées par la fiche', () => {
  const regles = lire('mobile/natif/src/donnees/regles.ts');
  assert.match(regles, /const sousTotalVilla = sansResidence \|\| !villa \? 0 : villa\.pricePerNight \* chambres \* jours;/);
  assert.match(regles, /Math\.min\(Math\.max\(1, villa\.bedrooms \|\| 1\), Math\.max\(1, Math\.round\(devis\.chambres\) \|\| 1\)\)/);
  assert.match(regles, /priceUnit: item\.priceUnit === 'chambre' \? 'chambre' : 'villa',/);
  const i18n = lire('mobile/natif/src/donnees/i18n.ts');
  for (const cle of ['ligne.parChambreNuit', 'fiche.parChambreNuitEuro', 'devis.parChambreNuit', 'devis.chambresTitre', 'devis.chambresNuitsPers']) {
    assert.equal(i18n.split(`'${cle}': `).length - 1, 3, `${cle} : FR, EN, ES`);
  }
  // « Location de voiture » : un appui mène directement au véhicule.
  const ecran = lire('mobile/natif/src/app/(onglets)/devis.tsx');
  assert.match(ecran, /const etapeApresFormule = \(mode: Formule\) => \(mode === 'voiture' \? 2 : 1\);/);
  assert.doesNotMatch(ecran, /devis\.voitureSeuleAide/);
});
