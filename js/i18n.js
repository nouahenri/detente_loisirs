/* =========================================================================
   MULTILINGUE — français, anglais, espagnol
   =========================================================================
   Le site reste un ensemble de pages HTML statiques : aucune version traduite
   n'est dupliquée sur le disque. Chaque texte fixe porte un attribut
   `data-i18n="clé"` et ce fichier fournit les trois valeurs de cette clé.

   Pourquoi ce choix plutôt que /en/ et /es/ en dossiers séparés :
   une modification de texte devrait sinon être répercutée à la main dans
   trois fichiers, et la moindre correction oubliée laisserait une page
   incohérente. Ici la clé est unique et les trois traductions sont côte à
   côte, donc visibles ensemble au moment de la relecture.

   Le dictionnaire est écrit EN DUR dans ce fichier, jamais chargé par fetch :
   le site doit pouvoir s'ouvrir en double-cliquant un fichier (protocole
   file://), où toute requête réseau serait refusée par le navigateur.

   Le contenu du catalogue (villas, activités, terrains) ne passe PAS par ce
   dictionnaire : il vit en base et porte ses propres traductions, saisies
   dans le studio. Voir `traduireFiche()` plus bas.
   ========================================================================= */
(function (global) {
  "use strict";

  var LANGUES = [
    { code: "fr", court: "FR", nom: "Français" },
    { code: "en", court: "EN", nom: "English" },
    { code: "es", court: "ES", nom: "Español" }
  ];
  var DEFAUT = "fr";

  /* -----------------------------------------------------------------------
     DRAPEAUX
     Dessinés en SVG plutôt qu'en emoji : Windows ne fournit aucune police de
     drapeaux, si bien que 🇫🇷 s'y affiche sous forme des deux lettres « FR ».
     Un SVG reste identique sur tous les systèmes et net à toute taille.
     Le Royaume-Uni sert de repère visuel pour l'anglais, l'Espagne pour
     l'espagnol : ce sont les drapeaux de langue les plus lisibles ici.
     -------------------------------------------------------------------- */
  var compteurDrapeau = 0;
  function drapeau(code) {
    if (code === "fr") {
      return '<svg class="langue-drapeau" viewBox="0 0 3 2" aria-hidden="true">' +
        '<rect width="1" height="2" fill="#0055A4"/>' +
        '<rect x="1" width="1" height="2" fill="#FFFFFF"/>' +
        '<rect x="2" width="1" height="2" fill="#EF4135"/></svg>';
    }
    if (code === "es") {
      return '<svg class="langue-drapeau" viewBox="0 0 3 2" aria-hidden="true">' +
        '<rect width="3" height="2" fill="#AA151B"/>' +
        '<rect y="0.5" width="3" height="1" fill="#F1BF00"/></svg>';
    }
    // Les bandes rouges en diagonale de l'Union Jack sont décalées : sans le
    // découpage ci-dessous on obtient une croix symétrique, qui n'est pas le
    // vrai drapeau. L'identifiant est rendu unique, plusieurs drapeaux pouvant
    // coexister dans la page.
    compteurDrapeau += 1;
    var id = "uk" + compteurDrapeau;
    return '<svg class="langue-drapeau" viewBox="0 0 60 30" aria-hidden="true">' +
      '<clipPath id="' + id + '"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>' +
      '<path d="M0,0 v30 h60 v-30 z" fill="#012169"/>' +
      '<path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" stroke-width="6"/>' +
      '<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#' + id + ')" stroke="#C8102E" stroke-width="4"/>' +
      '<path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" stroke-width="10"/>' +
      '<path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>';
  }
  var CLE_STOCKAGE = "dl_langue";

  /* -----------------------------------------------------------------------
     DICTIONNAIRE
     Convention de nommage : « zone.element ». `nav.*` pour la navigation,
     `pied.*` pour le pied de page, puis un préfixe par page (`accueil.*`,
     `devis.*`…). Une clé absente d'`en` ou `es` retombe sur le français
     plutôt que d'afficher la clé brute : mieux vaut un mot en français
     qu'un « accueil.titre » affiché au visiteur.
     -------------------------------------------------------------------- */
  var DICT = {
    fr: {
      /* --- Bandeau parallaxe de l’accueil --- */
      "t.parallaxe-soustitre": "Détente & Loisirs",
      "t.parallaxe-slogan": "L'immobilier de luxe loisirs",

      /* --- Titre d'onglet et méta-description de chaque page --- */
      "meta.accueil.titre": "Détente & Loisirs à Assinie | Location de Villas & Résidences de Prestige",
      "meta.accueil.desc": "Location de résidences meublées avec piscine et villas d'exception pieds dans l'eau à Assinie-Mafia. Organisation d'activités nautiques, bateaux et conciergerie VIP.",
      "meta.residences.titre": "Nos Résidences & Villas de Prestige | Détente & Loisirs à Assinie",
      "meta.residences.desc": "Catalogue complet des villas et résidences de luxe à Assinie. Filtrez par bord de lagune, bord d'océan, piscine privée et réservez instantanément en ligne ou sur WhatsApp.",
      "meta.terrains.titre": "Vente de Terrains à Assinie | Parcelles avec Titre Foncier & ACD",
      "meta.terrains.desc": "Terrains à vendre à Assinie-Mafia : parcelles bord de lagune, second rideau océan et lots viabilisés. Titre foncier, ACD ou lettre d'attribution, superficie, prix au m² en FCFA et visite sur rendez-vous.",
      "meta.voitures.titre": "Location de Voitures à Assinie et Abidjan, avec ou sans Chauffeur | Henri & Philippe",
      "meta.voitures.desc": "Louez une voiture à Assinie et Abidjan : citadines, SUV, 4x4 et minibus, avec ou sans chauffeur. Tarifs dégressifs, livraison à l’aéroport, estimation immédiate et confirmation par notre conciergerie.",
      "meta.loisirs.titre": "Activités & Loisirs Nautiques à Assinie | Henri & Philippe",
      "meta.loisirs.desc": "Découvrez toutes les activités et excursions à Assinie : balades en bateau privé vers La Passe, sessions Jet Ski, visites des Îles Éhotilés, randonnées en quad et zoo Dipi.",
      "meta.devis.titre": "Simulateur de Devis & Réservation | Henri & Philippe",
      "meta.devis.desc": "Estimez le tarif de votre séjour en villa à Assinie en temps réel : choix de la résidence, calcul des nuitées, options chef cuisinier et bateau. Réservation WhatsApp instantanée.",
      "meta.faq.titre": "Foire Aux Questions (FAQ) | Henri & Philippe - Détente & Loisirs",
      "meta.faq.desc": "Toutes les réponses à vos questions sur les locations de villas à Assinie : modalités de réservation, acomptes Wave/Orange Money, horaires d'arrivée, caution et équipements.",
      "meta.contact.titre": "Contactez-Nous | Henri & Philippe - Détente & Loisirs à Assinie",
      "meta.contact.desc": "Contactez l'équipe de Henri & Philippe - Détente & Loisirs à Assinie. Service client disponible 7j/7 sur WhatsApp au +225 07 67 69 63 18 pour toutes vos questions et réservations.",

      "t.rechercher": "Rechercher",
      "js.monSejour": "Mon séjour",
      "js.carnetTitre": "Mon séjour à Assinie",
      "js.votreCarnet": "VOTRE CARNET",
      "js.fermerCarnet": "Fermer le carnet",
      "js.estimerSejour": "Estimer mon séjour",
      "js.slideVillas": "Villas signature",
      "js.slideOcean": "Océan Atlantique",
      "js.slideExperiences": "Expériences privées",
      "js.slideVoitures": "Location de voitures",
      "js.calculerDevisCourt": "Calculer Devis",
      "t.la-ou-vos-reves-prennent": "Là Où Vos Rêves Prennent",
      "js.parJour": " / jour",
      "js.parPersonne": " / personne",
      /* --- Libellés écrits par js/app.js (hors HTML) --- */
      "js.details": "Détails",
      "js.votreRecherche": "Votre recherche :",
      "js.effacerCriteres": "Effacer les critères",
      "js.parNuitee": "/ nuitée",
      "js.aPartirDe": "À partir de",
      "js.forfaitWeekend": "Forfait week-end",
      "js.capaciteN": "Capacité : {n} personnes",
      "js.chambresN": "{n} Chambres autonomes",
      "js.sallesDeBainN": "{n} Salles de bain",
      "js.couchages": "Couchages",
      "js.reserver": "Réserver",
      "js.reserverWhatsapp": "Réserver sur WhatsApp",
      "js.contacterWhatsapp": "Contacter sur WhatsApp",
      "js.calculerDevis": "Calculer mon devis",
      "js.demanderRdv": "Demander un rendez-vous",
      "js.voirGps": "Voir le repère GPS",
      "js.equipements": "Équipements et services",
      "js.caracteristiques": "Caractéristiques",
      "js.caracteristiquesTerrain": "Caractéristiques détaillées du terrain",
      "js.atoutsParcelle": "Atouts de la parcelle",
      "js.atoutsVisite": "Atouts communiqués lors de la visite.",
      "js.prixM2": "Prix au m²",
      "js.prixVente": "Prix de vente",
      "js.statutFoncier": "Statut foncier",
      "js.superficie": "Superficie",
      "js.tarif": "Tarif :",
      "js.detailPrestations": "Détail des prestations",
      "js.demandeRefusee": "Votre demande n’a pas pu être enregistrée :",
      "js.contactNomRequis": "Indiquez votre nom et prénom pour envoyer la demande.",
      "js.contactTelRequis": "Indiquez un numéro de téléphone valide pour envoyer la demande.",
      "js.toutesVillas": "Toutes les villas",
      "js.aucuneResidence": "Aucune résidence disponible actuellement",
      "js.vendu": "Vendu — plus disponible",
      "js.residenceException": "RÉSIDENCE D’EXCEPTION À ASSINIE",
      "js.terrainAVendre": "TERRAIN À VENDRE À ASSINIE",
      "js.motsHero": "Vie|Éclat|Prestige|Magie|Sérénité|Luxe",

      "langue.choisir": "Choisir la langue",

      "nav.accueil": "Accueil",
      "nav.residences": "Nos Résidences",
      "nav.terrains": "Terrains",
      "nav.loisirs": "Activités & Loisirs",
      "nav.devis": "Calculer un Devis",
      "nav.faq": "FAQ",
      "nav.contact": "Contact",
      "nav.reserver": "Réserver",
      "nav.ouvrirMenu": "Ouvrir le menu",

      "commun.whatsapp": "WhatsApp Direct",
      "commun.monSejour": "Mon séjour",
      "commun.reserver": "Réserver",
      "commun.enSavoirPlus": "En savoir plus",
      "commun.voirDetails": "Voir les détails",
      "commun.ajouterCarnet": "+ Carnet",
      "commun.parNuit": "/ nuit",
      "commun.personnes": "personnes",
      "commun.chambres": "chambres",
      "commun.sallesDeBain": "salles de bain",
      "commun.aPartirDe": "À partir de",
      "commun.surDevis": "Sur devis",
      "commun.tarif": "TARIF :",
      "commun.chargement": "Chargement…",

      /* --- Textes des pages, clés générées depuis le HTML --- */
      "t.accueil": "Accueil",
      "t.nos-residences": "Nos Résidences",
      "t.terrains": "Terrains",
      "t.activites-loisirs": "Activités & Loisirs",
      "t.voitures": "Voitures",
      "t.voitures-titre": "Location de Voitures, avec ou sans Chauffeur",
      "t.voitures-sous-titre": "Citadines, SUV, 4x4 et minibus pour vos trajets entre Abidjan et Assinie. Estimation immédiate, livraison possible, confirmation par notre conciergerie.",
      "t.voitures-tag": "NOTRE FLOTTE",
      "t.voitures-choisir": "Choisissez Votre Véhicule",
      "t.voitures-simple": "SIMPLE ET SANS SURPRISE",
      "t.voitures-comment": "Comment Louer",
      "t.voitures-etape1": "Choisissez",
      "t.voitures-etape1-texte": "Le véhicule, vos dates, le lieu de prise en charge, avec ou sans chauffeur : l’estimation se calcule en direct.",
      "t.voitures-etape2": "Demandez",
      "t.voitures-etape2-texte": "Votre demande arrive à la conciergerie. Rien n’est payé en ligne.",
      "t.voitures-etape3": "Recevez la confirmation",
      "t.voitures-etape3-texte": "Nous vérifions la disponibilité et vous confirmons sur WhatsApp, avec les modalités de paiement et de remise du véhicule.",
      "t.calculer-un-devis": "Calculer un Devis",
      "t.contact": "Contact",
      "t.reserver": "Réserver",
      "t.trouvez-votre-ecrin-a-assinie": "Trouvez Votre Écrin à Assinie",
      "t.hero-vie": "Vie",
      "t.hero-activites-tag": "Activités & Loisirs",
      "t.hero-activites-titre": "Des Journées Qui",
      "t.hero-activites-mot": "Marquent",
      "t.hero-activites-texte": "Jet-ski, quad, excursions en pirogue, pêche au gros : l'aventure commence au bout du ponton.",
      "t.hero-activites-bouton": "Voir les Activités →",
      "t.hero-voitures-tag": "Location de Voitures",
      "t.hero-voitures-titre": "Abidjan ⇆ Assinie,",
      "t.hero-voitures-mot": "Sans Souci",
      "t.hero-voitures-texte": "Avec ou sans chauffeur, livrée à l'adresse de votre choix, kilométrage illimité.",
      "t.hero-voitures-bouton": "Réserver un Véhicule →",
      "t.decouvrez-des-residences-et-villas": "Découvrez des résidences et villas d'exception avec piscine privée, pieds dans l'eau entre lagune et océan pour des vacances et week-ends inoubliables.",
      "t.explorer-les-proprietes": "Explorer les Propriétés →",
      "t.contacter-un-conseiller": "Contacter un Conseiller",
      "t.emplacement": "Emplacement",
      "t.bord-de-lagune": "Bord de Lagune",
      "t.bord-d-ocean-plage": "Bord d'Océan / Plage",
      "t.type-de-residence": "Type de Résidence",
      "t.tous-types": "Tous Types",
      "t.plus-de-criteres": "Plus de critères",
      "t.equipements": "Équipements",
      "t.chambres-minimum": "Chambres (minimum)",
      "t.indifferent": "Indifférent",
      "t.voir-les-resultats": "Voir les résultats",
      "t.fermer-appliquer": "Terminé",
      "t.effacer": "Effacer",
      "t.budget-eco": "≤ 250 000 F",
      "t.budget-luxe": "≥ 250 000 F",
      "t.voyageurs-2-6": "2 à 6 pers.",
      "t.voyageurs-8-12": "8 à 12 pers.",
      "t.voyageurs-12": "12 pers. et +",
      "t.toutes-court": "Toutes",
      "t.tous-court": "Tous",
      "t.fermer": "Fermer",
      "t.localisation": "Localisation",
      "t.toutes-localisations": "Toutes Localisations",
      "t.toutes-les-localisations": "Toutes localisations",
      "t.tous-budgets": "Tous Budgets",
      "t.tous-emplacements": "Tous Emplacements",
      "t.villas-lagune": "Villas Lagune",
      "t.villas-ocean": "Villas Océan",
      "t.avec-piscine-privee": "Avec Piscine Privée",
      "t.budget-nuitee": "Budget / Nuitée",
      "t.150-000-550-000-fcfa": "150.000 - 550.000 FCFA",
      "t.150-000-250-000-fcfa": "150.000 - 250.000 FCFA",
      "t.250-000-550-000-fcfa": "250.000 - 550.000 FCFA",
      "t.voyageurs": "Voyageurs",
      "t.tout-nombre": "Tout Nombre",
      "t.2-a-6-personnes": "2 à 6 personnes",
      "t.8-a-12-personnes": "8 à 12 personnes",
      "t.12-personnes": "12+ personnes",
      "t.proprietes-verifiees": "Propriétés Vérifiées",
      "t.100-qualite-standing": "100% Qualité & Standing",
      "t.conciergerie-dediee": "Conciergerie Dédiée",
      "t.accompagnement-vip": "Accompagnement VIP",
      "t.meilleur-tarif-garanti": "Meilleur Tarif Garanti",
      "t.direct-proprietaire": "Direct Propriétaire",
      "t.support-7j-7": "Support 7j/7",
      "t.a-votre-ecoute-sur-whatsapp": "À Votre Écoute sur WhatsApp",
      "t.selection-exclusive": "SÉLECTION EXCLUSIVE",
      "t.decouvrez-notre-selection-de-proprietes": "Découvrez Notre Sélection de Propriétés d'Exception",
      "t.voir-tout-le-catalogue": "Voir Tout le Catalogue →",
      "t.vente-de-terrain": "VENTE DE TERRAIN",
      "t.terrains-a-vendre-a-assinie": "Terrains à vendre à Assinie",
      "t.voir-tous-les-terrains": "Voir tous les terrains →",
      "t.nuitees-d-exception-reservees": "Nuitées d'Exception Réservées",
      "t.clients-familles-combles": "Clients & Familles Comblés",
      "t.villas-pieds-dans-l-eau": "Villas Pieds dans l'Eau ou Piscine",
      "t.annees-d-excellence-a-assinie": "Années d'Excellence à Assinie",
      "t.annees-d-excellence": "Années d'Excellence",
      "t.a-propos-d-henri-philippe": "À PROPOS D'HENRI & PHILIPPE",
      "t.sublimer-chaque-instant-de-votre": "Sublimer Chaque Instant de Votre Séjour à Assinie",
      "t.chez-henri-philippe-detente-loisirs": "Chez Henri & Philippe - Détente & Loisirs, nous sélectionnons rigoureusement les plus belles demeures d'Assinie pour vous garantir une tranquillité absolue, des équipements irréprochables et une expérience tropicale inoubliable.",
      "t.expertise-locale": "Expertise Locale",
      "t.maitrise-approfondie-d-assinie-et": "Maîtrise approfondie d'Assinie et de ses lagunes.",
      "t.service-personnalise": "Service Personnalisé",
      "t.chef-a-domicile-transferts-et": "Chef à domicile, transferts et bateaux privés.",
      "t.confiance-clarte": "Confiance & Clarté",
      "t.contrats-certifies-tarifs-nets-direct": "Contrats certifiés, tarifs nets direct propriétaire.",
      "t.arrivee-fluide": "Arrivée Fluide",
      "t.ponton-prive-accueil-sur-place": "Ponton privé, accueil sur place et sérénité 24/7.",
      "t.en-savoir-plus-sur-nos": "En Savoir Plus Sur Nos Services →",
      "t.pieds-dans-l-eau": "Pieds dans l'eau",
      "t.plage-brise-marine": "Plage & Brise Marine",
      "t.piscines-privees": "Piscines Privées",
      "t.debordement-bains": "Débordement & Bains",
      "t.vente-de-terrain-2": "Vente de Terrain",
      "t.parcelles-lots": "Parcelles & Lots",
      "t.suites-penthouses": "Suites & Penthouses",
      "t.confort-exclusif": "Confort Exclusif",
      "t.bateaux-sorties": "Bateaux & Sorties",
      "t.cap-sur-la-passe": "Cap sur La Passe",
      "t.loisirs-nautiques": "Loisirs Nautiques",
      "t.jet-ski-quads": "Jet Ski & Quads",
      "t.avis-voyageurs": "AVIS VOYAGEURS",
      "t.ce-que-disent-nos-clients": "Ce Que Disent Nos Clients",
      "t.notre-sejour-a-la-villa": "\"Notre séjour à la Villa Blanche Royale restera gravé dans nos mémoires. Le ponton privé, le chef cuisinier et le cadre idyllique face à la lagune ont dépassé toutes nos attentes. Service d'une réactivité exemplaire sur WhatsApp !\"",
      "t.sejour-en-famille-abidjan": "Séjour en Famille • Abidjan",
      "t.restez-informe-e-de-nos": "Restez Informé(e) de Nos Offres Exclusives",
      "t.recevez-en-avant-premiere-les": "Recevez en avant-première les disponibilités du week-end et les réductions spéciales à Assinie.",
      "t.s-inscrire": "S'inscrire",
      "t.location-de-residences-de-vacances": "Location de résidences de vacances avec piscine, villas d'exception pieds dans l'eau et conciergerie nautique à Assinie, Côte d'Ivoire.",
      "t.navigation": "Navigation",
      "t.prestations-vip": "Prestations VIP",
      "t.chef-cuisinier-a-domicile": "Chef Cuisinier à Domicile",
      "t.traversee-lagunaire": "Traversée lagunaire",
      "t.excursions-bateau-la-passe": "Excursions Bateau La Passe",
      "t.jet-ski-randonnees-quad": "Jet Ski & Randonnées Quad",
      "t.contact-direct": "Contact Direct",
      "t.whatsapp-direct-7j-7": "WhatsApp Direct 7j/7",
      "t.2026-henri-philippe-detente-loisirs": "© 2026 Henri & Philippe - Détente & Loisirs à Assinie. Tous droits réservés.",
      "t.concu-pour-sublimer-vos-sejours": "Conçu pour sublimer vos séjours en Côte d'Ivoire 🌴🇨🇮",
      "t.whatsapp-direct": "WhatsApp Direct",
      "t.nos-residences-villas": "Nos Résidences & Villas",
      "t.nos-residences-demeures-d-exception": "Nos Résidences & Demeures d'Exception",
      "t.des-cadres-idylliques-equipes-avec": "Des cadres idylliques équipés avec piscine privée, ponton lagon ou accès direct à l'océan pour vos vacances et week-ends d'exception à Assinie.",
      "t.toutes-nos-residences": "Toutes nos Résidences",
      "t.bord-d-ocean": "Bord d'Océan",
      "t.grands-groupes-evenements": "Grands Groupes & Événements",
      "t.escapades-en-amoureux": "Escapades en Amoureux",
      "t.activites-loisirs-2": "Activités & Loisirs",
      "t.terrains-a-vendre": "Terrains à vendre",
      "t.vente-de-terrains-a-assinie": "Vente de Terrains à Assinie",
      "t.parcelles-bord-de-lagune-terrains": "Parcelles bord de lagune, terrains balnéaires et lots viabilisés à Assinie-Mafia. Chaque annonce précise sa superficie, son prix au m² et son statut foncier vérifié avant mise en vente.",
      "t.foncier-verifie": "FONCIER VÉRIFIÉ",
      "t.choisissez-votre-parcelle-a-assinie": "Choisissez votre parcelle à Assinie",
      "t.nous-ne-presentons-que-des": "Nous ne présentons que des terrains dont les documents ont été contrôlés. Le statut foncier est affiché sur chaque annonce, sans exception.",
      "t.statut-foncier": "Statut foncier",
      "t.tous-les-statuts": "Tous les statuts",
      "t.titre-foncier": "Titre foncier",
      "t.lettre-d-attribution": "Lettre d'attribution",
      "t.superficie": "Superficie",
      "t.toutes-superficies": "Toutes superficies",
      "t.moins-de-800-m": "Moins de 800 m²",
      "t.800-a-1-500-m": "800 à 1 500 m²",
      "t.plus-de-1-500-m": "Plus de 1 500 m²",
      "t.disponibilite": "Disponibilité",
      "t.toutes-les-annonces": "Toutes les annonces",
      "t.disponible": "Disponible",
      "t.reserve": "Réservé",
      "t.vendu": "Vendu",
      "t.comment-se-deroule-un-achat": "Comment se déroule un achat ?",
      "t.visite-de-la-parcelle-sur": "Visite de la parcelle sur rendez-vous, vérification des documents auprès du propriétaire, signature du compromis chez le notaire, puis mutation du titre à votre nom. Nous vous accompagnons à chaque étape et vous mettons en relation avec le notaire de votre choix.",
      "t.prendre-rendez-vous-pour-une": "Prendre rendez-vous pour une visite →",
      "t.soyez-alerte-e-des-nouvelles": "Soyez alerté(e) des nouvelles parcelles",
      "t.recevez-en-avant-premiere-les-2": "Recevez en avant-première les terrains mis en vente à Assinie avant leur publication.",
      "t.location-de-residences-de-vacances-2": "Location de résidences de vacances avec piscine, villas d'exception pieds dans l'eau, vente de terrains et conciergerie nautique à Assinie, Côte d'Ivoire.",
      "t.jet-ski-randonnees-quad-2": "Jet Ski & Randonnées Quad",
      "t.2026-henri-philippe-detente-loisirs-2": "© 2026 Henri & Philippe - Détente & Loisirs à Assinie. Tous droits réservés.",
      "t.concu-pour-sublimer-vos-sejours-2": "Conçu pour sublimer vos séjours en Côte d'Ivoire",
      "t.activites-loisirs-inoubliables": "Activités & Loisirs Inoubliables",
      "t.entre-les-eaux-calmes-de": "Entre les eaux calmes de la lagune Aby et l'immensité de l'océan Atlantique, vivez des sensations fortes et des moments de pure contemplation à Assinie.",
      "t.experiences-nautiques-terrestres": "EXPÉRIENCES NAUTIQUES & TERRESTRES",
      "t.toutes-nos-activites-a-la": "Toutes Nos Activités à la Carte",
      "t.calculer-un-devis-activites": "Calculer un Devis Activités →",
      "t.les-merveilles-d-assinie": "LES MERVEILLES D'ASSINIE",
      "t.ce-qu-il-faut-absolument": "Ce Qu'il Faut Absolument Vivre",
      "t.la-passe-d-assinie": "La Passe d'Assinie",
      "t.l-endroit-emblematique-ou-la": "L'endroit emblématique où la lagune rencontre l'océan Atlantique. Accessible en bateau privé, La Passe offre des bancs de sable blanc immaculés, parfaits pour un apéritif au coucher du soleil les pieds dans l'eau.",
      "t.parc-national-des-iles-ehotiles": "Parc National des Îles Éhotilés",
      "t.compose-de-6-iles-preservees": "Composé de 6 îles préservées au cœur de la lagune Aby, cet archipel classé réserve nationale abrite des lamantins d'Afrique de l'Ouest, des chauves-souris frugivores géantes et des arbres sacrés centenaires.",
      "t.parc-zoologique-dipi-culture": "Parc Zoologique Dipi & Culture",
      "t.situe-a-assinie-mafia-ce": "Situé à Assinie-Mafia, ce sanctuaire naturel permet d'observer les impressionnants crocodiles du Nil, tortues géantes et singes, complété par une découverte de l'artisanat local et de la cour royale d'Assinie.",
      "t.villas-privees-avec-piscine-residences": "Villas privées avec piscine, résidences de vacances et organisation d'activités nautiques d'exception à Assinie.",
      "t.loisirs-a-assinie": "Loisirs à Assinie",
      "t.balade-bateau-vers-la-passe": "Balade Bateau vers La Passe",
      "t.jet-ski-bouee-tractee": "Jet Ski & Bouée Tractée",
      "t.randonnee-quad-sur-la-plage": "Randonnée Quad sur la Plage",
      "t.simulateur-de-devis-reservation": "Simulateur de Devis & Réservation",
      "t.configurez-votre-sejour-sur-mesure": "Configurez votre séjour sur-mesure en temps réel avec les options de votre choix et confirmez instantanément par WhatsApp.",
      "t.personnalisez-votre-sejour": "Personnalisez votre Séjour",
      "t.que-souhaitez-vous-reserver": "Que souhaitez-vous réserver ?",
      "t.sejour-en-residence": "Séjour en résidence",
      "t.hebergement-activites-au-choix": "Hébergement + activités au choix",
      "t.activites-uniquement": "Activités uniquement",
      "t.sans-hebergement": "Sans hébergement",
      "t.voiture-seule": "Voiture seule",
      "t.location-avec-ou-sans-chauffeur": "Location, avec ou sans chauffeur",
      "t.location-de-voiture": "Location de voiture :",
      "t.filtrer-les-residences": "Filtrer les résidences :",
      "t.choisir-la-residence-souhaitee": "Choisir la Résidence souhaitée :",
      "t.arrivee-check-in-14h": "Arrivée (Check-in 14h) :",
      "t.depart-check-out-12h": "Départ (Check-out 12h) :",
      "t.nombre-de-voyageurs": "Nombre de voyageurs :",
      "t.2-personnes-couple-intime": "2 personnes (Couple / Intime)",
      "t.4-personnes": "4 personnes",
      "t.6-personnes": "6 personnes",
      "t.8-personnes": "8 personnes",
      "t.10-personnes": "10 personnes",
      "t.12-personnes-2": "12 personnes",
      "t.15-personnes-grand-groupe-evenement": "15+ personnes (Grand groupe / Événement)",
      "t.services-vip-loisirs-additionnels": "Services VIP & Loisirs Additionnels :",
      "t.recapitulatif-du-sejour": "RÉCAPITULATIF DU SÉJOUR",
      "t.tarif-de-la-nuitee": "Tarif de la nuitée :",
      "t.duree-du-sejour": "Durée du séjour :",
      "t.sous-total-hebergement": "Sous-total Hébergement :",
      "t.prestations-loisirs-vip": "Prestations & Loisirs VIP :",
      "t.montant-total-estime": "Montant Total Estimé :",
      "t.acompte-de-30-requis-a": "* Acompte de 30% requis à la confirmation. Solde à la remise des clés sur place à Assinie. Caution remboursable à l'état des lieux.",
      "t.vos-coordonnees": "Vos coordonnées",
      "t.nom-et-prenom": "Nom et prénom :",
      "t.telephone-contact": "Téléphone de contact WhatsApp :",
      "t.ex-nom-prenom": "Ex. : Kouassi Aya",
      "t.ex-telephone": "Ex. : +225 07 00 00 00 00",
      "t.adresse-email": "Adresse e-mail :",
      "t.ex-email": "Ex. : aya.kouassi@gmail.com",
      "t.optin-whatsapp": "J’accepte de recevoir les offres de Détente & Loisirs à Assinie par WhatsApp (désinscription à tout moment en répondant STOP).",
      "t.services-conciergerie": "SERVICES CONCIERGERIE",
      "t.ce-qui-rend-votre-sejour": "Ce Qui Rend Votre Séjour Inoubliable",
      "t.chef-cuisinier-dedie": "Chef Cuisinier Dédié",
      "t.savourez-poissons-braises-frais-de": "Savourez poissons braisés frais de la lagune, carpaccios d'attiéké, gambas grillées et cuisine internationale préparée sur place par nos chefs expérimentés.",
      "t.ponton-traversee-lagunaire": "Ponton & Traversée Lagunaire",
      "t.embarquement-immediat-depuis-le-ponton": "Embarquement immédiat depuis le ponton privé de votre villa pour des excursions vers La Passe, les îles Éhotilés ou les plages sauvages.",
      "t.energie-continue-24-7": "Énergie Continue 24/7",
      "t.toutes-nos-residences-sont-equipees": "Toutes nos résidences sont équipées de groupes électrogènes automatiques de forte puissance, climatiseurs silencieux et réserve d'eau traitée.",
      "t.bateau-la-passe": "Bateau La Passe",
      "t.jet-ski-bouee": "Jet Ski & Bouée",
      "t.foire-aux-questions": "Foire Aux Questions",
      "t.foire-aux-questions-faq": "Foire Aux Questions (FAQ)",
      "t.retrouvez-les-reponses-completes-et": "Retrouvez les réponses complètes et détaillées à toutes vos interrogations pour préparer votre séjour en toute sérénité.",
      "t.informations-pratiques": "INFORMATIONS PRATIQUES",
      "t.tout-ce-que-vous-devez": "Tout Ce Que Vous Devez Savoir Avant d'Arriver",
      "t.des-modalites-d-acompte-aux": "Des modalités d'acompte aux consignes d'accès en bateau et au confort de nos résidences, parcourez les réponses ci-dessous.",
      "t.vous-n-avez-pas-trouve": "Vous n'avez pas trouvé votre réponse ?",
      "t.notre-conciergerie-vous-repond-instantanemen": "Notre conciergerie vous répond instantanément sur WhatsApp 7 jours sur 7.",
      "t.contactez-notre-conciergerie": "Contactez Notre Conciergerie",
      "t.notre-equipe-locale-est-a": "Notre équipe locale est à votre disposition 7 jours sur 7 pour vous conseiller, organiser votre arrivée et sublimer votre séjour à Assinie.",
      "t.disponibilite-accueil-7j-7": "DISPONIBILITÉ & ACCUEIL 7J/7",
      "t.une-equipe-dediee-pour-vous": "Une Équipe Dédiée Pour Vous Répondre",
      "t.pour-verifier-les-disponibilites-d": "Pour vérifier les disponibilités d'un week-end, demander un devis traiteur pour un anniversaire ou planifier une sortie bateau, n'hésitez pas à nous écrire directement sur WhatsApp.",
      "t.whatsapp-ligne-directe": "WhatsApp & Ligne Directe",
      "t.bureau-de-reception-et-reservation": "Bureau de réception et réservation",
      "t.page-facebook-officielle": "Page Facebook Officielle",
      "t.discuter-en-direct-sur-whatsapp": "Discuter en direct sur WhatsApp",
      "t.localisation-privilegiee": "LOCALISATION PRIVILÉGIÉE",
      "t.a-1h15-d-abidjan-par": "À 1h15 d'Abidjan par l'autoroute internationale de Grand-Bassam. Nos équipes vous attendent à l'embarcadère privé pour assurer votre transfert sécurisé.",
      "t.parking-prive-garde": "🚗 Parking Privé Gardé",
      "t.ponton-bateau-prive": "🚤 Ponton & Bateau Privé",
      "t.coordonnees-gps-directes": "📍 Coordonnées GPS directes",
      "t.demander-l-itineraire-gps-sur": "Demander l'itinéraire GPS sur WhatsApp",
      "t.besoin-de-reponses-rapides": "BESOIN DE RÉPONSES RAPIDES ?",
      "t.consultez-notre-foire-aux-questions": "Consultez notre Foire Aux Questions",
      "t.decouvrez-tout-sur-les-acomptes": "Découvrez tout sur les acomptes, les horaires d'arrivée/départ, les cautions et les équipements inclus.",
      "t.acceder-a-la-faq": "Accéder à la FAQ →",
      "t.moyens-de-paiement": "Moyens de Paiement",
      "t.virement-bancaire": "Virement bancaire",
      "t.especes-a-l-arrivee": "Espèces à l'arrivée"
    },

    en: {
      /* --- Bandeau parallaxe de l’accueil --- */
      "t.parallaxe-soustitre": "Détente & Loisirs",
      "t.parallaxe-slogan": "Luxury leisure property",

      /* --- Titre d'onglet et méta-description de chaque page --- */
      "meta.accueil.titre": "Détente & Loisirs in Assinie | Prestige Villa & Residence Rentals",
      "meta.accueil.desc": "Furnished residences with pools and exceptional waterfront villas for rent in Assinie-Mafia. Water activities, boats and a VIP concierge service arranged for you.",
      "meta.residences.titre": "Our Prestige Residences & Villas | Détente & Loisirs in Assinie",
      "meta.residences.desc": "The full catalogue of luxury villas and residences in Assinie. Filter by lagoon front, ocean front or private pool and book instantly online or on WhatsApp.",
      "meta.terrains.titre": "Land for Sale in Assinie | Plots with Full Title & ACD",
      "meta.terrains.desc": "Land for sale in Assinie-Mafia: lagoon-front plots, second-row ocean plots and serviced lots. Full land title, ACD or allocation letter, area, price per m² in FCFA and viewings by appointment.",
      "meta.voitures.titre": "Car Rental in Assinie and Abidjan, with or without Driver | Henri & Philippe",
      "meta.voitures.desc": "Rent a car in Assinie and Abidjan: city cars, SUVs, 4x4s and minibuses, with or without a driver. Long-rental rates, airport delivery, instant estimate and confirmation by our concierge.",
      "meta.loisirs.titre": "Water Activities & Leisure in Assinie | Henri & Philippe",
      "meta.loisirs.desc": "Discover every activity and excursion in Assinie: private boat trips to La Passe, jet ski sessions, visits to the Éhotilés Islands, quad rides and the Dipi zoo.",
      "meta.devis.titre": "Quote & Booking Calculator | Henri & Philippe",
      "meta.devis.desc": "Work out the price of your villa stay in Assinie in real time: choose the residence, count the nights, add a chef or a boat. Instant booking on WhatsApp.",
      "meta.faq.titre": "Frequently Asked Questions (FAQ) | Henri & Philippe - Détente & Loisirs",
      "meta.faq.desc": "Every answer to your questions about villa rentals in Assinie: booking terms, Wave/Orange Money deposits, arrival times, security deposit and facilities.",
      "meta.contact.titre": "Contact Us | Henri & Philippe - Détente & Loisirs in Assinie",
      "meta.contact.desc": "Get in touch with the Henri & Philippe - Détente & Loisirs team in Assinie. Customer service available seven days a week on WhatsApp at +225 07 67 69 63 18 for any question or booking.",

      "t.rechercher": "Search",
      "js.monSejour": "My stay",
      "js.carnetTitre": "My stay in Assinie",
      "js.votreCarnet": "YOUR SHORTLIST",
      "js.fermerCarnet": "Close the shortlist",
      "js.estimerSejour": "Estimate my stay",
      "js.slideVillas": "Signature villas",
      "js.slideOcean": "Atlantic Ocean",
      "js.slideExperiences": "Private experiences",
      "js.slideVoitures": "Car hire",
      "js.calculerDevisCourt": "Get a Quote",
      "t.la-ou-vos-reves-prennent": "Where Your Dreams Become",
      "js.parJour": " / day",
      "js.parPersonne": " / person",
      /* --- Libellés écrits par js/app.js (hors HTML) --- */
      "js.details": "Details",
      "js.votreRecherche": "Your search:",
      "js.effacerCriteres": "Clear filters",
      "js.parNuitee": "/ night",
      "js.aPartirDe": "From",
      "js.forfaitWeekend": "Weekend package",
      "js.capaciteN": "Sleeps {n}",
      "js.chambresN": "{n} self-contained bedrooms",
      "js.sallesDeBainN": "{n} bathrooms",
      "js.couchages": "Beds",
      "js.reserver": "Book",
      "js.reserverWhatsapp": "Book on WhatsApp",
      "js.contacterWhatsapp": "Get in touch on WhatsApp",
      "js.calculerDevis": "Calculate my quote",
      "js.demanderRdv": "Request an appointment",
      "js.voirGps": "View the GPS marker",
      "js.equipements": "Facilities and services",
      "js.caracteristiques": "Features",
      "js.caracteristiquesTerrain": "Detailed features of the plot",
      "js.atoutsParcelle": "Strengths of the plot",
      "js.atoutsVisite": "Strengths shared during the viewing.",
      "js.prixM2": "Price per m²",
      "js.prixVente": "Sale price",
      "js.statutFoncier": "Land title status",
      "js.superficie": "Area",
      "js.tarif": "Price:",
      "js.detailPrestations": "Breakdown of services",
      "js.demandeRefusee": "Your request could not be saved:",
      "js.contactNomRequis": "Please enter your full name to send the request.",
      "js.contactTelRequis": "Please enter a valid phone number to send the request.",
      "js.toutesVillas": "All the villas",
      "js.aucuneResidence": "No residence available at the moment",
      "js.vendu": "Sold — no longer available",
      "js.residenceException": "AN EXCEPTIONAL RESIDENCE IN ASSINIE",
      "js.terrainAVendre": "LAND FOR SALE IN ASSINIE",
      "js.motsHero": "Life|Radiance|Prestige|Magic|Serenity|Luxury",

      "langue.choisir": "Choose language",

      "nav.accueil": "Home",
      "nav.residences": "Our Residences",
      "nav.terrains": "Land for Sale",
      "nav.loisirs": "Activities & Leisure",
      "nav.devis": "Get a Quote",
      "nav.faq": "FAQ",
      "nav.contact": "Contact",
      "nav.reserver": "Book now",
      "nav.ouvrirMenu": "Open menu",

      "commun.whatsapp": "WhatsApp Direct",
      "commun.monSejour": "My stay",
      "commun.reserver": "Book",
      "commun.enSavoirPlus": "Learn more",
      "commun.voirDetails": "View details",
      "commun.ajouterCarnet": "+ Add",
      "commun.parNuit": "/ night",
      "commun.personnes": "guests",
      "commun.chambres": "bedrooms",
      "commun.sallesDeBain": "bathrooms",
      "commun.aPartirDe": "From",
      "commun.surDevis": "On request",
      "commun.tarif": "PRICE:",
      "commun.chargement": "Loading…",

      /* --- Textes des pages, clés générées depuis le HTML --- */
      "t.accueil": "Home",
      "t.nos-residences": "Our Residences",
      "t.terrains": "Land",
      "t.activites-loisirs": "Activities & Leisure",
      "t.voitures": "Cars",
      "t.voitures-titre": "Car Rental, with or without Driver",
      "t.voitures-sous-titre": "City cars, SUVs, 4x4s and minibuses for your trips between Abidjan and Assinie. Instant estimate, delivery available, confirmed by our concierge.",
      "t.voitures-tag": "OUR FLEET",
      "t.voitures-choisir": "Choose Your Vehicle",
      "t.voitures-simple": "SIMPLE, NO SURPRISES",
      "t.voitures-comment": "How to Rent",
      "t.voitures-etape1": "Choose",
      "t.voitures-etape1-texte": "The vehicle, your dates, the pick-up location, with or without a driver: the estimate is calculated instantly.",
      "t.voitures-etape2": "Request",
      "t.voitures-etape2-texte": "Your request reaches our concierge. Nothing is paid online.",
      "t.voitures-etape3": "Get confirmation",
      "t.voitures-etape3-texte": "We check availability and confirm on WhatsApp, with payment and vehicle handover details.",
      "t.calculer-un-devis": "Get a Quote",
      "t.contact": "Contact",
      "t.reserver": "Book now",
      "t.trouvez-votre-ecrin-a-assinie": "Find Your Haven in Assinie",
      "t.hero-vie": "Life",
      "t.hero-activites-tag": "Activities & Leisure",
      "t.hero-activites-titre": "Days That",
      "t.hero-activites-mot": "Stay With You",
      "t.hero-activites-texte": "Jet-ski, quad biking, pirogue trips, deep-sea fishing: the adventure starts at the end of the jetty.",
      "t.hero-activites-bouton": "See the activities →",
      "t.hero-voitures-tag": "Car Hire",
      "t.hero-voitures-titre": "Abidjan ⇆ Assinie,",
      "t.hero-voitures-mot": "Worry-Free",
      "t.hero-voitures-texte": "With or without a driver, delivered to the address of your choice, unlimited mileage.",
      "t.hero-voitures-bouton": "Book a vehicle →",
      "t.decouvrez-des-residences-et-villas": "Discover exceptional residences and villas with private pools, right by the water between lagoon and ocean, for unforgettable holidays and weekends.",
      "t.explorer-les-proprietes": "Browse the properties →",
      "t.contacter-un-conseiller": "Talk to an Advisor",
      "t.emplacement": "Location",
      "t.bord-de-lagune": "Lagoon Front",
      "t.bord-d-ocean-plage": "Ocean Front / Beach",
      "t.type-de-residence": "Property Type",
      "t.tous-types": "All Types",
      "t.plus-de-criteres": "More filters",
      "t.equipements": "Amenities",
      "t.chambres-minimum": "Bedrooms (minimum)",
      "t.indifferent": "Any",
      "t.voir-les-resultats": "Show results",
      "t.fermer-appliquer": "Done",
      "t.effacer": "Clear",
      "t.budget-eco": "≤ 250,000 F",
      "t.budget-luxe": "≥ 250,000 F",
      "t.voyageurs-2-6": "2–6 guests",
      "t.voyageurs-8-12": "8–12 guests",
      "t.voyageurs-12": "12+ guests",
      "t.toutes-court": "Any",
      "t.tous-court": "Any",
      "t.fermer": "Close",
      "t.localisation": "Town",
      "t.toutes-localisations": "All Towns",
      "t.toutes-les-localisations": "All towns",
      "t.tous-budgets": "All Budgets",
      "t.tous-emplacements": "All Locations",
      "t.villas-lagune": "Lagoon Villas",
      "t.villas-ocean": "Ocean Villas",
      "t.avec-piscine-privee": "With Private Pool",
      "t.budget-nuitee": "Budget / Night",
      "t.150-000-550-000-fcfa": "150,000 - 550,000 FCFA",
      "t.150-000-250-000-fcfa": "150,000 - 250,000 FCFA",
      "t.250-000-550-000-fcfa": "250,000 - 550,000 FCFA",
      "t.voyageurs": "Guests",
      "t.tout-nombre": "Any Number",
      "t.2-a-6-personnes": "2 to 6 guests",
      "t.8-a-12-personnes": "8 to 12 guests",
      "t.12-personnes": "12+ guests",
      "t.proprietes-verifiees": "Verified Properties",
      "t.100-qualite-standing": "100% Quality & Standing",
      "t.conciergerie-dediee": "Dedicated Concierge",
      "t.accompagnement-vip": "VIP Support",
      "t.meilleur-tarif-garanti": "Best Rate Guaranteed",
      "t.direct-proprietaire": "Straight from the Owner",
      "t.support-7j-7": "Support 7 days a week",
      "t.a-votre-ecoute-sur-whatsapp": "Here for You on WhatsApp",
      "t.selection-exclusive": "EXCLUSIVE SELECTION",
      "t.decouvrez-notre-selection-de-proprietes": "Discover Our Selection of Exceptional Properties",
      "t.voir-tout-le-catalogue": "See the full catalogue →",
      "t.vente-de-terrain": "LAND FOR SALE",
      "t.terrains-a-vendre-a-assinie": "Land for sale in Assinie",
      "t.voir-tous-les-terrains": "See all plots →",
      "t.nuitees-d-exception-reservees": "Exceptional Nights Booked",
      "t.clients-familles-combles": "Delighted Guests & Families",
      "t.villas-pieds-dans-l-eau": "Waterfront Villas or Pool",
      "t.annees-d-excellence-a-assinie": "Years of Excellence in Assinie",
      "t.annees-d-excellence": "Years of Excellence",
      "t.a-propos-d-henri-philippe": "ABOUT HENRI & PHILIPPE",
      "t.sublimer-chaque-instant-de-votre": "Making Every Moment of Your Stay in Assinie Shine",
      "t.chez-henri-philippe-detente-loisirs": "At Henri & Philippe - Détente & Loisirs, we carefully select the finest homes in Assinie to guarantee you complete peace and quiet, faultless facilities and an unforgettable tropical experience.",
      "t.expertise-locale": "Local Expertise",
      "t.maitrise-approfondie-d-assinie-et": "In-depth knowledge of Assinie and its lagoons.",
      "t.service-personnalise": "Tailored Service",
      "t.chef-a-domicile-transferts-et": "Private chef, transfers and private boats.",
      "t.confiance-clarte": "Trust & Clarity",
      "t.contrats-certifies-tarifs-nets-direct": "Certified contracts, net rates straight from the owner.",
      "t.arrivee-fluide": "Smooth Arrival",
      "t.ponton-prive-accueil-sur-place": "Private pontoon, on-site welcome and peace of mind 24/7.",
      "t.en-savoir-plus-sur-nos": "More About Our Services →",
      "t.pieds-dans-l-eau": "By the water",
      "t.plage-brise-marine": "Beach & Sea Breeze",
      "t.piscines-privees": "Private Pools",
      "t.debordement-bains": "Infinity Edge & Bathing",
      "t.vente-de-terrain-2": "Land for Sale",
      "t.parcelles-lots": "Plots & Lots",
      "t.suites-penthouses": "Suites & Penthouses",
      "t.confort-exclusif": "Exclusive Comfort",
      "t.bateaux-sorties": "Boats & Outings",
      "t.cap-sur-la-passe": "Heading for La Passe",
      "t.loisirs-nautiques": "Water Sports",
      "t.jet-ski-quads": "Jet Ski & Quad Bikes",
      "t.avis-voyageurs": "GUEST REVIEWS",
      "t.ce-que-disent-nos-clients": "What Our Guests Say",
      "t.notre-sejour-a-la-villa": "\"Our stay at Villa Blanche Royale will stay with us forever. The private pontoon, the chef and the idyllic setting facing the lagoon went beyond everything we hoped for. Wonderfully quick to answer on WhatsApp!\"",
      "t.sejour-en-famille-abidjan": "Family Stay • Abidjan",
      "t.restez-informe-e-de-nos": "Stay Informed of Our Exclusive Offers",
      "t.recevez-en-avant-premiere-les": "Be the first to hear about weekend availability and special offers in Assinie.",
      "t.s-inscrire": "Sign up",
      "t.location-de-residences-de-vacances": "Holiday residences with pools, exceptional waterfront villas and a boating concierge service in Assinie, Côte d'Ivoire.",
      "t.navigation": "Navigation",
      "t.prestations-vip": "VIP Services",
      "t.chef-cuisinier-a-domicile": "Private Chef at Home",
      "t.traversee-lagunaire": "Lagoon Crossing",
      "t.excursions-bateau-la-passe": "Boat Trips to La Passe",
      "t.jet-ski-randonnees-quad": "Jet Ski & Quad Rides",
      "t.contact-direct": "Direct Contact",
      "t.whatsapp-direct-7j-7": "WhatsApp Direct, 7 days a week",
      "t.2026-henri-philippe-detente-loisirs": "© 2026 Henri & Philippe - Détente & Loisirs, Assinie. All rights reserved.",
      "t.concu-pour-sublimer-vos-sejours": "Made to make your stays in Côte d'Ivoire shine 🌴🇨🇮",
      "t.whatsapp-direct": "WhatsApp Direct",
      "t.nos-residences-villas": "Our Residences & Villas",
      "t.nos-residences-demeures-d-exception": "Our Residences & Exceptional Homes",
      "t.des-cadres-idylliques-equipes-avec": "Idyllic settings with a private pool, a lagoon pontoon or direct access to the ocean, for exceptional holidays and weekends in Assinie.",
      "t.toutes-nos-residences": "All our Residences",
      "t.bord-d-ocean": "Ocean Front",
      "t.grands-groupes-evenements": "Large Groups & Events",
      "t.escapades-en-amoureux": "Romantic Getaways",
      "t.activites-loisirs-2": "Activities & Leisure",
      "t.terrains-a-vendre": "Land for sale",
      "t.vente-de-terrains-a-assinie": "Land for Sale in Assinie",
      "t.parcelles-bord-de-lagune-terrains": "Lagoon-front plots, seaside land and serviced lots in Assinie-Mafia. Every listing states its area, its price per m² and its land title status, checked before going on sale.",
      "t.foncier-verifie": "TITLE VERIFIED",
      "t.choisissez-votre-parcelle-a-assinie": "Choose your plot in Assinie",
      "t.nous-ne-presentons-que-des": "We only list land whose documents have been checked. The title status is shown on every listing, without exception.",
      "t.statut-foncier": "Land title status",
      "t.tous-les-statuts": "All statuses",
      "t.titre-foncier": "Full land title",
      "t.lettre-d-attribution": "Allocation letter",
      "t.superficie": "Area",
      "t.toutes-superficies": "All areas",
      "t.moins-de-800-m": "Under 800 m²",
      "t.800-a-1-500-m": "800 to 1,500 m²",
      "t.plus-de-1-500-m": "Over 1,500 m²",
      "t.disponibilite": "Availability",
      "t.toutes-les-annonces": "All listings",
      "t.disponible": "Available",
      "t.reserve": "Reserved",
      "t.vendu": "Sold",
      "t.comment-se-deroule-un-achat": "How does a purchase work?",
      "t.visite-de-la-parcelle-sur": "A viewing of the plot by appointment, a check of the documents with the owner, signature of the preliminary agreement at the notary, then transfer of the title into your name. We stay with you at every step and put you in touch with the notary of your choice.",
      "t.prendre-rendez-vous-pour-une": "Book a viewing →",
      "t.soyez-alerte-e-des-nouvelles": "Be alerted to new plots",
      "t.recevez-en-avant-premiere-les-2": "Hear about land going on sale in Assinie before it is published.",
      "t.location-de-residences-de-vacances-2": "Holiday residences with pools, exceptional waterfront villas, land for sale and a boating concierge service in Assinie, Côte d'Ivoire.",
      "t.jet-ski-randonnees-quad-2": "Jet Ski & Quad Rides",
      "t.2026-henri-philippe-detente-loisirs-2": "© 2026 Henri & Philippe - Détente & Loisirs, Assinie. All rights reserved.",
      "t.concu-pour-sublimer-vos-sejours-2": "Made to make your stays in Côte d'Ivoire shine",
      "t.activites-loisirs-inoubliables": "Unforgettable Activities & Leisure",
      "t.entre-les-eaux-calmes-de": "Between the calm waters of the Aby lagoon and the vastness of the Atlantic, come for real thrills and moments of pure contemplation in Assinie.",
      "t.experiences-nautiques-terrestres": "ON THE WATER & ON LAND",
      "t.toutes-nos-activites-a-la": "All Our Activities, à la Carte",
      "t.calculer-un-devis-activites": "Get a Quote for Activities →",
      "t.les-merveilles-d-assinie": "THE WONDERS OF ASSINIE",
      "t.ce-qu-il-faut-absolument": "What You Really Must Experience",
      "t.la-passe-d-assinie": "La Passe d'Assinie",
      "t.l-endroit-emblematique-ou-la": "The landmark spot where the lagoon meets the Atlantic. Reached by private boat, La Passe offers pristine white sandbanks, perfect for a sunset drink with your feet in the water.",
      "t.parc-national-des-iles-ehotiles": "Îles Éhotilés National Park",
      "t.compose-de-6-iles-preservees": "Made up of 6 unspoilt islands in the heart of the Aby lagoon, this archipelago, classified as a national reserve, is home to West African manatees, giant fruit bats and century-old sacred trees.",
      "t.parc-zoologique-dipi-culture": "Dipi Zoological Park & Culture",
      "t.situe-a-assinie-mafia-ce": "Set in Assinie-Mafia, this nature sanctuary lets you watch impressive Nile crocodiles, giant tortoises and monkeys, rounded off by a look at local crafts and the royal court of Assinie.",
      "t.villas-privees-avec-piscine-residences": "Private villas with pools, holiday residences and exceptional water activities organised in Assinie.",
      "t.loisirs-a-assinie": "Leisure in Assinie",
      "t.balade-bateau-vers-la-passe": "Boat Trip to La Passe",
      "t.jet-ski-bouee-tractee": "Jet Ski & Towed Ring",
      "t.randonnee-quad-sur-la-plage": "Quad Ride on the Beach",
      "t.simulateur-de-devis-reservation": "Quote & Booking Calculator",
      "t.configurez-votre-sejour-sur-mesure": "Build your tailor-made stay in real time with the options you want, then confirm instantly on WhatsApp.",
      "t.personnalisez-votre-sejour": "Build Your Stay",
      "t.que-souhaitez-vous-reserver": "What would you like to book?",
      "t.sejour-en-residence": "Stay in a residence",
      "t.hebergement-activites-au-choix": "Accommodation + activities of your choice",
      "t.activites-uniquement": "Activities only",
      "t.sans-hebergement": "Without accommodation",
      "t.voiture-seule": "Car only",
      "t.location-avec-ou-sans-chauffeur": "Rental, with or without driver",
      "t.location-de-voiture": "Car rental:",
      "t.filtrer-les-residences": "Filter the residences:",
      "t.choisir-la-residence-souhaitee": "Choose the residence you want:",
      "t.arrivee-check-in-14h": "Arrival (check-in 2 pm):",
      "t.depart-check-out-12h": "Departure (check-out 12 pm):",
      "t.nombre-de-voyageurs": "Number of guests:",
      "t.2-personnes-couple-intime": "2 guests (couple / intimate)",
      "t.4-personnes": "4 guests",
      "t.6-personnes": "6 guests",
      "t.8-personnes": "8 guests",
      "t.10-personnes": "10 guests",
      "t.12-personnes-2": "12 guests",
      "t.15-personnes-grand-groupe-evenement": "15+ guests (large group / event)",
      "t.services-vip-loisirs-additionnels": "VIP Services & Extra Activities:",
      "t.recapitulatif-du-sejour": "STAY SUMMARY",
      "t.tarif-de-la-nuitee": "Nightly rate:",
      "t.duree-du-sejour": "Length of stay:",
      "t.sous-total-hebergement": "Accommodation subtotal:",
      "t.prestations-loisirs-vip": "VIP services & activities:",
      "t.montant-total-estime": "Estimated total:",
      "t.acompte-de-30-requis-a": "* A 30% deposit is required on confirmation. The balance is due when the keys are handed over in Assinie. The security deposit is refunded after the inventory check.",
      "t.vos-coordonnees": "Your contact details",
      "t.nom-et-prenom": "Full name:",
      "t.telephone-contact": "WhatsApp contact number:",
      "t.ex-nom-prenom": "e.g. Aya Kouassi",
      "t.ex-telephone": "e.g. +225 07 00 00 00 00",
      "t.adresse-email": "Email address:",
      "t.ex-email": "e.g. aya.kouassi@gmail.com",
      "t.optin-whatsapp": "I agree to receive offers from Détente & Loisirs à Assinie on WhatsApp (unsubscribe at any time by replying STOP).",
      "t.services-conciergerie": "CONCIERGE SERVICES",
      "t.ce-qui-rend-votre-sejour": "What Makes Your Stay Unforgettable",
      "t.chef-cuisinier-dedie": "Your Own Chef",
      "t.savourez-poissons-braises-frais-de": "Enjoy freshly grilled fish from the lagoon, attiéké carpaccio, grilled prawns and international cuisine prepared on site by our experienced chefs.",
      "t.ponton-traversee-lagunaire": "Pontoon & Lagoon Crossing",
      "t.embarquement-immediat-depuis-le-ponton": "Step straight aboard from your villa's private pontoon for trips to La Passe, the Éhotilés islands or the wild beaches.",
      "t.energie-continue-24-7": "Power Around the Clock",
      "t.toutes-nos-residences-sont-equipees": "All our residences are fitted with powerful automatic generators, quiet air conditioning and a treated water reserve.",
      "t.bateau-la-passe": "Boat to La Passe",
      "t.jet-ski-bouee": "Jet Ski & Ring",
      "t.foire-aux-questions": "Frequently Asked Questions",
      "t.foire-aux-questions-faq": "Frequently Asked Questions (FAQ)",
      "t.retrouvez-les-reponses-completes-et": "Full, detailed answers to all your questions, so you can prepare your stay with complete peace of mind.",
      "t.informations-pratiques": "PRACTICAL INFORMATION",
      "t.tout-ce-que-vous-devez": "Everything You Need to Know Before You Arrive",
      "t.des-modalites-d-acompte-aux": "From deposit terms to boat access instructions and the comfort of our residences, browse the answers below.",
      "t.vous-n-avez-pas-trouve": "Haven't found your answer?",
      "t.notre-conciergerie-vous-repond-instantanemen": "Our concierge team answers you instantly on WhatsApp, seven days a week.",
      "t.contactez-notre-conciergerie": "Contact Our Concierge Team",
      "t.notre-equipe-locale-est-a": "Our local team is available seven days a week to advise you, arrange your arrival and make your stay in Assinie shine.",
      "t.disponibilite-accueil-7j-7": "AVAILABLE & WELCOMING 7 DAYS A WEEK",
      "t.une-equipe-dediee-pour-vous": "A Dedicated Team to Answer You",
      "t.pour-verifier-les-disponibilites-d": "To check availability for a weekend, ask for a catering quote for a birthday or plan a boat outing, just write to us directly on WhatsApp.",
      "t.whatsapp-ligne-directe": "WhatsApp & Direct Line",
      "t.bureau-de-reception-et-reservation": "Reception and booking office",
      "t.page-facebook-officielle": "Official Facebook Page",
      "t.discuter-en-direct-sur-whatsapp": "Chat live on WhatsApp",
      "t.localisation-privilegiee": "PRIME LOCATION",
      "t.a-1h15-d-abidjan-par": "1 hr 15 from Abidjan on the international Grand-Bassam motorway. Our teams wait for you at the private landing stage to make sure your transfer is safe.",
      "t.parking-prive-garde": "🚗 Guarded private car park",
      "t.ponton-bateau-prive": "🚤 Private pontoon & boat",
      "t.coordonnees-gps-directes": "📍 Direct GPS coordinates",
      "t.demander-l-itineraire-gps-sur": "Ask for GPS directions on WhatsApp",
      "t.besoin-de-reponses-rapides": "NEED QUICK ANSWERS?",
      "t.consultez-notre-foire-aux-questions": "See our Frequently Asked Questions",
      "t.decouvrez-tout-sur-les-acomptes": "Find out all about deposits, arrival and departure times, security deposits and what is included.",
      "t.acceder-a-la-faq": "Go to the FAQ →",
      "t.moyens-de-paiement": "Payment Methods",
      "t.virement-bancaire": "Bank transfer",
      "t.especes-a-l-arrivee": "Cash on arrival"
    },

    es: {
      /* --- Bandeau parallaxe de l’accueil --- */
      "t.parallaxe-soustitre": "Détente & Loisirs",
      "t.parallaxe-slogan": "Inmobiliaria de lujo y ocio",

      /* --- Titre d'onglet et méta-description de chaque page --- */
      "meta.accueil.titre": "Détente & Loisirs en Assinie | Alquiler de villas y residencias de prestigio",
      "meta.accueil.desc": "Alquiler de residencias amuebladas con piscina y villas excepcionales a pie de agua en Assinie-Mafia. Organización de actividades náuticas, barcos y conserjería VIP.",
      "meta.residences.titre": "Nuestras residencias y villas de prestigio | Détente & Loisirs en Assinie",
      "meta.residences.desc": "Catálogo completo de villas y residencias de lujo en Assinie. Filtre por frente de laguna, frente al océano o piscina privada y reserve al instante en línea o por WhatsApp.",
      "meta.terrains.titre": "Venta de terrenos en Assinie | Parcelas con título de propiedad y ACD",
      "meta.terrains.desc": "Terrenos en venta en Assinie-Mafia: parcelas frente a la laguna, segunda línea de océano y lotes urbanizados. Título de propiedad, ACD o carta de adjudicación, superficie, precio por m² en FCFA y visitas con cita previa.",
      "meta.voitures.titre": "Alquiler de coches en Assinie y Abiyán, con o sin chófer | Henri & Philippe",
      "meta.voitures.desc": "Alquile un coche en Assinie y Abiyán: urbanos, SUV, 4x4 y minibuses, con o sin chófer. Tarifas por duración, entrega en el aeropuerto, estimación inmediata y confirmación por nuestra conserjería.",
      "meta.loisirs.titre": "Actividades náuticas y ocio en Assinie | Henri & Philippe",
      "meta.loisirs.desc": "Descubra todas las actividades y excursiones en Assinie: paseos en barco privado a La Passe, sesiones de moto acuática, visitas a las islas Éhotilés, rutas en quad y el zoo de Dipi.",
      "meta.devis.titre": "Simulador de presupuesto y reserva | Henri & Philippe",
      "meta.devis.desc": "Calcule en tiempo real el precio de su estancia en villa en Assinie: elija la residencia, cuente las noches, añada chef o barco. Reserva inmediata por WhatsApp.",
      "meta.faq.titre": "Preguntas frecuentes (FAQ) | Henri & Philippe - Détente & Loisirs",
      "meta.faq.desc": "Todas las respuestas a sus preguntas sobre el alquiler de villas en Assinie: condiciones de reserva, anticipos por Wave/Orange Money, horarios de llegada, fianza y equipamiento.",
      "meta.contact.titre": "Contáctenos | Henri & Philippe - Détente & Loisirs en Assinie",
      "meta.contact.desc": "Póngase en contacto con el equipo de Henri & Philippe - Détente & Loisirs en Assinie. Atención al cliente los siete días de la semana por WhatsApp en el +225 07 67 69 63 18 para cualquier duda o reserva.",

      "t.rechercher": "Buscar",
      "js.monSejour": "Mi estancia",
      "js.carnetTitre": "Mi estancia en Assinie",
      "js.votreCarnet": "SU SELECCIÓN",
      "js.fermerCarnet": "Cerrar la selección",
      "js.estimerSejour": "Estimar mi estancia",
      "js.slideVillas": "Villas exclusivas",
      "js.slideOcean": "Océano Atlántico",
      "js.slideExperiences": "Experiencias privadas",
      "js.slideVoitures": "Alquiler de coches",
      "js.calculerDevisCourt": "Presupuesto",
      "t.la-ou-vos-reves-prennent": "Donde Sus Sueños Se Vuelven",
      "js.parJour": " / día",
      "js.parPersonne": " / persona",
      /* --- Libellés écrits par js/app.js (hors HTML) --- */
      "js.details": "Detalles",
      "js.votreRecherche": "Su búsqueda:",
      "js.effacerCriteres": "Borrar los criterios",
      "js.parNuitee": "/ noche",
      "js.aPartirDe": "Desde",
      "js.forfaitWeekend": "Tarifa fin de semana",
      "js.capaciteN": "Capacidad: {n} personas",
      "js.chambresN": "{n} dormitorios independientes",
      "js.sallesDeBainN": "{n} baños",
      "js.couchages": "Camas",
      "js.reserver": "Reservar",
      "js.reserverWhatsapp": "Reservar por WhatsApp",
      "js.contacterWhatsapp": "Contactar por WhatsApp",
      "js.calculerDevis": "Calcular mi presupuesto",
      "js.demanderRdv": "Pedir una cita",
      "js.voirGps": "Ver la ubicación GPS",
      "js.equipements": "Equipamiento y servicios",
      "js.caracteristiques": "Características",
      "js.caracteristiquesTerrain": "Características detalladas del terreno",
      "js.atoutsParcelle": "Ventajas de la parcela",
      "js.atoutsVisite": "Ventajas que se detallan durante la visita.",
      "js.prixM2": "Precio por m²",
      "js.prixVente": "Precio de venta",
      "js.statutFoncier": "Situación registral",
      "js.superficie": "Superficie",
      "js.tarif": "Tarifa:",
      "js.detailPrestations": "Desglose de los servicios",
      "js.demandeRefusee": "No se pudo registrar su solicitud:",
      "js.contactNomRequis": "Indique su nombre y apellidos para enviar la solicitud.",
      "js.contactTelRequis": "Indique un número de teléfono válido para enviar la solicitud.",
      "js.toutesVillas": "Todas las villas",
      "js.aucuneResidence": "No hay ninguna residencia disponible por ahora",
      "js.vendu": "Vendido — ya no está disponible",
      "js.residenceException": "RESIDENCIA EXCEPCIONAL EN ASSINIE",
      "js.terrainAVendre": "TERRENO EN VENTA EN ASSINIE",
      "js.motsHero": "Vida|Brillo|Prestigio|Magia|Serenidad|Lujo",

      "langue.choisir": "Elegir idioma",

      "nav.accueil": "Inicio",
      "nav.residences": "Nuestras Residencias",
      "nav.terrains": "Terrenos",
      "nav.loisirs": "Actividades y Ocio",
      "nav.devis": "Calcular Presupuesto",
      "nav.faq": "Preguntas frecuentes",
      "nav.contact": "Contacto",
      "nav.reserver": "Reservar",
      "nav.ouvrirMenu": "Abrir el menú",

      "commun.whatsapp": "WhatsApp Directo",
      "commun.monSejour": "Mi estancia",
      "commun.reserver": "Reservar",
      "commun.enSavoirPlus": "Saber más",
      "commun.voirDetails": "Ver detalles",
      "commun.ajouterCarnet": "+ Añadir",
      "commun.parNuit": "/ noche",
      "commun.personnes": "personas",
      "commun.chambres": "habitaciones",
      "commun.sallesDeBain": "baños",
      "commun.aPartirDe": "Desde",
      "commun.surDevis": "Bajo presupuesto",
      "commun.tarif": "TARIFA:",
      "commun.chargement": "Cargando…",

      /* --- Textes des pages, clés générées depuis le HTML --- */
      "t.accueil": "Inicio",
      "t.nos-residences": "Nuestras Residencias",
      "t.terrains": "Terrenos",
      "t.activites-loisirs": "Actividades y Ocio",
      "t.voitures": "Coches",
      "t.voitures-titre": "Alquiler de Coches, con o sin Chófer",
      "t.voitures-sous-titre": "Urbanos, SUV, 4x4 y minibuses para sus trayectos entre Abiyán y Assinie. Estimación inmediata, entrega posible, confirmación por nuestra conserjería.",
      "t.voitures-tag": "NUESTRA FLOTA",
      "t.voitures-choisir": "Elija Su Vehículo",
      "t.voitures-simple": "SENCILLO Y SIN SORPRESAS",
      "t.voitures-comment": "Cómo Alquilar",
      "t.voitures-etape1": "Elija",
      "t.voitures-etape1-texte": "El vehículo, sus fechas, el lugar de recogida, con o sin chófer: la estimación se calcula al instante.",
      "t.voitures-etape2": "Solicite",
      "t.voitures-etape2-texte": "Su solicitud llega a la conserjería. No se paga nada en línea.",
      "t.voitures-etape3": "Reciba la confirmación",
      "t.voitures-etape3-texte": "Comprobamos la disponibilidad y le confirmamos por WhatsApp, con las modalidades de pago y entrega del vehículo.",
      "t.calculer-un-devis": "Calcular Presupuesto",
      "t.contact": "Contacto",
      "t.reserver": "Reservar",
      "t.trouvez-votre-ecrin-a-assinie": "Encuentre su refugio en Assinie",
      "t.hero-vie": "Realidad",
      "t.hero-activites-tag": "Actividades y ocio",
      "t.hero-activites-titre": "Días Que",
      "t.hero-activites-mot": "Se Recuerdan",
      "t.hero-activites-texte": "Moto acuática, quad, excursiones en piragua, pesca de altura: la aventura empieza al final del embarcadero.",
      "t.hero-activites-bouton": "Ver las actividades →",
      "t.hero-voitures-tag": "Alquiler de coches",
      "t.hero-voitures-titre": "Abiyán ⇆ Assinie,",
      "t.hero-voitures-mot": "Sin Preocupaciones",
      "t.hero-voitures-texte": "Con o sin chófer, entregado en la dirección que elija, kilometraje ilimitado.",
      "t.hero-voitures-bouton": "Reservar un vehículo →",
      "t.decouvrez-des-residences-et-villas": "Descubra residencias y villas excepcionales con piscina privada, a pie de agua entre la laguna y el océano, para vacaciones y fines de semana inolvidables.",
      "t.explorer-les-proprietes": "Ver las propiedades →",
      "t.contacter-un-conseiller": "Hablar con un asesor",
      "t.emplacement": "Ubicación",
      "t.bord-de-lagune": "Frente a la laguna",
      "t.bord-d-ocean-plage": "Frente al océano / playa",
      "t.type-de-residence": "Tipo de residencia",
      "t.tous-types": "Todos los tipos",
      "t.plus-de-criteres": "Más filtros",
      "t.equipements": "Equipamiento",
      "t.chambres-minimum": "Dormitorios (mínimo)",
      "t.indifferent": "Indiferente",
      "t.voir-les-resultats": "Ver resultados",
      "t.fermer-appliquer": "Listo",
      "t.effacer": "Borrar",
      "t.budget-eco": "≤ 250.000 F",
      "t.budget-luxe": "≥ 250.000 F",
      "t.voyageurs-2-6": "2 a 6 pers.",
      "t.voyageurs-8-12": "8 a 12 pers.",
      "t.voyageurs-12": "12 pers. o más",
      "t.toutes-court": "Todas",
      "t.tous-court": "Todos",
      "t.fermer": "Cerrar",
      "t.localisation": "Localidad",
      "t.toutes-localisations": "Todas las Localidades",
      "t.toutes-les-localisations": "Todas las localidades",
      "t.tous-budgets": "Todos los Presupuestos",
      "t.tous-emplacements": "Todas las ubicaciones",
      "t.villas-lagune": "Villas de laguna",
      "t.villas-ocean": "Villas de océano",
      "t.avec-piscine-privee": "Con piscina privada",
      "t.budget-nuitee": "Presupuesto / noche",
      "t.150-000-550-000-fcfa": "150.000 - 550.000 FCFA",
      "t.150-000-250-000-fcfa": "150.000 - 250.000 FCFA",
      "t.250-000-550-000-fcfa": "250.000 - 550.000 FCFA",
      "t.voyageurs": "Viajeros",
      "t.tout-nombre": "Cualquier número",
      "t.2-a-6-personnes": "De 2 a 6 personas",
      "t.8-a-12-personnes": "De 8 a 12 personas",
      "t.12-personnes": "Más de 12 personas",
      "t.proprietes-verifiees": "Propiedades verificadas",
      "t.100-qualite-standing": "100 % calidad y categoría",
      "t.conciergerie-dediee": "Conserjería dedicada",
      "t.accompagnement-vip": "Acompañamiento VIP",
      "t.meilleur-tarif-garanti": "Mejor precio garantizado",
      "t.direct-proprietaire": "Directo del propietario",
      "t.support-7j-7": "Atención los 7 días",
      "t.a-votre-ecoute-sur-whatsapp": "A su disposición en WhatsApp",
      "t.selection-exclusive": "SELECCIÓN EXCLUSIVA",
      "t.decouvrez-notre-selection-de-proprietes": "Descubra nuestra selección de propiedades excepcionales",
      "t.voir-tout-le-catalogue": "Ver todo el catálogo →",
      "t.vente-de-terrain": "VENTA DE TERRENOS",
      "t.terrains-a-vendre-a-assinie": "Terrenos en venta en Assinie",
      "t.voir-tous-les-terrains": "Ver todos los terrenos →",
      "t.nuitees-d-exception-reservees": "Noches excepcionales reservadas",
      "t.clients-familles-combles": "Clientes y familias satisfechos",
      "t.villas-pieds-dans-l-eau": "Villas a pie de agua o con piscina",
      "t.annees-d-excellence-a-assinie": "Años de excelencia en Assinie",
      "t.annees-d-excellence": "Años de excelencia",
      "t.a-propos-d-henri-philippe": "SOBRE HENRI & PHILIPPE",
      "t.sublimer-chaque-instant-de-votre": "Realzar cada instante de su estancia en Assinie",
      "t.chez-henri-philippe-detente-loisirs": "En Henri & Philippe - Détente & Loisirs seleccionamos con rigor las casas más bellas de Assinie para garantizarle una tranquilidad absoluta, instalaciones impecables y una experiencia tropical inolvidable.",
      "t.expertise-locale": "Conocimiento local",
      "t.maitrise-approfondie-d-assinie-et": "Conocimiento profundo de Assinie y de sus lagunas.",
      "t.service-personnalise": "Servicio personalizado",
      "t.chef-a-domicile-transferts-et": "Chef a domicilio, traslados y barcos privados.",
      "t.confiance-clarte": "Confianza y claridad",
      "t.contrats-certifies-tarifs-nets-direct": "Contratos certificados, precios netos directos del propietario.",
      "t.arrivee-fluide": "Llegada sin contratiempos",
      "t.ponton-prive-accueil-sur-place": "Embarcadero privado, recepción in situ y tranquilidad 24/7.",
      "t.en-savoir-plus-sur-nos": "Saber más sobre nuestros servicios →",
      "t.pieds-dans-l-eau": "A pie de agua",
      "t.plage-brise-marine": "Playa y brisa marina",
      "t.piscines-privees": "Piscinas privadas",
      "t.debordement-bains": "Desbordante y baños",
      "t.vente-de-terrain-2": "Venta de terrenos",
      "t.parcelles-lots": "Parcelas y lotes",
      "t.suites-penthouses": "Suites y áticos",
      "t.confort-exclusif": "Confort exclusivo",
      "t.bateaux-sorties": "Barcos y salidas",
      "t.cap-sur-la-passe": "Rumbo a La Passe",
      "t.loisirs-nautiques": "Ocio náutico",
      "t.jet-ski-quads": "Moto acuática y quads",
      "t.avis-voyageurs": "OPINIONES DE VIAJEROS",
      "t.ce-que-disent-nos-clients": "Lo que dicen nuestros clientes",
      "t.notre-sejour-a-la-villa": "«Nuestra estancia en la Villa Blanche Royale quedará grabada en nuestra memoria. El embarcadero privado, el chef y el entorno idílico frente a la laguna superaron todas nuestras expectativas. ¡Una rapidez de respuesta ejemplar en WhatsApp!»",
      "t.sejour-en-famille-abidjan": "Estancia en familia • Abiyán",
      "t.restez-informe-e-de-nos": "Manténgase al día de nuestras ofertas exclusivas",
      "t.recevez-en-avant-premiere-les": "Reciba en primicia la disponibilidad de los fines de semana y las promociones especiales en Assinie.",
      "t.s-inscrire": "Suscribirse",
      "t.location-de-residences-de-vacances": "Alquiler de residencias de vacaciones con piscina, villas excepcionales a pie de agua y conserjería náutica en Assinie, Costa de Marfil.",
      "t.navigation": "Navegación",
      "t.prestations-vip": "Servicios VIP",
      "t.chef-cuisinier-a-domicile": "Chef a domicilio",
      "t.traversee-lagunaire": "Travesía por la laguna",
      "t.excursions-bateau-la-passe": "Excursiones en barco a La Passe",
      "t.jet-ski-randonnees-quad": "Moto acuática y rutas en quad",
      "t.contact-direct": "Contacto directo",
      "t.whatsapp-direct-7j-7": "WhatsApp directo los 7 días",
      "t.2026-henri-philippe-detente-loisirs": "© 2026 Henri & Philippe - Détente & Loisirs, Assinie. Todos los derechos reservados.",
      "t.concu-pour-sublimer-vos-sejours": "Creado para realzar sus estancias en Costa de Marfil 🌴🇨🇮",
      "t.whatsapp-direct": "WhatsApp directo",
      "t.nos-residences-villas": "Nuestras residencias y villas",
      "t.nos-residences-demeures-d-exception": "Nuestras residencias y casas excepcionales",
      "t.des-cadres-idylliques-equipes-avec": "Entornos idílicos con piscina privada, embarcadero en la laguna o acceso directo al océano, para vacaciones y fines de semana excepcionales en Assinie.",
      "t.toutes-nos-residences": "Todas nuestras residencias",
      "t.bord-d-ocean": "Frente al océano",
      "t.grands-groupes-evenements": "Grupos grandes y eventos",
      "t.escapades-en-amoureux": "Escapadas en pareja",
      "t.activites-loisirs-2": "Actividades y Ocio",
      "t.terrains-a-vendre": "Terrenos en venta",
      "t.vente-de-terrains-a-assinie": "Venta de terrenos en Assinie",
      "t.parcelles-bord-de-lagune-terrains": "Parcelas frente a la laguna, terrenos costeros y lotes urbanizados en Assinie-Mafia. Cada anuncio indica su superficie, su precio por m² y su situación registral, verificada antes de la puesta en venta.",
      "t.foncier-verifie": "TITULARIDAD VERIFICADA",
      "t.choisissez-votre-parcelle-a-assinie": "Elija su parcela en Assinie",
      "t.nous-ne-presentons-que-des": "Solo presentamos terrenos cuyos documentos han sido comprobados. La situación registral aparece en cada anuncio, sin excepción.",
      "t.statut-foncier": "Situación registral",
      "t.tous-les-statuts": "Todas las situaciones",
      "t.titre-foncier": "Título de propiedad",
      "t.lettre-d-attribution": "Carta de adjudicación",
      "t.superficie": "Superficie",
      "t.toutes-superficies": "Todas las superficies",
      "t.moins-de-800-m": "Menos de 800 m²",
      "t.800-a-1-500-m": "De 800 a 1.500 m²",
      "t.plus-de-1-500-m": "Más de 1.500 m²",
      "t.disponibilite": "Disponibilidad",
      "t.toutes-les-annonces": "Todos los anuncios",
      "t.disponible": "Disponible",
      "t.reserve": "Reservado",
      "t.vendu": "Vendido",
      "t.comment-se-deroule-un-achat": "¿Cómo se desarrolla una compra?",
      "t.visite-de-la-parcelle-sur": "Visita de la parcela con cita previa, comprobación de los documentos con el propietario, firma del contrato de arras ante notario y, después, cambio de titularidad a su nombre. Le acompañamos en cada paso y le ponemos en contacto con el notario que usted elija.",
      "t.prendre-rendez-vous-pour-une": "Pedir cita para una visita →",
      "t.soyez-alerte-e-des-nouvelles": "Reciba avisos de nuevas parcelas",
      "t.recevez-en-avant-premiere-les-2": "Reciba en primicia los terrenos que salen a la venta en Assinie antes de su publicación.",
      "t.location-de-residences-de-vacances-2": "Alquiler de residencias de vacaciones con piscina, villas excepcionales a pie de agua, venta de terrenos y conserjería náutica en Assinie, Costa de Marfil.",
      "t.jet-ski-randonnees-quad-2": "Moto acuática y rutas en quad",
      "t.2026-henri-philippe-detente-loisirs-2": "© 2026 Henri & Philippe - Détente & Loisirs, Assinie. Todos los derechos reservados.",
      "t.concu-pour-sublimer-vos-sejours-2": "Creado para realzar sus estancias en Costa de Marfil",
      "t.activites-loisirs-inoubliables": "Actividades y ocio inolvidables",
      "t.entre-les-eaux-calmes-de": "Entre las aguas tranquilas de la laguna Aby y la inmensidad del océano Atlántico, viva sensaciones fuertes y momentos de pura contemplación en Assinie.",
      "t.experiences-nautiques-terrestres": "EXPERIENCIAS NÁUTICAS Y TERRESTRES",
      "t.toutes-nos-activites-a-la": "Todas nuestras actividades a la carta",
      "t.calculer-un-devis-activites": "Calcular presupuesto de actividades →",
      "t.les-merveilles-d-assinie": "LAS MARAVILLAS DE ASSINIE",
      "t.ce-qu-il-faut-absolument": "Lo que hay que vivir sin falta",
      "t.la-passe-d-assinie": "La Passe d'Assinie",
      "t.l-endroit-emblematique-ou-la": "El lugar emblemático donde la laguna se encuentra con el océano Atlántico. Accesible en barco privado, La Passe ofrece bancos de arena blanca inmaculada, perfectos para un aperitivo al atardecer con los pies en el agua.",
      "t.parc-national-des-iles-ehotiles": "Parque Nacional de las Islas Éhotilés",
      "t.compose-de-6-iles-preservees": "Formado por 6 islas vírgenes en el corazón de la laguna Aby, este archipiélago declarado reserva nacional alberga manatíes de África Occidental, murciélagos frugívoros gigantes y árboles sagrados centenarios.",
      "t.parc-zoologique-dipi-culture": "Parque Zoológico Dipi y cultura",
      "t.situe-a-assinie-mafia-ce": "Situado en Assinie-Mafia, este santuario natural permite observar impresionantes cocodrilos del Nilo, tortugas gigantes y monos, y se completa con una visita a la artesanía local y a la corte real de Assinie.",
      "t.villas-privees-avec-piscine-residences": "Villas privadas con piscina, residencias de vacaciones y organización de actividades náuticas excepcionales en Assinie.",
      "t.loisirs-a-assinie": "Ocio en Assinie",
      "t.balade-bateau-vers-la-passe": "Paseo en barco hasta La Passe",
      "t.jet-ski-bouee-tractee": "Moto acuática y boya arrastrada",
      "t.randonnee-quad-sur-la-plage": "Ruta en quad por la playa",
      "t.simulateur-de-devis-reservation": "Simulador de presupuesto y reserva",
      "t.configurez-votre-sejour-sur-mesure": "Configure su estancia a medida en tiempo real con las opciones que desee y confírmela al instante por WhatsApp.",
      "t.personnalisez-votre-sejour": "Personalice su estancia",
      "t.que-souhaitez-vous-reserver": "¿Qué desea reservar?",
      "t.sejour-en-residence": "Estancia en residencia",
      "t.hebergement-activites-au-choix": "Alojamiento + actividades a elegir",
      "t.activites-uniquement": "Solo actividades",
      "t.sans-hebergement": "Sin alojamiento",
      "t.voiture-seule": "Solo coche",
      "t.location-avec-ou-sans-chauffeur": "Alquiler, con o sin chófer",
      "t.location-de-voiture": "Alquiler de coche:",
      "t.filtrer-les-residences": "Filtrar las residencias:",
      "t.choisir-la-residence-souhaitee": "Elija la residencia que desee:",
      "t.arrivee-check-in-14h": "Llegada (entrada a las 14:00):",
      "t.depart-check-out-12h": "Salida (salida a las 12:00):",
      "t.nombre-de-voyageurs": "Número de viajeros:",
      "t.2-personnes-couple-intime": "2 personas (pareja / íntimo)",
      "t.4-personnes": "4 personas",
      "t.6-personnes": "6 personas",
      "t.8-personnes": "8 personas",
      "t.10-personnes": "10 personas",
      "t.12-personnes-2": "12 personas",
      "t.15-personnes-grand-groupe-evenement": "Más de 15 personas (grupo grande / evento)",
      "t.services-vip-loisirs-additionnels": "Servicios VIP y actividades adicionales:",
      "t.recapitulatif-du-sejour": "RESUMEN DE LA ESTANCIA",
      "t.tarif-de-la-nuitee": "Precio por noche:",
      "t.duree-du-sejour": "Duración de la estancia:",
      "t.sous-total-hebergement": "Subtotal alojamiento:",
      "t.prestations-loisirs-vip": "Servicios y actividades VIP:",
      "t.montant-total-estime": "Importe total estimado:",
      "t.acompte-de-30-requis-a": "* Se exige un anticipo del 30 % al confirmar. El resto se abona en la entrega de llaves en Assinie. La fianza se devuelve tras el inventario de salida.",
      "t.vos-coordonnees": "Sus datos de contacto",
      "t.nom-et-prenom": "Nombre y apellidos:",
      "t.telephone-contact": "Teléfono de contacto WhatsApp:",
      "t.ex-nom-prenom": "Ej.: Aya Kouassi",
      "t.ex-telephone": "Ej.: +225 07 00 00 00 00",
      "t.adresse-email": "Correo electrónico:",
      "t.ex-email": "Ej.: aya.kouassi@gmail.com",
      "t.optin-whatsapp": "Acepto recibir las ofertas de Détente & Loisirs à Assinie por WhatsApp (baja en cualquier momento respondiendo STOP).",
      "t.services-conciergerie": "SERVICIOS DE CONSERJERÍA",
      "t.ce-qui-rend-votre-sejour": "Lo que hace su estancia inolvidable",
      "t.chef-cuisinier-dedie": "Chef exclusivo",
      "t.savourez-poissons-braises-frais-de": "Disfrute de pescado fresco a la brasa de la laguna, carpaccios de attiéké, gambas a la parrilla y cocina internacional preparada en casa por nuestros chefs experimentados.",
      "t.ponton-traversee-lagunaire": "Embarcadero y travesía por la laguna",
      "t.embarquement-immediat-depuis-le-ponton": "Embarque inmediato desde el embarcadero privado de su villa para excursiones a La Passe, a las islas Éhotilés o a las playas salvajes.",
      "t.energie-continue-24-7": "Energía continua 24/7",
      "t.toutes-nos-residences-sont-equipees": "Todas nuestras residencias cuentan con generadores automáticos de gran potencia, aire acondicionado silencioso y reserva de agua tratada.",
      "t.bateau-la-passe": "Barco a La Passe",
      "t.jet-ski-bouee": "Moto acuática y boya",
      "t.foire-aux-questions": "Preguntas frecuentes",
      "t.foire-aux-questions-faq": "Preguntas frecuentes (FAQ)",
      "t.retrouvez-les-reponses-completes-et": "Encuentre respuestas completas y detalladas a todas sus dudas para preparar su estancia con total tranquilidad.",
      "t.informations-pratiques": "INFORMACIÓN PRÁCTICA",
      "t.tout-ce-que-vous-devez": "Todo lo que debe saber antes de llegar",
      "t.des-modalites-d-acompte-aux": "Desde las condiciones del anticipo hasta las instrucciones de acceso en barco y el confort de nuestras residencias, consulte las respuestas a continuación.",
      "t.vous-n-avez-pas-trouve": "¿No ha encontrado su respuesta?",
      "t.notre-conciergerie-vous-repond-instantanemen": "Nuestra conserjería le responde al instante por WhatsApp, los siete días de la semana.",
      "t.contactez-notre-conciergerie": "Contacte con nuestra conserjería",
      "t.notre-equipe-locale-est-a": "Nuestro equipo local está a su disposición los siete días de la semana para asesorarle, organizar su llegada y realzar su estancia en Assinie.",
      "t.disponibilite-accueil-7j-7": "DISPONIBILIDAD Y ATENCIÓN LOS 7 DÍAS",
      "t.une-equipe-dediee-pour-vous": "Un equipo dedicado para responderle",
      "t.pour-verifier-les-disponibilites-d": "Para comprobar la disponibilidad de un fin de semana, pedir un presupuesto de catering para un cumpleaños o planificar una salida en barco, escríbanos directamente por WhatsApp.",
      "t.whatsapp-ligne-directe": "WhatsApp y línea directa",
      "t.bureau-de-reception-et-reservation": "Oficina de recepción y reservas",
      "t.page-facebook-officielle": "Página oficial de Facebook",
      "t.discuter-en-direct-sur-whatsapp": "Hablar en directo por WhatsApp",
      "t.localisation-privilegiee": "UBICACIÓN PRIVILEGIADA",
      "t.a-1h15-d-abidjan-par": "A 1 h 15 de Abiyán por la autopista internacional de Grand-Bassam. Nuestros equipos le esperan en el embarcadero privado para garantizar un traslado seguro.",
      "t.parking-prive-garde": "🚗 Aparcamiento privado vigilado",
      "t.ponton-bateau-prive": "🚤 Embarcadero y barco privados",
      "t.coordonnees-gps-directes": "📍 Coordenadas GPS directas",
      "t.demander-l-itineraire-gps-sur": "Pedir la ruta GPS por WhatsApp",
      "t.besoin-de-reponses-rapides": "¿NECESITA RESPUESTAS RÁPIDAS?",
      "t.consultez-notre-foire-aux-questions": "Consulte nuestras preguntas frecuentes",
      "t.decouvrez-tout-sur-les-acomptes": "Descubra todo sobre los anticipos, los horarios de llegada y salida, las fianzas y el equipamiento incluido.",
      "t.acceder-a-la-faq": "Ir a las preguntas frecuentes →",
      "t.moyens-de-paiement": "Formas de pago",
      "t.virement-bancaire": "Transferencia bancaria",
      "t.especes-a-l-arrivee": "Efectivo a la llegada"
    }
  };

  /* -----------------------------------------------------------------------
     ÉTAT
     -------------------------------------------------------------------- */
  function estConnue(code) {
    return LANGUES.some(function (l) { return l.code === code; });
  }

  /**
   * Langue retenue, par ordre de priorité : choix explicite mémorisé, puis
   * langue du navigateur, puis français. Le choix du visiteur prime toujours
   * sur la détection automatique — une fois qu'il a cliqué, on ne le contredit
   * plus, même s'il revient depuis un navigateur configuré autrement.
   */
  function langueInitiale() {
    var memorisee = null;
    try { memorisee = global.localStorage.getItem(CLE_STOCKAGE); } catch (e) { memorisee = null; }
    if (estConnue(memorisee)) return memorisee;
    var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "";
    var court = String(nav).slice(0, 2).toLowerCase();
    return estConnue(court) ? court : DEFAUT;
  }

  var langueCourante = langueInitiale();

  function t(cle) {
    var table = DICT[langueCourante] || {};
    if (Object.prototype.hasOwnProperty.call(table, cle)) return table[cle];
    var secours = DICT[DEFAUT] || {};
    return Object.prototype.hasOwnProperty.call(secours, cle) ? secours[cle] : "";
  }

  /**
   * Traduction d'une FICHE du catalogue (villa, activité, terrain).
   *
   * Les traductions saisies dans le studio sont rangées dans
   * `item.translations = { en: { title: "…" }, es: { … } }`. Une valeur
   * absente ou vide retombe sur le français : une fiche non encore traduite
   * reste lisible au lieu d'apparaître vide sur le site anglais.
   */
  function traduireFiche(item, champ) {
    if (!item) return "";
    var original = item[champ];
    if (langueCourante === DEFAUT) return original;
    var trad = item.translations && item.translations[langueCourante];
    var valeur = trad ? trad[champ] : null;
    if (valeur === null || valeur === undefined) return original;
    if (typeof valeur === "string" && !valeur.trim()) return original;
    if (Array.isArray(valeur) && !valeur.length) return original;
    return valeur;
  }

  /* -----------------------------------------------------------------------
     APPLICATION AU DOCUMENT
     `data-i18n` remplace le texte ; `data-i18n-attr` traduit des attributs,
     au format "attribut:clé" séparés par des virgules — indispensable pour
     les `placeholder`, `aria-label`, `title` et `alt`, qui sont lus par les
     lecteurs d'écran et les moteurs de recherche autant que le texte visible.
     -------------------------------------------------------------------- */
  function appliquer(racine) {
    var hote = racine || global.document;
    if (!hote || !hote.querySelectorAll) return;

    hote.querySelectorAll("[data-i18n]").forEach(function (el) {
      var valeur = t(el.getAttribute("data-i18n"));
      if (valeur) el.textContent = valeur;
    });

    hote.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (paire) {
        var morceaux = paire.split(":");
        if (morceaux.length !== 2) return;
        var valeur = t(morceaux[1].trim());
        if (valeur) el.setAttribute(morceaux[0].trim(), valeur);
      });
    });

    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute("lang", langueCourante);
    }
  }

  /**
   * Change la langue et prévient le reste du site.
   * L'événement `dl:langue` permet à js/app.js de redessiner tout ce qui est
   * généré en JavaScript (cartes de villas, simulateur de devis…), qui ne
   * passe pas par `data-i18n`.
   */
  function definirLangue(code) {
    if (!estConnue(code) || code === langueCourante) return;
    langueCourante = code;
    try { global.localStorage.setItem(CLE_STOCKAGE, code); } catch (e) { /* navigation privée */ }
    appliquer();
    majSelecteurs();
    global.document.dispatchEvent(new CustomEvent("dl:langue", { detail: { langue: code } }));
  }

  /* -----------------------------------------------------------------------
     SÉLECTEUR DE LANGUE
     Remplace le bouton burger en desktop, où le menu est déjà déroulé et
     rendait ce burger inutile.
     -------------------------------------------------------------------- */
  /** Pose un drapeau devant chaque choix du menu, une seule fois. */
  function poserDrapeaux() {
    global.document.querySelectorAll("[data-langue]").forEach(function (btn) {
      if (btn.querySelector(".langue-drapeau")) return;
      btn.insertAdjacentHTML("afterbegin", drapeau(btn.getAttribute("data-langue")));
    });
  }

  function majSelecteurs() {
    var courante = LANGUES.filter(function (l) { return l.code === langueCourante; })[0] || LANGUES[0];
    global.document.querySelectorAll("[data-langue-drapeau]").forEach(function (el) {
      el.innerHTML = drapeau(langueCourante);
    });
    global.document.querySelectorAll("[data-langue-actuelle]").forEach(function (el) {
      el.textContent = courante.court;
    });
    global.document.querySelectorAll("[data-langue]").forEach(function (btn) {
      var actif = btn.getAttribute("data-langue") === langueCourante;
      btn.setAttribute("aria-selected", actif ? "true" : "false");
      btn.classList.toggle("est-actif", actif);
    });
  }

  function fermerMenus(sauf) {
    global.document.querySelectorAll("[data-selecteur-langue]").forEach(function (bloc) {
      if (bloc === sauf) return;
      var menu = bloc.querySelector(".langue-menu");
      var bouton = bloc.querySelector(".langue-bouton");
      if (menu) menu.hidden = true;
      if (bouton) bouton.setAttribute("aria-expanded", "false");
    });
  }

  function brancherSelecteurs() {
    global.document.querySelectorAll("[data-selecteur-langue]").forEach(function (bloc) {
      var bouton = bloc.querySelector(".langue-bouton");
      var menu = bloc.querySelector(".langue-menu");
      if (!bouton || !menu) return;

      bouton.addEventListener("click", function (event) {
        event.stopPropagation();
        var ouvert = menu.hidden === false;
        fermerMenus(bloc);
        menu.hidden = ouvert;
        bouton.setAttribute("aria-expanded", ouvert ? "false" : "true");
      });

      menu.querySelectorAll("[data-langue]").forEach(function (choix) {
        choix.addEventListener("click", function (event) {
          event.stopPropagation();
          definirLangue(choix.getAttribute("data-langue"));
          menu.hidden = true;
          bouton.setAttribute("aria-expanded", "false");
          bouton.focus();
        });
      });
    });

    global.document.addEventListener("click", function () { fermerMenus(null); });
    global.document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") fermerMenus(null);
    });
  }

  function demarrer() {
    appliquer();
    poserDrapeaux();
    brancherSelecteurs();
    majSelecteurs();
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", demarrer);
    } else {
      demarrer();
    }
  }

  global.I18N = {
    langues: LANGUES,
    defaut: DEFAUT,
    langue: function () { return langueCourante; },
    definirLangue: definirLangue,
    t: t,
    fiche: traduireFiche,
    appliquer: appliquer,
    dictionnaire: DICT
  };
})(typeof window !== "undefined" ? window : this);
