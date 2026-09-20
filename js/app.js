/**
 * Raccourci de traduction pour les libellés écrits par ce fichier.
 * Repli volontaire sur le français : une page servie sans js/i18n.js doit
 * rester parfaitement lisible plutôt que d'afficher des clés brutes.
 */
function T(cle) {
  if (typeof I18N === "undefined") return "";
  return I18N.t(cle);
}

/**
 * Texte d'une fiche (villa, terrain, activité) dans la langue affichée :
 * traductions saisies dans le studio, repli sur le français (I18N.fiche).
 */
function ficheTexte(item, champ) {
  if (typeof I18N !== "undefined" && typeof I18N.fiche === "function") return I18N.fiche(item, champ);
  return item ? item[champ] : "";
}

/*
 * Tarif affiché d'une activité, GÉNÉRÉ depuis le montant du devis (décision
 * du 13/09/2026) : il ne peut plus annoncer un autre prix que le simulateur.
 * Copie conforme de texteTarifActivite (db/fiches.js), vérifiée par
 * tests/fiches.test.js — toute modification doit être faite des deux côtés.
 */
const TEXTES_TARIF = {
  fr: { personne: "/ personne", jour: "/ jour", forfait: "", groupe: "les", surDemande: "Tarif sur demande" },
  en: { personne: "/ person", jour: "/ day", forfait: "", groupe: "for", surDemande: "Price on request" },
  es: { personne: "/ persona", jour: "/ día", forfait: "", groupe: "para", surDemande: "Precio a consultar" }
};

function formaterMontant(valeur) {
  return String(Math.round(Number(valeur) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function texteTarifActivite(activite, langue = "fr") {
  const item = activite && typeof activite === "object" ? activite : {};
  const mots = TEXTES_TARIF[langue] || TEXTES_TARIF.fr;
  const traduction = (langue !== "fr" && item.translations && item.translations[langue]) || {};
  const mention = champ => String(traduction[champ] || item[champ] || "").trim();
  const avant = mention("pricePrefix");
  const apres = mention("priceSuffix");
  const montant = Math.round(Number(item.priceAmount) || 0);
  if (montant <= 0) return mots.surDemande;
  const unite = ["forfait", "jour", "personne"].includes(item.priceUnit) ? item.priceUnit : "forfait";
  let texte = [avant, `${formaterMontant(montant)} FCFA`, mots[unite], apres].filter(Boolean).join(" ");
  const groupe = Math.round(Number(item.groupPriceAmount) || 0);
  const taille = Math.round(Number(item.groupSize) || 0);
  if (unite === "personne" && groupe > 0 && taille > 1) {
    texte += ` · ${formaterMontant(groupe)} FCFA ${mots.groupe} ${taille}`;
  }
  return texte;
}

/** Tarif d'une activité pour l'affichage ; fiche antérieure (sans mentions) : son texte. */
function tarifActivite(act) {
  if (!act) return "";
  if (act.pricePrefix === undefined && act.priceSuffix === undefined) return act.price || "";
  return texteTarifActivite(act, typeof I18N !== "undefined" ? I18N.langue() : "fr");
}

/**
 * Application Frontend - Détente & Loisirs à Assinie
 * Gestion dynamique du catalogue, des filtres, du modal et du simulateur WhatsApp
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Le mouvement ne doit pas attendre la réponse de l'API du catalogue.
  initBandeauParallaxe();
  await Promise.all([loadManagedContent(), loadImageManifest()]);
  upgradeStaticImages();
  initHeader();
  highlightActiveNavLink();

  // Anciens liens « ?cat=lagune » / « ?cat=ocean » : le lieu est désormais
  // le critère « Emplacement ». Réécrits avant toute lecture de l'adresse.
  normaliserAdresseRecherche();

  // Lire les paramètres d'URL (ex: residences.html?cat=lagune ou devis.html?villa=villa-oasis)
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("cat") || "all";
  const villaParam = urlParams.get("villa");
  const activityParam = urlParams.get("activity");

  // Onglets et menu « Type » : avant renderVillas, qui branche les onglets.
  rendreChoixCategories();
  rendreChoixLocalisations();
  renderVillas(catParam);
  renderTerrains();
  renderHomeTerrains();
  renderActivities();
  renderReviews();
  renderFAQ();
  window.dispatchEvent(new CustomEvent("dl:public-content-ready"));
  initSimulator(villaParam, activityParam);
  initModal();
  initTerrainModal();
  openTerrainFromHash();
  openVillaFromHash();
  focusActivityFromHash();
  initHeroSearch();
  initBookingBar();
  initMultiFieldSearch();
  initPlayButton();
  initScrollReveal();
  initAnimatedHeroWord();
  initAnimatedCounters();
  initAccessibleStaticInteractions();

  // Les cartes, fiches et listes sont ÉCRITES par ce fichier : elles ne portent
  // aucun attribut data-i18n et ne peuvent donc pas être traduites en place par
  // js/i18n.js. On les redessine à chaque changement de langue. Le simulateur
  // n'est volontairement pas recréé : le visiteur perdrait sa saisie en cours.
  document.addEventListener("dl:langue", () => {
    rendreChoixCategories();
    rendreChoixLocalisations();
    renderVillas(new URLSearchParams(window.location.search).get("cat") || "all");
    renderTerrains();
    renderHomeTerrains();
    renderActivities();
    renderReviews();
    renderFAQ();
  });
});

let modalLastFocusedElement = null;
let modalActiveVilla = null;
let modalActiveImageIndex = 0;

let terrainModalLastFocusedElement = null;
let terrainModalActiveItem = null;
let terrainModalActiveImageIndex = 0;

// Manifeste d'images optimisées produit par le designer (`data/image-manifest.json`).
// Absent = repli automatique sur un <img> simple : aucune image ne disparaît.
let DL_IMAGE_MANIFEST = null;

function escapeHTMLText(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHTMLText(value).replace(/`/g, "&#96;");
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
}

function stringListOr(value, fallback = []) {
  const list = Array.isArray(value) ? value : fallback;
  return list.filter(item => typeof item === "string" && item.trim()).map(item => item.trim());
}

function normalizeManagedVilla(item, fallback = {}) {
  const images = stringListOr(item?.images, fallback.images);
  return {
    ...fallback,
    ...item,
    id: String(item?.id || fallback.id || `villa-${Date.now()}`),
    visible: item?.visible !== false,
    featured: Boolean(item?.featured),
    capacity: numberOr(item?.capacity, fallback.capacity),
    bedrooms: numberOr(item?.bedrooms, fallback.bedrooms),
    bathrooms: numberOr(item?.bathrooms, fallback.bathrooms),
    pricePerNight: numberOr(item?.pricePerNight, fallback.pricePerNight),
    priceEuro: numberOr(item?.priceEuro, fallback.priceEuro),
    weekendPackage: numberOr(item?.weekendPackage, fallback.weekendPackage),
    rating: numberOr(item?.rating, fallback.rating || 5),
    reviewsCount: numberOr(item?.reviewsCount, fallback.reviewsCount),
    images: images.length ? images : ["assets/images/residence-villa-luxe.jpg"],
    features: stringListOr(item?.features, fallback.features),
    highlights: stringListOr(item?.highlights, fallback.highlights)
  };
}

function normalizeManagedActivity(item, fallback = {}) {
  const images = stringListOr(item?.images, fallback.images);
  const mainImage = String(item?.image || images[0] || fallback.image || "assets/images/plage-assinie-passe.jpg");
  const gallery = images.length ? images : [mainImage];
  if (!gallery.includes(mainImage)) gallery.unshift(mainImage);
  return {
    ...fallback,
    ...item,
    id: String(item?.id || fallback.id || `activity-${Date.now()}`),
    visible: item?.visible !== false,
    featured: Boolean(item?.featured),
    image: mainImage,
    images: gallery
  };
}

const TERRAIN_STATUS_LABELS = {
  disponible: "Disponible",
  reserve: "Réservé",
  vendu: "Vendu"
};

const TERRAIN_LAND_STATUS_LABELS = {
  "titre-foncier": "Titre foncier",
  "acd": "ACD (Arrêté de Concession Définitive)",
  "lettre-attribution": "Lettre d’attribution",
  "certificat-propriete": "Certificat de propriété"
};

function normalizeManagedTerrain(item, fallback = {}) {
  const images = stringListOr(item?.images, fallback.images);
  const areaSqm = numberOr(item?.areaSqm, fallback.areaSqm);
  const priceTotal = numberOr(item?.priceTotal, fallback.priceTotal);
  const landStatus = String(item?.landStatus || fallback.landStatus || "titre-foncier");
  const status = String(item?.status || fallback.status || "disponible").toLowerCase();
  return {
    ...fallback,
    ...item,
    id: String(item?.id || fallback.id || `terrain-${Date.now()}`),
    reference: String(item?.reference || fallback.reference || ""),
    title: String(item?.title || fallback.title || "Terrain à Assinie"),
    location: String(item?.location || fallback.location || "Assinie"),
    district: String(item?.district || fallback.district || ""),
    areaSqm,
    priceTotal,
    // Recalcul local uniquement si le serveur n'a rien renvoyé (mode statique).
    pricePerSqm: numberOr(item?.pricePerSqm, fallback.pricePerSqm) || (areaSqm ? Math.round(priceTotal / areaSqm) : 0),
    priceEuro: numberOr(item?.priceEuro, fallback.priceEuro) || Math.round(priceTotal / 655.957),
    landStatus,
    landStatusLabel: String(item?.landStatusLabel || fallback.landStatusLabel || TERRAIN_LAND_STATUS_LABELS[landStatus] || "Statut foncier à préciser"),
    utilities: stringListOr(item?.utilities, fallback.utilities),
    status: TERRAIN_STATUS_LABELS[status] ? status : "disponible",
    visible: item?.visible !== false,
    featured: Boolean(item?.featured),
    images: images.length ? images : ["assets/images/plage-assinie-passe.jpg"],
    highlights: stringListOr(item?.highlights, fallback.highlights)
  };
}

/**
 * Charge le manifeste d'images optimisées. Toute erreur (fichier absent,
 * ouverture en file://) laisse `DL_IMAGE_MANIFEST` à null : le site continue
 * de servir les JPG/PNG d'origine.
 */
async function loadImageManifest() {
  try {
    const response = await fetch("data/image-manifest.json", { cache: "no-cache" });
    if (!response.ok) return;
    const manifest = await response.json();
    if (manifest && typeof manifest === "object") DL_IMAGE_MANIFEST = manifest;
  } catch {
    // Repli silencieux sur les images d'origine.
  }
}

function imageManifestEntry(source) {
  if (!DL_IMAGE_MANIFEST || typeof source !== "string") return null;
  const clean = source.split("?")[0].replace(/^\.?\//, "");
  return DL_IMAGE_MANIFEST[clean] || DL_IMAGE_MANIFEST[source] || null;
}

/**
 * Construit un <picture> WebP + repli d'origine à partir du manifeste.
 * Sans entrée de manifeste, retourne un <img> simple : l'image reste affichée.
 */
/**
 * Construit un srcset à partir des variantes WebP du manifeste.
 *
 * Les clés de `webp` sont les largeurs RÉELLES des fichiers. Auparavant on
 * écrivait en dur « 480, 960, 1600 » : une variante « 1600 » produite à partir
 * d'une source de 1376 px ne faisait que 1376 px, mais le srcset annonçait
 * 1600w. Le navigateur la retenait pour un emplacement large puis l'agrandissait,
 * ce qui rendait les photos floues. On déclare donc la largeur constatée.
 */
function srcsetDepuisManifeste(webp) {
  if (!webp) return "";
  return Object.keys(webp)
    .filter(largeur => typeof webp[largeur] === "string" && webp[largeur])
    .map(Number)
    .filter(largeur => Number.isFinite(largeur) && largeur > 0)
    .sort((a, b) => a - b)
    .map(largeur => `${webp[String(largeur)]} ${largeur}w`)
    .join(", ");
}

function responsiveImageHTML(source, options = {}) {
  const {
    alt = "",
    className = "",
    sizes = "100vw",
    loading = "lazy",
    decoding = "async",
    fetchpriority = "",
    width = 0,
    height = 0
  } = options;

  const entry = imageManifestEntry(source);
  const finalWidth = width || numberOr(entry?.width, 0);
  const finalHeight = height || numberOr(entry?.height, 0);

  const imgAttributes = [
    `src="${escapeAttribute(source)}"`,
    `alt="${escapeAttribute(alt)}"`,
    className ? `class="${escapeAttribute(className)}"` : "",
    finalWidth && finalHeight ? `width="${finalWidth}" height="${finalHeight}"` : "",
    loading ? `loading="${escapeAttribute(loading)}"` : "",
    decoding ? `decoding="${escapeAttribute(decoding)}"` : "",
    fetchpriority ? `fetchpriority="${escapeAttribute(fetchpriority)}"` : ""
  ].filter(Boolean).join(" ");

  const img = `<img ${imgAttributes}>`;
  const webp = entry?.webp;
  if (!webp) return img;

  const srcset = escapeAttribute(srcsetDepuisManifeste(webp));
  if (!srcset) return img;

  // `display:contents` retire <picture> de l'arbre de rendu : l'<img> conserve
  // exactement la géométrie qu'il avait sans wrapper (hauteurs en % des cartes).
  return `<picture style="display:contents"><source type="image/webp" srcset="${srcset}" sizes="${escapeAttribute(sizes)}">${img}</picture>`;
}

window.responsiveImageHTML = responsiveImageHTML;

/**
 * Enveloppe les <img data-dl-optimize> codées en dur dans un <picture> WebP.
 * Fait uniquement lorsque le manifeste confirme l'existence des fichiers :
 * un <source> vers un WebP absent renverrait un 404 sans repli possible.
 */
function upgradeStaticImages() {
  if (!DL_IMAGE_MANIFEST) return;
  document.querySelectorAll("img[data-dl-optimize]").forEach(img => {
    if (img.parentElement?.tagName === "PICTURE") return;
    const entry = imageManifestEntry(img.getAttribute("src"));
    const webp = entry?.webp;
    if (!webp) return;

    const srcset = srcsetDepuisManifeste(webp);
    if (!srcset) return;

    if (!img.getAttribute("width") && entry.width) img.setAttribute("width", entry.width);
    if (!img.getAttribute("height") && entry.height) img.setAttribute("height", entry.height);

    const picture = document.createElement("picture");
    // Retire <picture> de l'arbre de rendu : l'<img> garde sa géométrie CSS.
    picture.style.display = "contents";
    const source = document.createElement("source");
    source.type = "image/webp";
    source.srcset = srcset;
    source.sizes = img.dataset.dlSizes || "100vw";
    img.replaceWith(picture);
    picture.append(source, img);
  });
}

async function loadManagedContent() {
  try {
    const response = await fetch('/api/content', { cache: 'no-store' });
    if (!response.ok) return;
    const managed = await response.json();
    if (Array.isArray(managed.villas)) {
      const originals = new Map(VILLAS_DATA.map(item => [item.id, item]));
      const villas = managed.villas
        .map(item => normalizeManagedVilla(item, originals.get(item?.id)))
        .filter(item => item.visible !== false);
      VILLAS_DATA.splice(0, VILLAS_DATA.length, ...villas);
      managed.villas = villas;
    }
    if (Array.isArray(managed.terrains)) {
      const originals = new Map(TERRAINS_DATA.map(item => [item.id, item]));
      const terrains = managed.terrains
        .map(item => normalizeManagedTerrain(item, originals.get(item?.id)))
        .filter(item => item.visible !== false);
      TERRAINS_DATA.splice(0, TERRAINS_DATA.length, ...terrains);
      managed.terrains = terrains;
    }
    if (Array.isArray(managed.activities)) {
      const originals = new Map(ACTIVITIES_DATA.map(item => [item.id, item]));
      const activities = managed.activities
        .map(item => normalizeManagedActivity(item, originals.get(item?.id)))
        .filter(item => item.visible !== false);
      ACTIVITIES_DATA.splice(0, ACTIVITIES_DATA.length, ...activities);
      managed.activities = activities;
    }
    if (Array.isArray(managed.reviews) && managed.reviews.length) {
      REVIEWS_DATA.splice(0, REVIEWS_DATA.length, ...managed.reviews);
    }
    if (Array.isArray(managed.faq) && managed.faq.length) {
      FAQ_DATA.splice(0, FAQ_DATA.length, ...managed.faq);
    }
    window.DL_MANAGED_CONTENT = managed;
  } catch {
    // Le site reste entièrement fonctionnel en mode statique.
  }
}

function initBookingBar() {
  const checkin = document.getElementById("bookBarCheckin");
  const checkout = document.getElementById("bookBarCheckout");
  const villaSel = document.getElementById("bookBarVilla");
  const submitBtn = document.getElementById("bookBarSubmitBtn");

  if (!submitBtn) return;

  if (villaSel && typeof VILLAS_DATA !== "undefined") {
    villaSel.innerHTML = `<option value="all">${T("js.toutesVillas")}</option>` + 
      VILLAS_DATA.map(v => `<option value="${v.id}">${v.name}</option>`).join("");
  }

  const today = new Date();
  const nextFriday = new Date();
  nextFriday.setDate(today.getDate() + ((7 - today.getDay() + 5) % 7 || 7));
  const nextSunday = new Date(nextFriday);
  nextSunday.setDate(nextFriday.getDate() + 2);

  if (checkin) {
    checkin.value = nextFriday.toISOString().split("T")[0];
    checkin.min = today.toISOString().split("T")[0];
  }
  if (checkout) {
    checkout.value = nextSunday.toISOString().split("T")[0];
    checkout.min = nextFriday.toISOString().split("T")[0];
  }

  checkin?.addEventListener("change", () => {
    if (!checkout || !checkin.value) return;
    checkout.min = checkin.value;
    if (!checkout.value || checkout.value <= checkin.value) {
      const nextDay = new Date(`${checkin.value}T12:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      checkout.value = nextDay.toISOString().split("T")[0];
    }
  });

  submitBtn.addEventListener("click", () => {
    const vId = villaSel ? villaSel.value : "all";
    if (vId && vId !== "all") {
      window.location.href = `devis.html?villa=${encodeURIComponent(vId)}`;
    } else {
      window.location.href = `residences.html`;
    }
  });
}

// Détection et surlignage de la page active dans le menu
function highlightActiveNavLink() {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "" && href === "index.html") || (currentPath === "index.html" && href === "index.html")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

// Formatage des montants en FCFA
function formatFCFA(amount) {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

function formatEUR(amount) {
  return "~ " + new Intl.NumberFormat("fr-FR").format(Math.round(amount)) + " €";
}

/* ==========================================================================
   1. Header & Navigation Mobile
   ========================================================================== */
function initHeader() {
  const header = document.querySelector(".site-header");
  const mobileToggle = document.querySelector(".mobile-menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });

  if (mobileToggle && navLinks) {
    mobileToggle.setAttribute("aria-expanded", "false");
    mobileToggle.setAttribute("aria-controls", "siteNavigation");
    navLinks.id ||= "siteNavigation";

    const isMobileNav = () => window.matchMedia("(max-width: 768px)").matches;

    // Le tiroir fermé ne doit être ni focusable ni exposé aux lecteurs d'écran.
    // En navigation bureau, `inert` est systématiquement retiré.
    const syncNavInertness = () => {
      if (isMobileNav() && !navLinks.classList.contains("is-open")) {
        navLinks.setAttribute("inert", "");
      } else {
        navLinks.removeAttribute("inert");
      }
    };

    const menuFocusables = () => [...navLinks.querySelectorAll('a[href], button:not([disabled])')]
      .filter(element => element.offsetParent !== null);

    const setMenu = (open, restoreFocus = false) => {
      navLinks.classList.toggle("is-open", open);
      mobileToggle.setAttribute("aria-expanded", String(open));
      mobileToggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      syncNavInertness();
      if (open) {
        window.setTimeout(() => menuFocusables()[0]?.focus(), 30);
      } else if (restoreFocus) {
        mobileToggle.focus();
      }
    };

    const closeMenu = (restoreFocus = false) => setMenu(false, restoreFocus);

    mobileToggle.addEventListener("click", () => {
      setMenu(!navLinks.classList.contains("is-open"));
    });

    // Fermer le menu lors du clic sur un lien
    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        if (isMobileNav()) closeMenu();
      });
    });

    // Échap ferme le tiroir ; Tab reste piégé à l'intérieur tant qu'il est ouvert.
    document.addEventListener("keydown", event => {
      if (!navLinks.classList.contains("is-open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [mobileToggle, ...menuFocusables()];
      if (focusables.length < 2) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (!isMobileNav()) closeMenu();
      else syncNavInertness();
    });

    syncNavInertness();
  }
}

/* ==========================================================================
   2. Catalogue & Filtrage des Villas
   ========================================================================== */
function renderVillas(category = "all") {
  const grid = document.getElementById("villasGrid");
  const featuredGrid = document.getElementById("featuredVillasGrid");

  // Cinq villas vedettes sur la page d'accueil : la grille compte cinq
  // colonnes en desktop depuis le 12/09/2026, quatre cartes y laissaient une
  // case vide à droite.
  if (featuredGrid) {
    const featured = VILLAS_DATA.filter(v => v.featured).concat(VILLAS_DATA.filter(v => !v.featured)).slice(0, 5);
    featuredGrid.innerHTML = featured.map(villa => createVillaCardHTML(villa)).join("");
    bindModalButtons();
    window.dispatchEvent(new CustomEvent("dl:cards-rendered"));
  }

  // Rendu du catalogue complet sur la page résidences
  if (!grid) return;

  const criteres = { ...lireCriteresRecherche(), cat: category };
  const filtered = VILLAS_DATA.filter(villa => correspondRecherche(villa, criteres, cadreVilla));

  grid.innerHTML = filtered.length
    ? filtered.map(villa => createVillaCardHTML(villa)).join("")
    : `<div role="status" style="grid-column:1/-1;padding:3rem;text-align:center;background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md)"><h3 style="color:var(--color-forest);margin-bottom:.5rem">Aucune résidence ne correspond exactement à ces critères.</h3><p>Essayez une autre catégorie ou <a href="residences.html" style="color:var(--color-gold-hover);font-weight:800">affichez toutes les résidences</a>.</p></div>`;
  bindModalButtons();
  window.dispatchEvent(new CustomEvent("dl:cards-rendered"));

  // Activer visuellement l'onglet correspondant
  // Depuis que le catalogue réunit résidences ET terrains sur la même page,
  // les deux familles d onglets cohabitent. On ne vise donc que les onglets de
  // catégorie : sans ce filtre, un clic sur un statut foncier rappellerait
  // renderVillas avec data-category = null et viderait la grille des villas.
  // Onglets « Bord de lagune / d'océan » : ils reflètent l'Emplacement choisi.
  const ongletActif = category !== "all" ? category
    : (CATEGORIES_LIEU.includes(criteres.location) ? criteres.location : "all");
  document.querySelectorAll(".filter-btn[data-category]").forEach(tab => {
    if (tab.getAttribute("data-category") === ongletActif) {
      tab.classList.add("active");
      tab.setAttribute("aria-pressed", "true");
    } else {
      tab.classList.remove("active");
      tab.setAttribute("aria-pressed", "false");
    }
  });

  // Gestion des clics sur onglets
  document.querySelectorAll(".filter-btn[data-category]").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".filter-btn[data-category]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const cat = tab.getAttribute("data-category");
      // Pendant une recherche multicritère, l'onglet EST le critère « Type » :
      // on l'inscrit dans l'adresse pour que les publications, le résumé des
      // critères et un rechargement de page suivent le même choix que les
      // villas. Hors recherche, l'onglet ne filtre que les villas, comme avant.
      // Barre présente sur la page : l'onglet et les menus sont le même choix,
      // ils doivent toujours afficher la même valeur. Onglet de lieu → menu
      // « Emplacement » ; piscine ou thème → menu « Type ». Un seul onglet est
      // actif à la fois : l'autre menu revient à « Tous ».
      const menuType = barreDeRecherchePresente() ? document.getElementById("searchType") : null;
      const menuLieu = barreDeRecherchePresente() ? document.getElementById("searchLocation") : null;
      if (menuType && menuLieu) {
        const estLieu = CATEGORIES_LIEU.includes(cat);
        menuLieu.value = estLieu ? cat : "all";
        menuType.value = !estLieu && [...menuType.options].some(option => option.value === cat) ? cat : "all";
        menuType.dispatchEvent(new Event("change"));
        return;
      }
      if (rechercheMulticritereActive()) {
        const params = new URLSearchParams(window.location.search);
        params.set("cat", cat);
        history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
      renderVillas(cat);
    };
  });
  initScrollReveal();
}

function bindModalButtons() {
  document.querySelectorAll(".btn-open-modal").forEach(btn => {
    btn.onclick = (e) => {
      const villaId = e.currentTarget.getAttribute("data-id");
      openVillaModal(villaId);
    };
  });
  bindFavoriteButtons();
}

function favoriteIds() {
  try { return JSON.parse(localStorage.getItem("dl-assinie-favorites") || "[]"); } catch { return []; }
}

function bindFavoriteButtons() {
  const favorites = favoriteIds();
  document.querySelectorAll(".btn-favorite-heart[data-favorite-id]").forEach(button => {
    const id = button.dataset.favoriteId;
    const selected = favorites.includes(id);
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.title = selected ? "Retirer des favoris" : "Ajouter aux favoris";
    button.onclick = event => {
      event.stopPropagation();
      const next = favoriteIds();
      const index = next.indexOf(id);
      if (index >= 0) next.splice(index, 1); else next.push(id);
      localStorage.setItem("dl-assinie-favorites", JSON.stringify(next));
      bindFavoriteButtons();
      window.dispatchEvent(new CustomEvent("dl:toast", { detail: index >= 0 ? "Retiré des favoris" : "Ajouté aux favoris" }));
    };
  });
}

function createVillaCardHTML(villa) {
  const badgeClass = villa.featured ? "badge-tag-rent" : "badge-tag-sale";
  // Badge puis statut, dans la langue affichée (référentiels) ; le statut
  // n'apparaît plus sous son code brut (« sur-demande »).
  const badgeText = libelleReferentiel("badges", villa.badgeId, villa.badge)
    || libelleReferentiel("statuts", `villa:${villa.status}`, villa.status)
    || (villa.featured ? "Coup de Cœur" : "Disponible");

  return `
    <article class="property-card" data-id="${escapeAttribute(villa.id)}">
      <div class="property-img-wrapper">
        ${responsiveImageHTML(villa.images[0], {
          alt: villa.name,
          className: "property-img",
          sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
        })}
        <span class="${badgeClass}">${escapeHTMLText(badgeText)}</span>
        <button type="button" class="btn-favorite-heart" data-favorite-id="${escapeAttribute(villa.id)}" title="Ajouter aux favoris" aria-label="Ajouter ${escapeAttribute(villa.name)} aux favoris" aria-pressed="false">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
      </div>
      <div class="property-card-body">
        <div class="property-card-title-row">
          <h3 class="property-card-title">${escapeHTMLText(villa.name)}</h3>
        </div>
        <div class="property-location">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>${escapeHTMLText(villa.location)}</span>
        </div>
        <div class="property-amenities-row">
          <span class="amenity-pill" title="Chambres">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>
            ${villa.bedrooms} Ch.
          </span>
          <span class="amenity-pill" title="Salles d'eau">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.67 3 4 3.67 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4.5c0-.83-.67-1.5-1.5-1.5-.4 0-.77.16-1.04.44L15 6"/></svg>
            ${villa.bathrooms} Bains
          </span>
          <span class="amenity-pill" title="Capacité">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            ${villa.capacity} pers.
          </span>
        </div>
        <div class="property-card-footer">
          <div class="property-price-block">
            <span class="property-price">${formatFCFA(villa.pricePerNight)}</span>
            <span class="property-period">${T("js.parNuitee")}</span>
          </div>
          <button type="button" class="btn-property-detail btn-open-modal" data-id="${escapeAttribute(villa.id)}" aria-label="Voir les détails de ${escapeAttribute(villa.name)}">
            ${T("js.details")}
          </button>
        </div>
      </div>
    </article>
  `;
}


/* ==========================================================================
   2 bis. Vente de Terrains à Assinie
   ========================================================================== */
const TERRAIN_UTILITY_META = {
  "eau": { label: "Eau courante", path: '<path d="M12 2.7s6 6.4 6 10.3a6 6 0 0 1-12 0C6 9.1 12 2.7 12 2.7z"></path>' },
  "electricite": { label: "Électricité", path: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>' },
  "voie-bitumee": { label: "Voie bitumée", path: '<path d="M5 22 8 2M19 22 16 2M12 4v3M12 11v3M12 18v3"></path>' },
  "assainissement": { label: "Assainissement", path: '<circle cx="12" cy="12" r="9"></circle><path d="M4.2 9h15.6M4.2 15h15.6M12 3.2v17.6"></path>' },
  "cloture": { label: "Clôturé", path: '<path d="M3 9h18M3 15h18M7.5 4v16M16.5 4v16"></path>' },
  "borne": { label: "Bornage réalisé", path: '<path d="M6 3v18M6 3h11l-2.6 3.5L17 10H6"></path>' }
};

function formatSqm(value) {
  return `${new Intl.NumberFormat("fr-FR").format(numberOr(value, 0))} m²`;
}

function terrainStatusLabel(terrain) {
  const repli = TERRAIN_STATUS_LABELS[terrain.status] || TERRAIN_STATUS_LABELS.disponible;
  return libelleReferentiel("statuts", `terrain:${terrain.status}`, repli);
}

/**
 * Terrains montrés aux visiteurs. Un terrain VENDU n'est plus une annonce
 * (demande du 13/09/2026) : il disparaît de la liste, de l'accueil, de la
 * fiche détaillée et des liens directs. Filtré ici, côté site, et non dans
 * l'API : le studio lit la même API, et un terrain qu'il ne recevrait plus
 * serait effacé de la base à la publication suivante.
 */
function visibleTerrains() {
  if (typeof TERRAINS_DATA === "undefined") return [];
  return TERRAINS_DATA.filter(terrain => terrain.visible !== false && terrain.status !== "vendu");
}

function terrainWhatsAppLink(terrain) {
  const message = `Bonjour Henri & Philippe - Détente & Loisirs ! Je suis intéressé(e) par le terrain ${terrain.reference || terrain.id} — ${terrain.title} (${terrain.location}), ${formatSqm(terrain.areaSqm)} au prix de ${formatFCFA(terrain.priceTotal)}. Pouvez-vous me communiquer les documents fonciers et organiser une visite ?`;
  return `https://wa.me/2250767696318?text=${encodeURIComponent(message)}`;
}

function terrainUtilitiesHTML(terrain) {
  const items = (terrain.utilities || [])
    .filter(key => TERRAIN_UTILITY_META[key])
    .map(key => {
      const meta = TERRAIN_UTILITY_META[key];
      return `<li class="terrain-utility" title="${escapeAttribute(meta.label)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${meta.path}</svg>
        <span>${escapeHTMLText(meta.label)}</span>
      </li>`;
    });
  if (!items.length) return `<p class="terrain-utilities-empty">Viabilisation à confirmer auprès de la conciergerie.</p>`;
  return `<ul class="terrain-utilities" aria-label="Viabilisation de la parcelle">${items.join("")}</ul>`;
}

function createTerrainCardHTML(terrain) {
  const sold = terrain.status === "vendu";
  const statusLabel = terrainStatusLabel(terrain);
  const actions = sold
    ? `<button type="button" class="btn-terrain-detail btn-open-terrain" data-id="${escapeAttribute(terrain.id)}" aria-label="Voir les détails du terrain ${escapeAttribute(terrain.reference || terrain.title)}">${T("js.details")}</button>
       <span class="terrain-sold-note">${T("js.vendu")}</span>`
    : `<button type="button" class="btn-terrain-detail btn-open-terrain" data-id="${escapeAttribute(terrain.id)}" aria-label="Voir les détails du terrain ${escapeAttribute(terrain.reference || terrain.title)}">${T("js.details")}</button>
       <a class="btn-terrain-wa" href="${escapeAttribute(terrainWhatsAppLink(terrain))}" target="_blank" rel="noopener noreferrer" aria-label="Contacter sur WhatsApp au sujet du terrain ${escapeAttribute(terrain.reference || terrain.title)}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"></path></svg>
         <span>${T("js.contacterWhatsapp")}</span>
       </a>`;

  return `
    <article class="terrain-card${sold ? " is-sold" : ""}" data-id="${escapeAttribute(terrain.id)}" data-status="${escapeAttribute(terrain.status)}" data-land-status="${escapeAttribute(terrain.landStatus)}">
      <div class="terrain-card-media">
        ${responsiveImageHTML(terrain.images[0], {
          alt: `${ficheTexte(terrain, "title")} — ${terrain.location}`,
          className: "terrain-card-img",
          sizes: "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        })}
        <span class="terrain-status-badge is-${escapeAttribute(terrain.status)}">${escapeHTMLText(statusLabel)}</span>
        ${terrain.reference ? `<span class="terrain-reference">${escapeHTMLText(terrain.reference)}</span>` : ""}
      </div>
      <div class="terrain-card-body">
        <p class="terrain-land-status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 11 11.5 13.5 15.5 9"></polyline></svg>
          <span><small>${T("js.statutFoncier")}</small>${escapeHTMLText(terrain.landStatusLabel)}</span>
        </p>
        <h3 class="terrain-card-title">${escapeHTMLText(ficheTexte(terrain, "title"))}</h3>
        <p class="terrain-card-location">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>${escapeHTMLText(terrain.location)}</span>
        </p>
        <dl class="terrain-figures">
          <div><dt>${T("js.superficie")}</dt><dd>${escapeHTMLText(formatSqm(terrain.areaSqm))}</dd></div>
          <div><dt>${T("js.prixM2")}</dt><dd>${escapeHTMLText(formatFCFA(terrain.pricePerSqm))}</dd></div>
        </dl>
        ${terrainUtilitiesHTML(terrain)}
        <div class="terrain-price-block">
          <span class="terrain-price">${escapeHTMLText(formatFCFA(terrain.priceTotal))}</span>
          <span class="terrain-price-euro">${escapeHTMLText(formatEUR(terrain.priceEuro))}</span>
        </div>
        <div class="terrain-actions">${actions}</div>
      </div>
    </article>
  `;
}

function bindTerrainButtons() {
  document.querySelectorAll(".btn-open-terrain").forEach(button => {
    button.onclick = event => openTerrainModal(event.currentTarget.getAttribute("data-id"));
  });
}

function renderTerrains(landStatusFilter) {
  const grid = document.getElementById("terrainsGrid");
  if (!grid) return;

  const buttons = [...document.querySelectorAll(".filter-btn[data-land-status]")];
  const activeButton = buttons.find(button => button.classList.contains("active"));
  const params = new URLSearchParams(window.location.search);
  const landStatus = landStatusFilter
    || activeButton?.dataset.landStatus
    || params.get("foncier")
    || "all";

  const villeSelect = document.getElementById("terrainVilleFilter");
  const areaSelect = document.getElementById("terrainAreaFilter");
  const statusSelect = document.getElementById("terrainStatusFilter");
  const villeFilter = villeSelect?.value || "all";
  const areaFilter = areaSelect?.value || "all";
  const statusFilter = statusSelect?.value || "all";

  const filtered = visibleTerrains().filter(terrain => {
    const matchesLand = landStatus === "all" || terrain.landStatus === landStatus;
    const area = numberOr(terrain.areaSqm, 0);
    const matchesArea = areaFilter === "all"
      || (areaFilter === "small" && area < 800)
      || (areaFilter === "medium" && area >= 800 && area < 1500)
      || (areaFilter === "large" && area >= 1500);
    const matchesStatus = statusFilter === "all" || terrain.status === statusFilter;
    const matchesVille = villeFilter === "all" || terrain.localisationId === villeFilter;
    return matchesLand && matchesVille && matchesArea && matchesStatus;
  });

  grid.innerHTML = filtered.length
    ? filtered.map(terrain => createTerrainCardHTML(terrain)).join("")
    : `<div class="terrains-empty" role="status">
         <h3>Aucun terrain ne correspond à ces critères.</h3>
         <p>Élargissez la localisation ou la superficie, ou <button type="button" class="terrains-reset-link" id="terrainsResetBtn">affichez tous les terrains</button>.</p>
       </div>`;

  // Même signal que renderVillas. Son absence laissait le catalogue unifié
  // afficher un compteur figé — « 4 terrains » alors que le filtre n'en
  // montrait que deux — car rien ne l'avertissait du nouveau rendu.
  window.dispatchEvent(new CustomEvent("dl:cards-rendered"));

  const countEl = document.getElementById("terrainsCount");
  if (countEl) {
    countEl.textContent = filtered.length
      ? `${filtered.length} terrain${filtered.length > 1 ? "s" : ""} affiché${filtered.length > 1 ? "s" : ""} sur ${visibleTerrains().length}`
      : `Aucun terrain affiché sur ${visibleTerrains().length}`;
  }

  buttons.forEach(button => {
    const selected = button.dataset.landStatus === landStatus;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.onclick = () => renderTerrains(button.dataset.landStatus);
  });

  if (villeSelect && !villeSelect.dataset.bound) {
    villeSelect.dataset.bound = "1";
    villeSelect.addEventListener("change", () => renderTerrains());
  }
  if (areaSelect && !areaSelect.dataset.bound) {
    areaSelect.dataset.bound = "1";
    areaSelect.addEventListener("change", () => renderTerrains());
  }
  if (statusSelect && !statusSelect.dataset.bound) {
    statusSelect.dataset.bound = "1";
    statusSelect.addEventListener("change", () => renderTerrains());
  }

  document.getElementById("terrainsResetBtn")?.addEventListener("click", () => {
    if (villeSelect) villeSelect.value = "all";
    if (areaSelect) areaSelect.value = "all";
    if (statusSelect) statusSelect.value = "all";
    renderTerrains("all");
  });

  bindTerrainButtons();
  injectTerrainsJsonLd();
  initScrollReveal();
}

/**
 * Données structurées cohérentes avec les annonces réellement publiées.
 * Régénérées à chaque rendu pour rester alignées sur `GET /api/content`.
 */
function injectTerrainsJsonLd() {
  const terrains = visibleTerrains();
  if (!terrains.length) return;
  const existing = document.getElementById("terrainsItemListJsonLd");
  if (existing) existing.remove();

  const payload = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Terrains à vendre à Assinie",
    numberOfItems: terrains.length,
    itemListElement: terrains.map((terrain, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: terrain.title,
        sku: terrain.reference || terrain.id,
        description: terrain.description,
        image: terrain.images[0],
        category: "Terrain à vendre",
        additionalProperty: [
          { "@type": "PropertyValue", name: "Superficie", value: `${terrain.areaSqm} m²` },
          { "@type": "PropertyValue", name: "Statut foncier", value: terrain.landStatusLabel },
          { "@type": "PropertyValue", name: "Prix au m²", value: `${terrain.pricePerSqm} XOF` }
        ],
        offers: {
          "@type": "Offer",
          price: terrain.priceTotal,
          priceCurrency: "XOF",
          availability: terrain.status === "vendu"
            ? "https://schema.org/SoldOut"
            : terrain.status === "reserve"
              ? "https://schema.org/LimitedAvailability"
              : "https://schema.org/InStock",
          areaServed: terrain.location
        }
      }
    }))
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "terrainsItemListJsonLd";
  script.textContent = JSON.stringify(payload);
  document.head.appendChild(script);
}

function renderHomeTerrains() {
  const grid = document.getElementById("homeTerrainsGrid");
  if (!grid) return;
  const featured = visibleTerrains().filter(terrain => terrain.featured).slice(0, 3);
  const section = document.getElementById("homeTerrains");

  if (!featured.length) {
    // Aucune annonce en vedette : la section entière disparaît proprement.
    if (section) {
      section.hidden = true;
      section.style.display = "none";
    }
    grid.innerHTML = "";
    return;
  }

  if (section) {
    section.hidden = false;
    section.style.display = "";
  }
  grid.innerHTML = featured.map(terrain => createTerrainCardHTML(terrain)).join("");
  bindTerrainButtons();
  initScrollReveal();
}

/* Modale de détail d'un terrain — même mécanique que la modale villa. */
function ensureTerrainModalStructure() {
  const modal = document.getElementById("terrainModal");
  const container = document.getElementById("terrainModalContainer");
  if (!modal || !container) return null;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("aria-labelledby", "terrainModalTitle");
  if (!document.getElementById("terrainModalCloseBtn")) {
    container.innerHTML = `
      <button type="button" class="modal-close-btn" id="terrainModalCloseBtn" aria-label="Fermer la fiche du terrain">×</button>
      <div class="modal-content-grid">
        <div class="modal-gallery">
          <div class="modal-main-media">
            <img id="terrainModalMainImg" class="modal-main-img" src="" alt="">
            <div class="modal-gallery-nav" aria-label="Navigation dans la galerie">
              <button type="button" id="terrainModalPrevBtn" aria-label="Photo précédente">←</button>
              <button type="button" id="terrainModalNextBtn" aria-label="Photo suivante">→</button>
            </div>
          </div>
          <div class="modal-thumbs" id="terrainModalThumbs" aria-label="Miniatures du terrain"></div>
        </div>
        <div class="modal-details">
          <span class="modal-eyebrow">${T("js.terrainAVendre")}</span>
          <h2 id="terrainModalTitle"></h2>
          <p id="terrainModalReference" class="modal-tagline"></p>
          <p id="terrainModalLocation" class="modal-location"></p>
          <div id="terrainModalSpecs" class="modal-specs"></div>
          <p id="terrainModalDesc" class="modal-description"></p>
          <h3 class="modal-section-title">${T("js.atoutsParcelle")}</h3>
          <div id="terrainModalHighlights" class="modal-features-grid"></div>
          <h3 class="modal-section-title">${T("js.caracteristiques")}</h3>
          <table class="terrain-spec-table" id="terrainModalTable">
            <caption class="sr-only-caption">${T("js.caracteristiquesTerrain")}</caption>
            <tbody></tbody>
          </table>
          <div class="modal-price-row"><div><small>${T("js.prixVente")}</small><div id="terrainModalPrice"></div></div></div>
          <div class="modal-actions" id="terrainModalActions"></div>
        </div>
      </div>`;
  }
  return modal;
}

function initTerrainModal() {
  const modal = ensureTerrainModalStructure();
  if (!modal || modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  document.getElementById("terrainModalCloseBtn")?.addEventListener("click", closeTerrainModal);
  document.getElementById("terrainModalPrevBtn")?.addEventListener("click", () => showTerrainModalImage(terrainModalActiveImageIndex - 1));
  document.getElementById("terrainModalNextBtn")?.addEventListener("click", () => showTerrainModalImage(terrainModalActiveImageIndex + 1));

  modal.addEventListener("click", event => {
    if (event.target === modal) closeTerrainModal();
  });

  document.addEventListener("keydown", event => {
    if (!modal.classList.contains("active")) return;
    if (event.key === "Escape") closeTerrainModal();
    if (event.key === "ArrowLeft") showTerrainModalImage(terrainModalActiveImageIndex - 1);
    if (event.key === "ArrowRight") showTerrainModalImage(terrainModalActiveImageIndex + 1);
    if (event.key === "Tab") {
      const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

function closeTerrainModal() {
  const modal = document.getElementById("terrainModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (terrainModalLastFocusedElement instanceof HTMLElement) terrainModalLastFocusedElement.focus();
  terrainModalActiveItem = null;
}

function showTerrainModalImage(index) {
  if (!terrainModalActiveItem?.images?.length) return;
  const total = terrainModalActiveItem.images.length;
  terrainModalActiveImageIndex = (index + total) % total;
  const mainImg = document.getElementById("terrainModalMainImg");
  if (mainImg) {
    mainImg.src = terrainModalActiveItem.images[terrainModalActiveImageIndex];
    mainImg.alt = `${terrainModalActiveItem.title} — photo ${terrainModalActiveImageIndex + 1} sur ${total}`;
  }
  document.querySelectorAll("#terrainModalThumbs .modal-thumb").forEach((thumb, thumbIndex) => {
    thumb.classList.toggle("active", thumbIndex === terrainModalActiveImageIndex);
    thumb.setAttribute("aria-current", thumbIndex === terrainModalActiveImageIndex ? "true" : "false");
  });
}

function openTerrainModal(terrainId) {
  const terrain = visibleTerrains().find(item => item.id === terrainId);
  if (!terrain) return;

  const modal = ensureTerrainModalStructure();
  if (!modal) return;
  initTerrainModal();

  const mainImg = document.getElementById("terrainModalMainImg");
  const thumbs = document.getElementById("terrainModalThumbs");
  const title = document.getElementById("terrainModalTitle");
  const reference = document.getElementById("terrainModalReference");
  const location = document.getElementById("terrainModalLocation");
  const specs = document.getElementById("terrainModalSpecs");
  const desc = document.getElementById("terrainModalDesc");
  const highlights = document.getElementById("terrainModalHighlights");
  const table = document.querySelector("#terrainModalTable tbody");
  const price = document.getElementById("terrainModalPrice");
  const actions = document.getElementById("terrainModalActions");
  if (!mainImg || !thumbs || !title || !reference || !location || !specs || !desc || !highlights || !table || !price || !actions) return;

  terrainModalActiveItem = terrain;
  terrainModalActiveImageIndex = 0;
  terrainModalLastFocusedElement = document.activeElement;

  mainImg.src = terrain.images[0];
  mainImg.alt = `${terrain.title} — photo 1 sur ${terrain.images.length}`;
  mainImg.loading = "lazy";
  mainImg.decoding = "async";
  thumbs.innerHTML = terrain.images.map((image, index) => `
    <button type="button" class="modal-thumb ${index === 0 ? "active" : ""}" style="background-image:url('${escapeAttribute(image)}')" aria-label="Afficher la photo ${index + 1} du terrain ${escapeAttribute(terrain.title)}" aria-current="${index === 0}" data-index="${index}"></button>
  `).join("");
  thumbs.querySelectorAll(".modal-thumb").forEach(thumb => {
    thumb.addEventListener("click", () => showTerrainModalImage(Number(thumb.dataset.index)));
  });

  title.textContent = ficheTexte(terrain, "title");
  reference.textContent = [terrain.reference, terrain.district].filter(Boolean).join(" · ");
  location.textContent = terrain.location;
  desc.textContent = ficheTexte(terrain, "description") || "Description détaillée disponible auprès de notre conciergerie.";

  specs.innerHTML = [
    `<span class="spec-pill">${escapeHTMLText(formatSqm(terrain.areaSqm))}</span>`,
    `<span class="spec-pill">${escapeHTMLText(formatFCFA(terrain.pricePerSqm))} / m²</span>`,
    `<span class="spec-pill is-land-status">${escapeHTMLText(terrain.landStatusLabel)}</span>`,
    `<span class="spec-pill is-${escapeAttribute(terrain.status)}">${escapeHTMLText(terrainStatusLabel(terrain))}</span>`
  ].join("");

  highlights.innerHTML = (ficheTexte(terrain, "highlights") || []).map(item => `
    <div class="feature-check-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span>${escapeHTMLText(item)}</span>
    </div>
  `).join("") || `<p>${T("js.atoutsVisite")}</p>`;

  const utilityLabels = (terrain.utilities || [])
    .filter(key => TERRAIN_UTILITY_META[key])
    .map(key => TERRAIN_UTILITY_META[key].label);

  const rows = [
    ["Référence", terrain.reference || "—"],
    ["Superficie", formatSqm(terrain.areaSqm)],
    ["Prix total", `${formatFCFA(terrain.priceTotal)} (${formatEUR(terrain.priceEuro)})`],
    ["Prix au m²", formatFCFA(terrain.pricePerSqm)],
    ["Statut foncier", terrain.landStatusLabel],
    ["Quartier / lotissement", terrain.district || "—"],
    ["Disponibilité", terrainStatusLabel(terrain)],
    ["Viabilisation", utilityLabels.length ? utilityLabels.join(", ") : "À confirmer"]
  ];
  table.innerHTML = rows.map(([label, value]) => `<tr><th scope="row">${escapeHTMLText(label)}</th><td>${escapeHTMLText(value)}</td></tr>`).join("");

  price.innerHTML = `${escapeHTMLText(formatFCFA(terrain.priceTotal))} <span>${escapeHTMLText(formatEUR(terrain.priceEuro))} · ${escapeHTMLText(formatFCFA(terrain.pricePerSqm))} / m²</span>`;

  const gpsLink = Number.isFinite(Number(terrain.latitude)) && Number.isFinite(Number(terrain.longitude)) && terrain.latitude !== null && terrain.longitude !== null
    ? `<a class="terrain-gps-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${terrain.latitude},${terrain.longitude}`)}" target="_blank" rel="noopener noreferrer">${T("js.voirGps")}</a>`
    : "";

  actions.innerHTML = terrain.status === "vendu"
    ? `<span class="terrain-sold-note">Ce terrain est vendu. Consultez les autres parcelles disponibles.</span>${gpsLink}`
    : `<a class="is-primary" href="${escapeAttribute(terrainWhatsAppLink(terrain))}" target="_blank" rel="noopener noreferrer">${T("js.contacterWhatsapp")}</a><a href="contact.html">${T("js.demanderRdv")}</a>${gpsLink}`;

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  // Avis des visiteurs (js/avis.js) : section ajoutée à la fiche ouverte.
  window.dispatchEvent(new CustomEvent("dl:annonce-ouverte", { detail: { kind: "terrain", id: terrain.id, conteneur: modal.querySelector(".modal-details") } }));
  window.setTimeout(() => document.getElementById("terrainModalCloseBtn")?.focus(), 30);
}

// terrains.html#TER-ASS-001 ou #terrain-lagune-km12 ouvre directement la fiche.
function openTerrainFromHash() {
  if (!document.getElementById("terrainModal")) return;
  const hash = decodeURIComponent(window.location.hash.replace("#", "")).trim();
  if (!hash) return;
  const match = visibleTerrains().find(terrain => terrain.id === hash || terrain.reference === hash);
  if (match) openTerrainModal(match.id);
}

/** Identifiant porté par l'adresse (#…), ou "" s'il est absent ou mal formé. */
function identifiantDeLAdresse() {
  try { return decodeURIComponent(window.location.hash.replace("#", "")).trim(); }
  catch { return ""; }
}

/*
 * Liens partagés depuis l'application mobile (14/09/2026) :
 * residences.html#villa-oasis ouvre la fiche de la résidence, comme
 * terrains.html#id le faisait déjà pour un terrain.
 */
function openVillaFromHash() {
  if (!document.getElementById("villasGrid")) return;
  const id = identifiantDeLAdresse();
  if (id && VILLAS_DATA.some(villa => villa.id === id)) openVillaModal(id);
}

/* loisirs.html#balade-bateau : l'activité n'a pas de fiche, on amène le visiteur à sa carte. */
function focusActivityFromHash() {
  const id = identifiantDeLAdresse();
  if (!id || !document.getElementById("activitiesGrid")) return;
  // La carte est cherchée au dernier moment : la grille est redessinée juste
  // après le chargement (langue), et l'ancienne carte n'est plus dans la page.
  const carte = () => [...document.querySelectorAll("#activitiesGrid .activity-card")].find(element => element.dataset.id === id);
  window.setTimeout(() => {
    const cible = carte();
    if (!cible) return;
    cible.style.outline = "3px solid var(--color-gold)";
    cible.style.outlineOffset = "4px";
    cible.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => { cible.style.outline = ""; cible.style.outlineOffset = ""; }, 3000);
  }, 600);
}

/* ==========================================================================
   3. Activités & Loisirs
   ========================================================================== */
function renderActivities() {
  const container = document.getElementById("activitiesGrid");
  if (!container) return;

  container.innerHTML = ACTIVITIES_DATA.map(act => {
    const waMessage = encodeURIComponent(`Bonjour Henri & Philippe - Détente & Loisirs ! Je souhaite réserver l'activité : ${act.title} (${act.price}).`);
    
    return `
      <article class="activity-card" data-id="${escapeAttribute(act.id)}">
        <div class="activity-img-wrap">
          ${act.image ? responsiveImageHTML(act.image, {
            alt: ficheTexte(act, "title"),
            className: "activity-img",
            sizes: "(max-width: 768px) 100vw, 33vw"
          }) : `<div class="activity-img activity-img-absente" role="img" aria-label="${escapeAttribute(act.title)}"></div>`}
          <span class="activity-badge-pill">${escapeHTMLText(libelleReferentiel("badges", act.badgeId, act.badge))}</span>
        </div>
        <div class="activity-card-body">
          <div class="activity-meta-row">
            <span class="activity-duration">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              ${escapeHTMLText(ficheTexte(act, "duration"))}
            </span>
            <span class="activity-subtitle-tag">${escapeHTMLText(ficheTexte(act, "subtitle") || "Assinie")}</span>
          </div>
          
          <h3 class="activity-card-title">${escapeHTMLText(ficheTexte(act, "title"))}</h3>
          
          <p class="activity-card-desc">${escapeHTMLText(ficheTexte(act, "description"))}</p>
          
          <div class="activity-price-box">
            <span class="activity-price-label">${T("js.tarif")}</span>
            <span class="activity-price-val">${escapeHTMLText(tarifActivite(act))}</span>
          </div>
          
          <div class="activity-actions-group">
            <a href="https://wa.me/2250767696318?text=${waMessage}" 
               target="_blank" 
               rel="noopener noreferrer" 
               class="btn-activity-wa" 
               title="Réserver ${escapeAttribute(act.title)} sur WhatsApp" aria-label="Réserver ${escapeAttribute(act.title)} sur WhatsApp">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
              </svg>
              <span>${T("js.reserver")}</span>
            </a>
            
            <a href="devis.html?activity=${encodeURIComponent(act.id)}" class="btn-activity-quote" title="Inclure au devis" aria-label="Inclure ${escapeAttribute(act.title)} au devis">
              ${T("js.calculerDevisCourt")}
            </a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  window.dispatchEvent(new CustomEvent("dl:cards-rendered"));
  initScrollReveal();
}

/* ==========================================================================
   4. Avis & Témoignages
   ========================================================================== */
function renderReviews() {
  const container = document.getElementById("reviewsGrid");
  if (!container) return;

  container.innerHTML = REVIEWS_DATA.map(rev => `
    <div class="review-card">
      <div>
        <div class="review-stars">
          ${"★".repeat(rev.rating)}
        </div>
        <p class="review-text">"${rev.comment}"</p>
      </div>
      <div class="review-author-wrap">
        <img class="review-author-avatar" src="${rev.avatar}" alt="${rev.author}">
        <div class="review-author-info">
          <h5>${rev.author}</h5>
          <p>${rev.city} • ${rev.stay}</p>
        </div>
      </div>
    </div>
  `).join("");
}

/* ==========================================================================
   5. Foire Aux Questions (FAQ Accordéon)
   ========================================================================== */
function renderFAQ() {
  const container = document.getElementById("faqAccordion");
  if (!container) return;

  container.innerHTML = FAQ_DATA.map((item, index) => `
    <div class="faq-item ${index === 0 ? "active" : ""}">
      <button class="faq-question" type="button" id="faqQuestion${index}" aria-expanded="${index === 0}" aria-controls="faqAnswer${index}">
        <span>${item.q}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="faq-answer" id="faqAnswer${index}" role="region" aria-labelledby="faqQuestion${index}" aria-hidden="${index !== 0}">
        <p>${item.a}</p>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".faq-question").forEach(btn => {
    btn.addEventListener("click", () => {
      const parent = btn.parentElement;
      const isActive = parent.classList.contains("active");
      
      // Fermer les autres
      container.querySelectorAll(".faq-item").forEach(item => {
        item.classList.remove("active");
        item.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
        item.querySelector(".faq-answer")?.setAttribute("aria-hidden", "true");
      });

      if (!isActive) {
        parent.classList.add("active");
        btn.setAttribute("aria-expanded", "true");
        parent.querySelector(".faq-answer")?.setAttribute("aria-hidden", "false");
      }
    });
  });
}

/* ==========================================================================
   6. Modal Pop-up Détails Villa
   ========================================================================== */
function initModal() {
  const modal = ensureVillaModalStructure();
  if (!modal || modal.dataset.bound === "true") return;
  modal.dataset.bound = "true";

  document.getElementById("modalCloseBtn")?.addEventListener("click", closeVillaModal);
  document.getElementById("modalPrevBtn")?.addEventListener("click", () => showModalImage(modalActiveImageIndex - 1));
  document.getElementById("modalNextBtn")?.addEventListener("click", () => showModalImage(modalActiveImageIndex + 1));

  modal.addEventListener("click", event => {
    if (event.target === modal) closeVillaModal();
  });

  document.addEventListener("keydown", event => {
    if (!modal.classList.contains("active")) return;
    if (event.key === "Escape") closeVillaModal();
    if (event.key === "ArrowLeft") showModalImage(modalActiveImageIndex - 1);
    if (event.key === "ArrowRight") showModalImage(modalActiveImageIndex + 1);
    if (event.key === "Tab") {
      const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}

function ensureVillaModalStructure() {
  const modal = document.getElementById("villaModal");
  const container = document.getElementById("modalContainer");
  if (!modal || !container) return null;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "true");
  modal.setAttribute("aria-labelledby", "modalTitle");
  if (!document.getElementById("modalCloseBtn")) {
    container.innerHTML = `
      <button type="button" class="modal-close-btn" id="modalCloseBtn" aria-label="Fermer la vue détaillée">×</button>
      <div class="modal-content-grid">
        <div class="modal-gallery">
          <div class="modal-main-media">
            <img id="modalMainImg" class="modal-main-img" src="" alt="">
            <div class="modal-gallery-nav" aria-label="Navigation dans la galerie">
              <button type="button" id="modalPrevBtn" aria-label="Photo précédente">←</button>
              <button type="button" id="modalNextBtn" aria-label="Photo suivante">→</button>
            </div>
          </div>
          <div class="modal-thumbs" id="modalThumbs" aria-label="Miniatures de la résidence"></div>
        </div>
        <div class="modal-details">
          <span class="modal-eyebrow">${T("js.residenceException")}</span>
          <h2 id="modalTitle"></h2>
          <p id="modalTagline" class="modal-tagline"></p>
          <p id="modalLocation" class="modal-location"></p>
          <div id="modalSpecs" class="modal-specs"></div>
          <p id="modalDesc" class="modal-description"></p>
          <h3 class="modal-section-title">${T("js.equipements")}</h3>
          <div id="modalFeatures" class="modal-features-grid"></div>
          <div class="modal-price-row"><div><small>${T("js.aPartirDe")}</small><div id="modalPrice"></div></div><div id="modalWeekend" class="modal-price-weekend" hidden></div></div>
          <div class="modal-actions">
            <a id="modalWhatsappBtn" class="is-primary" href="#" target="_blank" rel="noopener noreferrer">${T("js.reserverWhatsapp")}</a>
            <a id="modalQuoteBtn" href="devis.html">${T("js.calculerDevis")}</a>
            <button type="button" id="modalTripBtn">＋ Ajouter à mon séjour</button>
          </div>
        </div>
      </div>`;
  }
  return modal;
}

/* ==========================================================================
   Saisie du devis mise de côté le temps d'une fiche (20/09/2026)

   Aller voir une résidence ou un véhicule ne doit rien coûter : tout ce qui
   est déjà renseigné (dates, voyageurs, activités, coordonnées, voiture)
   part dans sessionStorage au clic sur « Voir la fiche », et revient quand
   la fermeture de la fiche ramène au devis (?reprise=1). Rien n'est gardé
   au-delà de l'onglet, ni au-delà d'une heure.
   ========================================================================== */
const CLE_SAISIE_DEVIS = "dl:devis-saisie";
const DUREE_SAISIE_DEVIS = 3600000;
const repriseDemandee = new URLSearchParams(window.location.search).get("reprise") === "1";

window.DevisSaisie = {
  /**
   * Vrai quand on revient d'une fiche ouverte depuis le simulateur. Lu une
   * fois pour toutes : l'adresse est nettoyée aussitôt la saisie remise en
   * place, alors que la voiture, elle, se reprend plus tard (ses données
   * arrivent par le réseau).
   */
  reprise() { return repriseDemandee; },
  lire() {
    try {
      const brut = JSON.parse(window.sessionStorage.getItem(CLE_SAISIE_DEVIS) || "null");
      if (!brut || Date.now() - Number(brut.le) > DUREE_SAISIE_DEVIS) return null;
      return brut;
    } catch { return null; }
  },
  ecrire(memoire) {
    try { window.sessionStorage.setItem(CLE_SAISIE_DEVIS, JSON.stringify({ ...memoire, le: Date.now() })); }
    catch { /* navigation privée, quota : le devis reste juste à resaisir */ }
  }
};

/**
 * Champs du simulateur : tout ce qui se saisit dans l'encadré (formule,
 * résidence, dates, voyageurs, coordonnées) et les cases des activités, qui
 * sont dessinées hors de l'encadré et n'ont pas d'identifiant — elles portent
 * data-addon-index.
 */
function champsDuDevis() {
  const boite = document.querySelector(".simulator-box");
  return [...(boite ? boite.querySelectorAll("input, select, textarea") : []),
    ...document.querySelectorAll("input[type=checkbox][data-addon-index]")];
}

/** Clé de mémorisation d'un champ, stable d'une visite à l'autre. */
function cleDuChamp(champ) {
  if (champ.dataset.addonIndex !== undefined) return `activite:${champ.dataset.addonIndex}`;
  if (champ.type === "radio") return `formule:${champ.name}`;
  return champ.id || champ.name || "";
}

function memoriserSaisieDevis() {
  const champs = {};
  champsDuDevis().forEach(champ => {
    const cle = cleDuChamp(champ);
    if (!cle) return;
    if (champ.type === "radio") { if (champ.checked) champs[cle] = champ.value; return; }
    champs[cle] = champ.type === "checkbox" ? champ.checked : champ.value;
  });
  const voiture = window.DevisVoiture && window.DevisVoiture.memoire ? window.DevisVoiture.memoire() : null;
  window.DevisSaisie.ecrire({ champs, voiture });
}

/** Saisie remise en place au retour d'une fiche. Renvoie false s'il n'y a rien à reprendre. */
function reprendreSaisieDevis() {
  const memoire = window.DevisSaisie.reprise() ? window.DevisSaisie.lire() : null;
  if (!memoire || !memoire.champs) return false;
  champsDuDevis().forEach(champ => {
    const cle = cleDuChamp(champ);
    if (!cle || !(cle in memoire.champs)) return;
    if (champ.type === "radio") { champ.checked = champ.value === memoire.champs[cle]; return; }
    if (champ.type === "checkbox") { champ.checked = Boolean(memoire.champs[cle]); return; }
    // Une résidence retirée du catalogue entre-temps n'est plus dans la liste.
    if (champ.tagName !== "SELECT" || [...champ.options].some(o => o.value === memoire.champs[cle])) champ.value = memoire.champs[cle];
  });
  return true;
}

/**
 * Retour au simulateur (20/09/2026) : la fiche ouverte depuis « Calculer un
 * devis » porte ?retour=devis. La refermer ramène au devis, la résidence ou
 * le véhicule toujours choisi — le visiteur ne perd pas sa saisie en allant
 * vérifier les photos.
 */
function retourAuDevis(parametre, id) {
  if (new URLSearchParams(window.location.search).get("retour") !== "devis") return false;
  window.location.href = id ? `devis.html?${parametre}=${encodeURIComponent(id)}&reprise=1` : "devis.html?reprise=1";
  return true;
}

function closeVillaModal() {
  const modal = document.getElementById("villaModal");
  if (!modal) return;
  if (retourAuDevis("villa", modalActiveVilla && modalActiveVilla.id)) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (modalLastFocusedElement instanceof HTMLElement) modalLastFocusedElement.focus();
  modalActiveVilla = null;
}

function showModalImage(index) {
  if (!modalActiveVilla?.images?.length) return;
  const total = modalActiveVilla.images.length;
  modalActiveImageIndex = (index + total) % total;
  const mainImg = document.getElementById("modalMainImg");
  if (mainImg) {
    mainImg.src = modalActiveVilla.images[modalActiveImageIndex];
    mainImg.alt = `${modalActiveVilla.name} — photo ${modalActiveImageIndex + 1} sur ${total}`;
  }
  document.querySelectorAll("#modalThumbs .modal-thumb").forEach((thumb, thumbIndex) => {
    thumb.classList.toggle("active", thumbIndex === modalActiveImageIndex);
    thumb.setAttribute("aria-current", thumbIndex === modalActiveImageIndex ? "true" : "false");
  });
}

function openVillaModal(villaId) {
  const villa = VILLAS_DATA.find(v => v.id === villaId);
  if (!villa) return;

  const modal = ensureVillaModalStructure();
  initModal();
  const mainImg = document.getElementById("modalMainImg");
  const thumbsContainer = document.getElementById("modalThumbs");
  const title = document.getElementById("modalTitle");
  const tagline = document.getElementById("modalTagline");
  const location = document.getElementById("modalLocation");
  const specs = document.getElementById("modalSpecs");
  const desc = document.getElementById("modalDesc");
  const features = document.getElementById("modalFeatures");
  const price = document.getElementById("modalPrice");
  const whatsappBtn = document.getElementById("modalWhatsappBtn");
  const quoteBtn = document.getElementById("modalQuoteBtn");
  const tripBtn = document.getElementById("modalTripBtn");

  if (!modal || !mainImg || !thumbsContainer || !title || !tagline || !location || !specs || !desc || !features || !price || !whatsappBtn || !quoteBtn || !tripBtn) return;
  modalActiveVilla = villa;
  modalActiveImageIndex = 0;
  modalLastFocusedElement = document.activeElement;

  // Images
  mainImg.src = villa.images[0];
  mainImg.alt = `${villa.name} — photo 1 sur ${villa.images.length}`;
  thumbsContainer.innerHTML = villa.images.map((img, i) => `
    <button type="button" class="modal-thumb ${i === 0 ? "active" : ""}" style="background-image:url('${escapeAttribute(img)}')" aria-label="Afficher la photo ${i + 1} de ${escapeAttribute(villa.name)}" aria-current="${i === 0}" data-index="${i}"></button>
  `).join("");

  thumbsContainer.querySelectorAll(".modal-thumb").forEach(thumb => {
    thumb.addEventListener("click", () => {
      showModalImage(Number(thumb.dataset.index));
    });
  });

  // Textes & Spécifications
  title.textContent = villa.name;
  tagline.textContent = ficheTexte(villa, "tagline");
  location.textContent = villa.location;
  desc.textContent = ficheTexte(villa, "description");
  price.innerHTML = `${formatFCFA(villa.pricePerNight)} <span>/ nuit · ${formatEUR(villa.priceEuro || villa.pricePerNight / 655.957)}</span>`;

  // Forfait week-end : saisi dans le studio, affiché depuis le 13/09/2026.
  // Information seulement — le simulateur de devis ne l'applique pas.
  const weekend = document.getElementById("modalWeekend");
  if (weekend) {
    const forfait = Number(villa.weekendPackage) || 0;
    weekend.hidden = forfait <= 0;
    weekend.innerHTML = forfait > 0 ? `<small>${T("js.forfaitWeekend")}</small><strong>${escapeHTMLText(formatFCFA(forfait))}</strong>` : "";
  }

  const couchages = ficheTexte(villa, "beds");
  specs.innerHTML = `
    <span class="spec-pill">👥 ${escapeHTMLText((T("js.capaciteN") || "Capacité : {n} personnes").replace("{n}", villa.capacity))}</span>
    <span class="spec-pill">🛏️ ${escapeHTMLText((T("js.chambresN") || "{n} Chambres autonomes").replace("{n}", villa.bedrooms))}</span>
    <span class="spec-pill">🚿 ${escapeHTMLText((T("js.sallesDeBainN") || "{n} Salles de bain").replace("{n}", villa.bathrooms))}</span>
    ${couchages ? `<span class="spec-pill" title="${escapeAttribute(T("js.couchages"))}">🛌 ${escapeHTMLText(couchages)}</span>` : ""}
    ${villa.badge ? `<span class="spec-pill">✨ ${escapeHTMLText(libelleReferentiel("badges", villa.badgeId, villa.badge))}</span>` : ""}
  `;

  features.innerHTML = (ficheTexte(villa, "features") || []).map(feat => `
    <div class="feature-check-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${escapeHTMLText(feat)}</span>
    </div>
  `).join("");

  // Lien WhatsApp
  const message = `Bonjour Détente & Loisirs à Assinie ! Je souhaite avoir des informations et réserver la villa : ${villa.name} (${villa.location}). Pouvez-vous me confirmer les disponibilités ?`;
  whatsappBtn.href = `https://wa.me/2250767696318?text=${encodeURIComponent(message)}`;
  quoteBtn.href = `devis.html?villa=${encodeURIComponent(villa.id)}`;
  const existingTrip = (() => { try { return JSON.parse(localStorage.getItem("dl-assinie-trip") || "[]"); } catch { return []; } })();
  const alreadyInTrip = existingTrip.some(item => item.id === villa.id);
  tripBtn.textContent = alreadyInTrip ? "✓ Déjà dans mon séjour" : "＋ Ajouter à mon séjour";
  tripBtn.setAttribute("aria-pressed", String(alreadyInTrip));
  tripBtn.onclick = () => {
    let items;
    try { items = JSON.parse(localStorage.getItem("dl-assinie-trip") || "[]"); } catch { items = []; }
    if (!items.some(item => item.id === villa.id)) {
      items.push({ id: villa.id, type: "villa", title: villa.name, image: villa.images[0] });
      localStorage.setItem("dl-assinie-trip", JSON.stringify(items));
      tripBtn.textContent = "✓ Ajoutée à mon séjour";
      tripBtn.setAttribute("aria-pressed", "true");
      window.dispatchEvent(new CustomEvent("dl:trip-updated"));
      window.dispatchEvent(new CustomEvent("dl:toast", { detail: "Villa ajoutée à votre séjour" }));
    }
  };

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  // Avis des visiteurs (js/avis.js) : section ajoutée à la fiche ouverte.
  window.dispatchEvent(new CustomEvent("dl:annonce-ouverte", { detail: { kind: "villa", id: villa.id, conteneur: modal.querySelector(".modal-details") } }));
  window.setTimeout(() => document.getElementById("modalCloseBtn")?.focus(), 30);
}

/* ==========================================================================
   7. Simulateur de Devis Interactif
   ========================================================================== */
function initSimulator(villaParam, activityParam) {
  const villaSelect = document.getElementById("simVilla");
  const checkinInput = document.getElementById("simCheckin");
  const checkoutInput = document.getElementById("simCheckout");
  const guestsSelect = document.getElementById("simGuests");
  const nomInput = document.getElementById("simNom");
  const telInput = document.getElementById("simTel");
  const emailInput = document.getElementById("simEmail");
  const optinInput = document.getElementById("simOptin");


  /**
   * Extrait un montant et une unité de facturation depuis le libellé de prix
   * d'une activité (champ libre saisi dans le studio).
   *
   * Exemples réels du catalogue :
   *   « À partir de 25 000 FCFA / jour »   -> 25000, par jour
   *   « À partir de 60 000 FCFA / sortie » -> 60000, forfait
   *   « 45 000 FCFA / 30 min »             -> 45000, forfait
   *   « Entrée 5 000 FCFA / personne »     -> 5000, par personne
   *
   * Un libellé sans chiffre (« Sur devis ») renvoie 0 : l'option reste
   * proposée mais n'entre pas dans le total, et le récapitulatif l'indique.
   */
  function parseActivityPrice(label) {
    const texte = String(label || "");
    const montant = Number((texte.match(/\d[\d\s  ]*/)?.[0] || "0").replace(/[\s  ]/g, ""));
    const parJour = /\/\s*(jour|nuit|journ[ée]e)|par\s+(jour|nuit|journ[ée]e)/i.test(texte);
    const parPersonne = /\/\s*personne|par\s+personne/i.test(texte);
    return { montant: Number.isFinite(montant) ? montant : 0, parJour, parPersonne };
  }

  /**
   * Tarif retenu pour une activité.
   *
   * Priorité au montant saisi dans le studio (`priceAmount` + `priceUnit`) :
   * c'est une donnée exacte. L'analyse du libellé ne sert que de repli pour les
   * fiches créées avant l'ajout de ces champs — sans elle, toutes les activités
   * existantes seraient brutalement passées à « sur devis ».
   */
  function activityPricing(item) {
    // Forfait groupe facultatif : un prix pour un nombre de participants donné,
    // appliqué automatiquement dès que le groupe est assez nombreux.
    const groupe = Number(item && item.groupPriceAmount) || 0;
    const taille = Number(item && item.groupSize) || 0;
    const forfaitGroupe = groupe > 0 && taille > 1 ? { montant: groupe, taille } : null;
    const montantSaisi = Number(item && item.priceAmount) || 0;
    if (montantSaisi > 0) {
      const unite = item.priceUnit || "forfait";
      return { montant: montantSaisi, parJour: unite === "jour", parPersonne: unite === "personne", forfaitGroupe };
    }
    return Object.assign(parseActivityPrice(item && item.price), { forfaitGroupe });
  }

  /**
   * Coût d'une activité facturée à la personne, forfait groupe compris.
   * On remplit autant de forfaits que possible puis on facture le reste à
   * l'unité — et on ne retient le résultat que s'il est réellement plus
   * avantageux, pour qu'un forfait mal saisi ne puisse jamais renchérir le devis.
   */
  function coutParPersonne(prix, personnes) {
    const plein = prix.montant * personnes;
    const f = prix.forfaitGroupe;
    if (!f || personnes < f.taille) return { total: plein, detail: `${formatFCFA(prix.montant)} × ${personnes} pers.` };
    const lots = Math.floor(personnes / f.taille);
    const reste = personnes % f.taille;
    const total = lots * f.montant + reste * prix.montant;
    if (total >= plein) return { total: plein, detail: `${formatFCFA(prix.montant)} × ${personnes} pers.` };
    const morceaux = [`${lots} × forfait ${f.taille} pers. (${formatFCFA(f.montant)})`];
    if (reste) morceaux.push(`${reste} × ${formatFCFA(prix.montant)}`);
    return { total, detail: morceaux.join(" + ") };
  }

  /**
   * Construit la liste des services additionnels À PARTIR DES ACTIVITÉS
   * PUBLIÉES. Toute activité ajoutée dans le studio apparaît donc ici sans
   * aucune intervention sur le code.
   */
  const addonsHost = document.getElementById("simAddons");
  const activityAddons = [];
  if (addonsHost && typeof ACTIVITIES_DATA !== "undefined") {
    const visibles = ACTIVITIES_DATA.filter(item => item && item.visible !== false);
    addonsHost.innerHTML = visibles.map((item, index) => {
      const prix = activityPricing(item);
      const suffixe = prix.parJour ? T("js.parJour") : prix.parPersonne ? T("js.parPersonne") : "";
      const libelleGroupe = prix.forfaitGroupe
        ? ` · ${new Intl.NumberFormat("fr-FR").format(prix.forfaitGroupe.montant)} FCFA les ${prix.forfaitGroupe.taille}`
        : "";
      const libellePrix = prix.montant > 0
        ? `+ ${new Intl.NumberFormat("fr-FR").format(prix.montant)} FCFA${suffixe}${libelleGroupe}`
        : "Sur devis";
      const duree = item.duration ? ` (${escapeAttribute(item.duration)})` : "";
      return `<label class="addon-checkbox-label">
              <div style="display: flex; align-items: center; gap: 0.8rem; font-size: 0.9rem; font-weight: 600;">
                <input type="checkbox" data-addon-index="${index}" style="accent-color: var(--color-gold); width: 18px; height: 18px;">
                <span>${escapeAttribute(item.title)}${duree}</span>
              </div>
              <span style="color: var(--color-gold); font-weight: 700; font-size: 0.85rem;">${libellePrix}</span>
            </label>`;
    }).join("");
    visibles.forEach((item, index) => {
      activityAddons.push({
        item,
        prix: activityPricing(item),
        input: addonsHost.querySelector(`[data-addon-index="${index}"]`)
      });
    });
  }

  // Aucune activité cochée d'office (demande du 19/09/2026) : c'est le
  // visiteur qui choisit. La balade en bateau était présélectionnée.

  // Lien profond `?activite=<id>` : on ne coche que l'activité demandée.
  const requestedActivity = typeof ACTIVITIES_DATA !== "undefined" ? ACTIVITIES_DATA.find(item => item.id === activityParam) : null;
  if (requestedActivity) {
    activityAddons.forEach(a => { if (a.input) a.input.checked = a.item.id === requestedActivity.id; });
  }

  // Affichages du résumé
  const resVillaName = document.getElementById("summaryVillaName");
  const resNightlyRate = document.getElementById("summaryNightlyRate");
  const resNights = document.getElementById("summaryNightsCount");
  const resVillaPrice = document.getElementById("summaryLodgingTotal");
  const resAddons = document.getElementById("summaryAddonsTotal");
  const resTotalFCFA = document.getElementById("summaryGrandTotal");
  const resTotalEUR = document.getElementById("summaryEuroTotal");
  const submitBtn = document.getElementById("btnConfirmWhatsApp");

  if (!villaSelect) return;
  let latestEstimate = null;

  if (!VILLAS_DATA.length) {
    villaSelect.innerHTML = '<option value="">' + T('js.aucuneResidence') + '</option>';
    villaSelect.disabled = true;
    if (resVillaName) resVillaName.textContent = "Contactez notre conciergerie";
    [resNightlyRate, resNights, resVillaPrice, resAddons, resTotalFCFA, resTotalEUR].forEach(element => {
      if (element) element.textContent = "—";
    });
    if (submitBtn) {
      submitBtn.href = "https://wa.me/2250767696318?text=" + encodeURIComponent("Bonjour, je souhaite connaître les résidences actuellement disponibles à Assinie.");
    }
    return;
  }

  /**
   * Filtres de résidence.
   *
   * Les critères sont déduits des données réelles de chaque villa : catégorie
   * pour l'emplacement, et recherche de « piscine » dans les équipements,
   * points forts et description (une villa « bord de lagune » peut très bien
   * avoir une piscine — les deux critères sont indépendants).
   *
   * Un filtre qui ne correspond à aucune résidence n'est pas proposé : mieux
   * vaut une liste courte et honnête qu'un choix qui n'affiche rien.
   */
  function villaTexte(v) {
    return [(v.features || []).join(" "), (v.highlights || []).join(" "), v.tagline, v.description]
      .join(" ").toLowerCase();
  }
  // Le CADRE (champ « environment » du studio) est la source de vérité de ce
  // filtre. « category » reste l'angle commercial affiché sur residences.html
  // (Événements, Romantique…) : les deux axes ne se confondent plus.
  // Repli pour les fiches antérieures à l'ajout du champ : voir cadreVilla,
  // partagée avec la recherche multicritère.
  const cadre = cadreVilla;
  const estLagune = v => cadre(v) === "lagune" || cadre(v) === "mer-lagune";
  const estOcean = v => cadre(v) === "ocean" || cadre(v) === "mer-lagune";
  const FILTRES_VILLA = [
    { value: "all", label: "Toutes les résidences", test: () => true },
    { value: "eau", label: "Bordure de mer & lagune", test: v => estOcean(v) || estLagune(v) },
    { value: "ocean", label: "Bordure de mer", test: estOcean },
    { value: "lagune", label: "Bordure de lagune", test: estLagune },
    // Une villa reste trouvable sous « Avec piscine » même si son cadre décrit
    // son emplacement : le bassin est mentionné dans sa fiche.
    { value: "piscine", label: "Avec piscine", test: v => (Array.isArray(v.equipements) && v.equipements.includes("piscine")) || /piscine/.test(villaTexte(v)) },
    { value: "terre", label: "Terre ferme", test: v => cadre(v) === "terre" }
  ];

  const villaFilter = document.getElementById("simVillaFilter");
  if (villaFilter) {
    villaFilter.innerHTML = FILTRES_VILLA
      .filter(f => VILLAS_DATA.some(f.test))
      .map(f => {
        const nb = VILLAS_DATA.filter(f.test).length;
        return `<option value="${f.value}">${f.label} (${nb})</option>`;
      }).join("");
  }

  function villasFiltrees() {
    const critere = FILTRES_VILLA.find(f => f.value === (villaFilter && villaFilter.value)) || FILTRES_VILLA[0];
    const liste = VILLAS_DATA.filter(critere.test);
    return liste.length ? liste : VILLAS_DATA;
  }

  // Une résidence marquée « indisponible » dans le studio reste visible dans
  // la liste, pour que le visiteur la retrouve, mais ne peut plus être
  // choisie : elle était jusqu'ici chiffrée comme les autres.
  const estIndisponible = v => String(v.status || "").toLowerCase() === "indisponible";

  function remplirVillas() {
    // On conserve la résidence choisie si elle satisfait encore le filtre.
    const avant = villaSelect.value;
    const liste = villasFiltrees();
    villaSelect.innerHTML = liste.map(v => `
    <option value="${v.id}"${estIndisponible(v) ? " disabled" : ""}>${v.name} - ${formatFCFA(v.pricePerNight)}/nuit${estIndisponible(v) ? " — indisponible" : ""}</option>
  `).join("");
    if (liste.some(v => v.id === avant && !estIndisponible(v))) villaSelect.value = avant;
  }
  remplirVillas();

  /**
   * Alerte quand le nombre de voyageurs dépasse la capacité de la résidence.
   * Le devis reste possible — la conciergerie peut proposer une solution —
   * mais le visiteur est prévenu au lieu d'obtenir un prix pour un séjour
   * que la résidence ne peut pas accueillir.
   */
  const alerteCapacite = document.getElementById("simCapaciteAlerte");
  function afficherAlerteCapacite(villa, voyageurs) {
    if (!alerteCapacite) return;
    const capacite = villa ? Number(villa.capacity) : 0;
    const depasse = Boolean(villa) && capacite > 0 && voyageurs > capacite;
    alerteCapacite.hidden = !depasse;
    if (depasse) {
      alerteCapacite.textContent = `${villa.name} accueille ${capacite} personnes au maximum : votre demande en compte ${voyageurs}. Choisissez une résidence plus grande ou précisez votre besoin à la conciergerie.`;
    }
  }

  /**
   * Type de demande : séjour en résidence, ou activités seules.
   *
   * Ce choix est porté par deux boutons radio VISIBLES en haut du formulaire.
   * Il était auparavant caché dans la liste des résidences, où personne ne
   * pouvait le trouver.
   */
  const modeRadios = Array.from(document.querySelectorAll('input[name="simMode"]'));
  const villaField = document.getElementById("simVillaField");
  const labelArrivee = document.querySelector('label[for="simCheckin"]');
  const labelDepart = document.querySelector('label[for="simCheckout"]');
  const modeActuel = () => (modeRadios.find(r => r.checked) || {}).value || "sejour";

  const colonneFormulaire = document.querySelector(".simulator-form-col");
  function appliquerMode() {
    // Voiture seule (19/09/2026) : ni résidence, ni dates de séjour, ni
    // voyageurs, ni activités — la voiture a ses propres dates.
    const voitureSeule = modeActuel() === "voiture";
    const activitesSeules = modeActuel() !== "sejour";
    if (colonneFormulaire) colonneFormulaire.classList.toggle("sim-voiture-seule", voitureSeule);
    if (window.DevisVoiture) window.DevisVoiture.definirMode(modeActuel());
    // Le choix de la résidence n'a plus de sens sans hébergement : on le retire
    // du flux ET de la navigation clavier, au lieu de le laisser grisé.
    if (villaField) {
      villaField.hidden = activitesSeules;
      villaField.querySelectorAll("select, input").forEach(el => { el.disabled = activitesSeules; });
    }
    if (labelArrivee) labelArrivee.textContent = activitesSeules ? "Début des activités :" : "Arrivée (Check-in 14h) :";
    if (labelDepart) labelDepart.textContent = activitesSeules ? "Fin des activités :" : "Départ (Check-out 12h) :";
  }

  // Présélection de la villa si passée en paramètre d'URL
  if (villaParam && VILLAS_DATA.some(v => v.id === villaParam && !estIndisponible(v))) {
    villaSelect.value = villaParam;
  }

  // Initialiser les dates par défaut (vendredi prochain -> dimanche prochain)
  const today = new Date();
  const nextFriday = new Date();
  nextFriday.setDate(today.getDate() + ((7 - today.getDay() + 5) % 7 || 7));
  const nextSunday = new Date(nextFriday);
  nextSunday.setDate(nextFriday.getDate() + 2);

  checkinInput.value = nextFriday.toISOString().split("T")[0];
  checkoutInput.value = nextSunday.toISOString().split("T")[0];
  checkinInput.min = today.toISOString().split("T")[0];
  checkoutInput.min = nextFriday.toISOString().split("T")[0];

  function calculateTotal() {
    // « Activités uniquement » et « Voiture seule » : aucune résidence retenue,
    // le séjour vaut zéro.
    const voitureSeule = modeActuel() === "voiture";
    const sansResidence = modeActuel() !== "sejour";
    const selectedVilla = sansResidence
      ? null
      : (VILLAS_DATA.find(v => v.id === villaSelect.value) || VILLAS_DATA[0]);

    // Lien « Voir la fiche » (20/09/2026) : residences.html#id ouvre la fiche
    // de la résidence, comme les liens partagés depuis l'application.
    const villaFiche = document.getElementById("simVillaFiche");
    if (villaFiche) {
      villaFiche.hidden = !selectedVilla;
      // « retour=devis » : en fermant la fiche, le visiteur revient au devis,
      // sa résidence toujours choisie (20/09/2026).
      if (selectedVilla) villaFiche.href = `residences.html?retour=devis#${encodeURIComponent(selectedVilla.id)}`;
    }

    // Calcul des nuits (ou des journées d'activités si aucune résidence)
    const dIn = new Date(checkinInput.value);
    const dOut = new Date(checkoutInput.value);
    let diffDays = Math.ceil((dOut - dIn) / (1000 * 60 * 60 * 24));
    if (isNaN(diffDays) || diffDays < 1) diffDays = 1;

    // Calcul Villa
    const villaSubtotal = sansResidence ? 0 : selectedVilla.pricePerNight * diffDays;

    // Calcul Options
    let addonsTotal = 0;
    const selectedAddonsList = [];

    // Activités cochées : le montant suit l'unité de facturation (forfait,
    // par jour, par personne). `detailLignes` alimente le récapitulatif
    // détaillé du panneau de droite.
    // « 15+ » n'est pas un nombre : Number("15+") valait NaN, ramené à 1, et
    // une activité facturée par personne était chiffrée pour une seule
    // personne (corrigé le 13/09/2026). parseInt lit le nombre en tête.
    const guests = parseInt(guestsSelect && guestsSelect.value, 10) || 1;
    afficherAlerteCapacite(selectedVilla, guests);
    const detailLignes = [];
    activityAddons.forEach(({ item, prix, input }) => {
      if (voitureSeule || !input || !input.checked) return;
      if (prix.montant <= 0) {
        selectedAddonsList.push(`${item.title} (sur devis)`);
        detailLignes.push({ libelle: item.title, calcul: "sur devis", montant: null });
        return;
      }
      if (prix.parJour) {
        const total = prix.montant * diffDays;
        addonsTotal += total;
        selectedAddonsList.push(`${item.title} (${diffDays}j)`);
        detailLignes.push({ libelle: item.title, calcul: `${formatFCFA(prix.montant)} × ${diffDays} j`, montant: total });
      } else if (prix.parPersonne) {
        const { total, detail } = coutParPersonne(prix, guests);
        addonsTotal += total;
        selectedAddonsList.push(`${item.title} (${guests} pers.)`);
        detailLignes.push({ libelle: item.title, calcul: detail, montant: total });
      } else {
        addonsTotal += prix.montant;
        selectedAddonsList.push(item.title);
        detailLignes.push({ libelle: item.title, calcul: "forfait", montant: prix.montant });
      }
    });

    // Voiture facultative ou seule (js/devis-voiture.js) : elle reprend les
    // dates du séjour tant que le visiteur ne les change pas.
    const DV = window.DevisVoiture;
    if (DV) DV.definirSejour(voitureSeule ? null : { arrivee: checkinInput.value, depart: checkoutInput.value });
    const voiture = DV ? DV.etat() : null;
    const montantVoiture = voiture && voiture.devis.ok ? voiture.devis.total : 0;
    if (voiture) {
      detailLignes.push({
        libelle: `Voiture · ${voiture.vehicule.name}`,
        calcul: `${voiture.devis.jours} j · ${DV.libelleFormule(voiture)}`,
        montant: voiture.devis.ok ? montantVoiture : null
      });
    }
    const grandTotal = villaSubtotal + addonsTotal + montantVoiture;
    const euroTotal = grandTotal / 655.957; // Taux officiel 1 EUR = 655.957 FCFA

    // Mise à jour de l'UI
    resVillaName.textContent = voitureSeule ? "Location de voiture" : sansResidence ? "Activités uniquement" : selectedVilla.name;
    document.querySelectorAll(".summary-row[data-sejour]").forEach(ligne => { ligne.hidden = voitureSeule; });
    const ligneVoiture = document.getElementById("summaryVoitureRow");
    if (ligneVoiture) {
      ligneVoiture.hidden = !voiture;
      document.getElementById("summaryVoitureTotal").textContent = voiture ? (voiture.devis.ok ? formatFCFA(montantVoiture) : "Sur devis") : "-";
    }
    resNightlyRate.textContent = sansResidence ? "Sans hébergement" : `${formatFCFA(selectedVilla.pricePerNight)} / nuit`;
    resNights.textContent = sansResidence
      ? `${diffDays} journée${diffDays > 1 ? "s" : ""} d’activités`
      : `${diffDays} nuit${diffDays > 1 ? "s" : ""}`;
    resVillaPrice.textContent = sansResidence ? "0 FCFA" : formatFCFA(villaSubtotal);
    resAddons.textContent = addonsTotal > 0 ? formatFCFA(addonsTotal) : "Aucune (0 FCFA)";
    resTotalFCFA.textContent = formatFCFA(grandTotal);
    resTotalEUR.textContent = formatEUR(euroTotal);

    // Détail des prestations : le visiteur voit d'où vient chaque montant.
    const detailHost = document.getElementById("summaryAddonsDetail");
    if (detailHost) {
      if (!detailLignes.length) {
        detailHost.hidden = true;
        detailHost.innerHTML = "";
      } else {
        detailHost.hidden = false;
        detailHost.innerHTML =
          '<span class="summary-detail-title">' + T('js.detailPrestations') + '</span>'
          + detailLignes.map(l => `<div class="summary-detail-row">
              <span><strong>${escapeAttribute(l.libelle)}</strong><small>${escapeAttribute(l.calcul)}</small></span>
              <span class="summary-detail-amount">${l.montant === null ? "Sur devis" : formatFCFA(l.montant)}</span>
            </div>`).join("");
      }
    }

    // Préparation du message WhatsApp
    const entete = voitureSeule
      ? "✨ Demande de Location de Voiture - Détente & Loisirs à Assinie ✨"
      : sansResidence
        ? "✨ Demande d’Activités - Détente & Loisirs à Assinie ✨"
        : "✨ Demande de Réservation - Détente & Loisirs à Assinie ✨";
    const ligneSejour = sansResidence
      ? `🎯 Formule : Activités uniquement (sans hébergement)
📅 Dates : Du ${checkinInput.value} au ${checkoutInput.value} (${diffDays} journée${diffDays > 1 ? "s" : ""})`
      : `📍 Résidence : ${selectedVilla.name}
📅 Dates : Du ${checkinInput.value} au ${checkoutInput.value} (${diffDays} nuit${diffDays > 1 ? "s" : ""})`;
    const cloture = voitureSeule
      ? "Pouvez-vous me confirmer la disponibilité du véhicule ? Merci !"
      : sansResidence
        ? "Pouvez-vous me confirmer la disponibilité de ces activités ? Merci !"
        : "Pouvez-vous me confirmer la disponibilité pour ces dates ? Merci !";
    const lignesSejour = voitureSeule ? "" : `${ligneSejour}
👥 Voyageurs : ${guestsSelect.value} personnes
🎁 Options choisies : ${selectedAddonsList.length > 0 ? selectedAddonsList.join(", ") : "Aucune"}
`;
    const ligneVoitureWa = voiture ? `🚗 Voiture : ${voiture.vehicule.name}, ${DV.libelleFormule(voiture)}
🗓️ Du ${voiture.saisie.debutJour} ${voiture.saisie.debutHeure} au ${voiture.saisie.finJour} ${voiture.saisie.finHeure} (${voiture.devis.jours} jour${voiture.devis.jours > 1 ? "s" : ""}) : ${voiture.devis.ok ? formatFCFA(montantVoiture) : "à préciser"}
${voiture.devis.lieuPrise ? `📍 Prise en charge : ${voiture.devis.lieuPrise.nom}${voiture.devis.adressePrise ? ` — ${voiture.devis.adressePrise}` : ""}
` : ""}${voiture.devis.lieuRetour && voiture.devis.adresseRetour ? `📍 Retour : ${voiture.devis.lieuRetour.nom} — ${voiture.devis.adresseRetour}
` : ""}` : "";

    // Coordonnées saisies dans le récapitulatif : lignes omises si vides.
    const nom = nomInput ? nomInput.value.trim() : "";
    const tel = telInput ? telInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    // Même contrôle que POST /api/leads : une adresse mal formée ferait
    // rejeter TOUTE la demande (400). Elle reste dans le message WhatsApp,
    // mais n'est pas transmise à l'enregistrement.
    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const lignesContact = [nom ? `👤 Nom : ${nom}` : "", tel ? `📞 WhatsApp : ${tel}` : "", email ? `✉️ E-mail : ${email}` : ""]
      .filter(Boolean).map(ligne => `${ligne}\n`).join("");

    const message = `${entete}
━━━━━━━━━━━━━━━━━━━━━
${lignesContact}${lignesSejour}${ligneVoitureWa}💰 Estimation Totale : ${formatFCFA(grandTotal)} (${formatEUR(euroTotal)})
━━━━━━━━━━━━━━━━━━━━━
${cloture}`;

    submitBtn.href = `https://wa.me/2250767696318?text=${encodeURIComponent(message)}`;
    latestEstimate = {
      type: voitureSeule ? "location-voiture" : sansResidence ? "devis-activites" : "devis-whatsapp",
      name: nom,
      phone: tel,
      email: emailValide ? email : "",
      // Case d'accord présente (simulateur à jour) : choix explicite oui/non.
      ...(optinInput ? { whatsappOptIn: optinInput.checked } : {}),
      villa: voitureSeule ? "" : sansResidence ? "Activités uniquement" : selectedVilla.name,
      dates: voitureSeule && voiture
        ? `${voiture.saisie.debutJour} ${voiture.saisie.debutHeure} → ${voiture.saisie.finJour} ${voiture.saisie.finHeure}`
        : `${checkinInput.value} → ${checkoutInput.value}`,
      amount: grandTotal,
      message: voitureSeule ? "" : `${guestsSelect.value} voyageur(s) · ${selectedAddonsList.join(", ") || "Sans option"}`,
      source: "site",
      // Voiture jointe : le serveur recalcule son prix et crée sa réservation.
      ...(voiture && DV ? { location: DV.location() } : {})
    };
  }

  // Écouteurs d'événements
  checkinInput.addEventListener("change", () => {
    checkoutInput.min = checkinInput.value;
    if (!checkoutInput.value || checkoutInput.value <= checkinInput.value) {
      const nextDay = new Date(`${checkinInput.value}T12:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      checkoutInput.value = nextDay.toISOString().split("T")[0];
    }
  });

  // Les cases des activités sont générées dynamiquement : on les récupère
  // depuis `activityAddons` plutôt que par des identifiants figés.
  const champsSimulateur = [villaSelect, checkinInput, checkoutInput, guestsSelect, nomInput, telInput, emailInput, optinInput]
    .concat(activityAddons.map(a => a.input));

  champsSimulateur.forEach(el => {
    if (el) {
      el.addEventListener("change", calculateTotal);
      el.addEventListener("input", calculateTotal);
    }
  });

  // « Voir la fiche » : la saisie part dans l'onglet avant de quitter la page.
  // Délégation : le lien du véhicule est redessiné à chaque changement.
  document.addEventListener("click", event => {
    if (event.target.closest(".sim-fiche-lien")) memoriserSaisieDevis();
  });

  // Le changement de mode redessine le formulaire ET recalcule le total.
  modeRadios.forEach(radio => radio.addEventListener("change", () => {
    appliquerMode();
    calculateTotal();
  }));
  // Retour d'une fiche : dates, voyageurs, activités et coordonnées repris
  // avant le premier calcul, puis « reprise » retiré de l'adresse pour que
  // la page reste partageable.
  if (reprendreSaisieDevis()) {
    remplirVillas();
    appliquerMode();
    if (window.DevisVoiture) window.DevisVoiture.definirMode(modeActuel());
    const adresse = new URL(window.location.href);
    adresse.searchParams.delete("reprise");
    window.history.replaceState(null, "", adresse.pathname + adresse.search + adresse.hash);
  }
  appliquerMode();
  // Voiture choisie ou modifiée (js/devis-voiture.js) : total recalculé.
  document.addEventListener("dl:devis-voiture", calculateTotal);

  // Changement de filtre : on régénère la liste des résidences et on recalcule.
  if (villaFilter) {
    villaFilter.addEventListener("change", () => {
      remplirVillas();
      calculateTotal();
    });
  }

  /**
   * Nom et téléphone obligatoires (décision du propriétaire, 13/09/2026),
   * e-mail facultatif. Renvoie le premier champ en défaut, ou null.
   * Téléphone : au moins 8 chiffres, le minimum d'un numéro joignable.
   */
  const alerteContact = document.getElementById("simContactAlerte");
  function champContactEnDefaut() {
    const defauts = [
      { input: nomInput, ok: v => v.length > 0, cle: "js.contactNomRequis" },
      { input: telInput, ok: v => v.replace(/\D/g, "").length >= 8, cle: "js.contactTelRequis" }
    ].filter(c => c.input);
    defauts.forEach(c => c.input.removeAttribute("aria-invalid"));
    const enDefaut = defauts.find(c => !c.ok(c.input.value.trim())) || null;
    if (alerteContact) {
      alerteContact.hidden = !enDefaut;
      alerteContact.textContent = enDefaut ? T(enDefaut.cle) : "";
    }
    if (enDefaut) enDefaut.input.setAttribute("aria-invalid", "true");
    return enDefaut;
  }
  // L'alerte disparaît dès que le visiteur corrige le champ signalé.
  [nomInput, telInput].forEach(el => el?.addEventListener("input", () => {
    if (alerteContact && !alerteContact.hidden) champContactEnDefaut();
  }));

  submitBtn?.addEventListener("click", event => {
    // Recalcul au clic : un remplissage automatique du navigateur n'émet pas
    // toujours d'événement, le lien doit porter le nom et le téléphone affichés.
    // L'écouteur passe avant la navigation : le href mis à jour est bien suivi.
    calculateTotal();
    // Voiture incomplète ou indisponible : on reste sur la page pour corriger.
    if (window.DevisVoiture && window.DevisVoiture.verifier()) {
      event.preventDefault();
      return;
    }
    const enDefaut = champContactEnDefaut();
    if (enDefaut) {
      // Ni WhatsApp ni demande enregistrée sans coordonnées.
      event.preventDefault();
      enDefaut.input.focus();
      return;
    }
    if (!latestEstimate) return;
    const alerteEnvoi = document.getElementById("simEnvoiAlerte");
    if (alerteEnvoi) alerteEnvoi.hidden = true;
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(latestEstimate),
      keepalive: true
    }).then(async reponse => {
      // Refus explicite du site (voiture devenue indisponible entre-temps…) :
      // le visiteur le voit en revenant sur l'onglet.
      if (reponse.ok || !alerteEnvoi || (reponse.status !== 409 && reponse.status !== 422)) return;
      const corps = await reponse.json().catch(() => ({}));
      if (!corps.error) return;
      alerteEnvoi.textContent = `${T("js.demandeRefusee")} ${corps.error}`;
      alerteEnvoi.hidden = false;
    }).catch(() => {});
  });

  // Calcul initial
  calculateTotal();
}

/* ==========================================================================
   8. Barre de Recherche Rapide dans le Hero
   ========================================================================== */
function initHeroSearch() {
  const heroBtn = document.getElementById("heroSearchBtn");
  const heroCategory = document.getElementById("heroCategory");

  if (heroBtn && heroCategory) {
    heroBtn.addEventListener("click", () => {
      const selected = heroCategory.value;
      const targetGrid = document.getElementById("villasGrid");
      if (!targetGrid) {
        // Redirection vers la page catalogue avec le filtre choisi
        window.location.href = `residences.html?cat=${encodeURIComponent(selected)}`;
        return;
      }

      const tabToActivate = document.querySelector(`.filter-btn[data-category="${selected}"]`);
      if (tabToActivate) {
        tabToActivate.click();
      } else {
        renderVillas(selected);
      }

      const targetSection = document.getElementById("residences");
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
}

/* ==========================================================================
   9. Barre de Recherche Multi-Critères Elevate Estates
   ========================================================================== */

/*
 * Critères de la recherche multicritère — UNE seule règle pour les villas et
 * pour les publications Facebook dotées d'une fiche (js/catalogue.js).
 *
 * Corrigé le 13/09/2026, vérifié sur les fiches en ligne :
 *  · « Emplacement » comparait la CATÉGORIE, alors que l'emplacement est le
 *    CADRE (champ « environment » du studio) : la villa « bordure de mer &
 *    lagune » n'apparaissait ni sous Lagune ni sous Océan de façon fiable.
 *  · « Voyageurs » exigeait le HAUT de la tranche : « 2 à 6 personnes »
 *    écartait la seule résidence pour 4, « 8 à 12 » écartait les villas pour
 *    8 et 10, « 12+ » écartait celle pour 12. La capacité doit désormais être
 *    DANS la tranche (décision du propriétaire).
 * Catégorie et budget gardent leur règle d'origine.
 *
 * Un critère non renseigné sur le bien (publication sans fiche complète)
 * ne répond jamais à un critère actif : on ne montre pas ce qu'on ignore.
 */
/*
 * Référentiels administrables (studio → Référentiels), servis par
 * /api/content. Le serveur fournit déjà les textes français (adresse, badge,
 * libellé de catégorie) ; ces fonctions n'ajoutent que la langue affichée.
 * Sans référentiels (site servi en mode statique), les textes d'origine et
 * le HTML de la page restent affichés tels quels.
 */
function referentielsSite() {
  return (window.DL_MANAGED_CONTENT && window.DL_MANAGED_CONTENT.referentiels) || null;
}

function libelleReferentiel(type, id, repli = "") {
  const refs = referentielsSite();
  if (!refs || !id) return repli;
  const entree = (refs[type] || []).find(item => item.id === String(id));
  if (!entree) return repli;
  if (entree.nom !== undefined) return entree.nom;
  const langue = typeof I18N !== "undefined" ? I18N.langue() : "fr";
  return (entree.libelle && (entree.libelle[langue] || entree.libelle.fr)) || repli;
}

/*
 * Cadre = lieu, catégorie = thème (décision du 13/09/2026).
 * Les onglets et liens « lagune », « ocean » et « piscine » existent toujours
 * sur le site, mais ce ne sont plus des catégories : lagune et océan se lisent
 * dans le CADRE, piscine dans les ÉQUIPEMENTS. Mêmes codes que
 * CATEGORIES_RESERVEES (db/referentiels.js).
 */
/** Anciens liens « ?cat=lagune » : réécrits en « ?location=lagune ». */
function normaliserAdresseRecherche() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (!CATEGORIES_LIEU.includes(cat)) return;
  params.delete("cat");
  if (!params.get("location") || params.get("location") === "all") params.set("location", cat);
  history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
}

/** Thèmes proposés sur le site : catégories actives, dans l'ordre du studio. */
function categoriesDuSite() {
  const refs = referentielsSite();
  return refs ? (refs.categories || []).filter(item => item.actif !== false && !CRITERES_HORS_THEME.includes(item.id)) : null;
}

/**
 * Onglets de residences.html et menu « Type » : les choix fixes du HTML
 * (toutes, lagune, océan, piscine — traduits par js/i18n.js) puis les
 * thèmes du référentiel.
 */
function rendreChoixCategories() {
  const categories = categoriesDuSite();
  if (!categories) return;
  const rangee = document.querySelector(".filter-btn[data-category]")?.parentElement;
  if (rangee) {
    rangee.querySelectorAll(".filter-btn[data-category]").forEach(bouton => {
      if (bouton.dataset.category !== "all" && !CRITERES_HORS_THEME.includes(bouton.dataset.category)) bouton.remove();
    });
    rangee.insertAdjacentHTML("beforeend", categories.map(categorie =>
      `<button class="filter-btn" data-category="${escapeAttribute(categorie.id)}">${escapeHTMLText(libelleReferentiel("categories", categorie.id))}</button>`).join(""));
  }
  const menuType = document.getElementById("searchType");
  if (menuType) {
    const choisie = menuType.value;
    menuType.querySelectorAll('option:not([value="all"]):not([value="piscine"])').forEach(option => option.remove());
    menuType.insertAdjacentHTML("beforeend", categories.map(categorie =>
      `<option value="${escapeAttribute(categorie.id)}">${escapeHTMLText(libelleReferentiel("categories", categorie.id))}</option>`).join(""));
    menuType.value = [...menuType.options].some(option => option.value === choisie) ? choisie : "all";
  }
}

/**
 * Villes proposées dans un menu « Localisation » : celles du référentiel,
 * actives, dans l'ordre du studio, qui ont AU MOINS UNE annonce parmi `biens`.
 * Même principe que le filtre du simulateur : un choix qui ne mène à rien
 * n'est pas proposé. La ville déjà choisie (lien partagé) reste toujours
 * présente, pour que le menu reflète fidèlement la recherche en cours.
 */
function remplirMenuLocalisations(menu, biens) {
  const refs = referentielsSite();
  if (!menu || !refs) return;
  // Premier remplissage : la ville vient de l'adresse (le menu vaut encore
  // « all ») ; ensuite, c'est le choix courant du visiteur qui fait foi.
  const choisie = menu.dataset.rempli
    ? menu.value
    : (new URLSearchParams(window.location.search).get("ville") || menu.value || "all");
  menu.dataset.rempli = "1";
  const utilisees = new Set(biens.map(bien => bien && bien.localisationId).filter(Boolean));
  const villes = (refs.localisations || []).filter(ville =>
    (ville.actif !== false && utilisees.has(ville.id)) || ville.id === choisie);
  menu.querySelectorAll('option:not([value="all"])').forEach(option => option.remove());
  menu.insertAdjacentHTML("beforeend", villes.map(ville =>
    `<option value="${escapeAttribute(ville.id)}">${escapeHTMLText(ville.nom)}</option>`).join(""));
  menu.value = [...menu.options].some(option => option.value === choisie) ? choisie : "all";
}

function rendreChoixLocalisations() {
  // Barre de recherche (accueil, résidences) : villas et publications, qui
  // sont filtrées ensemble sur la page des résidences.
  const publications = ((window.DL_MANAGED_CONTENT && window.DL_MANAGED_CONTENT.facebookPosts) || [])
    .map(post => post && post.fiche).filter(Boolean);
  remplirMenuLocalisations(document.getElementById("searchVille"), [...VILLAS_DATA, ...publications]);
  // Page Terrains : terrains encore en vente.
  remplirMenuLocalisations(document.getElementById("terrainVilleFilter"), visibleTerrains());
}

const TRANCHES_VOYAGEURS = { "2-6": [2, 6], "8-12": [8, 12], "12+": [12, Infinity] };
// « piscine » n'est plus un cadre depuis le 13/09/2026 (équipement).
const CADRES_VILLA = ["mer-lagune", "ocean", "lagune", "terre"];
// Critères de lieu (cadre) et de piscine (équipement) : jamais des thèmes.
const CATEGORIES_LIEU = ["lagune", "ocean"];
const CRITERES_HORS_THEME = ["lagune", "ocean", "piscine"];

/** Cadre d'une villa, avec repli sur la catégorie pour les fiches anciennes. */
function cadreVilla(villa) {
  if (CADRES_VILLA.indexOf(villa.environment) !== -1) return villa.environment;
  if (villa.category === "lagune") return "lagune";
  if (villa.category === "ocean") return "ocean";
  return "terre";
}

/** Critères présents dans l'adresse ; « all » quand ils sont absents. */
function lireCriteresRecherche(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    cat: params.get("cat") || "all",
    ville: params.get("ville") || "all",
    location: params.get("location") || "all",
    budget: params.get("budget") || "all",
    guests: params.get("guests") || "all",
    // Critères avancés (panneau « Plus de critères ») : codes d'équipements
    // séparés par des virgules, nombre minimum de chambres.
    equip: params.get("equip") || "all",
    chambres: params.get("chambres") || "all"
  };
}

/**
 * Vrai quand la page a été ouverte par le formulaire multicritère de
 * l'accueil, qui transmet toujours emplacement, budget et voyageurs. Les
 * liens de catégorie (`residences.html?cat=lagune`) restent une simple
 * navigation : ils ne filtrent pas les publications.
 */
function rechercheMulticritereActive(search = window.location.search, barreSurLaPage = barreDeRecherchePresente()) {
  const params = new URLSearchParams(search);
  if (["location", "budget", "guests", "ville", "equip", "chambres"].some(cle => params.has(cle))) return true;
  // Page qui affiche elle-même la barre (residences.html) : la catégorie y
  // est visible comme critère « Type », elle filtre donc tout le catalogue,
  // publications comprises. Sans barre, un lien ?cat= reste une navigation.
  return barreSurLaPage && (params.get("cat") || "all") !== "all";
}

/** Vrai quand la page porte la barre de recherche ET un catalogue filtrable. */
function barreDeRecherchePresente() {
  return typeof document !== "undefined"
    && Boolean(document.getElementById("rechercheCatalogue") && document.getElementById("catalogSection"));
}

/**
 * Le bien répond-il aux critères ?
 * `bien` : { category, environment, pricePerNight, capacity, features }.
 * `cadreDe` : lecture du cadre — cadreVilla pour une villa, le champ brut
 * pour une publication, qui n'a pas d'ancienne catégorie de repli.
 */
function correspondRecherche(bien, criteres, cadreDe = b => b.environment || "") {
  const cat = criteres.cat || "all";
  const ville = criteres.ville || "all";
  const location = criteres.location || "all";
  const budget = criteres.budget || "all";
  const guests = criteres.guests || "all";

  const features = Array.isArray(bien.features) ? bien.features : [];
  // Piscine : le mot dans les détails (règle d'origine) ou la case
  // « Piscine » cochée dans le studio (référentiel des équipements).
  const hasPool = features.some(feature => String(feature).toLowerCase().includes("piscine"))
    || (Array.isArray(bien.equipements) && bien.equipements.includes("piscine"));

  const cadre = cadreDe(bien);
  const auBordDe = lieu => (lieu === "lagune" && (cadre === "lagune" || cadre === "mer-lagune"))
    || (lieu === "ocean" && (cadre === "ocean" || cadre === "mer-lagune"));
  // Catégorie = thème. « lagune », « ocean » (cadre) et « piscine »
  // (équipement) restent acceptés comme critères : onglets et anciens liens.
  const matchesCategory = cat === "all" || bien.category === cat
    || (cat === "piscine" && hasPool) || (CATEGORIES_LIEU.includes(cat) && auBordDe(cat));

  const matchesLocation = location === "all" || auBordDe(location);

  const prix = bien.pricePerNight;
  const prixConnu = typeof prix === "number" && Number.isFinite(prix);
  const matchesBudget = budget === "all"
    || (prixConnu && (budget === "eco" ? prix <= 250000 : prix >= 250000));

  const tranche = TRANCHES_VOYAGEURS[guests];
  const capacite = bien.capacity;
  const matchesGuests = !tranche
    || (typeof capacite === "number" && capacite >= tranche[0] && capacite <= tranche[1]);

  // Localisation (ville du référentiel) : un bien non rattaché ne répond pas.
  const matchesVille = ville === "all" || bien.localisationId === ville;

  // Équipements : TOUS ceux demandés doivent être cochés sur le bien.
  const demandes = !criteres.equip || criteres.equip === "all" ? [] : String(criteres.equip).split(",").filter(Boolean);
  const coches = Array.isArray(bien.equipements) ? bien.equipements : [];
  const matchesEquipements = demandes.every(code => coches.includes(code));

  // Chambres : au moins le nombre demandé ; nombre inconnu → non retenu.
  const minimumChambres = Number(criteres.chambres);
  const matchesChambres = !criteres.chambres || criteres.chambres === "all"
    || (typeof bien.bedrooms === "number" && Number.isFinite(minimumChambres) && bien.bedrooms >= minimumChambres);

  return matchesCategory && matchesVille && matchesLocation && matchesBudget && matchesGuests
    && matchesEquipements && matchesChambres;
}

/** Libellés des critères actifs, tels qu'affichés dans le formulaire. */
function libellesCriteresRecherche(criteres) {
  const LIBELLES = {
    cat: { lagune: "t.villas-lagune", ocean: "t.villas-ocean", piscine: "t.avec-piscine-privee",
      evenement: "t.grands-groupes-evenements", romantique: "t.escapades-en-amoureux" },
    location: { lagune: "t.bord-de-lagune", ocean: "t.bord-d-ocean" },
    budget: { eco: "t.budget-eco", luxe: "t.budget-luxe" },
    guests: { "2-6": "t.voyageurs-2-6", "8-12": "t.voyageurs-8-12", "12+": "t.voyageurs-12" }
  };
  return ["ville", "location", "cat", "budget", "guests", "equip", "chambres"]
    .map(cle => {
      if (cle === "equip") {
        return criteres.equip && criteres.equip !== "all"
          ? String(criteres.equip).split(",").filter(Boolean).map(code => libelleReferentiel("equipements", code, code)).join(", ")
          : "";
      }
      if (cle === "chambres") {
        return criteres.chambres && criteres.chambres !== "all" ? `${criteres.chambres}+ ch.` : "";
      }
      if (cle === "ville") {
        return criteres.ville && criteres.ville !== "all" ? libelleReferentiel("localisations", criteres.ville, criteres.ville) : "";
      }
      // Catégorie administrable : libellé du référentiel, dans la langue affichée.
      if (cle === "cat" && criteres.cat && criteres.cat !== "all" && !CRITERES_HORS_THEME.includes(criteres.cat) && categoriesDuSite()) {
        return libelleReferentiel("categories", criteres.cat);
      }
      const clef = (LIBELLES[cle] || {})[criteres[cle]];
      return clef ? T(clef) : "";
    })
    .filter(Boolean);
}

/*
 * Barre de recherche multicritère, deux usages :
 *  · accueil : « Rechercher » ouvre residences.html avec les critères ;
 *  · residences.html (#rechercheCatalogue) : chaque choix filtre aussitôt
 *    villas et publications, l'adresse de la page garde la recherche (lien
 *    partageable, retour arrière), « Rechercher » amène aux résultats.
 */
const CHAMPS_RECHERCHE = { cat: "searchType", ville: "searchVille", location: "searchLocation", budget: "searchBudget", guests: "searchGuests", chambres: "searchChambres" };

function valeursBarreRecherche() {
  const valeurs = Object.fromEntries(Object.entries(CHAMPS_RECHERCHE).map(([cle, id]) => {
    const menu = document.getElementById(id);
    return [cle, menu ? menu.value : "all"];
  }));
  const equipements = [...document.querySelectorAll("#rechercheEquipements input:checked")].map(caseACocher => caseACocher.value);
  valeurs.equip = equipements.length ? equipements.join(",") : "all";
  return valeurs;
}

function initMultiFieldSearch() {
  const searchBtn = document.getElementById("btnSearchProperties");
  if (!searchBtn) return;

  const surLeCatalogue = barreDeRecherchePresente();
  const boutonEffacer = document.getElementById("btnEffacerRecherche");
  const depart = lireCriteresRecherche();

  const lancerDepuisAccueil = () => {
    const params = new URLSearchParams(valeursBarreRecherche());
    window.location.href = `residences.html?${params.toString()}`;
  };

  // Menus préremplis depuis l'adresse (recherche lancée depuis l'accueil,
  // lien partagé, retour arrière).
  Object.entries(CHAMPS_RECHERCHE).forEach(([cle, id]) => {
    const menu = document.getElementById(id);
    if (menu && [...menu.options].some(option => option.value === depart[cle])) menu.value = depart[cle];
  });

  // Barre compacte : un choix long peut être tronqué à l'écran. L'infobulle
  // en donne toujours le texte complet.
  const majInfobulles = () => Object.values(CHAMPS_RECHERCHE).forEach(id => {
    const menu = document.getElementById(id);
    if (menu && menu.selectedOptions[0]) menu.title = menu.selectedOptions[0].textContent.trim();
  });
  Object.values(CHAMPS_RECHERCHE).forEach(id => document.getElementById(id)?.addEventListener("change", majInfobulles));
  document.addEventListener("dl:langue", majInfobulles);
  majInfobulles();

  const majBoutonEffacer = () => {
    if (boutonEffacer) boutonEffacer.hidden = Object.values(valeursBarreRecherche()).every(valeur => valeur === "all");
  };

  const appliquer = () => {
    const valeurs = valeursBarreRecherche();
    // Seuls les critères choisis figurent dans l'adresse : sans critère, la
    // page redevient residences.html tout court.
    const params = new URLSearchParams(Object.entries(valeurs).filter(([, valeur]) => valeur !== "all"));
    const requete = params.toString();
    history.replaceState(null, "", `${window.location.pathname}${requete ? `?${requete}` : ""}`);
    renderVillas(valeurs.cat);
    majBoutonEffacer();
  };

  const allerAuxResultats = () => {
    const resultats = document.querySelector("#catalogSection .catalogue-barre") || document.getElementById("villasGrid");
    resultats?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const avancee = initRechercheAvancee({
    depart,
    auChangement: surLeCatalogue ? appliquer : () => {},
    auValider: surLeCatalogue ? allerAuxResultats : lancerDepuisAccueil
  });

  if (!surLeCatalogue) {
    searchBtn.addEventListener("click", event => {
      event.preventDefault();
      lancerDepuisAccueil();
    });
    return;
  }

  // ---- Page des résidences : chaque choix filtre aussitôt ----
  Object.values(CHAMPS_RECHERCHE).forEach(id => {
    document.getElementById(id)?.addEventListener("change", appliquer);
  });

  searchBtn.addEventListener("click", event => {
    event.preventDefault();
    avancee.fermer(false);
    appliquer();
    allerAuxResultats();
  });

  boutonEffacer?.addEventListener("click", () => {
    Object.values(CHAMPS_RECHERCHE).forEach(id => {
      const menu = document.getElementById(id);
      if (menu) menu.value = "all";
    });
    avancee.vider();
    appliquer();
    document.getElementById("searchVille")?.focus();
  });

  majBoutonEffacer();
}

/**
 * Panneau « Plus de critères » ouvert par l'icône de réglages (demande du
 * 13/09/2026 : l'icône renvoyait simplement vers la page des résidences).
 * Équipements tirés du référentiel — seulement ceux que possède au moins une
 * annonce, comme pour les localisations — et nombre minimum de chambres.
 * Le panneau s'insère dans la carte de recherche (pas en surimpression) :
 * il pousse le contenu au lieu de le masquer, y compris sur téléphone.
 */
function initRechercheAvancee({ depart, auChangement, auValider }) {
  const bouton = document.getElementById("btnRechercheAvancee");
  const panneau = document.getElementById("rechercheAvancee");
  const inerte = { fermer() {}, vider() {} };
  if (!bouton || !panneau) return inerte;

  const hoteCases = document.getElementById("rechercheEquipements");
  const menuChambres = document.getElementById("searchChambres");
  const compte = document.getElementById("rechercheAvanceeCompte");

  // ---- Équipements proposés ----
  const refs = referentielsSite();
  const publications = ((window.DL_MANAGED_CONTENT && window.DL_MANAGED_CONTENT.facebookPosts) || [])
    .map(post => post && post.fiche).filter(Boolean);
  const utilises = new Set([...VILLAS_DATA, ...publications].flatMap(bien => (Array.isArray(bien.equipements) ? bien.equipements : [])));
  const demandes = depart.equip && depart.equip !== "all" ? String(depart.equip).split(",") : [];
  const equipements = ((refs && refs.equipements) || [])
    .filter(entree => (entree.actif !== false && utilises.has(entree.id)) || demandes.includes(entree.id));
  const groupeEquipements = hoteCases?.closest(".recherche-avancee-groupe");
  if (hoteCases) {
    hoteCases.innerHTML = equipements.map(entree => `<label class="recherche-avancee-case"><input type="checkbox" value="${escapeAttribute(entree.id)}" ${demandes.includes(entree.id) ? "checked" : ""}><span>${escapeHTMLText(libelleReferentiel("equipements", entree.id))}</span></label>`).join("");
  }
  // Aucun équipement renseigné sur les annonces : le groupe n'a rien à proposer.
  if (groupeEquipements) groupeEquipements.hidden = !equipements.length;
  // Changement de langue en cours de visite : les pastilles, écrites une
  // seule fois ici, reprennent le libellé traduit du référentiel. Seul le
  // texte change ; les cases cochées restent cochées.
  document.addEventListener("dl:langue", () => {
    hoteCases?.querySelectorAll(".recherche-avancee-case").forEach(pastille => {
      const caseACocher = pastille.querySelector("input");
      const texte = pastille.querySelector("span");
      if (caseACocher && texte) texte.textContent = libelleReferentiel("equipements", caseACocher.value, texte.textContent);
    });
  });

  const nombreActifs = () => document.querySelectorAll("#rechercheEquipements input:checked").length
    + (menuChambres && menuChambres.value !== "all" ? 1 : 0);
  const majCompte = () => {
    const n = nombreActifs();
    if (!compte) return;
    compte.hidden = !n;
    compte.textContent = String(n);
    bouton.classList.toggle("est-actif", Boolean(n));
  };

  const estOuvert = () => !panneau.hidden;
  const ouvrir = () => {
    panneau.hidden = false;
    bouton.setAttribute("aria-expanded", "true");
    (panneau.querySelector("input, select") || panneau.querySelector("button"))?.focus();
  };
  const fermer = (rendreLeFocus = true) => {
    if (!estOuvert()) return;
    panneau.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
    if (rendreLeFocus) bouton.focus();
  };

  bouton.addEventListener("click", () => (estOuvert() ? fermer() : ouvrir()));
  document.getElementById("rechercheAvanceeFermer")?.addEventListener("click", () => fermer());
  panneau.addEventListener("keydown", event => { if (event.key === "Escape") fermer(); });

  const changement = () => { majCompte(); auChangement(); };
  hoteCases?.addEventListener("change", changement);
  menuChambres?.addEventListener("change", majCompte);

  const vider = () => {
    document.querySelectorAll("#rechercheEquipements input:checked").forEach(caseACocher => { caseACocher.checked = false; });
    if (menuChambres) menuChambres.value = "all";
    majCompte();
  };
  document.getElementById("rechercheAvanceeEffacer")?.addEventListener("click", () => { vider(); auChangement(); });
  document.getElementById("rechercheAvanceeValider")?.addEventListener("click", () => { fermer(false); auValider(); });

  majCompte();
  return { fermer, vider };
}

/* ==========================================================================
   10. Bouton Visite Virtuelle / Vidéo
   ========================================================================== */
function initPlayButton() {
  const playBtn = document.querySelector(".btn-play-video");
  if (!playBtn) return;

  playBtn.addEventListener("click", () => {
    // Ouvrir le modal sur la première villa vedette pour découvrir les détails
    if (typeof VILLAS_DATA !== "undefined" && VILLAS_DATA.length > 0) {
      openVillaModal(VILLAS_DATA[0].id);
    }
  });
}

/* ==========================================================================
   11. Animations de Transition de Sections & Scroll Reveal
   ========================================================================== */
function initScrollReveal() {
  const elements = document.querySelectorAll(
    "section:not(.hero-section), .property-card, .activity-card, .highlight-card, " +
    ".category-quick-item, .contact-card, .faq-item, .testimonial-split-card, .experience-grid"
  );
  if (!elements.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("motion-ready", !reduceMotion);

  elements.forEach(el => {
    if (!el.classList.contains("reveal-item")) {
      el.classList.add("reveal-item");
    }
    el.classList.add("motion-reveal");
    el.querySelectorAll("h2, h3, .section-title").forEach(title => title.classList.add("motion-title"));
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    elements.forEach(el => el.classList.add("is-visible", "is-inview"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible", "is-inview");
        obs.unobserve(entry.target);
      }
    });
  }, {
    // Seuil à 0 : il suffit qu'un pixel entre dans le cadre.
    //
    // Un seuil en pourcentage est un piège pour les blocs plus hauts que
    // l'écran. Constaté le 12/09/2026 : #catalogSection, devenu le catalogue
    // unifié, mesurait 20 238 px. Les 8 % exigés représentaient 1 619 px à
    // l'écran, impossibles à atteindre sur un viewport de 598 px — la section
    // restait donc à opacity 0 indéfiniment, et la page paraissait blanche.
    threshold: 0,
    rootMargin: "0px 0px -30px 0px"
  });

  elements.forEach(el => {
    if (!el.classList.contains("is-visible")) {
      observer.observe(el);
    }
  });
}

/* ==========================================================================
   Bandeau de marque en parallaxe (accueil)
   ========================================================================== */
/**
 * Fait glisser la photo du bandeau plus lentement que la page.
 *
 * Le cadre est plus court que l'image (voir css/refonte.css) : la différence
 * est la course disponible. On la parcourt en fonction de la progression de la
 * section dans la fenêtre, du haut vers le bas.
 *
 * Pourquoi en JavaScript plutôt qu'en CSS : `background-attachment: fixed` est
 * ignoré par Safari iOS, et une couche `position: fixed` se retrouve ancrée à
 * la section dès que celle-ci porte un `clip-path`. Une translation mesurée
 * fonctionne partout, y compris sur mobile.
 */
function initBandeauParallaxe() {
  const section = document.querySelector(".bandeau-parallaxe");
  if (!section) return;
  const image = section.querySelector(".bandeau-parallaxe-image");
  if (!image) return;

  // Respecte le réglage système : aucune animation imposée à qui n'en veut pas.
  const sansMouvement = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enAttente = false;

  function placer() {
    enAttente = false;
    if (sansMouvement.matches) { image.style.transform = ""; return; }

    const cadre = section.getBoundingClientRect();
    const course = image.offsetHeight - section.offsetHeight;
    if (course <= 0) { image.style.transform = ""; return; }

    // 0 quand la section arrive par le bas de la fenêtre, 1 quand elle en sort
    // par le haut. On borne pour que l'image ne sorte jamais de son cadre.
    const progression = (window.innerHeight - cadre.top) / (window.innerHeight + cadre.height);
    const borne = Math.min(1, Math.max(0, progression));
    // Au fil de la descente, la photo descend dans son cadre : elle défile
    // ainsi plus lentement que le texte, sans découvrir de bord vide.
    image.style.transform = `translate3d(0, ${-course * (1 - borne)}px, 0)`;
  }

  function planifier() {
    if (enAttente) return;
    enAttente = true;
    window.requestAnimationFrame(placer);
  }

  window.addEventListener("scroll", planifier, { passive: true });
  window.addEventListener("resize", planifier);
  sansMouvement.addEventListener("change", planifier);
  if ("ResizeObserver" in window) new ResizeObserver(planifier).observe(section);
  // L'image est en chargement différé : sa hauteur n'est connue qu'une fois
  // reçue, d'où ce recalcul.
  if (image.complete) placer(); else image.addEventListener("load", placer);
  placer();
}

/* ==========================================================================
   12. Mot Animé Dynamique dans le Titre Hero (Textes Animés)
   ========================================================================== */
function initAnimatedHeroWord() {
  const wordEl = document.querySelector(".hero-animated-word");
  if (!wordEl) return;

  const words = T("js.motsHero").split("|");
  let currentIndex = 0;

  setInterval(() => {
    wordEl.classList.add("anim-out");
    setTimeout(() => {
      currentIndex = (currentIndex + 1) % words.length;
      wordEl.textContent = words[currentIndex];
      wordEl.classList.remove("anim-out");
      wordEl.classList.add("anim-in");
      requestAnimationFrame(() => {
        setTimeout(() => {
          wordEl.classList.remove("anim-in");
        }, 40);
      });
    }, 400);
  }, 3200);
}

/* ==========================================================================
   13. Compteurs Numériques de Statistiques Animés (Textes Animés)
   ========================================================================== */
function initAnimatedCounters() {
  const counters = document.querySelectorAll(".stat-number, .experience-badge-number");
  if (!counters.length) return;

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = "true";
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.25 });

  counters.forEach(c => observer.observe(c));
}

function animateCounter(el) {
  const originalText = el.textContent.trim();
  const target = parseInt(originalText.replace(/[^0-9]/g, ""), 10);
  if (isNaN(target)) return;

  const hasPercent = originalText.includes("%");
  const hasPlus = originalText.includes("+");
  const duration = 1600;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.floor(easeOut * target);

    let displayStr = currentVal.toLocaleString("fr-FR");
    if (hasPercent) displayStr += "%";
    if (hasPlus) displayStr += "+";

    el.textContent = displayStr;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = originalText;
    }
  }

  requestAnimationFrame(update);
}

/* ========================================================================== 
   14. Interactions statiques accessibles
   ========================================================================== */
function initAccessibleStaticInteractions() {
  document.querySelectorAll(".category-quick-item[onclick]").forEach(item => {
    item.setAttribute("role", "link");
    item.setAttribute("tabindex", "0");
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        item.click();
      }
    });
  });

  document.querySelectorAll("button:not([type])").forEach(button => button.setAttribute("type", "button"));
}
