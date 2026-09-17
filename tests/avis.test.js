// Avis des visiteurs sur les annonces (17/09/2026) : « J'aime », commentaires
// notés publiés aussitôt, modération au studio. Module db/avis.js et routes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AVIS = require('../db/avis');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('commentaire valide : publié tout de suite (visible), nom, note entière de 1 à 5, texte nettoyé', () => {
  const { commentaire, erreur } = AVIS.validerCommentaire({ kind: 'villa', id: 'villa-oasis', nom: '  Awa   K. ', note: 5, commentaire: 'Super\r\n\r\n\r\n\r\nséjour !', visiteur: 'abcdefgh-1234-5678' }, new Date('2026-09-17T10:00:00Z'));
  assert.equal(erreur, undefined);
  assert.equal(commentaire.statut, 'visible');
  assert.equal(commentaire.nom, 'Awa K.');
  assert.equal(commentaire.commentaire, 'Super\n\nséjour !');
  assert.equal(commentaire.creeLe, '2026-09-17T10:00:00.000Z');
  assert.match(commentaire.visiteur, /^[a-f0-9]{64}$/, 'seule l’empreinte du jeton est gardée');
});

test('commentaire refusé : nom, note, texte, annonce inconnue ; champ piège rempli = robot', () => {
  const base = { kind: 'villa', id: 'v', nom: 'Awa', note: 4, commentaire: 'Bien' };
  assert.match(AVIS.validerCommentaire({ ...base, nom: 'A' }).erreur, /nom/);
  for (const note of [0, 6, 3.5, '']) assert.match(AVIS.validerCommentaire({ ...base, note }).erreur, /note/, String(note));
  assert.match(AVIS.validerCommentaire({ ...base, commentaire: ' ' }).erreur, /commentaire/);
  assert.match(AVIS.validerCommentaire({ ...base, kind: 'maison' }).erreur, /Annonce inconnue/);
  assert.match(AVIS.validerCommentaire({ ...base, id: '../x' }).erreur, /Annonce inconnue/);
  assert.equal(AVIS.validerCommentaire({ ...base, site: 'http://spam' }).robot, true);
});

test('résumé : J’aime, moyenne arrondie au dixième et nombre des SEULS avis visibles', () => {
  const commentaires = [{ note: 5 }, { note: 4 }, { note: 4 }, { note: 1, statut: 'masque' }];
  assert.deepEqual(AVIS.resume([{}, {}], commentaires), { likes: 2, note: 4.3, nombre: 3 });
  assert.deepEqual(AVIS.resume([], []), { likes: 0, note: null, nombre: 0 });
  const tous = AVIS.resumes({ jaime: [{ kind: 'villa', annonceId: 'a' }], commentaires: [{ kind: 'activity', annonceId: 'b', note: 3 }] });
  assert.deepEqual(tous.get('villa:a'), { likes: 1, note: null, nombre: 0 });
  assert.deepEqual(tous.get('activity:b'), { likes: 0, note: 3, nombre: 1 });
});

test('jeton visiteur : forme contrôlée, empreinte stable ; commentaire public sans statut ni empreinte', () => {
  assert.equal(AVIS.empreinteVisiteur('court'), '');
  assert.equal(AVIS.empreinteVisiteur('<script>alert(1)</script>xx'), '');
  assert.equal(AVIS.empreinteVisiteur('abcdefgh-1234-5678'), AVIS.empreinteVisiteur('abcdefgh-1234-5678'));
  assert.deepEqual(Object.keys(AVIS.commentairePublic({ id: 'i', nom: 'n', note: 4, commentaire: 'c', creeLe: 'd', statut: 'masque', visiteur: 'x' })).sort(), ['commentaire', 'creeLe', 'id', 'nom', 'note']);
});

test('routes : publiques sans session et limitées en débit ; modération réservée au studio', () => {
  const publiques = server.indexOf("url.pathname === '/api/avis')");
  const garde = server.indexOf("url.pathname.startsWith('/api/auth/')");
  assert.ok(publiques > 0 && publiques < garde, 'avis publics avant les routes authentifiées');
  assert.match(server, /rateLimit\(req, 'avis-jaime', 60\)/);
  assert.match(server, /rateLimit\(req, 'avis-commentaires', 6\)/);
  const commentaires = server.slice(server.indexOf("url.pathname === '/api/avis/commentaires')"));
  assert.ok(commentaires.indexOf('annonceEnLigne(') < commentaires.indexOf('AVIS.ajouterCommentaire('), 'annonce en ligne vérifiée avant l’enregistrement');
  for (const [verbe, motif, permission] of [['GET', 'avis\\$', 'content:read'], ['PATCH', 'avis\\\\/commentaires', 'content:write'], ['DELETE', 'avis\\\\/commentaires', 'content:write']]) {
    assert.ok(server.split('\n').some(l => l.includes(`['${verbe}', /^\\/api\\/admin\\/`) && new RegExp(motif).test(l) && l.includes(`'${permission}'`)), `${verbe} ${motif}`);
  }
});
