// Rôles et permissions administrables par cases à cocher (demande du 17/09/2026) :
// rôles prédéfinis modifiables, rôles créés au studio, permission vitale du propriétaire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Stockage fichier en mémoire : les essais n'écrivent jamais dans data/.
const fichiers = new Map();
const cheminStore = require.resolve('../db/json-store');
require.cache[cheminStore] = {
  id: cheminStore, filename: cheminStore, loaded: true,
  exports: {
    read: (nom, defaut) => (fichiers.has(nom) ? JSON.parse(fichiers.get(nom)) : defaut),
    write: (nom, valeur) => { fichiers.set(nom, JSON.stringify(valeur)); }
  }
};
const auth = require('../db/auth-store');

const racine = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(racine, 'server.js'), 'utf8');
const admin = fs.readFileSync(path.join(racine, 'js', 'admin.js'), 'utf8');

test('catalogue : chaque permission des rôles prédéfinis y figure, une seule fois', () => {
  assert.equal(new Set(auth.TOUTES_PERMISSIONS).size, auth.TOUTES_PERMISSIONS.length);
  for (const role of auth.ROLES) {
    for (const permission of auth.ROLE_PERMISSIONS[role]) assert.ok(auth.TOUTES_PERMISSIONS.includes(permission), permission);
  }
  assert.ok(auth.TOUTES_PERMISSIONS.includes(auth.PERMISSION_VITALE));
});

test('registre : rôles prédéfinis par défaut, modifications appliquées, permissions inconnues ignorées', () => {
  const defaut = auth.normaliserRoles([]);
  assert.deepEqual(defaut.map(role => role.code), ['proprietaire', 'editeur', 'commercial']);
  assert.ok(defaut.every(role => role.systeme));

  const roles = auth.normaliserRoles([
    { code: 'editeur', libelle: 'Rédacteur', description: '', permissions: '["content:read","root:all"]', ordre: 2 },
    { code: 'comptable', libelle: 'Comptable', permissions: ['compta:manage'], ordre: 4 },
    { code: 'commercial', supprime: 1 }
  ]);
  const editeur = roles.find(role => role.code === 'editeur');
  assert.deepEqual(editeur.permissions, ['content:read']);
  assert.equal(editeur.libelle, 'Rédacteur');
  assert.equal(editeur.description, auth.ROLE_DESCRIPTIONS.editeur, 'description vide : celle du rôle prédéfini');
  assert.equal(roles.find(role => role.code === 'comptable').systeme, false);
  assert.ok(roles.some(role => role.code === 'commercial'), 'un rôle prédéfini ne disparaît pas');
});

test('propriétaire : la gestion des accès ne peut pas lui être retirée', () => {
  const [proprietaire] = auth.normaliserRoles([{ code: 'proprietaire', libelle: 'Propriétaire', permissions: ['dashboard:view'], updated_at: new Date('2026-10-01T00:00:00Z') }]);
  assert.deepEqual(proprietaire.permissions, ['dashboard:view', auth.PERMISSION_VITALE]);
  const { role } = auth.validerRole({ libelle: 'Propriétaire', permissions: ['dashboard:view'] }, { existant: auth.listeRoles()[0] });
  assert.ok(role.permissions.includes(auth.PERMISSION_VITALE));
});

test('validation : nom requis, au moins une permission, pas de doublon, identifiant court sans accents', () => {
  assert.deepEqual(auth.validerRole({ libelle: '', permissions: ['dashboard:view'] }).erreurs, ['Le nom du rôle est requis.']);
  assert.deepEqual(auth.validerRole({ libelle: 'Agent', permissions: ['root:all'] }).erreurs, ['Cochez au moins une permission.']);
  assert.match(auth.validerRole({ libelle: 'Éditeur', permissions: ['content:read'] }).erreurs.join(), /existe déjà/);
  const { role } = auth.validerRole({ libelle: 'Agent d’accueil et réservations', permissions: ['leads:read'] });
  assert.equal(role.code, 'agent-d-accueil-et-r');
  assert.ok(role.code.length <= 20);
});

test('cycle complet : créer, appliquer aux droits, refuser la suppression tant qu’il est attribué, supprimer', async () => {
  const { role, erreurs } = auth.validerRole({ libelle: 'Comptable', permissions: ['dashboard:view', 'compta:manage'] });
  assert.deepEqual(erreurs, []);
  await auth.enregistrerRole(role);
  assert.ok(auth.roleExiste('comptable'));
  assert.deepEqual(auth.permissionsFor('comptable'), ['dashboard:view', 'compta:manage']);
  assert.ok(auth.can({ role: 'comptable' }, 'compta:manage'));
  assert.equal(auth.can({ role: 'comptable' }, 'users:manage'), false);

  // Le propriétaire perd la comptabilité : effet immédiat sur ses droits.
  const [proprietaire] = auth.listeRoles();
  const modifie = auth.validerRole({ libelle: proprietaire.libelle, description: proprietaire.description, permissions: proprietaire.permissions.filter(p => p !== 'compta:manage') }, { existant: proprietaire }).role;
  await auth.enregistrerRole(modifie);
  assert.equal(auth.can({ role: 'proprietaire' }, 'compta:manage'), false);

  await assert.rejects(auth.supprimerRole('editeur'), /Rôle prédéfini/);
  fichiers.set('users.json', JSON.stringify([{ id: 'u1', username: 'awa', role: 'comptable', active: true }]));
  await assert.rejects(auth.supprimerRole('comptable'), /attribué à 1 utilisateur/);
  fichiers.set('users.json', '[]');
  await auth.supprimerRole('comptable');
  assert.equal(auth.roleExiste('comptable'), false);
  assert.deepEqual(auth.permissionsFor('comptable'), []);
});

test('serveur : routes des rôles réservées à la gestion des utilisateurs, accès de secours complet', () => {
  assert.match(server, /\['POST', \/\^\\\/api\\\/admin\\\/roles\$\/, 'users:manage'\]/);
  assert.match(server, /\['DELETE', \/\^\\\/api\\\/admin\\\/roles\\\/\[\^\/\]\+\$\/, 'users:manage'\]/);
  const secours = server.slice(server.indexOf('const LEGACY_ACTOR = {'), server.indexOf('};', server.indexOf('const LEGACY_ACTOR = {')));
  assert.match(secours, /permissions: auth\.TOUTES_PERMISSIONS/);
  assert.match(server, /await auth\.actualiserRoles\(true\)\.catch/, 'registre lu au démarrage');
});

test('studio : cases à cocher par groupe, permission vitale verrouillée, une seule fiche ouverte', () => {
  const bloc = admin.slice(admin.indexOf('function ouvrirRole('), admin.indexOf('const PERMISSION_LABELS'));
  assert.match(bloc, /type="checkbox" name="permissions"/);
  assert.match(bloc, /data-tout-groupe/);
  assert.match(bloc, /verrou\(code\) \? 'disabled' : ''/);
  assert.ok(bloc.indexOf("$$('.role-editor-backdrop').forEach(ancienne => ancienne.remove())") < bloc.indexOf('insertAdjacentHTML'));
  assert.match(bloc, /const fond = document\.body\.lastElementChild;/);
});

test('studio : liste compacte par défaut, grille comparative à la demande, recherche au-delà de 6 rôles', () => {
  assert.match(admin, /let vueRoles = 'liste';/);
  assert.match(admin, /const SEUIL_RECHERCHE_ROLES = 6;/);
  const corps = admin.slice(admin.indexOf('function renderCorpsRoles('), admin.indexOf('function ouvrirRole('));
  assert.match(corps, /vueRoles === 'liste'/);
  assert.match(corps, /class="roles-puce \$\{partiel \? 'partiel' : ''\}"/, 'groupes accordés en puces, partiels signalés');
  assert.match(corps, /<table class="roles-table">/);
  // La saisie ne redessine que le corps : le champ de recherche garde le focus.
  assert.match(admin, /data-roles-recherche\]', hote\)\?\.addEventListener\('input', event => \{ rechercheRoles = event\.target\.value; renderCorpsRoles\(\); \}\)/);
});

test('grille : colonne des permissions de largeur fixe et défilement aimanté, aucun rôle à moitié caché', () => {
  const css = fs.readFileSync(path.join(racine, 'css', 'admin.css'), 'utf8');
  assert.match(css, /\.roles-table-cadre \{ scroll-snap-type:x mandatory; scroll-padding-left:170px; \}/);
  assert.match(css, /width:170px; min-width:170px; max-width:170px;/);
  assert.match(css, /\.roles-table-cadre \{ scroll-padding-left:128px; \}\s*\.roles-table tbody th, \.roles-table thead th:first-child \{ width:128px; min-width:128px; max-width:128px;/);
});

test('permissions nouvelles : accordées aux rôles prédéfinis enregistrés avant leur arrivée, choix ultérieur respecté', () => {
  const avant = auth.normaliserRoles([{ code: 'proprietaire', libelle: 'Propriétaire', permissions: ['dashboard:view', 'users:manage'], updated_at: new Date('2026-09-18T10:00:00Z') }]);
  const p = avant.find(r => r.code === 'proprietaire').permissions;
  assert.ok(p.includes('location:manage') && p.includes('notifications:manage'), 'rubriques nouvelles visibles du propriétaire');
  const apres = auth.normaliserRoles([{ code: 'proprietaire', libelle: 'Propriétaire', permissions: ['dashboard:view', 'users:manage'], updated_at: '2026-10-02 09:00:00' }]);
  assert.ok(!apres.find(r => r.code === 'proprietaire').permissions.includes('notifications:manage'), 'décochée après son arrivée : reste décochée');
  const editeur = auth.normaliserRoles([{ code: 'editeur', libelle: 'Éditeur', permissions: ['content:read'] }]).find(r => r.code === 'editeur');
  assert.deepEqual(editeur.permissions, ['content:read'], 'pas de permission que le rôle n’a pas par défaut');
  const cree = auth.normaliserRoles([{ code: 'agent', libelle: 'Agent', permissions: ['leads:read'] }]).find(r => r.code === 'agent');
  assert.deepEqual(cree.permissions, ['leads:read'], 'rôle créé au studio : inchangé');
});
