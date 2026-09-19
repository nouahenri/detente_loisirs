// Location de voitures au studio (17/09/2026) : rubriques « Voitures » et
// « Location » (planning, réservations, indisponibilités, réglages).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = lire('admin.html');
const admin = lire('js/admin.js');

test('menu : « Voitures » pour qui édite le catalogue, « Location » et son sous-menu pour location:manage', () => {
  assert.match(html, /data-view="vehicles" data-permission="content:write"/);
  assert.match(html, /data-view="location" data-permission="location:manage"/);
  assert.match(html, /id="locationSousMenu" data-permission="location:manage" hidden/);
  for (const onglet of ['planning', 'reservations', 'indisponibilites', 'reglages']) assert.match(html, new RegExp(`data-location-aller="${onglet}"`));
  assert.ok(html.indexOf('<script src="js/location-voitures.js') < html.indexOf('<script src="js/admin.js'), 'règles partagées chargées avant le studio');
});

test('sous-menu : relit les données (nouvelles demandes du site et de l’app)', () => {
  const bloc = admin.slice(admin.indexOf("$('#locationSousMenu')?.addEventListener"), admin.indexOf("$('#keyForm')"));
  assert.match(bloc, /if \(vueOuverte\) chargerLocation\(\); else showView\('location'\);/);
  assert.match(admin, /if \(name === 'location' && can\('location:manage'\)\) chargerLocation\(\);/);
});

test('fiches véhicules : éditeur commun des annonces, formule et tarifs, traductions, pas de case Facebook', () => {
  assert.match(admin, /const COLLECTIONS = \{ villa: 'villas', terrain: 'terrains', activity: 'activities', vehicle: 'vehicles' \};/);
  const champs = admin.slice(admin.indexOf('function vehicleFields('), admin.indexOf('function brancherFicheVehicule('));
  for (const nom of ['driverMode', 'driverPricePerDay', 'deposit', 'minAge', 'licenseYears', 'pricePerDay', 'pricePerDayWeek', 'pricePerDayMonth', 'kmIncludedPerDay', 'extraKmPrice', 'minDays']) {
    assert.match(champs, new RegExp(`'${nom}'|name="${nom}"`), nom);
  }
  assert.doesNotMatch(champs, /shareToFacebookField/);
  assert.match(admin, /vehicle: \[\['tagline', 'Accroche', 'ligne', 240\]/);
  assert.match(admin, /filter\(\(\[kind\]\) => kind !== 'vehicle'\)/, 'pas de case Facebook initialisée pour les véhicules');
});

test('réservation au studio : estimation partagée sans délai, alerte de chevauchement, transitions du serveur', () => {
  const bloc = admin.slice(admin.indexOf('function ouvrirReservationLocation('), admin.indexOf('function ouvrirIndisponibiliteLocation('));
  assert.match(bloc, /LV\.devis\(vehicule, d\.reglages, \{[\s\S]*?\}, \{ controlerDelai: false \}\)/);
  assert.match(bloc, /LV\.conflit\(occupees, devis\.debut, devis\.fin\)/);
  assert.match(bloc, /d\.transitions\[r\.statut\]/);
  assert.match(bloc, /method: 'PATCH', body: JSON\.stringify\(\{ statut: cible \}\)/);
});

test('planning : jours en heure d’Abidjan (UTC), demandes non bloquantes distinguées, annulées masquées', () => {
  const bloc = admin.slice(admin.indexOf('function renderPlanningLocation('), admin.indexOf('function renderReservationsLocation('));
  assert.match(bloc, /T00:00:00Z/);
  assert.match(bloc, /r\.statut !== 'annulee'/);
  assert.match(lire('css/admin.css'), /\.loc-barre\.loc-demande \{[^}]*dashed/);
});

test('fiche d’une demande de location : lien vers sa réservation', () => {
  assert.match(admin, /lead\.type === 'location-voiture' && can\('location:manage'\)/);
  assert.match(admin, /gestionLocation\.ouvrirPourDemande = lead\.id;/);
});
