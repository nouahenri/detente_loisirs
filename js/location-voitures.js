/**
 * LOCATION DE VOITURES — règles métier partagées (demande du 17/09/2026).
 *
 * Un seul fichier pour le site (navigateur : window.LocationVoitures) et le
 * serveur (Node : require), afin que l'estimation affichée au visiteur soit
 * exactement celle que le serveur recalcule et enregistre. L'application
 * mobile en garde une copie fidèle (mobile/natif/src/donnees/location.ts).
 *
 * Décisions du propriétaire :
 *  · chauffeur réglé PAR VÉHICULE : avec chauffeur, sans chauffeur, ou au
 *    choix du client (supplément chauffeur par jour) ;
 *  · réservation = DEMANDE confirmée par la conciergerie (comme les villas) ;
 *  · tarifs complets : prix par jour, dégressif semaine et mois, caution,
 *    supplément chauffeur, livraison selon le lieu, options, kilométrage ;
 *  · planning : les réservations confirmées et les indisponibilités
 *    (entretien, panne…) bloquent les dates.
 *
 * Aucune dépendance, aucun accès réseau : fonctions pures, testées dans
 * tests/location-voitures.test.js.
 */
(function (racine, fabrique) {
  const LocationVoitures = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = LocationVoitures;
  else racine.LocationVoitures = LocationVoitures;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES = [
    { id: 'citadine', libelle: { fr: 'Citadine', en: 'City car', es: 'Urbano' } },
    { id: 'berline', libelle: { fr: 'Berline', en: 'Sedan', es: 'Berlina' } },
    { id: 'suv', libelle: { fr: 'SUV', en: 'SUV', es: 'SUV' } },
    { id: '4x4', libelle: { fr: '4x4 tout-terrain', en: '4x4 off-road', es: '4x4 todoterreno' } },
    { id: 'minibus', libelle: { fr: 'Minibus', en: 'Minibus', es: 'Minibús' } },
    { id: 'pickup', libelle: { fr: 'Pick-up', en: 'Pickup truck', es: 'Pick-up' } },
    { id: 'prestige', libelle: { fr: 'Prestige', en: 'Luxury', es: 'Lujo' } }
  ];
  const BOITES = {
    automatique: { fr: 'Automatique', en: 'Automatic', es: 'Automática' },
    manuelle: { fr: 'Manuelle', en: 'Manual', es: 'Manual' }
  };
  const CARBURANTS = {
    essence: { fr: 'Essence', en: 'Petrol', es: 'Gasolina' },
    diesel: { fr: 'Diesel', en: 'Diesel', es: 'Diésel' },
    hybride: { fr: 'Hybride', en: 'Hybrid', es: 'Híbrido' },
    electrique: { fr: 'Électrique', en: 'Electric', es: 'Eléctrico' }
  };
  const MODES_CHAUFFEUR = {
    avec: { fr: 'Avec chauffeur', en: 'With driver', es: 'Con chófer' },
    sans: { fr: 'Sans chauffeur', en: 'Self-drive', es: 'Sin chófer' },
    choix: { fr: 'Avec ou sans chauffeur', en: 'With or without driver', es: 'Con o sin chófer' }
  };
  /** Cycle d'une réservation. Seules `confirmee` et `en_cours` bloquent les dates. */
  const STATUTS = {
    demande: 'Demande à traiter', confirmee: 'Confirmée', en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée'
  };
  const STATUTS_BLOQUANTS = ['confirmee', 'en_cours'];
  const TRANSITIONS = {
    demande: ['confirmee', 'annulee'],
    confirmee: ['en_cours', 'annulee', 'demande'],
    en_cours: ['terminee'],
    terminee: [],
    annulee: ['demande']
  };
  const MOTIFS_INDISPONIBILITE = {
    entretien: 'Entretien', panne: 'Panne / réparation', usage_interne: 'Usage interne', autre: 'Autre'
  };

  /** Retard toléré au retour avant de compter un jour de plus (59 min). */
  const TOLERANCE_MINUTES = 59;
  const JOURS_SEMAINE = 7;
  const JOURS_MOIS = 30;
  const DUREE_MAX_JOURS = 90;

  /**
   * Réglages par défaut. Rien n'est inventé côté tarifs : les lieux de
   * livraison et les options sont créés DÉSACTIVÉS, à tarifer et activer par
   * le propriétaire (Studio → Location → Réglages).
   */
  const REGLAGES_INITIAUX = {
    lieux: [
      { id: 'agence', nom: 'Agence Détente & Loisirs (Assinie)', frais: 0, actif: true },
      { id: 'abidjan', nom: 'Livraison à Abidjan', frais: 0, actif: false },
      { id: 'aeroport-fhb', nom: 'Aéroport Félix-Houphouët-Boigny', frais: 0, actif: false }
    ],
    options: [
      { id: 'siege-bebe', nom: 'Siège bébé', prix: 0, unite: 'jour', actif: false },
      { id: 'gps', nom: 'GPS', prix: 0, unite: 'jour', actif: false },
      { id: 'conducteur-additionnel', nom: 'Conducteur additionnel', prix: 0, unite: 'location', actif: false }
    ],
    heureOuverture: '07:00',
    heureFermeture: '20:00',
    delaiMinHeures: 12,
    battementHeures: 2,
    conditions: {
      fr: 'Permis de conduire valide et pièce d’identité exigés pour une location sans chauffeur. Caution restituée au retour du véhicule, après contrôle. Carburant à la charge du client : le véhicule est rendu avec le même niveau qu’au départ.',
      en: '', es: ''
    }
  };

  const nombre = (valeur, repli = 0) => {
    const n = Number(valeur);
    return Number.isFinite(n) ? n : repli;
  };
  const entier = (valeur, min, max, repli) => {
    const n = Math.round(nombre(valeur, NaN));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli;
  };
  const montant = valeur => Math.max(0, Math.round(nombre(valeur, 0)));

  /** Libellé traduit d'une valeur de liste (catégorie, boîte, carburant, mode). */
  function libelle(table, cle, langue) {
    const entree = Array.isArray(table) ? (table.find(item => item.id === cle) || {}).libelle : table[cle];
    if (!entree) return cle || '';
    return entree[langue] || entree.fr || cle;
  }

  /**
   * Date et heure saisies « AAAA-MM-JJTHH:MM », toujours à l'heure d'Abidjan
   * (UTC+0 toute l'année, sans heure d'été) : un client qui réserve depuis
   * l'Europe ne décale pas l'horaire. Un ISO complet est accepté tel quel.
   */
  function dateHeure(valeur) {
    if (valeur instanceof Date) return Number.isFinite(valeur.getTime()) ? valeur : null;
    const brut = String(valeur || '').trim();
    if (!brut) return null;
    const simple = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(brut);
    const date = simple
      ? new Date(Date.UTC(Number(simple[1]), Number(simple[2]) - 1, Number(simple[3]), Number(simple[4]), Number(simple[5])))
      : new Date(brut);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  /** « HH:MM » → minutes depuis minuit. */
  const minutesDuJour = texte => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(texte || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };

  /**
   * Jours facturés : tranches de 24 h commencées, avec une tolérance de
   * 59 minutes au retour. Au moins un jour dès que le retour suit le départ.
   */
  function joursLocation(debut, fin) {
    const a = dateHeure(debut);
    const b = dateHeure(fin);
    if (!a || !b || b <= a) return 0;
    const minutes = (b - a) / 60000;
    return Math.max(1, Math.ceil((minutes - TOLERANCE_MINUTES) / 1440));
  }

  /** Tarif journalier applicable : dégressif au mois (30 j), à la semaine (7 j), sinon au jour. */
  function tarifApplicable(vehicule, jours) {
    const jour = montant(vehicule && vehicule.pricePerDay);
    const semaine = montant(vehicule && vehicule.pricePerDayWeek);
    const mois = montant(vehicule && vehicule.pricePerDayMonth);
    if (jours >= JOURS_MOIS && mois > 0) return { palier: 'mois', tarifJour: mois };
    if (jours >= JOURS_SEMAINE && semaine > 0) return { palier: 'semaine', tarifJour: semaine };
    return { palier: 'jour', tarifJour: jour };
  }

  /** Prix d'appel affiché sur les cartes : le plus bas des tarifs journaliers renseignés. */
  function prixAPartirDe(vehicule) {
    const tarifs = [vehicule && vehicule.pricePerDay, vehicule && vehicule.pricePerDayWeek, vehicule && vehicule.pricePerDayMonth]
      .map(montant).filter(t => t > 0);
    return tarifs.length ? Math.min(...tarifs) : 0;
  }

  /** Le client a-t-il un chauffeur ? Imposé par le véhicule, sauf « au choix ». */
  function avecChauffeur(vehicule, choixClient) {
    const mode = vehicule && vehicule.driverMode;
    if (mode === 'avec') return true;
    if (mode === 'sans') return false;
    return Boolean(choixClient);
  }

  /** Réglages complets et sûrs (valeurs initiales pour tout ce qui manque). */
  function normaliserReglages(source) {
    const r = source && typeof source === 'object' ? source : {};
    const heure = (valeur, repli) => (minutesDuJour(valeur) !== null ? String(valeur).padStart(5, '0') : repli);
    const lieux = Array.isArray(r.lieux) ? r.lieux : REGLAGES_INITIAUX.lieux;
    const options = Array.isArray(r.options) ? r.options : REGLAGES_INITIAUX.options;
    const conditions = r.conditions && typeof r.conditions === 'object' ? r.conditions : REGLAGES_INITIAUX.conditions;
    return {
      lieux: lieux.filter(l => l && l.id).map(l => ({ id: String(l.id), nom: String(l.nom || l.id), frais: montant(l.frais), actif: l.actif !== false })),
      options: options.filter(o => o && o.id).map(o => ({
        id: String(o.id), nom: String(o.nom || o.id), prix: montant(o.prix), unite: o.unite === 'location' ? 'location' : 'jour', actif: o.actif !== false
      })),
      heureOuverture: heure(r.heureOuverture, REGLAGES_INITIAUX.heureOuverture),
      heureFermeture: heure(r.heureFermeture, REGLAGES_INITIAUX.heureFermeture),
      delaiMinHeures: entier(r.delaiMinHeures, 0, 168, REGLAGES_INITIAUX.delaiMinHeures),
      battementHeures: entier(r.battementHeures, 0, 48, REGLAGES_INITIAUX.battementHeures),
      conditions: { fr: String(conditions.fr || ''), en: String(conditions.en || ''), es: String(conditions.es || '') }
    };
  }

  /**
   * Estimation d'une location. `demande` : { debut, fin, lieuPrise,
   * lieuRetour, chauffeur, options: [ids] }. Renvoie le détail chiffré et les
   * erreurs (codes + messages français). Les montants sont des FCFA entiers.
   * `maintenant` sert au délai de réservation (tests : date fixe).
   */
  function devis(vehicule, reglagesBruts, demande, { maintenant = new Date(), controlerDelai = true } = {}) {
    const reglages = normaliserReglages(reglagesBruts);
    const d = demande || {};
    const erreurs = [];
    const erreur = (code, message) => erreurs.push({ code, message });
    const debut = dateHeure(d.debut);
    const fin = dateHeure(d.fin);
    if (!vehicule) erreur('vehicule', 'Véhicule introuvable.');
    if (!debut || !fin) erreur('dates', 'Indiquez la date et l’heure de prise en charge et de retour.');
    else if (fin <= debut) erreur('ordre', 'Le retour doit suivre la prise en charge.');
    const jours = debut && fin ? joursLocation(debut, fin) : 0;
    if (debut && controlerDelai && debut.getTime() < new Date(maintenant).getTime() + reglages.delaiMinHeures * 3600000) {
      erreur('delai', reglages.delaiMinHeures
        ? `Réservez au moins ${reglages.delaiMinHeures} h à l’avance.`
        : 'La prise en charge ne peut pas être dans le passé.');
    }
    if (jours > DUREE_MAX_JOURS) erreur('duree', `Location limitée à ${DUREE_MAX_JOURS} jours : contactez-nous pour une longue durée.`);
    const minDays = entier(vehicule && vehicule.minDays, 1, 30, 1);
    if (vehicule && jours && jours < minDays) erreur('minimum', `Location minimale : ${minDays} jour${minDays > 1 ? 's' : ''}.`);
    const ouverture = minutesDuJour(reglages.heureOuverture);
    const fermeture = minutesDuJour(reglages.heureFermeture);
    const horsHoraires = date => {
      if (!date || ouverture === null || fermeture === null) return false;
      const m = date.getUTCHours() * 60 + date.getUTCMinutes();
      return m < ouverture || m > fermeture;
    };
    if (horsHoraires(debut) || horsHoraires(fin)) {
      erreur('horaires', `Prise en charge et retour entre ${reglages.heureOuverture} et ${reglages.heureFermeture}.`);
    }

    const lieuxActifs = reglages.lieux.filter(l => l.actif);
    const lieu = id => lieuxActifs.find(l => l.id === id) || null;
    const prise = lieu(d.lieuPrise);
    const retour = lieu(d.lieuRetour);
    if (lieuxActifs.length && (!prise || !retour)) erreur('lieu', 'Choisissez le lieu de prise en charge et de retour.');

    const chauffeur = avecChauffeur(vehicule, d.chauffeur);
    const { palier, tarifJour } = tarifApplicable(vehicule, jours);
    if (vehicule && !(tarifJour > 0)) erreur('tarif', 'Tarif de ce véhicule sur demande : contactez-nous.');

    const lignes = [];
    if (jours && tarifJour) lignes.push({ cle: 'vehicule', palier, quantite: jours, prixUnitaire: tarifJour, montant: jours * tarifJour });
    const tarifChauffeur = montant(vehicule && vehicule.driverPricePerDay);
    if (chauffeur && jours && tarifChauffeur) lignes.push({ cle: 'chauffeur', quantite: jours, prixUnitaire: tarifChauffeur, montant: jours * tarifChauffeur });
    if (prise && prise.frais) lignes.push({ cle: 'livraison', id: prise.id, nom: prise.nom, sens: 'prise', quantite: 1, prixUnitaire: prise.frais, montant: prise.frais });
    if (retour && retour.frais) lignes.push({ cle: 'livraison', id: retour.id, nom: retour.nom, sens: 'retour', quantite: 1, prixUnitaire: retour.frais, montant: retour.frais });
    const choisies = Array.isArray(d.options) ? d.options : [];
    const options = reglages.options.filter(o => o.actif && choisies.includes(o.id));
    for (const o of options) {
      const quantite = o.unite === 'jour' ? jours : 1;
      if (quantite) lignes.push({ cle: 'option', id: o.id, nom: o.nom, unite: o.unite, quantite, prixUnitaire: o.prix, montant: quantite * o.prix });
    }
    const total = lignes.reduce((somme, l) => somme + l.montant, 0);
    const kmParJour = montant(vehicule && vehicule.kmIncludedPerDay);
    return {
      ok: erreurs.length === 0,
      erreurs,
      jours,
      palier,
      tarifJour,
      chauffeur,
      lignes,
      total,
      // Sans chauffeur, le client conduit : caution à verser (restituée), non comprise dans le total.
      caution: chauffeur ? 0 : montant(vehicule && vehicule.deposit),
      kmInclus: kmParJour ? kmParJour * jours : null,
      prixKmSupplementaire: kmParJour ? montant(vehicule && vehicule.extraKmPrice) : 0,
      lieuPrise: prise, lieuRetour: retour,
      options: options.map(o => o.id),
      debut: debut ? debut.toISOString() : null,
      fin: fin ? fin.toISOString() : null
    };
  }

  const instant = valeur => {
    const date = dateHeure(valeur);
    return date ? date.getTime() : NaN;
  };

  /** Deux périodes se recouvrent-elles ? (bornes : début inclus, fin exclue) */
  function chevauche(a, b) {
    return instant(a.debut) < instant(b.fin) && instant(b.debut) < instant(a.fin);
  }

  /**
   * Périodes qui bloquent un véhicule : réservations confirmées ou en cours et
   * indisponibilités, élargies du battement de préparation entre deux locations.
   */
  function occupations(vehiculeId, reservations, indisponibilites, { battementHeures = 0, ignorer = null } = {}) {
    const marge = Math.max(0, Number(battementHeures) || 0) * 3600000;
    const liste = [];
    for (const r of Array.isArray(reservations) ? reservations : []) {
      if (r.vehiculeId !== vehiculeId || r.id === ignorer || !STATUTS_BLOQUANTS.includes(r.statut)) continue;
      liste.push({ type: 'reservation', id: r.id, debut: new Date(instant(r.debut) - marge).toISOString(), fin: new Date(instant(r.fin) + marge).toISOString() });
    }
    for (const b of Array.isArray(indisponibilites) ? indisponibilites : []) {
      if (b.vehiculeId !== vehiculeId || b.id === ignorer) continue;
      liste.push({ type: 'indisponibilite', id: b.id, motif: b.motif, debut: new Date(instant(b.debut)).toISOString(), fin: new Date(instant(b.fin)).toISOString() });
    }
    return liste.filter(o => Number.isFinite(instant(o.debut)) && Number.isFinite(instant(o.fin)))
      .sort((a, b) => instant(a.debut) - instant(b.debut));
  }

  /** Première occupation qui empêche de louer du `debut` à la `fin`, ou null. */
  function conflit(occupationsVehicule, debut, fin) {
    return (occupationsVehicule || []).find(o => chevauche(o, { debut, fin })) || null;
  }

  /** « AAAA-MM-JJTHH:MM » d'un instant, à l'heure d'Abidjan (champs de saisie). */
  function versSaisie(valeur) {
    const date = dateHeure(valeur);
    return date ? date.toISOString().slice(0, 16) : '';
  }

  const fcfa = valeur => `${new Intl.NumberFormat('fr-FR').format(montant(valeur)).replace(/ | /g, ' ')} FCFA`;

  return {
    CATEGORIES, BOITES, CARBURANTS, MODES_CHAUFFEUR, STATUTS, STATUTS_BLOQUANTS, TRANSITIONS, MOTIFS_INDISPONIBILITE,
    TOLERANCE_MINUTES, JOURS_SEMAINE, JOURS_MOIS, DUREE_MAX_JOURS, REGLAGES_INITIAUX,
    libelle, dateHeure, joursLocation, tarifApplicable, prixAPartirDe, avecChauffeur, normaliserReglages,
    devis, chevauche, occupations, conflit, versSaisie, fcfa
  };
});
