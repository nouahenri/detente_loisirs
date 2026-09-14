// Vidéos et Reels de la Page sur le site (demande du 13/09/2026 : « toutes
// les vidéos de la Page »). Code réel de server.js, Graph simulé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function monter(reponses = {}) {
  const tranche = (debut, fin) => {
    const i = server.indexOf(debut);
    const j = server.indexOf(fin, i);
    assert.ok(i > 0 && j > i, `bloc introuvable : ${debut}`);
    return server.slice(i, j);
  };
  const appels = [];
  const contexte = vm.createContext({
    URL, console: { warn: () => {} }, PAGE_ID: 'PAGE',
    text: (v, max) => String(v ?? '').slice(0, max),
    safePublicUrl: v => (/^https:\/\//.test(String(v || '')) ? String(v) : ''),
    graphRequest: async chemin => {
      appels.push(chemin);
      const reponse = typeof reponses[chemin.split('?')[0]] === 'function'
        ? reponses[chemin.split('?')[0]](chemin) : reponses[chemin.split('?')[0]];
      if (reponse instanceof Error) throw reponse;
      return reponse || { data: [] };
    }
  });
  vm.runInContext([
    tranche('const PREFIXE_VIDEO', 'function facebookConfig('),
    tranche('function facebookPostImages(', '/**\n * Identifiants des publications'),
    'this.videoDuPost = videoDuPost; this.videoEnPublication = videoEnPublication;',
    'this.recupererVideos = recupererVideos; this.fusionner = fusionnerVideos; this.normaliser = normalizeFacebookPost;'
  ].join('\n'), contexte);
  return { c: contexte, appels };
}

const REEL_GRAPH = {
  id: 'PAGE_1', message: 'Visite de la villa', created_time: '2026-07-22T10:00:00+0000',
  permalink_url: 'https://www.facebook.com/reel/1532832357951555',
  full_picture: 'https://scontent.xx.fbcdn.net/v/t15.5256-10/vignette.jpg',
  attachments: { data: [{ media_type: 'video', target: { id: '1532832357951555' }, media: { image: { src: 'https://scontent.xx.fbcdn.net/v/t15.5256-10/vignette.jpg', width: 405, height: 720 } } }] }
};

test('publication vidéo : identifiant et adresse du lecteur retenus, orientation détectée, conservés à la resynchronisation', () => {
  const { c } = monter();
  const post = c.normaliser(REEL_GRAPH);
  assert.deepEqual({ ...post.video }, { id: '1532832357951555', url: 'https://www.facebook.com/watch/?v=1532832357951555', vertical: true });
  // Le miroir est renormalisé à chaque fusion, sans `attachments` : la vidéo doit survivre.
  assert.deepEqual({ ...c.normaliser(JSON.parse(JSON.stringify(post))).video }, { ...post.video });
  assert.equal(c.normaliser({ id: 'PAGE_2', message: 'photo', attachments: { data: [{ media_type: 'photo', target: { id: '99' } }] } }).video, undefined);
});

test('lecture des vidéos : les deux edges, pagination suivie, doublons écartés, jamais d’hôte étranger', async () => {
  const { c, appels } = monter({
    'PAGE/videos': chemin => (chemin.includes('after=2')
      ? { data: [{ id: '3', created_time: '2024-01-01T00:00:00+0000' }] }
      : { data: [{ id: '1' }, { id: '2' }], paging: { next: 'https://graph.facebook.com/v21.0/PAGE/videos?fields=x&after=2' } }),
    'PAGE/video_reels': { data: [{ id: '2' }, { id: '4' }], paging: { next: 'https://pirate.example/vol?token' } }
  });
  const lecture = await c.recupererVideos();
  assert.equal(lecture.complet, true);
  assert.deepEqual([...lecture.videos.map(v => v.id)], ['1', '2', '3', '4']);
  assert.ok(appels.every(chemin => !chemin.includes('pirate')), 'le jeton ne part que vers Graph');
});

test('lecture des vidéos : Page sans Reels = normal ; autre échec = lecture incomplète', async () => {
  const sansReels = monter({ 'PAGE/videos': { data: [{ id: '1' }] }, 'PAGE/video_reels': new Error('(#100) Tried accessing nonexisting field (video_reels)') });
  assert.equal((await sansReels.c.recupererVideos()).complet, true);
  const refus = monter({ 'PAGE/videos': new Error('(#10) Permission refusée') });
  assert.equal((await refus.c.recupererVideos()).complet, false);
});

test('fusion : vidéo déjà portée par une publication = pas de doublon ; vidéo ancienne = entrée « video_ » avec vignette', () => {
  const { c } = monter();
  const publications = [c.normaliser(REEL_GRAPH)];
  const lecture = {
    complet: true,
    videos: [
      { id: '1532832357951555', created_time: '2026-07-22T10:00:00+0000' },
      { id: '775888704850266', title: 'Résidence meublée Mondoukou', description: 'Visite', created_time: '2024-03-02T09:00:00+0000',
        permalink_url: '/100737595756553/videos/775888704850266/',
        thumbnails: { data: [{ uri: 'https://scontent.xx.fbcdn.net/petite.jpg', height: 90, width: 160 }, { uri: 'https://scontent.xx.fbcdn.net/grande.jpg', height: 720, width: 1280, is_preferred: true }] } }
    ]
  };
  const liste = c.fusionner(publications, lecture, []);
  assert.deepEqual([...liste.map(p => p.id)], ['PAGE_1', 'video_775888704850266']);
  const ancienne = liste[1];
  assert.equal(ancienne.full_picture, 'https://scontent.xx.fbcdn.net/grande.jpg');
  assert.equal(ancienne.permalink_url, 'https://www.facebook.com/100737595756553/videos/775888704850266/');
  assert.equal(ancienne.message, 'Résidence meublée Mondoukou\n\nVisite');
  assert.equal(ancienne.video.vertical, false);
});

test('fusion : lecture incomplète → on garde les vidéos déjà connues ; lecture complète → une vidéo supprimée disparaît', () => {
  const { c } = monter();
  const connue = c.videoEnPublication({ id: '42', created_time: '2024-01-01T00:00:00+0000', picture: 'https://scontent.xx.fbcdn.net/a.jpg' });
  assert.deepEqual([...c.fusionner([], { complet: false, videos: [] }, [connue]).map(p => p.id)], ['video_42']);
  assert.deepEqual([...c.fusionner([], { complet: true, videos: [] }, [connue]).map(p => p.id)], []);
});

test('synchronisation : les vidéos ne passent pas par la purge par fenêtre et n’élargissent pas la fenêtre en base', () => {
  const bloc = server.slice(server.indexOf('async function runFacebookSync('), server.indexOf('\n}\n', server.indexOf('async function runFacebookSync(')));
  assert.match(bloc, /mergeFacebookPosts\(result\.data \|\| \[\], miroir\.filter\(post => !estEntreeVideo\(post\)\)\)/);
  assert.match(bloc, /pruneFacebookPosts\(posts, \{ fenetre: publications \}\)/);
  assert.match(bloc, /if \(lectureVideos\.complet\) \{[\s\S]*pruneFacebookVideos/);
  assert.match(bloc, /content\.facebookPosts = posts\.filter\(\(post, rang\) => rang < 20 \|\| post\.video\)/);
  const repo = fs.readFileSync(path.join(__dirname, '..', 'db', 'repository.js'), 'utf8');
  assert.match(repo, /listFacebookPosts\(20, \{ toutesVideos: true \}\)/, 'le site reçoit toutes les vidéos');
});

test('site : lecteur Facebook autorisé par la politique de sécurité', () => {
  assert.match(server, /"frame-src https:\/\/www\.facebook\.com/);
});
