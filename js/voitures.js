/**
 * Page « Location de voitures » (demande du 17/09/2026).
 *
 * Catalogue filtrable, fiche du véhicule, simulateur en direct et demande de
 * réservation. Les tarifs viennent de js/location-voitures.js (le serveur
 * recalcule la même estimation) ; la demande arrive dans « Demandes » et
 * dans le planning du studio, où la conciergerie la confirme.
 *
 * Heures : toujours celles d'Abidjan (UTC+0), quel que soit le fuseau du
 * visiteur — un touriste qui réserve depuis Paris saisit l'heure locale
 * d'arrivée.
 */
(function () {
  "use strict";

  const LV = window.LocationVoitures;
  const WHATSAPP = "2250767696318";
  if (!LV) return;

  const TEXTES = {
    fr: {
      toutes: "Toutes", categorie: "Catégorie", conduite: "Conduite", tousModes: "Avec ou sans chauffeur", avecChauffeur: "Avec chauffeur", sansChauffeur: "Sans chauffeur",
      boite: "Boîte", toutesBoites: "Toutes", places: "Places", placesMin: n => `${n} places et +`, tousPlaces: "Toutes", trier: "Trier", prixCroissant: "Prix croissant", prixDecroissant: "Prix décroissant", plusDePlaces: "Plus de places",
      compte: n => `${n} véhicule${n > 1 ? "s" : ""}`, aucun: "Aucun véhicule ne correspond à ces critères.", vide: "Notre flotte sera bientôt en ligne. Contactez-nous sur WhatsApp pour vos besoins de véhicule.",
      aPartirDe: "À partir de", parJour: "/ jour", surDemande: "Tarif sur demande", voir: "Voir et réserver", placesN: n => `${n} places`, clim: "Climatisation", bagages: n => `${n} bagage${n > 1 ? "s" : ""}`, portes: n => `${n} portes`,
      fermer: "Fermer", photo: (i, n) => `Photo ${i} sur ${n}`, formule: "Formule", tarifs: "Tarifs", tarifJour: "1 à 6 jours", tarifSemaine: "7 à 29 jours", tarifMois: "30 jours et plus", chauffeurJour: "Chauffeur, par jour", inclus: "compris",
      caution: "Caution (restituée)", km: "Kilométrage", kmIllimite: "Illimité", kmInclus: (n, prix) => `${n} km inclus par jour, puis ${prix} / km`, minJours: n => `Location minimale : ${n} jour${n > 1 ? "s" : ""}`,
      conducteur: (age, annees) => `Conducteur : ${age} ans minimum, permis depuis ${annees} an${annees > 1 ? "s" : ""}`, equipements: "Équipements", description: "Description", conditions: "Conditions de location",
      modeAvec: "Toujours conduit par notre chauffeur, sans caution.", modeSans: "Vous conduisez : caution à la remise du véhicule.", modeChoix: "Au choix : avec notre chauffeur (supplément par jour) ou vous conduisez (caution).",
      reserver: "Estimer et réserver", priseEnCharge: "Prise en charge", retour: "Retour", date: "Date", heure: "Heure", heureAbidjan: "Heures d’Abidjan (GMT)", lieuPrise: "Lieu de prise en charge", lieuRetour: "Lieu de retour", sansFrais: "sans frais", aPreciser: "À préciser", adresses: { domicile: "Adresse du domicile (quartier, rue, repère)", bureau: "Adresse du bureau (quartier, rue, repère)", autre: "Lieu à préciser" },
      chauffeurChoix: "Je souhaite un chauffeur", chauffeurImpose: "Avec chauffeur (compris dans la formule)", chauffeurExclu: "Sans chauffeur : vous conduisez", options: "Options", parLocation: "/ location",
      estimation: "Estimation", ligneVehicule: (j, prix) => `Véhicule · ${j} j × ${prix}`, ligneChauffeur: (j, prix) => `Chauffeur · ${j} j × ${prix}`, livraison: "Livraison", reprise: "Reprise", total: "Total estimé", cautionRemise: "Caution à la remise (restituée)",
      palier: { jour: "tarif jour", semaine: "tarif semaine", mois: "tarif mois" }, jours: n => `${n} jour${n > 1 ? "s" : ""}`,
      dejaReserve: "Dates déjà réservées", toutLibre: "Aucune réservation à venir sur ce véhicule.", occupe: "Ce véhicule n’est pas disponible sur ces dates. Choisissez d’autres dates.",
      coordonnees: "Vos coordonnées", nom: "Nom et prénom", telephone: "Téléphone (WhatsApp)", email: "E-mail (facultatif)", message: "Message (facultatif)", messageAide: "Vol d’arrivée, adresse de livraison…",
      attestation: (age, annees) => `J’ai au moins ${age} ans et mon permis de conduire depuis au moins ${annees} an${annees > 1 ? "s" : ""}.`,
      envoyer: "Envoyer ma demande", envoi: "Envoi…", merciTitre: "Demande envoyée", merciTexte: "Notre conciergerie vérifie la disponibilité et vous confirme sur WhatsApp, avec les modalités de paiement et de remise du véhicule. Rien n’est payé en ligne.",
      suivreWa: "Continuer sur WhatsApp", erreur: "Envoi impossible pour le moment. Réessayez ou contactez-nous sur WhatsApp.", requis: "Indiquez votre nom et un numéro de téléphone joignable.", attestationRequise: "Cochez la case sur l’âge et le permis du conducteur.",
      aucuneDemandeEnLigne: "Rien n’est payé en ligne : la conciergerie confirme votre réservation.",
      erreurs: { adresse: "Précisez l’adresse de prise en charge et de retour.", dates: "Indiquez la date et l’heure de prise en charge et de retour.", ordre: "Le retour doit suivre la prise en charge.", delai: h => `Réservez au moins ${h} h à l’avance.`, duree: n => `Location limitée à ${n} jours : contactez-nous pour une longue durée.`,
        minimum: n => `Location minimale : ${n} jour${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Prise en charge et retour entre ${a} et ${b}.`, lieu: "Choisissez le lieu de prise en charge et de retour.", tarif: "Tarif sur demande : contactez-nous sur WhatsApp." },
      waIntro: "Bonjour Henri & Philippe, je viens d’envoyer une demande de location :"
    },
    en: {
      toutes: "All", categorie: "Category", conduite: "Driving", tousModes: "With or without driver", avecChauffeur: "With driver", sansChauffeur: "Self-drive",
      boite: "Gearbox", toutesBoites: "All", places: "Seats", placesMin: n => `${n}+ seats`, tousPlaces: "All", trier: "Sort", prixCroissant: "Price: low to high", prixDecroissant: "Price: high to low", plusDePlaces: "Most seats",
      compte: n => `${n} vehicle${n > 1 ? "s" : ""}`, aucun: "No vehicle matches these filters.", vide: "Our fleet will be online soon. Contact us on WhatsApp for your vehicle needs.",
      aPartirDe: "From", parJour: "/ day", surDemande: "Price on request", voir: "View and book", placesN: n => `${n} seats`, clim: "Air conditioning", bagages: n => `${n} bag${n > 1 ? "s" : ""}`, portes: n => `${n} doors`,
      fermer: "Close", photo: (i, n) => `Photo ${i} of ${n}`, formule: "Rental type", tarifs: "Rates", tarifJour: "1 to 6 days", tarifSemaine: "7 to 29 days", tarifMois: "30 days or more", chauffeurJour: "Driver, per day", inclus: "included",
      caution: "Deposit (refundable)", km: "Mileage", kmIllimite: "Unlimited", kmInclus: (n, prix) => `${n} km per day included, then ${prix} / km`, minJours: n => `Minimum rental: ${n} day${n > 1 ? "s" : ""}`,
      conducteur: (age, annees) => `Driver: aged ${age}+, licence held for ${annees} year${annees > 1 ? "s" : ""}`, equipements: "Features", description: "Description", conditions: "Rental conditions",
      modeAvec: "Always driven by our driver, no deposit.", modeSans: "You drive: deposit due at handover.", modeChoix: "Your choice: with our driver (daily supplement) or you drive (deposit).",
      reserver: "Get a quote and book", priseEnCharge: "Pick-up", retour: "Return", date: "Date", heure: "Time", heureAbidjan: "Abidjan time (GMT)", lieuPrise: "Pick-up location", lieuRetour: "Return location", sansFrais: "free", aPreciser: "Please specify", adresses: { domicile: "Home address (area, street, landmark)", bureau: "Office address (area, street, landmark)", autre: "Place to specify" },
      chauffeurChoix: "I would like a driver", chauffeurImpose: "With driver (included in this rental)", chauffeurExclu: "Self-drive: you drive", options: "Extras", parLocation: "/ rental",
      estimation: "Estimate", ligneVehicule: (j, prix) => `Vehicle · ${j} d × ${prix}`, ligneChauffeur: (j, prix) => `Driver · ${j} d × ${prix}`, livraison: "Delivery", reprise: "Collection", total: "Estimated total", cautionRemise: "Deposit at handover (refundable)",
      palier: { jour: "daily rate", semaine: "weekly rate", mois: "monthly rate" }, jours: n => `${n} day${n > 1 ? "s" : ""}`,
      dejaReserve: "Dates already booked", toutLibre: "No upcoming bookings for this vehicle.", occupe: "This vehicle is not available on these dates. Please choose other dates.",
      coordonnees: "Your details", nom: "Full name", telephone: "Phone (WhatsApp)", email: "Email (optional)", message: "Message (optional)", messageAide: "Arrival flight, delivery address…",
      attestation: (age, annees) => `I am at least ${age} and have held my driving licence for at least ${annees} year${annees > 1 ? "s" : ""}.`,
      envoyer: "Send my request", envoi: "Sending…", merciTitre: "Request sent", merciTexte: "Our concierge checks availability and confirms on WhatsApp, with payment and handover details. Nothing is paid online.",
      suivreWa: "Continue on WhatsApp", erreur: "Could not send right now. Please try again or contact us on WhatsApp.", requis: "Enter your name and a phone number we can reach.", attestationRequise: "Tick the box about the driver’s age and licence.",
      aucuneDemandeEnLigne: "Nothing is paid online: our concierge confirms your booking.",
      erreurs: { adresse: "Enter the pick-up and return address.", dates: "Enter the pick-up and return date and time.", ordre: "The return must be after the pick-up.", delai: h => `Book at least ${h} hours in advance.`, duree: n => `Rentals are limited to ${n} days: contact us for long-term rental.`,
        minimum: n => `Minimum rental: ${n} day${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Pick-up and return between ${a} and ${b}.`, lieu: "Choose the pick-up and return locations.", tarif: "Price on request: contact us on WhatsApp." },
      waIntro: "Hello Henri & Philippe, I have just sent a car rental request:"
    },
    es: {
      toutes: "Todas", categorie: "Categoría", conduite: "Conducción", tousModes: "Con o sin chófer", avecChauffeur: "Con chófer", sansChauffeur: "Sin chófer",
      boite: "Cambio", toutesBoites: "Todos", places: "Plazas", placesMin: n => `${n}+ plazas`, tousPlaces: "Todas", trier: "Ordenar", prixCroissant: "Precio ascendente", prixDecroissant: "Precio descendente", plusDePlaces: "Más plazas",
      compte: n => `${n} vehículo${n > 1 ? "s" : ""}`, aucun: "Ningún vehículo coincide con estos criterios.", vide: "Nuestra flota estará en línea pronto. Contáctenos por WhatsApp.",
      aPartirDe: "Desde", parJour: "/ día", surDemande: "Precio a consultar", voir: "Ver y reservar", placesN: n => `${n} plazas`, clim: "Aire acondicionado", bagages: n => `${n} maleta${n > 1 ? "s" : ""}`, portes: n => `${n} puertas`,
      fermer: "Cerrar", photo: (i, n) => `Foto ${i} de ${n}`, formule: "Modalidad", tarifs: "Tarifas", tarifJour: "1 a 6 días", tarifSemaine: "7 a 29 días", tarifMois: "30 días o más", chauffeurJour: "Chófer, por día", inclus: "incluido",
      caution: "Fianza (reembolsable)", km: "Kilometraje", kmIllimite: "Ilimitado", kmInclus: (n, prix) => `${n} km por día incluidos, luego ${prix} / km`, minJours: n => `Alquiler mínimo: ${n} día${n > 1 ? "s" : ""}`,
      conducteur: (age, annees) => `Conductor: ${age} años mínimo, carné desde hace ${annees} año${annees > 1 ? "s" : ""}`, equipements: "Equipamiento", description: "Descripción", conditions: "Condiciones de alquiler",
      modeAvec: "Siempre conducido por nuestro chófer, sin fianza.", modeSans: "Usted conduce: fianza a la entrega.", modeChoix: "A elegir: con nuestro chófer (suplemento diario) o usted conduce (fianza).",
      reserver: "Calcular y reservar", priseEnCharge: "Recogida", retour: "Devolución", date: "Fecha", heure: "Hora", heureAbidjan: "Hora de Abiyán (GMT)", lieuPrise: "Lugar de recogida", lieuRetour: "Lugar de devolución", sansFrais: "sin coste", aPreciser: "A precisar", adresses: { domicile: "Dirección del domicilio (barrio, calle, referencia)", bureau: "Dirección de la oficina (barrio, calle, referencia)", autre: "Lugar a precisar" },
      chauffeurChoix: "Deseo un chófer", chauffeurImpose: "Con chófer (incluido en la modalidad)", chauffeurExclu: "Sin chófer: usted conduce", options: "Opciones", parLocation: "/ alquiler",
      estimation: "Estimación", ligneVehicule: (j, prix) => `Vehículo · ${j} d × ${prix}`, ligneChauffeur: (j, prix) => `Chófer · ${j} d × ${prix}`, livraison: "Entrega", reprise: "Recogida del vehículo", total: "Total estimado", cautionRemise: "Fianza a la entrega (reembolsable)",
      palier: { jour: "tarifa diaria", semaine: "tarifa semanal", mois: "tarifa mensual" }, jours: n => `${n} día${n > 1 ? "s" : ""}`,
      dejaReserve: "Fechas ya reservadas", toutLibre: "No hay reservas próximas para este vehículo.", occupe: "Este vehículo no está disponible en esas fechas. Elija otras fechas.",
      coordonnees: "Sus datos", nom: "Nombre y apellido", telephone: "Teléfono (WhatsApp)", email: "Correo (opcional)", message: "Mensaje (opcional)", messageAide: "Vuelo de llegada, dirección de entrega…",
      attestation: (age, annees) => `Tengo al menos ${age} años y el carné de conducir desde hace al menos ${annees} año${annees > 1 ? "s" : ""}.`,
      envoyer: "Enviar mi solicitud", envoi: "Enviando…", merciTitre: "Solicitud enviada", merciTexte: "Nuestra conserjería comprueba la disponibilidad y le confirma por WhatsApp, con las modalidades de pago y entrega. No se paga nada en línea.",
      suivreWa: "Continuar en WhatsApp", erreur: "No se pudo enviar ahora. Inténtelo de nuevo o contáctenos por WhatsApp.", requis: "Indique su nombre y un teléfono de contacto.", attestationRequise: "Marque la casilla sobre la edad y el carné del conductor.",
      aucuneDemandeEnLigne: "No se paga nada en línea: la conserjería confirma su reserva.",
      erreurs: { adresse: "Indique la dirección de recogida y de devolución.", dates: "Indique la fecha y hora de recogida y de devolución.", ordre: "La devolución debe ser posterior a la recogida.", delai: h => `Reserve con al menos ${h} h de antelación.`, duree: n => `Alquiler limitado a ${n} días: contáctenos para larga duración.`,
        minimum: n => `Alquiler mínimo: ${n} día${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Recogida y devolución entre las ${a} y las ${b}.`, lieu: "Elija el lugar de recogida y de devolución.", tarif: "Precio a consultar: contáctenos por WhatsApp." },
      waIntro: "Hola Henri & Philippe, acabo de enviar una solicitud de alquiler:"
    }
  };

  const langue = () => (window.I18N && typeof I18N.langue === "function" && TEXTES[I18N.langue()] ? I18N.langue() : "fr");
  const t = (cle, ...args) => { const v = TEXTES[langue()][cle] ?? TEXTES.fr[cle]; return typeof v === "function" ? v(...args) : v; };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const locale = () => ({ fr: "fr-FR", en: "en-GB", es: "es-ES" }[langue()]);
  const prix = v => `${new Intl.NumberFormat(locale()).format(Math.round(Number(v) || 0))} FCFA`;
  const champ = (item, cle) => { const traduit = item?.translations?.[langue()]?.[cle]; return (Array.isArray(traduit) ? traduit.length : traduit) ? traduit : item?.[cle]; };

  /*
   * Équipements affichés sur la fiche (19/09/2026) : ils sont cochés dans le
   * studio et traduits par le référentiel « Équipements voitures ». Une fiche
   * enregistrée avant ce changement n'a que ses anciennes lignes libres :
   * elles restent affichées tant qu'elle n'est pas rouverte dans le studio.
   */
  const equipementsLisibles = v => {
    const coches = Array.isArray(v?.equipements) ? v.equipements : [];
    if (coches.length && typeof libelleReferentiel === "function") {
      const libelles = coches.map(id => libelleReferentiel("equipements-voiture", id, "")).filter(Boolean);
      if (libelles.length) return libelles;
    }
    return champ(v, "features") || [];
  };
  const dateLisible = iso => { try { return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso)); } catch { return iso; } };

  const etat = { vehicules: [], reglages: LV.normaliserReglages(null), filtres: { categorie: "", conduite: "", boite: "", places: 0, tri: "prix" }, charge: false };

  // -------------------------------------------------------------------------
  // Catalogue
  // -------------------------------------------------------------------------
  async function charger() {
    try {
      const reponse = await fetch("/api/content", { cache: "no-store" });
      const contenu = await reponse.json();
      etat.vehicules = (Array.isArray(contenu.vehicles) ? contenu.vehicles : []).filter(v => v && v.visible !== false);
      etat.reglages = LV.normaliserReglages(contenu.location);
    } catch { etat.vehicules = []; }
    etat.charge = true;
    // Partagé avec js/avis.js (résumé des avis sur les cartes).
    window.VEHICULES_DATA = etat.vehicules;
    rendreFiltres();
    rendreGrille();
    const ancre = decodeURIComponent(location.hash.slice(1));
    if (ancre && etat.vehicules.some(v => v.id === ancre)) ouvrirVehicule(ancre);
  }

  function rendreFiltres() {
    const hote = document.querySelector("[data-voitures-filtres]");
    if (!hote) return;
    if (!etat.vehicules.length) { hote.innerHTML = ""; return; }
    const categories = LV.CATEGORIES.filter(c => etat.vehicules.some(v => v.category === c.id));
    const f = etat.filtres;
    const select = (nom, libelle, options) => `<label class="voitures-filtre"><span>${esc(libelle)}</span><select data-filtre="${nom}">${options.map(([valeur, texte]) => `<option value="${esc(valeur)}" ${String(f[nom]) === String(valeur) ? "selected" : ""}>${esc(texte)}</option>`).join("")}</select></label>`;
    hote.innerHTML = `<div class="voitures-puces" role="group" aria-label="${esc(t("categorie"))}">${[["", t("toutes")], ...categories.map(c => [c.id, LV.libelle(LV.CATEGORIES, c.id, langue())])].map(([id, libelle]) => `<button type="button" data-categorie="${esc(id)}" class="${f.categorie === id ? "active" : ""}" aria-pressed="${f.categorie === id}">${esc(libelle)}</button>`).join("")}</div>
      <div class="voitures-selects">
        ${select("conduite", t("conduite"), [["", t("tousModes")], ["avec", t("avecChauffeur")], ["sans", t("sansChauffeur")]])}
        ${select("boite", t("boite"), [["", t("toutesBoites")], ...Object.keys(LV.BOITES).map(b => [b, LV.libelle(LV.BOITES, b, langue())])])}
        ${select("places", t("places"), [[0, t("tousPlaces")], [5, t("placesMin", 5)], [7, t("placesMin", 7)], [9, t("placesMin", 9)]])}
        ${select("tri", t("trier"), [["prix", t("prixCroissant")], ["prix-desc", t("prixDecroissant")], ["places", t("plusDePlaces")]])}
      </div>`;
    hote.querySelectorAll("[data-categorie]").forEach(bouton => bouton.addEventListener("click", () => { f.categorie = bouton.dataset.categorie; rendreFiltres(); rendreGrille(); }));
    hote.querySelectorAll("[data-filtre]").forEach(champSelect => champSelect.addEventListener("change", () => {
      f[champSelect.dataset.filtre] = champSelect.dataset.filtre === "places" ? Number(champSelect.value) : champSelect.value;
      rendreGrille();
    }));
  }

  /** « avec » : le client peut avoir un chauffeur ; « sans » : il peut conduire lui-même. */
  const convient = (v, conduite) => !conduite || (conduite === "avec" ? v.driverMode !== "sans" : v.driverMode !== "avec");

  function rendreGrille() {
    const grille = document.querySelector("[data-voitures-grille]");
    const compte = document.querySelector("[data-voitures-compte]");
    if (!grille) return;
    if (!etat.vehicules.length) {
      grille.innerHTML = `<div class="voitures-vide"><p>${esc(t("vide"))}</p><a class="voitures-bouton" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Bonjour, je souhaite louer une voiture.")}" target="_blank" rel="noopener">WhatsApp</a></div>`;
      if (compte) compte.textContent = "";
      return;
    }
    const f = etat.filtres;
    const liste = etat.vehicules
      .filter(v => (!f.categorie || v.category === f.categorie) && convient(v, f.conduite) && (!f.boite || v.transmission === f.boite) && (Number(v.seats) || 0) >= f.places)
      .sort((a, b) => {
        if (f.tri === "places") return (Number(b.seats) || 0) - (Number(a.seats) || 0);
        const pa = LV.prixAPartirDe(a) || Infinity; const pb = LV.prixAPartirDe(b) || Infinity;
        return f.tri === "prix-desc" ? (pb === Infinity ? -1 : pa === Infinity ? 1 : pb - pa) : pa - pb;
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    if (compte) compte.textContent = t("compte", liste.length);
    grille.innerHTML = liste.length ? liste.map(carte).join("") : `<p class="voitures-aucun">${esc(t("aucun"))}</p>`;
    grille.querySelectorAll("[data-ouvrir-vehicule]").forEach(el => el.addEventListener("click", event => {
      if (event.target.closest("[data-avis-voir]")) return;
      ouvrirVehicule(el.dataset.ouvrirVehicule);
    }));
    window.dispatchEvent(new CustomEvent("dl:cards-rendered"));
  }

  function carte(v) {
    const aPartir = LV.prixAPartirDe(v);
    const image = (v.images || [])[0];
    return `<article class="vehicule-card" data-id="${esc(v.id)}">
      <button type="button" class="vehicule-card-visuel" data-ouvrir-vehicule="${esc(v.id)}" aria-label="${esc(`${t("voir")} : ${v.name}`)}">
        ${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async">` : '<span class="vehicule-card-sans-photo" aria-hidden="true">🚙</span>'}
        ${v.badge ? `<span class="vehicule-card-badge">${esc(v.badge)}</span>` : ""}
        <span class="vehicule-card-mode">${esc(LV.libelle(LV.MODES_CHAUFFEUR, v.driverMode, langue()))}</span>
      </button>
      <div class="vehicule-card-corps">
        <span class="vehicule-card-categorie">${esc(LV.libelle(LV.CATEGORIES, v.category, langue()))}${v.year ? ` · ${esc(v.year)}` : ""}</span>
        <h3 class="vehicule-card-titre">${esc(v.name)}</h3>
        <ul class="vehicule-card-specs">
          <li>${esc(t("placesN", v.seats || 5))}</li>
          <li>${esc(LV.libelle(LV.BOITES, v.transmission, langue()))}</li>
          <li>${esc(LV.libelle(LV.CARBURANTS, v.fuel, langue()))}</li>
          ${v.airConditioning !== false ? `<li>${esc(t("clim"))}</li>` : ""}
        </ul>
        <div class="vehicule-card-pied">
          <p class="vehicule-card-prix">${aPartir ? `<small>${esc(t("aPartirDe"))}</small> <strong>${esc(prix(aPartir))}</strong> <small>${esc(t("parJour"))}</small>` : `<strong>${esc(t("surDemande"))}</strong>`}</p>
          <button type="button" class="voitures-bouton vehicule-card-bouton" data-ouvrir-vehicule="${esc(v.id)}">${esc(t("voir"))}</button>
        </div>
      </div>
    </article>`;
  }

  // -------------------------------------------------------------------------
  // Fiche du véhicule et réservation
  // -------------------------------------------------------------------------
  let fenetre = null;
  let focusAvant = null;

  function fermer() {
    if (!fenetre) return;
    fenetre.remove();
    fenetre = null;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", echap);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (focusAvant instanceof HTMLElement) focusAvant.focus();
  }
  const echap = event => { if (event.key === "Escape") fermer(); };

  /** Créneaux horaires proposés : toutes les 30 min entre l'ouverture et la fermeture. */
  function creneaux() {
    const minutes = texte => { const [h, m] = texte.split(":").map(Number); return h * 60 + m; };
    const debut = minutes(etat.reglages.heureOuverture);
    const fin = minutes(etat.reglages.heureFermeture);
    const liste = [];
    for (let m = debut; m <= fin; m += 30) liste.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    return liste;
  }

  function datesParDefaut() {
    // Premier jour possible après le délai de réservation, à 9 h (ou à l'ouverture).
    const premier = new Date(Date.now() + etat.reglages.delaiMinHeures * 3600000);
    premier.setUTCDate(premier.getUTCDate() + 1);
    const jour = premier.toISOString().slice(0, 10);
    const heure = creneaux().includes("09:00") ? "09:00" : creneaux()[0];
    const retour = new Date(`${jour}T00:00:00Z`);
    retour.setUTCDate(retour.getUTCDate() + 3);
    return { debutJour: jour, debutHeure: heure, finJour: retour.toISOString().slice(0, 10), finHeure: heure };
  }

  function ouvrirVehicule(id) {
    const v = etat.vehicules.find(item => item.id === id);
    if (!v) return;
    fermer();
    focusAvant = document.activeElement;
    const r = etat.reglages;
    const images = (v.images || []).length ? v.images : [];
    const defaut = datesParDefaut();
    const heures = creneaux().map(h => `<option value="${h}">${h}</option>`).join("");
    const lieux = r.lieux.map(l => `<option value="${esc(l.id)}">${esc(LV.nomLieu(l, langue()))} · ${l.frais ? `+${esc(prix(l.frais))}` : esc(t("sansFrais"))}</option>`).join("");
    const conditions = r.conditions[langue()] || r.conditions.fr;
    const kmTexte = v.kmIncludedPerDay ? t("kmInclus", v.kmIncludedPerDay, prix(v.extraKmPrice)) : t("kmIllimite");
    const lignesTarifs = [
      [t("tarifJour"), v.pricePerDay],
      [t("tarifSemaine"), v.pricePerDayWeek || v.pricePerDay],
      [t("tarifMois"), v.pricePerDayMonth || v.pricePerDayWeek || v.pricePerDay]
    ];
    const caracteristiques = [
      t("placesN", v.seats || 5), LV.libelle(LV.BOITES, v.transmission, langue()), LV.libelle(LV.CARBURANTS, v.fuel, langue()),
      v.doors ? t("portes", v.doors) : "", v.luggage ? t("bagages", v.luggage) : "", v.airConditioning !== false ? t("clim") : ""
    ].filter(Boolean);
    const features = equipementsLisibles(v);
    const description = champ(v, "description");
    document.body.insertAdjacentHTML("beforeend", `<div class="vehicule-fenetre" role="dialog" aria-modal="true" aria-labelledby="vehiculeFenetreTitre">
      <div class="vehicule-fiche">
        <button type="button" class="vehicule-fermer" data-fermer aria-label="${esc(t("fermer"))}">×</button>
        <div class="vehicule-galerie">
          ${images.length ? `<img class="vehicule-galerie-principale" src="${esc(images[0])}" alt="${esc(`${v.name} — ${t("photo", 1, images.length)}`)}" data-galerie-principale>` : '<div class="vehicule-galerie-vide" aria-hidden="true">🚙</div>'}
          ${images.length > 1 ? `<div class="vehicule-galerie-vignettes">${images.map((src, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-vignette="${i}" aria-label="${esc(t("photo", i + 1, images.length))}" style="background-image:url('${esc(src).replace(/'/g, "%27")}')"></button>`).join("")}</div>` : ""}
        </div>
        <div class="vehicule-contenu">
          <span class="vehicule-categorie">${esc(LV.libelle(LV.CATEGORIES, v.category, langue()))}${v.year ? ` · ${esc(v.year)}` : ""}</span>
          <h2 id="vehiculeFenetreTitre">${esc(v.name)}</h2>
          ${champ(v, "tagline") ? `<p class="vehicule-accroche">${esc(champ(v, "tagline"))}</p>` : ""}
          <ul class="vehicule-caracteristiques">${caracteristiques.map(c => `<li>${esc(c)}</li>`).join("")}</ul>

          <section class="vehicule-bloc-fiche"><h3>${esc(t("formule"))} · ${esc(LV.libelle(LV.MODES_CHAUFFEUR, v.driverMode, langue()))}</h3>
            <p>${esc(t({ avec: "modeAvec", sans: "modeSans" }[v.driverMode] || "modeChoix"))}</p>
            ${v.driverMode !== "avec" ? `<p>${esc(t("conducteur", v.minAge || 21, v.licenseYears || 0))}</p>` : ""}
          </section>

          <section class="vehicule-bloc-fiche"><h3>${esc(t("tarifs"))}</h3>
            ${v.pricePerDay ? `<table class="vehicule-tarifs"><tbody>
              ${lignesTarifs.map(([libelle, montant]) => `<tr><th scope="row">${esc(libelle)}</th><td>${esc(prix(montant))} <small>${esc(t("parJour"))}</small></td></tr>`).join("")}
              ${v.driverMode !== "sans" ? `<tr><th scope="row">${esc(t("chauffeurJour"))}</th><td>${v.driverPricePerDay ? esc(prix(v.driverPricePerDay)) : esc(t("inclus"))}</td></tr>` : ""}
              ${v.driverMode !== "avec" && v.deposit ? `<tr><th scope="row">${esc(t("caution"))}</th><td>${esc(prix(v.deposit))}</td></tr>` : ""}
              <tr><th scope="row">${esc(t("km"))}</th><td>${esc(kmTexte)}</td></tr>
            </tbody></table>${v.minDays > 1 ? `<p class="vehicule-note">${esc(t("minJours", v.minDays))}</p>` : ""}` : `<p>${esc(t("surDemande"))}</p>`}
          </section>

          ${features.length ? `<section class="vehicule-bloc-fiche"><h3>${esc(t("equipements"))}</h3><ul class="vehicule-equipements">${features.map(f => `<li>${esc(f)}</li>`).join("")}</ul></section>` : ""}
          ${description ? `<section class="vehicule-bloc-fiche"><h3>${esc(t("description"))}</h3><p class="vehicule-description">${esc(description).replace(/\n/g, "<br>")}</p></section>` : ""}

          <form class="vehicule-reservation" novalidate data-reservation>
            <h3>${esc(t("reserver"))}</h3>
            <p class="vehicule-note">${esc(t("heureAbidjan"))}</p>
            <div class="vehicule-grille-champs">
              <fieldset><legend>${esc(t("priseEnCharge"))}</legend>
                <label>${esc(t("date"))}<input type="date" name="debutJour" required value="${defaut.debutJour}" min="${new Date().toISOString().slice(0, 10)}"></label>
                <label>${esc(t("heure"))}<select name="debutHeure">${heures}</select></label>
              </fieldset>
              <fieldset><legend>${esc(t("retour"))}</legend>
                <label>${esc(t("date"))}<input type="date" name="finJour" required value="${defaut.finJour}" min="${new Date().toISOString().slice(0, 10)}"></label>
                <label>${esc(t("heure"))}<select name="finHeure">${heures}</select></label>
              </fieldset>
            </div>
            ${r.lieux.length ? `<div class="vehicule-grille-champs">
              <label>${esc(t("lieuPrise"))}<select name="lieuPrise">${lieux}</select></label>
              <label>${esc(t("lieuRetour"))}<select name="lieuRetour">${lieux}</select></label>
              <label data-adresse="prise" hidden>${esc(t("aPreciser"))} · ${esc(t("lieuPrise"))}<input name="adressePrise" maxlength="200" autocomplete="street-address"></label>
              <label data-adresse="retour" hidden>${esc(t("aPreciser"))} · ${esc(t("lieuRetour"))}<input name="adresseRetour" maxlength="200" autocomplete="street-address"></label>
            </div>` : ""}
            <label class="vehicule-case">${v.driverMode === "choix"
              ? `<input type="checkbox" name="chauffeur"> ${esc(t("chauffeurChoix"))}${v.driverPricePerDay ? ` (+${esc(prix(v.driverPricePerDay))} ${esc(t("parJour"))})` : ""}`
              : `<input type="checkbox" name="chauffeur" ${v.driverMode === "avec" ? "checked" : ""} disabled> ${esc(t(v.driverMode === "avec" ? "chauffeurImpose" : "chauffeurExclu"))}`}</label>
            ${r.options.length ? `<fieldset class="vehicule-options"><legend>${esc(t("options"))}</legend>${r.options.map(o => `<label class="vehicule-case"><input type="checkbox" name="options" value="${esc(o.id)}"> ${esc(o.nom)} · ${esc(prix(o.prix))} ${esc(o.unite === "jour" ? t("parJour") : t("parLocation"))}</label>`).join("")}</fieldset>` : ""}

            <div class="vehicule-estimation" data-estimation aria-live="polite"></div>
            <div class="vehicule-occupations" data-occupations></div>

            <fieldset class="vehicule-coordonnees"><legend>${esc(t("coordonnees"))}</legend>
              <div class="vehicule-grille-champs">
                <label>${esc(t("nom"))}<input name="nom" autocomplete="name" maxlength="120" required></label>
                <label>${esc(t("telephone"))}<input name="telephone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" required placeholder="+225 07 …"></label>
              </div>
              <label>${esc(t("email"))}<input name="email" type="email" autocomplete="email" maxlength="180"></label>
              <label>${esc(t("message"))}<textarea name="message" rows="2" maxlength="1000" placeholder="${esc(t("messageAide"))}"></textarea></label>
              <label class="vehicule-case" data-attestation hidden><input type="checkbox" name="conditionsConducteur"> <span>${esc(t("attestation", v.minAge || 21, v.licenseYears || 0))}</span></label>
            </fieldset>
            ${conditions ? `<details class="vehicule-conditions"><summary>${esc(t("conditions"))}</summary><p>${esc(conditions).replace(/\n/g, "<br>")}</p></details>` : ""}
            <p class="vehicule-erreur" data-erreur role="alert"></p>
            <button type="submit" class="voitures-bouton vehicule-envoyer" data-envoyer>${esc(t("envoyer"))}</button>
            <p class="vehicule-note">${esc(t("aucuneDemandeEnLigne"))}</p>
          </form>
          <div class="avis-hote"></div>
        </div>
      </div>
    </div>`);
    fenetre = document.body.lastElementChild;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", echap);
    fenetre.addEventListener("click", event => { if (event.target === fenetre) fermer(); });
    fenetre.querySelector("[data-fermer]").addEventListener("click", fermer);
    fenetre.querySelectorAll("[data-vignette]").forEach(bouton => bouton.addEventListener("click", () => {
      const i = Number(bouton.dataset.vignette);
      const principale = fenetre.querySelector("[data-galerie-principale]");
      principale.src = images[i];
      principale.alt = `${v.name} — ${t("photo", i + 1, images.length)}`;
      fenetre.querySelectorAll("[data-vignette]").forEach(b => b.classList.toggle("active", b === bouton));
    }));
    history.replaceState(null, "", `#${encodeURIComponent(v.id)}`);
    const form = fenetre.querySelector("[data-reservation]");
    form.elements.debutHeure.value = defaut.debutHeure;
    form.elements.finHeure.value = defaut.finHeure;
    brancherReservation(form, v);
    fenetre.scrollTop = 0;
    fenetre.querySelector("[data-fermer]").focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent("dl:annonce-ouverte", { detail: { kind: "vehicle", id: v.id, conteneur: fenetre.querySelector(".vehicule-contenu") } }));
  }

  function brancherReservation(form, v) {
    let occupations = [];
    const demande = () => ({
      debut: `${form.elements.debutJour.value}T${form.elements.debutHeure.value}`,
      fin: `${form.elements.finJour.value}T${form.elements.finHeure.value}`,
      lieuPrise: form.elements.lieuPrise?.value || "", lieuRetour: form.elements.lieuRetour?.value || "",
      adressePrise: form.elements.adressePrise?.value || "", adresseRetour: form.elements.adresseRetour?.value || "",
      chauffeur: form.elements.chauffeur.checked,
      options: [...form.querySelectorAll('[name="options"]:checked')].map(c => c.value)
    });
    const messageErreur = e => {
      const r = etat.reglages;
      const traduction = TEXTES[langue()].erreurs[e.code];
      if (typeof traduction === "function") {
        if (e.code === "delai") return traduction(r.delaiMinHeures);
        if (e.code === "duree") return traduction(LV.DUREE_MAX_JOURS);
        if (e.code === "minimum") return traduction(v.minDays || 1);
        if (e.code === "horaires") return traduction(r.heureOuverture, r.heureFermeture);
      }
      return traduction || e.message;
    };
    // Lieu « à préciser » (domicile, bureau, autre) : champ d'adresse affiché.
    const majAdresses = () => {
      [["prise", "lieuPrise", "adressePrise"], ["retour", "lieuRetour", "adresseRetour"]].forEach(([sens, champLieu, champAdresse]) => {
        const lieu = etat.reglages.lieux.find(l => l.id === form.elements[champLieu]?.value);
        const bloc = form.querySelector(`[data-adresse="${sens}"]`);
        if (!bloc) return;
        bloc.hidden = !(lieu && lieu.precision);
        form.elements[champAdresse].required = !bloc.hidden;
        form.elements[champAdresse].placeholder = lieu && lieu.precision ? t("adresses")[lieu.id] || t("aPreciser") : "";
      });
    };
    const estimer = () => {
      majAdresses();
      const d = demande();
      const devis = LV.devis(v, etat.reglages, d);
      const gene = devis.debut && devis.fin ? LV.conflit(occupations, devis.debut, devis.fin) : null;
      form.querySelector("[data-attestation]").hidden = devis.chauffeur || !(v.minAge || v.licenseYears);
      const zone = form.querySelector("[data-estimation]");
      const lignes = devis.lignes.map(l => {
        const libelle = l.cle === "vehicule" ? `${t("ligneVehicule", l.quantite, prix(l.prixUnitaire))} (${t("palier")[l.palier]})`
          : l.cle === "chauffeur" ? t("ligneChauffeur", l.quantite, prix(l.prixUnitaire))
          : l.cle === "livraison" ? `${l.sens === "prise" ? t("livraison") : t("reprise")} · ${l.nom}`
          : `${l.nom}${l.unite === "jour" ? ` · ${l.quantite} j × ${prix(l.prixUnitaire)}` : ""}`;
        return `<li><span>${esc(libelle)}</span><strong>${esc(prix(l.montant))}</strong></li>`;
      }).join("");
      zone.innerHTML = devis.erreurs.length
        ? `<p class="vehicule-erreur-estimation">${esc(messageErreur(devis.erreurs[0]))}</p>`
        : `<h4>${esc(t("estimation"))} · ${esc(t("jours", devis.jours))}</h4><ul>${lignes}</ul>
          <p class="vehicule-total"><span>${esc(t("total"))}</span><strong>${esc(prix(devis.total))}</strong></p>
          ${devis.caution ? `<p class="vehicule-caution"><span>${esc(t("cautionRemise"))}</span><strong>${esc(prix(devis.caution))}</strong></p>` : ""}
          <p class="vehicule-note">${esc(devis.kmInclus ? t("kmInclus", v.kmIncludedPerDay, prix(v.extraKmPrice)) : `${t("km")} : ${t("kmIllimite")}`)}</p>
          ${gene ? `<p class="vehicule-erreur-estimation">${esc(t("occupe"))}</p>` : ""}`;
      form.querySelector("[data-envoyer]").disabled = !devis.ok || Boolean(gene);
      return { devis, gene };
    };
    form.addEventListener("input", estimer);
    form.addEventListener("change", estimer);
    estimer();

    // Dates déjà prises : lues à l'ouverture de la fiche (sans nom ni motif).
    fetch(`/api/location/disponibilites?vehicule=${encodeURIComponent(v.id)}`, { cache: "no-store" })
      .then(reponse => reponse.json())
      .then(donnees => {
        occupations = Array.isArray(donnees.occupations) ? donnees.occupations : [];
        const zone = form.querySelector("[data-occupations]");
        zone.innerHTML = occupations.length
          ? `<p><strong>${esc(t("dejaReserve"))}</strong></p><ul>${occupations.slice(0, 6).map(o => `<li>${esc(dateLisible(o.debut))} → ${esc(dateLisible(o.fin))}</li>`).join("")}</ul>`
          : `<p class="vehicule-note">${esc(t("toutLibre"))}</p>`;
        estimer();
      })
      .catch(() => {});

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const erreur = form.querySelector("[data-erreur]");
      erreur.textContent = "";
      const { devis, gene } = estimer();
      if (!devis.ok || gene) return;
      const nom = form.elements.nom.value.trim();
      const telephone = form.elements.telephone.value.trim();
      if (nom.length < 2 || telephone.replace(/\D/g, "").length < 8) { erreur.textContent = t("requis"); form.elements[nom.length < 2 ? "nom" : "telephone"].focus(); return; }
      const attestation = form.querySelector("[data-attestation]");
      if (!attestation.hidden && !form.elements.conditionsConducteur.checked) { erreur.textContent = t("attestationRequise"); form.elements.conditionsConducteur.focus(); return; }
      const bouton = form.querySelector("[data-envoyer]");
      bouton.disabled = true;
      bouton.textContent = t("envoi");
      try {
        const reponse = await fetch("/api/location/demande", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicule: v.id, ...demande(), nom, telephone, email: form.elements.email.value.trim(), message: form.elements.message.value.trim(),
            conditionsConducteur: form.elements.conditionsConducteur.checked, source: "site", langue: langue()
          })
        });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) { const e = new Error(corps.error || t("erreur")); e.visible = Boolean(corps.error); throw e; }
        const recap = [
          t("waIntro"), `• ${v.name}`,
          `• ${dateLisible(corps.devis.debut)} → ${dateLisible(corps.devis.fin)} (${t("jours", corps.devis.jours)})`,
          `• ${corps.devis.chauffeur ? t("avecChauffeur") : t("sansChauffeur")}`,
          corps.devis.lieuPrise ? `• ${t("priseEnCharge")} : ${corps.devis.lieuPrise.nom}${corps.devis.adressePrise ? ` — ${corps.devis.adressePrise}` : ""}` : "",
          corps.devis.lieuRetour && corps.devis.adresseRetour ? `• ${t("retour")} : ${corps.devis.lieuRetour.nom} — ${corps.devis.adresseRetour}` : "",
          `• ${t("total")} : ${prix(corps.devis.total)}`,
          `• ${nom}`
        ].filter(Boolean).join("\n");
        form.outerHTML = `<div class="vehicule-merci" role="status"><h3>${esc(t("merciTitre"))}</h3><p>${esc(t("merciTexte"))}</p><a class="voitures-bouton vehicule-wa" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(recap)}" target="_blank" rel="noopener">${esc(t("suivreWa"))}</a></div>`;
      } catch (e) {
        erreur.textContent = e.visible ? e.message : t("erreur");
        bouton.disabled = false;
        bouton.textContent = t("envoyer");
      }
    });
  }

  // Partagés avec js/avis.js : lien « N avis » d'une carte → fiche ouverte.
  window.ouvrirVehicule = ouvrirVehicule;

  document.addEventListener("dl:langue", () => {
    if (!etat.charge) return;
    rendreFiltres();
    rendreGrille();
    const ouvert = fenetre && decodeURIComponent(location.hash.slice(1));
    if (ouvert) ouvrirVehicule(ouvert);
  });
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && etat.vehicules.some(v => v.id === id) && !fenetre) ouvrirVehicule(id);
  });

  if (document.querySelector("[data-voitures-grille]")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", charger);
    else charger();
  }
})();
