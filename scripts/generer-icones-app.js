/**
 * Icônes de l'application (site installable + apps Android / iOS).
 *
 *   node scripts/generer-icones-app.js [chemin/du/logo.png]
 *
 * Source par défaut : assets/images/logo.png (220 px, fond transparent).
 * Le logo est posé sur un carré BLANC : son « H » bleu nuit disparaîtrait sur
 * un fond sombre, et iOS remplace la transparence par du noir.
 *
 * ⚠ Les stores exigent une icône nette en 512 px (Google Play) et 1024 px
 * (App Store). Avec le logo de 220 px, ces tailles sont agrandies et floues :
 * relancer ce script avec un logo haute définition (1024 px ou SVG) avant
 * la soumission.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const racine = path.join(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(racine, 'assets', 'images', 'logo.png'));
const sortie = path.join(racine, 'assets', 'app');

// [fichier, taille du carré, part du carré occupée par le logo]
// « maskable » : Android découpe l'icône en cercle ou en goutte ; le logo doit
// tenir dans la zone sûre centrale (80 %), d'où 64 %.
const ICONES = [
  ['icon-192.png', 192, 0.88],
  ['icon-512.png', 512, 0.88],
  ['icon-maskable-512.png', 512, 0.64],
  ['apple-touch-icon.png', 180, 0.86],
  ['icon-1024.png', 1024, 0.76]
];

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Logo introuvable : ${source}`);
  fs.mkdirSync(sortie, { recursive: true });
  const infos = await sharp(source).metadata();
  // Les marges blanches du fichier source sont rognées d'abord : le logo
  // HD de 1024 px en a près de 25 % de chaque côté, il paraîtrait minuscule.
  const rogne = await sharp(source).trim({ background: '#ffffff', threshold: 12 }).png().toBuffer();
  for (const [nom, taille, part] of ICONES) {
    const cote = Math.round(taille * part);
    const logo = await sharp(rogne)
      .resize(cote, cote, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 }, kernel: 'lanczos3' })
      .png().toBuffer();
    await sharp({ create: { width: taille, height: taille, channels: 4, background: '#ffffff' } })
      .composite([{ input: logo, gravity: 'center' }])
      .flatten({ background: '#ffffff' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(sortie, nom));
    const infosRogne = await sharp(rogne).metadata();
    const agrandi = cote > Math.max(infosRogne.width || infos.width || 0, infosRogne.height || infos.height || 0);
    console.log(`  ✓ ${nom} (${taille} px)${agrandi ? '  — logo agrandi, fournir une source HD' : ''}`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
