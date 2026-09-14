// Menu « Messages » : campagnes WhatsApp promotionnelles (13/09/2026).
// Décisions : envoi par liens wa.me ; accord explicite obligatoire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const WA = require(path.join(root, 'db', 'whatsapp-promo.js'));
const lire = fichier => fs.readFileSync(path.join(root, fichier), 'utf8');

const DEMANDES = [
  // Ancienne demande, avant la case : accord non recueilli.
  { id: 'a', name: 'Ama Konan', phone: '+225 05 00 00 00 00', createdAt: '2026-09-10T10:00:00Z' },
  // Aya : accord donné, puis nouvelle demande AVEC accord (même numéro, écrit autrement).
  { id: 'b', name: 'Aya Kouassi', phone: '07 11 22 33 44', createdAt: '2026-09-13T18:00:00Z', whatsappOptIn: true, whatsappOptInAt: '2026-09-13T18:00:00Z' },
  { id: 'c', name: 'Aya Kouassi', phone: '+225 0711223344', createdAt: '2026-09-14T09:00:00Z', whatsappOptIn: true, whatsappOptInAt: '2026-09-14T09:00:00Z' },
  // Yao : accord, puis demande plus récente case décochée → accord retiré.
  { id: 'd', name: 'Yao', phone: '0700000001', createdAt: '2026-09-13T08:00:00Z', whatsappOptIn: true },
  { id: 'e', name: 'Yao', phone: '0700000001', createdAt: '2026-09-13T20:00:00Z', whatsappOptIn: false },
  // Koffi : accord, mais « ne plus contacter ».
  { id: 'f', name: 'Koffi', phone: '0700000002', createdAt: '2026-09-13T09:00:00Z', whatsappOptIn: true },
  // Sans numéro exploitable : ignoré.
  { id: 'g', name: 'Visiteur', phone: '12', createdAt: '2026-09-13T09:00:00Z', whatsappOptIn: true }
];
const STOPS = { '2250700000002': { le: '2026-09-13T21:00:00Z' } };

test('numéros : 10 chiffres = Côte d’Ivoire, 00 retiré, trop court refusé', () => {
  assert.equal(WA.normaliserTelephone('07 11 22 33 44'), '2250711223344');
  assert.equal(WA.normaliserTelephone('+225 07 11 22 33 44'), '2250711223344');
  assert.equal(WA.normaliserTelephone('0033 6 12 34 56 78'), '33612345678');
  assert.equal(WA.normaliserTelephone('12'), '');
});

test('contacts : dédoublonnés par numéro, dernier choix exprimé, « ne plus contacter » prioritaire', () => {
  const contacts = WA.contactsDepuisDemandes(DEMANDES, STOPS);
  const par = Object.fromEntries(contacts.map(c => [c.nom, c]));
  assert.equal(contacts.length, 4, 'le numéro inexploitable est écarté');
  assert.equal(par['Aya Kouassi'].demandes, 2);
  assert.equal(par['Aya Kouassi'].eligible, true);
  assert.equal(par['Ama Konan'].accord, null, 'avant la case : non recueilli');
  assert.equal(par['Ama Konan'].eligible, false);
  assert.equal(par.Yao.accord, false, 'la demande la plus récente retire l’accord');
  assert.equal(par.Yao.eligible, false);
  assert.equal(par.Koffi.stop, true);
  assert.equal(par.Koffi.eligible, false);
});

test('message : variables remplacées, pas de « Bonjour , », mention STOP toujours ajoutée', () => {
  assert.equal(WA.personnaliser('Bonjour {prenom}, -15 % ce week-end !', { nom: 'Aya Kouassi' }),
    `Bonjour Aya, -15 % ce week-end !\n\n${WA.MENTION_STOP}`);
  assert.equal(WA.personnaliser('Bonjour {prenom}, offre spéciale.', { nom: '' }), `Bonjour, offre spéciale.\n\n${WA.MENTION_STOP}`);
  assert.match(WA.lienWhatsApp('2250711223344', 'Bonjour Aya'), /^https:\/\/wa\.me\/2250711223344\?text=Bonjour%20Aya$/);
});

test('campagne : destinataires figés = contacts avec accord seulement ; refus sans destinataire ou sans texte', () => {
  const contacts = WA.contactsDepuisDemandes(DEMANDES, STOPS);
  const campagne = WA.creerCampagne({ titre: 'Tabaski', message: 'Bonjour {prenom} !' }, contacts, 'henri');
  assert.deepEqual(campagne.destinataires.map(d => d.nom), ['Aya Kouassi']);
  assert.equal(campagne.destinataires[0].statut, 'a-envoyer');
  assert.throws(() => WA.creerCampagne({ titre: 'x', message: 'y' }, []), /Aucun client/);
  assert.throws(() => WA.creerCampagne({ titre: '', message: 'y' }, contacts), /titre/);
  assert.throws(() => WA.creerCampagne({ titre: 'x', message: 'a'.repeat(1501) }, contacts), /trop long/);
});

test('sélection : un, plusieurs ou tous ; un numéro sans accord glissé dans la liste est écarté', () => {
  const contacts = WA.contactsDepuisDemandes([
    ...DEMANDES,
    { id: 'h', name: 'Adjoua', phone: '0700000003', createdAt: '2026-09-13T10:00:00Z', whatsappOptIn: true },
    { id: 'i', name: 'Serge', phone: '0700000004', createdAt: '2026-09-13T11:00:00Z', whatsappOptIn: true }
  ], STOPS);
  const noms = campagne => campagne.destinataires.map(d => d.nom).sort();
  assert.deepEqual(noms(WA.creerCampagne({ titre: 't', message: 'm' }, contacts)), ['Adjoua', 'Aya Kouassi', 'Serge'], 'sans liste : tous');
  assert.deepEqual(noms(WA.creerCampagne({ titre: 't', message: 'm', destinataires: ['0700000003'] }, contacts)), ['Adjoua'], 'un seul, numéro écrit autrement');
  assert.deepEqual(noms(WA.creerCampagne({ titre: 't', message: 'm', destinataires: ['2250700000003', '2250700000004'] }, contacts)), ['Adjoua', 'Serge']);
  // Ama (accord non recueilli) et Koffi (ne plus contacter) ne peuvent pas être forcés.
  assert.deepEqual(noms(WA.creerCampagne({ titre: 't', message: 'm', destinataires: ['2250711223344', '2250500000000', '2250700000002'] }, contacts)), ['Aya Kouassi']);
  assert.throws(() => WA.creerCampagne({ titre: 't', message: 'm', destinataires: [] }, contacts), /au moins un destinataire/);
  assert.throws(() => WA.creerCampagne({ titre: 't', message: 'm', destinataires: ['2250500000000'] }, contacts), /au moins un destinataire/);
});

test('suivi : envoyé / ignoré / annulé, compteurs et liens personnalisés pour le studio', () => {
  const contacts = WA.contactsDepuisDemandes(DEMANDES, {});
  const campagne = WA.creerCampagne({ titre: 'Promo', message: 'Bonjour {prenom}' }, contacts, 'henri');
  const cleAya = '2250711223344';
  WA.marquerDestinataire(campagne, cleAya, 'envoye', 'henri');
  let vue = WA.campagnePourStudio(campagne, {});
  assert.deepEqual(vue.compteurs, { total: 2, envoyes: 1, ignores: 0, restants: 1 });
  const aya = vue.destinataires.find(d => d.cle === cleAya);
  assert.ok(aya.le && aya.par === 'henri');
  assert.equal(decodeURIComponent(aya.lien.split('text=')[1]), `Bonjour Aya\n\n${WA.MENTION_STOP}`);
  WA.marquerDestinataire(campagne, cleAya, 'a-envoyer');
  vue = WA.campagnePourStudio(campagne, { [cleAya]: { le: 'x' } });
  assert.equal(vue.compteurs.envoyes, 0);
  assert.equal(vue.destinataires.find(d => d.cle === cleAya).stop, true, 'passé en « ne plus contacter » après la création');
  assert.throws(() => WA.marquerDestinataire(campagne, cleAya, 'supprime'), /Statut inconnu/);
});

test('serveur : routes protégées par leads:read / leads:write, accord enregistré avec la demande', () => {
  const server = lire('server.js');
  for (const route of [
    "['GET', /^\\/api\\/admin\\/whatsapp$/, 'leads:read']",
    "['POST', /^\\/api\\/admin\\/whatsapp\\/campagnes$/, 'leads:write']",
    "['PATCH', /^\\/api\\/admin\\/whatsapp\\/campagnes\\/[^/]+$/, 'leads:write']",
    "['DELETE', /^\\/api\\/admin\\/whatsapp\\/campagnes\\/[^/]+$/, 'leads:write']",
    "['POST', /^\\/api\\/admin\\/whatsapp\\/stop$/, 'leads:write']"
  ]) assert.ok(server.includes(route), route);
  assert.match(server, /if \(typeof payload\.whatsappOptIn === 'boolean'\)/);
  assert.match(server, /split\('\/'\)\[5\]/, 'identifiant de campagne = segment 5 de /api/admin/whatsapp/campagnes/<id>');
});

test('base : colonnes d’accord identiques dans le schéma, la migration phpMyAdmin et la migration automatique', () => {
  const migration = lire('db/migration-whatsapp.sql');
  const colonnes = [...migration.matchAll(/ADD COLUMN `(\w+)`/g)].map(m => m[1]);
  assert.deepEqual(colonnes, ['whatsapp_optin', 'whatsapp_optin_at']);
  const schema = lire('db/schema.sql');
  const leads = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS `leads`'));
  const migrate = lire('scripts/migrate.js');
  for (const colonne of colonnes) {
    assert.match(leads.slice(0, leads.indexOf(') ENGINE')), new RegExp(`\`${colonne}\``));
    assert.ok(migrate.includes(`['leads', '${colonne}'`), colonne);
  }
  const repo = lire('db/repository.js');
  assert.match(repo, /whatsapp_optin, whatsapp_optin_at\)/);
  assert.match(repo, /if \(!colonneAbsente\(error\)\) throw error;\s+await query\(\s+`INSERT INTO leads \(id, type/, 'repli sans les colonnes avant migration');
});

test('simulateur : case d’accord décochée par défaut, traduite, envoyée avec la demande', () => {
  const devis = lire('devis.html');
  const caseAccord = devis.match(/<input[^>]*id="simOptin"[^>]*>/)[0];
  assert.doesNotMatch(caseAccord, /checked/);
  assert.equal(lire('js/i18n.js').split('"t.optin-whatsapp"').length - 1, 3);
  assert.match(lire('js/app.js'), /whatsappOptIn: optinInput\.checked/);
});
