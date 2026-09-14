// Images locales envoyées à Facebook.
//
// Meta télécharge l'image depuis une URL publique : un chemin relatif du site
// doit donc être préfixé par PUBLIC_SITE_URL. La liste blanche qui décide de
// ce préfixage est un point sensible — elle transforme un chemin en URL
// publique — d'où ces tests, traversées de répertoire comprises.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function nettoyeur(siteUrl = 'https://henri-philippe.com') {
  const debut = server.indexOf('const CHEMIN_ASSET_PUBLIC');
  const fin = server.indexOf('\n}', server.indexOf('function cleanPublicUrl(')) + 2;
  assert.ok(debut > 0 && fin > debut, 'cleanPublicUrl introuvable dans server.js');
  const contexte = vm.createContext({
    PUBLIC_SITE_URL: siteUrl,
    text: (valeur, max) => String(valeur == null ? '' : valeur).slice(0, max),
    URL
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.nettoyer = cleanPublicUrl;', contexte);
  return contexte.nettoyer;
}

const IMAGE = 'Image';

test('les visuels historiques d’assets/images sont acceptés', () => {
  const nettoyer = nettoyeur();
  assert.equal(
    nettoyer('assets/images/residence-villa-luxe.jpg', IMAGE, true),
    'https://henri-philippe.com/assets/images/residence-villa-luxe.jpg',
    'quatorze visuels du catalogue vivent là : les refuser bloquait toute publication automatique'
  );
});

test('les envois du studio restent acceptés', () => {
  const nettoyer = nettoyeur();
  assert.equal(
    nettoyer('assets/uploads/photo-abc123.jpg', IMAGE, true),
    'https://henri-philippe.com/assets/uploads/photo-abc123.jpg'
  );
});

test('un sous-dossier plus profond passe aussi', () => {
  const nettoyer = nettoyeur();
  assert.equal(
    nettoyer('assets/images/villas/2026/vue-mer.webp', IMAGE, true),
    'https://henri-philippe.com/assets/images/villas/2026/vue-mer.webp'
  );
});

test('toute remontée de répertoire est refusée', () => {
  const nettoyer = nettoyeur();
  for (const chemin of [
    'assets/../../etc/passwd.jpg',
    'assets/images/../../../secret.png',
    '../assets/images/x.jpg',
    'assets/images/../.env.jpg'
  ]) {
    assert.throws(() => nettoyer(chemin, IMAGE, true), /Image invalide/,
      `« ${chemin} » ne doit jamais devenir une URL publique`);
  }
});

test('un chemin qui n’est pas une image est refusé', () => {
  const nettoyer = nettoyeur();
  for (const chemin of ['assets/images/script.js', 'assets/config.json', 'assets', 'assetsimages/x.jpg']) {
    assert.throws(() => nettoyer(chemin, IMAGE, true), /Image invalide/);
  }
});

test('sans liste blanche demandée, un chemin relatif reste refusé', () => {
  const nettoyer = nettoyeur();
  assert.throws(() => nettoyer('assets/images/residence-villa-luxe.jpg', IMAGE), /Image invalide/,
    'le préfixage local ne doit s’appliquer que là où l’appelant le demande');
});

test('PUBLIC_SITE_URL absent : message explicite plutôt qu’URL bancale', () => {
  const nettoyer = nettoyeur('');
  assert.throws(() => nettoyer('assets/images/x.jpg', IMAGE, true), /PUBLIC_SITE_URL/);
});

test('les URL absolues passent, les autres protocoles non', () => {
  const nettoyer = nettoyeur();
  assert.equal(nettoyer('https://scontent.xx.fbcdn.net/a.jpg', IMAGE), 'https://scontent.xx.fbcdn.net/a.jpg');
  assert.throws(() => nettoyer('javascript:alert(1)', IMAGE), /http:\/\/ ou https:\/\//);
  assert.throws(() => nettoyer('file:///etc/passwd', IMAGE), /http:\/\/ ou https:\/\//);
});

test('valeur vide : chaîne vide, sans exception', () => {
  const nettoyer = nettoyeur();
  assert.equal(nettoyer('', IMAGE, true), '');
  assert.equal(nettoyer(null, IMAGE, true), '');
});
