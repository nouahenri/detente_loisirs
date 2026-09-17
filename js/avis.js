/* =========================================================================
   AVIS DES VISITEURS — « J'aime » et commentaires notés (17/09/2026)
   =========================================================================
   · Cartes des villas, terrains et activités : nombre de « J'aime », note
     moyenne et nombre d'avis (résumé servi avec /api/content).
   · Fiche d'une villa ou d'un terrain : bouton « J'aime », avis publiés et
     formulaire (nom, note de 1 à 5 étoiles, commentaire), publié aussitôt.
   · Activités (sans fiche détaillée) : bouton « Avis » sur la carte, qui ouvre
     la même section dans une fenêtre.
   Le studio peut masquer ou supprimer un commentaire depuis la fiche de
   l'annonce. Aucun compte visiteur : un jeton aléatoire gardé par le
   navigateur identifie le « J'aime ».
   ========================================================================= */
(function () {
  "use strict";

  const TEXTES = {
    fr: {
      titre: "Avis des visiteurs", jaime: "J’aime", aime: "Vous aimez", aucun: "Aucun avis pour le moment : soyez le premier à partager votre expérience.",
      avis: n => `${n} avis`, surCinq: "/ 5", laisser: "Laisser un avis", nom: "Votre nom", note: "Votre note", commentaire: "Votre commentaire",
      publier: "Publier mon avis", envoi: "Publication…", merci: "Merci ! Votre avis est publié.", voirTout: n => `Voir les ${n} avis`,
      erreur: "Envoi impossible pour le moment. Réessayez plus tard.", etoiles: n => `${n} étoile${n > 1 ? "s" : ""} sur 5`, bouton: "Avis", voirAvis: "Voir les avis",
      fermer: "Fermer", choisirNote: "Choisissez une note de 1 à 5 étoiles."
    },
    en: {
      titre: "Visitor reviews", jaime: "Like", aime: "You like this", aucun: "No reviews yet: be the first to share your experience.",
      avis: n => `${n} review${n === 1 ? "" : "s"}`, surCinq: "/ 5", laisser: "Leave a review", nom: "Your name", note: "Your rating", commentaire: "Your comment",
      publier: "Post my review", envoi: "Posting…", merci: "Thank you! Your review is live.", voirTout: n => `See all ${n} reviews`,
      erreur: "Could not send right now. Please try again later.", etoiles: n => `${n} star${n > 1 ? "s" : ""} out of 5`, bouton: "Reviews", voirAvis: "See the reviews",
      fermer: "Close", choisirNote: "Choose a rating from 1 to 5 stars."
    },
    es: {
      titre: "Opiniones de los visitantes", jaime: "Me gusta", aime: "Te gusta", aucun: "Aún no hay opiniones: sea el primero en compartir su experiencia.",
      avis: n => `${n} ${n === 1 ? "opinión" : "opiniones"}`, surCinq: "/ 5", laisser: "Dejar una opinión", nom: "Su nombre", note: "Su nota", commentaire: "Su comentario",
      publier: "Publicar mi opinión", envoi: "Publicando…", merci: "¡Gracias! Su opinión está publicada.", voirTout: n => `Ver las ${n} opiniones`,
      erreur: "No se pudo enviar ahora. Inténtelo más tarde.", etoiles: n => `${n} estrella${n > 1 ? "s" : ""} de 5`, bouton: "Opiniones", voirAvis: "Ver las opiniones",
      fermer: "Cerrar", choisirNote: "Elija una nota de 1 a 5 estrellas."
    }
  };
  const langue = () => (typeof I18N !== "undefined" && TEXTES[I18N.langue()] ? I18N.langue() : "fr");
  const t = (cle, ...args) => { const valeur = TEXTES[langue()][cle]; return typeof valeur === "function" ? valeur(...args) : valeur; };
  const esc = valeur => String(valeur ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COEUR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const APERCU = 3;

  /** Jeton aléatoire du navigateur : identifie le « J'aime » sans compte. */
  function visiteur() {
    try {
      let jeton = localStorage.getItem("dl-visiteur");
      if (!jeton || !/^[A-Za-z0-9-]{16,64}$/.test(jeton)) {
        jeton = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}-v`);
        localStorage.setItem("dl-visiteur", jeton);
      }
      return jeton;
    } catch { return ""; }
  }

  function donneesAnnonces(kind) {
    if (kind === "villa") return typeof VILLAS_DATA !== "undefined" ? VILLAS_DATA : [];
    if (kind === "terrain") return typeof TERRAINS_DATA !== "undefined" ? TERRAINS_DATA : [];
    return typeof ACTIVITIES_DATA !== "undefined" ? ACTIVITIES_DATA : [];
  }

  const nombre = valeur => new Intl.NumberFormat(langue() === "fr" ? "fr-FR" : langue() === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 1 }).format(valeur);
  const etoiles = note => `<span class="avis-etoiles" role="img" aria-label="${esc(t("etoiles", Math.round(note)))}">${"★".repeat(Math.round(note))}<span>${"★".repeat(5 - Math.round(note))}</span></span>`;

  /**
   * Résumé compact d'une carte : J'aime, puis « ★ note · N avis » cliquable
   * (demande du 17/09/2026) qui ouvre la fiche directement sur les avis.
   */
  function resumeHTML(avis, kind, id) {
    const a = avis || { likes: 0, note: null, nombre: 0 };
    return `<div class="avis-resume" data-avis-resume="${esc(kind)}:${esc(id)}">
      <span class="avis-resume-likes" title="${esc(t("jaime"))}">${COEUR} ${a.likes}</span>
      <button type="button" class="avis-resume-lien" data-avis-voir="${esc(kind)}:${esc(id)}" aria-label="${esc(`${t("voirAvis")} (${t("avis", a.nombre)})`)}">${a.nombre ? `<span class="avis-resume-note">★ ${nombre(a.note)}</span> · ` : ""}${esc(t("avis", a.nombre))}</button>
    </div>`;
  }

  function decorerCartes() {
    const cibles = [
      ["villa", ".property-card[data-id]", ".property-card-title-row"],
      ["terrain", ".terrain-card[data-id]", ".terrain-card-title"],
      ["activity", ".activity-card[data-id]", ".activity-card-title"]
    ];
    for (const [kind, selecteur, ancre] of cibles) {
      document.querySelectorAll(selecteur).forEach(carte => {
        const id = carte.getAttribute("data-id");
        const item = donneesAnnonces(kind).find(entree => entree.id === id);
        if (!item) return;
        carte.querySelector(".avis-resume")?.remove();
        const repere = carte.querySelector(ancre);
        if (repere) repere.insertAdjacentHTML("afterend", resumeHTML(item.avis, kind, id));
      });
    }
  }

  function majResumes(kind, id, resume) {
    const item = donneesAnnonces(kind).find(entree => entree.id === id);
    if (item) item.avis = { likes: resume.likes, note: resume.note, nombre: resume.nombre };
    document.querySelectorAll(`[data-avis-resume="${CSS.escape(`${kind}:${id}`)}"]`).forEach(bloc => {
      bloc.outerHTML = resumeHTML(item?.avis || resume, kind, id);
    });
  }

  const dateCourte = valeur => {
    try { return new Intl.DateTimeFormat(langue() === "fr" ? "fr-FR" : langue() === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(valeur)); }
    catch { return ""; }
  };

  function commentaireHTML(c) {
    return `<li class="avis-commentaire"><div class="avis-commentaire-tete"><strong>${esc(c.nom)}</strong>${etoiles(c.note)}<time datetime="${esc(c.creeLe)}">${esc(dateCourte(c.creeLe))}</time></div><p>${esc(c.commentaire).replace(/\n/g, "<br>")}</p></li>`;
  }

  // Fiche ouverte depuis « N avis » : la section défile jusqu'aux avis une fois rendue.
  let ancreAvis = null;

  function allerAuxAvis(hote, kind, id) {
    if (!ancreAvis || ancreAvis !== `${kind}:${id}`) return;
    ancreAvis = null;
    // Après le focus que la fiche pose sur « Fermer » à l'ouverture (30 ms),
    // qui la ramènerait en haut : le focus passe au titre des avis.
    window.setTimeout(() => {
      const section = hote.querySelector(".avis-annonce");
      if (!section) return;
      const titre = section.querySelector("h3");
      if (titre) { titre.setAttribute("tabindex", "-1"); titre.focus({ preventScroll: true }); }
      const bouger = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      section.scrollIntoView({ behavior: bouger, block: "start" });
    }, 150);
  }

  /** Section complète des avis d'une annonce, dans `hote`. */
  async function rendreSection(hote, kind, id) {
    hote.innerHTML = `<section class="avis-annonce" aria-live="polite"><h3 class="modal-section-title">${esc(t("titre"))}</h3><p class="avis-chargement">…</p></section>`;
    let donnees;
    try {
      const reponse = await fetch(`/api/avis?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}&visiteur=${encodeURIComponent(visiteur())}`, { cache: "no-store" });
      donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error);
    } catch {
      hote.innerHTML = "";
      return;
    }
    let tous = false;
    const dessiner = () => {
      const liste = tous ? donnees.commentaires : donnees.commentaires.slice(0, APERCU);
      hote.innerHTML = `<section class="avis-annonce" aria-live="polite">
        <div class="avis-entete">
          <h3 class="modal-section-title">${esc(t("titre"))}</h3>
          <button type="button" class="avis-jaime${donnees.jaime ? " est-aime" : ""}" aria-pressed="${donnees.jaime}" title="${esc(donnees.jaime ? t("aime") : t("jaime"))}">${COEUR}<span>${esc(t("jaime"))}</span><strong>${donnees.likes}</strong></button>
        </div>
        ${donnees.nombre ? `<p class="avis-synthese">${etoiles(donnees.note)}<strong>${nombre(donnees.note)}</strong> ${esc(t("surCinq"))} · ${esc(t("avis", donnees.nombre))}</p>` : `<p class="avis-vide">${esc(t("aucun"))}</p>`}
        ${liste.length ? `<ol class="avis-liste">${liste.map(commentaireHTML).join("")}</ol>` : ""}
        ${!tous && donnees.commentaires.length > APERCU ? `<button type="button" class="avis-voir-tout">${esc(t("voirTout", donnees.commentaires.length))}</button>` : ""}
        <form class="avis-form" novalidate>
          <h4>${esc(t("laisser"))}</h4>
          <label>${esc(t("nom"))}<input name="nom" maxlength="60" autocomplete="name" required></label>
          <fieldset class="avis-choix-note"><legend>${esc(t("note"))}</legend><div class="avis-etoiles-saisie">
            ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="note" value="${n}" id="avis-${esc(kind)}-${esc(id)}-${n}"><label for="avis-${esc(kind)}-${esc(id)}-${n}" title="${esc(t("etoiles", n))}">★</label>`).join("")}
          </div></fieldset>
          <label>${esc(t("commentaire"))}<textarea name="commentaire" rows="3" maxlength="1000" required></textarea></label>
          <label class="avis-piege" aria-hidden="true">Site<input name="site" tabindex="-1" autocomplete="off"></label>
          <p class="avis-message" role="status"></p>
          <button type="submit" class="avis-publier">${esc(t("publier"))}</button>
        </form>
      </section>`;

      hote.querySelector(".avis-voir-tout")?.addEventListener("click", () => { tous = true; dessiner(); });

      hote.querySelector(".avis-jaime").addEventListener("click", async event => {
        const bouton = event.currentTarget;
        bouton.disabled = true;
        try {
          const reponse = await fetch("/api/avis/jaime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, visiteur: visiteur() }) });
          const resultat = await reponse.json();
          if (!reponse.ok) throw new Error(resultat.error);
          Object.assign(donnees, { jaime: resultat.jaime, likes: resultat.likes, note: resultat.note, nombre: resultat.nombre });
          majResumes(kind, id, resultat);
          dessiner();
        } catch { bouton.disabled = false; }
      });

      const formulaire = hote.querySelector(".avis-form");
      formulaire.addEventListener("submit", async event => {
        event.preventDefault();
        const message = formulaire.querySelector(".avis-message");
        const valeurs = Object.fromEntries(new FormData(formulaire));
        if (!valeurs.note) { message.textContent = t("choisirNote"); message.className = "avis-message erreur"; return; }
        const bouton = formulaire.querySelector(".avis-publier");
        bouton.disabled = true; bouton.textContent = t("envoi");
        try {
          const reponse = await fetch("/api/avis/commentaires", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, id, nom: valeurs.nom, note: Number(valeurs.note), commentaire: valeurs.commentaire, site: valeurs.site, visiteur: visiteur() })
          });
          const resultat = await reponse.json();
          if (!reponse.ok) throw Object.assign(new Error(resultat.error || t("erreur")), { visible: reponse.status === 422 || reponse.status === 429 });
          donnees.commentaires.unshift(resultat.commentaire);
          Object.assign(donnees, { likes: resultat.likes, note: resultat.note, nombre: resultat.nombre });
          majResumes(kind, id, resultat);
          dessiner();
          const confirmation = hote.querySelector(".avis-message");
          confirmation.textContent = t("merci"); confirmation.className = "avis-message succes";
        } catch (error) {
          message.textContent = error.visible ? error.message : t("erreur");
          message.className = "avis-message erreur";
          bouton.disabled = false; bouton.textContent = t("publier");
        }
      });
    };
    dessiner();
    allerAuxAvis(hote, kind, id);
  }

  /** Fiche d'une villa ou d'un terrain ouverte : section des avis en fin de fiche. */
  window.addEventListener("dl:annonce-ouverte", event => {
    const { kind, id, conteneur } = event.detail || {};
    if (!conteneur || !kind || !id) return;
    let hote = conteneur.querySelector(".avis-hote");
    if (!hote) {
      hote = document.createElement("div");
      hote.className = "avis-hote";
      conteneur.appendChild(hote);
    }
    rendreSection(hote, kind, id);
  });

  /** Activité : fenêtre d'avis ouverte depuis la carte. */
  function ouvrirFenetreActivite(id) {
    const activite = donneesAnnonces("activity").find(item => item.id === id);
    if (!activite) return;
    document.querySelector(".avis-fenetre")?.remove();
    const titre = typeof ficheTexte === "function" ? ficheTexte(activite, "title") : activite.title;
    document.body.insertAdjacentHTML("beforeend", `<div class="avis-fenetre" role="dialog" aria-modal="true" aria-label="${esc(`${t("titre")} — ${titre}`)}"><div class="avis-fenetre-contenu"><button type="button" class="avis-fenetre-fermer" aria-label="${esc(t("fermer"))}">×</button><p class="avis-fenetre-titre">${esc(titre)}</p><div class="avis-hote"></div></div></div>`);
    const fenetre = document.querySelector(".avis-fenetre");
    const precedent = document.activeElement;
    const fermer = () => { fenetre.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", echap); if (precedent instanceof HTMLElement) precedent.focus(); };
    const echap = e => { if (e.key === "Escape") fermer(); };
    fenetre.addEventListener("click", e => { if (e.target === fenetre) fermer(); });
    fenetre.querySelector(".avis-fenetre-fermer").addEventListener("click", fermer);
    document.addEventListener("keydown", echap);
    document.body.style.overflow = "hidden";
    fenetre.querySelector(".avis-fenetre-fermer").focus();
    rendreSection(fenetre.querySelector(".avis-hote"), "activity", id);
  }

  document.addEventListener("click", event => {
    const lien = event.target.closest("[data-avis-voir]");
    if (!lien) return;
    // La carte elle-même peut réagir au clic : seul le lien agit ici.
    event.preventDefault();
    event.stopPropagation();
    const [kind, ...reste] = lien.getAttribute("data-avis-voir").split(":");
    const id = reste.join(":");
    ancreAvis = `${kind}:${id}`;
    if (kind === "activity") ouvrirFenetreActivite(id);
    else if (kind === "villa" && typeof openVillaModal === "function") openVillaModal(id);
    else if (kind === "terrain" && typeof openTerrainModal === "function") openTerrainModal(id);
    else ancreAvis = null;
  }, true);
  window.addEventListener("dl:cards-rendered", decorerCartes);
  if (document.readyState !== "loading") decorerCartes();
  else document.addEventListener("DOMContentLoaded", decorerCartes);
})();
