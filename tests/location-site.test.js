// Page « Location de voitures » du site (17/09/2026).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const page = lire('voitures.html');
const script = lire('js/voitures.js');

test('page : règles partagées chargées avant la page, avis des visiteurs, textes traduits', () => {
  const ordre = ['js/i18n.js', 'js/location-voitures.js', 'js/voitures.js', 'js/avis.js'].map(f => page.indexOf(`<script src="${f}`));
  assert.ok(ordre.every(i => i > 0), 'scripts présents');
  assert.deepEqual([...ordre].sort((a, b) => a - b), ordre, 'ordre de chargement');
  assert.match(page, /data-i18n="t\.voitures-titre"/);
  const i18n = lire('js/i18n.js');
  assert.equal((i18n.match(/"t\.voitures": /g) || []).length, 3, 'FR, EN, ES');
  assert.equal((i18n.match(/"meta\.voitures\.titre": /g) || []).length, 3);
});

test('menu et pied de page : lien « Voitures » sur toutes les pages publiques', () => {
  for (const f of ['index.html', 'residences.html', 'terrains.html', 'loisirs.html', 'devis.html', 'faq.html', 'contact.html', 'confidentialite.html', 'voitures.html']) {
    assert.equal((lire(f).match(/href="voitures\.html"/g) || []).length, 2, f);
  }
});

test('réservation : estimation partagée, dates occupées bloquantes, attestation sans chauffeur, envoi au serveur', () => {
  assert.match(script, /const devis = LV\.devis\(v, etat\.reglages, d\);/);
  assert.match(script, /LV\.conflit\(occupations, devis\.debut, devis\.fin\)/);
  assert.match(script, /\/api\/location\/disponibilites\?vehicule=/);
  assert.match(script, /form\.querySelector\("\[data-envoyer\]"\)\.disabled = !devis\.ok \|\| Boolean\(gene\);/);
  assert.match(script, /form\.querySelector\("\[data-attestation\]"\)\.hidden = devis\.chauffeur/);
  assert.match(script, /fetch\("\/api\/location\/demande"/);
  assert.match(script, /source: "site"/);
});

test('fiche : liée aux avis (J’aime, commentaires) et ouvrable par lien direct voitures.html#id', () => {
  assert.match(script, /new CustomEvent\("dl:annonce-ouverte", \{ detail: \{ kind: "vehicle"/);
  assert.match(script, /window\.VEHICULES_DATA = etat\.vehicules;/);
  assert.match(script, /window\.ouvrirVehicule = ouvrirVehicule;/);
  const avis = lire('js/avis.js');
  assert.match(avis, /\["vehicle", "\.vehicule-card\[data-id\]", "\.vehicule-card-titre"\]/);
  assert.match(avis, /kind === "vehicle" && typeof window\.ouvrirVehicule === "function"/);
});
