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

// Textes décidés le 21/09/2026 : titre par rubrique avec emoji, nom + lieu + infos clés, jamais de prix.
const NOUVELLES = [
  { type: 'villa', id: 'villa-mondoukou', titre: 'Villa Mondoukou', infos: { lieu: 'Grand-Bassam', personnes: 6, chambres: 3 } },
  { type: 'activite', id: 'balade', titre: 'Balade en bateau vers La Passe', infos: { duree: '2 h', traductions: { en: { title: 'Boat trip to La Passe' } } } },
  { type: 'vehicule', id: 'tucson', titre: 'Hyundai Tucson 2025', infos: { categorie: 'suv', places: 5, chauffeur: 'choix' } },
  { type: 'terrain', id: 'lot-mafia', titre: 'Lot Assinie-Mafia', infos: { lieu: 'Assinie-Mafia', surface: 600 } },
  { type: 'publication', id: 'p1', titre: 'Nouvelle villa disponible !' }
];

test('messages : titre par rubrique, nom, lieu et infos clés, jamais de prix ; le toucher ouvre la fiche', () => {
  const fr = NOUVELLES.map(a => NOTIF.messageAnnonce(a, 'fr'));
  assert.deepEqual(fr.map(m => [m.title, m.body]), [
    ['🏡 Nouvelle résidence à découvrir', 'Villa Mondoukou · Grand-Bassam — 6 pers., 3 chambres. Touchez pour voir la fiche.'],
    ['🌴 Nouvelle activité à Assinie', 'Balade en bateau vers La Passe · 2 h. Touchez pour découvrir l’activité.'],
    ['🚗 Nouvelle voiture à louer', 'Hyundai Tucson 2025 · SUV, 5 places · avec ou sans chauffeur. Touchez pour voir la fiche.'],
    ['📍 Nouveau terrain à vendre', 'Lot Assinie-Mafia · 600 m². Touchez pour voir la fiche.'],
    ['📣 Nouveauté Détente & Loisirs', 'Nouvelle villa disponible ! Touchez pour la lire.']
  ]);
  assert.deepEqual(fr.map(m => m.data), NOUVELLES.map(a => ({ type: a.type, id: a.id })));
  const en = NOTIF.messageAnnonce(NOUVELLES[1], 'en');
  assert.equal(en.body, 'Boat trip to La Passe · 2 h. Tap to discover the activity.', 'titre traduit saisi au studio');
  const villaChere = NOTIF.messageAnnonce({ ...NOUVELLES[0], infos: { ...NOUVELLES[0].infos, prix: 350000 } }, 'fr');
  assert.doesNotMatch(villaChere.body, /FCFA|350/);
});

test('messages : une notification par annonce jusqu’à 3, au-delà un récapitulatif qui ouvre Explorer', () => {
  assert.equal(NOTIF.messagesNouveautes([], 'fr').length, 0);
  assert.equal(NOTIF.messagesNouveautes(NOUVELLES.slice(0, 3), 'fr').length, 3);
  const recap = NOTIF.messagesNouveautes(NOUVELLES, 'es');
  assert.deepEqual(recap, [{ title: '✨ 5 nuevos anuncios en Assinie', body: 'Descúbralos en la aplicación.', data: { ecran: 'explorer' } }]);

  const registre = { appareils: { [JETON]: { langue: 'en' }, [JETON_2]: { langue: 'fr' } } };
  const lots = NOTIF.lotsNouveautes(registre, NOUVELLES.slice(2, 4));
  assert.equal(lots.length, 1);
  assert.deepEqual(lots[0].map(m => [m.to, m.title]), [
    [JETON, '🚗 New car for rent'], [JETON, '📍 New plot for sale'],
    [JETON_2, '🚗 Nouvelle voiture à louer'], [JETON_2, '📍 Nouveau terrain à vendre']
  ]);
  assert.ok(lots[0].every(m => m.sound === 'default'));
  assert.equal(NOTIF.decouper(Array.from({ length: 250 }, (_, i) => i)).length, 3, 'lots de 100 au plus');
});

test('voitures : celles déjà en ligne sont mémorisées en silence, les suivantes sont annoncées', () => {
  // Mémoire écrite avant le 21/09/2026 : amorcée, sans liste de types.
  const ancienne = NOTIF.detecterNouveautes({}, NOTIF.annoncesPubliques(CONTENU, { maintenant: MAINTENANT })).etat;
  delete ancienne.typesAmorces;
  const avecTucson = { ...CONTENU, vehicles: [{ id: 'tucson', name: 'Hyundai Tucson 2025', category: 'suv', seats: 5, driverMode: 'choix' }] };
  const premier = NOTIF.detecterNouveautes(ancienne, NOTIF.annoncesPubliques(avecTucson, { maintenant: MAINTENANT }));
  assert.equal(premier.nouvelles.length, 0, 'la voiture déjà publiée n’est pas une nouveauté');
  assert.ok(premier.etat.typesAmorces.includes('vehicule'));
  const avecPrado = { ...avecTucson, vehicles: [...avecTucson.vehicles, { id: 'prado', name: 'Toyota Prado', visible: true }, { id: 'cachee', name: 'Cachée', visible: false }] };
  const second = NOTIF.detecterNouveautes(premier.etat, NOTIF.annoncesPubliques(avecPrado, { maintenant: MAINTENANT }));
  assert.deepEqual(second.nouvelles.map(a => a.cle), ['vehicule:prado']);
  assert.match(lire('server.js'), /typesAmorces: suivant\.typesAmorces/, 'la liste des types suivis est enregistrée');
});

test('app : la veille locale dit la même chose que le site et annonce aussi les voitures', () => {
  const veille = lire('mobile/natif/src/donnees/veille.ts');
  assert.match(veille, /visibles\(contenu\.vehicles\)/);
  assert.match(veille, /const MAX_NOTIFICATIONS_PAR_ANNONCE = 3;/);
  assert.match(veille, /suivis\.includes\(a\.type\) && !dejaVues\.has\(a\.cle\)/);
  const i18n = lire('mobile/natif/src/donnees/i18n.ts');
  for (const cle of ['notif.vehicule', 'notif.appelFiche', 'notif.appelActivite', 'notif.appelPublication', 'notif.personnes', 'notif.places']) {
    assert.equal(i18n.split(`'${cle}': `).length - 1, 3, `${cle} : FR, EN, ES`);
  }
  assert.match(i18n, /'notif\.villa': '🏡 Nouvelle résidence à découvrir'/);
  // Le toucher ouvre la fiche : /annonce/[type]/[id] connaît les voitures.
  assert.match(lire('mobile/natif/src/donnees/notifications.ts'), /pathname: '\/annonce\/\[type\]\/\[id\]'/);
  assert.match(lire('mobile/natif/src/app/annonce/[type]/[id].tsx'), /type === 'vehicule'/);
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
