// Doublon constaté en production le 13/09/2026 (journal d'audit) : une villa
// neuve cochée « Publier aussi sur Facebook », relais automatique actif.
//   16:43:59  facebook.published  images: 1   (partage manuel)
//   16:44:14  facebook.published  images: 3   (relais automatique)
// Deux publications sur la Page, dont une avec la seule première photo.
//
// On rejoue ici l'enregistrement tel que le fait POST /api/admin/content :
// partage manuel PUIS relais automatique, avec le code réel de server.js et un
// journal de publication partagé. Aucun accès réseau ni écriture disque.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function bloc(debut, fin) {
  const i = server.indexOf(debut);
  const j = server.indexOf(fin, i);
  assert.ok(i > 0 && j > i, `bloc introuvable : ${debut}`);
  return server.slice(i, j);
}

function enregistrement({ etatAuto, publish = [], posts = [], etat = {} }) {
  const fichiers = { publish: structuredClone(publish), auto: structuredClone(etatAuto), posts: structuredClone(posts), etat: structuredClone(etat) };
  const envois = [];
  const contexte = vm.createContext({
    crypto,
    FB_PUBLISH_FILE: 'publish',
    FB_AUTO_FILE: 'auto',
    FB_POSTS_FILE: 'posts',
    FB_STATE_FILE: 'etat',
    PUBLIC_SITE_URL: 'https://exemple.test',
    readJSON: (fichier, defaut) => structuredClone(fichiers[fichier] ?? defaut),
    writeJSON: (fichier, valeur) => { fichiers[fichier] = structuredClone(valeur); },
    audit: () => {},
    text: (valeur, max) => String(valeur == null ? '' : valeur).slice(0, max),
    slug: valeur => String(valeur || ''),
    facebookConfig: () => ({ connected: true }),
    facebookImportedIds: () => new Set(),
    syncFacebookPosts: () => Promise.resolve(),
    // Imite publishFacebookPost : envoi puis inscription au journal avec l'origine.
    publishFacebookPost: async charge => {
      const imageUrls = charge.imageUrls || [charge.imageUrl].filter(Boolean);
      envois.push({ ...charge, imageUrls });
      const facebookId = `P_${envois.length}`;
      fichiers.publish.unshift({ idempotencyKey: charge.idempotencyKey, facebookId, status: 'publie', origine: charge.origine });
      return { id: facebookId, post_id: facebookId };
    }
  });
  vm.runInContext([
    bloc('function originesPublications()', '/** Affiche ou retire'),
    bloc('function titreFacebook(', '\nasync function handleApi'),
    'this.partage = shareContentToFacebook; this.auto = autoShareContentToFacebook; this.publiees = fichesPubliees;'
  ].join('\n'), contexte);
  return { contexte, envois, fichiers };
}

test('villa neuve cochée « Publier aussi sur Facebook » avec relais actif : UNE publication, galerie complète', async () => {
  const r = enregistrement({ etatAuto: { amorce: true, cles: ['villa:ancienne'], echecs: {} } });
  const contenu = {
    settings: { facebookAutoPublish: true },
    villas: [
      { id: 'ancienne', name: 'Ancienne', images: ['assets/x.jpg'] },
      { id: 'neuve', name: 'Villa neuve', images: ['assets/a.webp', 'assets/b.webp', 'assets/c.jpg'] }
    ],
    terrains: [], activities: []
  };
  const payload = { facebookShare: { enabled: true, items: [{ kind: 'villa', id: 'neuve' }] } };

  const partage = await r.contexte.partage(payload, contenu);
  const auto = await r.contexte.auto(contenu);

  assert.equal(partage.published, 1);
  assert.equal(auto.published, 0, 'le relais ne doit pas republier la fiche déjà partagée');
  assert.equal(r.envois.length, 1, 'une seule publication sur la Page');
  assert.deepEqual(r.envois[0].imageUrls, ['assets/a.webp', 'assets/b.webp', 'assets/c.jpg']);

  // Publication suivante : toujours rien de plus.
  await r.contexte.auto(contenu);
  assert.equal(r.envois.length, 1);
});

test('texte publié : villas et activités sans prix (titre + description), terrains complets avec prix', async () => {
  const r = enregistrement({ etatAuto: { amorce: true, cles: [], echecs: {} } });
  const contenu = {
    settings: { facebookAutoPublish: true },
    villas: [{ id: 'v', name: 'Villa Oasis', tagline: 'Accroche', description: 'Belle villa sur la lagune.', pricePerNight: 250000, images: ['assets/a.webp'] }],
    terrains: [{ id: 't', reference: 'T-12', title: 'Parcelle Km 12', location: 'Assinie, Km 12', areaSqm: 500, priceTotal: 15000000, pricePerSqm: 30000, landStatusLabel: 'ACD', description: 'Terrain viabilisé.', images: ['assets/t.webp'] }],
    activities: [{ id: 'a', title: 'Jet-ski', subtitle: 'Sensations', description: 'Tour de la lagune.', price: '45 000 FCFA / 30 min', images: ['assets/j.webp'] }]
  };
  await r.contexte.auto(contenu);
  const [villa, terrain, activite] = r.envois.map(e => e.message);
  assert.equal(villa, '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nBelle villa sur la lagune.');
  assert.equal(activite, '𝗝𝗘𝗧-𝗦𝗞𝗜\n\nTour de la lagune.');
  assert.doesNotMatch(villa + activite, /FCFA|Tarif|partir de/);
  for (const attendu of ['𝗧-𝟭𝟮 — 𝗣𝗔𝗥𝗖𝗘𝗟𝗟𝗘 𝗞𝗠 𝟭𝟮', 'Assinie, Km 12', '500 m²', 'FCFA', 'Statut foncier : ACD', 'Terrain viabilisé.']) {
    assert.ok(terrain.includes(attendu), `terrain sans « ${attendu} »`);
  }
});

// Verrou « déjà publiée » (demande du 13/09/2026). Situation type : la villa
// Akwaba est sur la Page ; la villa Oasis y a été publiée puis supprimée.
const SYNCHRO = '2026-09-13T18:50:00.000Z';
const JOURNAL = [
  { idempotencyKey: 'k-akwaba', facebookId: 'P_akwaba', status: 'publie', createdAt: '2026-09-13T18:48:48.000Z', origine: { kind: 'villa', id: 'villa-akwaba' } },
  { idempotencyKey: 'k-oasis', facebookId: 'P_oasis', status: 'publie', createdAt: '2026-09-13T18:40:24.000Z', origine: { kind: 'villa', id: 'villa-oasis' } },
  { idempotencyKey: 'auto:terrain:ancien', facebookId: 'P_ancien', status: 'publie', createdAt: '2026-01-02T10:00:00.000Z' },
  { idempotencyKey: 'k-echec', facebookId: '', status: 'echec', createdAt: '2026-09-13T18:30:31.000Z', origine: { kind: 'activity', id: 'jet-ski' } }
];
const MIROIR = [
  { id: 'P_akwaba', created_time: '2026-09-13T18:48:45+0000', permalink_url: 'https://facebook.test/akwaba' },
  { id: 'P_page', created_time: '2026-09-07T13:34:07+0000' },
  { id: 'P_vieux', created_time: '2026-08-28T18:57:11+0000' }
];

test('déjà publiée : présente sur la Page = verrouillée ; supprimée = libérée ; hors fenêtre = verrouillée par prudence', () => {
  const r = enregistrement({ etatAuto: {}, publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: SYNCHRO } });
  const publiees = Object.fromEntries(r.contexte.publiees());
  assert.deepEqual(Object.keys(publiees).sort(), ['terrain:ancien', 'villa:villa-akwaba']);
  assert.equal(publiees['villa:villa-akwaba'].lien, 'https://facebook.test/akwaba');
  assert.equal(publiees['villa:villa-oasis'], undefined, 'supprimée sur Facebook : de nouveau publiable');
  assert.equal(publiees['activity:jet-ski'], undefined, 'un échec ne verrouille pas');
});

test('déjà publiée : publication pas encore synchronisée = verrouillée (pas de republication dans la foulée)', () => {
  // Dernière synchronisation AVANT les deux envois : aucun n'a encore pu être vérifié.
  const r = enregistrement({ etatAuto: {}, publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: '2026-09-13T18:40:00.000Z' } });
  assert.ok(r.contexte.publiees().has('villa:villa-akwaba'));
  assert.ok(r.contexte.publiees().has('villa:villa-oasis'), 'publiée après la dernière synchro : pas encore vérifiée');
  // Synchro de 18:45 sans la villa Oasis (publiée 18:40) : supprimée entre-temps.
  const apres = enregistrement({ etatAuto: {}, publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: '2026-09-13T18:45:00.000Z' } });
  assert.equal(apres.contexte.publiees().has('villa:villa-oasis'), false);
});

test('partage manuel : une annonce déjà sur la Page n’est pas renvoyée, une annonce supprimée repart', async () => {
  const r = enregistrement({ etatAuto: { amorce: true, cles: [], echecs: {} }, publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: SYNCHRO } });
  const contenu = {
    settings: {},
    villas: [
      { id: 'villa-akwaba', name: 'Villa Akwaba', description: 'd', images: ['a.jpg'] },
      { id: 'villa-oasis', name: 'Villa Oasis', description: 'd', images: ['o.jpg'] }
    ],
    terrains: [], activities: []
  };
  const resultat = await r.contexte.partage({ facebookShare: { enabled: true, items: [{ kind: 'villa', id: 'villa-akwaba' }, { kind: 'villa', id: 'villa-oasis' }] } }, contenu);
  assert.deepEqual([...resultat.dejaPubliees], ['villa-akwaba']);
  assert.equal(resultat.published, 1);
  assert.deepEqual(r.envois.map(e => e.origine.id), ['villa-oasis']);
});

test('relais actif sans case cochée : la fiche neuve part une fois, en album', async () => {
  const r = enregistrement({ etatAuto: { amorce: true, cles: [], echecs: {} } });
  const contenu = {
    settings: { facebookAutoPublish: true },
    villas: [{ id: 'neuve', name: 'Villa neuve', images: ['assets/a.webp', 'assets/b.webp'] }],
    terrains: [], activities: []
  };
  const partage = await r.contexte.partage({}, contenu);
  const auto = await r.contexte.auto(contenu);
  assert.equal(partage.requested, false);
  assert.equal(auto.published, 1);
  assert.equal(r.envois.length, 1);
  assert.deepEqual(r.envois[0].imageUrls, ['assets/a.webp', 'assets/b.webp']);
});
