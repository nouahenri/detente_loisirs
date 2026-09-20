// Config plugins Android de l'app (mobile/natif/plugins/*) : android/ est
// régénéré à chaque prebuild, ces plugins sont le seul endroit où une
// correction du projet Gradle survit (20/09/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');

test('ProGuard : variante « optimize » posée par plugin, gabarit inconnu laissé intact', () => {
  const { optimiserProguard } = require('../mobile/natif/plugins/proguard-optimize-android.js');
  const gabarit = [
    '        release {',
    '            minifyEnabled enableMinifyInReleaseBuilds',
    '            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"',
    '        }'
  ].join('\n');

  const corrige = optimiserProguard(gabarit);
  assert.match(corrige, /getDefaultProguardFile\("proguard-android-optimize\.txt"\), "proguard-rules\.pro"/);
  assert.doesNotMatch(corrige, /getDefaultProguardFile\("proguard-android\.txt"\)/);
  // Le commentaire va sur sa propre ligne : glissé en fin de ligne, il
  // commenterait « proguard-rules.pro » et R8 perdrait les règles du projet.
  assert.match(corrige, /^ {12}\/\/ plugins\/proguard-optimize-android\.js/m);
  assert.equal(corrige.split('\n').length, gabarit.split('\n').length + 1, 'une seule ligne ajoutée');
  assert.equal(optimiserProguard(corrige), corrige, 'rejouable sans dégât');
  // Gabarit modifié par une future version d'Expo : on ne touche à rien
  // plutôt que de produire un build.gradle bancal.
  const inconnu = '        release { proguardFiles getDefaultProguardFile("autre.txt") }';
  assert.equal(optimiserProguard(inconnu), inconnu);
});

test('app.json : les plugins Android du projet sont tous déclarés', () => {
  const app = JSON.parse(lire('mobile/natif/app.json'));
  const declares = app.expo.plugins.map(p => (Array.isArray(p) ? p[0] : p)).filter(p => typeof p === 'string' && p.startsWith('./plugins/'));
  const fichiers = fs.readdirSync(path.join(root, 'mobile/natif/plugins')).filter(f => f.endsWith('.js')).map(f => `./plugins/${f.replace(/\.js$/, '')}`);
  for (const fichier of fichiers) assert.ok(declares.includes(fichier), `${fichier} présent dans plugins/ mais pas déclaré dans app.json`);
});
