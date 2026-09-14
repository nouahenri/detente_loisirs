// Albums Facebook : toutes les images d'une publication, pas seulement la
// vignette de couverture. Tests isolés — aucun appel réseau réel.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };

/** Isole facebookPostImages dans un bac à sable. */
function extracteurImages() {
  const debut = server.indexOf('function facebookPostImages(post) {');
  const fin = server.indexOf('\n}', debut) + 2;
  assert.ok(debut > 0, 'facebookPostImages introuvable dans server.js');
  const contexte = vm.createContext({
    // URL est un global de Node, absent d un contexte vm nu : sans lui, la
    // deduplication par chemin retomberait silencieusement sur l URL entiere.
    URL,
    // La vraie safePublicUrl rejette ce qui n'est pas http(s) : on la reproduit.
    safePublicUrl: valeur => {
      try {
        const u = new URL(String(valeur));
        return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
      } catch { return ''; }
    }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.images = facebookPostImages;', contexte);
  // Array.from ramène le tableau dans le realm de l'hôte : un tableau né dans
  // le contexte vm a un autre Array.prototype, et deepStrictEqual échouerait
  // sur cette seule différence d'identité, pas sur le contenu.
  return post => Array.from(contexte.images(post));
}

/** Isole la récupération des publications, champs compris. */
function recuperateur(options = {}) {
  const debut = server.indexOf('let edgePublications = null;');
  const fin = server.indexOf('\n}', server.indexOf('async function getFacebookPosts()')) + 2;
  const appels = [];
  const contexte = vm.createContext({
    PAGE_ID: '100737595756553',
    console: quiet,
    URL,
    text: (valeur, max) => String(valeur ?? '').slice(0, max),
    graphRequest: async chemin => {
      appels.push(chemin);
      if (options.refuserAlbums && /attachments/.test(chemin)) {
        throw new Error('(#100) Tried accessing nonexisting field (attachments) on node type (Post)');
      }
      if (options.refuserLimite && /\.limit\(/.test(chemin)) {
        throw new Error('(#100) Syntax error "Expected end of string instead of "."."');
      }
      if (options.repondre) return options.repondre(chemin);
      return { data: [] };
    }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.get = getFacebookPosts;', contexte);
  return { get: contexte.get, appels };
}

const IMG = n => `https://scontent.xx.fbcdn.net/photo-${n}.jpg`;

test('album : toutes les sous-pièces sont retenues, dans l’ordre', () => {
  const images = extracteurImages();
  const resultat = images({
    full_picture: IMG(1),
    attachments: {
      data: [{
        media_type: 'album',
        media: { image: { src: IMG(1) } },
        subattachments: { data: [1, 2, 3].map(n => ({ media: { image: { src: IMG(n) } } })) }
      }]
    }
  });
  assert.deepEqual(resultat, [IMG(1), IMG(2), IMG(3)]);
});

test('photo unique : l’image de la pièce suffit, sans doublon avec full_picture', () => {
  const images = extracteurImages();
  const resultat = images({
    full_picture: IMG(7),
    attachments: { data: [{ media_type: 'photo', media: { image: { src: IMG(7) } } }] }
  });
  assert.deepEqual(resultat, [IMG(7)], 'la couverture ne doit pas être comptée deux fois');
});

test('publication sans attachments : repli sur full_picture', () => {
  const images = extracteurImages();
  assert.deepEqual(images({ full_picture: IMG(9) }), [IMG(9)]);
});

test('publication déjà stockée avant l’évolution : son tableau images est repris', () => {
  const images = extracteurImages();
  assert.deepEqual(images({ images: [IMG(1), IMG(2)] }), [IMG(1), IMG(2)]);
});

test('publication sans aucune image : tableau vide, jamais de trou', () => {
  const images = extracteurImages();
  assert.deepEqual(images({ message: 'texte seul' }), []);
});

test('URL invalide écartée sans faire tomber le lot', () => {
  const images = extracteurImages();
  const resultat = images({
    attachments: {
      data: [{ subattachments: { data: [
        { media: { image: { src: 'javascript:alert(1)' } } },
        { media: { image: { src: IMG(4) } } }
      ] } }]
    }
  });
  assert.deepEqual(resultat, [IMG(4)]);
});

test('la requête Graph réclame les albums entiers, pas leur première page', async () => {
  const r = recuperateur();
  await r.get();
  assert.match(r.appels[0], /attachments\{media_type,media,target\{id\},subattachments\.limit\(100\)\{media\}\}/,
    'sans .limit(), Graph coupe les sous-pièces à 12 photos');
});

test('album paginé : les pages suivantes sont récupérées et ajoutées', async () => {
  const page = (debut, fin, next) => ({
    data: Array.from({ length: fin - debut }, (_, i) => ({ media: { image: { src: IMG(debut + i) } } })),
    ...(next ? { paging: { next } } : {})
  });
  const r = recuperateur({
    repondre: chemin => {
      if (/after=P2/.test(chemin)) return page(24, 30);
      if (/after=P1/.test(chemin)) return page(12, 24, 'https://graph.facebook.com/v25.0/123/subattachments?after=P2');
      return { data: [{ id: 'p1', attachments: { data: [{
        subattachments: page(0, 12, 'https://graph.facebook.com/v25.0/123/subattachments?after=P1')
      }] } }] };
    }
  });
  const resultat = await r.get();
  const sous = resultat.data[0].attachments.data[0].subattachments.data;
  assert.equal(sous.length, 30, 'les 30 photos de l’album doivent être là');
  assert.equal(r.appels[1], '123/subattachments?after=P1', 'la version est retirée du chemin suivi');
});

test('pagination vers un autre domaine : jamais suivie', async () => {
  const r = recuperateur({
    repondre: () => ({ data: [{ id: 'p1', attachments: { data: [{
      subattachments: { data: [], paging: { next: 'https://exemple.com/v25.0/vol?after=X' } }
    }] } }] })
  });
  await r.get();
  assert.equal(r.appels.length, 1, 'le jeton ne doit partir que vers graph.facebook.com');
});

test('.limit() refusé : repli sur la pagination par défaut, albums conservés', async () => {
  const r = recuperateur({ refuserLimite: true });
  await r.get();
  assert.equal(r.appels.length, 2);
  assert.match(r.appels[0], /subattachments\.limit\(100\)/);
  assert.match(r.appels[1], /subattachments\{media\}/, 'le repli garde les albums');
});

test('champ attachments refusé : repli sur les champs de base plutôt qu’échec', async () => {
  const r = recuperateur({ refuserAlbums: true });
  const resultat = await r.get();
  assert.ok(resultat, 'la synchronisation doit aboutir malgré le refus');
  assert.equal(r.appels.length, 3, 'albums par 100, albums standard, puis sans albums');
  assert.match(r.appels[0], /attachments/);
  assert.match(r.appels[1], /attachments/);
  assert.doesNotMatch(r.appels[2], /attachments/);

  // Le repli est mémorisé : plus aucun appel perdu ensuite.
  await r.get();
  assert.equal(r.appels.length, 4);
  assert.doesNotMatch(r.appels[3], /attachments/);
});

test('album de plus de 20 photos : aucune n’est écartée', () => {
  const images = extracteurImages();
  const resultat = images({
    attachments: { data: [{ subattachments: {
      data: Array.from({ length: 35 }, (_, n) => ({ media: { image: { src: IMG(n) } } }))
    } }] }
  });
  assert.equal(resultat.length, 35);
});

test('une erreur étrangère aux albums remonte telle quelle', async () => {
  const debut = server.indexOf('let edgePublications = null;');
  const fin = server.indexOf('\n}', server.indexOf('async function getFacebookPosts()')) + 2;
  const contexte = vm.createContext({
    PAGE_ID: 'x', console: quiet,
    graphRequest: async () => { throw new Error('(#190) Invalid OAuth access token'); }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.get = getFacebookPosts;', contexte);
  await assert.rejects(contexte.get(), /Invalid OAuth access token/,
    'un jeton expiré ne doit pas être confondu avec un champ refusé');
});

test('une seule photo servie sous deux URL signées ne compte qu’une fois', () => {
  // Constaté en production le 12/09/2026 : une publication à une photo
  // annonçait « 2 photos ». Meta renvoie le même fichier dans `full_picture`
  // et dans `attachments`, avec des jetons et des tailles différents.
  const images = extracteurImages();
  const base = 'https://scontent.xx.fbcdn.net/v/t39/808008325_1085535100653882_n.jpg';
  const resultat = images({
    full_picture: `${base}?stp=dst-jpg_p720x720&_nc_ohc=AAA&oe=6AAB48A4`,
    attachments: { data: [{ media: { image: { src: `${base}?_nc_cat=110&_nc_ohc=BBB&oe=6AAB295B` } } }] }
  });
  assert.equal(resultat.length, 1, 'le même fichier ne doit apparaître qu’une fois');
});

test('deux fichiers distincts restent deux photos', () => {
  const images = extracteurImages();
  const resultat = images({
    attachments: { data: [{ subattachments: { data: [
      { media: { image: { src: 'https://scontent.xx.fbcdn.net/v/t39/aaa.jpg?jeton=1' } } },
      { media: { image: { src: 'https://scontent.xx.fbcdn.net/v/t39/bbb.jpg?jeton=2' } } }
    ] } }] }
  });
  assert.equal(resultat.length, 2);
});
