// Location de voitures (17/09/2026) : fiches véhicules, réglages, demandes
// publiques, cycle des réservations et branchement du serveur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOC = require('../db/location');
const COMPTA = require('../db/comptabilite');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const auth = fs.readFileSync(path.join(__dirname, '..', 'db', 'auth-store.js'), 'utf8');

const MAINTENANT = new Date('2026-09-19T10:00:00Z');
const PRADO = LOC.validerVehicule({ name: 'Toyota Prado', category: '4x4', driverMode: 'choix', pricePerDay: 60000, driverPricePerDay: 15000, deposit: 300000, minAge: 25, licenseYears: 3, images: ['a.jpg'] });
const REGLAGES = { lieux: [{ id: 'agence', nom: 'Agence', frais: 0, actif: true }], options: [], heureOuverture: '07:00', heureFermeture: '20:00', delaiMinHeures: 12, battementHeures: 2 };
const demande = champs => ({ vehicule: 'toyota-prado', nom: 'Awa Koné', telephone: '07 07 07 07 07', debut: '2026-10-01T09:00', fin: '2026-10-03T09:00', lieuPrise: 'agence', lieuRetour: 'agence', chauffeur: true, ...champs });

test('fiche véhicule : nom requis, identifiant unique, règles du mode chauffeur, avertissements de tarif', () => {
  const errors = []; const warnings = []; const vus = new Set();
  const avec = LOC.validerVehicule({ name: 'Minibus 15 places', driverMode: 'avec', deposit: 500000, minAge: 25, pricePerDay: 90000, pricePerDayWeek: 95000 }, 0, { vus, errors, warnings });
  assert.equal(avec.id, 'minibus-15-places');
  assert.deepEqual([avec.deposit, avec.minAge, avec.licenseYears], [0, 0, 0], 'avec chauffeur : ni caution ni conditions de conduite');
  assert.ok(warnings.some(w => /semaine dépasse/.test(w)));
  const sans = LOC.validerVehicule({ name: 'Suzuki Swift', driverMode: 'sans', driverPricePerDay: 10000, category: 'inconnue', transmission: 'robot' }, 1, { vus, errors, warnings });
  assert.equal(sans.driverPricePerDay, 0, 'sans chauffeur : pas de supplément chauffeur');
  assert.deepEqual([sans.category, sans.transmission, sans.minAge], ['berline', 'manuelle', 21], 'valeurs sûres par défaut');
  LOC.validerVehicule({ name: 'Minibus 15 places' }, 2, { vus, errors, warnings });
  LOC.validerVehicule({ name: '' }, 3, { vus, errors, warnings });
  assert.ok(errors.some(e => /utilisé plusieurs fois/.test(e)));
  assert.ok(errors.some(e => /nom \(marque et modèle\) est requis/.test(e)));
  assert.ok(warnings.some(w => /tarif par jour nul/.test(w)));
});

test('réglages : un lieu actif au moins, identifiants uniques, horaires cohérents, public = actifs seulement', () => {
  const { reglages, erreurs } = LOC.validerReglages({
    lieux: [{ nom: 'Agence', frais: 0 }, { nom: 'Agence', frais: '15000' }, { nom: 'Fermé', actif: false }],
    options: [{ nom: 'Siège bébé', prix: 3000, unite: 'jour' }, { nom: 'GPS', prix: 2000, actif: false }],
    heureOuverture: '08:00', heureFermeture: '19:00'
  });
  assert.deepEqual(erreurs, []);
  assert.deepEqual(reglages.lieux.map(l => l.id), ['agence', 'agence-2', 'ferme']);
  assert.equal(reglages.lieux[1].frais, 15000);
  const publics = LOC.reglagesPublics(reglages);
  assert.deepEqual(publics.lieux.map(l => l.id), ['agence', 'agence-2']);
  assert.deepEqual(publics.options.map(o => o.id), ['siege-bebe']);
  assert.match(LOC.validerReglages({ lieux: [{ nom: 'X', actif: false }] }).erreurs.join(), /au moins un lieu/);
  assert.match(LOC.validerReglages({ lieux: [{ nom: 'X' }], heureOuverture: '20:00', heureFermeture: '08:00' }).erreurs.join(), /fermeture/);
});

test('demande publique : coordonnées exigées, estimation recalculée, statut « demande » (ne bloque pas encore)', () => {
  const contexte = { vehicule: PRADO, reglages: REGLAGES, maintenant: MAINTENANT };
  assert.equal(LOC.preparerDemande(demande({ nom: 'A' }), contexte).statut, 422);
  assert.match(LOC.preparerDemande(demande({ telephone: '12' }), contexte).erreur, /téléphone/);
  assert.equal(LOC.preparerDemande(demande(), { ...contexte, vehicule: null }).statut, 404);
  const { reservation, devis } = LOC.preparerDemande(demande({ source: 'app', montant: 1 }), contexte);
  assert.equal(reservation.statut, 'demande');
  assert.equal(reservation.source, 'app');
  assert.equal(reservation.montant, 150000, '2 j × 60 000 + chauffeur 2 j × 15 000 : le montant envoyé par le client est ignoré');
  assert.equal(devis.caution, 0);
});

test('demande sans chauffeur : âge et permis attestés ; dates occupées refusées (409)', () => {
  const contexte = { vehicule: PRADO, reglages: REGLAGES, maintenant: MAINTENANT };
  assert.match(LOC.preparerDemande(demande({ chauffeur: false }), contexte).erreur, /25 ans.*3 ans/);
  assert.ok(LOC.preparerDemande(demande({ chauffeur: false, conditionsConducteur: true }), contexte).reservation);
  const reservations = [{ id: 'r1', vehiculeId: 'toyota-prado', statut: 'confirmee', debut: '2026-10-02T09:00:00Z', fin: '2026-10-05T09:00:00Z' }];
  assert.equal(LOC.preparerDemande(demande(), { ...contexte, reservations }).statut, 409);
  const demandes = [{ ...reservations[0], statut: 'demande' }];
  assert.ok(LOC.preparerDemande(demande(), { ...contexte, reservations: demandes }).reservation, 'une demande non confirmée ne bloque pas');
});

test('statuts : transitions contrôlées, confirmation refusée en cas de chevauchement', () => {
  const r = { id: 'r2', vehiculeId: 'toyota-prado', statut: 'demande', debut: '2026-10-01T09:00:00Z', fin: '2026-10-03T09:00:00Z' };
  assert.match(LOC.changerStatut(r, 'terminee', { reglages: REGLAGES }).erreur, /Passage impossible/);
  const indisponibilites = [{ id: 'b1', vehiculeId: 'toyota-prado', motif: 'entretien', debut: '2026-10-02T00:00:00Z', fin: '2026-10-02T12:00:00Z' }];
  assert.match(LOC.changerStatut(r, 'confirmee', { indisponibilites, reglages: REGLAGES }).erreur, /indisponibilité/);
  const ok = LOC.changerStatut(r, 'confirmee', { reglages: REGLAGES, acteur: 'henri' });
  assert.equal(ok.reservation.statut, 'confirmee');
  assert.equal(ok.reservation.modifiePar, 'henri');
  assert.equal(LOC.changerStatut(r, 'annulee', { indisponibilites, reglages: REGLAGES }).reservation.statut, 'annulee', 'annuler ne vérifie pas le planning');
});

test('studio : réservation saisie à la main, montant recalculé ou négocié, auteur tracé', () => {
  const vehicules = [PRADO];
  const base = { vehiculeId: 'toyota-prado', debut: '2026-10-01T09:00', fin: '2026-10-02T09:00', chauffeur: false, client: { nom: 'Yao' } };
  const calcule = LOC.validerReservationStudio(base, { vehicules, reglages: REGLAGES, acteur: 'awa', maintenant: MAINTENANT });
  assert.equal(calcule.reservation.montant, 60000);
  assert.equal(calcule.reservation.source, 'studio');
  assert.equal(calcule.reservation.creePar, 'awa');
  const negocie = LOC.validerReservationStudio({ ...base, montant: 50000 }, { vehicules, reglages: REGLAGES, maintenant: MAINTENANT });
  assert.equal(negocie.reservation.montant, 50000);
  assert.match(LOC.validerReservationStudio({ ...base, vehiculeId: 'x' }, { vehicules, reglages: REGLAGES }).erreurs.join(), /véhicule/);
  const passe = LOC.validerReservationStudio({ ...base, debut: '2026-01-01T09:00', fin: '2026-01-02T09:00' }, { vehicules, reglages: REGLAGES, maintenant: MAINTENANT });
  assert.deepEqual(passe.erreurs, [], 'au studio, une location passée peut être enregistrée (régularisation)');
});

test('planning public : périodes occupées sans nom ni motif, passé exclu', () => {
  const donnees = {
    reservations: [
      { id: 'a', vehiculeId: 'toyota-prado', statut: 'confirmee', debut: '2026-09-01T09:00:00Z', fin: '2026-09-03T09:00:00Z', client: { nom: 'Secret' } },
      { id: 'b', vehiculeId: 'toyota-prado', statut: 'confirmee', debut: '2026-10-01T09:00:00Z', fin: '2026-10-03T09:00:00Z', client: { nom: 'Secret' } }
    ],
    indisponibilites: [], reglages: { battementHeures: 0 }
  };
  const occ = LOC.occupationsPubliques('toyota-prado', donnees, MAINTENANT);
  assert.deepEqual(occ, [{ debut: '2026-10-01T09:00:00.000Z', fin: '2026-10-03T09:00:00.000Z' }]);
});

test('récapitulatif enregistré avec la demande : dates à l’heure d’Abidjan, détail et caution', () => {
  const { devis } = LOC.preparerDemande(demande({ chauffeur: false, conditionsConducteur: true }), { vehicule: PRADO, reglages: REGLAGES, maintenant: MAINTENANT });
  const texte = LOC.recapitulatif(PRADO, devis);
  assert.match(texte, /Du 01\/10\/2026 09:00 au 03\/10\/2026 09:00 \(2 jours\)/);
  assert.match(texte, /Sans chauffeur/);
  assert.match(texte, /Caution \(restituée\) : 300 000 FCFA/);
});

test('serveur : routes publiques et du studio, permissions, suivi demande ⇄ réservation, comptabilité', () => {
  assert.match(server, /url\.pathname === '\/api\/location\/demande'[\s\S]{0,200}rateLimit\(req, 'location-demande', 10\)/);
  const bloc = server.slice(server.indexOf("url.pathname === '/api/location/demande'"), server.indexOf("url.pathname === '/api/location/demande'") + 4000);
  assert.ok(bloc.indexOf("type: 'location-voiture'") < bloc.indexOf('await store.createLead(lead)'));
  assert.ok(bloc.indexOf('await store.createLead(lead)') < bloc.indexOf('await LOC.enregistrerReservation(reservation)'), 'la réservation garde l’identifiant de la demande');
  assert.ok(bloc.indexOf('DEMANDEURS.restrictionPour') < bloc.indexOf('await store.createLead(lead)'), 'demandeur bloqué refusé avant tout enregistrement');
  assert.match(server, /\['GET', \/\^\\\/api\\\/admin\\\/location\$\/, 'location:manage'\]/);
  assert.match(server, /\['PUT', \/\^\\\/api\\\/admin\\\/location\\\/reglages\$\/, 'location:manage'\]/);
  const patchDemande = server.slice(server.indexOf("if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/leads/'))"));
  assert.ok(patchDemande.indexOf('synchroniserReservationDeDemande') < patchDemande.indexOf('store.updateLead(id, payload)'), 'chevauchement vérifié avant de confirmer la demande');
  assert.match(server, /location: LOC\.reglagesPublics\(reglagesLocation\)/);
  assert.match(auth, /\['location:manage', /);
  assert.equal(COMPTA.categorieDeDemande({ type: 'location-voiture' }), 'location_vehicules');
  assert.ok(COMPTA.normaliserParametres().categories.some(c => c.id === 'location_vehicules' && c.sens === 'entree'));
});

test('migration : tables identiques dans le script phpMyAdmin et le schéma de « npm run migrate », colonnes écrites présentes', () => {
  const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const migration = lire('db/migration-location-voitures.sql');
  const schema = lire('db/schema.sql');
  const bloc = (sql, nom) => { const d = sql.indexOf(`CREATE TABLE IF NOT EXISTS \`${nom}\``); return d < 0 ? '' : sql.slice(d, sql.indexOf(';', sql.indexOf(') ENGINE=', d)) + 1); };
  for (const table of ['vehicles', 'location_reservations', 'location_indisponibilites', 'location_reglages']) {
    assert.ok(bloc(migration, table), table);
    assert.equal(bloc(schema, table), bloc(migration, table), `${table} : définitions différentes`);
  }
  const colonnes = nom => [...bloc(migration, nom).matchAll(/^\s+`([a-z_]+)`\s/gm)].map(m => m[1]);
  const code = lire('db/location.js');
  const insert = code.match(/INSERT INTO location_reservations\s*\(([^)]+)\)/)[1].split(',').map(c => c.trim());
  for (const c of insert) assert.ok(colonnes('location_reservations').includes(c), `location_reservations.${c}`);
  const repo = lire('db/repository.js');
  const vehicules = repo.match(/INSERT INTO vehicles \(([^)]+)\)/)[1].split(',').map(c => c.trim());
  for (const c of vehicules) assert.ok(colonnes('vehicles').includes(c), `vehicles.${c}`);
  assert.doesNotMatch(migration, /^\s*(SELECT|SHOW|DROP|TRUNCATE|DELETE)/im, 'import sans requête de contrôle ni suppression');
});
