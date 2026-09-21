// Référentiels administrables : localisations, catégories, équipements,
// badges et statuts (13/09/2026). Tests isolés — aucune base réelle.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');
const REF = require('../db/referentiels');
const server = lire('server.js');
const repository = lire('db/repository.js');
const migration = lire('db/migration-referentiels.sql');
const hote = valeur => JSON.parse(JSON.stringify(valeur));

// --------------------------------------------------------------------------
// Module db/referentiels.js
// --------------------------------------------------------------------------
test('sans source : valeurs initiales complètes', () => {
  const refs = REF.normaliserReferentiels(null);
  // Catégories : thèmes seulement depuis le 13/09/2026 (lagune, océan, piscine retirés).
  // Équipements voitures : liste à part depuis le 19/09/2026 (18 entrées).
  assert.deepEqual(REF.TYPES.map(type => refs[type].length), [3, 2, 14, 18, 18, 6]);
  assert.ok(refs['equipements-voiture'].some(e => e.id === 'camera-recul'), 'la liste des voitures est bien celle des véhicules');
  assert.ok(!refs['equipements-voiture'].some(e => e.id === 'piscine'), 'aucun équipement de villa dans la liste des voitures');
});

test('une liste vide reste vide (tout supprimé dans le studio), sauf les statuts fixes', () => {
  const refs = REF.normaliserReferentiels({ localisations: [], categories: [], equipements: [], badges: [], statuts: [] });
  assert.equal(refs.localisations.length, 0);
  assert.equal(refs.statuts.length, 6, 'un statut ne disparaît jamais');
});

test('entrées triées par ordre, doublons écartés', () => {
  const refs = REF.normaliserReferentiels({ localisations: [
    { id: 'b', nom: 'B', ordre: 2 }, { id: 'a', nom: 'A', ordre: 1 }, { id: 'a', nom: 'A bis', ordre: 3 }
  ] });
  assert.deepEqual(refs.localisations.map(entree => entree.nom), ['A', 'B']);
});

test('saisie : identifiant déduit du libellé, libellé français obligatoire', () => {
  assert.equal(REF.normaliserEntree('localisations', { nom: 'Grand-Bassam' }).entree.id, 'grand-bassam');
  assert.equal(REF.normaliserEntree('badges', { libelle: { fr: 'Coup de Cœur !' } }).entree.id, 'coup-de-coeur');
  assert.match(REF.normaliserEntree('categories', { libelle: { en: 'Only English' } }).erreurs[0], /français/);
});

test('statuts : ni création ni changement de code', () => {
  assert.equal(REF.normaliserEntree('statuts', { cible: 'villa', code: 'loue', libelle: { fr: 'Loué' } }).entree, null);
  const ok = REF.normaliserEntree('statuts', { cible: 'terrain', code: 'vendu', libelle: { fr: 'Cédé' } });
  assert.equal(ok.entree.id, 'terrain:vendu');
  assert.equal(ok.entree.libelle.fr, 'Cédé');
});

test('adresse : ville + repère ; sans ville rattachée, texte d’origine', () => {
  const refs = REF.normaliserReferentiels(null);
  assert.equal(REF.composerLocalisation(refs, 'assinie-mafia', 'Km 9'), 'Assinie-Mafia, Km 9');
  assert.equal(REF.composerLocalisation(refs, 'assinie', ''), 'Assinie');
  assert.equal(REF.composerLocalisation(refs, '', 'Km 9', 'Texte libre'), 'Texte libre');
});

test('résolution : renommer une ville ou un badge les renomme sur la fiche', () => {
  const refs = REF.normaliserReferentiels(null);
  refs.localisations[0].nom = 'Mafia (renommée)';
  refs.badges.find(badge => badge.id === 'coup-de-coeur').libelle.fr = 'Favori';
  const resolu = REF.resoudreBien({ localisationId: 'assinie-mafia', localisationPrecision: 'Km 14', location: 'ancien', badgeId: 'coup-de-coeur', badge: 'ancien' }, refs);
  assert.equal(resolu.location, 'Mafia (renommée), Km 14');
  assert.equal(resolu.badge, 'Favori');
});

test('résolution : sans référence (base pas encore migrée), le texte enregistré est conservé', () => {
  const refs = REF.normaliserReferentiels(null);
  const bien = { location: 'Assinie-Mafia, Km 14 (Bord de lagune)', badge: 'Coup de Cœur', localisationId: '', badgeId: '' };
  assert.deepEqual(REF.resoudreBien(bien, refs), bien);
});

test('usages : comptés par type, pour empêcher de supprimer une entrée utilisée', () => {
  const biens = {
    villas: [{ localisationId: 'assinie', badgeId: 'disponible', category: 'lagune', equipements: ['piscine'] }],
    terrains: [{ localisationId: 'assinie', badgeId: '' }],
    activities: [{ badgeId: 'disponible' }],
    fiches: [{ category: 'lagune', equipements: ['piscine', 'wifi'] }]
  };
  assert.equal(REF.compterUsages('localisations', 'assinie', biens), 2);
  assert.equal(REF.compterUsages('badges', 'disponible', biens), 2);
  assert.equal(REF.compterUsages('categories', 'lagune', biens), 2);
  assert.equal(REF.compterUsages('equipements', 'piscine', biens), 2);
  assert.equal(REF.compterUsages('equipements', 'jacuzzi', biens), 0);
});

// --------------------------------------------------------------------------
// Cohérence : valeurs initiales, migration SQL, traductions existantes
// --------------------------------------------------------------------------
test('la migration SQL insère exactement les valeurs initiales du module', () => {
  for (const [table, type] of [['ref_localisations', 'localisations'], ['ref_categories', 'categories'], ['ref_equipements', 'equipements'], ['ref_badges', 'badges']]) {
    const bloc = migration.slice(migration.indexOf(`INSERT IGNORE INTO \`${table}\``));
    const valeurs = bloc.slice(0, bloc.indexOf(';'));
    // Les catégories de lieu insérées alors sont retirées par db/migration-5-points.sql.
    const ids = [...valeurs.matchAll(/\('([a-z0-9-]+)',/g)].map(m => m[1])
      .filter(id => type !== 'categories' || !REF.CATEGORIES_RESERVEES.includes(id));
    assert.deepEqual(ids, REF.DEFAUTS[type].map(entree => entree.id), table);
  }
});

test('libellés de catégories repris à l’identique de js/i18n.js (aucune traduction inventée)', () => {
  const i18n = lire('js/i18n.js');
  const cles = { lagune: 't.bord-de-lagune', ocean: 't.bord-d-ocean', piscine: 't.piscines-privees', evenement: 't.grands-groupes-evenements', romantique: 't.escapades-en-amoureux' };
  const contexte = { window: {} };
  vm.createContext(contexte);
  vm.runInContext(i18n, contexte);
  const dico = contexte.window.I18N.dictionnaire;
  for (const categorie of REF.DEFAUTS.categories) {
    for (const langue of ['fr', 'en', 'es']) {
      assert.equal(categorie.libelle[langue], dico[langue][cles[categorie.id]], `${categorie.id} ${langue}`);
    }
  }
});

test('schéma, migration phpMyAdmin et migration automatique ajoutent les mêmes colonnes', () => {
  const alter = table => {
    const bloc = migration.slice(migration.indexOf(`ALTER TABLE \`${table}\``));
    return [...bloc.slice(0, bloc.indexOf(';')).matchAll(/ADD COLUMN `(\w+)`/g)].map(m => m[1]);
  };
  const migrate = lire('scripts/migrate.js');
  const schema = lire('db/schema.sql');
  for (const table of ['villas', 'terrains', 'activities', 'facebook_posts']) {
    const colonnes = alter(table);
    assert.ok(colonnes.length, table);
    const auto = [...migrate.matchAll(new RegExp(`\\['${table}', '(\\w+)'`, 'g'))].map(m => m[1]);
    colonnes.forEach(colonne => assert.ok(auto.includes(colonne), `${table}.${colonne} absente de scripts/migrate.js`));
    const bloc = schema.slice(schema.indexOf(`CREATE TABLE IF NOT EXISTS \`${table}\``));
    const definition = bloc.slice(0, bloc.indexOf(') ENGINE'));
    colonnes.forEach(colonne => assert.match(definition, new RegExp(`\`${colonne}\``), `${table}.${colonne} absente de db/schema.sql`));
  }
});

test('équipements pré-cochés : « piscine » seulement si le mot figure dans la fiche', () => {
  // Données de production relevées le 13/09/2026 : Pavillon Sérénité a un
  // « bassin / jacuzzi » mais aucune ligne « piscine ».
  const ligne = id => migration.match(new RegExp(`SET \`equipements\` = '([^']+)'\\s+WHERE \`id\` = '${id}'`))[1];
  assert.ok(!JSON.parse(ligne('pavillon-serenite')).includes('piscine'));
  assert.ok(JSON.parse(ligne('pavillon-serenite')).includes('jacuzzi'));
  for (const id of ['villa-oasis', 'residence-palm-beach', 'villa-akwaba', 'domaine-eden', 'villa-sunset-paradise']) {
    const codes = JSON.parse(ligne(id));
    assert.ok(codes.includes('piscine'), id);
    codes.forEach(code => assert.ok(REF.DEFAUTS.equipements.some(entree => entree.id === code), `${id} : ${code}`));
  }
});

// --------------------------------------------------------------------------
// db/repository.js
// --------------------------------------------------------------------------
test('écritures des villas, terrains et activités : autant de valeurs que de colonnes', () => {
  const contexte = vm.createContext({ Math, Number, JSON, EURO_RATE: 655.957, bool: v => (v ? 1 : 0), jsonColumn: v => JSON.stringify(v ?? []) });
  vm.runInContext("function etatAnnonce(item) {\n  return ['active', 'suspendue', 'archivee'].includes(item?.etat) ? item.etat : 'active';\n}", contexte);
  for (const [constante, fonction] of [['VILLA_UPSERT', 'villaParams'], ['TERRAIN_UPSERT', 'terrainParams'], ['ACTIVITY_UPSERT', 'activityParams']]) {
    const sql = repository.slice(repository.indexOf(`const ${constante}`), repository.indexOf('`;', repository.indexOf(`const ${constante}`)));
    const colonnes = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').length;
    const debut = repository.indexOf(`function ${fonction}(`);
    const fin = repository.indexOf('\n}\n', debut) + 3;
    vm.runInContext(`${repository.slice(debut, fin)}\nthis.${fonction} = ${fonction};`, contexte);
    const valeurs = contexte[fonction]({ id: 'x', localisationId: 'assinie', badgeId: 'disponible', equipements: ['wifi'] }, 0);
    assert.equal(valeurs.length, colonnes, constante);
  }
});

function repoReferentiels(repondre) {
  const debut = repository.indexOf('const TABLES_REFERENTIELS');
  const fin = repository.indexOf('\n}\n', repository.indexOf('async function semerReferentiels(')) + 3;
  const requetes = [];
  const contexte = vm.createContext({
    Number, String, Boolean, Object,
    query: async (sql, params) => { requetes.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return repondre(sql, params); },
    transaction: async gestionnaire => gestionnaire({ execute: async (sql, params) => { requetes.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return [{ affectedRows: 1 }]; } }),
    bool: v => (v ? 1 : 0)
  });
  vm.runInContext(`${repository.slice(debut, fin)}
    this.lister = listReferentiels; this.enregistrer = saveReferentiel; this.ordonner = ordonnerReferentiel; this.supprimer = deleteReferentiel;
    this.manquantes = tablesReferentielsManquantes;`, contexte);
  return { ...contexte, requetes };
}

test('tables absentes (migration pas encore passée) : null, pas d’exception', async () => {
  const r = repoReferentiels(() => { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }); });
  assert.equal(await r.lister(), null);
});

test('une table absente ne masque plus les autres : localisations lues en base, table signalée (21/09/2026)', async () => {
  // Production du 21/09/2026 : ref_equipements_voiture manquait, et les 9
  // localisations de la base cédaient la place aux 6 du miroir JSON.
  const r = repoReferentiels(sql => {
    if (/ref_equipements_voiture/.test(sql)) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });
    if (/ref_localisations/.test(sql)) return [[{ id: 'adiake', nom: 'Adiaké', ordre: 7, actif: 1 }, { id: 'bonoua', nom: 'Bonoua', ordre: 8, actif: 1 }]];
    return [[]];
  });
  const refs = hote(await r.lister());
  assert.deepEqual(refs.localisations.map(l => l.nom), ['Adiaké', 'Bonoua']);
  assert.equal(refs['equipements-voiture'], undefined, 'le type sans table reçoit ses valeurs initiales à la normalisation');
  assert.deepEqual(hote(r.manquantes()), ['ref_equipements_voiture']);
  const normalises = REF.normaliserReferentiels(refs);
  assert.deepEqual(normalises.localisations.map(l => l.id), ['adiake', 'bonoua']);
  assert.equal(normalises['equipements-voiture'].length, REF.DEFAUTS['equipements-voiture'].length);
  assert.match(server, /tablesManquantes = repo && typeof repo\.tablesReferentielsManquantes === 'function'/);
  assert.match(lire('js/admin.js'), /state\.refTablesManquantes = detail\.tablesManquantes \|\| \[\]/);
});

test('lecture : statuts identifiés par « cible:code », libellés en trois langues', async () => {
  const r = repoReferentiels(sql => (/ref_statuts/.test(sql)
    ? [[{ cible: 'terrain', code: 'vendu', libelle_fr: 'Vendu', libelle_en: 'Sold', libelle_es: 'Vendido', ordre: 3 }]]
    : [[]]));
  const refs = hote(await r.lister());
  assert.deepEqual(refs.statuts[0], { id: 'terrain:vendu', cible: 'terrain', code: 'vendu', libelle: { fr: 'Vendu', en: 'Sold', es: 'Vendido' }, ordre: 3, actif: true });
});

test('statut : seule une mise à jour des libellés, jamais d’insertion', async () => {
  const r = repoReferentiels(() => [[]]);
  await r.enregistrer('statuts', { cible: 'villa', code: 'disponible', libelle: { fr: 'Libre', en: '', es: '' } });
  assert.match(r.requetes[0].sql, /^UPDATE ref_statuts SET libelle_fr=\?/);
  await assert.rejects(r.supprimer('statuts', 'villa:disponible'), /statuts/);
});

test('ordre : une transaction, ordre = rang dans la liste', async () => {
  const r = repoReferentiels(() => [[]]);
  await r.ordonner('categories', ['ocean', 'lagune']);
  assert.deepEqual(hote(r.requetes.map(q => q.params)), [[1, 'ocean'], [2, 'lagune']]);
  assert.match(r.requetes[0].sql, /UPDATE `ref_categories` SET ordre = \? WHERE id = \?/);
});

// --------------------------------------------------------------------------
// server.js : validation du contenu
// --------------------------------------------------------------------------
function appliquer(item, options) {
  const debut = server.indexOf('function appliquerReferentiels(');
  const fin = server.indexOf('\n}\n', debut) + 3;
  const contexte = vm.createContext({ REF, text: (v, max = 500) => String(v ?? '').trim().slice(0, max) });
  vm.runInContext(`${server.slice(debut, fin)}\nthis.appliquer = appliquerReferentiels;`, contexte);
  const erreurs = [];
  const resultat = contexte.appliquer(item, REF.normaliserReferentiels(null), erreurs, { nom: 'Fiche', ...options });
  return { resultat: hote(resultat), erreurs: hote(erreurs) };
}

test('villa rattachée : adresse et libellés recalculés depuis les référentiels', () => {
  const { resultat, erreurs } = appliquer(
    { location: 'saisie ignorée', localisationId: 'assinie-mafia', localisationPrecision: 'Km 9', badgeId: 'famille-amis', badge: 'x', category: 'evenement', categoryLabel: 'x', status: 'sur-demande', equipements: ['wifi', 'wifi', 'piscine'] },
    { avecCategorie: true, avecStatutVilla: true, avecLocalisation: true, avecEquipements: true });
  assert.deepEqual(erreurs, []);
  assert.equal(resultat.location, 'Assinie-Mafia, Km 9');
  assert.equal(resultat.badge, 'Famille & Amis');
  assert.equal(resultat.categoryLabel, 'Grands Groupes & Événements');
  assert.deepEqual(resultat.equipements, ['wifi', 'piscine']);
});

test('fiche antérieure aux référentiels (publiée par un ancien studio) : rien ne se perd', () => {
  const { resultat, erreurs } = appliquer(
    { location: 'Assinie, Km 6', badge: 'Spécial Couple', category: 'romantique', status: 'disponible' },
    { avecCategorie: true, avecStatutVilla: true, avecLocalisation: true, avecEquipements: true });
  assert.deepEqual(erreurs, []);
  assert.equal(resultat.location, 'Assinie, Km 6');
  assert.equal(resultat.badge, 'Spécial Couple');
});

test('badge retiré dans le studio : plus de badge, pas de retour de l’ancien texte', () => {
  const { resultat } = appliquer({ badgeId: '', badge: 'Coup de Cœur' }, {});
  assert.equal(resultat.badge, '');
});

test('références inconnues : une erreur explicite par champ', () => {
  const { erreurs } = appliquer(
    { localisationId: 'paris', badgeId: 'inconnu', category: 'chateau', status: 'loue', equipements: ['sauna'] },
    { avecCategorie: true, avecStatutVilla: true, avecLocalisation: true, avecEquipements: true });
  assert.equal(erreurs.length, 5);
});

test('routes du studio protégées par content:write, ordre compris', () => {
  for (const motif of [/\['GET', \/\^\\\/api\\\/admin\\\/referentiels\$\/, 'content:write'\]/,
    /\['POST', \/\^\\\/api\\\/admin\\\/referentiels\\\/\[a-z\]\+\$\/, 'content:write'\]/,
    /\['POST', \/\^\\\/api\\\/admin\\\/referentiels\\\/\[a-z\]\+\\\/ordre\$\/, 'content:write'\]/,
    /\['DELETE', \/\^\\\/api\\\/admin\\\/referentiels\\\/\[a-z\]\+\\\/\[\^\/\]\+\$\/, 'content:write'\]/]) {
    assert.match(server, motif);
  }
});

// --------------------------------------------------------------------------
// server.js : ordre (liste complète exigée)
// --------------------------------------------------------------------------
function ordonnerStore(existants, repo = null) {
  const debut = server.indexOf('  async ordonnerReferentiel(type, ids) {');
  const fin = server.indexOf('\n  },\n', debut) + 5;
  const disque = {};
  const contexte = vm.createContext({
    REF, REFERENTIELS_FILE: 'referentiels.json', databaseReady: false, databaseError: null,
    console: { error() {} }, text: (v, max) => String(v ?? '').slice(0, max),
    loadRepository: () => repo, writeJSON: (chemin, valeur) => { disque[chemin] = valeur; },
    erreurReferentielBase: () => 'base'
  });
  vm.runInContext(`this.store = {
    async lireReferentiels() { return REF.normaliserReferentiels({ categories: ${JSON.stringify(existants)} }); },
    ${server.slice(debut, fin)}
  };`, contexte);
  return { store: contexte.store, disque };
}

test('ordre : liste partielle ou périmée refusée (409)', async () => {
  const existants = [{ id: 'a', libelle: { fr: 'A' }, ordre: 1 }, { id: 'b', libelle: { fr: 'B' }, ordre: 2 }];
  const { store } = ordonnerStore(existants);
  assert.equal((await store.ordonnerReferentiel('categories', ['a'])).statut, 409);
  assert.equal((await store.ordonnerReferentiel('categories', ['a', 'a'])).statut, 409);
  assert.equal((await store.ordonnerReferentiel('categories', ['a', 'z'])).statut, 409);
  assert.equal((await store.ordonnerReferentiel('statuts', [])).statut, 400);
});

test('ordre, mode fichiers : rangs réécrits dans le miroir', async () => {
  const existants = [{ id: 'a', libelle: { fr: 'A' }, ordre: 1 }, { id: 'b', libelle: { fr: 'B' }, ordre: 2 }];
  const { store, disque } = ordonnerStore(existants);
  const resultat = hote(await store.ordonnerReferentiel('categories', ['b', 'a']));
  assert.equal(resultat.statut, 200);
  assert.deepEqual(hote(disque['referentiels.json'].categories.map(entree => `${entree.id}:${entree.ordre}`)), ['b:1', 'a:2']);
});

// --------------------------------------------------------------------------
// js/app.js : filtre « Piscines Privées »
// --------------------------------------------------------------------------
test('« Piscines Privées » : case Piscine cochée OU mot « piscine » dans les détails', () => {
  const app = lire('js/app.js');
  const debut = app.indexOf('const TRANCHES_VOYAGEURS');
  const fin = app.indexOf('function initMultiFieldSearch()');
  const contexte = vm.createContext({ URLSearchParams, window: { location: { search: '' } }, T: cle => cle });
  vm.runInContext(`${app.slice(debut, fin)}\nthis.correspond = correspondRecherche;`, contexte);
  const criteres = { cat: 'piscine', location: 'all', budget: 'all', guests: 'all' };
  assert.equal(contexte.correspond({ category: 'lagune', features: [], equipements: ['piscine'] }, criteres), true);
  assert.equal(contexte.correspond({ category: 'lagune', features: ['Piscine à débordement'], equipements: [] }, criteres), true);
  assert.equal(contexte.correspond({ category: 'lagune', features: ['Jacuzzi'], equipements: ['jacuzzi'] }, criteres), false);
});
