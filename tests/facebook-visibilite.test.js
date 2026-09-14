// Choix d'afficher ou non une publication sur le site.
//
// Demande du 12/09/2026. Une publication retirée depuis le studio reste sur la
// Page Facebook et dans le studio : seule sa présence sur le site public est
// en jeu. Le stockage est un simple fichier, pour n'exiger aucune migration de
// schéma en production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

/** Isole les deux fonctions de visibilité avec un fichier en mémoire. */
function visibilite(etatInitial = {}) {
  const debut = server.indexOf('function publicationsMasquees()');
  const fin = server.indexOf('\n}\n', server.indexOf('function definirVisibilitePublication(')) + 3;
  assert.ok(debut > 0 && fin > debut, 'fonctions de visibilité introuvables');

  let fichier = structuredClone(etatInitial);
  const contexte = vm.createContext({
    FB_MASQUEES_FILE: 'masquees.json',
    Set, Array, Date,
    readJSON: () => structuredClone(fichier),
    writeJSON: (chemin, valeur) => { fichier = structuredClone(valeur); },
    text: (v, max) => String(v == null ? '' : v).trim().slice(0, max)
  });
  vm.runInContext(
    server.slice(debut, fin)
    + '\nthis.masquees = publicationsMasquees;\nthis.definir = definirVisibilitePublication;',
    contexte
  );
  return { masquees: contexte.masquees, definir: contexte.definir, fichier: () => fichier };
}

test('au départ, aucune publication n’est masquée', () => {
  const v = visibilite();
  assert.equal(v.masquees().size, 0);
});

test('retirer une publication l’ajoute à la liste des masquées', () => {
  const v = visibilite();
  const resultat = v.definir('post_1', false);
  assert.equal(resultat.visible, false);
  assert.deepEqual([...v.fichier().ids], ['post_1']);
});

test('la remettre sur le site la retire de la liste', () => {
  const v = visibilite({ ids: ['post_1', 'post_2'] });
  const resultat = v.definir('post_1', true);
  assert.equal(resultat.visible, true);
  assert.deepEqual([...v.fichier().ids], ['post_2'], 'les autres choix ne bougent pas');
});

test('masquer deux fois la même publication ne crée pas de doublon', () => {
  const v = visibilite();
  v.definir('post_1', false);
  v.definir('post_1', false);
  assert.deepEqual([...v.fichier().ids], ['post_1']);
});

test('afficher une publication qui n’a jamais été masquée ne change rien', () => {
  const v = visibilite({ ids: ['autre'] });
  const resultat = v.definir('jamais-masquee', true);
  assert.equal(resultat.visible, true);
  assert.deepEqual([...v.fichier().ids], ['autre']);
});

test('un identifiant vide est refusé plutôt que silencieusement ignoré', () => {
  const v = visibilite();
  assert.throws(() => v.definir('', false), /Identifiant/);
  assert.throws(() => v.definir(null, false), /Identifiant/);
});

test('un fichier absent ou abîmé ne fait pas tomber la lecture', () => {
  assert.equal(visibilite({}).masquees().size, 0);
  assert.equal(visibilite({ ids: 'pas-un-tableau' }).masquees().size, 0);
  assert.equal(visibilite({ autre: 1 }).masquees().size, 0);
});

test('les identifiants sont comparés comme des chaînes', () => {
  const v = visibilite({ ids: [12345] });
  assert.ok(v.masquees().has('12345'), 'un identifiant numérique doit être reconnu');
});

test('l’horodatage du dernier choix est conservé', () => {
  const v = visibilite();
  v.definir('post_1', false);
  assert.match(v.fichier().updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
