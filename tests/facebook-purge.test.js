// Publications supprimées sur la Page.
//
// La fusion ne faisait qu'ajouter : une publication retirée de Facebook
// restait affichée sur le site indéfiniment. Constaté le 12/09/2026 en
// voulant retirer deux publications de test.
//
// La purge doit rester prudente : Graph ne renvoie que les vingt plus
// récentes, on ne peut donc pas supprimer tout ce qui manque à l'appel.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

// Les tableaux nés dans le contexte vm ont un autre Array.prototype : on les
// ramène dans le realm de l hote avec un spread, sinon deepStrictEqual echoue
// sur cette seule difference d identite.
function fusion() {
  const debut = server.indexOf('function mergeFacebookPosts(');
  const fin = server.indexOf('\n}\n', debut) + 3;
  assert.ok(debut > 0 && fin > debut, 'mergeFacebookPosts introuvable');
  const contexte = vm.createContext({
    Date, Number, Set, Map,
    text: (v, max) => String(v ?? '').slice(0, max),
    normalizeFacebookPost: post => ({
      id: String(post?.id || ''),
      message: post?.message || '',
      created_time: post?.created_time || '',
      permalink_url: '',
      full_picture: '',
      images: []
    })
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.fusionner = mergeFacebookPosts;', contexte);
  return contexte.fusionner;
}

const pub = (id, jour) => ({ id, message: `publication ${id}`, created_time: `2026-09-${String(jour).padStart(2, '0')}T10:00:00+0000` });

test('une publication retirée de la Page disparaît du site', () => {
  const fusionner = fusion();
  const stockees = [pub('a', 12), pub('b', 11), pub('c', 10)];
  // Graph ne renvoie plus « b » : elle a été supprimée sur la Page.
  const resultat = fusionner([pub('a', 12), pub('c', 10)], stockees);
  assert.deepEqual([...resultat].map(p => p.id), ['a', 'c']);
  assert.equal(resultat.removed, 1);
});

test('les publications plus anciennes que la fenêtre reçue sont préservées', () => {
  const fusionner = fusion();
  // Graph ne rapporte que les deux plus récentes ; « vieille » date d'avant.
  const stockees = [pub('a', 12), pub('b', 11), pub('vieille', 1)];
  const resultat = fusionner([pub('a', 12), pub('b', 11)], stockees);
  assert.deepEqual([...resultat].map(p => p.id), ['a', 'b', 'vieille'],
    'la pagination de Graph ne doit pas être prise pour une suppression');
  assert.equal(resultat.removed, 0);
});

test('réponse vide : aucune purge, on ne vide pas le site sur un incident', () => {
  const fusionner = fusion();
  const stockees = [pub('a', 12), pub('b', 11)];
  const resultat = fusionner([], stockees);
  assert.deepEqual([...resultat].map(p => p.id), ['a', 'b']);
  assert.equal(resultat.removed, 0);
});

test('une publication sans date connue est conservée', () => {
  const fusionner = fusion();
  const sansDate = { id: 'mystere', message: 'sans date' };
  const resultat = fusionner([pub('a', 12)], [pub('a', 12), sansDate]);
  assert.ok(resultat.some(p => p.id === 'mystere'), 'dans le doute, on garde');
});

test('la publication la plus ancienne de la réponse reste dans la fenêtre', () => {
  const fusionner = fusion();
  // « c » borne la fenêtre : elle est reçue, donc conservée ; « b », de la
  // même fenêtre mais absente, part.
  const resultat = fusionner([pub('a', 12), pub('c', 10)], [pub('a', 12), pub('b', 11), pub('c', 10)]);
  assert.deepEqual([...resultat].map(p => p.id), ['a', 'c']);
});

test('l’ordre reste antéchronologique après purge', () => {
  const fusionner = fusion();
  const resultat = fusionner([pub('recent', 12), pub('ancien', 5)], [pub('ancien', 5), pub('recent', 12)]);
  assert.deepEqual([...resultat].map(p => p.id), ['recent', 'ancien']);
});
