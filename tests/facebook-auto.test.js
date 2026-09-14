// Publication automatique vers la Page Facebook.
// Tests isolés : aucun accès réseau, aucune écriture dans data/ ni dans MySQL.
// Le code est extrait de server.js et exécuté dans un contexte vm, comme dans
// corrections.test.js : on vérifie le comportement réellement déployé, pas une
// copie qui pourrait diverger.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

/**
 * Monte le relais automatique dans un bac à sable.
 * @param {object} options état initial du registre et comportement de Graph.
 */
function relais(options = {}) {
  const debut = server.indexOf('const AUTO_MAX_PAR_PUBLICATION');
  const fin = server.indexOf('\nasync function handleApi');
  assert.ok(debut > 0 && fin > debut, 'bloc de publication automatique introuvable dans server.js');

  const journal = { publies: [], ecrits: [], audits: [], synchros: [] };
  let etat = options.etat || {};

  const contexte = vm.createContext({
    FB_AUTO_FILE: 'auto',
    PUBLIC_SITE_URL: 'https://exemple.test',
    readJSON: () => structuredClone(etat),
    writeJSON: (fichier, valeur) => { etat = structuredClone(valeur); journal.ecrits.push(valeur); },
    audit: (evenement, details) => journal.audits.push({ evenement, details }),
    text: (valeur, max) => String(valeur == null ? '' : valeur).slice(0, max),
    slug: valeur => String(valeur || ''),
    facebookConfig: () => ({ connected: options.connecte !== false }),
    facebookImportedIds: () => new Set(options.importes || []),
    // Fiches déjà publiées depuis le site : Map facebookId -> { kind, id }.
    originesPublications: () => new Map(options.origines || []),
    buildShareMessage: item => `message:${item.id}`,
    syncFacebookPosts: () => { journal.synchros.push(true); return Promise.resolve(); },
    publishFacebookPost: async charge => {
      journal.publies.push(charge);
      if (options.echouer && options.echouer(charge)) throw new Error('image injoignable');
      return { id: `fb_${journal.publies.length}` };
    }
  });

  const debutVisuels = server.indexOf('function visuelsFiche(');
  const visuels = server.slice(debutVisuels, server.indexOf('\n}\n', debutVisuels) + 2);
  vm.runInContext(visuels + server.slice(debut, fin) + '\nthis.lancer = autoShareContentToFacebook;', contexte);
  return { lancer: contexte.lancer, journal, etatFinal: () => etat };
}

const CONTENU = (villas, reglages = {}) => ({
  settings: { facebookAutoPublish: true, ...reglages },
  villas, terrains: [], activities: []
});

test('réglage désactivé : aucune publication, aucun registre touché', async () => {
  const r = relais();
  const resultat = await r.lancer({ settings: { facebookAutoPublish: false }, villas: [{ id: 'a' }] });
  // Objet né dans le contexte vm : son prototype diffère de celui de l'hôte,
  // deepEqual échouerait sur cette seule identité. On teste la valeur.
  assert.equal(resultat.enabled, false);
  assert.equal(resultat.published, undefined);
  assert.equal(r.journal.publies.length, 0);
  assert.equal(r.journal.ecrits.length, 0);
});

test('connexion Meta absente : signalé sans lever ni publier', async () => {
  const r = relais({ connecte: false });
  const resultat = await r.lancer(CONTENU([{ id: 'a' }]));
  assert.equal(resultat.published, 0);
  assert.match(resultat.errors[0], /Connexion Meta non configurée/);
  assert.equal(r.journal.publies.length, 0);
});

test('amorçage : le catalogue existant est mémorisé SANS être republié', async () => {
  const r = relais();
  const resultat = await r.lancer(CONTENU([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
  assert.equal(resultat.amorce, 3);
  assert.equal(resultat.published, 0);
  assert.equal(r.journal.publies.length, 0, 'activer l’option ne doit jamais déclencher une rafale');
  assert.deepEqual(r.etatFinal().cles, ['villa:a', 'villa:b', 'villa:c']);
});

test('après amorçage : seule la fiche nouvelle part sur la Page', async () => {
  const r = relais({ etat: { amorce: true, cles: ['villa:a'], echecs: {} } });
  const resultat = await r.lancer(CONTENU([{ id: 'a' }, { id: 'b' }]));
  assert.equal(resultat.published, 1);
  assert.equal(r.journal.publies.length, 1);
  assert.equal(r.journal.publies[0].message, 'message:b');
  assert.deepEqual(r.etatFinal().cles, ['villa:a', 'villa:b']);
});

test('clé d’idempotence liée à l’identité de la fiche, pas à son texte', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  await r.lancer(CONTENU([{ id: 'ma-villa' }]));
  assert.equal(r.journal.publies[0].idempotencyKey, 'auto:villa:ma-villa',
    'corriger une description ne doit pas republier la fiche');
});

test('plafond de cinq envois par publication, le reste attend', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  const fiches = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}` }));
  const resultat = await r.lancer(CONTENU(fiches));
  assert.equal(resultat.published, 5);
  assert.equal(resultat.pending, 3);
  assert.equal(r.journal.publies.length, 5);

  // La publication suivante écoule le reliquat.
  const suite = await r.lancer(CONTENU(fiches));
  assert.equal(suite.published, 3);
  assert.equal(suite.pending, 0);
});

test('garde anti-boucle : une fiche importée de Facebook n’y retourne pas', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} }, importes: ['999'] });
  const resultat = await r.lancer(CONTENU([
    { id: 'native' },
    { id: 'venue-de-fb', source: 'facebook' },
    { id: 'liee-a-fb', facebookOriginId: '999' }
  ]));
  assert.equal(resultat.published, 1);
  assert.deepEqual(r.journal.publies.map(p => p.message), ['message:native']);
});

test('fiche masquée ignorée, puis publiée le jour où elle devient visible', async () => {
  const cachee = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  const premier = await cachee.lancer(CONTENU([{ id: 'brouillon', visible: false }]));
  assert.equal(premier.published, 0);

  const second = await cachee.lancer(CONTENU([{ id: 'brouillon', visible: true }]));
  assert.equal(second.published, 1);
});

test('échec Graph : la fiche est réessayée puis abandonnée au bout de trois fois', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} }, echouer: () => true });
  const contenu = CONTENU([{ id: 'cassee' }]);

  for (let essai = 1; essai <= 3; essai += 1) {
    const resultat = await r.lancer(contenu);
    assert.equal(resultat.published, 0);
    assert.equal(resultat.errors.length, 1, `tentative ${essai}`);
    assert.equal(r.etatFinal().echecs['villa:cassee'], essai);
  }
  assert.match(r.journal.publies.at(-1).idempotencyKey, /^auto:villa:cassee$/);

  // Quatrième passage : plus aucune tentative, la fiche est écartée.
  const apres = await r.lancer(contenu);
  assert.equal(apres.published, 0);
  assert.equal(apres.errors.length, 0);
  assert.equal(r.journal.publies.length, 3, 'aucune tentative supplémentaire après trois échecs');
});

test('un succès efface le compteur d’échecs de la fiche', async () => {
  let doitEchouer = true;
  const r = relais({
    etat: { amorce: true, cles: [], echecs: {} },
    echouer: () => doitEchouer
  });
  const contenu = CONTENU([{ id: 'intermittente' }]);
  await r.lancer(contenu);
  assert.equal(r.etatFinal().echecs['villa:intermittente'], 1);

  doitEchouer = false;
  const resultat = await r.lancer(contenu);
  assert.equal(resultat.published, 1);
  assert.equal(r.etatFinal().echecs['villa:intermittente'], undefined);
});

test('la galerie complète part en album, pas seulement la première photo', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  await r.lancer(CONTENU([{ id: 'v', images: ['a.jpg', 'b.jpg', 'c.jpg'] }]));
  assert.deepEqual(r.journal.publies[0].imageUrls, ['a.jpg', 'b.jpg', 'c.jpg']);
});

test('fiche déjà publiée depuis le site (partage manuel) : pas de second envoi', async () => {
  const r = relais({
    etat: { amorce: true, cles: ['villa:a'], echecs: {} },
    origines: [['P_1', { kind: 'villa', id: 'neuve' }]]
  });
  const resultat = await r.lancer(CONTENU([{ id: 'a' }, { id: 'neuve' }]));
  assert.equal(resultat.published, 0);
  assert.equal(r.journal.publies.length, 0, 'la fiche partagée manuellement ne doit pas repartir');
  assert.deepEqual(r.etatFinal().cles, ['villa:a', 'villa:neuve'], 'la fiche est mémorisée pour les fois suivantes');
});

test('les trois rubriques sont couvertes et le lien pointe la bonne page', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  await r.lancer({
    settings: { facebookAutoPublish: true },
    villas: [{ id: 'v' }], terrains: [{ id: 't' }], activities: [{ id: 'a' }]
  });
  assert.deepEqual(r.journal.publies.map(p => p.link), [
    'https://exemple.test/residences.html',
    'https://exemple.test/terrains.html',
    'https://exemple.test/loisirs.html'
  ]);
});

test('une publication réussie relance la synchronisation entrante', async () => {
  const r = relais({ etat: { amorce: true, cles: [], echecs: {} } });
  await r.lancer(CONTENU([{ id: 'v' }]));
  assert.equal(r.journal.synchros.length, 1, 'le site doit refléter ce qu’il vient de publier');
});
