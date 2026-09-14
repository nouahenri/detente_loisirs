// Envoi final d'une publication vers Graph (incident du 13/09/2026, 18:30 UTC).
// Villa L'Oasis, 5 photos, republiée depuis le studio :
//   · `link` passé avec attached_media → Facebook a créé une publication de
//     LIEN (vignette d'aperçu) et ignoré les 5 photos ;
//   · Graph a créé la publication puis n'a pas répondu en 12 s → échec noté,
//     publication non rattachée à sa fiche.
// Code réel de server.js exécuté dans un contexte vm, Graph simulé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function monter({ feed, publications = [], journalInitial = [], supprimees = [] }) {
  const debut = server.indexOf('async function publierSansDoublon(');
  const fin = server.indexOf('// Site → Facebook : option EXPLICITE');
  assert.ok(debut > 0 && fin > debut, 'bloc de publication introuvable dans server.js');
  const appels = [];
  const journal = structuredClone(journalInitial);
  const audits = [];
  const contexte = vm.createContext({
    crypto, URLSearchParams, console: { warn: () => {} }, setTimeout: fn => fn(), Date,
    PAGE_ID: 'PAGE', GRAPH_UPLOAD_TIMEOUT_MS: 90000, FB_PUBLISH_FILE: 'publish', edgePublications: null,
    text: (v, max) => String(v ?? '').slice(0, max),
    audit: (evenement, details) => audits.push({ evenement, details }),
    readJSON: () => journal.slice(), writeJSON: (f, v) => { journal.splice(0, journal.length, ...v); },
    dbEnabled: () => false, tryDb: async () => null, updateFacebookState: () => {},
    publicationsSupprimees: () => new Set(supprimees),
    cleanPublicUrl: v => String(v || ''),
    resoudreVisuel: v => (v ? { url: v } : null),
    envoyerPhoto: async (visuel, options) => { appels.push({ photo: visuel.url, options }); return { id: `photo_${appels.length}` }; },
    graphRequest: async (endpoint, options = {}) => {
      appels.push({ endpoint, options });
      if (endpoint === 'PAGE/feed') return feed(options);
      if (/published_posts|\/feed\?/.test(endpoint)) return { data: publications };
      throw new Error(`appel inattendu ${endpoint}`);
    }
  });
  vm.runInContext(`${server.slice(debut, fin)}\nthis.publier = publishFacebookPost;`, contexte);
  return { publier: contexte.publier, appels, journal, audits };
}

const CHARGE = {
  message: '𝗩𝗜𝗟𝗟𝗔 𝗟’𝗢𝗔𝗦𝗜𝗦\n\nNichée au cœur de la lagune.',
  link: 'https://henri-philippe.com/residences.html',
  imageUrls: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
  origine: { kind: 'villa', id: 'villa-oasis' }
};

test('album : jamais de paramètre `link` avec attached_media, le lien est dans le texte', async () => {
  const m = monter({ feed: () => ({ id: 'PAGE_1' }) });
  await m.publier({ ...CHARGE });
  const post = m.appels.find(a => a.endpoint === 'PAGE/feed');
  const params = post.options.body;
  assert.equal(params.get('link'), null, 'avec `link`, Facebook ignore les photos');
  assert.equal([...params.keys()].filter(k => k.startsWith('attached_media')).length, 5);
  assert.ok(params.get('message').endsWith('\n\nhttps://henri-philippe.com/residences.html'));
  assert.equal(post.options.timeoutMs, 90000, 'plus de 12 s pour l’envoi final');
});

test('délai dépassé mais publication créée : retrouvée, rattachée à la fiche, pas d’échec', async () => {
  const m = monter({
    feed: () => { throw new Error("Meta n'a pas répondu en 90 s."); },
    publications: [{ id: 'PAGE_42', message: `${CHARGE.message}\n\n${CHARGE.link}`, created_time: new Date().toISOString() }]
  });
  const resultat = await m.publier({ ...CHARGE });
  assert.equal(resultat.post_id, 'PAGE_42');
  assert.equal(m.journal[0].facebookId, 'PAGE_42');
  assert.deepEqual({ ...m.journal[0].origine }, { kind: 'villa', id: 'villa-oasis' }, 'masquée de « Depuis Facebook »');
  assert.equal(m.audits.find(a => a.evenement === 'facebook.publish_recovered').details.facebookId, 'PAGE_42');
});

test('délai dépassé et rien sur la Page : l’échec remonte', async () => {
  const m = monter({
    feed: () => { throw new Error("Meta n'a pas répondu en 90 s."); },
    publications: [{ id: 'VIEUX', message: CHARGE.message, created_time: '2026-01-01T00:00:00+0000' }]
  });
  await assert.rejects(m.publier({ ...CHARGE }), /n'a pas répondu/);
  assert.equal(m.journal.length, 0);
});

test('autre erreur Graph : pas de recherche, l’erreur remonte telle quelle', async () => {
  const m = monter({ feed: () => { throw new Error('(#200) Permissions error'); } });
  await assert.rejects(m.publier({ ...CHARGE }), /Permissions error/);
  assert.equal(m.appels.filter(a => /published_posts/.test(a.endpoint)).length, 0);
});

test('même clé qu’une publication supprimée sur Facebook : l’annonce repart vraiment', async () => {
  const entree = { idempotencyKey: 'cle-fixe', facebookId: 'PAGE_supprimee', status: 'publie', createdAt: '2026-09-13T18:40:24.000Z' };
  const encore = monter({ feed: () => ({ id: 'PAGE_neuf' }), journalInitial: [entree] });
  const doublon = await encore.publier({ ...CHARGE, idempotencyKey: 'cle-fixe' });
  assert.equal(doublon.duplicate, true, 'toujours en ligne : doublon, rien n’est envoyé');
  assert.equal(encore.appels.length, 0);

  const supprimee = monter({ feed: () => ({ id: 'PAGE_neuf' }), journalInitial: [entree], supprimees: ['PAGE_supprimee'] });
  const envoi = await supprimee.publier({ ...CHARGE, idempotencyKey: 'cle-fixe' });
  assert.equal(envoi.duplicate, false);
  assert.equal(envoi.id, 'PAGE_neuf');
});

test('titre Facebook : majuscules grasses, accents conservés, copie du studio identique', () => {
  const extraire = (source, debut) => {
    const i = source.indexOf(debut);
    return source.slice(i, source.indexOf('\n}', i) + 2).replace(/\n {2}/g, '\n');
  };
  const serveur = vm.createContext({});
  vm.runInContext(`${extraire(server, 'function titreFacebook(')}\nthis.f = titreFacebook;`, serveur);
  const studio = vm.createContext({});
  const admin = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
  const i = admin.indexOf('  function titreFacebook(');
  vm.runInContext(`${admin.slice(i, admin.indexOf('\n  }\n', i) + 4)}\nthis.f = titreFacebook;`, studio);

  assert.equal(serveur.f('Villa Oasis 2'), '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦 𝟮');
  assert.equal(serveur.f('Évasion à la plage').normalize('NFC'), '𝗘́𝗩𝗔𝗦𝗜𝗢𝗡 𝗔̀ 𝗟𝗔 𝗣𝗟𝗔𝗚𝗘'.normalize('NFC'));
  assert.equal(serveur.f("Villa L'Oasis d'Assinie"), "𝗩𝗜𝗟𝗟𝗔 𝗟'𝗢𝗔𝗦𝗜𝗦 𝗗'𝗔𝗦𝗦𝗜𝗡𝗜𝗘");
  for (const cas of ['Villa Oasis 2', 'Évasion à la plage', 'TER-ASS-002 — Parcelle Km 12', 'Balade privée en bateau', '']) {
    assert.equal(studio.f(cas), serveur.f(cas), cas);
  }
});
