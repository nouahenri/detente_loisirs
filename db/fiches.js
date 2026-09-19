/**
 * Règles partagées des fiches du catalogue (villa, terrain, activité).
 *
 * Décisions du propriétaire du 13/09/2026, points restants de l'audit :
 *  · CADRE = lieu (lagune, océan, mer & lagune, terre ferme). « Piscine »
 *    n'est plus un cadre : c'est un équipement ;
 *  · TARIF D'UNE ACTIVITÉ : le texte affiché est généré depuis le montant,
 *    l'unité et le forfait groupe du devis — il ne peut plus contredire le
 *    simulateur. Deux mentions libres facultatives gardent les nuances
 *    (« À partir de », « / 30 min ») ;
 *  · TRADUCTIONS : les textes d'une fiche se saisissent aussi en anglais et
 *    en espagnol dans le studio. Une traduction absente retombe sur le
 *    français (js/i18n.js, I18N.fiche).
 *
 * Module sans dépendance ni accès disque. js/app.js et js/admin.js reprennent
 * `texteTarifActivite` à l'identique (tests/fiches.test.js le vérifie).
 */

const CADRES = ['mer-lagune', 'ocean', 'lagune', 'terre'];
const UNITES_TARIF = ['forfait', 'jour', 'personne'];
const LANGUES_TRADUITES = ['en', 'es'];

const TEXTES_TARIF = {
  fr: { personne: '/ personne', jour: '/ jour', forfait: '', groupe: 'les', surDemande: 'Tarif sur demande' },
  en: { personne: '/ person', jour: '/ day', forfait: '', groupe: 'for', surDemande: 'Price on request' },
  es: { personne: '/ persona', jour: '/ día', forfait: '', groupe: 'para', surDemande: 'Precio a consultar' }
};

/** « 35000 » → « 35 000 » (espace des milliers, comme les libellés d'origine). */
function formaterMontant(valeur) {
  return String(Math.round(Number(valeur) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Texte du tarif d'une activité dans la langue demandée.
 * « À partir de » + « 60 000 FCFA » + « / personne » + « / sortie »
 * + « · 35 000 FCFA les 4 » quand un forfait groupe complet existe.
 * Mentions traduites absentes : repli sur les mentions françaises.
 */
function texteTarifActivite(activite, langue = 'fr') {
  const item = activite && typeof activite === 'object' ? activite : {};
  const mots = TEXTES_TARIF[langue] || TEXTES_TARIF.fr;
  const traduction = (langue !== 'fr' && item.translations && item.translations[langue]) || {};
  const mention = champ => String(traduction[champ] || item[champ] || '').trim();
  const avant = mention('pricePrefix');
  const apres = mention('priceSuffix');
  const montant = Math.round(Number(item.priceAmount) || 0);
  // Montant nul = « sur devis » dans le simulateur : aucune mention seule.
  if (montant <= 0) return mots.surDemande;
  const unite = UNITES_TARIF.includes(item.priceUnit) ? item.priceUnit : 'forfait';
  let texte = [avant, `${formaterMontant(montant)} FCFA`, mots[unite], apres].filter(Boolean).join(' ');
  const groupe = Math.round(Number(item.groupPriceAmount) || 0);
  const taille = Math.round(Number(item.groupSize) || 0);
  if (unite === 'personne' && groupe > 0 && taille > 1) {
    texte += ` · ${formaterMontant(groupe)} FCFA ${mots.groupe} ${taille}`;
  }
  return texte;
}

/**
 * Champs traduisibles par type de fiche : longueur maximale d'un texte, ou
 * [nombre de lignes, longueur d'une ligne] pour une liste. Les noms propres
 * (nom de villa, localisation, référence) ne se traduisent pas.
 */
const CHAMPS_TRADUISIBLES = {
  villa: { tagline: 240, description: 8000, beds: 160, features: [40, 160], highlights: [20, 160] },
  terrain: { title: 160, description: 8000, highlights: [20, 160] },
  activity: { title: 160, subtitle: 240, description: 8000, duration: 80, pricePrefix: 80, priceSuffix: 80 },
  // Location de voitures (17/09/2026).
  vehicle: { tagline: 240, description: 8000, features: [30, 160] }
};

/**
 * Traductions nettoyées : seules les langues et champs connus, textes
 * bornés, valeurs vides retirées. Renvoie {} quand rien n'est traduit.
 */
function nettoyerTraductions(source, type) {
  const champs = CHAMPS_TRADUISIBLES[type];
  const brut = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const resultat = {};
  if (!champs) return resultat;
  for (const langue of LANGUES_TRADUITES) {
    const entree = brut[langue] && typeof brut[langue] === 'object' ? brut[langue] : {};
    const propre = {};
    for (const [champ, borne] of Object.entries(champs)) {
      const valeur = entree[champ];
      if (Array.isArray(borne)) {
        const lignes = (Array.isArray(valeur) ? valeur : String(valeur ?? '').split('\n'))
          .map(ligne => String(ligne ?? '').trim().slice(0, borne[1])).filter(Boolean).slice(0, borne[0]);
        if (lignes.length) propre[champ] = lignes;
      } else {
        const texte = String(valeur ?? '').trim().slice(0, borne);
        if (texte) propre[champ] = texte;
      }
    }
    if (Object.keys(propre).length) resultat[langue] = propre;
  }
  return resultat;
}

/**
 * Propriétaire du bien (19/09/2026) : la plateforme est intermédiaire entre
 * les clients et les propriétaires. Nom, prénom, téléphone et WhatsApp se
 * saisissent dans la fiche de l'annonce (villa, voiture, activité, terrain),
 * au studio SEULEMENT : `sansProprietaire` les retire de tout ce que voient
 * le site et l'application. Renvoie null quand rien n'est renseigné.
 */
function proprietaireAnnonce(source) {
  const s = source && typeof source === 'object' ? source : {};
  const champ = (valeur, max) => String(valeur ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const proprietaire = { nom: champ(s.nom, 120), prenom: champ(s.prenom, 80), telephone: champ(s.telephone, 40), whatsapp: champ(s.whatsapp, 40) };
  return Object.values(proprietaire).some(Boolean) ? proprietaire : null;
}

/** Annonce telle que la voient les visiteurs : sans son propriétaire. */
function sansProprietaire(annonce) {
  if (!annonce || typeof annonce !== 'object' || !('proprietaire' in annonce)) return annonce;
  const { proprietaire, ...publique } = annonce;
  return publique;
}

module.exports = {
  CADRES, UNITES_TARIF, LANGUES_TRADUITES, TEXTES_TARIF, CHAMPS_TRADUISIBLES,
  formaterMontant, texteTarifActivite, nettoyerTraductions, proprietaireAnnonce, sansProprietaire
};
