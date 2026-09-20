// Équipements des voitures (demande du 19/09/2026) : liste administrable à
// part de celle des hébergements, cochée sur la fiche du véhicule dans le
// studio — la saisie libre disparaît, le site affiche les libellés traduits.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REF = require('../db/referentiels.js');
const LOC = require('../db/location.js');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const admin = lire('js/admin.js');
const html = lire('admin.html');
const server = lire('server.js');
const site = lire('js/voitures.js');
const schema = lire('db/schema.sql');
const repository = lire('db/repository.js');
const migration = lire('db/migration-equipements-voiture.sql');

test('référentiel : liste propre aux véhicules, sans équipement de villa', () => {
  const refs = REF.normaliserReferentiels(null);
  const voiture = refs['equipements-voiture'];
  assert.ok(REF.TYPES.includes('equipements-voiture'));
  assert.equal(voiture.length, 18);
  for (const id of ['climatisation', 'gps', 'camera-recul', 'airbags', 'quatre-roues-motrices']) {
    assert.ok(voiture.some(e => e.id === id), `${id} attendu dans la liste des voitures`);
  }
  for (const id of ['piscine', 'ponton', 'chef']) {
    assert.ok(!voiture.some(e => e.id === id), `${id} n'a rien à faire sur une voiture`);
  }
  // Traduites comme les autres référentiels : le site n'a rien à traduire.
  const camera = voiture.find(e => e.id === 'camera-recul');
  assert.equal(camera.libelle.en, 'Reversing camera');
  assert.equal(camera.libelle.es, 'Cámara de marcha atrás');
});

test('référentiel : une entrée cochée sur un véhicule compte comme utilisée', () => {
  const biens = { vehicles: [{ id: 'tucson', equipements: ['gps', 'climatisation'] }], villas: [{ id: 'v1', equipements: ['piscine'] }] };
  assert.equal(REF.compterUsages('equipements-voiture', 'gps', biens), 1);
  assert.equal(REF.compterUsages('equipements-voiture', 'toit-ouvrant', biens), 0);
  // Les deux listes ne se mélangent pas : « piscine » reste comptée côté villas.
  assert.equal(REF.compterUsages('equipements', 'piscine', biens), 1);
  assert.equal(REF.compterUsages('equipements-voiture', 'piscine', biens), 0);
});

test('fiche véhicule : les identifiants cochés sont conservés par le serveur', () => {
  const vehicule = LOC.validerVehicule({
    name: 'Hyundai Tucson', category: 'suv', driverMode: 'choix', pricePerDay: 85000,
    equipements: ['gps', '', 'climatisation'], images: ['a.jpg']
  }, 0, { vus: new Set(), errors: [], warnings: [] });
  assert.deepEqual(vehicule.equipements, ['gps', 'climatisation'], 'les vides sont écartés');
});

test('serveur : les équipements du véhicule sont vérifiés contre leur propre référentiel', () => {
  assert.match(server, /avecEquipements: 'equipements-voiture'/, 'les véhicules cochent la liste des voitures');
  assert.match(server, /const typeEquipements = avecEquipements === true \? 'equipements' : avecEquipements;/);
  // `features` (ce qu'affichent le site et l'application) est recalculé, jamais saisi.
  assert.match(server, /resultat\.features = equipements\.map\(code => REF\.libelleDe/);
  // Le type porte un tiret : la route des référentiels doit l'accepter.
  assert.match(server, /referentiels\\\/\(\[a-z-\]\+\)/);
});

test('studio : cases à cocher sur la fiche, plus de saisie libre', () => {
  assert.match(html, /data-ref-type="equipements-voiture"/, 'onglet dans Référentiels');
  assert.match(admin, /'equipements-voiture': 'Équipements voitures'/);
  assert.match(admin, /\$\{champsEquipementsVehicule\(item\)\}/, 'la fiche du véhicule affiche les cases');
  const fiche = admin.slice(admin.indexOf('function vehicleFields'), admin.indexOf('function brancherFicheVehicule'));
  assert.ok(!/textarea name="features"/.test(fiche), 'le champ libre a disparu de la fiche du véhicule');
  assert.match(admin, /equipements: Array\.isArray\(v\.equipements\) \? v\.equipements : \[\]/, 'enregistrement des cases');
  // Les équipements ne se traduisent plus à la main : le référentiel s'en charge.
  assert.match(admin, /vehicle: \[\['tagline'.*\['description', 'Description', 'texte', 8000\]\]/);
});

test('studio : une fiche d’avant la bascule voit ses anciennes lignes pré-cochées', () => {
  // La correspondance se fait sur le libellé, accents, casse et pluriel ignorés :
  // « Air Bag » → airbags, « Gps » → gps, « Climatisation » → climatisation.
  const bloc = admin.slice(admin.indexOf('const cleEquipement'), admin.indexOf('function champsEquipementsVehicule'));
  assert.match(bloc, /normalize\('NFD'\)/);
  assert.match(bloc, /replace\(\/s\$\/, ''\)/, 'le pluriel ne bloque pas la correspondance');
  assert.match(admin, /Anciennes lignes non reprises/, 'ce qui n’est pas reconnu est annoncé, pas perdu en silence');
});

test('site : les équipements cochés sont affichés traduits, les anciennes fiches restent lisibles', () => {
  assert.match(site, /const equipementsLisibles = v =>/);
  assert.match(site, /libelleReferentiel\("equipements-voiture", id, ""\)/);
  assert.match(site, /return champ\(v, "features"\) \|\| \[\];/, 'repli sur les anciennes lignes');
  assert.match(site, /const features = equipementsLisibles\(v\);/);
});

test('base : table dédiée, migration idempotente et alignée sur le module', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `ref_equipements_voiture`/);
  assert.match(repository, /'equipements-voiture': 'ref_equipements_voiture'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `ref_equipements_voiture`/);
  assert.match(migration, /INSERT IGNORE INTO `ref_equipements_voiture`/);
  // Piège du 17/09/2026 : un import qui finit sur information_schema est rejoué
  // dans information_schema et n'applique rien.
  assert.ok(!/information_schema/i.test(migration), 'aucun SELECT sur information_schema');
  for (const entree of REF.DEFAUTS['equipements-voiture']) {
    assert.ok(migration.includes(`('${entree.id}'`), `${entree.id} doit être inséré par la migration`);
  }
});
