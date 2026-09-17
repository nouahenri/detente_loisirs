// Annonces du site ⇄ publications Facebook (décisions du 17/09/2026).
//
// Remplace les tests du partage « à la prochaine publication » et du relais
// automatique, retirés le même jour : une annonce part sur la Page si et
// seulement si sa case est cochée, et la décocher (ou suspendre, archiver,
// supprimer l'annonce) supprime la publication.
//
// Code réel de server.js et de db/synchro-facebook.js, Graph simulé ; aucun
// accès réseau ni écriture disque.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SYNC = require('../db/synchro-facebook');
// Valeurs nées dans le contexte vm : ramenées dans ce contexte-ci pour deepEqual.
const hote = valeur => JSON.parse(JSON.stringify(valeur));
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function bloc(debut, fin) {
  const i = server.indexOf(debut);
  const j = server.indexOf(fin, i);
  assert.ok(i > 0 && j > i, `bloc introuvable : ${debut}`);
  return server.slice(i, j);
}

/**
 * Monte le code réel avec un journal, un miroir et une Page simulés.
 * `page` : facebookId → { message } des publications présentes sur Facebook.
 */
function monter({ publish = [], posts = [], etat = {}, references = {}, connecte = true, echec = null } = {}) {
  const fichiers = { publish: structuredClone(publish), posts: structuredClone(posts), etat: structuredClone(etat), synchro: { references: structuredClone(references) } };
  const envois = [];
  const graph = [];
  const audits = [];
  const contexte = vm.createContext({
    crypto, SYNC, URLSearchParams,
    FB_PUBLISH_FILE: 'publish', FB_POSTS_FILE: 'posts', FB_STATE_FILE: 'etat', FB_SYNCHRO_FILE: 'synchro',
    PUBLIC_SITE_URL: 'https://exemple.test',
    readJSON: (fichier, defaut) => structuredClone(fichiers[fichier] ?? defaut),
    writeJSON: (fichier, valeur) => { fichiers[fichier] = structuredClone(valeur); },
    audit: (evenement, details) => audits.push({ evenement, details }),
    text: (valeur, max) => String(valeur == null ? '' : valeur).slice(0, max),
    tryDb: async () => null,
    facebookConfig: () => ({ connected: connecte }),
    facebookImportedIds: () => new Set(),
    syncFacebookPosts: () => Promise.resolve(),
    graphRequest: async (endpoint, options = {}) => {
      graph.push({ endpoint, methode: options.method || 'GET', corps: options.body ? String(options.body) : '' });
      if (echec && echec(endpoint, options)) throw new Error('refus Graph simulé');
      return { success: true };
    },
    // Imite publishFacebookPost : envoi, journal avec l'origine, photos téléversées.
    publishFacebookPost: async charge => {
      envois.push(charge);
      const facebookId = `P_${envois.length}`;
      fichiers.publish.unshift({ idempotencyKey: charge.idempotencyKey, facebookId, status: 'publie', createdAt: new Date().toISOString(), origine: charge.origine });
      return { id: facebookId, post_id: facebookId, photos: charge.imageUrls.map((local, index) => ({ fbId: `${facebookId}_photo${index}`, local })) };
    }
  });
  vm.runInContext([
    bloc('function originesPublications()', '/** Affiche ou retire'),
    bloc('function titreFacebook(', '\n/**\n * Photo ajoutée sur Facebook'),
    'this.synchroniser = synchroniserAnnoncesVersFacebook; this.publiees = fichesPubliees; this.plan = planFacebook; this.resume = resumePlanFacebook;'
  ].join('\n'), contexte);
  return { contexte, envois, graph, audits, fichiers };
}

const villa = (id, extra = {}) => ({ id, name: `Villa ${id}`, description: `Description ${id}`, images: [`assets/${id}-1.webp`, `assets/${id}-2.webp`], ...extra });
const contenu = villas => ({ settings: {}, villas, terrains: [], activities: [] });

test('case non cochée : rien ne part sur la Page, même pour une annonce neuve', async () => {
  const m = monter();
  const bilan = hote(await m.contexte.synchroniser(contenu([villa('neuve'), villa('autre', { facebook: false })]), contenu([])));
  assert.equal(m.envois.length, 0);
  assert.deepEqual(bilan.publiees, []);
});

test('case cochée : l’annonce part une fois, en album complet, avec son origine et sa référence', async () => {
  const m = monter();
  const annonce = villa('neuve', { facebook: true });
  const bilan = hote(await m.contexte.synchroniser(contenu([annonce]), contenu([])));
  assert.deepEqual(bilan.publiees, ['Villa neuve']);
  assert.equal(m.envois.length, 1);
  assert.deepEqual(hote(m.envois[0].imageUrls), annonce.images);
  assert.deepEqual(hote(m.envois[0].origine), { kind: 'villa', id: 'neuve' });
  assert.equal(m.envois[0].link, 'https://exemple.test/residences.html');
  const reference = m.fichiers.synchro.references.P_1;
  assert.equal(reference.message, '𝗩𝗜𝗟𝗟𝗔 𝗡𝗘𝗨𝗩𝗘\n\nDescription neuve');
  assert.deepEqual(hote(reference.photos.map(p => p.local)), annonce.images);

  // Publication suivante, rien de changé : pas de second envoi.
  m.fichiers.etat = { lastSyncAt: new Date(Date.now() + 60_000).toISOString() };
  m.fichiers.posts = [{ id: 'P_1', created_time: new Date().toISOString() }];
  const ensuite = hote(await m.contexte.synchroniser(contenu([annonce]), contenu([annonce])));
  assert.equal(m.envois.length, 1);
  assert.deepEqual([...ensuite.publiees, ...ensuite.textes, ...ensuite.republiees], []);
});

// Situation type : la villa Akwaba est sur la Page, avec sa référence.
const EN_LIGNE = () => ({
  publish: [{ idempotencyKey: 'k', facebookId: 'P_akwaba', status: 'publie', createdAt: '2026-09-13T18:48:48.000Z', origine: { kind: 'villa', id: 'akwaba' } }],
  posts: [{ id: 'P_akwaba', created_time: '2026-09-13T18:48:45+0000' }, { id: 'P_page', created_time: '2026-09-07T13:34:07+0000' }],
  etat: { lastSyncAt: '2026-09-17T06:00:00.000Z' },
  references: { P_akwaba: { kind: 'villa', id: 'akwaba', message: '𝗩𝗜𝗟𝗟𝗔 𝗔𝗞𝗪𝗔𝗕𝗔\n\nDescription akwaba', photos: [{ fbId: 'f1', local: 'assets/akwaba-1.webp' }, { fbId: 'f2', local: 'assets/akwaba-2.webp' }] } }
});

test('case décochée sur une annonce publiée : la publication est supprimée de la Page et du journal', async () => {
  const m = monter(EN_LIGNE());
  const annonce = villa('akwaba', { facebook: false });
  const bilan = hote(await m.contexte.synchroniser(contenu([annonce]), contenu([villa('akwaba', { facebook: true })])));
  assert.deepEqual(bilan.retirees, ['Villa akwaba']);
  assert.deepEqual(m.graph.map(appel => [appel.methode, appel.endpoint]), [['DELETE', 'P_akwaba']]);
  assert.equal(m.fichiers.publish[0].status, 'retire');
  assert.equal(m.fichiers.synchro.references.P_akwaba, undefined);
  assert.equal(m.contexte.publiees().has('villa:akwaba'), false, 'l’annonce peut de nouveau être publiée');
  assert.ok(m.audits.some(a => a.evenement === 'facebook.publication_retiree' && a.details.raison === 'case-decochee'));

  // Recochée : elle repart comme une nouvelle publication (clé différente de la première).
  await m.contexte.synchroniser(contenu([villa('akwaba', { facebook: true })]), contenu([annonce]));
  assert.equal(m.envois.length, 1);
});

test('annonce suspendue, archivée ou supprimée : Facebook suit, la publication est supprimée', async () => {
  for (const [nouveau, raison] of [[[villa('akwaba', { etat: 'suspendue' })], 'suspendue'], [[villa('akwaba', { etat: 'archivee', facebook: true })], 'archivee'], [[], 'supprimee']]) {
    const m = monter(EN_LIGNE());
    const bilan = hote(await m.contexte.synchroniser(contenu(nouveau), contenu([villa('akwaba')])));
    assert.deepEqual(bilan.retirees, ['Villa akwaba'], raison);
    assert.equal(m.graph[0].methode, 'DELETE');
    assert.ok(m.audits.some(a => a.details?.raison === raison), raison);
  }
});

test('annonce disparue AVANT cette publication : sa publication reste en ligne', async () => {
  const m = monter(EN_LIGNE());
  const bilan = hote(await m.contexte.synchroniser(contenu([villa('autre')]), contenu([villa('autre')])));
  assert.deepEqual(bilan.retirees, []);
  assert.equal(m.graph.length, 0);
});

test('texte modifié sur le site : le texte de la publication est mis à jour, sans republier', async () => {
  const m = monter(EN_LIGNE());
  m.fichiers.posts[0].message = 'ancien texte';
  const annonce = villa('akwaba', { description: 'Nouvelle description' });
  const bilan = hote(await m.contexte.synchroniser(contenu([annonce]), contenu([villa('akwaba')])));
  assert.deepEqual(bilan.textes, ['Villa akwaba']);
  assert.equal(m.envois.length, 0);
  const appel = m.graph[0];
  assert.deepEqual([appel.methode, appel.endpoint], ['POST', 'P_akwaba']);
  assert.equal(new URLSearchParams(appel.corps).get('message'), '𝗩𝗜𝗟𝗟𝗔 𝗔𝗞𝗪𝗔𝗕𝗔\n\nNouvelle description\n\nhttps://exemple.test/residences.html');
  assert.equal(m.fichiers.synchro.references.P_akwaba.message, '𝗩𝗜𝗟𝗟𝗔 𝗔𝗞𝗪𝗔𝗕𝗔\n\nNouvelle description');
  assert.match(m.fichiers.posts[0].message, /Nouvelle description/, 'le studio voit le nouveau texte tout de suite');
});

test('photos modifiées sur le site : la publication est remplacée (Graph ne change pas les photos)', async () => {
  const m = monter(EN_LIGNE());
  const annonce = villa('akwaba', { images: ['assets/akwaba-1.webp', 'assets/akwaba-3.webp'] });
  const bilan = hote(await m.contexte.synchroniser(contenu([annonce]), contenu([villa('akwaba')])));
  assert.deepEqual(bilan.republiees, ['Villa akwaba']);
  assert.equal(m.graph[0].methode, 'DELETE');
  assert.deepEqual(hote(m.envois[0].imageUrls), annonce.images);
  assert.ok(m.fichiers.synchro.references.P_1, 'nouvelle référence pour la nouvelle publication');
});

test('plafond : cinq envois lourds par publication, le reste attend ; retraits jamais plafonnés', async () => {
  const m = monter();
  const neuves = Array.from({ length: 7 }, (_, i) => villa(`v${i}`, { facebook: true }));
  const bilan = hote(await m.contexte.synchroniser(contenu(neuves), contenu([])));
  assert.equal(bilan.publiees.length, 5);
  assert.deepEqual(bilan.enAttente, ['Villa v5', 'Villa v6']);
});

test('refus de Graph : signalé dans le bilan, sans lever ; connexion absente : rien n’est tenté', async () => {
  const m = monter({ ...EN_LIGNE(), echec: () => true });
  const bilan = hote(await m.contexte.synchroniser(contenu([villa('akwaba', { facebook: false })]), contenu([villa('akwaba')])));
  assert.match(bilan.erreurs[0], /Villa akwaba : refus Graph simulé/);
  assert.equal(m.fichiers.publish[0].status, 'publie', 'toujours en ligne : rien n’est marqué retiré');

  const hors = monter({ connecte: false });
  const sansMeta = hote(await hors.contexte.synchroniser(contenu([villa('neuve', { facebook: true })]), contenu([])));
  assert.equal(hors.envois.length, 0);
  assert.match(sansMeta.erreurs[0], /Connexion Meta non configurée/);
});

test('résumé pour la confirmation du studio', () => {
  const m = monter(EN_LIGNE());
  const plan = m.contexte.plan(contenu([villa('akwaba', { facebook: false }), villa('neuve', { facebook: true })]), contenu([villa('akwaba')]));
  assert.deepEqual(JSON.parse(JSON.stringify(m.contexte.resume(plan))), {
    publier: ['Villa neuve'], photos: [], texte: [], retirer: [{ nom: 'Villa akwaba', raison: 'case-decochee' }]
  });
});

test('texte publié : villas et activités sans prix (titre + description), terrains complets avec prix', async () => {
  const m = monter();
  const c = {
    villas: [{ id: 'v', name: 'Villa Oasis', tagline: 'Accroche', description: 'Belle villa sur la lagune.', pricePerNight: 250000, images: ['assets/a.webp'], facebook: true }],
    terrains: [{ id: 't', reference: 'T-12', title: 'Parcelle Km 12', location: 'Assinie, Km 12', areaSqm: 500, priceTotal: 15000000, pricePerSqm: 30000, landStatusLabel: 'ACD', description: 'Terrain viabilisé.', images: ['assets/t.webp'], facebook: true }],
    activities: [{ id: 'a', title: 'Jet-ski', subtitle: 'Sensations', description: 'Tour de la lagune.', price: '45 000 FCFA / 30 min', images: ['assets/j.webp'], facebook: true }]
  };
  await m.contexte.synchroniser(c, { villas: [], terrains: [], activities: [] });
  const [villaTexte, terrain, activite] = m.envois.map(e => e.message);
  assert.equal(villaTexte, '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nBelle villa sur la lagune.');
  assert.equal(activite, '𝗝𝗘𝗧-𝗦𝗞𝗜\n\nTour de la lagune.');
  assert.doesNotMatch(villaTexte + activite, /FCFA|Tarif|partir de/);
  for (const attendu of ['𝗧-𝟭𝟮 — 𝗣𝗔𝗥𝗖𝗘𝗟𝗟𝗘 𝗞𝗠 𝟭𝟮', 'Assinie, Km 12', '500 m²', 'FCFA', 'Statut foncier : ACD', 'Terrain viabilisé.']) {
    assert.ok(terrain.includes(attendu), `terrain sans « ${attendu} »`);
  }
});

// Verrou « déjà publiée » (13/09/2026), toujours la base de « en ligne sur la Page ».
const SYNCHRO = '2026-09-13T18:50:00.000Z';
const JOURNAL = [
  { idempotencyKey: 'k-akwaba', facebookId: 'P_akwaba', status: 'publie', createdAt: '2026-09-13T18:48:48.000Z', origine: { kind: 'villa', id: 'villa-akwaba' } },
  { idempotencyKey: 'k-oasis', facebookId: 'P_oasis', status: 'publie', createdAt: '2026-09-13T18:40:24.000Z', origine: { kind: 'villa', id: 'villa-oasis' } },
  { idempotencyKey: 'auto:terrain:ancien', facebookId: 'P_ancien', status: 'publie', createdAt: '2026-01-02T10:00:00.000Z' },
  { idempotencyKey: 'k-echec', facebookId: '', status: 'echec', createdAt: '2026-09-13T18:30:31.000Z', origine: { kind: 'activity', id: 'jet-ski' } },
  { idempotencyKey: 'k-retire', facebookId: 'P_retire', status: 'retire', createdAt: '2026-09-13T18:49:00.000Z', origine: { kind: 'villa', id: 'villa-retiree' } }
];
const MIROIR = [
  { id: 'P_akwaba', created_time: '2026-09-13T18:48:45+0000', permalink_url: 'https://facebook.test/akwaba' },
  { id: 'P_retire', created_time: '2026-09-13T18:48:59+0000' },
  { id: 'P_page', created_time: '2026-09-07T13:34:07+0000' },
  { id: 'P_vieux', created_time: '2026-08-28T18:57:11+0000' }
];

test('en ligne : présente sur la Page ; supprimée à la main = libérée ; retirée par le site = libérée ; échec ignoré', () => {
  const m = monter({ publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: SYNCHRO } });
  const publiees = Object.fromEntries(m.contexte.publiees());
  assert.deepEqual(Object.keys(publiees).sort(), ['terrain:ancien', 'villa:villa-akwaba']);
  assert.equal(publiees['villa:villa-akwaba'].lien, 'https://facebook.test/akwaba');
});

test('en ligne : publication pas encore synchronisée = considérée en ligne (pas de republication dans la foulée)', () => {
  const m = monter({ publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: '2026-09-13T18:40:00.000Z' } });
  assert.ok(m.contexte.publiees().has('villa:villa-oasis'));
  const apres = monter({ publish: JOURNAL, posts: MIROIR, etat: { lastSyncAt: '2026-09-13T18:45:00.000Z' } });
  assert.equal(apres.contexte.publiees().has('villa:villa-oasis'), false);
});

test('POST /api/admin/content : plus de partage à usage unique ni de relais automatique', () => {
  assert.doesNotMatch(server, /shareContentToFacebook|autoShareContentToFacebook|facebookAutoPublish ===/);
  const route = server.slice(server.indexOf("url.pathname === '/api/admin/content')"));
  const ecriture = route.indexOf('store.writeContent(');
  const synchro = route.indexOf('synchroniserAnnoncesVersFacebook(result.content, precedent)');
  assert.ok(ecriture > 0 && synchro > ecriture, 'Facebook seulement après l’enregistrement du site');
  assert.ok(route.indexOf("code: 'contenu-modifie'") < ecriture, 'verrou du studio périmé avant l’écriture');
});
