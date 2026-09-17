/**
 * Annonces du site ⇄ publications Facebook (décisions du 17/09/2026).
 *
 *  · Une annonce part sur la Page SI ET SEULEMENT SI sa case « Publier sur
 *    Facebook » est cochée. Décocher la case supprime la publication.
 *  · Suspendre, archiver ou supprimer une annonce supprime aussi sa
 *    publication (Facebook suit l'annonce).
 *  · Une annonce publiée reste synchronisée DANS LES DEUX SENS, texte (titre +
 *    description) et photos. Graph ne sait pas changer les photos d'une
 *    publication : des photos modifiées sur le site republient l'annonce.
 *
 * Mécanique : pour chaque publication née d'une annonce, on garde une
 * RÉFÉRENCE = le texte et les photos tels qu'ils étaient au dernier accord
 * entre les deux côtés. Ce qui diffère de la référence a changé de ce côté-là.
 * Chaque côté mis à jour réaligne la référence : aucun aller-retour sans fin.
 *
 * Module pur : aucun accès réseau ni disque. server.js exécute les plans.
 */

const TYPES = ['villa', 'terrain', 'activity'];
const ETATS = ['active', 'suspendue', 'archivee'];
const MAX_PHOTOS = 10;

const texteBrut = valeur => String(valeur ?? '');

/** Retours à la ligne unifiés, espaces de fin retirés, trois sauts ou plus ramenés à deux. */
function normaliserTexte(texte) {
  return texteBrut(texte).replace(/\r\n?/g, '\n')
    .split('\n').map(ligne => ligne.replace(/[ \t ]+$/g, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** Retire le lien vers le site ajouté en fin de publication. */
function retirerLienSite(texte, siteUrl) {
  const base = texteBrut(siteUrl).replace(/\/$/, '');
  if (!base) return texte;
  const blocs = normaliserTexte(texte).split('\n\n');
  while (blocs.length > 1 && blocs[blocs.length - 1].trim().startsWith(`${base}/`)) blocs.pop();
  return blocs.join('\n\n');
}

/** Texte comparable d'une publication : normalisé, sans le lien vers le site. */
function texteDeReference(message, siteUrl) {
  return normaliserTexte(retirerLienSite(message, siteUrl));
}

/**
 * Titre en lettres grasses Unicode (voir titreFacebook dans server.js) →
 * lettres ordinaires. Les accents combinants sont recomposés.
 */
function lireTitreFacebook(texte) {
  return [...texteBrut(texte).normalize('NFD')].map(caractere => {
    const code = caractere.codePointAt(0);
    if (code >= 0x1D5D4 && code <= 0x1D5ED) return String.fromCharCode(65 + code - 0x1D5D4);
    if (code >= 0x1D5EE && code <= 0x1D607) return String.fromCharCode(97 + code - 0x1D5EE);
    if (code >= 0x1D7EC && code <= 0x1D7F5) return String.fromCharCode(48 + code - 0x1D7EC);
    return caractere;
  }).join('').normalize('NFC');
}

const memeTexteEnMajuscules = (a, b) =>
  texteBrut(a).trim().toLocaleUpperCase('fr-FR') === texteBrut(b).trim().toLocaleUpperCase('fr-FR');

/**
 * Titre et description lus dans le texte d'une publication, selon la forme
 * écrite par buildShareMessage (server.js) :
 *   villa, activité : TITRE ¶ description
 *   terrain         : RÉF — TITRE ¶ lieu ¶ surface · prix ¶ Statut foncier ¶ description
 * Un titre seulement passé en majuscules garde la casse du site.
 */
function champsDepuisMessage(kind, message, item = {}, siteUrl = '') {
  const blocs = texteDeReference(message, siteUrl).split('\n\n').filter(bloc => bloc.trim());
  let titre = lireTitreFacebook(blocs[0] || '').trim();
  let reste = blocs.slice(1);
  if (kind === 'terrain') {
    const reference = texteBrut(item.reference).trim();
    if (reference && titre.toLocaleUpperCase('fr-FR').startsWith(`${reference.toLocaleUpperCase('fr-FR')} `)) {
      titre = titre.slice(reference.length).replace(/^\s*[—–-]\s*/, '').trim();
    }
    reste = reste.filter(bloc => !(normaliserTexte(bloc) === normaliserTexte(item.location))
      && !/\bm²\s*·/.test(bloc) && !/^Statut foncier\s*:/i.test(bloc.trim()));
  }
  const actuel = kind === 'villa' ? item.name : item.title;
  if (actuel && memeTexteEnMajuscules(titre, actuel)) titre = actuel;
  return { titre, description: reste.join('\n\n') };
}

/** Photos envoyées à Facebook pour une annonce : la galerie, dix au plus. */
function visuelsFiche(item) {
  return (Array.isArray(item?.images) && item.images.length ? item.images : [item?.image])
    .filter(Boolean).slice(0, MAX_PHOTOS);
}

const idsPhotos = photos => (Array.isArray(photos) ? photos : []).map(photo => texteBrut(photo?.fbId || photo?.id));
const memesListes = (a, b) => a.length === b.length && a.every((valeur, index) => valeur === b[index]);

/**
 * Référence d'une publication existante, sans rien modifier d'un côté ni de
 * l'autre : texte actuel de la publication, photos rapprochées de la galerie
 * de l'annonce dans l'ordre.
 */
function referenceInitiale(post, item, siteUrl) {
  const locales = visuelsFiche(item);
  return {
    message: texteDeReference(post?.message, siteUrl),
    photos: (Array.isArray(post?.photos) ? post.photos : []).map((photo, index) => ({
      fbId: texteBrut(photo.id), local: locales[index] || null
    }))
  };
}

/** Référence après un envoi du site : ce qui vient de partir. */
function referenceApresEnvoi(message, photosEnvoyees, siteUrl) {
  return {
    message: texteDeReference(message, siteUrl),
    photos: (Array.isArray(photosEnvoyees) ? photosEnvoyees : []).map(photo => ({ fbId: texteBrut(photo.fbId), local: photo.local || null }))
  };
}

function etatAnnonce(item) {
  return ETATS.includes(item?.etat) ? item.etat : 'active';
}

function collections(contenu) {
  return [
    ['villa', contenu?.villas], ['terrain', contenu?.terrains], ['activity', contenu?.activities]
  ].flatMap(([kind, liste]) => (Array.isArray(liste) ? liste : []).filter(item => item?.id).map(item => ({ kind, item })));
}

/**
 * Ce que la publication du contenu doit faire sur Facebook.
 *
 * @param {object} p
 * @param {object} p.contenu    contenu validé qui va être enregistré
 * @param {object} p.precedent  contenu enregistré avant (pour les suppressions)
 * @param {Map}    p.publiees   « kind:id » → { facebookId } des publications en ligne
 * @param {object} p.references facebookId → référence
 * @param {Function} p.message  (item, kind) → texte de la publication
 * @param {Function} p.importee (item) → vrai pour une fiche née d'une publication
 * @returns {Array<{type, kind, id, item?, facebookId?, raison?}>}
 *   type : publier | retirer | texte | photos (republication)
 */
function planVersFacebook({ contenu, precedent = null, publiees = new Map(), references = {}, message, importee = () => false, siteUrl = '' }) {
  const actions = [];
  const presentes = new Set();
  for (const { kind, item } of collections(contenu)) {
    const cle = `${kind}:${item.id}`;
    presentes.add(cle);
    if (importee(item)) continue;
    const publication = publiees.get(cle) || null;
    const etat = etatAnnonce(item);
    // Case jamais enregistrée (annonce antérieure au 17/09/2026) : l'état de
    // la Page fait foi, rien n'est publié ni retiré de ce seul fait.
    const cochee = item.facebook === true || (item.facebook !== false && Boolean(publication));
    const voulue = cochee && etat === 'active';

    if (voulue && !publication) {
      actions.push({ type: 'publier', kind, id: item.id, item });
    } else if (!voulue && publication) {
      actions.push({ type: 'retirer', kind, id: item.id, item, facebookId: publication.facebookId,
        raison: etat === 'active' ? 'case-decochee' : etat });
    } else if (voulue && publication) {
      const reference = references[publication.facebookId];
      if (!reference) continue;
      const locales = (reference.photos || []).map(photo => photo.local);
      if (!memesListes(visuelsFiche(item), locales)) {
        actions.push({ type: 'photos', kind, id: item.id, item, facebookId: publication.facebookId });
      } else if (texteDeReference(message(item, kind), siteUrl) !== reference.message) {
        actions.push({ type: 'texte', kind, id: item.id, item, facebookId: publication.facebookId });
      }
    }
  }
  // Annonce supprimée PAR CETTE PUBLICATION (présente juste avant) : sa
  // publication part avec elle. Les annonces disparues depuis longtemps ne
  // sont pas concernées : leur publication a pu être voulue telle quelle.
  if (precedent) {
    for (const { kind, item } of collections(precedent)) {
      const cle = `${kind}:${item.id}`;
      const publication = publiees.get(cle);
      if (!presentes.has(cle) && publication) {
        actions.push({ type: 'retirer', kind, id: item.id, item, facebookId: publication.facebookId, raison: 'supprimee' });
      }
    }
  }
  return actions;
}

/**
 * Ce que les publications lues sur la Page doivent changer sur le site.
 *
 * @param {object} p
 * @param {Array}  p.posts      publications normalisées (message, photos [{id, src}])
 * @param {Map}    p.origines   facebookId → { kind, id }
 * @param {object} p.references facebookId → référence
 * @param {object} p.contenu    contenu enregistré
 * @returns {Array} { type: 'reference', facebookId, reference } pour une publication encore sans référence ;
 *   { type: 'site', kind, id, facebookId, texte, champs|null, photos|null } quand Facebook a changé.
 */
function planVersSite({ posts = [], origines = new Map(), references = {}, contenu, siteUrl = '' }) {
  const actions = [];
  const annonces = new Map(collections(contenu).map(({ kind, item }) => [`${kind}:${item.id}`, { kind, item }]));
  for (const post of Array.isArray(posts) ? posts : []) {
    const origine = origines.get(texteBrut(post?.id));
    if (!origine) continue;
    const annonce = annonces.get(`${origine.kind}:${origine.id}`);
    if (!annonce) continue;
    const reference = references[post.id];
    if (!reference) {
      actions.push({ type: 'reference', facebookId: post.id, kind: annonce.kind, id: annonce.item.id,
        reference: referenceInitiale(post, annonce.item, siteUrl) });
      continue;
    }
    const texte = texteDeReference(post.message, siteUrl);
    const texteChange = texte !== reference.message;
    const photos = Array.isArray(post.photos) ? post.photos : [];
    // Publication lue sans ses identifiants de photos (repli de Graph) : on ne
    // conclut rien sur les photos plutôt que de vider la galerie.
    const photosChangees = photos.length > 0 && !memesListes(idsPhotos(photos), idsPhotos(reference.photos));
    if (!texteChange && !photosChangees) continue;
    actions.push({
      type: 'site', kind: annonce.kind, id: annonce.item.id, facebookId: post.id, texte,
      champs: texteChange ? champsDepuisMessage(annonce.kind, post.message, annonce.item, siteUrl) : null,
      photos: photosChangees ? photos.map(photo => ({ fbId: texteBrut(photo.id), src: texteBrut(photo.src) })) : null
    });
  }
  return actions;
}

/**
 * Galerie de l'annonce après un changement de photos sur Facebook.
 * `locales` : fbId → chemin local (connu ou fraîchement téléchargé).
 * Les photos de la galerie qui n'étaient jamais parties (au-delà de dix)
 * restent en fin de galerie.
 */
function galerieDepuisFacebook(item, photos, reference, locales) {
  const envoyees = new Set((reference?.photos || []).map(photo => photo.local).filter(Boolean));
  const depuisFacebook = photos.map(photo => locales.get(photo.fbId)).filter(Boolean);
  const jamaisEnvoyees = (Array.isArray(item?.images) ? item.images : []).filter(image => !envoyees.has(image) && !depuisFacebook.includes(image));
  return [...depuisFacebook, ...jamaisEnvoyees];
}

/** Applique un changement venu de Facebook à une annonce (copie). */
function appliquerChangementSite(kind, item, { champs, images }) {
  const suivant = { ...item };
  if (champs) {
    if (champs.titre) {
      if (kind === 'villa') suivant.name = champs.titre;
      else suivant.title = champs.titre;
    }
    suivant.description = champs.description;
  }
  if (images) {
    suivant.images = images;
    if (kind === 'activity') suivant.image = images[0] || '';
  }
  return suivant;
}

module.exports = {
  TYPES, ETATS, MAX_PHOTOS,
  normaliserTexte, retirerLienSite, texteDeReference, lireTitreFacebook, champsDepuisMessage,
  visuelsFiche, referenceInitiale, referenceApresEnvoi, etatAnnonce,
  planVersFacebook, planVersSite, galerieDepuisFacebook, appliquerChangementSite
};
