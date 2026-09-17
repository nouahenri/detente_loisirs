// Points restants de l'audit du 13/09/2026 : doublon Facebook, cadre = lieu
// et catégorie = thème, tarif des activités généré, traductions des fiches.
// Tests isolés — aucune base réelle, aucun appel à Facebook.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');
const REF = require('../db/referentiels');
const FICHES = require('../db/fiches');
const server = lire('server.js');
const hote = valeur => JSON.parse(JSON.stringify(valeur));

// Tarifs tels qu'ils étaient saisis à la main en production le 13/09/2026 :
// le texte généré doit les reproduire à l'identique.
const ACTIVITES = [
  { id: 'balade-bateau', priceAmount: 60000, priceUnit: 'forfait', pricePrefix: 'À partir de', priceSuffix: '/ sortie', attendu: 'À partir de 60 000 FCFA / sortie' },
  { id: 'jet-ski', priceAmount: 45000, priceUnit: 'forfait', pricePrefix: '', priceSuffix: '/ 30 min', attendu: '45 000 FCFA / 30 min' },
  { id: 'iles-ehotiles', priceAmount: 75000, priceUnit: 'forfait', pricePrefix: '', priceSuffix: 'pour le groupe', attendu: '75 000 FCFA pour le groupe' },
  { id: 'randonnee-quad', priceAmount: 35000, priceUnit: 'forfait', pricePrefix: '', priceSuffix: '/ quad', attendu: '35 000 FCFA / quad' },
  { id: 'parc-dipi', priceAmount: 5000, priceUnit: 'personne', pricePrefix: 'Entrée', priceSuffix: '', attendu: 'Entrée 5 000 FCFA / personne' },
  { id: 'chef-prive', priceAmount: 25000, priceUnit: 'jour', pricePrefix: 'À partir de', priceSuffix: '', attendu: 'À partir de 25 000 FCFA / jour' },
  { id: 'balade-lagunaire', priceAmount: 10000, priceUnit: 'personne', groupPriceAmount: 35000, groupSize: 4, pricePrefix: '', priceSuffix: '', attendu: '10 000 FCFA / personne · 35 000 FCFA les 4' },
  { id: 'traversee-lagunaire', priceAmount: 2000, priceUnit: 'personne', pricePrefix: '', priceSuffix: '', attendu: '2 000 FCFA / personne' }
];

// --------------------------------------------------------------------------
// Tarif des activités
// --------------------------------------------------------------------------
test('tarif généré : reproduit exactement les huit libellés saisis en production', () => {
  for (const activite of ACTIVITES) assert.equal(FICHES.texteTarifActivite(activite), activite.attendu, activite.id);
});

test('tarif généré : forfait groupe seulement par personne et complet ; montant nul → sur demande', () => {
  assert.equal(FICHES.texteTarifActivite({ priceAmount: 10000, priceUnit: 'forfait', groupPriceAmount: 35000, groupSize: 4 }), '10 000 FCFA');
  assert.equal(FICHES.texteTarifActivite({ priceAmount: 10000, priceUnit: 'personne', groupPriceAmount: 35000, groupSize: 1 }), '10 000 FCFA / personne');
  assert.equal(FICHES.texteTarifActivite({ priceAmount: 0 }), 'Tarif sur demande');
  assert.equal(FICHES.texteTarifActivite({ priceAmount: 0, pricePrefix: 'À partir de', priceSuffix: '/ sortie' }), 'Tarif sur demande', 'jamais « À partir de / sortie »');
  assert.equal(FICHES.texteTarifActivite({ priceAmount: 1250000, priceUnit: 'inconnue' }), '1 250 000 FCFA');
});

test('tarif traduit : unités de la langue, mentions traduites, repli sur les mentions françaises', () => {
  const activite = { ...ACTIVITES[0], translations: { en: { pricePrefix: 'From', priceSuffix: '/ trip' } } };
  assert.equal(FICHES.texteTarifActivite(activite, 'en'), 'From 60 000 FCFA / trip');
  assert.equal(FICHES.texteTarifActivite(activite, 'es'), 'À partir de 60 000 FCFA / sortie', 'espagnol absent : mentions françaises');
  assert.equal(FICHES.texteTarifActivite(ACTIVITES[6], 'es'), '10 000 FCFA / persona · 35 000 FCFA para 4');
});

test('tarif : les copies de js/app.js et js/admin.js rendent exactement le même texte que le serveur', () => {
  const extraire = (source, debut, fin) => source.slice(source.indexOf(debut), source.indexOf(fin));
  const app = vm.createContext({});
  vm.runInContext(`${extraire(lire('js/app.js'), 'const TEXTES_TARIF', '/** Tarif d\'une activité pour l\'affichage')}\nthis.f = texteTarifActivite;`, app);
  const admin = vm.createContext({});
  vm.runInContext(`${extraire(lire('js/admin.js'), 'const TEXTES_TARIF', '  const CHAMPS_TRADUCTION')}\nthis.f = texteTarifActivite;`, admin);
  const cas = [...ACTIVITES, { priceAmount: 0 }, { priceAmount: '15000', priceUnit: 'jour', pricePrefix: ' Dès ' },
    { ...ACTIVITES[6], translations: { es: { pricePrefix: 'Desde' } } }];
  for (const activite of cas) {
    for (const langue of ['fr', 'en', 'es']) {
      const attendu = FICHES.texteTarifActivite(activite, langue);
      assert.equal(app.f(activite, langue), attendu, `app ${activite.id} ${langue}`);
      assert.equal(admin.f(activite, langue), attendu, `admin ${activite.id} ${langue}`);
    }
  }
});

// --------------------------------------------------------------------------
// Traductions
// --------------------------------------------------------------------------
test('traductions : langues et champs connus seulement, bornées, vides retirés', () => {
  const propre = FICHES.nettoyerTraductions({
    en: { tagline: '  Hello  ', description: '', features: 'Pool\n\n Wi-Fi ', inconnu: 'x', name: 'Nom propre' },
    es: { tagline: '', highlights: [] },
    de: { tagline: 'Hallo' }
  }, 'villa');
  assert.deepEqual(propre, { en: { tagline: 'Hello', features: ['Pool', 'Wi-Fi'] } });
  assert.equal(FICHES.nettoyerTraductions({ en: { title: 'x'.repeat(500) } }, 'terrain').en.title.length, 160);
  assert.deepEqual(FICHES.nettoyerTraductions('pas un objet', 'activity'), {});
  assert.deepEqual(FICHES.nettoyerTraductions({ en: { title: 'x' } }, 'inconnu'), {});
});

test('traductions : js/i18n.js affiche la traduction, et le français quand elle manque', () => {
  const contexte = { window: { localStorage: { getItem: () => 'en', setItem() {} }, navigator: { language: 'en' } } };
  vm.createContext(contexte);
  vm.runInContext(lire('js/i18n.js'), contexte);
  const fiche = { tagline: 'Accroche', beds: '2 lits', translations: { en: { tagline: 'Tagline', beds: '' } } };
  assert.equal(contexte.window.I18N.fiche(fiche, 'tagline'), 'Tagline');
  assert.equal(contexte.window.I18N.fiche(fiche, 'beds'), '2 lits');
});

test('schéma, migration et dépôt : mêmes colonnes pour les traductions et les mentions de tarif', () => {
  const schema = lire('db/schema.sql');
  const migration = lire('db/migration-5-points.sql');
  const migrate = lire('scripts/migrate.js');
  for (const [table, colonne] of [['villas', 'translations'], ['terrains', 'translations'], ['activities', 'price_prefix'], ['activities', 'price_suffix'], ['activities', 'translations']]) {
    const bloc = schema.slice(schema.indexOf(`CREATE TABLE IF NOT EXISTS \`${table}\``));
    assert.match(bloc.slice(0, bloc.indexOf(') ENGINE')), new RegExp(`\`${colonne}\``), `schema ${table}.${colonne}`);
    assert.match(migration, new RegExp(`ALTER TABLE \`${table}\`[^;]*ADD COLUMN \`${colonne}\``), `migration ${table}.${colonne}`);
    assert.ok(migrate.includes(`['${table}', '${colonne}'`), `migrate.js ${table}.${colonne}`);
  }
});

// --------------------------------------------------------------------------
// Validation du contenu (server.js)
// --------------------------------------------------------------------------
function valider(payload) {
  const helpers = server.slice(server.indexOf('function text('), server.indexOf('\n}\n', server.indexOf('function slug(')) + 3);
  const debut = server.indexOf('const EURO_RATE');
  const fin = server.indexOf('\n}\n', server.indexOf('function validateAndSanitizeContent(')) + 3;
  const contexte = vm.createContext({ REF, FICHES, SYNC: require('../db/synchro-facebook'), publicationsSansFiche: posts => posts });
  vm.runInContext(`${helpers}\n${server.slice(debut, fin)}\nthis.valider = validateAndSanitizeContent;`, contexte);
  return hote(contexte.valider(payload, REF.normaliserReferentiels(null)));
}

test('villa : ancienne catégorie de lieu retirée, cadre déduit, « piscine » n’est plus un cadre', () => {
  const { content, errors } = valider({ villas: [
    { name: 'A', category: 'lagune', pricePerNight: 1, images: ['a.jpg'] },
    { name: 'B', category: 'piscine', environment: 'piscine', pricePerNight: 1, images: ['b.jpg'] },
    { name: 'C', category: 'romantique', environment: 'mer-lagune', pricePerNight: 1, images: ['c.jpg'] },
    { name: 'D', category: '', environment: 'ocean', pricePerNight: 1, images: ['d.jpg'] }
  ] });
  assert.deepEqual(errors, []);
  assert.deepEqual(content.villas.map(v => [v.category, v.environment, v.categoryLabel]), [
    ['', 'lagune', ''], ['', 'terre', ''], ['romantique', 'mer-lagune', 'Escapades en Amoureux'], ['', 'ocean', '']
  ]);
});

test('villa : catégorie inconnue signalée ; traductions nettoyées et conservées', () => {
  const { content, errors } = valider({ villas: [
    { name: 'A', category: 'chateau', pricePerNight: 1, images: ['a.jpg'], translations: { en: { tagline: ' Hi ', name: 'x' }, it: { tagline: 'Ciao' } } }
  ] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /chateau/);
  assert.deepEqual(content.villas[0].translations, { en: { tagline: 'Hi' } });
});

test('activité : le texte du tarif est recalculé, jamais repris de la saisie', () => {
  const { content } = valider({ activities: [
    { title: 'Balade', price: '1 FCFA (texte périmé)', priceAmount: 60000, priceUnit: 'forfait', pricePrefix: 'À partir de', priceSuffix: '/ sortie', images: ['a.jpg'],
      translations: { en: { pricePrefix: 'From' } } }
  ] });
  const activite = content.activities[0];
  assert.equal(activite.price, 'À partir de 60 000 FCFA / sortie');
  assert.equal(activite.pricePrefix, 'À partir de');
  assert.deepEqual(activite.translations, { en: { pricePrefix: 'From' } });
});

test('terrain : traductions nettoyées', () => {
  const { content } = valider({ terrains: [{ title: 'T', reference: 'R1', areaSqm: 100, priceTotal: 1000, landStatus: 'acd', images: ['t.jpg'],
    translations: { es: { title: 'Parcela', tagline: 'champ de villa' } } }] });
  assert.deepEqual(content.terrains[0].translations, { es: { title: 'Parcela' } });
});

test('dépôt MySQL : traductions et mentions de tarif écrites dans les bonnes colonnes', () => {
  const repository = lire('db/repository.js');
  const contexte = vm.createContext({ Math, Number, JSON, EURO_RATE: 655.957, bool: v => (v ? 1 : 0), jsonColumn: v => JSON.stringify(v ?? []) });
  vm.runInContext("function etatAnnonce(item) {\n  return ['active', 'suspendue', 'archivee'].includes(item?.etat) ? item.etat : 'active';\n}", contexte);
  const colonnes = constante => {
    const sql = repository.slice(repository.indexOf(`const ${constante}`), repository.indexOf('`;', repository.indexOf(`const ${constante}`)));
    return sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(c => c.trim());
  };
  for (const [constante, fonction, item] of [
    ['VILLA_UPSERT', 'villaParams', { id: 'v', translations: { en: { tagline: 'Hi' } } }],
    ['TERRAIN_UPSERT', 'terrainParams', { id: 't', translations: { es: { title: 'T' } } }],
    ['ACTIVITY_UPSERT', 'activityParams', { id: 'a', pricePrefix: 'Dès', priceSuffix: '/ jour', translations: {} }]
  ]) {
    const debut = repository.indexOf(`function ${fonction}(`);
    vm.runInContext(`${repository.slice(debut, repository.indexOf('\n}\n', debut) + 3)}\nthis.${fonction} = ${fonction};`, contexte);
    const noms = colonnes(constante);
    const valeurs = contexte[fonction](item, 0);
    assert.equal(valeurs.length, noms.length, constante);
    const ligne = Object.fromEntries(noms.map((nom, index) => [nom, valeurs[index]]));
    assert.deepEqual(JSON.parse(ligne.translations), item.translations, `${constante} translations`);
    if (fonction === 'activityParams') {
      assert.equal(ligne.price_prefix, 'Dès');
      assert.equal(ligne.price_suffix, '/ jour');
    }
  }
});

// --------------------------------------------------------------------------
// Doublon Facebook : publication née d'une fiche du site
// --------------------------------------------------------------------------
function origines(journal) {
  const debut = server.indexOf('function originesPublications(');
  // originesPublications + origineEntree (fiche d'origine d'une entrée).
  const fin = server.indexOf('\n}\n', server.indexOf('function origineEntree(')) + 3;
  const contexte = vm.createContext({ Map, readJSON: () => structuredClone(journal), text: (v, max = 500) => String(v ?? '').trim().slice(0, max), FB_PUBLISH_FILE: 'journal.json' });
  vm.runInContext(`${server.slice(debut, fin)}\nthis.origines = originesPublications;`, contexte);
  return [...contexte.origines()].map(([id, origine]) => [id, hote(origine)]);
}

test('origine : clé automatique « auto:kind:id », origine explicite, échecs et envois manuels anciens ignorés', () => {
  assert.deepEqual(origines([
    { idempotencyKey: 'auto:villa:villa-test-relais-2', facebookId: '100737595756553_1085535120653880', status: 'publie' },
    { idempotencyKey: 'a1b2c3', facebookId: 'P_2', status: 'publie', origine: { kind: 'terrain', id: 'terrain-lagune-km12' } },
    { idempotencyKey: 'auto:activity:jet-ski', facebookId: 'P_3', status: 'echec' },
    { idempotencyKey: 'd4e5f6', facebookId: 'P_4', status: 'publie' },
    { idempotencyKey: 'x', facebookId: 'P_5', status: 'publie', origine: { kind: 'maison', id: 'm' } }
  ]), [
    ['100737595756553_1085535120653880', { kind: 'villa', id: 'villa-test-relais-2' }],
    ['P_2', { kind: 'terrain', id: 'terrain-lagune-km12' }]
  ]);
});

test('publication : l’origine est enregistrée au journal et l’identifiant retenu est celui de la publication', () => {
  const debut = server.indexOf('async function publishFacebookPost(');
  const bloc = server.slice(debut, server.indexOf('\n}\n', debut));
  assert.match(bloc, /facebookId: text\(result\.post_id \|\| result\.id, 200\)[^\n]*origine/);
  // Annonces publiées depuis le site (17/09/2026) : origine et publication, pas la photo.
  const annonce = server.slice(server.indexOf('async function publierAnnonceFacebook('), server.indexOf('async function modifierTexteFacebook('));
  assert.match(annonce, /origine: \{ kind, id: item\.id \}/);
  assert.match(annonce, /text\(resultat\.post_id \|\| resultat\.id, 200\)/);
});

// --------------------------------------------------------------------------
// Recherche du site (js/app.js)
// --------------------------------------------------------------------------
function recherche(search = '') {
  const app = lire('js/app.js');
  const debut = app.indexOf('const TRANCHES_VOYAGEURS');
  const fin = app.indexOf('function initMultiFieldSearch()');
  const contexte = vm.createContext({ URLSearchParams, window: { location: { search } }, T: cle => cle });
  vm.runInContext(`${app.slice(debut, fin)}\nthis.correspond = correspondRecherche; this.cadreVilla = cadreVilla;`, contexte);
  return contexte;
}

test('recherche : onglets « lagune / océan » lus dans le cadre, « piscine » dans les équipements, thème dans la catégorie', () => {
  const r = recherche();
  const base = { cat: 'all', location: 'all', budget: 'all', guests: 'all' };
  const oasis = { category: '', environment: 'lagune', equipements: ['piscine'], features: [] };
  const km8 = { category: '', environment: 'mer-lagune', equipements: [], features: [] };
  const eden = { category: 'evenement', environment: 'terre', equipements: ['piscine'], features: [] };
  const passe = bien => ['lagune', 'ocean', 'piscine', 'evenement'].filter(cat => r.correspond(bien, { ...base, cat }, r.cadreVilla));
  assert.deepEqual(passe(oasis), ['lagune', 'piscine']);
  assert.deepEqual(passe(km8), ['lagune', 'ocean']);
  assert.deepEqual(passe(eden), ['piscine', 'evenement']);
  assert.equal(r.correspond(km8, { ...base, location: 'ocean' }, r.cadreVilla), true);
});

test('recherche : ancienne villa au cadre « piscine » → terre ferme ; ancienne catégorie de lieu → cadre', () => {
  const r = recherche();
  assert.equal(r.cadreVilla({ environment: 'piscine', category: 'piscine' }), 'terre');
  assert.equal(r.cadreVilla({ environment: '', category: 'ocean' }), 'ocean');
});

test('anciens liens « ?cat=lagune » : réécrits en « ?location=lagune », les autres inchangés', () => {
  const app = lire('js/app.js');
  const debut = app.indexOf('/** Anciens liens');
  const fin = app.indexOf('/** Thèmes proposés sur le site');
  const reecrire = search => {
    const adresses = [];
    const contexte = vm.createContext({
      URLSearchParams, CATEGORIES_LIEU: ['lagune', 'ocean'],
      window: { location: { search, pathname: '/residences.html', hash: '' } },
      history: { replaceState: (etat, titre, url) => adresses.push(url) }
    });
    vm.runInContext(`${app.slice(debut, fin)}\nnormaliserAdresseRecherche();`, contexte);
    return adresses[0] || null;
  };
  assert.equal(reecrire('?cat=lagune'), '/residences.html?location=lagune');
  assert.equal(reecrire('?cat=ocean&guests=2-6'), '/residences.html?guests=2-6&location=ocean');
  assert.equal(reecrire('?cat=piscine'), null);
  assert.equal(reecrire('?cat=romantique'), null);
});
