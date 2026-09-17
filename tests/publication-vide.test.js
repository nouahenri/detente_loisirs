// Incident du 16/09/2026 : « Publier » cliqué avant la fin du chargement du
// studio a envoyé l'état initial vide, et le catalogue entier a été effacé.
// Tests isolés : aucun accès réseau, aucune écriture dans data/ ni dans MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');

function extraireFonction(source, nom) {
  const debut = source.indexOf(`function ${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  const fin = source.indexOf('\n}\n', debut) + 2;
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(debut, fin)}\nthis.subject = ${nom};`, context);
  return context.subject;
}

test('catalogueVide : vrai seulement sans villa, terrain ni activité', () => {
  const catalogueVide = extraireFonction(server, 'catalogueVide');
  assert.equal(catalogueVide({ villas: [], terrains: [], activities: [], reviews: [], faq: [], settings: {} }), true);
  assert.equal(catalogueVide({}), true);
  assert.equal(catalogueVide(null), true);
  assert.equal(catalogueVide({ villas: [{ id: 'a' }], terrains: [], activities: [] }), false);
  assert.equal(catalogueVide({ villas: [], terrains: [{ id: 't' }] }), false);
  assert.equal(catalogueVide({ activities: [{ id: 'x' }] }), false);
});

test('POST /api/admin/content refuse de vider le catalogue avant toute écriture', () => {
  const route = server.slice(server.indexOf("url.pathname === '/api/admin/content')"));
  const garde = route.indexOf('catalogueVide(result.content)');
  assert.ok(garde > 0, 'garde absente de la route de publication');
  assert.ok(garde < route.indexOf("createBackup('avant-publication')"), 'la garde doit précéder la sauvegarde');
  assert.ok(garde < route.indexOf('store.writeContent('), 'la garde doit précéder l’écriture');
  assert.match(route.slice(garde, garde + 400), /json\(res, 409/);
});

test('studio : « Publier » bloqué tant que le contenu n’est pas chargé', () => {
  assert.match(admin, /contenuCharge: false/);
  const save = admin.slice(admin.indexOf('async function saveContent()'));
  assert.match(save.slice(0, 200), /if \(!state\.contenuCharge\)/);
  const load = admin.slice(admin.indexOf('async function loadAll()'), admin.indexOf('async function loadAll()') + 400);
  assert.match(load, /state\.contenuCharge = false;\s*majBoutonPublier\(\);/);
  // Contenu illisible : plus de repli silencieux sur {} qui rendait la publication possible.
  assert.doesNotMatch(admin, /fetch\('\/api\/content'[^\n]*\.catch\(\(\) => \(\{\}\)\)/);
});
