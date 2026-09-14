#!/usr/bin/env node
/**
 * optimize-images.js — Génération des dérivés WebP et du manifeste d'images.
 *
 * Contexte : assets/images/ pèse ~36 Mo, avec des PNG de 2,8 Mo servis comme
 * bannières pleine largeur. C'est la première cause de lenteur sur mobile en
 * Côte d'Ivoire (3G/4G irrégulière) et une des causes du blocage de
 * téléversement sur cPanel.
 *
 * Pour chaque image source de assets/images/ (récursif), le script produit :
 *   assets/images/opt/<base>-480.webp
 *   assets/images/opt/<base>-960.webp
 *   assets/images/opt/<base>-1600.webp
 * puis écrit data/image-manifest.json au format défini dans
 * docs/CONTRAT-EQUIPE.md :
 *   { "assets/images/x.jpg": { "webp": {"480":"...","960":"...","1600":"..."},
 *                              "width": N, "height": N } }
 *
 * Règles :
 *   - aucun fichier source n'est jamais supprimé ni modifié ;
 *   - aucun agrandissement : une largeur cible supérieure à la source est
 *     ignorée (mais la clé du manifeste retombe sur le plus grand dérivé
 *     disponible, pour que <picture> reste utilisable) ;
 *   - le dossier opt/ est régénérable : il n'est jamais lu comme source.
 *
 * Dépendance : sharp. `package.json` appartient au périmètre BACKEND ; il
 * n'est donc pas modifié ici. Installation locale :
 *     npm install --no-save sharp
 * À terme, `sharp` doit être ajouté aux devDependencies par le backend.
 *
 * Usage :
 *     node scripts/optimize-images.js            # génère ce qui manque
 *     node scripts/optimize-images.js --force    # régénère tout
 *     node scripts/optimize-images.js --quality 82
 */

'use strict';

const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error(
    "\n[optimize-images] Le module « sharp » est introuvable.\n" +
    "Installez-le sans toucher à package.json :\n\n" +
    "    npm install --no-save sharp\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RACINE = path.resolve(__dirname, '..');
const DOSSIER_SOURCE = path.join(RACINE, 'assets', 'images');
const DOSSIER_SORTIE = path.join(DOSSIER_SOURCE, 'opt');
const MANIFESTE = path.join(RACINE, 'data', 'image-manifest.json');

const LARGEURS = [480, 960, 1600];
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const iQualite = args.indexOf('--quality');
const QUALITE = iQualite !== -1 ? Number(args[iQualite + 1]) : 78;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Chemin POSIX relatif à la racine du projet (clés du manifeste). */
function cleRelative(absolu) {
  return path.relative(RACINE, absolu).split(path.sep).join('/');
}

function octetsEnMo(o) {
  return (o / (1024 * 1024)).toFixed(2);
}

/** Liste récursive des images sources, en excluant le dossier opt/. */
function listerSources(dossier, accumulateur = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (path.resolve(complet) === path.resolve(DOSSIER_SORTIE)) continue;
      listerSources(complet, accumulateur);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entree.name).toLowerCase())) {
      accumulateur.push(complet);
    }
  }
  return accumulateur;
}

/** Nom de base préservant l'arborescence : sous-dossier/a/b.jpg -> a__b */
function baseDeSortie(absolu) {
  const rel = path.relative(DOSSIER_SOURCE, absolu);
  const sansExt = rel.slice(0, rel.length - path.extname(rel).length);
  return sansExt.split(path.sep).join('__');
}

// ---------------------------------------------------------------------------
// Traitement
// ---------------------------------------------------------------------------

async function traiter(sourceAbs, stats) {
  const meta = await sharp(sourceAbs).metadata();
  const largeurSource = meta.width || 0;
  const hauteurSource = meta.height || 0;

  if (!largeurSource || !hauteurSource) {
    stats.ignorees.push(cleRelative(sourceAbs));
    return null;
  }

  const base = baseDeSortie(sourceAbs);
  const webp = {};

  // Jamais d'agrandissement : la largeur réelle d'un palier est plafonnée à
  // celle de la source. Deux paliers qui retombent sur la même largeur réelle
  // partagent le même fichier au lieu d'être encodés deux fois.
  const dejaFait = new Map(); // largeur réelle -> chemin relatif

  for (const palier of LARGEURS) {
    const reelle = Math.min(palier, largeurSource);

    if (dejaFait.has(reelle)) {
      webp[String(palier)] = dejaFait.get(reelle);
      continue;
    }

    const cible = path.join(DOSSIER_SORTIE, `${base}-${palier}.webp`);
    let aGenerer = true;

    if (!FORCE && fs.existsSync(cible)) {
      const tSrc = fs.statSync(sourceAbs).mtimeMs;
      const tOut = fs.statSync(cible).mtimeMs;
      if (tOut >= tSrc) {
        aGenerer = false;
        stats.conserves += 1;
      }
    }

    if (aGenerer) {
      await sharp(sourceAbs)
        .rotate() // respecte l'orientation EXIF
        .resize({ width: reelle, withoutEnlargement: true })
        .webp({ quality: QUALITE, effort: 5 })
        .toFile(cible);
      stats.generes += 1;
    }

    const cle = cleRelative(cible);
    dejaFait.set(reelle, cle);
    webp[String(palier)] = cle;
    stats.octetsOpt += fs.statSync(cible).size;
  }

  stats.octetsSource += fs.statSync(sourceAbs).size;

  return {
    cle: cleRelative(sourceAbs),
    valeur: { webp, width: largeurSource, height: hauteurSource }
  };
}

async function principal() {
  if (!fs.existsSync(DOSSIER_SOURCE)) {
    console.error(`[optimize-images] Dossier introuvable : ${DOSSIER_SOURCE}`);
    process.exit(1);
  }
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFESTE), { recursive: true });

  const sources = listerSources(DOSSIER_SOURCE).sort();
  const stats = {
    generes: 0,
    conserves: 0,
    ignorees: [],
    octetsSource: 0,
    octetsOpt: 0
  };

  console.log(
    `[optimize-images] ${sources.length} image(s) source(s), ` +
    `qualité WebP ${QUALITE}, largeurs ${LARGEURS.join(' / ')} px.`
  );

  const manifeste = {};
  for (const src of sources) {
    const res = await traiter(src, stats);
    if (res) {
      manifeste[res.cle] = res.valeur;
      process.stdout.write('.');
    }
  }
  process.stdout.write('\n');

  // Clés triées : le manifeste reste lisible et comparable d'une exécution à l'autre.
  const trie = {};
  for (const cle of Object.keys(manifeste).sort()) trie[cle] = manifeste[cle];
  fs.writeFileSync(MANIFESTE, JSON.stringify(trie, null, 2) + '\n', 'utf8');

  const gain = stats.octetsSource - stats.octetsOpt;
  const pourcent = stats.octetsSource
    ? ((gain / stats.octetsSource) * 100).toFixed(1)
    : '0';

  console.log('');
  console.log(`  Dérivés générés  : ${stats.generes}`);
  console.log(`  Dérivés à jour   : ${stats.conserves}`);
  console.log(`  Sources          : ${octetsEnMo(stats.octetsSource)} Mo`);
  console.log(`  Dérivés WebP     : ${octetsEnMo(stats.octetsOpt)} Mo (3 tailles par image)`);
  console.log(`  Gain             : ${octetsEnMo(gain)} Mo (${pourcent} %)`);
  console.log(`  Manifeste        : ${cleRelative(MANIFESTE)}`);
  if (stats.ignorees.length) {
    console.log(`  Ignorées         : ${stats.ignorees.join(', ')}`);
  }
  console.log('');
  console.log('  Aucun fichier source n\'a été supprimé ni modifié.');
}

principal().catch((err) => {
  console.error('[optimize-images] Échec :', err);
  process.exit(1);
});
