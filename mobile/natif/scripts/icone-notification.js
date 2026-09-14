/**
 * Icône des notifications Android : silhouette blanche sur fond transparent
 * (Android n'affiche que la forme). Tirée du monogramme « HP » du logo.
 *
 *   node mobile/natif/scripts/icone-notification.js   (depuis la racine du site, où sharp est installé)
 */
const path = require('path');
const sharp = require(require.resolve('sharp', { paths: [path.join(__dirname, '..', '..', '..')] }));

const SOURCE = path.join(__dirname, '..', 'assets', 'images', 'logo.png');
const SORTIE = path.join(__dirname, '..', 'assets', 'images', 'icone-notification.png');

(async () => {
  const meta = await sharp(SOURCE).metadata();
  // Le monogramme (maison + HP) occupe le haut du logo, au-dessus du nom.
  const zone = { left: Math.round(meta.width * 0.16), top: Math.round(meta.height * 0.13), width: Math.round(meta.width * 0.6), height: Math.round(meta.height * 0.5) };
  const { data, info } = await sharp(SOURCE).extract(zone).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const clair = (data[i] + data[i + 1] + data[i + 2]) / 3;
    // Pixel coloré (bleu nuit ou or) → blanc opaque ; fond blanc → transparent.
    const opacite = clair < 215 ? 255 : clair < 240 ? Math.round((240 - clair) * 10) : 0;
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = Math.min(255, opacite);
  }
  // Marges transparentes retirées, puis silhouette centrée avec une petite marge.
  const silhouette = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  // Cadre calculé sur les pixels réellement opaques (les pixels presque transparents ne comptent pas).
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 128) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const rognee = await sharp(silhouette).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).toBuffer();
  await sharp(rognee)
    .resize(84, 84, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(SORTIE);
  console.log('Icône de notification :', SORTIE);
})();
