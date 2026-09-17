// Facebook → site : une publication d'annonce modifiée sur la Page met à jour
// l'annonce (texte et photos), demande du 17/09/2026. Module pur
// db/synchro-facebook.js et fonction réelle de server.js, Graph et disque simulés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SYNC = require('../db/synchro-facebook');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const hote = valeur => JSON.parse(JSON.stringify(valeur));
const SITE = 'https://henri-philippe.com';

test('titre en gras Unicode relu en lettres ordinaires, accents recomposés', () => {
  assert.equal(SYNC.lireTitreFacebook('𝗩𝗜𝗟𝗟𝗔 𝗟’𝗢𝗔𝗦𝗜𝗦 𝗞𝗠 𝟭𝟰'), 'VILLA L’OASIS KM 14');
  assert.equal(SYNC.lireTitreFacebook('𝗗𝗢𝗠𝗔𝗜𝗡𝗘 𝗘́𝗗𝗘𝗡'), 'DOMAINE ÉDEN');
  assert.equal(SYNC.lireTitreFacebook('Titre ordinaire'), 'Titre ordinaire');
});

test('texte de référence : lien du site retiré, espaces et sauts de ligne normalisés', () => {
  assert.equal(SYNC.texteDeReference('𝗩𝗜𝗟𝗟𝗔\r\n\r\nBelle vue.  \n\n\n\nhttps://henri-philippe.com/residences.html', SITE), '𝗩𝗜𝗟𝗟𝗔\n\nBelle vue.');
  assert.equal(SYNC.texteDeReference('Texte\n\nhttps://autre.site/page', SITE), 'Texte\n\nhttps://autre.site/page', 'un lien du propriétaire reste');
});

test('villa : titre inchangé en majuscules → casse du site conservée ; description relue', () => {
  const item = { name: 'Villa L’Oasis', description: 'Ancienne' };
  assert.deepEqual(SYNC.champsDepuisMessage('villa', '𝗩𝗜𝗟𝗟𝗔 𝗟’𝗢𝗔𝗦𝗜𝗦\n\nNouvelle description.\n\nDeuxième paragraphe.\n\nhttps://henri-philippe.com/residences.html', item, SITE),
    { titre: 'Villa L’Oasis', description: 'Nouvelle description.\n\nDeuxième paragraphe.' });
  assert.equal(SYNC.champsDepuisMessage('villa', '𝗩𝗜𝗟𝗟𝗔 𝗟’𝗢𝗔𝗦𝗜𝗦 𝗣𝗥𝗘𝗦𝗧𝗜𝗚𝗘\n\nx', item, SITE).titre, 'VILLA L’OASIS PRESTIGE');
});

test('terrain : référence, lieu, prix et statut foncier écartés ; seule la description est relue', () => {
  const item = { reference: 'T-12', title: 'Parcelle Km 12', location: 'Assinie, Km 12' };
  const message = '𝗧-𝟭𝟮 — 𝗣𝗔𝗥𝗖𝗘𝗟𝗟𝗘 𝗞𝗠 𝟭𝟮\n\nAssinie, Km 12\n\n500 m² · 15 000 000 FCFA (30 000 FCFA/m²)\n\nStatut foncier : ACD\n\nTerrain viabilisé, accès lagune.';
  assert.deepEqual(SYNC.champsDepuisMessage('terrain', message, item, SITE), { titre: 'Parcelle Km 12', description: 'Terrain viabilisé, accès lagune.' });
});

const REFERENCE = { kind: 'villa', id: 'oasis', message: '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nDescription', photos: [{ fbId: '11', local: 'assets/a.webp' }, { fbId: '12', local: 'assets/b.webp' }] };
const CONTENU = () => ({ villas: [{ id: 'oasis', name: 'Villa Oasis', description: 'Description', images: ['assets/a.webp', 'assets/b.webp'] }], terrains: [], activities: [] });
const ORIGINES = new Map([['P1', { kind: 'villa', id: 'oasis' }]]);
const post = extra => ({ id: 'P1', message: '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nDescription\n\nhttps://henri-philippe.com/residences.html', photos: [{ id: '11', src: 'https://scontent.fbcdn.net/11.jpg' }, { id: '12', src: 'https://scontent.fbcdn.net/12.jpg' }], ...extra });

test('plan Facebook → site : rien de changé, rien à faire ; publication sans référence → référence initiale', () => {
  assert.deepEqual(SYNC.planVersSite({ posts: [post()], origines: ORIGINES, references: { P1: REFERENCE }, contenu: CONTENU(), siteUrl: SITE }), []);
  const [init] = SYNC.planVersSite({ posts: [post()], origines: ORIGINES, references: {}, contenu: CONTENU(), siteUrl: SITE });
  assert.equal(init.type, 'reference');
  assert.deepEqual(init.reference, REFERENCE && { message: REFERENCE.message, photos: REFERENCE.photos });
});

test('plan Facebook → site : texte modifié, photo ajoutée ; identifiants de photos absents → photos non concernées', () => {
  const [texte] = SYNC.planVersSite({ posts: [post({ message: '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nTexte corrigé sur Facebook' })], origines: ORIGINES, references: { P1: REFERENCE }, contenu: CONTENU(), siteUrl: SITE });
  assert.deepEqual([texte.type, texte.champs, texte.photos], ['site', { titre: 'Villa Oasis', description: 'Texte corrigé sur Facebook' }, null]);

  const photos = post().photos.concat({ id: '13', src: 'https://scontent.fbcdn.net/13.jpg' });
  const [ajout] = SYNC.planVersSite({ posts: [post({ photos })], origines: ORIGINES, references: { P1: REFERENCE }, contenu: CONTENU(), siteUrl: SITE });
  assert.equal(ajout.champs, null);
  assert.deepEqual(ajout.photos.map(p => p.fbId), ['11', '12', '13']);

  assert.deepEqual(SYNC.planVersSite({ posts: [post({ photos: [] })], origines: ORIGINES, references: { P1: REFERENCE }, contenu: CONTENU(), siteUrl: SITE }), []);
});

test('galerie depuis Facebook : photos retirées sur la Page retirées, ajoutées en place, jamais envoyées conservées en fin', () => {
  const item = { images: ['assets/a.webp', 'assets/b.webp', 'assets/onzieme.webp'] };
  const locales = new Map([['11', 'assets/a.webp'], ['13', 'assets/uploads/facebook-13.jpg']]);
  assert.deepEqual(SYNC.galerieDepuisFacebook(item, [{ fbId: '13' }, { fbId: '11' }], REFERENCE, locales),
    ['assets/uploads/facebook-13.jpg', 'assets/a.webp', 'assets/onzieme.webp']);
});

test('plan site → Facebook : case jamais enregistrée → la Page fait foi, rien n’est publié ni retiré', () => {
  const message = item => `𝗩𝗜𝗟𝗟𝗔 ${item.id}`;
  const contenu = { villas: [{ id: 'ancienne', images: ['a.jpg'] }], terrains: [], activities: [] };
  assert.deepEqual(SYNC.planVersFacebook({ contenu, message }), []);
  const publiees = new Map([['villa:ancienne', { facebookId: 'P9' }]]);
  assert.deepEqual(SYNC.planVersFacebook({ contenu, publiees, message }), [], 'publiée, sans référence encore : rien');
});

/** appliquerFacebookVersSite réel, avec contenu, références et téléchargement simulés. */
function appliquer({ references, contenu, telechargements = {} }) {
  const debut = server.indexOf('async function appliquerFacebookVersSite(');
  const fin = server.indexOf('\n}\n', debut) + 3;
  const ecrits = { contenu: null, synchro: null, audits: [], sauvegardes: 0, telecharges: [] };
  const contexte = vm.createContext({
    SYNC, Map, PUBLIC_SITE_URL: SITE, FB_SYNCHRO_FILE: 'synchro', CONTENT_FILE: 'contenu',
    fs: { existsSync: () => true },
    lireContenuBrut: async () => structuredClone(contenu),
    lireReferencesFacebook: () => structuredClone(references),
    originesPublications: () => ORIGINES,
    telechargerPhotoFacebook: async photo => { ecrits.telecharges.push(photo.fbId); if (!telechargements[photo.fbId]) throw new Error('injoignable'); return telechargements[photo.fbId]; },
    createBackup: () => { ecrits.sauvegardes += 1; },
    store: { writeContent: async valeur => { ecrits.contenu = structuredClone(valeur); return { persistedToDb: true, dbExpected: true }; } },
    writeJSON: (fichier, valeur) => { ecrits.synchro = structuredClone(valeur); },
    audit: (evenement, details) => ecrits.audits.push({ evenement, details }),
    nomAnnonce: item => item.name, text: (v, max) => String(v ?? '').slice(0, max)
  });
  vm.runInContext(`${server.slice(debut, fin)}\nthis.appliquer = appliquerFacebookVersSite;`, contexte);
  return { appliquer: contexte.appliquer, ecrits };
}

test('serveur : texte et photo modifiés sur Facebook → annonce mise à jour, référence réalignée, horodatage renouvelé', async () => {
  const a = appliquer({ references: { P1: REFERENCE }, contenu: CONTENU(), telechargements: { 13: 'assets/uploads/facebook-13.jpg' } });
  const photos = [{ id: '13', src: 'https://scontent.fbcdn.net/13.jpg' }, { id: '11', src: 'https://scontent.fbcdn.net/11.jpg' }];
  const bilan = hote(await a.appliquer([post({ message: '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nCorrigé sur la Page', photos })]));
  assert.deepEqual(bilan.annonces, [{ kind: 'villa', id: 'oasis', texte: true, photos: true }]);
  assert.deepEqual(a.ecrits.telecharges, ['13'], 'seule la nouvelle photo est téléchargée');
  const villa = a.ecrits.contenu.villas[0];
  assert.equal(villa.description, 'Corrigé sur la Page');
  assert.deepEqual(villa.images, ['assets/uploads/facebook-13.jpg', 'assets/a.webp']);
  assert.ok(a.ecrits.contenu.updatedAt, 'un studio ouvert avant ne pourra plus écraser ce changement');
  assert.equal(a.ecrits.sauvegardes, 1);
  assert.deepEqual(a.ecrits.synchro.references.P1.photos, [{ fbId: '13', local: 'assets/uploads/facebook-13.jpg' }, { fbId: '11', local: 'assets/a.webp' }]);
  assert.equal(a.ecrits.synchro.references.P1.message, '𝗩𝗜𝗟𝗟𝗔 𝗢𝗔𝗦𝗜𝗦\n\nCorrigé sur la Page');
});

test('serveur : photo injoignable → annonce inchangée, référence inchangée (nouvel essai à la synchronisation suivante)', async () => {
  const a = appliquer({ references: { P1: REFERENCE }, contenu: CONTENU() });
  const bilan = hote(await a.appliquer([post({ photos: [...post().photos, { id: '13', src: 'https://scontent.fbcdn.net/13.jpg' }] })]));
  assert.deepEqual(bilan.annonces, []);
  assert.match(bilan.erreurs[0], /Villa Oasis : injoignable/);
  assert.equal(a.ecrits.contenu, null);
  assert.deepEqual(a.ecrits.synchro.references.P1, REFERENCE);
});
