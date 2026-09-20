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
  // Titre d'au moins trois caractères (20/09/2026) : une notification au titre
  // d'une lettre n'est lisible sur aucun écran verrouillé.
  assert.match(NS.validerMessage({ titre: 'T', corps: 'C', audience: { cible: 'tous' } }).erreurs.join(' '), /au moins 3 caractères/);
  const { message } = NS.validerMessage({ titre: 'Titre', corps: 'C', audience: { cible: 'proprietaires', type: 'vehicle' }, email: true });
  assert.deepEqual(message.audience, { cible: 'proprietaires', type: 'vehicle', proprietaireId: '', personneId: '' });
  // Une personne précise : demandeur ou employé visé nommément (20/09/2026).
  const unSeul = NS.validerMessage({ titre: 'Titre', corps: 'C', audience: { cible: 'demandeurs', personneId: 'lead-7' } }).message;
  assert.equal(unSeul.audience.personneId, 'lead-7');
  assert.equal(NS.validerMessage({ titre: 'Titre', corps: 'C', audience: { cible: 'tous', personneId: 'lead-7' } }).message.audience.personneId, '', 'sans objet pour « tous »');
  assert.match(NS.libelleAudience({ cible: 'demandeurs', personneId: 'lead-7' }), /Un demandeur/);
  // Écran ouvert au clic : « messages » par défaut, valeur inconnue ignorée.
  assert.equal(message.ecran, 'messages');
  assert.equal(NS.validerMessage({ titre: 'Titre', corps: 'C', ecran: 'devis', audience: { cible: 'tous' } }).message.ecran, 'devis');
  assert.equal(NS.validerMessage({ titre: 'Titre', corps: 'C', ecran: 'pirate', audience: { cible: 'tous' } }).message.ecran, 'messages');
  assert.equal(NS.validerMessage({ titre: 'Titre', corps: 'C', audience: { cible: 'tous' }, email: true }).message.email, false, 'pas d’e-mail à « tous »');
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
  // Profil des utilisateurs de l'app (20/09/2026) : deux colonnes de plus.
  const profil = lire('db/migration-app-abonnes-profil.sql');
  assert.match(profil, /ALTER TABLE `app_abonnes`/);
  for (const c of ['email', 'notifications']) assert.match(profil, new RegExp(`ADD COLUMN IF NOT EXISTS \`${c}\``));
  assert.doesNotMatch(profil, /^\s*(DROP|TRUNCATE|DELETE)/im, 'aucune suppression');
  // Écran ouvert au clic (20/09/2026) : une colonne de plus sur app_messages.
  const ecran = lire('db/migration-notifications-ecran.sql');
  assert.match(ecran, /ALTER TABLE `app_messages`/);
  assert.ok(ecran.includes('ADD COLUMN IF NOT EXISTS `ecran`'), 'migration re-jouable');
  assert.doesNotMatch(ecran, /^s*(DROP|TRUNCATE|DELETE)/im, 'aucune suppression');
  const sql = `${migration}\n${profil}
${ecran}`;
  const colonnes = [...sql.matchAll(/^\s+`([a-z_]+)`\s/gm), ...sql.matchAll(/ADD COLUMN IF NOT EXISTS `([a-z_]+)`/g)].map(m => m[1]);
  const code = lire('db/notifications-studio.js');
  for (const [table] of [['app_abonnes'], ['app_messages']]) {
    const insert = code.match(new RegExp(`INSERT INTO ${table} \\(([^)]+)\\)`))[1].split(',').map(c => c.trim());
    for (const c of insert) assert.ok(colonnes.includes(c), `${table}.${c}`);
  }
});

// --- Utilisateurs de l'app administrés dans le studio (20/09/2026) ---------
test('utilisateurs de l’app : profil enregistré même sans notifications, liste et retrait dans le studio', () => {
  // Une personne qui renseigne son numéro pour être rappelée, sans jeton ni alertes.
  const { abonne } = NS.validerAbonne({
    visiteur: 'app-2222222222222222', telephone: '07 07 07 07 07', nom: 'Aya Kouassi',
    email: 'aya@example.com', notifications: false, plateforme: 'android'
  });
  assert.equal(abonne.email, 'aya@example.com');
  assert.equal(abonne.notifications, false);
  assert.equal(abonne.jeton, '', 'aucun jeton sans notifications');
  assert.equal(abonne.cleTelephone, '07070707', 'rapprochement possible avec ses demandes');
  // E-mail invalide : ignoré plutôt que stocké tel quel.
  assert.equal(NS.validerAbonne({ visiteur: 'app-2222222222222222', email: 'pas-une-adresse' }).abonne.email, '');
  // Sans mention : l'ancien comportement (inscrit = notifications actives) tient.
  assert.equal(NS.validerAbonne({ visiteur: 'app-2222222222222222', jeton: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' }).abonne.notifications, true);

  const server = lire('server.js');
  assert.match(server, /\['DELETE', \/\^\\\/api\\\/admin\\\/notifications\\\/abonnes\\\/\[\^\/\]\+\$\/, 'notifications:manage'\]/);
  assert.match(server, /utilisateurs: donnees\.abonnes/, 'la liste part au studio');
  assert.match(server, /joignable: Boolean\(a\.jeton\)/, 'le jeton d’envoi reste interne');
  // Menu à part entière dans la barre latérale, plus une section de Communication (20/09/2026).
  const admin = lire('admin.html');
  assert.match(admin, /data-view="appUtilisateurs" data-permission="notifications:manage"/);
  assert.match(admin, /<section class="admin-view" data-panel="appUtilisateurs">/);
  assert.doesNotMatch(admin, /data-messages-aller="utilisateurs"/, 'plus de doublon sous Communication');
  const studio = lire('js/admin.js');
  assert.match(studio, /function renderUtilisateursApp\(\)/);
  assert.match(studio, /\/api\/admin\/notifications\/abonnes\//);
  // L'app envoie le profil même notifications coupées, et ne l'efface pas en les coupant.
  const abonnement = lire('mobile/natif/src/donnees/abonnement.ts');
  assert.match(abonnement, /email: profil\.email/);
  assert.match(abonnement, /notifications,/);
  assert.match(abonnement, /export async function profilRenseigne\(\)/);
  assert.match(lire('mobile/natif/src/donnees/notifications.ts'), /if \(await profilRenseigne\(\)\) await synchroniserAbonnement/);
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

// --- Historique : renvoyer et supprimer un envoi (20/09/2026) --------------
test('historique : l’écran choisi est mémorisé, l’envoi se reprend et se supprime', async () => {
  const fichier = path.join(__dirname, '..', 'data', NS.FICHIER);
  const avant = fs.existsSync(fichier) ? fs.readFileSync(fichier) : null;
  try {
    // Sans base : le module écrit dans data/notifications-studio.json.
    const message = {
      id: 'test-historique-0001', titre: 'Essai', corps: 'Message d’essai', ecran: 'explorer',
      audience: { cible: 'tous', type: 'tous', proprietaireId: '', personneId: '' },
      destinataires: [], bilan: { telephones: 0 }, creePar: 'test', creeLe: new Date().toISOString()
    };
    await NS.enregistrerMessage(message);
    const garde = (await NS.tout()).messages.find(m => m.id === message.id);
    assert.ok(garde, 'l’envoi est dans l’historique');
    assert.equal(garde.ecran, 'explorer', 'l’écran ouvert au clic est mémorisé pour le renvoi');
    assert.equal(garde.audience.cible, 'tous', 'l’audience se relit telle qu’elle a été choisie');

    assert.equal(await NS.supprimerMessage(message.id), 1);
    assert.equal((await NS.tout()).messages.some(m => m.id === message.id), false);
    assert.equal(await NS.supprimerMessage(message.id), 0, 'supprimer deux fois ne casse rien');
  } finally {
    if (avant) fs.writeFileSync(fichier, avant); else if (fs.existsSync(fichier)) fs.unlinkSync(fichier);
  }
});

test('studio : l’écran choisi part avec la notification, boutons renvoyer et supprimer', () => {
  const server = lire('server.js');
  // L'écran choisi au studio n'arrivait pas jusqu'au message envoyé.
  assert.match(server, /ecran: saisie.ecran/);
  assert.match(server, /NS.supprimerMessage/);
  assert.ok(server.includes("'/api/admin/notifications/messages/'"), 'route de suppression d’un envoi');
  const admin = lire('js/admin.js');
  assert.match(admin, /data-notif-renvoyer/);
  assert.match(admin, /data-notif-supprimer/);
  assert.ok(admin.includes('/api/admin/notifications/messages/'), 'le studio appelle la route');
  const css = lire('css/admin.css');
  assert.ok(css.includes('.notif-renvoyer { background:var(--ink)'), 'renvoyer : bleu de l’application');
  assert.ok(css.includes('.notif-supprimer { background:var(--gold)'), 'supprimer : or');
});

// --- Simulateur : ouvrir la fiche de ce qui est choisi (20/09/2026) --------
test('simulateur : un lien ouvre la fiche de la résidence ou du véhicule choisi', () => {
  const devis = lire('devis.html');
  assert.match(devis, /id="simVillaFiche"/);
  assert.match(devis, /data-i18n="t.voir-la-fiche-de-la-residence"/);
  // Fermer la fiche ramène au simulateur, la sélection conservée (20/09/2026).
  assert.ok(lire('js/app.js').includes('residences.html?retour=devis#${encodeURIComponent(selectedVilla.id)}'));
  assert.ok(lire('js/devis-voiture.js').includes('voitures.html?retour=devis#${encodeURIComponent(v.id)}'));
  assert.ok(lire('js/app.js').includes('function retourAuDevis('), 'résidence : retour au devis à la fermeture');
  assert.ok(lire('js/voitures.js').includes('function retourAuDevis('), 'véhicule : retour au devis à la fermeture');
  assert.ok(lire('js/app.js').includes('retourAuDevis("villa"'), 'la résidence revient choisie');
  assert.ok(lire('js/voitures.js').includes('devis.html?voiture=${encodeURIComponent(id)}'), 'le véhicule revient choisi');
  assert.ok(!/id="simVillaFiche"[^>]*target=/.test(devis), 'même onglet : sinon la fermeture ne ramène nulle part');
  // Toute la saisie survit à l'aller-retour (20/09/2026).
  const app = lire('js/app.js');
  assert.ok(app.includes('window.DevisSaisie'), 'la saisie du devis est mise de côté');
  assert.ok(app.includes('function memoriserSaisieDevis('), 'mise de côté au clic sur la fiche');
  assert.ok(app.includes('function reprendreSaisieDevis('), 'reprise au retour');
  assert.ok(app.includes('input[type=checkbox][data-addon-index]'), 'les activités cochées aussi');
  assert.ok(app.includes('sessionStorage'), 'rien ne survit à la fermeture de l’onglet');
  assert.ok(app.includes('&reprise=1'), 'le retour demande la reprise');
  assert.ok(lire('js/voitures.js').includes('&reprise=1'), 'le retour du véhicule aussi');
  assert.ok(lire('js/devis-voiture.js').includes('memoire()'), 'la voiture garde sa propre saisie');
  assert.ok(lire('js/devis-voiture.js').includes('reprendre(memoire)'), 'et la reprend');
  const i18n = lire('js/i18n.js');
  assert.equal((i18n.match(/"t.voir-la-fiche-de-la-residence"/g) || []).length, 3, 'traduit en français, anglais et espagnol');
});
