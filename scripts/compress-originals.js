/**
 * Recompresse les images SOURCES de assets/images/ (repli <picture>).
 *
 * MOTIF : les originaux pesaient 36 Mo, dont des PNG de 2,8 Mo servis comme
 * bannières. Ce sont eux qui partent vers les navigateurs sans WebP, et eux
 * qui alourdissaient le transfert vers cPanel.
 *
 * Les originaux intacts sont conservés dans assets/images/_originaux/ :
 * le script ne détruit jamais une source sans copie de sauvegarde.
 * Les PNG opaques sont convertis en JPEG (extension conservée si le PNG a
 * de la transparence, pour ne casser aucune référence existante).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'assets', 'images');
const BACKUP = path.join(DIR, '_originaux');
const MAX_WIDTH = 1920;

fs.mkdirSync(BACKUP, { recursive: true });

(async () => {
  const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
  let avant = 0, apres = 0;
  const lignes = [];

  for (const file of files) {
    const src = path.join(DIR, file);
    const backup = path.join(BACKUP, file);
    if (!fs.existsSync(backup)) fs.copyFileSync(src, backup);

    const tailleAvant = fs.statSync(backup).size;
    const image = sharp(backup);
    const meta = await image.metadata();
    const largeur = Math.min(meta.width || MAX_WIDTH, MAX_WIDTH);

    // Le logo reste intact : petit, et la transparence est nécessaire.
    if (file === 'logo.png') { avant += tailleAvant; apres += tailleAvant; continue; }

    const aTransparence = meta.hasAlpha && meta.channels === 4;
    let buffer;
    if (/\.png$/i.test(file) && aTransparence) {
      buffer = await image.resize({ width: largeur, withoutEnlargement: true })
        .png({ quality: 82, compressionLevel: 9, palette: true }).toBuffer();
    } else {
      buffer = await image.resize({ width: largeur, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
    }

    // On n'écrit que si le gain est réel.
    if (buffer.length < tailleAvant) {
      fs.writeFileSync(src, buffer);
    }
    const tailleApres = fs.statSync(src).size;
    avant += tailleAvant; apres += tailleApres;
    lignes.push({ file, avant: tailleAvant, apres: tailleApres });
  }

  const mo = n => (n / 1024 / 1024).toFixed(2) + ' Mo';
  lignes.sort((a, b) => (b.avant - b.apres) - (a.avant - a.apres)).slice(0, 8)
    .forEach(l => console.log(`  ${l.file.padEnd(36)} ${mo(l.avant).padStart(9)} -> ${mo(l.apres).padStart(9)}`));
  console.log('  ' + '-'.repeat(60));
  console.log(`  TOTAL${''.padEnd(31)} ${mo(avant).padStart(9)} -> ${mo(apres).padStart(9)}`);
  console.log(`  Gain : ${mo(avant - apres)} (${Math.round((1 - apres / avant) * 100)} %)`);
  console.log(`  Originaux conservés dans assets/images/_originaux/`);
})();
