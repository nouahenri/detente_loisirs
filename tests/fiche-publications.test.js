// Fiche du bien sur les publications Facebook, et recherche multicritère.
//
// Demande du 13/09/2026 : les publications reçoivent les colonnes
// descriptives de la table `villas` pour être retenues par la recherche, et
// la recherche de l'accueil devient réellement fonctionnelle. Tests isolés —
// aucun appel réseau ni base réelle.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');
const server = lire('server.js');
const repository = lire('db/repository.js');
const app = lire('js/app.js');
const REF = require('../db/referentiels');
const FICHES = require('../db/fiches');

// Un objet né dans un contexte vm a d'autres prototypes : on le ramène dans
// le realm de l'hôte avant toute comparaison profonde.
const hote = valeur => JSON.parse(JSON.stringify(valeur));

const COLONNES = ['name', 'tagline', 'category', 'category_label', 'environment', 'location',
  'price_per_night', 'price_euro', 'weekend_package', 'capacity', 'bedrooms', 'bathrooms',
  'beds', 'status', 'badge', 'featured', 'features', 'highlights'];

// --------------------------------------------------------------------------
// Validation serveur
// --------------------------------------------------------------------------
function serveurFiche(fichierFiches = {}) {
  const debut = server.indexOf('const CADRES_FICHE');
  const fin = server.indexOf('\n}\n', server.indexOf('function publicationsSansFiche(')) + 3;
  assert.ok(debut > 0 && fin > debut, 'fonctions de fiche introuvables dans server.js');
  const contexte = vm.createContext({
    REF,
    FICHES,
    FB_FICHES_FILE: 'fiches.json',
    readJSON: () => structuredClone(fichierFiches),
    text: (v, max = 500) => String(v ?? '').trim().slice(0, max)
  });
  vm.runInContext(`${server.slice(debut, fin)}
    this.normaliser = normaliserFichePublication;
    this.fichesFichier = fichesPublicationsFichier;
    this.sansFiche = publicationsSansFiche;`, contexte);
  return contexte;
}

test('fiche vide : tout est « non renseigné », aucune valeur inventée', () => {
  const { fiche, erreurs } = hote(serveurFiche().normaliser({}));
  assert.deepEqual(erreurs, []);
  assert.deepEqual(fiche, {
    name: '', tagline: '', category: '', categoryLabel: '', environment: '', location: '',
    localisationId: '', localisationPrecision: '',
    pricePerNight: null, priceEuro: null, weekendPackage: null, capacity: null, bedrooms: null, bathrooms: null,
    beds: '', status: '', badge: '', badgeId: '', featured: false, features: [], equipements: [], highlights: []
  });
});

test('fiche complète : valeurs retenues, prix en euros dérivé comme pour une villa', () => {
  const { fiche, erreurs } = hote(serveurFiche().normaliser({
    name: ' Villa test ', category: 'evenement', environment: 'mer-lagune', location: 'Assinie-Mafia, Km 9',
    pricePerNight: '180000', capacity: '8', bedrooms: 4, bathrooms: '3', status: 'disponible',
    featured: 'yes', features: 'Piscine privée\n\n Wifi ', highlights: ['Ponton', '']
  }));
  assert.deepEqual(erreurs, []);
  assert.equal(fiche.name, 'Villa test');
  assert.equal(fiche.category, 'evenement');
  assert.equal(fiche.environment, 'mer-lagune');
  assert.equal(fiche.pricePerNight, 180000);
  assert.equal(fiche.priceEuro, Math.round(180000 / 655.957));
  assert.equal(fiche.capacity, 8);
  assert.equal(fiche.featured, true);
  assert.deepEqual(fiche.features, ['Piscine privée', 'Wifi']);
  assert.deepEqual(fiche.highlights, ['Ponton']);
});

test('champs laissés vides dans le formulaire : non renseignés, sans erreur', () => {
  // Forme exacte envoyée par le studio : FormData rend des chaînes vides.
  const { fiche, erreurs } = hote(serveurFiche().normaliser({
    category: '', environment: '', status: '', pricePerNight: '', weekendPackage: '  ',
    capacity: '', bedrooms: '', bathrooms: '', features: [], highlights: [], featured: false
  }));
  assert.deepEqual(erreurs, []);
  assert.equal(fiche.pricePerNight, null);
  assert.equal(fiche.priceEuro, null);
  assert.equal(fiche.weekendPackage, null);
  assert.equal(fiche.capacity, null);
});

test('cadre = lieu, catégorie = thème : anciennes valeurs de lieu retirées sans erreur, « piscine » refusée comme cadre', () => {
  const ancienne = hote(serveurFiche().normaliser({ category: 'lagune', environment: 'lagune' }));
  assert.deepEqual(ancienne.erreurs, []);
  assert.equal(ancienne.fiche.category, '');
  assert.equal(ancienne.fiche.environment, 'lagune');
  const piscine = hote(serveurFiche().normaliser({ environment: 'piscine' }));
  assert.equal(piscine.fiche.environment, '');
  assert.equal(piscine.erreurs.length, 1);
});

test('valeurs hors liste ou hors bornes : refusées explicitement, jamais corrigées en silence', () => {
  const { fiche, erreurs } = hote(serveurFiche().normaliser({
    category: 'chateau', environment: 'montagne', status: 'loue',
    capacity: '0', bedrooms: '2.5', pricePerNight: '-10', bathrooms: 'beaucoup'
  }));
  assert.equal(erreurs.length, 7);
  assert.equal(fiche.category, '');
  assert.equal(fiche.capacity, null);
});

test('le miroir JSON est relu et revalidé', () => {
  const fiches = hote([...serveurFiche({ fiches: { p1: { capacity: 6, category: 'inconnue' } } }).fichesFichier()]);
  assert.equal(fiches.length, 1);
  assert.equal(fiches[0][0], 'p1');
  assert.equal(fiches[0][1].capacity, 6);
  assert.equal(fiches[0][1].category, '', 'une valeur invalide du fichier ne ressort pas');
});

test('miroir absent ou abîmé : aucune fiche, aucune exception', () => {
  assert.equal(serveurFiche({}).fichesFichier().size, 0);
  assert.equal(serveurFiche({ fiches: null }).fichesFichier().size, 0);
});

test('la fiche n’est jamais recopiée dans le contenu du site', () => {
  const posts = hote(serveurFiche().sansFiche([{ id: 'a', message: 'x', fiche: { capacity: 4 } }, null]));
  assert.deepEqual(posts, [{ id: 'a', message: 'x' }, null]);
});

test('la route d’enregistrement exige facebook:write', () => {
  assert.match(server, /\['POST', \/\^\\\/api\\\/admin\\\/facebook\\\/fiche\$\/, 'facebook:write'\]/);
});

// --------------------------------------------------------------------------
// Base de données
// --------------------------------------------------------------------------
function repo(repondre) {
  const debut = repository.indexOf('const COLONNES_FICHE');
  const fin = repository.indexOf('\n}\n', repository.indexOf('async function updateFacebookPostFiche(')) + 3;
  assert.ok(debut > 0 && fin > debut, 'fonctions de fiche introuvables dans db/repository.js');
  const requetes = [];
  const contexte = vm.createContext({
    Number, String, Boolean, Map, JSON,
    query: async (sql, params) => {
      requetes.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return repondre(sql, params);
    },
    intLimit: (v, f) => Number(v) || f,
    toIso: v => v,
    imagesDepuisRaw: () => [],
    parseArray: v => (Array.isArray(v) ? v : (v ? JSON.parse(v) : [])),
    bool: v => (v ? 1 : 0),
    jsonColumn: v => JSON.stringify(v ?? [])
  });
  vm.runInContext(`${repository.slice(debut, fin)}
    this.lister = listFacebookPosts;
    this.fiches = listFacebookPostFiches;
    this.ecrire = updateFacebookPostFiche;`, contexte);
  return { ...contexte, requetes };
}

const colonneInconnue = () => Object.assign(new Error("Unknown column 'name' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR', errno: 1054 });

test('lecture en base : chaque publication porte sa fiche, NULL reste null', async () => {
  const r = repo(() => [[{
    id: 'p1', message: 'm', created_time: 't', permalink_url: '', full_picture: '', raw: null,
    name: 'Villa', category: 'ocean', environment: 'ocean', capacity: 12, price_per_night: '320000',
    bedrooms: null, featured: 1, features: '["Piscine"]', highlights: null
  }]]);
  const [post] = hote(await r.lister(20));
  assert.equal(post.fiche.capacity, 12);
  assert.equal(post.fiche.pricePerNight, 320000);
  assert.equal(post.fiche.bedrooms, null, 'une colonne NULL ne devient pas 0');
  assert.equal(post.fiche.featured, true);
  assert.deepEqual(post.fiche.features, ['Piscine']);
  COLONNES.forEach(colonne => assert.match(r.requetes[0].sql, new RegExp(`\\b${colonne}\\b`)));
});

test('colonnes absentes (migration pas encore passée) : lecture d’avant, sans échec', async () => {
  let appel = 0;
  const r = repo(() => { appel += 1; if (appel === 1) throw colonneInconnue(); return [[{ id: 'p1', message: 'm' }]]; });
  const posts = hote(await r.lister(20));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].fiche, undefined, 'la fiche viendra alors du miroir JSON');
  assert.doesNotMatch(r.requetes[1].sql, /capacity/);
});

test('une autre erreur SQL remonte telle quelle', async () => {
  const r = repo(() => { throw new Error('Connection lost'); });
  await assert.rejects(r.lister(20), /Connection lost/);
});

test('fiches par identifiant ; null si les colonnes n’existent pas', async () => {
  const r = repo(() => [[{ id: 'p1', capacity: 4 }]]);
  const fiches = await r.fiches();
  assert.equal(fiches.get('p1').capacity, 4);
  assert.equal(await repo(() => { throw colonneInconnue(); }).fiches(), null);
});

test('écriture : requête préparée, colonnes Facebook intactes, publication inconnue signalée', async () => {
  const fiche = hote(serveurFiche().normaliser({ capacity: 6, features: ['Piscine'] })).fiche;
  const inconnue = repo(() => [[]]);
  assert.equal(await inconnue.ecrire('absente', fiche), false);
  assert.equal(inconnue.requetes.length, 1, 'aucune mise à jour sans publication');

  const r = repo(sql => (/^SELECT/.test(sql.trim()) ? [[{ id: 'p1' }]] : [{ affectedRows: 1 }]));
  assert.equal(await r.ecrire('p1', fiche), true);
  const maj = r.requetes[1];
  assert.doesNotMatch(maj.sql, /message|full_picture|permalink_url|raw|created_time/);
  assert.equal(maj.params.length, 23);
  assert.equal(maj.params[9], 6, 'capacité à sa place');
  assert.equal(maj.params[16], '["Piscine"]');
  assert.equal(maj.params[22], 'p1');
});

// --------------------------------------------------------------------------
// Migration : trois définitions qui doivent rester identiques
// --------------------------------------------------------------------------
test('schéma, script phpMyAdmin et migration automatique déclarent les mêmes 18 colonnes', () => {
  const schema = lire('db/schema.sql');
  const blocSchema = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS `facebook_posts`'));
  const colonnesSchema = [...blocSchema.slice(0, blocSchema.indexOf(') ENGINE')).matchAll(/^\s+`(\w+)`/gm)].map(m => m[1]);
  const sql = lire('db/migration-fiche-publications.sql');
  const colonnesSql = [...sql.matchAll(/ADD COLUMN `(\w+)`/g)].map(m => m[1]);
  const migrate = lire('scripts/migrate.js');
  // Les rattachements aux référentiels relèvent d'une autre migration.
  const colonnesMigrate = [...migrate.matchAll(/\['facebook_posts', '(\w+)'/g)].map(m => m[1])
    .filter(c => !['localisation_id', 'localisation_precision', 'badge_id', 'equipements'].includes(c));

  assert.deepEqual(colonnesSql, COLONNES);
  assert.deepEqual(colonnesMigrate, COLONNES);
  // Les colonnes de rattachement aux référentiels (migration suivante)
  // s’intercalent : on vérifie l’ordre des 18 colonnes de la fiche entre elles.
  const RATTACHEMENTS = ['localisation_id', 'localisation_precision', 'badge_id', 'equipements'];
  const debut = colonnesSchema.indexOf('full_picture') + 1;
  const fin = colonnesSchema.indexOf('raw');
  assert.deepEqual(colonnesSchema.slice(debut, fin).filter(c => !RATTACHEMENTS.includes(c)), COLONNES, 'même ordre, entre full_picture et raw');
});

// --------------------------------------------------------------------------
// Recherche multicritère (js/app.js)
// --------------------------------------------------------------------------
function recherche(search = '') {
  const debut = app.indexOf('const TRANCHES_VOYAGEURS');
  const fin = app.indexOf('function initMultiFieldSearch()');
  assert.ok(debut > 0 && fin > debut, 'règles de recherche introuvables dans js/app.js');
  const contexte = vm.createContext({ URLSearchParams, window: { location: { search } }, T: cle => cle });
  vm.runInContext(`${app.slice(debut, fin)}
    this.correspond = correspondRecherche;
    this.cadreVilla = cadreVilla;
    this.lire = lireCriteresRecherche;
    this.active = rechercheMulticritereActive;
    this.libelles = libellesCriteresRecherche;`, contexte);
  return contexte;
}

// Les sept résidences en ligne le 13/09/2026, champs utiles à la recherche.
const VILLAS = [
  { id: 'km8', category: 'lagune', environment: 'mer-lagune', capacity: 6, pricePerNight: 150000, features: [] },
  { id: 'oasis', category: 'lagune', environment: 'lagune', capacity: 10, pricePerNight: 250000, features: ['Piscine privée'] },
  { id: 'palm', category: 'ocean', environment: 'ocean', capacity: 12, pricePerNight: 320000, features: ['Piscine à débordement'] },
  { id: 'akwaba', category: 'piscine', environment: 'piscine', capacity: 8, pricePerNight: 180000, features: ['Piscine'] },
  { id: 'eden', category: 'evenement', environment: 'terre', capacity: 18, pricePerNight: 500000, features: ['Piscine'] },
  { id: 'pavillon', category: 'romantique', environment: 'terre', capacity: 4, pricePerNight: 120000, features: [] },
  { id: 'sunset', category: 'lagune', environment: 'lagune', capacity: 10, pricePerNight: 280000, features: ['Piscine'] }
];

function villasPour(criteres) {
  const r = recherche();
  const complets = { cat: 'all', location: 'all', budget: 'all', guests: 'all', ...criteres };
  return VILLAS.filter(v => r.correspond(v, complets, r.cadreVilla)).map(v => v.id);
}

test('voyageurs : la capacité doit être DANS la tranche', () => {
  assert.deepEqual(villasPour({ guests: '2-6' }), ['km8', 'pavillon']);
  assert.deepEqual(villasPour({ guests: '8-12' }), ['oasis', 'palm', 'akwaba', 'sunset']);
  assert.deepEqual(villasPour({ guests: '12+' }), ['palm', 'eden']);
});

test('emplacement : le cadre fait foi, « mer & lagune » répond aux deux', () => {
  assert.deepEqual(villasPour({ location: 'lagune' }), ['km8', 'oasis', 'sunset']);
  assert.deepEqual(villasPour({ location: 'ocean' }), ['km8', 'palm']);
});

test('catégorie et budget gardent leur règle d’origine', () => {
  assert.deepEqual(villasPour({ cat: 'piscine' }), ['oasis', 'palm', 'akwaba', 'eden', 'sunset']);
  assert.deepEqual(villasPour({ budget: 'eco' }), ['km8', 'oasis', 'akwaba', 'pavillon']);
  assert.deepEqual(villasPour({ budget: 'luxe' }), ['oasis', 'palm', 'eden', 'sunset']);
});

test('sans critère, toutes les résidences restent affichées', () => {
  assert.equal(villasPour({}).length, VILLAS.length);
});

test('publication : une fiche vide ne répond à aucun critère actif', () => {
  const r = recherche();
  const vide = { category: '', environment: '', pricePerNight: null, capacity: null, features: [] };
  const base = { cat: 'all', location: 'all', budget: 'all', guests: 'all' };
  assert.equal(r.correspond(vide, base), true, 'sans critère, elle reste visible');
  for (const critere of [{ location: 'lagune' }, { cat: 'lagune' }, { budget: 'eco' }, { guests: '2-6' }]) {
    assert.equal(r.correspond(vide, { ...base, ...critere }), false, JSON.stringify(critere));
  }
});

test('publication : pas de repli sur la catégorie pour deviner le cadre', () => {
  const r = recherche();
  const fiche = { category: 'lagune', environment: '', pricePerNight: null, capacity: null, features: [] };
  assert.equal(r.correspond(fiche, { cat: 'all', location: 'lagune', budget: 'all', guests: 'all' }), false);
});

test('publication renseignée : retenue par les mêmes critères qu’une villa', () => {
  const r = recherche();
  const fiche = { category: 'ocean', environment: 'ocean', pricePerNight: 200000, capacity: 8, features: [] };
  assert.equal(r.correspond(fiche, { cat: 'ocean', location: 'ocean', budget: 'eco', guests: '8-12' }), true);
  assert.equal(r.correspond(fiche, { cat: 'all', location: 'lagune', budget: 'all', guests: 'all' }), false);
});

test('seul le formulaire multicritère active le filtre des publications', () => {
  assert.equal(recherche().active('?cat=lagune'), false, 'un lien de catégorie reste une navigation');
  assert.equal(recherche().active('?cat=all&location=all&budget=all&guests=all'), true);
  for (const q of ['?ville=assinie', '?equip=piscine', '?chambres=3']) assert.equal(recherche().active(q), true, q);
  assert.deepEqual(hote(recherche().lire('?location=ocean')),
    { cat: 'all', ville: 'all', location: 'ocean', budget: 'all', guests: 'all', equip: 'all', chambres: 'all' });
});

test('page qui affiche la barre : la catégorie seule filtre aussi les publications', () => {
  assert.equal(recherche().active('?cat=lagune', true), true);
  assert.equal(recherche().active('?cat=all', true), false);
  assert.equal(recherche().active('', true), false);
});

test('localisation : seul un bien rattaché à la ville répond', () => {
  const r = recherche();
  const base = { cat: 'all', ville: 'assinie-mafia', location: 'all', budget: 'all', guests: 'all' };
  assert.equal(r.correspond({ localisationId: 'assinie-mafia', features: [] }, base), true);
  assert.equal(r.correspond({ localisationId: 'assinie', features: [] }, base), false);
  assert.equal(r.correspond({ localisationId: '', features: [] }, base), false, 'non rattaché : non retenu');
  assert.equal(r.correspond({ features: [] }, { ...base, ville: 'all' }), true);
});

test('critères avancés : tous les équipements demandés, chambres minimum', () => {
  const r = recherche();
  const base = { cat: 'all', ville: 'all', location: 'all', budget: 'all', guests: 'all' };
  const villa = { features: [], equipements: ['piscine', 'wifi'], bedrooms: 4 };
  assert.equal(r.correspond(villa, { ...base, equip: 'piscine,wifi' }), true);
  assert.equal(r.correspond(villa, { ...base, equip: 'piscine,jacuzzi' }), false, 'un équipement manquant écarte le bien');
  assert.equal(r.correspond(villa, { ...base, chambres: '4' }), true);
  assert.equal(r.correspond(villa, { ...base, chambres: '5' }), false);
  assert.equal(r.correspond({ features: [], bedrooms: null }, { ...base, chambres: '1' }), false, 'nombre inconnu : non retenu');
  assert.equal(r.correspond({ features: [] }, { ...base, equip: 'all', chambres: 'all' }), true);
});

// Résidences en ligne le 13/09/2026 : ville, chambres, équipements cochés.
test('recherche réelle : Assinie-Mafia + piscine + Wi-Fi + 4 chambres → Oasis, Éden, Sunset', () => {
  const r = recherche();
  const biens = [
    { id: 'km8', localisationId: '', bedrooms: 3, equipements: [] },
    { id: 'oasis', localisationId: 'assinie-mafia', bedrooms: 4, equipements: ['piscine', 'wifi'] },
    { id: 'palm', localisationId: 'assinie-terminal', bedrooms: 5, equipements: ['piscine', 'wifi'] },
    { id: 'akwaba', localisationId: 'assinie-mafia', bedrooms: 3, equipements: ['piscine', 'wifi'] },
    { id: 'eden', localisationId: 'assinie-mafia', bedrooms: 7, equipements: ['piscine', 'wifi'] },
    { id: 'pavillon', localisationId: 'assinie', bedrooms: 2, equipements: ['wifi'] },
    { id: 'sunset', localisationId: 'assinie-mafia', bedrooms: 4, equipements: ['piscine', 'wifi'] }
  ].map(bien => ({ ...bien, features: [] }));
  const criteres = { cat: 'all', ville: 'assinie-mafia', location: 'all', budget: 'all', guests: 'all', equip: 'piscine,wifi', chambres: '4' };
  assert.deepEqual(hote(biens.filter(bien => r.correspond(bien, criteres)).map(bien => bien.id)), ['oasis', 'eden', 'sunset']);
});

test('résumé des critères : uniquement les critères actifs, avec les libellés du formulaire', () => {
  const libelles = hote(recherche().libelles({ cat: 'all', location: 'ocean', budget: 'all', guests: '8-12' }));
  assert.deepEqual(libelles, ['t.bord-d-ocean', 't.voyageurs-8-12']);
});

// --------------------------------------------------------------------------
// Stockage (store de server.js) : base, miroir JSON, refus explicites
// --------------------------------------------------------------------------
function stockage({ repo = null, contenu = {}, fichiers = {}, echecMiroir = false, origines = new Map() } = {}) {
  const debutFiche = server.indexOf('const CADRES_FICHE');
  const finFiche = server.indexOf('\n}\n', server.indexOf('function publicationsSansFiche(')) + 3;
  const debut = server.indexOf('const store = {');
  const fin = server.indexOf('  async readLeads() {', debut);
  assert.ok(debut > 0 && fin > debut, 'store introuvable dans server.js');

  const disque = structuredClone(fichiers);
  const contexte = vm.createContext({
    // Map partagée avec l'hôte : le store teste `instanceof Map` sur la valeur
    // rendue par le faux dépôt, créée ici — dans server.js, tout vit dans le
    // même realm.
    Map,
    REF,
    FICHES,
    REFERENTIELS_FILE: 'referentiels.json',
    console: { error() {}, warn() {}, log() {} },
    FB_FICHES_FILE: 'fiches.json', FB_POSTS_FILE: 'posts.json', CONTENT_FILE: 'contenu.json',
    databaseReady: false, databaseError: null,
    text: (v, max = 500) => String(v ?? '').trim().slice(0, max),
    readJSON: (chemin, secours) => (chemin in disque ? structuredClone(disque[chemin]) : secours),
    writeJSON: (chemin, valeur) => { if (echecMiroir) throw new Error('disque plein'); disque[chemin] = structuredClone(valeur); },
    loadRepository: () => repo,
    tryDb: async (label, gestionnaire, secours = null) => {
      if (!repo) return secours;
      try { return await gestionnaire(repo); } catch { return secours; }
    },
    lireContenuBrut: async () => structuredClone(contenu),
    publicationsMasquees: () => new Set(),
    originesPublications: () => origines
  });
  vm.runInContext(`${server.slice(debutFiche, finFiche)}\n${server.slice(debut, fin)}};\nthis.store = store;`, contexte);
  return { store: contexte.store, disque };
}

test('contenu public : une publication envoyée par le site depuis une fiche n’y revient pas en doublon', async () => {
  const { store } = stockage({
    contenu: { facebookPosts: [{ id: 'importee' }, { id: 'nee-du-site' }] },
    origines: new Map([['nee-du-site', { kind: 'villa', id: 'villa-oasis' }]])
  });
  const contenu = await store.readContent();
  assert.deepEqual(contenu.facebookPosts.map(post => post.id), ['importee']);
});

test('contenu public, mode fichiers : chaque publication reçoit sa fiche du miroir, vide sinon', async () => {
  const { store } = stockage({
    contenu: { facebookPosts: [{ id: 'a' }, { id: 'b' }] },
    fichiers: { 'fiches.json': { fiches: { a: { capacity: 6 } } } }
  });
  const posts = hote((await store.readContent()).facebookPosts);
  assert.equal(posts[0].fiche.capacity, 6);
  assert.equal(posts[1].fiche.capacity, null);
  assert.equal(posts[1].fiche.environment, '');
});

test('contenu public, base : la fiche lue en base n’est pas remplacée par le miroir', async () => {
  const { store } = stockage({
    contenu: { facebookPosts: [{ id: 'a', fiche: { capacity: 12 } }] },
    fichiers: { 'fiches.json': { fiches: { a: { capacity: 6 } } } }
  });
  assert.equal(hote(await store.readContent()).facebookPosts[0].fiche.capacity, 12);
});

test('écriture, mode fichiers : publication connue enregistrée dans le miroir', async () => {
  const { store, disque } = stockage({ fichiers: { 'posts.json': [{ id: 'a' }] } });
  const resultat = hote(await store.ecrireFichePublication('a', { capacity: 4 }));
  assert.equal(resultat.statut, 200);
  assert.equal(resultat.enBase, false);
  assert.equal(disque['fiches.json'].fiches.a.capacity, 4);
});

test('écriture, mode fichiers : publication inconnue refusée (404), rien d’écrit', async () => {
  const { store, disque } = stockage({ fichiers: { 'posts.json': [{ id: 'a' }] } });
  assert.equal((await store.ecrireFichePublication('z', {})).statut, 404);
  assert.equal(disque['fiches.json'], undefined);
});

test('écriture, base : base d’abord, miroir ensuite ; les autres fiches du miroir sont conservées', async () => {
  const appels = [];
  const repo = { updateFacebookPostFiche: async (id, fiche) => { appels.push([id, fiche]); return true; } };
  const { store, disque } = stockage({ repo, fichiers: { 'fiches.json': { fiches: { autre: { capacity: 2 } } } } });
  const resultat = hote(await store.ecrireFichePublication('a', { capacity: 8 }));
  assert.equal(resultat.statut, 200);
  assert.equal(resultat.enBase, true);
  assert.equal(appels.length, 1);
  assert.deepEqual(Object.keys(disque['fiches.json'].fiches).sort(), ['a', 'autre']);
});

test('écriture, base refusée : 503 explicite et miroir intact', async () => {
  const repo = { updateFacebookPostFiche: async () => { throw new Error('Connection lost'); } };
  const { store, disque } = stockage({ repo, fichiers: { 'fiches.json': { fiches: {} } } });
  const resultat = hote(await store.ecrireFichePublication('a', { capacity: 8 }));
  assert.equal(resultat.statut, 503);
  assert.match(resultat.erreur, /injoignable/);
  assert.deepEqual(disque['fiches.json'].fiches, {}, 'le miroir ne doit pas devancer la base');
});

test('écriture, colonnes absentes : le message nomme la migration à appliquer', async () => {
  const repo = { updateFacebookPostFiche: async () => { throw colonneInconnue(); } };
  const resultat = hote(await stockage({ repo }).store.ecrireFichePublication('a', {}));
  assert.equal(resultat.statut, 503);
  assert.match(resultat.erreur, /migration-fiche-publications\.sql/);
});

test('écriture, base : publication absente de la base → 404', async () => {
  const repo = { updateFacebookPostFiche: async () => false };
  assert.equal((await stockage({ repo }).store.ecrireFichePublication('a', {})).statut, 404);
});

test('écriture, base réussie mais miroir en échec : enregistré, avec avertissement', async () => {
  const repo = { updateFacebookPostFiche: async () => true };
  const resultat = hote(await stockage({ repo, echecMiroir: true }).store.ecrireFichePublication('a', {}));
  assert.equal(resultat.statut, 200);
  assert.match(resultat.avertissement, /copie de secours/);
});

test('lecture des fiches : base si disponible, miroir si les colonnes manquent', async () => {
  const enBase = stockage({ repo: { listFacebookPostFiches: async () => new Map([['a', { capacity: 9 }]]) } });
  assert.equal((await enBase.store.lireFichesPublications()).get('a').capacity, 9);
  const sansColonnes = stockage({
    repo: { listFacebookPostFiches: async () => null },
    fichiers: { 'fiches.json': { fiches: { a: { capacity: 3 } } } }
  });
  assert.equal((await sansColonnes.store.lireFichesPublications()).get('a').capacity, 3);
});
