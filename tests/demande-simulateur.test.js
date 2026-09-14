// Simulateur de devis : coordonnées du demandeur et accusé de réception
// (demandes du propriétaire, 13/09/2026). Aucun envoi réel, aucune écriture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const templates = require(path.join(root, 'db', 'mail-templates.js'));
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const DEMANDE = {
  id: 'L1', type: 'devis-whatsapp', name: 'Kouassi <Aya>', phone: '+225 07 11 22 33 44',
  email: 'aya@exemple.ci', villa: "Villa L'Oasis d'Assinie", dates: '2026-09-18 → 2026-09-20',
  amount: 560000, message: '8 voyageur(s) · Balade privée en Bateau vers La Passe'
};

test('gabarit : prise en charge (pas une réservation confirmée), récapitulatif complet, HTML échappé', () => {
  const m = templates.leadConfirmation({ lead: DEMANDE, siteUrl: 'https://exemple.test' });
  assert.equal(m.subject, 'Votre demande de réservation est prise en charge');
  assert.match(m.html, /Kouassi &lt;Aya&gt;/);
  assert.doesNotMatch(m.html, /<Aya>/);
  for (const attendu of ['Villa L&#39;Oasis d&#39;Assinie', '560', 'Balade privée', '+225 07 11 22 33 44', 'estimation']) {
    assert.ok(m.html.includes(attendu), `HTML sans « ${attendu} »`);
  }
  assert.match(m.text, /Dates : 2026-09-18 au 2026-09-20/);
  assert.match(m.text, /Estimation : 560\s000 FCFA/);
});

test('gabarit : activités seules, sans ligne « Résidence »', () => {
  const m = templates.leadConfirmation({ lead: { ...DEMANDE, type: 'devis-activites', villa: 'Activités uniquement' } });
  assert.match(m.text, /Formule : Activités uniquement \(sans hébergement\)/);
  assert.doesNotMatch(m.text, /Résidence :/);
});

function envoi() {
  const debut = server.indexOf('const TYPES_DEMANDE_SIMULATEUR');
  const fin = server.indexOf('/**\n * Envoi d\'une campagne', debut);
  assert.ok(debut > 0 && fin > debut, 'confirmLeadToClient introuvable dans server.js');
  const journal = { envois: [], audits: [] };
  const contexte = vm.createContext({
    templates,
    publicBaseUrl: () => 'https://exemple.test',
    text: (v, max) => String(v ?? '').slice(0, max),
    audit: (evenement, details) => journal.audits.push({ evenement, details }),
    mailer: { deliver: async message => { journal.envois.push(message); return { sent: true }; } }
  });
  vm.runInContext(`${server.slice(debut, fin)}\nthis.confirmer = confirmLeadToClient;`, contexte);
  return { confirmer: contexte.confirmer, journal };
}

test('serveur : e-mail envoyé au client pour une demande du simulateur', async () => {
  const e = envoi();
  await e.confirmer(DEMANDE, {});
  assert.equal(e.journal.envois.length, 1);
  assert.equal(e.journal.envois[0].to, 'aya@exemple.ci');
  assert.equal(e.journal.envois[0].kind, 'confirmation-demande');
  assert.equal(e.journal.audits[0].evenement, 'lead.confirmation_sent');
  assert.doesNotMatch(JSON.stringify(e.journal.audits), /aya@exemple/, 'pas d’adresse dans le journal d’audit');
});

test('serveur : rien sans e-mail (champ facultatif), rien pour les autres formulaires', async () => {
  const e = envoi();
  await e.confirmer({ ...DEMANDE, email: '' }, {});
  await e.confirmer({ ...DEMANDE, type: 'contact' }, {});
  await e.confirmer({ ...DEMANDE, type: 'newsletter' }, {});
  assert.equal(e.journal.envois.length, 0);
});

test('serveur : la route /api/leads déclenche l’accusé de réception après l’enregistrement', () => {
  const debut = server.indexOf("url.pathname === '/api/leads'");
  const bloc = server.slice(debut, server.indexOf('return json(res, 201', debut));
  assert.ok(bloc.indexOf('store.createLead(lead)') < bloc.indexOf('confirmLeadToClient(lead, req)'));
});

function studio() {
  const admin = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
  const debut = admin.indexOf('const LEAD_STATUTS');
  const fin = admin.indexOf('function openLeadEditor(');
  assert.ok(debut > 0 && fin > debut, 'résumé des demandes introuvable dans js/admin.js');
  const contexte = vm.createContext({ Intl, Date });
  // renderLeads dépend du DOM : on n'extrait que les deux fonctions pures.
  const source = admin.slice(debut, fin).replace(/function renderLeads\(\) \{[\s\S]*?\n  \}\n/, '');
  vm.runInContext(`${source}\nthis.resume = resumeDemande; this.wa = lienWhatsApp;`, contexte);
  return contexte;
}

test('studio : résumé d’une demande du simulateur (lieu, dates, durée, voyageurs, options)', () => {
  const s = studio();
  const d = s.resume({ type: 'devis-whatsapp', villa: 'Villa Oasis', dates: '2026-09-18 → 2026-09-20', message: '8 voyageur(s) · Balade (forfait), Jet-ski (8 pers.)' });
  assert.equal(d.formule, 'Séjour');
  assert.equal(d.duree, 2);
  assert.equal(d.voyageurs, '8');
  assert.deepEqual([...d.options], ['Balade (forfait)', 'Jet-ski (8 pers.)']);
  assert.equal(d.brief, 'Villa Oasis · 18 sept. → 20 sept. · 2 nuits · 8 voyageurs · 2 options');

  const sans = s.resume({ type: 'devis-activites', villa: 'Activités uniquement', dates: '2026-09-18 → 2026-09-19', message: '15+ voyageur(s) · Sans option' });
  assert.equal(sans.brief, '18 sept. → 19 sept. · 1 journée · 15+ voyageurs');
  assert.equal(sans.options.length, 0);
});

test('studio : demande hors simulateur, texte libre conservé ; lien WhatsApp normalisé', () => {
  const s = studio();
  const d = s.resume({ type: 'terrain', terrainRef: 'TER-ASS-002', message: 'Intéressée par la parcelle.' });
  assert.equal(d.brief, 'Terrain TER-ASS-002');
  assert.equal(d.voyageurs, '');
  assert.equal(s.wa('+225 07 11 22 33 44'), 'https://wa.me/2250711223344');
  assert.equal(s.wa('07 11 22 33 44'), 'https://wa.me/2250711223344', '10 chiffres = numéro ivoirien');
  assert.equal(s.wa('0033 6 12 34 56 78'), 'https://wa.me/33612345678');
  assert.equal(s.wa('12'), '');
});

test('simulateur : nom, téléphone WhatsApp et e-mail présents ; nom et téléphone obligatoires', () => {
  const html = fs.readFileSync(path.join(root, 'devis.html'), 'utf8');
  assert.match(html, /id="simNom"[^>]*required/);
  assert.match(html, /id="simTel"[^>]*required/);
  assert.match(html, /id="simEmail"/);
  assert.doesNotMatch(html.match(/<input[^>]*id="simEmail"[^>]*>/)[0], /required/, 'e-mail facultatif');
  const i18n = fs.readFileSync(path.join(root, 'js', 'i18n.js'), 'utf8');
  for (const cle of ['t.vos-coordonnees', 't.nom-et-prenom', 't.telephone-contact', 't.adresse-email', 'js.contactNomRequis', 'js.contactTelRequis']) {
    assert.equal(i18n.split(`"${cle}"`).length - 1, 3, `${cle} doit exister en FR, EN et ES`);
  }
});
