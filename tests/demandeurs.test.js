// Demandeurs bloqués, suspendus ou supprimés (décisions du 17/09/2026).
// Module pur db/demandeurs.js et branchement réel de POST /api/leads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../db/demandeurs');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('téléphone : chiffres seuls, sans 00 ni indicatif 225 ; e-mail en minuscules', () => {
  for (const saisie of ['+225 07 00 00 00 00', '0700000000', '00225 07-00-00-00-00', '(07) 00 00 00 00']) {
    assert.equal(D.normaliserTelephone(saisie), '0700000000', saisie);
  }
  assert.equal(D.normaliserTelephone('12 34'), '', 'trop court pour identifier quelqu’un');
  assert.equal(D.normaliserEmail(' Ama@Example.COM '), 'ama@example.com');
  assert.equal(D.normaliserEmail('pas-une-adresse'), '');
});

test('même demandeur : même téléphone OU même e-mail ; deux fiches vides ne se confondent pas', () => {
  assert.ok(D.memeDemandeur({ phone: '+225 07 00 00 00 00' }, { phone: '0700000000', email: 'autre@x.ci' }));
  assert.ok(D.memeDemandeur({ email: 'AMA@example.com' }, { email: 'ama@example.com', phone: '0500000000' }));
  assert.equal(D.memeDemandeur({ phone: '', email: '' }, { phone: '', email: '' }), false);
  assert.equal(D.memeDemandeur({ phone: '0700000000' }, { phone: '0500000000' }), false);
});

test('bloquer : effet immédiat et sans fin ; suspendre : 7, 30 ou 90 jours, levé tout seul', () => {
  const maintenant = new Date('2026-09-17T10:00:00Z');
  const lead = { id: 'l1', name: 'Kouassi', phone: '0700000000', email: 'k@example.com' };
  const bloque = D.creerRestriction({ type: 'bloque', lead, acteur: 'henri' }, maintenant).restriction;
  assert.equal(bloque.jusquAu, null);
  assert.ok(D.estActive(bloque, new Date('2030-01-01')));

  const suspendu = D.creerRestriction({ type: 'suspendu', jours: 30, lead, motif: 'abus' }, maintenant).restriction;
  assert.equal(suspendu.jusquAu, '2026-10-17T10:00:00.000Z');
  assert.ok(D.estActive(suspendu, new Date('2026-10-17T09:59:00Z')));
  assert.equal(D.estActive(suspendu, new Date('2026-10-17T10:00:01Z')), false);

  assert.match(D.creerRestriction({ type: 'suspendu', jours: 12, lead }).erreur, /7, 30 ou 90/);
  assert.match(D.creerRestriction({ type: 'effacer', lead }).erreur, /inconnue/);
  assert.match(D.creerRestriction({ type: 'bloque', lead: { name: 'Sans coordonnées' } }).erreur, /ni téléphone ni e-mail/);
});

test('restriction applicable : trouvée par téléphone ou e-mail, ignorée une fois expirée', () => {
  const maintenant = new Date('2026-09-17T10:00:00Z');
  const lead = { id: 'l1', phone: '0700000000', email: 'k@example.com' };
  const suspendu = D.creerRestriction({ type: 'suspendu', jours: 7, lead }, maintenant).restriction;
  assert.equal(D.restrictionPour([suspendu], { phone: '+225 07 00 00 00 00' }, maintenant)?.id, suspendu.id);
  assert.equal(D.restrictionPour([suspendu], { email: 'K@EXAMPLE.COM' }, maintenant)?.id, suspendu.id);
  assert.equal(D.restrictionPour([suspendu], { phone: '0500000000' }, maintenant), null);
  assert.equal(D.restrictionPour([suspendu], { phone: '0700000000' }, new Date('2026-09-25T00:00:00Z')), null);
});

test('supprimer le demandeur : toutes ses demandes, par téléphone ou e-mail, et elles seules', () => {
  const leads = [
    { id: 'a', phone: '0700000000', email: '' },
    { id: 'b', phone: '', email: 'k@example.com' },
    { id: 'c', phone: '+225 07 00 00 00 00', email: 'k@example.com' },
    { id: 'd', phone: '0500000000', email: 'ama@example.com' },
    { id: 'e', phone: '', email: '' }
  ];
  assert.deepEqual(D.demandesDuDemandeur(leads, leads[2]).map(l => l.id), ['a', 'b', 'c']);
  assert.deepEqual(D.demandesDuDemandeur(leads, leads[4]).map(l => l.id), ['e'], 'demande sans coordonnées : elle seule');
});

test('POST /api/leads : refus neutre avant tout enregistrement ; routes de gestion protégées', () => {
  const route = server.slice(server.indexOf("url.pathname === '/api/leads')"));
  const controle = route.indexOf('DEMANDEURS.restrictionPour(');
  assert.ok(controle > 0 && controle < route.indexOf('store.createLead(lead)'), 'contrôle avant l’enregistrement');
  assert.match(route.slice(controle, controle + 400), /json\(res, 403, \{ ok: false, error: DEMANDEURS\.MESSAGE_REFUS \}\)/);
  assert.doesNotMatch(D.MESSAGE_REFUS, /bloqu|suspend/i, 'le visiteur n’apprend pas qu’il est bloqué');
  for (const [verbe, chemin, permission] of [
    ['DELETE', '/api/admin/leads/x', 'leads:write'], ['GET', '/api/admin/demandeurs/restrictions', 'leads:read'],
    ['POST', '/api/admin/demandeurs/restrictions', 'leads:write'], ['DELETE', '/api/admin/demandeurs/restrictions/x', 'leads:write'],
    ['POST', '/api/admin/demandeurs/supprimer', 'leads:write']
  ]) {
    const ligne = server.split('\n').find(l => l.includes(`['${verbe}',`) && new RegExp(l.match(/\/(\^.*\$)\//)?.[1] || '^$').test(chemin));
    assert.ok(ligne && ligne.includes(`'${permission}'`), `${verbe} ${chemin} → ${permission}`);
  }
});
