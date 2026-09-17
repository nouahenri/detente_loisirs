/**
 * AVIS DES VISITEURS sur les annonces : « J'aime » et commentaires notés
 * (demande du 17/09/2026).
 *
 * Décisions du propriétaire :
 *  · un commentaire est publié TOUT DE SUITE ; le studio peut ensuite le
 *    masquer ou le supprimer (propos inappropriés ou indécents) ;
 *  · le visiteur donne son nom (obligatoire), une note de 1 à 5 étoiles et
 *    son commentaire ; la moyenne des notes et le nombre d'avis s'affichent
 *    sur l'annonce, au site comme au studio.
 *
 * Pas de compte visiteur : un « J'aime » est rattaché à un jeton aléatoire
 * gardé par le navigateur, dont seule l'empreinte SHA-256 est stockée. Les
 * limites de débit de server.js freinent les abus.
 *
 * Stockage : MySQL (tables `avis_jaime`, `avis_commentaires`) quand la base
 * répond, fichier `data/avis.json` sinon.
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const FICHIER = 'avis.json';
const TYPES = ['villa', 'terrain', 'activity'];
const STATUTS = ['visible', 'masque'];

const texte = (valeur, max) => String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Empreinte du jeton visiteur ; vide si le jeton n'a pas la forme attendue. */
function empreinteVisiteur(jeton) {
  const brut = String(jeton ?? '').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(brut)) return '';
  return crypto.createHash('sha256').update(`avis|${brut}`).digest('hex');
}

function cle(kind, annonceId) {
  return `${kind}:${annonceId}`;
}

/** Annonce visée par une requête publique. Renvoie { kind, id } ou une erreur. */
function annonceDemandee(source = {}) {
  const kind = texte(source.kind, 20);
  const id = texte(source.id, 80);
  if (!TYPES.includes(kind) || !/^[a-z0-9-]+$/i.test(id)) return { erreur: 'Annonce inconnue.' };
  return { kind, id };
}

/**
 * Commentaire saisi par un visiteur. Renvoie { commentaire, erreur }.
 * Le champ `site` est un piège à robots : invisible pour un humain.
 */
function validerCommentaire(source = {}, maintenant = new Date()) {
  const annonce = annonceDemandee(source);
  if (annonce.erreur) return { erreur: annonce.erreur };
  if (texte(source.site, 200)) return { erreur: 'Envoi refusé.', robot: true };
  const nom = texte(source.nom, 60);
  if (nom.length < 2) return { erreur: 'Indiquez votre nom.' };
  const note = Number(source.note);
  if (!Number.isInteger(note) || note < 1 || note > 5) return { erreur: 'Choisissez une note de 1 à 5 étoiles.' };
  const commentaire = String(source.commentaire ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000);
  if (commentaire.length < 3) return { erreur: 'Écrivez votre commentaire.' };
  return {
    commentaire: {
      id: crypto.randomUUID(), kind: annonce.kind, annonceId: annonce.id, nom, note, commentaire,
      statut: 'visible', visiteur: empreinteVisiteur(source.visiteur), creeLe: new Date(maintenant).toISOString()
    }
  };
}

/** Résumé affiché d'une annonce : J'aime, moyenne des notes visibles, nombre d'avis visibles. */
function resume(jaime = [], commentaires = []) {
  const visibles = commentaires.filter(c => c.statut !== 'masque');
  const somme = visibles.reduce((total, c) => total + Number(c.note || 0), 0);
  return {
    likes: jaime.length,
    note: visibles.length ? Math.round((somme / visibles.length) * 10) / 10 : null,
    nombre: visibles.length
  };
}

/** Résumés de toutes les annonces : Map « kind:id » → résumé. */
function resumes({ jaime = [], commentaires = [] }) {
  const groupes = new Map();
  const groupe = c => {
    if (!groupes.has(c)) groupes.set(c, { jaime: [], commentaires: [] });
    return groupes.get(c);
  };
  jaime.forEach(j => groupe(cle(j.kind, j.annonceId)).jaime.push(j));
  commentaires.forEach(c => groupe(cle(c.kind, c.annonceId)).commentaires.push(c));
  return new Map([...groupes].map(([c, g]) => [c, resume(g.jaime, g.commentaires)]));
}

/** Commentaire tel que le voit un visiteur : ni statut, ni empreinte. */
function commentairePublic(c) {
  return { id: c.id, nom: c.nom, note: c.note, commentaire: c.commentaire, creeLe: c.creeLe };
}

// ---------------------------------------------------------------------------
// Stockage
// ---------------------------------------------------------------------------
let sondeBase = () => false;
let depot = null;

function configure(options = {}) {
  if (typeof options.isDbReady === 'function') sondeBase = options.isDbReady;
}

function utiliserBase() {
  try { return Boolean(sondeBase()); } catch { return false; }
}

function repo() {
  if (depot === null) {
    try { depot = require('./repository'); } catch { depot = false; }
  }
  return depot;
}

const tableAbsente = error => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
const versIso = valeur => {
  if (!valeur) return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const versMysql = valeur => (versIso(valeur) || new Date().toISOString()).slice(0, 19).replace('T', ' ');

function lireFichier() {
  const brut = jsonStore.read(FICHIER, {});
  return {
    jaime: Array.isArray(brut?.jaime) ? brut.jaime : [],
    commentaires: Array.isArray(brut?.commentaires) ? brut.commentaires : []
  };
}

/** Tout le stockage : { jaime, commentaires }. */
async function tout() {
  if (utiliserBase()) {
    try {
      const [[jaime], [commentaires]] = await Promise.all([
        repo().query('SELECT kind, annonce_id, visiteur, created_at FROM avis_jaime'),
        repo().query('SELECT * FROM avis_commentaires ORDER BY created_at DESC')
      ]);
      return {
        jaime: jaime.map(l => ({ kind: l.kind, annonceId: l.annonce_id, visiteur: l.visiteur, creeLe: versIso(l.created_at) })),
        commentaires: commentaires.map(l => ({
          id: l.id, kind: l.kind, annonceId: l.annonce_id, nom: l.nom, note: Number(l.note), commentaire: l.commentaire || '',
          statut: STATUTS.includes(l.statut) ? l.statut : 'visible', visiteur: l.visiteur || '', creeLe: versIso(l.created_at)
        }))
      };
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  return lireFichier();
}

async function avisAnnonce(kind, annonceId) {
  const { jaime, commentaires } = await tout();
  return {
    jaime: jaime.filter(j => j.kind === kind && j.annonceId === annonceId),
    commentaires: commentaires.filter(c => c.kind === kind && c.annonceId === annonceId)
      .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)))
  };
}

/** Ajoute ou retire le « J'aime » d'un visiteur. Renvoie l'état final (vrai = aimé). */
async function basculerJaime(kind, annonceId, visiteur) {
  if (utiliserBase()) {
    try {
      const [resultat] = await repo().query('DELETE FROM avis_jaime WHERE kind = ? AND annonce_id = ? AND visiteur = ?', [kind, annonceId, visiteur]);
      if (resultat?.affectedRows) return false;
      await repo().query('INSERT IGNORE INTO avis_jaime (kind, annonce_id, visiteur, created_at) VALUES (?,?,?,?)', [kind, annonceId, visiteur, versMysql(new Date())]);
      return true;
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  const index = donnees.jaime.findIndex(j => j.kind === kind && j.annonceId === annonceId && j.visiteur === visiteur);
  if (index >= 0) donnees.jaime.splice(index, 1);
  else donnees.jaime.push({ kind, annonceId, visiteur, creeLe: new Date().toISOString() });
  jsonStore.write(FICHIER, donnees);
  return index < 0;
}

async function ajouterCommentaire(c) {
  if (utiliserBase()) {
    try {
      await repo().query(
        'INSERT INTO avis_commentaires (id, kind, annonce_id, nom, note, commentaire, statut, visiteur, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [c.id, c.kind, c.annonceId, c.nom, c.note, c.commentaire, c.statut, c.visiteur, versMysql(c.creeLe)]
      );
      return c;
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  donnees.commentaires.unshift(c);
  jsonStore.write(FICHIER, donnees);
  return c;
}

async function modererCommentaire(id, statut) {
  if (!STATUTS.includes(statut)) throw new Error('Statut inconnu : visible ou masque.');
  if (utiliserBase()) {
    try {
      const [resultat] = await repo().query('UPDATE avis_commentaires SET statut = ? WHERE id = ?', [statut, String(id)]);
      return resultat?.affectedRows || 0;
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  const commentaire = donnees.commentaires.find(c => c.id === String(id));
  if (!commentaire) return 0;
  commentaire.statut = statut;
  jsonStore.write(FICHIER, donnees);
  return 1;
}

async function supprimerCommentaire(id) {
  if (utiliserBase()) {
    try {
      const [resultat] = await repo().query('DELETE FROM avis_commentaires WHERE id = ?', [String(id)]);
      return resultat?.affectedRows || 0;
    } catch (error) {
      if (!tableAbsente(error)) throw error;
    }
  }
  const donnees = lireFichier();
  const restants = donnees.commentaires.filter(c => c.id !== String(id));
  const supprimes = donnees.commentaires.length - restants.length;
  if (supprimes) jsonStore.write(FICHIER, { ...donnees, commentaires: restants });
  return supprimes;
}

module.exports = {
  TYPES, STATUTS,
  empreinteVisiteur, annonceDemandee, validerCommentaire, resume, resumes, commentairePublic,
  configure, tout, avisAnnonce, basculerJaime, ajouterCommentaire, modererCommentaire, supprimerCommentaire
};
