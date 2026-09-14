/**
 * Référentiels administrables du studio : localisations, catégories,
 * équipements, badges et statuts.
 *
 * Demande du 13/09/2026 : ces listes étaient écrites en dur dans le studio,
 * le serveur, les pages et les traductions. Elles sont désormais saisies dans
 * le studio, stockées en base, et proposées en liste de choix à la création
 * d'une annonce comme au complément d'une publication Facebook.
 *
 * Décisions du propriétaire (13/09/2026) :
 *  · les fiches se rattachent PAR RÉFÉRENCE : renommer un badge ou une ville
 *    le renomme partout ;
 *  · libellés en français, anglais et espagnol (EN/ES facultatifs, repli FR) ;
 *    une localisation est un nom propre, sans traduction ;
 *  · la localisation porte la ville ; le repère précis (« Km 8 ») reste un
 *    texte libre à côté ;
 *  · les équipements sont des cases à cocher qui servent aux filtres ; les
 *    lignes descriptives de la fiche restent affichées comme avant ;
 *  · les statuts gardent des codes fixes (le code en dépend) : seuls leurs
 *    libellés sont modifiables.
 *
 * Module sans dépendance ni accès disque : server.js s'occupe du stockage.
 */

const TYPES = ['localisations', 'categories', 'equipements', 'badges', 'statuts'];
const LANGUES = ['fr', 'en', 'es'];

/** Codes de statut dont dépend le fonctionnement du site : jamais créés ni supprimés. */
const STATUTS_FIXES = {
  villa: ['disponible', 'sur-demande', 'indisponible'],
  terrain: ['disponible', 'reserve', 'vendu']
};

/**
 * Codes qui ne peuvent plus être des catégories (décision du 13/09/2026 :
 * cadre = lieu, catégorie = thème). « lagune » et « ocean » se lisent dans le
 * cadre de la résidence, « piscine » dans ses équipements ; les onglets et
 * liens du site qui portent ces codes sont calculés à partir de ces champs.
 */
const CATEGORIES_RESERVEES = ['lagune', 'ocean', 'piscine'];

const libelles = (fr, en = '', es = '') => ({ fr, en, es });

/*
 * Valeurs initiales. Catégories : traductions reprises de js/i18n.js.
 * Équipements, badges et statuts : traduits le 13/09/2026 à la demande du
 * propriétaire (db/traductions-referentiels.sql), anglais britannique.
 * Même contenu que db/migration-referentiels.sql.
 */
const DEFAUTS = {
  localisations: [
    { id: 'assinie-mafia', nom: 'Assinie-Mafia', ordre: 1, actif: true },
    { id: 'assinie-terminal', nom: 'Assinie Terminal', ordre: 2, actif: true },
    { id: 'assinie', nom: 'Assinie', ordre: 3, actif: true }
  ],
  // Thèmes seulement (décision du 13/09/2026) : le lieu est porté par le
  // cadre, la piscine par l'équipement — voir CATEGORIES_RESERVEES.
  categories: [
    { id: 'evenement', libelle: libelles('Grands Groupes & Événements', 'Large Groups & Events', 'Grupos grandes y eventos'), ordre: 1, actif: true },
    { id: 'romantique', libelle: libelles('Escapades en Amoureux', 'Romantic Getaways', 'Escapadas en pareja'), ordre: 2, actif: true }
  ],
  equipements: [
    ['piscine', 'Piscine', 'Pool', 'Piscina'],
    ['jacuzzi', 'Jacuzzi', 'Jacuzzi', 'Jacuzzi'],
    ['wifi', 'Wi-Fi', 'Wi-Fi', 'Wi-Fi'],
    ['climatisation', 'Climatisation', 'Air conditioning', 'Aire acondicionado'],
    ['ponton', 'Ponton privé', 'Private pontoon', 'Embarcadero privado'],
    ['acces-plage', 'Accès direct à la plage', 'Direct beach access', 'Acceso directo a la playa'],
    ['parking', 'Parking', 'Parking', 'Aparcamiento'],
    ['groupe-electrogene', 'Groupe électrogène', 'Backup generator', 'Generador eléctrico'],
    ['gardiennage', 'Gardiennage / sécurité', 'Caretaker / security', 'Vigilancia / seguridad'],
    ['barbecue', 'Barbecue', 'Barbecue', 'Barbacoa'],
    ['cuisine-equipee', 'Cuisine équipée', 'Fitted kitchen', 'Cocina equipada'],
    ['television', 'Télévision', 'Television', 'Televisión'],
    ['menage', 'Ménage / gouvernante', 'Housekeeping', 'Servicio de limpieza'],
    ['chef', 'Chef cuisinier', 'Chef', 'Cocinero']
  ].map(([id, fr, en, es], index) => ({ id, libelle: libelles(fr, en, es), ordre: index + 1, actif: true })),
  badges: [
    ['disponible', 'Disponible', 'Available', 'Disponible'],
    ['coup-de-coeur', 'Coup de Cœur', 'Our Favourite', 'Nuestro Favorito'],
    ['plage-privee', 'Plage Privée', 'Private Beach', 'Playa Privada'],
    ['famille-amis', 'Famille & Amis', 'Family & Friends', 'Familia y Amigos'],
    ['grands-groupes', 'Grands Groupes', 'Large Groups', 'Grupos Grandes'],
    ['special-couple', 'Spécial Couple', 'Perfect for Couples', 'Ideal para Parejas'],
    ['vue-exceptionnelle', 'Vue Exceptionnelle', 'Exceptional View', 'Vista Excepcional'],
    ['exclusivite', 'Exclusivité', 'Exclusive', 'Exclusiva'],
    ['reserve', 'Réservé', 'Reserved', 'Reservado'],
    ['projet-hotelier', 'Projet hôtelier', 'Hotel project', 'Proyecto hotelero'],
    ['top-activite', 'Top Activité', 'Top Activity', 'Actividad Estrella'],
    ['sensations-fortes', 'Sensations Fortes', 'Thrills', 'Emociones Fuertes'],
    ['ecotourisme', 'Écotourisme', 'Ecotourism', 'Ecoturismo'],
    ['aventure', 'Aventure', 'Adventure', 'Aventura'],
    ['en-famille', 'En Famille', 'Family Friendly', 'En Familia'],
    ['gourmand', 'Gourmand', 'Gourmet', 'Gourmet'],
    ['nature', 'Nature', 'Nature', 'Naturaleza'],
    ['transfert', 'Transfert', 'Transfer', 'Traslado']
  ].map(([id, fr, en, es], index) => ({ id, libelle: libelles(fr, en, es), ordre: index + 1, actif: true })),
  statuts: [
    { cible: 'villa', code: 'disponible', libelle: libelles('Disponible', 'Available', 'Disponible'), ordre: 1 },
    { cible: 'villa', code: 'sur-demande', libelle: libelles('Sur demande', 'On request', 'Bajo petición'), ordre: 2 },
    { cible: 'villa', code: 'indisponible', libelle: libelles('Indisponible', 'Unavailable', 'No disponible'), ordre: 3 },
    { cible: 'terrain', code: 'disponible', libelle: libelles('Disponible', 'Available', 'Disponible'), ordre: 1 },
    { cible: 'terrain', code: 'reserve', libelle: libelles('Réservé', 'Reserved', 'Reservado'), ordre: 2 },
    { cible: 'terrain', code: 'vendu', libelle: libelles('Vendu', 'Sold', 'Vendido'), ordre: 3 }
  ].map(statut => ({ ...statut, id: `${statut.cible}:${statut.code}`, actif: true }))
};

const texte = (valeur, max) => String(valeur ?? '').trim().slice(0, max);

/** Identifiant stable : minuscules, sans accents, tirets. */
function identifiant(valeur) {
  // Les ligatures ne se décomposent pas en NFD : « Cœur » donnait « c-ur ».
  return texte(valeur, 100).toLowerCase().replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/**
 * Valide une entrée saisie dans le studio. Renvoie { entree, erreurs }.
 * Pour un statut, seuls les libellés sont retenus : cible et code sont fixes.
 */
function normaliserEntree(type, source = {}) {
  const brut = source && typeof source === 'object' ? source : {};
  const erreurs = [];
  if (!TYPES.includes(type)) return { entree: null, erreurs: [`Référentiel « ${type} » inconnu.`] };

  const ordre = Number.isInteger(Number(brut.ordre)) ? Math.max(0, Math.min(9999, Number(brut.ordre))) : 0;
  const actif = brut.actif !== false && brut.actif !== 'false';

  if (type === 'statuts') {
    const cible = texte(brut.cible, 20);
    const code = texte(brut.code, 40);
    if (!STATUTS_FIXES[cible] || !STATUTS_FIXES[cible].includes(code)) {
      return { entree: null, erreurs: ['Statut inconnu : les codes de statut ne peuvent être ni créés ni supprimés.'] };
    }
    const libelle = normaliserLibelle(brut.libelle, erreurs);
    return { entree: { id: `${cible}:${code}`, cible, code, libelle, ordre, actif: true }, erreurs };
  }

  if (type === 'localisations') {
    const nom = texte(brut.nom, 160);
    if (!nom) erreurs.push('Le nom de la localisation est requis.');
    const id = identifiant(brut.id || nom);
    if (!id) erreurs.push('Identifiant de localisation invalide.');
    return { entree: { id, nom, ordre, actif }, erreurs };
  }

  const libelle = normaliserLibelle(brut.libelle, erreurs);
  const id = identifiant(brut.id || libelle.fr);
  if (!id) erreurs.push('Identifiant invalide.');
  if (type === 'categories' && CATEGORIES_RESERVEES.includes(id)) {
    erreurs.push(id === 'piscine'
      ? '« Piscine » n’est pas une catégorie : cochez l’équipement Piscine sur la fiche.'
      : 'Le bord de lagune ou d’océan n’est pas une catégorie : choisissez le Cadre sur la fiche.');
  }
  return { entree: { id, libelle, ordre, actif }, erreurs };
}

function normaliserLibelle(source, erreurs) {
  const brut = source && typeof source === 'object' ? source : {};
  const libelle = { fr: texte(brut.fr, 160), en: texte(brut.en, 160), es: texte(brut.es, 160) };
  if (!libelle.fr) erreurs.push('Le libellé en français est requis.');
  return libelle;
}

/**
 * Référentiels complets et sûrs, quelle que soit la source (base, fichier,
 * rien du tout). Les statuts fixes manquants sont complétés par défaut : le
 * site ne doit jamais se retrouver sans libellé pour « vendu ».
 */
function normaliserReferentiels(brut) {
  const source = brut && typeof brut === 'object' ? brut : {};
  const resultat = {};
  for (const type of TYPES) {
    const liste = Array.isArray(source[type]) ? source[type] : DEFAUTS[type];
    const vus = new Set();
    resultat[type] = liste
      .map(entree => normaliserEntree(type, entree).entree)
      // Anciennes catégories de lieu encore en base : jamais proposées.
      .filter(entree => !(type === 'categories' && entree && CATEGORIES_RESERVEES.includes(entree.id)))
      .filter(entree => entree && entree.id && !vus.has(entree.id) && vus.add(entree.id))
      .sort((a, b) => a.ordre - b.ordre || String(a.id).localeCompare(String(b.id)));
  }
  for (const defaut of DEFAUTS.statuts) {
    if (!resultat.statuts.some(statut => statut.id === defaut.id)) resultat.statuts.push(structuredClone(defaut));
  }
  return resultat;
}

function trouver(referentiels, type, id) {
  if (!id) return null;
  return (referentiels?.[type] || []).find(entree => entree.id === String(id)) || null;
}

/** Libellé dans la langue demandée, repli sur le français. */
function libelleDe(entree, langue = 'fr') {
  if (!entree) return '';
  if (entree.nom !== undefined) return entree.nom;
  return (entree.libelle && (entree.libelle[langue] || entree.libelle.fr)) || '';
}

/** « Assinie-Mafia, Km 14 » ; sans ville rattachée, le texte d'origine. */
function composerLocalisation(referentiels, localisationId, precision, repli = '') {
  const ville = trouver(referentiels, 'localisations', localisationId);
  if (!ville) return texte(repli, 240);
  const detail = texte(precision, 240);
  return detail ? `${ville.nom}, ${detail}` : ville.nom;
}

/**
 * Textes affichés d'un bien, recalculés à partir de ses références.
 * `location`, `badge` et `categoryLabel` restent ainsi lisibles par tout le
 * code existant (cartes, WhatsApp, message Facebook), tout en suivant le
 * référentiel : renommer une ville la renomme sur chaque fiche.
 */
function resoudreBien(bien, referentiels) {
  if (!bien || typeof bien !== 'object') return bien;
  const resolu = { ...bien };
  // Sans référence (fiche pas encore rattachée, base pas encore migrée), le
  // texte enregistré fait foi : le serveur le tient à jour à chaque
  // enregistrement, y compris quand un badge est retiré.
  if (bien.localisationId && trouver(referentiels, 'localisations', bien.localisationId)) {
    resolu.location = composerLocalisation(referentiels, bien.localisationId, bien.localisationPrecision);
  }
  const badge = trouver(referentiels, 'badges', bien.badgeId);
  if (badge) resolu.badge = libelleDe(badge);
  const categorie = trouver(referentiels, 'categories', bien.category);
  if (categorie && bien.categoryLabel !== undefined) resolu.categoryLabel = libelleDe(categorie);
  return resolu;
}

/**
 * Nombre de fiches qui utilisent une entrée : une entrée utilisée ne peut
 * pas être supprimée (on la désactive), sous peine de fiches orphelines.
 */
function compterUsages(type, id, { villas = [], terrains = [], activities = [], fiches = [] } = {}) {
  const cle = String(id);
  const tous = [...villas, ...terrains, ...activities, ...fiches];
  if (type === 'localisations') return tous.filter(bien => bien?.localisationId === cle).length;
  if (type === 'badges') return tous.filter(bien => bien?.badgeId === cle).length;
  if (type === 'categories') return [...villas, ...fiches].filter(bien => bien?.category === cle).length;
  if (type === 'equipements') return [...villas, ...fiches].filter(bien => Array.isArray(bien?.equipements) && bien.equipements.includes(cle)).length;
  return 0;
}

module.exports = {
  TYPES, LANGUES, STATUTS_FIXES, DEFAUTS, CATEGORIES_RESERVEES,
  identifiant, normaliserEntree, normaliserReferentiels,
  trouver, libelleDe, composerLocalisation, resoudreBien, compterUsages
};
