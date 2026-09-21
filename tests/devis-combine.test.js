// Devis combinés (19/09/2026) : séjour + activités + voiture, activités +
// voiture, voiture seule — UNE demande, la voiture recalculée par le serveur
// et réservée dans le planning, liée à la demande.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOC = require('../db/location');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const MAINTENANT = new Date('2026-09-19T10:00:00Z');
const PRADO = LOC.validerVehicule({ name: 'Toyota Prado', category: '4x4', driverMode: 'choix', pricePerDay: 60000, driverPricePerDay: 15000, deposit: 300000, minAge: 25, licenseYears: 3 });
const REGLAGES = { lieux: [{ id: 'agence', nom: 'Agence', frais: 0, actif: true }], options: [], heureOuverture: '07:00', heureFermeture: '20:00', delaiMinHeures: 12, battementHeures: 2 };
const contexte = champs => ({ vehicule: PRADO, reglages: REGLAGES, maintenant: MAINTENANT, source: 'site', ...champs });
const location = champs => ({ vehicule: 'toyota-prado', debut: '2026-10-01T09:00', fin: '2026-10-03T09:00', lieuPrise: 'agence', lieuRetour: 'agence', chauffeur: true, montant: 150000, ...champs });
const sejour = champs => ({ id: 'l1', type: 'devis-whatsapp', name: 'Awa Koné', phone: '07 07 07 07 07', email: '', villa: 'Villa Oasis', dates: '2026-10-01 → 2026-10-03', amount: 790000, message: '8 voyageur(s) · Bateau', ...champs });

test('séjour + voiture : une demande, montant = séjour + voiture recalculée, libellé et récapitulatif', () => {
  // Le client annonce 150 000 pour la voiture ; le serveur trouve le même prix.
  const r = LOC.joindreVoiture(sejour(), location(), contexte());
  assert.equal(r.erreur, undefined);
  assert.equal(r.lead.amount, 790000, '640 000 de séjour et d’activités + 150 000 de voiture');
  assert.equal(r.lead.villa, 'Villa Oasis + voiture Toyota Prado');
  assert.equal(r.lead.dates, '2026-10-01 → 2026-10-03', 'dates du séjour conservées');
  assert.match(r.lead.message, /^8 voyageur\(s\) · Bateau\n\nLocation de véhicule : Toyota Prado/);
  assert.equal(r.reservation.statut, 'demande', 'ne bloque pas les dates avant confirmation');
  assert.equal(r.reservation.montant, 150000);
  assert.match(r.reservation.notes, /Avec la demande : Villa Oasis/);
  assert.equal(sejour().villa, 'Villa Oasis', 'la demande d’origine n’est pas modifiée');
});

test('prix de la voiture envoyé par le client remplacé par celui du serveur', () => {
  const r = LOC.joindreVoiture(sejour({ amount: 700000 }), location({ montant: 60000 }), contexte());
  assert.equal(r.lead.amount, 640000 + 150000, 'reste de la demande (640 000) + voiture recalculée (150 000)');
});

test('voiture seule : type « location-voiture », dates de la voiture, montant = voiture', () => {
  const r = LOC.joindreVoiture(sejour({ type: 'location-voiture', villa: '', dates: 'x', amount: 1, message: '' }), location({ montant: 999 }), contexte());
  assert.equal(r.lead.amount, 150000);
  assert.equal(r.lead.villa, 'Location · Toyota Prado');
  assert.equal(r.lead.dates, '01/10/2026 09:00 → 03/10/2026 09:00');
  assert.equal(r.reservation.notes, '');
});

test('voiture refusée : dates prises (409), attestation manquante, coordonnées exigées', () => {
  const confirmee = { vehiculeId: 'toyota-prado', statut: 'confirmee', debut: '2026-10-02T09:00:00.000Z', fin: '2026-10-04T09:00:00.000Z' };
  assert.equal(LOC.joindreVoiture(sejour(), location(), contexte({ reservations: [confirmee] })).statut, 409);
  assert.match(LOC.joindreVoiture(sejour(), location({ chauffeur: false }), contexte()).erreur, /25 ans/);
  assert.equal(LOC.joindreVoiture(sejour(), location({ chauffeur: false, conditionsConducteur: true }), contexte()).erreur, undefined);
  assert.equal(LOC.joindreVoiture(sejour({ name: '' }), location(), contexte()).statut, 422);
  assert.equal(LOC.joindreVoiture(sejour(), location(), contexte({ vehicule: null })).statut, 404);
});

test('planning → demande : voiture seule suivie en tout ; demande combinée, seul l’écart de prix de la voiture', () => {
  const avant = { statut: 'demande', montant: 150000 };
  const seule = { type: 'location-voiture', amount: 150000 };
  assert.deepEqual(LOC.patchDemandeDepuisReservation(seule, { statut: 'confirmee', montant: 150000 }, avant), { status: 'confirme' });
  assert.deepEqual(LOC.patchDemandeDepuisReservation(seule, { statut: 'demande', montant: 120000 }, avant), { amount: 120000 });
  const combinee = { type: 'devis-whatsapp', amount: 790000 };
  assert.deepEqual(LOC.patchDemandeDepuisReservation(combinee, { statut: 'confirmee', montant: 150000 }, avant), {}, 'le séjour ne se confirme pas depuis le planning');
  assert.deepEqual(LOC.patchDemandeDepuisReservation(combinee, { statut: 'annulee', montant: 150000 }, avant), {}, 'ni ne s’annule');
  assert.deepEqual(LOC.patchDemandeDepuisReservation(combinee, { statut: 'demande', montant: 120000 }, avant), { amount: 760000 });
  assert.deepEqual(LOC.patchDemandeDepuisReservation(null, { statut: 'confirmee', montant: 1 }, avant), {});
});

test('serveur : voiture jointe vérifiée avant la demande, réservation liée après, réponse explicite', () => {
  const server = lire('server.js');
  const bloc = server.slice(server.indexOf("url.pathname === '/api/leads'"), server.indexOf("url.pathname === '/api/leads'") + 6000);
  const i = mot => bloc.indexOf(mot);
  assert.ok(i('LOC.joindreVoiture(lead, payload.location') > 0);
  assert.ok(i('LOC.joindreVoiture') < i('DEMANDEURS.restrictionPour'), 'voiture contrôlée avant tout enregistrement');
  assert.ok(i('await store.createLead(lead)') < i('voiture.reservation.leadId = lead.id'), 'réservation liée à la demande créée');
  assert.match(bloc, /return json\(res, jointe\.statut \|\| 422, \{ ok: false, error: jointe\.erreur, champ: 'voiture'/);
  assert.match(server, /LOC\.patchDemandeDepuisReservation\(demande, reservation, avant\)/);
});

test('site : formule « Voiture seule », section voiture, scripts dans l’ordre, demande unique avec la voiture', () => {
  const page = lire('devis.html');
  assert.match(page, /<input type="radio" name="simMode" value="voiture">/);
  assert.match(page, /id="simVoiture" hidden/);
  assert.match(page, /id="summaryVoitureRow" hidden/);
  const ordre = ['js/i18n.js', 'js/location-voitures.js', 'js/devis-voiture.js', 'js/app.js'].map(f => page.indexOf(`<script src="${f}`));
  assert.ok(ordre.every(n => n > 0));
  assert.deepEqual([...ordre].sort((a, b) => a - b), ordre, 'règles partagées, puis voiture, puis simulateur');
  const app = lire('js/app.js');
  assert.match(app, /type: voitureSeule \? "location-voiture" : sansResidence \? "devis-activites" : "devis-whatsapp"/);
  assert.match(app, /\.\.\.\(voiture && DV \? \{ location: DV\.location\(\) \} : \{\}\)/);
  assert.match(app, /window\.DevisVoiture && window\.DevisVoiture\.verifier\(\)/);
  assert.match(app, /const grandTotal = villaSubtotal \+ addonsTotal \+ montantVoiture;/);
  const voiture = lire('js/devis-voiture.js');
  assert.match(voiture, /LV\.devis\(v, etat\.reglages, demande\(\)\)/);
  assert.match(voiture, /LV\.conflit\(etat\.occupations, devis\.debut, devis\.fin\)/);
  const i18n = lire('js/i18n.js');
  for (const cle of ['t.voiture-seule', 't.location-de-voiture', 'js.demandeRefusee']) assert.equal(i18n.split(`"${cle}": `).length - 1, 3, `${cle} : FR, EN, ES`);
});

test('app : parcours avec étape « Voiture », voiture jointe à la même demande', () => {
  const ecran = lire('mobile/natif/src/app/(onglets)/devis.tsx');
  assert.match(ecran, /if \(mode === 'voiture'\) return \['projet', 'voiture', 'coordonnees'\];/);
  assert.match(ecran, /\['projet', 'dates', 'activites', \.\.\.voiture, 'coordonnees'\]/);
  const regles = lire('mobile/natif/src/donnees/regles.ts');
  assert.match(regles, /type: voitureSeule \? 'location-voiture' : sansResidence \? 'devis-activites' : 'devis-whatsapp'/);
  assert.match(regles, /location: \{ vehicule: vehicule\.id, \.\.\.demandeDeSaisie\(saisie\), conditionsConducteur: saisie\.attestation, montant: montantVoiture \}/);
  assert.match(regles, /const total = sousTotalVilla \+ totalActivites \+ montantVoiture;/);
});

test('app : estimation sans choix d’office, changement de formule sans choix cachés (21/09/2026)', () => {
  const regles = lire('mobile/natif/src/donnees/regles.ts');
  // Aucune résidence préchoisie, aucun repli sur la première du catalogue.
  assert.doesNotMatch(regles, /villaId: actuel\.villaId \|\|/);
  assert.doesNotMatch(regles, /d\.villas\[0\]/);
  assert.match(regles, /const villa = sansResidence \? null : \(d\.villas\.find\(v => v\.id === devis\.villaId\) \|\| null\);/);
  // Nouvelle formule : la résidence part toujours, le reste seulement si le client le garde.
  assert.match(regles, /mode,\n    villaId: '',\n    activites: garder \? repris\.activites : \[\],/);
  assert.match(regles, /activites: mode === 'voiture' \? \[\] : devis\.activites/);
  const ecran = lire('mobile/natif/src/app/(onglets)/devis.tsx');
  assert.match(ecran, /if \(lignesEstimation\.length\) \{ setFormuleDemandee\(mode\); return; \}/);
  assert.match(ecran, /cleEtape === 'projet' && residenceManquante/);
  assert.match(ecran, /return \{ filtre: f\.value, villaId: garde \? d\.villaId : '' \};/);
  assert.match(ecran, /majDevis\(\{ \.\.\.choixEffaces\(donnees\), etape: 1 \}\);/);
  const i18n = lire('mobile/natif/src/donnees/i18n.ts');
  for (const cle of ['devis.erreurResidence', 'devis.changerTitre', 'devis.garderChoix', 'devis.repartirZero', 'devis.detailTitre', 'devis.toutEffacer']) {
    assert.equal(i18n.split(`'${cle}': `).length - 1, 3, `${cle} : FR, EN, ES`);
  }
});
