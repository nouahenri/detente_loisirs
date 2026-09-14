// Notifications de l'application mobile (14/09/2026) : nouveautés et suivi de demande.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const NOTIF = require(path.join(root, 'db', 'notifications-app.js'));
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');

const JETON = 'ExponentPushToken[abcdefghij1234567890]';
const JETON_2 = 'ExpoPushToken[zyxwvutsrq0987654321]';
const MAINTENANT = Date.parse('2026-09-14T12:00:00Z');

const CONTENU = {
  villas: [{ id: 'villa-oasis', name: "Villa L'Oasis", visible: true }, { id: 'villa-masquee', name: 'Cachée', visible: false }],
  terrains: [{ id: 't1', title: 'Parcelle lagune', status: 'disponible' }, { id: 't2', title: 'Vendu', status: 'vendu' }],
  activities: [{ id: 'balade-bateau', title: 'Balade en bateau' }],
  facebookPosts: [
    { id: 'p-recente', message: 'Nouvelle villa\nà Assinie', created_time: '2026-09-13T10:00:00Z' },
    { id: 'p-ancienne', message: 'Vieille publication', created_time: '2026-08-01T10:00:00Z' },
    { id: 'p-du-site', message: 'Partagée depuis le site', created_time: '2026-09-14T10:00:00Z' }
  ]
};

test('jetons : seuls les jetons Expo sont acceptés', () => {
  assert.equal(NOTIF.estJetonExpo(JETON), true);
  assert.equal(NOTIF.estJetonExpo(JETON_2), true);
  assert.equal(NOTIF.estJetonExpo('bonjour'), false);
  assert.equal(NOTIF.estJetonExpo('ExponentPushToken[<script>]'), false);
});

test('inscription : langue normalisée, date d’inscription conservée, jeton invalide refusé', () => {
  const premier = NOTIF.enregistrerAppareil({}, { jeton: JETON, plateforme: 'android', langue: 'en-US' }, '2026-09-14T10:00:00Z');
  assert.equal(premier.erreur, null);
  assert.deepEqual(premier.registre.appareils[JETON], { plateforme: 'android', langue: 'en', inscritLe: '2026-09-14T10:00:00Z', vuLe: '2026-09-14T10:00:00Z' });
  const second = NOTIF.enregistrerAppareil(premier.registre, { jeton: JETON, plateforme: 'android', langue: 'de' }, '2026-09-15T10:00:00Z');
  assert.equal(second.registre.appareils[JETON].inscritLe, '2026-09-14T10:00:00Z');
  assert.equal(second.registre.appareils[JETON].langue, 'fr', 'langue inconnue → français');
  assert.ok(NOTIF.enregistrerAppareil({}, { jeton: 'faux' }).erreur);
  assert.deepEqual(NOTIF.retirerAppareils(second.registre, JETON).appareils, {});
});

test('annonces : mêmes filtres que le site, publications du site exclues', () => {
  const annonces = NOTIF.annoncesPubliques(CONTENU, { publicationsExclues: new Set(['p-du-site']), maintenant: MAINTENANT });
  assert.deepEqual(annonces.map(a => a.cle), ['villa:villa-oasis', 'terrain:t1', 'activite:balade-bateau', 'publication:p-recente', 'publication:p-ancienne']);
  assert.equal(annonces.find(a => a.id === 'p-recente').titre, 'Nouvelle villa');
});

test('nouveautés : amorçage silencieux, puis seules les annonces inconnues (publications récentes)', () => {
  const annonces = NOTIF.annoncesPubliques(CONTENU, { maintenant: MAINTENANT });
  const amorce = NOTIF.detecterNouveautes({}, annonces);
  assert.equal(amorce.nouvelles.length, 0, 'le premier passage n’envoie rien');
  assert.equal(amorce.etat.amorce, true);

  const plus = NOTIF.annoncesPubliques({
    ...CONTENU,
    villas: [...CONTENU.villas, { id: 'villa-neuve', name: 'Villa Neuve' }],
    facebookPosts: [...CONTENU.facebookPosts, { id: 'p-vieille-reimportee', message: 'Ancienne', created_time: '2026-07-01T00:00:00Z' }]
  }, { maintenant: MAINTENANT });
  const passage = NOTIF.detecterNouveautes(amorce.etat, plus);
  assert.deepEqual(passage.nouvelles.map(a => a.cle), ['villa:villa-neuve']);
  assert.equal(NOTIF.detecterNouveautes(passage.etat, plus).nouvelles.length, 0, 'jamais deux fois');
});

test('messages : une annonce ouvre sa fiche, plusieurs ouvrent Explorer, dans la langue du téléphone', () => {
  const une = NOTIF.messageNouveautes([{ type: 'villa', id: 'villa-neuve', titre: 'Villa Neuve' }], 'fr');
  assert.deepEqual(une, { title: 'Nouvelle résidence', body: 'Villa Neuve', data: { type: 'villa', id: 'villa-neuve' } });
  const deux = NOTIF.messageNouveautes([{ type: 'villa', id: 'a' }, { type: 'terrain', id: 'b' }], 'es');
  assert.equal(deux.title, '2 nuevos anuncios en Assinie');
  assert.deepEqual(deux.data, { ecran: 'explorer' });

  const registre = { appareils: { [JETON]: { langue: 'en' }, [JETON_2]: { langue: 'fr' } } };
  const lots = NOTIF.lotsNouveautes(registre, [{ type: 'terrain', id: 't9', titre: 'Plot' }]);
  assert.equal(lots.length, 1);
  assert.deepEqual(lots[0].map(m => [m.to, m.title]), [[JETON, 'New plot for sale'], [JETON_2, 'Nouveau terrain à vendre']]);
  assert.equal(NOTIF.decouper(Array.from({ length: 250 }, (_, i) => i)).length, 3, 'lots de 100 au plus');
});

test('suivi de demande : prévenu une seule fois par statut « contacté » puis « confirmé »', () => {
  const depart = { jeton: JETON, langue: 'fr', statut: 'nouveau' };
  const contacte = NOTIF.suiviDemande(depart, 'contacte');
  assert.equal(contacte.message.title, 'Votre demande est prise en charge');
  assert.equal(contacte.message.to, JETON);
  assert.equal(NOTIF.suiviDemande(contacte.suivi, 'contacte').message, null, 'même statut : rien');
  assert.equal(NOTIF.suiviDemande(contacte.suivi, 'archive').message, null, 'archivé : rien');
  assert.equal(NOTIF.suiviDemande(contacte.suivi, 'confirme').message.title, 'Votre réservation est confirmée');
  assert.equal(NOTIF.suiviDemande(null, 'confirme').message, null);
});

test('réponse Expo : les téléphones désinscrits sont oubliés', () => {
  const lot = [{ to: JETON }, { to: JETON_2 }];
  const reponse = { data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] };
  assert.deepEqual(NOTIF.jetonsPerimes(lot, reponse), [JETON_2]);
});

test('suivi sans push : seul le statut des identifiants demandés est renvoyé', () => {
  const leads = [
    { id: '3f2a9c1e-1111-4a2b-9c3d-aaaaaaaaaaaa', status: 'contacte', name: 'Aya', phone: '0700000000', amount: 500000 },
    { id: '3f2a9c1e-2222-4a2b-9c3d-bbbbbbbbbbbb', status: 'nouveau' },
  ];
  const statuts = NOTIF.statutsDemandes(leads, ['3f2a9c1e-1111-4a2b-9c3d-aaaaaaaaaaaa', 'inconnu-0000-0000-0000', "'; DROP TABLE", null]);
  assert.deepEqual(statuts, { '3f2a9c1e-1111-4a2b-9c3d-aaaaaaaaaaaa': 'contacte' });
  assert.equal(JSON.stringify(statuts).includes('Aya'), false, 'aucune donnée personnelle');
  assert.equal(Object.keys(NOTIF.statutsDemandes(leads, Array.from({ length: 50 }, () => leads[1].id))).length, 1);
  assert.match(lire('server.js'), /url\.pathname === '\/api\/app\/suivi'/);
});

test('serveur : routes et déclencheurs branchés, fichiers hors du web', () => {
  const serveur = lire('server.js');
  assert.match(serveur, /url\.pathname === '\/api\/app\/appareils'/);
  assert.match(serveur, /notifierSuiviDemandeApp\(lead\)/);
  assert.match(serveur, /notifierNouveautesApp\('studio'\)/);
  assert.match(serveur, /notifierNouveautesApp\('facebook'\)/);
  assert.match(serveur, /NOTIF\.estJetonExpo\(payload\.appareil\)/);
  assert.match(serveur, /APP_APPAREILS_FILE = path\.join\(STORE_DIR/, 'le registre vit dans data/, jamais servi');
});
