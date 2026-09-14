/**
 * Données des Résidences & Villas de vacances - Détente & Loisirs à Assinie
 * Téléphone / WhatsApp : +225 07 67 69 63 18
 */

const VILLAS_DATA = [
  {
    id: "villa-oasis",
    name: "Villa L'Oasis d'Assinie",
    tagline: "Villa de prestige avec ponton privé sur la lagune & piscine miroir",
    category: "lagune",
    environment: "lagune",
    categoryLabel: "Bord de Lagune",
    featured: true,
    badge: "Coup de Cœur",
    location: "Assinie-Mafia, Km 14 (Bord de lagune)",
    capacity: 10,
    bedrooms: 4,
    bathrooms: 4,
    beds: "4 lits King Size + 2 banquettes salon",
    pricePerNight: 250000, // FCFA
    priceEuro: 380,
    weekendPackage: 450000, // Forfait week-end du vendredi 15h au dimanche 18h
    rating: 4.95,
    reviewsCount: 38,
    images: [
      "assets/images/residence-villa-luxe.jpg",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Nichée au cœur de la splendide lagune d'Assinie-Mafia, la Villa L'Oasis est un écrin de calme et de luxe. Dotée d'une magnifique piscine à débordement donnant directement sur l'eau et de son propre ponton privatif, elle offre un cadre parfait pour amarrer votre bateau ou profiter de départs directs vers La Passe. Son grand salon lumineux et sa cuisine américaine moderne s'ouvrent sur un deck spacieux où il fait bon partager des grillades au coucher du soleil.",
    features: [
      "Piscine privée à débordement",
      "Ponton privé d'amarrage (Lagune)",
      "Climatisation intégrale",
      "Wi-Fi Fibre Haut Débit",
      "Smart TV 65'' (Canal+ & Netflix)",
      "Cuisine américaine super équipée",
      "Barbecue au charbon de bois",
      "Groupe électrogène automatique",
      "Gardien de sécurité 24h/24",
      "Ménage quotidien & gouvernante",
      "Terrasse lounge & transats",
      "Parking privé sécurisé (4 voitures)"
    ],
    highlights: ["Accès bateau direct", "Piscine lagon", "Vue coucher de soleil", "Haute intimité"]
  },
  {
    id: "residence-palm-beach",
    name: "Résidence Palm Beach Luxury",
    tagline: "Élégance balnéaire pieds dans l'eau côté océan Atlantique",
    category: "ocean",
    environment: "ocean",
    categoryLabel: "Bord d'Océan",
    featured: true,
    badge: "Plage Privée",
    location: "Assinie Terminal (Accès direct plage)",
    capacity: 12,
    bedrooms: 5,
    bathrooms: 5,
    beds: "5 lits Queen Size climatisés",
    pricePerNight: 320000,
    priceEuro: 488,
    weekendPackage: 580000,
    rating: 4.9,
    reviewsCount: 29,
    images: [
      "assets/images/residence-ocean-assinie.jpg",
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Offrez-vous le privilège rare de vous réveiller avec le doux ressac des vagues de l'océan Atlantique. Située sur la bande côtière d'Assinie, la Résidence Palm Beach allie architecture contemporaine et finitions en bois précieux. Sa piscine turquoise surplombe la plage sauvage protégée par une rangée de cocotiers majestueux. Idéale pour les grandes familles et les séjours entre amis à la recherche d'évasion pure.",
    features: [
      "Accès direct à la plage de sable fin",
      "Piscine privée avec deck en teck",
      "5 suites climatisées vue mer",
      "Système sono extérieur Bluetooth",
      "Wi-Fi Starlink haut débit",
      "Cuisine de chef & îlot central",
      "Barbecue géant sous paillote",
      "Groupe électrogène de secours",
      "Gardiennage 24/7 & alarme",
      "Possibilité de chef cuisinier dédié",
      "Transats & parasols tropicaux",
      "Douche extérieure de plage"
    ],
    highlights: ["Pieds dans l'eau océan", "Barbecue géant", "Starlink très rapide", "Cadre exclusif"]
  },
  {
    id: "villa-akwaba",
    name: "Villa Akwaba Lagoon",
    tagline: "Havre de paix tropical avec jardin arboré et piscine privative",
    category: "piscine",
    environment: "piscine",
    categoryLabel: "Piscine Privée",
    featured: false,
    badge: "Famille & Amis",
    location: "Assinie-Mafia, Km 9",
    capacity: 8,
    bedrooms: 3,
    bathrooms: 3,
    beds: "3 lits King Size + 1 lit d'appoint",
    pricePerNight: 180000,
    priceEuro: 275,
    weekendPackage: 330000,
    rating: 4.88,
    reviewsCount: 44,
    images: [
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Une atmosphère chaleureuse et conviviale vous attend à la Villa Akwaba. Entourée d'une végétation luxuriante de bougainvilliers et de palmiers, cette villa de plain-pied offre une piscine privée sécurisée, idéale pour les enfants. La grande terrasse couverte vous permettra de savourer un bon poisson braisé ou une langouste fraîche dans la plus pure tradition ivoirienne.",
    features: [
      "Piscine privée au centre du jardin",
      "3 chambres autonomes climatisées",
      "Terrasse ombragée avec table 10 couverts",
      "Wi-Fi haut débit",
      "TV écran plat avec Canal+",
      "Cuisine toute équipée (gazinière, four, micro-ondes, frigo)",
      "Espace barbecue Weber",
      "Agent d'entretien et gardien",
      "Jeux de société et espace détente",
      "Stationnement clôturé"
    ],
    highlights: ["Idéal enfants & familles", "Jardin tropical", "Excellent rapport qualité/prix"]
  },
  {
    id: "domaine-eden",
    name: "Le Domaine Éden Assinie",
    tagline: "Domaine grandiose pour réceptions, mariages, séminaires & grands groupes",
    category: "evenement",
    environment: "terre",
    categoryLabel: "Événements & Séminaires",
    featured: true,
    badge: "Grands Groupes",
    location: "Assinie-Mafia, Km 18",
    capacity: 18,
    bedrooms: 7,
    bathrooms: 8,
    beds: "7 grandes suites avec salles de bain privatives",
    pricePerNight: 500000,
    priceEuro: 760,
    weekendPackage: 920000,
    rating: 4.98,
    reviewsCount: 19,
    images: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Le Domaine Éden est une propriété de prestige sans équivalent à Assinie, s'étendant sur plus de 2 500 m² de terrain paysager. Conçu spécialement pour recevoir avec faste, il abrite une piscine monumentale avec bar aquatique immergé, un préau de réception couvert pour 80 convives, une cuisine de traiteur professionnelle et 7 suites haut de gamme. C'est l'adresse de référence pour les retraites d'entreprise, les mariages intimes et les grands anniversaires.",
    features: [
      "Piscine XXL avec bar aquatique",
      "Parc paysager pour réceptions (jusqu'à 80 pers.)",
      "7 suites indépendantes climatisées",
      "Espace séminaire avec projecteur & sono",
      "Cuisine professionnelle traiteur",
      "Grand ponton privé sur la lagune",
      "Chef et maître d'hôtel disponibles",
      "Sécurité renforcée 24/7 avec vidéosurveillance",
      "Groupe électrogène industriel insonorisé",
      "Wi-Fi ultra-puissant sur tout le domaine",
      "Grand parking pour plus de 10 véhicules"
    ],
    highlights: ["Capacité 18 couchages", "Jusqu'à 80 invités cocktail", "Bar aquatique", "Prestations traiteur VIP"]
  },
  {
    id: "pavillon-serenite",
    name: "Pavillon Sérénité - Duplex Privé",
    tagline: "Nid douillet intime pour couples et escapades romantiques",
    category: "romantique",
    environment: "terre",
    categoryLabel: "Escapade Romantique",
    featured: false,
    badge: "Spécial Couple",
    location: "Assinie, Km 6",
    capacity: 4,
    bedrooms: 2,
    bathrooms: 2,
    beds: "2 lits Queen Size climatisés",
    pricePerNight: 120000,
    priceEuro: 183,
    weekendPackage: 220000,
    rating: 4.92,
    reviewsCount: 33,
    images: [
      "https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Le Pavillon Sérénité est un charmant duplex architectural parfait pour un week-end romantique en tête-à-tête ou pour deux couples d'amis. Profitez d'une atmosphère lounge paisible, de chambres douillettes avec balcons fleuris, d'un bassin d'eau rafraîchissant privatif et d'un hamac sous les cocotiers pour vous ressourcer loin de l'effervescence d'Abidjan.",
    features: [
      "Bassin privé rafraîchissant / Jacuzzi extérieur",
      "2 chambres cosy à l'étage climatisées",
      "Balcon avec vue sur le coucher de soleil",
      "Cuisine équipée & machine Nespresso",
      "Salon intime avec Smart TV",
      "Wi-Fi rapide",
      "Hamac et coin lecture détente",
      "Service petit-déjeuner sur demande",
      "Gardiennage discret 24/7"
    ],
    highlights: ["Ambiance intimiste", "Parfait pour couples", "Calme absolu"]
  },
  {
    id: "villa-sunset-paradise",
    name: "Villa Sunset Paradise",
    tagline: "Architecture contemporaine avec coucher de soleil spectaculaire sur la lagune",
    category: "lagune",
    environment: "lagune",
    categoryLabel: "Bord de Lagune",
    featured: true,
    badge: "Vue Exceptionnelle",
    location: "Assinie-Mafia, Km 16",
    capacity: 10,
    bedrooms: 4,
    bathrooms: 4,
    beds: "4 grandes suites avec vue lagon",
    pricePerNight: 280000,
    priceEuro: 427,
    weekendPackage: 500000,
    rating: 4.96,
    reviewsCount: 26,
    images: [
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80"
    ],
    description: "Orientation plein ouest pour des couchers de soleil féeriques ! La Villa Sunset Paradise marie un design épuré ultra-moderne à l'authenticité de la lagune d'Assinie. Les larges baies vitrées coulissantes créent une continuité parfaite entre le séjour climatisé et l'immense terrasse extérieure avec piscine à débordement et salon flottant sur le ponton.",
    features: [
      "Piscine miroir face au soleil couchant",
      "Grand ponton aménagé avec salon lounge",
      "4 suites climatisées avec dressing et vue lagune",
      "Table de billard & jeux",
      "Wi-Fi Starlink haut débit",
      "Cuisine américaine haut de gamme",
      "Espace barbecue & plancha",
      "Système de secours électrique automatique",
      "Gouvernante et veilleur de nuit",
      "Accès facile aux pinasses et bateaux pour La Passe"
    ],
    highlights: ["Coucher de soleil féerique", "Table de billard", "Ponton lounge", "Finition grand luxe"]
  }
];

/**
 * Vente de terrains à Assinie.
 * Repli statique utilisé lorsque `GET /api/content` n'est pas joignable
 * (ouverture du site en `file://`). Schéma identique à `data/site-content.json`.
 * `pricePerSqm` et `priceEuro` sont recalculés côté serveur : les valeurs
 * ci-dessous ne servent que d'affichage hors ligne.
 */
const TERRAINS_DATA = [
  {
    id: "terrain-lagune-km12",
    reference: "TER-ASS-001",
    title: "Parcelle pied dans l’eau — Lagune Aby",
    location: "Assinie-Mafia, Km 12 (bord de lagune)",
    district: "Lotissement Aby Résidence",
    areaSqm: 1200,
    priceTotal: 96000000,
    pricePerSqm: 80000,
    priceEuro: 146351,
    landStatus: "titre-foncier",
    landStatusLabel: "Titre foncier",
    utilities: ["eau", "electricite", "voie-bitumee", "borne"],
    status: "disponible",
    description: "Parcelle rectangulaire de 1 200 m² avec 24 mètres de façade directe sur la lagune Aby. Terrain plat, remblayé et borné, adapté à la construction d’une villa avec ponton privé. Raccordements eau et électricité en limite de parcelle. Accès par voie bitumée depuis la route d’Assinie.",
    images: ["assets/images/residence-villa-luxe.jpg"],
    highlights: [
      "24 m de façade lagune",
      "Terrain borné et remblayé",
      "Ponton privatif réalisable",
      "Voie bitumée jusqu’à la parcelle"
    ],
    visible: true,
    featured: true,
    badge: "Exclusivité",
    latitude: 5.1421,
    longitude: -3.2894
  },
  {
    id: "terrain-ocean-mafia",
    reference: "TER-ASS-002",
    title: "Terrain balnéaire second rideau — Océan",
    location: "Assinie-Mafia, côté océan",
    district: "Quartier Mafia Plage",
    areaSqm: 800,
    priceTotal: 48000000,
    pricePerSqm: 60000,
    priceEuro: 73176,
    landStatus: "acd",
    landStatusLabel: "ACD (Arrêté de Concession Définitive)",
    utilities: ["eau", "electricite", "cloture"],
    status: "disponible",
    description: "Parcelle de 800 m² située en second rideau de la plage, à 120 mètres de l’océan. Déjà clôturée sur trois côtés. Environnement résidentiel calme, idéal pour une résidence secondaire ou un projet locatif saisonnier.",
    images: ["assets/images/residence-ocean-assinie.jpg"],
    highlights: [
      "À 120 m de l’océan",
      "Déjà clôturé",
      "ACD en cours de mutation",
      "Zone résidentielle calme"
    ],
    visible: true,
    featured: true,
    badge: "",
    latitude: 5.1305,
    longitude: -3.2762
  },
  {
    id: "terrain-lotissement-passe",
    reference: "TER-ASS-003",
    title: "Lot viabilisé — Résidence de La Passe",
    location: "Assinie, secteur La Passe",
    district: "Lotissement La Passe",
    areaSqm: 500,
    priceTotal: 22500000,
    pricePerSqm: 45000,
    priceEuro: 34301,
    landStatus: "lettre-attribution",
    landStatusLabel: "Lettre d’attribution",
    utilities: ["eau", "electricite", "voie-bitumee", "assainissement", "borne"],
    status: "reserve",
    description: "Lot de 500 m² dans un lotissement entièrement viabilisé : voirie, réseau d’eau, électricité et assainissement en place. Bornage réalisé, plan de lotissement approuvé. Proche des commerces et du débarcadère.",
    images: ["assets/images/plage-assinie-passe.jpg"],
    highlights: [
      "Lotissement viabilisé",
      "Bornage réalisé",
      "Proche débarcadère",
      "Assainissement en place"
    ],
    visible: true,
    featured: false,
    badge: "Réservé",
    latitude: 5.1198,
    longitude: -3.2641
  },
  {
    id: "terrain-grand-lot-agrement",
    reference: "TER-ASS-004",
    title: "Grand lot d’agrément — 3 000 m²",
    location: "Assinie-Mafia, Km 16",
    district: "Zone Km 16",
    areaSqm: 3000,
    priceTotal: 150000000,
    pricePerSqm: 50000,
    priceEuro: 228674,
    landStatus: "titre-foncier",
    landStatusLabel: "Titre foncier",
    utilities: ["electricite", "voie-bitumee", "borne"],
    status: "disponible",
    description: "Grande parcelle de 3 000 m² plantée de cocotiers, adaptée à un projet hôtelier, un éco-lodge ou une résidence familiale de grande capacité. Titre foncier disponible, terrain libre de toute occupation.",
    images: ["assets/images/quad-plage-assinie.jpg"],
    highlights: [
      "3 000 m² d’un seul tenant",
      "Planté de cocotiers",
      "Titre foncier disponible",
      "Libre de toute occupation"
    ],
    visible: true,
    featured: false,
    badge: "Projet hôtelier",
    latitude: 5.1487,
    longitude: -3.3012
  }
];

// Activités & Loisirs exclusifs à Assinie
const ACTIVITIES_DATA = [
  {
    id: "balade-bateau",
    title: "Balade privée en Bateau vers La Passe",
    subtitle: "L'incontournable d'Assinie",
    description: "Embarquez depuis le ponton de votre villa pour une navigation le long de la lagune jusqu'à la mythique Passe d'Assinie, où les eaux calmes de la lagune Aby rencontrent la houle de l'océan Atlantique. Arrêt sur les bancs de sable préservés.",
    duration: "2 heures ou demi-journée",
    price: "À partir de 60 000 FCFA / sortie",
    image: "assets/images/bateau-excursion-lagune.jpg",
    badge: "Top Activité"
  },
  {
    id: "jet-ski",
    title: "Sensations Jet Ski & Bouée Tractée",
    subtitle: "Adrénaline sur la lagune",
    description: "Pilotez des Jet Skis dernière génération sur les vastes étendues calmes de la lagune d'Assinie en toute sécurité. Possibilité de bouée tractée pour les amateurs de fous rires en famille ou entre amis.",
    duration: "30 min ou 1 heure",
    price: "45 000 FCFA / 30 min",
    image: "assets/images/jetski-lagune-assinie.jpg",
    badge: "Sensations Fortes"
  },
  {
    id: "iles-ehotiles",
    title: "Excursion aux Îles Éhotilés",
    subtitle: "Parc National & Nature Sauvage",
    description: "Découverte guidée de l'archipel historique des Îles Éhotilés, réserve naturelle protégée abritant une faune exceptionnelle, des lamantins, des oiseaux migrateurs et des arbres centenaires sacrés.",
    duration: "Demi-journée avec guide",
    price: "75 000 FCFA pour le groupe",
    image: "assets/images/plage-assinie-passe.jpg",
    badge: "Écotourisme"
  },
  {
    id: "randonnee-quad",
    title: "Randonnée Quad sur les Pistes & Plages",
    subtitle: "Aventure tout-terrain",
    description: "Partez en raid guidé à travers les pistes sablonneuses bordées de cocotiers et les plages désertes d'Assinie-Mafia. Une expérience exaltante pour découvrir la région sous un autre angle.",
    duration: "1h30 de circuit",
    price: "35 000 FCFA / quad",
    image: "assets/images/quad-plage-assinie.jpg",
    badge: "Aventure"
  },
  {
    id: "parc-dipi",
    title: "Visite du Parc Zoologique Dipi",
    subtitle: "Rencontre avec la faune locale",
    description: "Idéal pour les enfants et les passionnés de nature : visitez le sanctuaire Dipi à Assinie, célèbre pour ses crocodiles géants, singes, serpents et tortues géantes dans un cadre verdoyant ombragé.",
    duration: "1h30 de visite",
    price: "Entrée 5 000 FCFA / personne",
    image: "assets/images/crocodiles-parc-dipi.jpg",
    badge: "En Famille"
  },
  {
    id: "chef-prive",
    title: "Chef Cuisinier Privé & Restauration Lagune",
    subtitle: "Gastronomie & Saveurs locales",
    description: "Dégustez à la villa des carpes et mérous braisés au feu de bois, langoustes fraîches d'Assinie grillées au beurre persillé, attiéké huile rouge, alloco doré ou menus européens préparés par notre chef dédié.",
    duration: "Par journée ou week-end",
    price: "À partir de 25 000 FCFA / jour",
    image: "assets/images/activite-chef-prive-v2.png",
    badge: "Gourmand"
  }
];

// Avis & Témoignages Clients
const REVIEWS_DATA = [
  {
    author: "Marc & Diane K.",
    city: "Abidjan, Cocody",
    stay: "Séjour en famille à la Villa L'Oasis",
    rating: 5,
    date: "Il y a 2 semaines",
    comment: "Nous avons passé un week-end tout simplement magique ! La villa est encore plus belle en vrai que sur les photos de la page Facebook. Le ponton privé nous a permis d'embarquer directement en bateau pour La Passe. Le personnel était aux petits soins et la piscine était d'une propreté irréprochable. Nous reviendrons sans hésiter !",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
  },
  {
    author: "Christelle B.",
    city: "Abidjan, Plateau",
    stay: "Anniversaire au Domaine Éden",
    rating: 5,
    date: "Il y a 1 mois",
    comment: "J'ai fêté mes 30 ans avec 35 amis au Domaine Éden. Organisation parfaite via WhatsApp avec l'équipe de Détente et Loisirs. Le bar aquatique dans la piscine a fait l'unanimité. Merci pour le professionnalisme et la réactivité du service client !",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80"
  },
  {
    author: "Patrick & Sandra V.",
    city: "Expatriés français résidents en Côte d'Ivoire",
    stay: "Séjour à la Résidence Palm Beach",
    rating: 5,
    date: "Il y a 3 semaines",
    comment: "Le luxe d'être les pieds dans l'eau côté océan sans aucun vis-à-vis. Les enfants ont adoré la plage et la piscine privée, et le groupe électrogène a assuré une électricité sans coupure tout le week-end avec la clim au frais. Recommandé à 100%.",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
  }
];

// Questions Fréquentes (FAQ)
const FAQ_DATA = [
  {
    q: "Comment réserver une villa ou une résidence ?",
    a: "La réservation s'effectue très simplement : vous pouvez sélectionner la villa souhaitée sur ce site, calculer votre devis estimatif et cliquer sur le bouton WhatsApp (+225 07 67 69 63 18). Notre équipe vous confirme instantanément la disponibilité et vous envoie le récapitulatif pour bloquer vos dates."
  },
  {
    q: "Quels sont les modes de paiement acceptés ?",
    a: "Nous acceptons les paiements via Mobile Money (Orange Money, Wave, MTN Moov), les virements bancaires ainsi que les règlements en espèces au bureau d'accueil ou à la remise des clés (acompte obligatoire pour sécuriser les dates)."
  },
  {
    q: "Quels sont les horaires d'arrivée (Check-in) et de départ (Check-out) ?",
    a: "Le check-in régulier se fait à partir de 14h00 et le check-out s'effectue avant 12h00. Pour les forfaits 'Week-end VIP', vous profitez d'un départ tardif le dimanche jusqu'à 17h00 ou 18h00 selon les résidences."
  },
  {
    q: "Le personnel de maison et le gardiennage sont-ils inclus ?",
    a: "Oui, toutes nos villas comprennent un gardien de sécurité présent 24h/24 ainsi qu'un agent d'entretien ou gouvernante pour le ménage quotidien. Les services d'un chef cuisinier dédié ou d'un chauffeur privé sont disponibles sur simple demande."
  },
  {
    q: "Y a-t-il des coupures de courant ou d'eau à Assinie ?",
    a: "Toutes nos propriétés partenaires sont équipées de groupes électrogènes automatiques de secours et de réserves d'eau avec surpresseurs. Votre confort (climatisation, réfrigérateur, Wi-Fi) est garanti en permanence."
  },
  {
    q: "Peut-on organiser des fêtes, anniversaires ou mariages ?",
    a: "Absolument ! Certaines résidences comme 'Le Domaine Éden' sont spécifiquement conçues pour accueillir des réceptions et événements festifs jusqu'à 80 invités. Précisez simplement la nature de votre événement lors de votre demande WhatsApp pour un devis adapté."
  }
];

// Configuration Contact
const CONTACT_CONFIG = {
  phone: "+225 07 67 69 63 18",
  phoneRaw: "2250767696318",
  whatsappLink: "https://wa.me/2250767696318",
  facebookPage: "https://web.facebook.com/profile.php?id=100075922063365",
  facebookName: "Détente et loisirs à Assinie",
  location: "Assinie-Mafia / Assinie Comoé District, Côte d'Ivoire",
  officeHours: "7j/7 de 07h00 à 22h00"
};
