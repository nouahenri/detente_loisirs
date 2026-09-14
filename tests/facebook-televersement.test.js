// Envoi des visuels à Meta.
//
// Constaté en production le 12/09/2026 : `lastPublishAt` était resté à null
// depuis toujours. En passant une URL à Graph, c'est Meta qui vient chercher
// l'image sur le site — et le pare-feu de l'hébergeur refuse son robot
// (« identifying as from a known bot but is not received from the correct
// network »), d'où « Missing or invalid image file » côté Graph.
//
// Ces tests verrouillent l'inversion : un visuel présent sur le disque du
// serveur part en multipart, Meta n'a plus rien à télécharger.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };

// Un visuel qui existe VRAIMENT dans le dépôt : c'est tout l'enjeu du test.
const VISUEL_REEL = 'assets/images/residence-villa-luxe.jpg';

function publieur() {
  const debut = server.indexOf('const TAILLE_MAX_PHOTO');
  const fin = server.indexOf('\n}\n', server.indexOf('async function publishFacebookPost(')) + 3;
  assert.ok(debut > 0 && fin > debut, 'publishFacebookPost introuvable dans server.js');

  const appels = [];
  const contexte = vm.createContext({
    PAGE_ID: '123', PUBLIC_SITE_URL: 'https://henri-philippe.com', ROOT: root,
    console: quiet, crypto: require('node:crypto'),
    path, fs, URLSearchParams, JSON, Date, FormData, Blob,
    // Plafond d envoi propre aux televersements, defini hors de la tranche extraite.
    GRAPH_UPLOAD_TIMEOUT_MS: 90000,
    MIME: { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' },
    text: (v, max) => String(v ?? '').trim().slice(0, max),
    readJSON: () => [], writeJSON: () => {}, FB_PUBLISH_FILE: 'publish.json',
    dbEnabled: () => false, tryDb: async () => null,
    updateFacebookState: () => {}, audit: () => {}, publicationsSupprimees: () => new Set(),
    estAssetLocalPublic: chemin =>
      /^assets(?:\/[A-Za-z0-9._-]+)+\.(?:jpe?g|png|webp|gif|avif)$/i.test(chemin)
      && !chemin.split('/').includes('..'),
    cleanPublicUrl: (valeur, label, local) => {
      const brut = String(valeur ?? '').trim();
      if (!brut) return '';
      if (local && /^assets\//.test(brut)) return `https://henri-philippe.com/${brut}`;
      if (!/^https?:\/\//i.test(brut)) throw new Error(`${label} invalide.`);
      return brut;
    },
    graphRequest: async (chemin, options) => {
      const multipart = options?.body instanceof FormData;
      appels.push({
        chemin,
        multipart,
        champs: multipart ? [...options.body.keys()].sort() : null,
        entetes: options?.headers || null,
        corps: multipart ? null : String(options?.body ?? ''),
        nomFichier: multipart ? (options.body.get('source')?.name || null) : null,
        typeFichier: multipart ? (options.body.get('source')?.type || null) : null,
        tailleFichier: multipart ? (options.body.get('source')?.size || 0) : 0
      });
      if (chemin.endsWith('/photos')) return { id: `photo${appels.length}` };
      return { id: 'post_final' };
    }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.publier = publishFacebookPost;', contexte);
  return { publier: contexte.publier, appels };
}

test('un visuel présent sur le disque part en multipart, pas par URL', async () => {
  const p = publieur();
  await p.publier({ message: 'Vue de la villa', imageUrls: [VISUEL_REEL] });

  assert.equal(p.appels.length, 1);
  const envoi = p.appels[0];
  assert.match(envoi.chemin, /\/photos$/);
  assert.equal(envoi.multipart, true,
    'le fichier doit être envoyé à Meta, pas laissé à sa charge de le télécharger');
  assert.ok(envoi.tailleFichier > 0, 'les octets de l’image doivent accompagner la requête');
  assert.equal(envoi.typeFichier, 'image/jpeg');
  assert.equal(envoi.nomFichier, 'residence-villa-luxe.jpg');
  assert.deepEqual(envoi.champs, ['caption', 'published', 'source']);
});

test('aucun en-tête Content-Type imposé sur un envoi multipart', async () => {
  const p = publieur();
  await p.publier({ message: 'Vue', imageUrls: [VISUEL_REEL] });
  const entetes = p.appels[0].entetes || {};
  assert.equal(entetes['Content-Type'], undefined,
    'fetch doit poser lui-même la frontière multipart, qu’on ne peut pas deviner');
});

test('une URL externe reste passée telle quelle : rien à téléverser', async () => {
  const p = publieur();
  await p.publier({ message: 'Vue', imageUrls: ['https://images.unsplash.com/photo-1.jpg'] });
  const envoi = p.appels[0];
  assert.equal(envoi.multipart, false);
  assert.match(envoi.corps, /url=https%3A%2F%2Fimages\.unsplash\.com/);
  assert.match(envoi.corps, /published=true/);
});

test('un chemin local absent du disque retombe sur l’URL publique', async () => {
  const p = publieur();
  await p.publier({ message: 'Vue', imageUrls: ['assets/uploads/inexistante-xyz.jpg'] });
  const envoi = p.appels[0];
  assert.equal(envoi.multipart, false,
    'sans fichier à lire, mieux vaut tenter l’URL que rien du tout');
  assert.match(envoi.corps, /url=https%3A%2F%2Fhenri-philippe\.com/);
});

test('album mixte : chaque photo emprunte le bon chemin, un seul post final', async () => {
  const p = publieur();
  await p.publier({
    message: 'Album',
    imageUrls: [VISUEL_REEL, 'https://images.unsplash.com/photo-2.jpg']
  });

  const photos = p.appels.filter(a => a.chemin.endsWith('/photos'));
  const posts = p.appels.filter(a => a.chemin.endsWith('/feed'));
  assert.equal(photos.length, 2);
  assert.equal(posts.length, 1, 'un album, pas une rafale de publications');
  assert.equal(photos[0].multipart, true, 'le fichier local est téléversé');
  assert.equal(photos[1].multipart, false, 'l’URL externe est passée telle quelle');

  // Les deux photos restent invisibles tant que le post ne les rassemble pas.
  assert.equal(photos[0].champs.includes('published'), true);
  assert.match(photos[1].corps, /published=false/);
  assert.match(posts[0].corps, /attached_media%5B0%5D/);
  assert.match(posts[0].corps, /attached_media%5B1%5D/);
});

test('publication sans image : ni photo, ni téléversement', async () => {
  const p = publieur();
  await p.publier({ message: 'Texte seul', link: 'https://henri-philippe.com/residences.html' });
  assert.equal(p.appels.length, 1);
  assert.match(p.appels[0].chemin, /\/feed$/);
  assert.equal(p.appels[0].multipart, false);
});

test('image trop lourde : refus explicite plutôt qu’échec obscur chez Meta', () => {
  const debut = server.indexOf('const TAILLE_MAX_PHOTO');
  const fin = server.indexOf('\n}\n', server.indexOf('function resoudreVisuel(')) + 3;
  const contexte = vm.createContext({
    ROOT: root, path, URLSearchParams,
    MIME: { '.jpg': 'image/jpeg' },
    text: (v, max) => String(v ?? '').trim().slice(0, max),
    estAssetLocalPublic: () => true,
    cleanPublicUrl: () => 'https://exemple.test/x.jpg',
    // Un fichier de 20 Mo, sans en écrire un sur le disque.
    fs: { existsSync: () => true, statSync: () => ({ size: 20 * 1024 * 1024 }) }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.resoudre = resoudreVisuel;', contexte);
  assert.throws(() => contexte.resoudre('assets/images/enorme.jpg'), /trop lourde|8 Mo/);
});
