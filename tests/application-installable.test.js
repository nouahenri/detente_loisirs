// Site installable (Android / iOS) — étape 1 de l'application mobile (13/09/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');
const PAGES = ['index.html', 'residences.html', 'terrains.html', 'loisirs.html', 'devis.html', 'contact.html', 'faq.html', 'confidentialite.html', 'voitures.html'];

test('manifeste : installable (nom, démarrage, plein écran, couleurs, icônes 192/512 + maskable existantes)', () => {
  const m = JSON.parse(lire('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/index.html?source=app');
  assert.equal(m.scope, '/');
  assert.ok(m.name && m.short_name.length <= 15, 'nom court lisible sous l’icône');
  for (const [taille, usage] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icone = m.icons.find(i => i.sizes === taille && i.purpose === usage);
    assert.ok(icone, `${taille} ${usage}`);
    assert.ok(fs.existsSync(path.join(root, icone.src)), icone.src);
  }
  m.shortcuts.forEach(raccourci => assert.ok(fs.existsSync(path.join(root, raccourci.url.split('?')[0])), raccourci.url));
});

test('pages publiques : manifeste, icône iOS et script d’installation ; le studio en est exclu', () => {
  for (const page of PAGES) {
    const html = lire(page);
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, page);
    assert.match(html, /<link rel="apple-touch-icon" href="assets\/app\/apple-touch-icon\.png">/, page);
    assert.match(html, /<script src="js\/pwa\.js\?v=\w+" defer><\/script>/, page);
  }
  const admin = lire('admin.html');
  assert.doesNotMatch(admin, /manifest\.webmanifest|js\/pwa\.js/, 'l’app ne reprend pas l’administration');
});

function travailleur() {
  const ecouteurs = {};
  const contexte = vm.createContext({
    URL, Response, self: { location: { origin: 'https://henri-philippe.com' }, addEventListener: (type, fn) => { ecouteurs[type] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => ({ put() {}, match: async () => undefined }), keys: async () => [] },
    fetch: () => Promise.reject(new Error('hors ligne'))
  });
  vm.runInContext(lire('sw.js'), contexte);
  return ecouteurs;
}

test('service worker : studio, API d’administration, envois et domaines extérieurs jamais interceptés', () => {
  const surFetch = travailleur().fetch;
  const intercepte = (url, options = {}) => {
    let repondu = false;
    surFetch({ request: { url, method: options.method || 'GET', mode: options.mode || 'cors' }, respondWith: reponse => { repondu = true; Promise.resolve(reponse).catch(() => {}); } });
    return repondu;
  };
  assert.equal(intercepte('https://henri-philippe.com/admin.html', { mode: 'navigate' }), false);
  assert.equal(intercepte('https://henri-philippe.com/api/admin/leads'), false);
  assert.equal(intercepte('https://henri-philippe.com/api/auth/session'), false);
  assert.equal(intercepte('https://henri-philippe.com/api/leads', { method: 'POST' }), false);
  assert.equal(intercepte('https://www.facebook.com/plugins/video.php'), false);
  assert.equal(intercepte('https://henri-philippe.com/sw.js'), false);
  assert.equal(intercepte('https://henri-philippe.com/residences.html', { mode: 'navigate' }), true);
  assert.equal(intercepte('https://henri-philippe.com/api/content'), true);
  assert.equal(intercepte('https://henri-philippe.com/css/refonte.css?v=1'), true);
  const sw = lire('sw.js');
  assert.match(sw, /CACHE_PAGES[\s\S]*reseauDabord/, 'pages : réseau d’abord');
  assert.match(sw, /noms\.filter\(nom => !nom\.startsWith\(VERSION\)\)/, 'anciens caches purgés');
});

test('serveur : manifeste au bon type, sw.js et icônes jamais figés en cache, projet mobile et tests non servis', () => {
  const server = lire('server.js');
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json/);
  assert.match(server, /const isApp = normalizedPath === 'sw\.js' \|\| normalizedPath === 'manifest\.webmanifest'/);
  assert.match(server, /'Cache-Control': isApp \? 'no-cache'/);
  assert.match(server, /!\/\^assets\\\/app\\\/\/i\.test\(normalizedPath\)/);
  assert.match(server, /'mobile\/', 'tests\/'/);
  assert.match(lire('offline.html'), /tel:\+2250767696318/);
});
