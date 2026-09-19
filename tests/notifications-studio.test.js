// Notifications envoyées depuis le studio et carnet des propriétaires (19/09/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NS = require('../db/notifications-studio');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const abonne = (visiteur, telephone, jeton = '') => ({ visiteur, jeton, telephone, cleTelephone: NS.cleTelephone(telephone) });

test('numéros : même personne quel que soit le format (+225, 00225, 0…), trop court ignoré', () => {
  const cle = NS.cleTelephone('+225 07 11 22 33 44');
  assert.equal(cle, '11223344');
  assert.equal(NS.cleTelephone('00225 0711223344'), cle);
  assert.equal(NS.cleTelephone('07-11-22-33-44'), cle);
  assert.equal(NS.cleTelephone('1234'), '');
});

test('audiences : tous, employés (téléphone ou WhatsApp), propriétaires par type ou précis, demandeurs', () => {
  const abonnes = [abonne('app-employe-0000000001', '07 11 22 33 44'), abonne('app-proprio-0000000002', '0599887766', 'ExponentPushToken[abcdefghijklm]'), abonne('app-anonyme-0000000003', ''), abonne('app-client-00000000004', '0505050505')];
  const contexte = {
    abonnes,
    employes: [{ nom: 'Koné', prenom: 'Awa', telephone: '+225 0711223344', email: 'awa@exemple.ci', actif: true }, { nom: 'Ancien', telephone: '0505050505', actif: false }],
    proprietaires: [{ id: 'p1', nom: 'Diallo', whatsapp: '00225 05 99 88 77 66', email: '', actif: true, annonces: [{ kind: 'vehicle', id: 'prado' }] }],
    leads: [{ id: 'l1', name: 'Client', phone: '05 05 05 05 05', email: 'client@exemple.ci', whatsappOptIn: false }, { id: 'l2', name: 'Opt', phone: '', email: 'opt@exemple.ci', whatsappOptIn: true }],
    jetonsDemandes: {}
  };
  const visés = audience => NS.destinataires(audience, contexte).abonnes.map(a => a.visiteur);
  assert.equal(visés({ cible: 'tous', type: 'tous' }).length, 4);
  assert.deepEqual(visés({ cible: 'employes', type: 'tous' }), ['app-employe-0000000001'], 'employé inactif exclu');
  assert.deepEqual(visés({ cible: 'proprietaires', type: 'vehicle' }), ['app-proprio-0000000002']);
  assert.deepEqual(visés({ cible: 'proprietaires', type: 'villa' }), []);
  assert.deepEqual(visés({ cible: 'proprietaires', type: 'tous', proprietaireId: 'p1' }), ['app-proprio-0000000002']);
  assert.deepEqual(visés({ cible: 'demandeurs', type: 'tous' }), ['app-client-00000000004']);
  assert.deepEqual(NS.destinataires({ cible: 'employes', type: 'tous' }, contexte).emails.map(e => e.email), ['awa@exemple.ci']);
  assert.deepEqual(NS.destinataires({ cible: 'demandeurs', type: 'tous' }, contexte).emails.map(e => e.email), ['opt@exemple.ci'], 'e-mail aux demandeurs : seulement avec accord');
  // Demandeur sans numéro de profil retrouvé par le jeton de sa demande envoyée depuis l'app.
  const parJeton = NS.destinataires({ cible: 'demandeurs', type: 'tous' }, { ...contexte, jetonsDemandes: { l2: 'ExponentPushToken[abcdefghijklm]' } }).abonnes.map(a => a.visiteur);
  assert.ok(parJeton.includes('app-proprio-0000000002'));
});

test('validation : message (titre, corps, audience) et abonné', () => {
  assert.deepEqual(NS.validerMessage({ titre: '', corps: '', audience: {} }).erreurs.length, 3);
  const { message } = NS.validerMessage({ titre: 'T', corps: 'C', audience: { cible: 'proprietaires', type: 'vehicle' }, email: true });
  assert.deepEqual(message.audience, { cible: 'proprietaires', type: 'vehicle', proprietaireId: '' });
  assert.equal(NS.validerMessage({ titre: 'T', corps: 'C', audience: { cible: 'tous' }, email: true }).message.email, false, 'pas d’e-mail à « tous »');
  assert.equal(NS.validerAbonne({ visiteur: 'court' }).erreur, 'Téléphone non identifié.');
  const { abonne: a } = NS.validerAbonne({ visiteur: 'app-abcdefghijklmnop', jeton: 'pas-un-jeton', telephone: '+225 07 11 22 33 44', langue: 'es-ES' });
  assert.deepEqual([a.jeton, a.cleTelephone, a.langue], ['', '11223344', 'es']);
});

test('relève de l’app : seulement ses messages, après la date donnée, 20 au plus', () => {
  const messages = [
    { id: 'm1', titre: 'A', corps: 'a', destinataires: ['app-1111111111111111'], creeLe: '2026-09-19T10:00:00Z' },
    { id: 'm2', titre: 'B', corps: 'b', destinataires: ['app-2222222222222222'], creeLe: '2026-09-19T11:00:00Z' },
    { id: 'm3', titre: 'C', corps: 'c', destinataires: ['app-1111111111111111'], creeLe: '2026-09-19T12:00:00Z' }
  ];
  assert.deepEqual(NS.messagesPour('app-1111111111111111', messages).map(m => m.id), ['m3', 'm1']);
  assert.deepEqual(NS.messagesPour('app-1111111111111111', messages, '2026-09-19T11:00:00Z').map(m => m.id), ['m3']);
  assert.deepEqual(Object.keys(NS.messagesPour('app-1111111111111111', messages)[0]).sort(), ['corps', 'id', 'le', 'titre'], 'ni audience ni destinataires exposés');
});

test('serveur et studio : routes protégées, permission dédiée, relève publique, migration', () => {
  const server = lire('server.js');
  assert.match(server, /\['GET', \/\^\\\/api\\\/admin\\\/notifications\$\/, 'notifications:manage'\]/);
  assert.doesNotMatch(server, /\/api\/admin\/proprietaires/, 'plus de carnet saisi à part : les propriétaires viennent des fiches');
  assert.match(server, /url\.pathname === '\/api\/app\/abonnement'/);
  assert.match(server, /url\.pathname === '\/api\/app\/messages'/);
  const auth = require('../db/auth-store');
  assert.ok(auth.TOUTES_PERMISSIONS.includes('notifications:manage'));
  const admin = lire('admin.html');
  assert.match(admin, /data-view="messages" data-permission="leads:read notifications:manage"/);
  assert.match(admin, /data-messages-aller="proprietaires"/);
  const migration = lire('db/migration-notifications-contacts.sql');
  for (const table of ['proprietaires', 'app_abonnes', 'app_messages']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS \`${table}\``));
  assert.match(migration, /ADD COLUMN IF NOT EXISTS `prenom`/);
  assert.doesNotMatch(migration, /^\s*(SELECT|SHOW|DROP|TRUNCATE|DELETE)/im, 'import sans requête de contrôle ni suppression');
  const colonnes = [...migration.matchAll(/^\s+`([a-z_]+)`\s/gm)].map(m => m[1]);
  const code = lire('db/notifications-studio.js');
  for (const [table] of [['app_abonnes'], ['app_messages']]) {
    const insert = code.match(new RegExp(`INSERT INTO ${table} \\(([^)]+)\\)`))[1].split(',').map(c => c.trim());
    for (const c of insert) assert.ok(colonnes.includes(c), `${table}.${c}`);
  }
});

test('app : inscription avec le numéro du profil, relève dans la veille, écran Messages reçus', () => {
  const abonnement = lire('mobile/natif/src/donnees/abonnement.ts');
  assert.match(abonnement, /\/api\/app\/abonnement/);
  assert.match(abonnement, /telephone: profil\.tel/);
  const veille = lire('mobile/natif/src/donnees/veille.ts');
  assert.match(veille, /\/api\/app\/messages\?visiteur=/);
  assert.match(lire('mobile/natif/src/app/profil.tsx'), /t\('profil\.mentionNumero'\)/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'mobile/natif/src/app/messages.tsx')));
});

// --- Propriétaire du bien dans la fiche de l'annonce (précision du 19/09/2026) ---
const FICHES = require('../db/fiches');

test('propriétaire du bien : nettoyé à la saisie, null si vide, retiré de ce que voient les visiteurs', () => {
  assert.deepEqual(FICHES.proprietaireAnnonce({ nom: ' Diallo ', prenom: 'Moussa', telephone: '07  11 22 33 44', whatsapp: '', pirate: 'x' }),
    { nom: 'Diallo', prenom: 'Moussa', telephone: '07 11 22 33 44', whatsapp: '' });
  assert.equal(FICHES.proprietaireAnnonce({ nom: '  ' }), null);
  assert.equal(FICHES.proprietaireAnnonce(null), null);
  assert.deepEqual(FICHES.sansProprietaire({ id: 'v1', name: 'Villa', proprietaire: { nom: 'Diallo' } }), { id: 'v1', name: 'Villa' });
  const server = lire('server.js');
  assert.match(server, /proprietaire: FICHES\.proprietaireAnnonce\(item\.proprietaire\)/, 'nettoyé à la publication (toutes les annonces passent par gestionAnnonce)');
  assert.match(server, /filter\(item => SYNC\.etatAnnonce\(item\) === 'active'\)\.map\(FICHES\.sansProprietaire\)/, 'jamais dans /api/content');
});

test('propriétaires lus dans les annonces : regroupés par numéro, ciblage par type ou précis, annonces sans propriétaire', () => {
  const contenu = {
    villas: [{ id: 'v1', name: 'Villa A', proprietaire: { nom: 'Diallo', prenom: 'Moussa', telephone: '+225 07 11 22 33 44' } }, { id: 'v2', name: 'Villa B' }],
    vehicles: [{ id: 'c1', name: 'Prado', proprietaire: { nom: 'Diallo', whatsapp: '0711223344' } }],
    activities: [], terrains: [{ id: 't1', title: 'Lot 3', proprietaire: { nom: 'Kouamé' } }, { id: 't2', title: 'Lot 4', etat: 'archivee' }]
  };
  const proprietaires = NS.proprietairesDesAnnonces(contenu);
  assert.deepEqual(proprietaires.map(p => [p.id, p.annonces.map(a => a.id)]), [['p-11223344', ['v1', 'c1']], ['p-kouame', ['t1']]]);
  assert.equal(proprietaires[0].whatsapp, '0711223344', 'coordonnées complétées d’une fiche à l’autre');
  assert.deepEqual(NS.annoncesSansProprietaire(contenu).map(a => a.id), ['v2'], 'annonce archivée ignorée');
  const abonnes = [abonne('app-proprio-0000000001', '07 11 22 33 44')];
  const vises = audience => NS.destinataires(audience, { abonnes, proprietaires }).abonnes.map(a => a.visiteur);
  assert.deepEqual(vises({ cible: 'proprietaires', type: 'vehicle', proprietaireId: '' }), ['app-proprio-0000000001']);
  assert.deepEqual(vises({ cible: 'proprietaires', type: 'terrain', proprietaireId: '' }), []);
  assert.deepEqual(vises({ cible: 'proprietaires', type: 'tous', proprietaireId: 'p-11223344' }), ['app-proprio-0000000001']);
  assert.equal(NS.libelleAudience({ cible: 'proprietaires', type: 'tous', proprietaireId: 'p-11223344' }, proprietaires), 'Propriétaire : Moussa Diallo');
});

test('stockage : colonne proprietaire (villas, terrains, activités) écrite par le dépôt, migration sans risque', () => {
  const migration = lire('db/migration-proprietaires-annonces.sql');
  for (const table of ['villas', 'terrains', 'activities']) {
    assert.match(migration, new RegExp(`ALTER TABLE \`${table}\`\\s+ADD COLUMN IF NOT EXISTS \`proprietaire\` JSON NULL`), table);
  }
  assert.doesNotMatch(migration, /^\s*(SELECT|SHOW|DROP|TRUNCATE|DELETE|UPDATE)/im);
  const depot = lire('db/repository.js');
  assert.equal((depot.match(/, proprietaire\)\n  VALUES/g) || []).length, 3, 'colonne écrite pour les trois tables');
  assert.equal((depot.match(/proprietaire: proprietaireDeLigne\(row\.proprietaire\)/g) || []).length, 3, 'colonne relue pour les trois tables');
  const schema = lire('db/schema.sql');
  assert.equal((schema.match(/^\s+`proprietaire`\s+JSON\s+NULL/gm) || []).length, 3);
  const migrate = lire('scripts/migrate.js');
  for (const table of ['villas', 'terrains', 'activities']) assert.ok(migrate.includes(`['${table}', 'proprietaire', 'JSON NULL AFTER \`facebook\`']`), table);
});

test('studio : bloc « Propriétaire du bien » dans l’éditeur des annonces, vue récapitulative dans Messages', () => {
  const admin = lire('js/admin.js');
  assert.match(admin, /<div class="editor-fields">\$\{fields\}\$\{blocProprietaire\}/);
  assert.match(admin, /item\.proprietaire = Object\.values\(proprietaireNettoye\)\.some\(Boolean\) \? proprietaireNettoye : null;/);
  assert.doesNotMatch(admin, /ouvrirProprietaire|\/api\/admin\/proprietaires/);
  assert.match(admin, /openEditor\(kind, reste\.join\('\|'\)\)/, 'un bien s’ouvre dans sa fiche');
});
