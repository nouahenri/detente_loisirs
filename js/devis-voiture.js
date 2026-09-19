/**
 * Voiture dans le simulateur de devis (devis.html), demande du 19/09/2026.
 *
 * Formules : séjour + activités + voiture, activités + voiture, voiture seule,
 * toujours avec ou sans chauffeur selon le véhicule. UNE seule demande part au
 * site : js/app.js y joint la voiture (`location`), le serveur recalcule son
 * prix, vérifie ses dates et crée sa réservation dans le planning du studio.
 *
 * La voiture reprend les dates du séjour tant que le visiteur ne les change
 * pas à la main. Heures : toujours celles d'Abidjan (UTC+0). Estimation :
 * js/location-voitures.js, la règle commune au site, à l'app et au serveur.
 *
 * Interface pour js/app.js : window.DevisVoiture (voir en bas du fichier) ;
 * chaque changement émet « dl:devis-voiture » sur document.
 */
(function () {
  "use strict";

  const LV = window.LocationVoitures;
  const section = document.getElementById("simVoiture");
  const contenu = document.getElementById("simVoitureContenu");
  if (!LV || !section || !contenu) return;

  const TEXTES = {
    fr: {
      vehicule: "Véhicule", sansVoiture: "Sans voiture", choisir: "Choisissez un véhicule", des: prix => `dès ${prix} / jour`, surDemande: "tarif sur demande",
      modes: { avec: "avec chauffeur", sans: "sans chauffeur", choix: "avec ou sans chauffeur" },
      datesSejour: "Dates reprises de votre séjour : modifiables.", reprendre: "Reprendre les dates du séjour",
      prise: "Prise en charge", retour: "Retour", heure: "Heure", heureAbidjan: "Heures d’Abidjan (GMT)", lieuPrise: "Lieu de prise en charge", lieuRetour: "Lieu de retour", sansFrais: "sans frais",
      chauffeurChoix: "Je souhaite un chauffeur", chauffeurImpose: "Avec chauffeur (compris dans la formule)", chauffeurExclu: "Sans chauffeur : vous conduisez", options: "Options", parJour: "/ jour", parLocation: "/ location",
      estimation: "Estimation de la voiture", ligneVehicule: (j, prix) => `Véhicule · ${j} j × ${prix}`, ligneChauffeur: (j, prix) => `Chauffeur · ${j} j × ${prix}`, livraison: "Livraison", reprise: "Reprise", total: "Total voiture", cautionRemise: "Caution à la remise (restituée)",
      palier: { jour: "tarif jour", semaine: "tarif semaine", mois: "tarif mois" }, jours: n => `${n} jour${n > 1 ? "s" : ""}`,
      km: "Kilométrage", kmIllimite: "illimité", kmInclus: (n, prix) => `${n} km inclus par jour, puis ${prix} / km`,
      dejaReserve: "Dates déjà réservées", toutLibre: "Aucune réservation à venir sur ce véhicule.", occupe: "Ce véhicule n’est pas disponible sur ces dates. Choisissez d’autres dates ou un autre véhicule.",
      attestation: (age, annees) => `J’ai au moins ${age} ans et mon permis de conduire depuis au moins ${annees} an${annees > 1 ? "s" : ""}.`,
      attestationRequise: "Cochez la case sur l’âge et le permis du conducteur.", vehiculeRequis: "Choisissez un véhicule.",
      erreurs: { dates: "Indiquez la date et l’heure de prise en charge et de retour.", ordre: "Le retour doit suivre la prise en charge.", delai: h => `Réservez la voiture au moins ${h} h à l’avance.`, duree: n => `Location limitée à ${n} jours : contactez-nous pour une longue durée.`,
        minimum: n => `Location minimale : ${n} jour${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Prise en charge et retour entre ${a} et ${b}.`, lieu: "Choisissez le lieu de prise en charge et de retour.", tarif: "Tarif sur demande : contactez-nous sur WhatsApp." }
    },
    en: {
      vehicule: "Vehicle", sansVoiture: "No car", choisir: "Choose a vehicle", des: prix => `from ${prix} / day`, surDemande: "price on request",
      modes: { avec: "with driver", sans: "self-drive", choix: "with or without driver" },
      datesSejour: "Dates taken from your stay: you can change them.", reprendre: "Use my stay dates",
      prise: "Pick-up", retour: "Return", heure: "Time", heureAbidjan: "Abidjan time (GMT)", lieuPrise: "Pick-up location", lieuRetour: "Return location", sansFrais: "free",
      chauffeurChoix: "I would like a driver", chauffeurImpose: "With driver (included in this rental)", chauffeurExclu: "Self-drive: you drive", options: "Extras", parJour: "/ day", parLocation: "/ rental",
      estimation: "Car estimate", ligneVehicule: (j, prix) => `Vehicle · ${j} d × ${prix}`, ligneChauffeur: (j, prix) => `Driver · ${j} d × ${prix}`, livraison: "Delivery", reprise: "Collection", total: "Car total", cautionRemise: "Deposit at handover (refundable)",
      palier: { jour: "daily rate", semaine: "weekly rate", mois: "monthly rate" }, jours: n => `${n} day${n > 1 ? "s" : ""}`,
      km: "Mileage", kmIllimite: "unlimited", kmInclus: (n, prix) => `${n} km per day included, then ${prix} / km`,
      dejaReserve: "Dates already booked", toutLibre: "No upcoming bookings for this vehicle.", occupe: "This vehicle is not available on these dates. Please choose other dates or another vehicle.",
      attestation: (age, annees) => `I am at least ${age} and have held my driving licence for at least ${annees} year${annees > 1 ? "s" : ""}.`,
      attestationRequise: "Tick the box about the driver’s age and licence.", vehiculeRequis: "Choose a vehicle.",
      erreurs: { dates: "Enter the pick-up and return date and time.", ordre: "Return must be after pick-up.", delai: h => `Book the car at least ${h} h in advance.`, duree: n => `Rentals are limited to ${n} days: contact us for long-term rental.`,
        minimum: n => `Minimum rental: ${n} day${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Pick-up and return between ${a} and ${b}.`, lieu: "Choose the pick-up and return location.", tarif: "Price on request: contact us on WhatsApp." }
    },
    es: {
      vehicule: "Vehículo", sansVoiture: "Sin coche", choisir: "Elija un vehículo", des: prix => `desde ${prix} / día`, surDemande: "precio a consultar",
      modes: { avec: "con chófer", sans: "sin chófer", choix: "con o sin chófer" },
      datesSejour: "Fechas tomadas de su estancia: puede cambiarlas.", reprendre: "Usar las fechas de mi estancia",
      prise: "Recogida", retour: "Devolución", heure: "Hora", heureAbidjan: "Hora de Abiyán (GMT)", lieuPrise: "Lugar de recogida", lieuRetour: "Lugar de devolución", sansFrais: "sin coste",
      chauffeurChoix: "Deseo un chófer", chauffeurImpose: "Con chófer (incluido en la modalidad)", chauffeurExclu: "Sin chófer: usted conduce", options: "Opciones", parJour: "/ día", parLocation: "/ alquiler",
      estimation: "Estimación del coche", ligneVehicule: (j, prix) => `Vehículo · ${j} d × ${prix}`, ligneChauffeur: (j, prix) => `Chófer · ${j} d × ${prix}`, livraison: "Entrega", reprise: "Recogida del vehículo", total: "Total coche", cautionRemise: "Fianza a la entrega (reembolsable)",
      palier: { jour: "tarifa diaria", semaine: "tarifa semanal", mois: "tarifa mensual" }, jours: n => `${n} día${n > 1 ? "s" : ""}`,
      km: "Kilometraje", kmIllimite: "ilimitado", kmInclus: (n, prix) => `${n} km incluidos por día, luego ${prix} / km`,
      dejaReserve: "Fechas ya reservadas", toutLibre: "No hay reservas próximas para este vehículo.", occupe: "Este vehículo no está disponible en esas fechas. Elija otras fechas u otro vehículo.",
      attestation: (age, annees) => `Tengo al menos ${age} años y el carné de conducir desde hace al menos ${annees} año${annees > 1 ? "s" : ""}.`,
      attestationRequise: "Marque la casilla sobre la edad y el carné del conductor.", vehiculeRequis: "Elija un vehículo.",
      erreurs: { dates: "Indique la fecha y hora de recogida y de devolución.", ordre: "La devolución debe ser posterior a la recogida.", delai: h => `Reserve el coche con al menos ${h} h de antelación.`, duree: n => `Alquiler limitado a ${n} días: contáctenos para larga duración.`,
        minimum: n => `Alquiler mínimo: ${n} día${n > 1 ? "s" : ""}.`, horaires: (a, b) => `Recogida y devolución entre las ${a} y las ${b}.`, lieu: "Elija el lugar de recogida y de devolución.", tarif: "Precio a consultar: contáctenos por WhatsApp." }
    }
  };

  const langue = () => (window.I18N && typeof I18N.langue === "function" && TEXTES[I18N.langue()] ? I18N.langue() : "fr");
  const t = (cle, ...args) => { const v = TEXTES[langue()][cle] ?? TEXTES.fr[cle]; return typeof v === "function" ? v(...args) : v; };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const locale = () => ({ fr: "fr-FR", en: "en-GB", es: "es-ES" }[langue()]);
  const prix = v => `${new Intl.NumberFormat(locale()).format(Math.round(Number(v) || 0))} FCFA`;
  const dateLisible = iso => { try { return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso)); } catch { return iso; } };
  const plusJours = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const etat = {
    vehicules: [], reglages: LV.normaliserReglages(null), charge: false,
    mode: "sejour", sejour: null, occupations: [],
    saisie: { vehiculeId: "", debutJour: "", debutHeure: "09:00", finJour: "", finHeure: "09:00", lieuPrise: "", lieuRetour: "", chauffeur: false, options: [], attestation: false, datesLibres: false }
  };

  /** Créneaux : toutes les 30 min entre l'ouverture et la fermeture de l'agence. */
  function creneaux() {
    const minutes = texte => { const [h, m] = texte.split(":").map(Number); return h * 60 + m; };
    const liste = [];
    for (let m = minutes(etat.reglages.heureOuverture); m <= minutes(etat.reglages.heureFermeture); m += 30) liste.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    return liste;
  }
  const heureDefaut = () => (creneaux().includes("09:00") ? "09:00" : creneaux()[0]);
  const vehicule = () => etat.vehicules.find(v => v.id === etat.saisie.vehiculeId) || null;
  const avecSejour = () => etat.mode !== "voiture" && Boolean(etat.sejour && etat.sejour.arrivee && etat.sejour.depart);

  /** Dates proposées : celles du séjour, sinon le premier jour réservable + 3 jours. */
  function datesParDefaut() {
    if (avecSejour()) return { debutJour: etat.sejour.arrivee, finJour: etat.sejour.depart > etat.sejour.arrivee ? etat.sejour.depart : plusJours(etat.sejour.arrivee, 1) };
    const premier = new Date(Date.now() + etat.reglages.delaiMinHeures * 3600000);
    const jour = plusJours(premier.toISOString().slice(0, 10), 1);
    return { debutJour: jour, finJour: plusJours(jour, 3) };
  }

  const demande = () => ({
    debut: `${etat.saisie.debutJour}T${etat.saisie.debutHeure}`, fin: `${etat.saisie.finJour}T${etat.saisie.finHeure}`,
    lieuPrise: etat.saisie.lieuPrise, lieuRetour: etat.saisie.lieuRetour, chauffeur: etat.saisie.chauffeur, options: etat.saisie.options.slice()
  });

  function calcul() {
    const v = vehicule();
    if (!v) return null;
    const devis = LV.devis(v, etat.reglages, demande());
    const gene = devis.debut && devis.fin ? LV.conflit(etat.occupations, devis.debut, devis.fin) : null;
    const attestationRequise = !devis.chauffeur && Boolean(v.minAge || v.licenseYears);
    return { vehicule: v, saisie: { ...etat.saisie }, demande: demande(), devis, gene, attestationRequise, attestation: etat.saisie.attestation };
  }

  function messageErreur(code, v) {
    const r = etat.reglages;
    const traduction = TEXTES[langue()].erreurs[code];
    if (typeof traduction !== "function") return traduction || "";
    if (code === "delai") return traduction(r.delaiMinHeures);
    if (code === "duree") return traduction(LV.DUREE_MAX_JOURS);
    if (code === "minimum") return traduction(v.minDays || 1);
    return traduction(r.heureOuverture, r.heureFermeture);
  }

  const signaler = () => document.dispatchEvent(new CustomEvent("dl:devis-voiture"));

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  function rendre() {
    const seule = etat.mode === "voiture";
    section.hidden = !etat.vehicules.length;
    const modeVoiture = document.getElementById("simModeVoiture");
    if (modeVoiture) modeVoiture.hidden = !etat.vehicules.length;
    if (!etat.vehicules.length) { contenu.innerHTML = ""; return; }
    const v = vehicule();
    const choix = etat.vehicules.map(item => {
      const aPartir = LV.prixAPartirDe(item);
      return `<option value="${esc(item.id)}"${item.id === etat.saisie.vehiculeId ? " selected" : ""}>${esc(item.name)} — ${esc(aPartir ? t("des", prix(aPartir)) : t("surDemande"))} · ${esc(t("modes")[item.driverMode] || "")}</option>`;
    }).join("");
    const premiere = seule
      ? `<option value="" disabled${v ? "" : " selected"}>${esc(t("choisir"))}</option>`
      : `<option value=""${v ? "" : " selected"}>${esc(t("sansVoiture"))}</option>`;
    let html = `<label class="sim-voiture-champ">${esc(t("vehicule"))}<select class="form-control" data-v="vehiculeId">${premiere}${choix}</select></label>`;
    if (v) {
      const heures = creneaux().map(h => `<option value="${h}">${h}</option>`).join("");
      const lieux = etat.reglages.lieux.map(l => `<option value="${esc(l.id)}">${esc(l.nom)} · ${esc(l.frais ? `+${prix(l.frais)}` : t("sansFrais"))}</option>`).join("");
      const aujourdhui = new Date().toISOString().slice(0, 10);
      html += `
        <p class="sim-voiture-note" data-v-dates-note ${avecSejour() ? "" : "hidden"}><span data-v-dates-texte>${esc(t("datesSejour"))}</span>
          <button type="button" class="sim-voiture-lien" data-v-reprendre hidden>${esc(t("reprendre"))}</button></p>
        <div class="sim-voiture-grille">
          <label>${esc(t("prise"))}<input type="date" class="form-control" data-v="debutJour" min="${aujourdhui}"></label>
          <label>${esc(t("heure"))}<select class="form-control" data-v="debutHeure">${heures}</select></label>
          <label>${esc(t("retour"))}<input type="date" class="form-control" data-v="finJour" min="${aujourdhui}"></label>
          <label>${esc(t("heure"))}<select class="form-control" data-v="finHeure">${heures}</select></label>
        </div>
        <p class="sim-voiture-note">${esc(t("heureAbidjan"))}</p>
        ${etat.reglages.lieux.length ? `<div class="sim-voiture-grille">
          <label>${esc(t("lieuPrise"))}<select class="form-control" data-v="lieuPrise">${lieux}</select></label>
          <label>${esc(t("lieuRetour"))}<select class="form-control" data-v="lieuRetour">${lieux}</select></label>
        </div>` : ""}
        <label class="sim-voiture-case">${v.driverMode === "choix"
          ? `<input type="checkbox" data-v="chauffeur"> <span>${esc(t("chauffeurChoix"))}${v.driverPricePerDay ? ` (+${esc(prix(v.driverPricePerDay))} ${esc(t("parJour"))})` : ""}</span>`
          : `<input type="checkbox" ${v.driverMode === "avec" ? "checked" : ""} disabled> <span>${esc(t(v.driverMode === "avec" ? "chauffeurImpose" : "chauffeurExclu"))}</span>`}</label>
        ${etat.reglages.options.length ? `<fieldset class="sim-voiture-options"><legend>${esc(t("options"))}</legend>${etat.reglages.options.map(o =>
          `<label class="sim-voiture-case"><input type="checkbox" data-v-option value="${esc(o.id)}"> <span>${esc(o.nom)} · ${esc(prix(o.prix))} ${esc(o.unite === "jour" ? t("parJour") : t("parLocation"))}</span></label>`).join("")}</fieldset>` : ""}
        <div class="sim-voiture-estimation" data-v-estimation aria-live="polite"></div>
        <div class="sim-voiture-occupations" data-v-occupations></div>
        <label class="sim-voiture-case" data-v-attestation hidden><input type="checkbox" data-v="attestation"> <span>${esc(t("attestation", v.minAge || 21, v.licenseYears || 0))}</span></label>`;
    }
    html += `<p class="sim-voiture-erreur" data-v-erreur role="alert" hidden></p>`;
    contenu.innerHTML = html;
    remplirChamps();
    rafraichir();
  }

  /** Valeurs de la saisie reportées dans les champs (après un rendu ou un changement de dates du séjour). */
  function remplirChamps() {
    ["debutJour", "debutHeure", "finJour", "finHeure", "lieuPrise", "lieuRetour"].forEach(cle => {
      const champ = contenu.querySelector(`[data-v="${cle}"]`);
      if (champ && etat.saisie[cle]) champ.value = etat.saisie[cle];
    });
    const chauffeur = contenu.querySelector('[data-v="chauffeur"]');
    if (chauffeur) chauffeur.checked = etat.saisie.chauffeur;
    const attestation = contenu.querySelector('[data-v="attestation"]');
    if (attestation) attestation.checked = etat.saisie.attestation;
    contenu.querySelectorAll("[data-v-option]").forEach(c => { c.checked = etat.saisie.options.includes(c.value); });
    const finJour = contenu.querySelector('[data-v="finJour"]');
    if (finJour) finJour.min = etat.saisie.debutJour;
  }

  /** Estimation, dates prises, attestation et mention des dates du séjour. */
  function rafraichir() {
    const r = calcul();
    const zone = contenu.querySelector("[data-v-estimation]");
    if (!r || !zone) return;
    const { vehicule: v, devis, gene, attestationRequise } = r;
    const lignes = devis.lignes.map(l => {
      const libelle = l.cle === "vehicule" ? `${t("ligneVehicule", l.quantite, prix(l.prixUnitaire))} (${t("palier")[l.palier]})`
        : l.cle === "chauffeur" ? t("ligneChauffeur", l.quantite, prix(l.prixUnitaire))
          : l.cle === "livraison" ? `${l.sens === "prise" ? t("livraison") : t("reprise")} · ${l.nom}`
            : `${l.nom}${l.unite === "jour" ? ` · ${l.quantite} j × ${prix(l.prixUnitaire)}` : ""}`;
      return `<li><span>${esc(libelle)}</span><strong>${esc(prix(l.montant))}</strong></li>`;
    }).join("");
    zone.innerHTML = devis.erreurs.length
      ? `<p class="sim-voiture-erreur">${esc(messageErreur(devis.erreurs[0].code, v))}</p>`
      : `<h5>${esc(t("estimation"))} · ${esc(t("jours", devis.jours))}</h5><ul>${lignes}</ul>
        <p class="sim-voiture-total"><span>${esc(t("total"))}</span><strong>${esc(prix(devis.total))}</strong></p>
        ${devis.caution ? `<p class="sim-voiture-caution"><span>${esc(t("cautionRemise"))}</span><strong>${esc(prix(devis.caution))}</strong></p>` : ""}
        <p class="sim-voiture-note">${esc(t("km"))} : ${esc(devis.kmInclus ? t("kmInclus", v.kmIncludedPerDay, prix(v.extraKmPrice)) : t("kmIllimite"))}</p>
        ${gene ? `<p class="sim-voiture-erreur">${esc(t("occupe"))}</p>` : ""}`;
    const attestation = contenu.querySelector("[data-v-attestation]");
    if (attestation) attestation.hidden = !attestationRequise;
    const note = contenu.querySelector("[data-v-dates-note]");
    if (note) {
      note.hidden = !avecSejour();
      note.querySelector("[data-v-dates-texte]").textContent = etat.saisie.datesLibres ? "" : t("datesSejour");
      note.querySelector("[data-v-reprendre]").hidden = !etat.saisie.datesLibres;
    }
  }

  function afficherOccupations() {
    const zone = contenu.querySelector("[data-v-occupations]");
    if (!zone) return;
    zone.innerHTML = etat.occupations.length
      ? `<p><strong>${esc(t("dejaReserve"))}</strong></p><ul>${etat.occupations.slice(0, 6).map(o => `<li>${esc(dateLisible(o.debut))} → ${esc(dateLisible(o.fin))}</li>`).join("")}</ul>`
      : `<p class="sim-voiture-note">${esc(t("toutLibre"))}</p>`;
  }

  /** Dates déjà prises du véhicule choisi (sans nom ni motif). */
  function chargerOccupations(id) {
    etat.occupations = [];
    fetch(`/api/location/disponibilites?vehicule=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(reponse => reponse.json())
      .then(donnees => {
        if (etat.saisie.vehiculeId !== id) return;
        etat.occupations = Array.isArray(donnees.occupations) ? donnees.occupations : [];
        afficherOccupations();
        rafraichir();
        signaler();
      })
      .catch(() => {});
  }

  function choisirVehicule(id) {
    const v = etat.vehicules.find(item => item.id === id) || null;
    etat.saisie.vehiculeId = v ? v.id : "";
    etat.saisie.chauffeur = Boolean(v && v.driverMode === "avec");
    etat.saisie.attestation = false;
    if (v && !etat.saisie.debutJour) Object.assign(etat.saisie, datesParDefaut());
    rendre();
    if (v) chargerOccupations(v.id);
    signaler();
  }

  // Saisie : délégation sur le conteneur (il est redessiné).
  contenu.addEventListener("change", event => {
    const cible = event.target;
    effacerErreur();
    if (cible.matches('[data-v="vehiculeId"]')) return choisirVehicule(cible.value);
    if (cible.matches("[data-v-option]")) {
      etat.saisie.options = [...contenu.querySelectorAll("[data-v-option]:checked")].map(c => c.value);
    } else if (cible.dataset.v) {
      const cle = cible.dataset.v;
      etat.saisie[cle] = cible.type === "checkbox" ? cible.checked : cible.value;
      if (cle === "debutJour" || cle === "finJour") {
        etat.saisie.datesLibres = true;
        if (cle === "debutJour" && etat.saisie.finJour <= etat.saisie.debutJour) etat.saisie.finJour = plusJours(etat.saisie.debutJour, 1);
        remplirChamps();
      }
    }
    rafraichir();
    signaler();
  });
  contenu.addEventListener("click", event => {
    if (!event.target.closest("[data-v-reprendre]") || !avecSejour()) return;
    etat.saisie.datesLibres = false;
    Object.assign(etat.saisie, datesParDefaut());
    remplirChamps();
    rafraichir();
    signaler();
  });

  function effacerErreur() {
    const zone = contenu.querySelector("[data-v-erreur]");
    if (zone) { zone.hidden = true; zone.textContent = ""; }
  }

  async function charger() {
    try {
      const reponse = await fetch("/api/content", { cache: "no-store" });
      const donnees = await reponse.json();
      etat.vehicules = (Array.isArray(donnees.vehicles) ? donnees.vehicles : []).filter(v => v && v.visible !== false);
      etat.reglages = LV.normaliserReglages(donnees.location);
    } catch { etat.vehicules = []; }
    const lieu = (etat.reglages.lieux[0] || {}).id || "";
    Object.assign(etat.saisie, { debutHeure: heureDefaut(), finHeure: heureDefaut(), lieuPrise: lieu, lieuRetour: lieu });
    etat.charge = true;
    // devis.html?voiture=<id> : véhicule présélectionné (depuis la page Voitures).
    const demandee = new URLSearchParams(location.search).get("voiture");
    if (demandee && etat.vehicules.some(v => v.id === demandee)) {
      if (!new URLSearchParams(location.search).get("villa")) {
        const radio = document.querySelector('input[name="simMode"][value="voiture"]');
        if (radio) { radio.checked = true; etat.mode = "voiture"; radio.dispatchEvent(new Event("change", { bubbles: true })); }
      }
      choisirVehicule(demandee);
    } else {
      rendre();
      signaler();
    }
  }

  // -------------------------------------------------------------------------
  // Interface pour js/app.js
  // -------------------------------------------------------------------------
  window.DevisVoiture = {
    /** Formule du simulateur : « sejour », « activites » ou « voiture » (voiture seule). */
    definirMode(mode) {
      if (mode === etat.mode) return;
      etat.mode = mode;
      if (!etat.saisie.datesLibres && avecSejour()) Object.assign(etat.saisie, datesParDefaut());
      if (etat.charge) rendre();
    },
    /** Dates du séjour : reprises par la voiture tant qu'elles n'ont pas été changées à la main. */
    definirSejour(sejour) {
      const avant = JSON.stringify(etat.sejour);
      etat.sejour = sejour && sejour.arrivee && sejour.depart ? { arrivee: sejour.arrivee, depart: sejour.depart } : null;
      if (avant === JSON.stringify(etat.sejour)) return;
      if (!etat.saisie.datesLibres && avecSejour()) Object.assign(etat.saisie, datesParDefaut());
      // Mention « dates reprises » ou lien « Reprendre les dates » tenus à jour.
      if (vehicule()) { remplirChamps(); rafraichir(); }
    },
    /** Voiture retenue (null = sans voiture) : estimation, dates prises, attestation. */
    etat: calcul,
    /** Message à afficher si la voiture empêche l'envoi ; le montre dans la section et y amène le visiteur. */
    verifier() {
      const r = calcul();
      let message = "";
      if (!r) message = etat.mode === "voiture" && etat.vehicules.length ? t("vehiculeRequis") : "";
      else if (!r.devis.ok) message = messageErreur(r.devis.erreurs[0].code, r.vehicule);
      else if (r.gene) message = t("occupe");
      else if (r.attestationRequise && !r.attestation) message = t("attestationRequise");
      if (message) this.signalerErreur(message);
      return message;
    },
    signalerErreur(message) {
      const zone = contenu.querySelector("[data-v-erreur]");
      if (!zone) return;
      zone.textContent = message;
      zone.hidden = false;
      section.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    /** Voiture jointe à la demande enregistrée (POST /api/leads). */
    location() {
      const r = calcul();
      if (!r) return null;
      return { vehicule: r.vehicule.id, ...r.demande, conditionsConducteur: r.attestation, montant: r.devis.ok ? r.devis.total : 0 };
    },
    libelleFormule: r => (r && r.devis.chauffeur ? "avec chauffeur" : "sans chauffeur"),
    prix
  };

  document.addEventListener("dl:langue", () => { if (etat.charge) { rendre(); afficherOccupations(); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", charger);
  else charger();
})();
