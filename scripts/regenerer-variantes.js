/**
 * Régénère les variantes WebP et le manifeste d'images.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Les variantes étaient nommées 480 / 960 / 1600 et le `srcset` annonçait ces
 * largeurs. Or `withoutEnlargement` empêche d'agrandir une source plus petite :
 * le fichier « -1600.webp » d'une photo de 1376 px ne faisait que 1376 px, et
 * celui d'une image de 1024 px seulement 1024 px. Le navigateur, lui, croyait
 * disposer de 1600 px : il choisissait ce fichier pour un emplacement large,
 * puis devait l'agrandir — d'où des images visiblement floues.
 *
 * CE QUE FAIT LE SCRIPT
 * La clé de chaque variante est désormais SA LARGEUR RÉELLE. Le `srcset` dit
 * donc la vérité et le navigateur choisit correctement. On repart en outre de
 * l'original non recompressé lorsqu'il existe (`assets/images/_originaux`),
 * pour éviter d'empiler deux compressions.
 *
 * Usage : node scripts/regenerer-variantes.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DOSSIER = 'assets/images';
const ORIGINAUX = path.join(DOSSIER, '_originaux');
const SORTIE = path.join(DOSSIER, 'opt');
const MANIFESTE = 'data/image-manifest.json';

// Paliers visés. Chaque palier n'est produit que si la source est au moins
// aussi large : on ne fabrique jamais de pixels qui n'existent pas.
const PALIERS = [480, 960, 1440, 1920];
const QUALITE = 82;

function estImage(f) {
  return /\.(jpe?g|png)$/i.test(f);
}

(async () => {
  if (!fs.existsSync(SORTIE)) fs.mkdirSync(SORTIE, { recursive: true });

  const fichiers = fs.readdirSync(DOSSIER).filter(estImage);
  const manifeste = {};
  let produites = 0;
  let ignorees = 0;

  for (const fichier of fichiers) {
    const base = fichier.replace(/\.(jpe?g|png)$/i, '');
    const servi = path.join(DOSSIER, fichier);

    // L'original prime : recompresser un JPEG déjà compressé dégrade l'image.
    const original = path.join(ORIGINAUX, fichier);
    const source = fs.existsSync(original) ? original : servi;

    let meta;
    try {
      meta = await sharp(source).metadata();
    } catch (e) {
      console.log('  ignoré (illisible) : ' + fichier);
      ignorees += 1;
      continue;
    }
    if (!meta.width) { ignorees += 1; continue; }

    // Largeurs réellement productibles, la source elle-même comprise pour ne
    // pas perdre sa pleine définition sur les grands écrans.
    const largeurs = [...new Set(
      PALIERS.filter(p => p <= meta.width).concat(
        PALIERS.some(p => p === meta.width) ? [] : [Math.min(meta.width, PALIERS[PALIERS.length - 1])]
      )
    )].sort((a, b) => a - b);

    const webp = {};
    for (const largeur of largeurs) {
      const nom = `${base}-${largeur}.webp`;
      const cible = path.join(SORTIE, nom);
      await sharp(source)
        .resize({ width: largeur, withoutEnlargement: true })
        .webp({ quality: QUALITE })
        .toFile(cible);
      // On relit la largeur obtenue : c'est elle, et non le palier visé, qui
      // fait foi dans le manifeste.
      const reelle = (await sharp(cible).metadata()).width;
      webp[String(reelle)] = path.posix.join(DOSSIER, 'opt', nom);
      produites += 1;
    }

    manifeste[path.posix.join(DOSSIER, fichier)] = {
      webp,
      width: meta.width,
      height: meta.height
    };
    console.log(
      fichier.padEnd(40) + (meta.width + 'x' + meta.height).padEnd(12) +
      'variantes : ' + Object.keys(webp).join(', ')
    );
  }

  fs.writeFileSync(MANIFESTE, JSON.stringify(manifeste, null, 2));
  console.log('\n' + fichiers.length + ' image(s), ' + produites + ' variante(s) produite(s), ' + ignorees + ' ignorée(s).');
  console.log('Manifeste écrit : ' + MANIFESTE);
})().catch(e => { console.error('ERREUR ' + e.message); process.exit(1); });
