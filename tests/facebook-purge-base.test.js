// Purge des publications supprimées, côté base de données.
//
// La fusion côté fichier ne suffisait pas : `upsertFacebookPosts` n'insère et
// ne met à jour que. Constaté le 12/09/2026 — le miroir JSON ne contenait plus
// les publications retirées de la Page, mais la base les gardait, et le site,
// qui lit la base, continuait de les afficher.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const repository = fs.readFileSync(path.join(root, 'db', 'repository.js'), 'utf8');

// Les tableaux nes dans le contexte vm ont un autre Array.prototype : on les
// ramene dans le realm de l hote avec un spread avant toute comparaison.
/** Isole pruneFacebookPosts avec un faux moteur SQL qui enregistre la requête. */
function purge() {
  const debut = repository.indexOf('async function pruneFacebookPosts(');
  const fin = repository.indexOf('\n}\n', debut) + 3;
  assert.ok(debut > 0 && fin > debut, 'pruneFacebookPosts introuvable');

  const requetes = [];
  const contexte = vm.createContext({
    Date, Number, Math, String,
    query: async (sql, params) => {
      requetes.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return [{ affectedRows: 2 }];
    },
    // Reproduction fidèle : la vraie fonction rend « YYYY-MM-DD HH:MM:SS ».
    toMysqlDate: valeur => {
      const d = new Date(valeur);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
    }
  });
  vm.runInContext(repository.slice(debut, fin) + '\nthis.purger = pruneFacebookPosts;', contexte);
  return { purger: contexte.purger, requetes };
}

const pub = (id, jour) => ({ id, created_time: `2026-09-${String(jour).padStart(2, '0')}T10:00:00Z` });

test('la suppression est bornée à la fenêtre reçue', async () => {
  const p = purge();
  await p.purger([pub('a', 12), pub('b', 10)]);

  assert.equal(p.requetes.length, 1);
  const { sql, params } = p.requetes[0];
  assert.match(sql, /^DELETE FROM facebook_posts WHERE created_time >= \? AND id NOT IN \(\?,\?\)$/,
    'sans la borne temporelle, la pagination de Graph effacerait les archives');
  assert.match(params[0], /^2026-09-10 10:00:00$/, 'la borne est la publication la plus ancienne reçue');
  assert.deepEqual([...params].slice(1), ['a', 'b']);
});

test('les identifiants passent en paramètres, jamais concaténés', async () => {
  const p = purge();
  await p.purger([{ id: "x'; DROP TABLE facebook_posts; --", created_time: '2026-09-12T10:00:00Z' }]);
  const { sql, params } = p.requetes[0];
  assert.doesNotMatch(sql, /DROP TABLE/, 'l’identifiant ne doit jamais entrer dans le SQL');
  assert.ok(params.includes("x'; DROP TABLE facebook_posts; --"));
});

test('aucune publication reçue : on ne touche pas à la base', async () => {
  const p = purge();
  const retirees = await p.purger([]);
  assert.equal(retirees, 0);
  assert.equal(p.requetes.length, 0, 'un incident réseau ne doit jamais vider la table');
});

test('des publications sans date : aucune borne calculable, donc aucune purge', async () => {
  const p = purge();
  const retirees = await p.purger([{ id: 'a' }, { id: 'b' }]);
  assert.equal(retirees, 0);
  assert.equal(p.requetes.length, 0);
});

test('le nombre de lignes retirées est remonté', async () => {
  const p = purge();
  assert.equal(await p.purger([pub('a', 12)]), 2);
});

test('une seule publication : la borne est sa propre date', async () => {
  const p = purge();
  await p.purger([pub('seule', 7)]);
  assert.match(p.requetes[0].params[0], /^2026-09-07 /);
  assert.deepEqual([...p.requetes[0].params].slice(1), ['seule']);
});
