// Location de voitures (demande du 17/09/2026) : règles métier partagées par le
// site et le serveur (js/location-voitures.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/location-voitures.js');

const MAINTENANT = new Date('2026-09-19T10:00:00Z');
const VEHICULE = {
  id: 'prado', pricePerDay: 60000, pricePerDayWeek: 50000, pricePerDayMonth: 40000,
  driverMode: 'choix', driverPricePerDay: 15000, deposit: 300000, kmIncludedPerDay: 200, extraKmPrice: 150, minDays: 1
};
const REGLAGES = {
  lieux: [
    { id: 'agence', nom: 'Agence', frais: 0, actif: true },
    { id: 'aeroport', nom: 'Aéroport', frais: 25000, actif: true },
    { id: 'ferme', nom: 'Fermé', frais: 5000, actif: false }
  ],
  options: [
    { id: 'siege', nom: 'Siège bébé', prix: 3000, unite: 'jour', actif: true },
    { id: 'conducteur', nom: 'Conducteur additionnel', prix: 10000, unite: 'location', actif: true },
    { id: 'gps', nom: 'GPS', prix: 2000, unite: 'jour', actif: false }
  ],
  heureOuverture: '07:00', heureFermeture: '20:00', delaiMinHeures: 12, battementHeures: 2
};
const demande = champs => ({ debut: '2026-10-01T09:00', fin: '2026-10-04T09:00', lieuPrise: 'agence', lieuRetour: 'agence', chauffeur: false, options: [], ...champs });
const devis = (champs, vehicule = VEHICULE) => L.devis(vehicule, REGLAGES, demande(champs), { maintenant: MAINTENANT });

test('jours facturés : tranches de 24 h commencées, 59 min de tolérance au retour, un jour minimum', () => {
  assert.equal(L.joursLocation('2026-10-01T09:00', '2026-10-02T09:00'), 1);
  assert.equal(L.joursLocation('2026-10-01T09:00', '2026-10-02T09:59'), 1, 'retard toléré');
  assert.equal(L.joursLocation('2026-10-01T09:00', '2026-10-02T10:00'), 2, 'une heure de retard : un jour de plus');
  assert.equal(L.joursLocation('2026-10-01T09:00', '2026-10-01T11:00'), 1);
  assert.equal(L.joursLocation('2026-10-02T09:00', '2026-10-01T09:00'), 0, 'retour avant départ');
});

test('heure d’Abidjan : la saisie « 10:00 » vaut 10 h UTC, quel que soit le fuseau du navigateur ou du serveur', () => {
  assert.equal(L.dateHeure('2026-10-01T10:00').toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(L.versSaisie('2026-10-01T10:00:00.000Z'), '2026-10-01T10:00');
});

test('tarif dégressif : jour, semaine dès 7 jours, mois dès 30 ; palier absent = tarif précédent', () => {
  assert.deepEqual(L.tarifApplicable(VEHICULE, 6), { palier: 'jour', tarifJour: 60000 });
  assert.deepEqual(L.tarifApplicable(VEHICULE, 7), { palier: 'semaine', tarifJour: 50000 });
  assert.deepEqual(L.tarifApplicable(VEHICULE, 30), { palier: 'mois', tarifJour: 40000 });
  assert.deepEqual(L.tarifApplicable({ pricePerDay: 60000, pricePerDayWeek: 50000 }, 45), { palier: 'semaine', tarifJour: 50000 });
  assert.equal(L.prixAPartirDe(VEHICULE), 40000);
  assert.equal(L.prixAPartirDe({}), 0);
});

test('chauffeur réglé par véhicule : imposé (avec), exclu (sans), ou au choix du client', () => {
  assert.equal(L.avecChauffeur({ driverMode: 'avec' }, false), true);
  assert.equal(L.avecChauffeur({ driverMode: 'sans' }, true), false);
  assert.equal(L.avecChauffeur({ driverMode: 'choix' }, true), true);
  assert.equal(L.avecChauffeur({ driverMode: 'choix' }, false), false);
});

test('estimation complète : véhicule, chauffeur, livraison, options ; caution seulement sans chauffeur', () => {
  const sans = devis({ lieuPrise: 'aeroport', options: ['siege', 'conducteur', 'gps', 'inconnue'] });
  assert.equal(sans.ok, true, JSON.stringify(sans.erreurs));
  assert.equal(sans.jours, 3);
  assert.deepEqual(sans.lignes.map(l => [l.cle, l.montant]), [['vehicule', 180000], ['livraison', 25000], ['option', 9000], ['option', 10000]]);
  assert.equal(sans.total, 224000, 'option désactivée ou inconnue ignorée');
  assert.equal(sans.caution, 300000);
  assert.equal(sans.kmInclus, 600);

  const avec = devis({ chauffeur: true });
  assert.deepEqual(avec.lignes.map(l => [l.cle, l.montant]), [['vehicule', 180000], ['chauffeur', 45000]]);
  assert.equal(avec.caution, 0, 'le chauffeur de l’agence conduit : pas de caution');

  assert.equal(devis({}, { ...VEHICULE, kmIncludedPerDay: 0 }).kmInclus, null, '0 km/jour = kilométrage illimité');
});

test('refus : dates manquantes ou inversées, délai, horaires, durée, minimum, lieu, tarif sur demande', () => {
  const codes = (champs, vehicule) => devis(champs, vehicule).erreurs.map(e => e.code);
  assert.deepEqual(codes({ debut: '' }), ['dates']);
  assert.ok(codes({ fin: '2026-09-30T09:00' }).includes('ordre'));
  assert.ok(codes({ debut: '2026-09-19T18:00' }).includes('delai'), 'moins de 12 h à l’avance');
  assert.ok(codes({ debut: '2026-10-01T06:30' }).includes('horaires'));
  assert.ok(codes({ fin: '2026-10-01T21:00', debut: '2026-09-30T09:00' }).includes('horaires'));
  assert.ok(codes({ fin: '2027-02-01T09:00' }).includes('duree'));
  assert.ok(codes({}, { ...VEHICULE, minDays: 5 }).includes('minimum'));
  assert.ok(codes({ lieuPrise: 'ferme' }).includes('lieu'), 'lieu désactivé refusé');
  assert.ok(codes({}, { ...VEHICULE, pricePerDay: 0, pricePerDayWeek: 0, pricePerDayMonth: 0 }).includes('tarif'));
});

test('planning : seules les réservations confirmées ou en cours et les indisponibilités bloquent, battement compris', () => {
  const reservations = [
    { id: 'r1', vehiculeId: 'prado', statut: 'confirmee', debut: '2026-10-01T09:00:00Z', fin: '2026-10-04T09:00:00Z' },
    { id: 'r2', vehiculeId: 'prado', statut: 'demande', debut: '2026-10-10T09:00:00Z', fin: '2026-10-12T09:00:00Z' },
    { id: 'r3', vehiculeId: 'autre', statut: 'confirmee', debut: '2026-10-20T09:00:00Z', fin: '2026-10-22T09:00:00Z' }
  ];
  const indispos = [{ id: 'b1', vehiculeId: 'prado', motif: 'entretien', debut: '2026-10-15T00:00:00Z', fin: '2026-10-16T00:00:00Z' }];
  const occ = L.occupations('prado', reservations, indispos, { battementHeures: 2 });
  assert.deepEqual(occ.map(o => o.id), ['r1', 'b1'], 'demande non confirmée et autre véhicule ignorés');
  assert.equal(occ[0].fin, '2026-10-04T11:00:00.000Z', 'battement de préparation ajouté');
  assert.equal(L.conflit(occ, '2026-10-04T10:00', '2026-10-05T10:00')?.id, 'r1', 'reprise avant la fin du battement');
  assert.equal(L.conflit(occ, '2026-10-04T11:00', '2026-10-05T10:00'), null);
  assert.equal(L.conflit(occ, '2026-10-14T09:00', '2026-10-15T09:00')?.id, 'b1');
  assert.equal(L.occupations('prado', reservations, indispos, { ignorer: 'r1' }).length, 1, 'une réservation ne se bloque pas elle-même');
});

test('réglages : valeurs initiales sans tarif inventé (lieux et options de livraison désactivés)', () => {
  const r = L.normaliserReglages(null);
  assert.deepEqual(r.lieux.filter(l => l.actif).map(l => [l.id, l.frais]), [['agence', 0], ['domicile', 0], ['bureau', 0], ['autre', 0]]);
  assert.deepEqual(r.lieux.filter(l => l.precision).map(l => l.id), ['domicile', 'bureau', 'autre'], 'lieux à préciser (19/09/2026)');
  assert.ok(r.options.every(o => !o.actif));
  assert.equal(r.heureOuverture, '07:00');
  assert.equal(L.normaliserReglages({ heureOuverture: 'n’importe', battementHeures: 500 }).battementHeures, 48);
});

test('cycle d’une réservation : transitions autorisées seulement', () => {
  assert.deepEqual(L.TRANSITIONS.demande, ['confirmee', 'annulee']);
  assert.ok(!L.TRANSITIONS.terminee.length, 'une location terminée ne bouge plus');
  assert.ok(L.TRANSITIONS.confirmee.includes('en_cours'));
});

test('lieux à préciser (domicile, bureau, autre) : toujours proposés, adresse exigée, frais du studio', () => {
  const r = L.normaliserReglages({ lieux: [{ id: 'agence', nom: 'Agence' }, { id: 'domicile', nom: 'À domicile', frais: 5000, actif: false }] });
  assert.deepEqual(r.lieux.map(l => [l.id, l.actif, l.frais, l.precision]), [['agence', true, 0, false], ['domicile', false, 5000, true], ['bureau', true, 0, true], ['autre', true, 0, true]], 'désactivé au studio : reste désactivé');
  const v = { name: 'X', pricePerDay: 10000, driverMode: 'avec' };
  const demande = champs => ({ debut: '2026-10-01T09:00', fin: '2026-10-02T09:00', lieuPrise: 'bureau', lieuRetour: 'agence', chauffeur: true, ...champs });
  const sans = L.devis(v, r, demande(), { maintenant: new Date('2026-09-19') });
  assert.deepEqual(sans.erreurs.map(e => e.code), ['adresse']);
  const avec = L.devis(v, r, demande({ adressePrise: '  Plateau,   tour  B ', adresseRetour: 'ignorée : lieu sans adresse' }), { maintenant: new Date('2026-09-19') });
  assert.equal(avec.ok, true);
  assert.deepEqual([avec.adressePrise, avec.adresseRetour], ['Plateau, tour B', '']);
});
