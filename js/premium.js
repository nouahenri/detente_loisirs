/**
 * Traduction des libellés écrits par ce fichier. Repli sur le texte français
 * si js/i18n.js n'est pas chargé : la page doit rester lisible.
 */
function TP(cle, secours) {
  if (typeof I18N === "undefined") return secours;
  return I18N.t(cle) || secours;
}

/** Texte traduit d'une fiche (studio), repli sur le français. */
function texteFiche(item, champ) {
  if (typeof I18N !== "undefined" && typeof I18N.fiche === "function") return I18N.fiche(item, champ);
  return item ? item[champ] : "";
}

/* Expérience premium partagée : slider, carnet de séjour, formulaires et social wall. */
(function () {
  const STORE_KEY = 'dl-assinie-trip';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  window.addEventListener('dl:cards-rendered', enhanceDynamicCards);
  window.addEventListener('dl:public-content-ready', () => {
    createHomeExperiences();
    enhanceDynamicCards();
    loadSocialWall();
  });
  window.addEventListener('dl:trip-updated', renderTrip);
  window.addEventListener('dl:toast', event => toast(event.detail || 'Action effectuée'));

  document.addEventListener('DOMContentLoaded', () => {
    // La capture newsletter passe EN PREMIER et chaque initialisation est
    // isolée : une exception dans le slider ou le carnet de séjour ne doit plus
    // empêcher l'inscription de fonctionner. Sans cette isolation, un incident
    // dans une fonction décorative suffisait à priver le site de tout abonné.
    safe(initNewsletterCapture);
    safe(injectConciergeStatus);
    safe(initHeroSlider);
    safe(initTripPlanner);
    // Lien « Espace gestion » retiré du pied de page (demande du 2026-09-10).
    // Outre la demande, cela évite d'indiquer publiquement l'adresse du
    // back-office : un lien visible sur chaque page invite au forçage brut.
    // L'administration reste accessible directement par /admin.html.
    safe(applyManagedSettings);
    safe(loadSocialWall);
    window.setTimeout(() => safe(enhanceDynamicCards), 250);
    window.setTimeout(() => safe(enhanceDynamicCards), 900);
  });

  /** Exécute une initialisation sans laisser son échec interrompre les autres. */
  function safe(fn) {
    try { fn(); } catch (error) { console.error(`[premium] ${fn.name} a échoué :`, error); }
  }

  function injectConciergeStatus() {
    const hero = $('.hero-content');
    if (!hero || $('.concierge-live', hero)) return;
    hero.insertAdjacentHTML('afterbegin', '<span class="concierge-live">Conciergerie disponible aujourd’hui · 7h–22h</span>');
  }

  function initHeroSlider() {
    const hero = $('.hero-section');
    if (!hero) return;
    /* Trois scènes (20/09/2026) : résidences, activités, voitures. Chacune a
       son texte dans la page (`.hero-chapitre`) : le diaporama fait défiler
       l'image ET le texte ensemble, plutôt qu'une image sous un texte fixe. */
    const slides = [
      { image: 'assets/images/residence-villa-luxe.jpg', cle: 'js.slideVillas', label: 'Villas signature' },
      { image: 'assets/images/banner-loisirs.jpg', cle: 'js.slideExperiences', label: 'Plage, Détente & Loisirs' },
      { image: 'assets/images/banner-voitures.jpg', cle: 'js.slideVoitures', label: 'Location de voitures' }
    ];
    hero.style.backgroundImage = 'none';
    // Un fragment, puis un seul `prepend` : trois `prepend` successifs
    // rangeaient les couches à l'envers, et l'image affichée ne correspondait
    // ni à son libellé ni à son point (corrigé le 20/09/2026).
    const couches = document.createDocumentFragment();
    slides.forEach((slide, index) => {
      const layer = document.createElement('div');
      layer.className = `hero-media-layer${index === 0 ? ' is-active' : ''}`;
      layer.style.backgroundImage = `url('${slide.image}')`;
      layer.setAttribute('aria-hidden', 'true');
      couches.appendChild(layer);
    });
    // Voile de lisibilité : un élément à part, pour ne pas toucher à la vague
    // décorative de premium.css (.hero-section::after), qu'un simple fond
    // suffisait à transformer en arc sombre en haut du hero.
    const voile = document.createElement('div');
    voile.className = 'hero-voile';
    voile.setAttribute('aria-hidden', 'true');
    couches.appendChild(voile);
    hero.prepend(couches);
    hero.insertAdjacentHTML('beforeend', `<div class="hero-slider-ui"><span class="hero-slide-label" data-i18n="${slides[0].cle}">${slides[0].label}</span>${slides.map((_, i) => `<button class="hero-dot${i === 0 ? ' is-active' : ''}" aria-label="Afficher la vue ${i + 1}" data-slide="${i}"></button>`).join('')}</div>`);
    let active = 0;
    let timer;
    const setSlide = index => {
      active = index;
      $$('.hero-media-layer', hero).forEach((layer, i) => layer.classList.toggle('is-active', i === active));
      // Le texte suit l'image : un chapitre par scène, le premier par défaut
      // si la page n'en compte qu'un (autres pages que l'accueil).
      const chapitres = $$('.hero-chapitre', hero);
      if (chapitres.length > 1) chapitres.forEach((chapitre, i) => {
        chapitre.classList.toggle('is-active', i === active % chapitres.length);
        chapitre.setAttribute('aria-hidden', String(i !== active % chapitres.length));
      });
      $$('.hero-dot', hero).forEach((dot, i) => {
        dot.classList.toggle('is-active', i === active);
        dot.setAttribute('aria-pressed', String(i === active));
      });
      const etiquette = $('.hero-slide-label', hero);
      etiquette.setAttribute('data-i18n', slides[active].cle);
      etiquette.textContent = TP(slides[active].cle, slides[active].label);
    };
    const autoplay = () => { window.clearInterval(timer); timer = window.setInterval(() => setSlide((active + 1) % slides.length), 6200); };
    $$('.hero-dot', hero).forEach(dot => dot.addEventListener('click', () => { setSlide(Number(dot.dataset.slide)); autoplay(); }));
    autoplay();
  }

  function createHomeExperiences() {
    const grid = $('#featuredVillasGrid');
    if (!grid || $('#homeExperiences') || typeof ACTIVITIES_DATA === 'undefined') return;
    const items = ACTIVITIES_DATA.filter(item => item.featured).concat(ACTIVITIES_DATA.filter(item => !item.featured)).slice(0, 3);
    const section = document.createElement('section');
    section.id = 'homeExperiences';
    section.className = 'home-experiences';
    const tileImage = item => (typeof window.responsiveImageHTML === 'function'
      ? window.responsiveImageHTML(item.image, { alt: texteFiche(item, 'title'), sizes: '(max-width: 768px) 100vw, 33vw' })
      : `<img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" loading="lazy" decoding="async">`);
    section.innerHTML = `<div class="container"><div class="home-experiences-head"><div><span class="section-tag">ASSINIE À VOTRE RYTHME</span><h2 class="section-title">Bien plus qu’une villa.<br>Votre séjour prend vie.</h2></div><p>Composez un week-end qui vous ressemble : lever de soleil sur la lagune, déjeuner signé par un chef et sensations fortes au fil de l’eau.</p></div><div class="experience-showcase">${items.map(item => `<article class="experience-tile">${tileImage(item)}<div class="experience-tile-content"><span class="micro">${escapeHTML(typeof libelleReferentiel === 'function' ? libelleReferentiel('badges', item.badgeId, item.badge) : item.badge)}</span><h3>${escapeHTML(texteFiche(item, 'title'))}</h3><p>${escapeHTML(texteFiche(item, 'duration'))} · ${escapeHTML(typeof tarifActivite === 'function' ? tarifActivite(item) : item.price)}</p><a class="experience-tile-link" href="loisirs.html">Découvrir l’expérience →</a></div></article>`).join('')}</div><div style="text-align:center;margin-top:2rem"><a href="loisirs.html" class="btn btn-forest">Voir toutes les activités →</a></div></div>`;
    // La section « Terrains à vendre » reste juste après les villas vedettes.
    const anchor = document.getElementById('homeTerrains') || grid.closest('section');
    anchor.insertAdjacentElement('afterend', section);
    if (typeof initScrollReveal === 'function') initScrollReveal();
  }

  function tripItems() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
  }

  function saveTrip(items) {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
    renderTrip();
  }

  function initTripPlanner() {
    if ($('.trip-trigger')) return;
    document.body.insertAdjacentHTML('beforeend', `<button class="trip-trigger" type="button" aria-expanded="false" aria-controls="tripDrawer"><span data-i18n="js.monSejour">${TP('js.monSejour', 'Mon séjour')}</span> <b>0</b></button><aside class="trip-drawer" id="tripDrawer" aria-hidden="true" inert aria-labelledby="tripDrawerTitle"><div class="trip-drawer-head"><div><small data-i18n="js.votreCarnet">${TP('js.votreCarnet', 'VOTRE CARNET')}</small><h3 id="tripDrawerTitle" data-i18n="js.carnetTitre">${TP('js.carnetTitre', 'Mon séjour à Assinie')}</h3></div><button type="button" class="trip-close" aria-label="${TP('js.fermerCarnet', 'Fermer le carnet')}">×</button></div><div class="trip-items"></div><div class="trip-footer"><a href="devis.html" data-i18n="js.estimerSejour">${TP('js.estimerSejour', 'Estimer mon séjour')}</a></div></aside><div class="toast-stack" aria-live="polite" aria-atomic="true"></div>`);
    // Fragment ajouté APRÈS le premier passage de js/i18n.js : on le traduit
    // explicitement, sinon il resterait en français jusqu'au prochain clic.
    if (typeof I18N !== 'undefined') I18N.appliquer(document.body);
    $('.trip-trigger').addEventListener('click', () => toggleTrip(true));
    $('.trip-close').addEventListener('click', () => toggleTrip(false));
    $('.trip-items').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-trip]');
      if (!button) return;
      saveTrip(tripItems().filter(item => item.id !== button.dataset.removeTrip));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('.trip-drawer')?.classList.contains('is-open')) toggleTrip(false);
    });
    renderTrip();
  }

  function toggleTrip(open) {
    const drawer = $('.trip-drawer');
    if (!drawer) return;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    // Fermé, le tiroir est inerte : ni focusable au clavier, ni lu par les
    // lecteurs d'écran, même s'il reste translaté hors écran par le CSS.
    if (open) drawer.removeAttribute('inert'); else drawer.setAttribute('inert', '');
    $('.trip-trigger')?.setAttribute('aria-expanded', String(open));
    if (open) $('.trip-close')?.focus(); else $('.trip-trigger')?.focus();
  }

  function enhanceDynamicCards() {
    $$('.property-card').forEach(card => {
      if ($('.btn-trip-add', card)) return;
      const id = card.dataset.id;
      const villa = typeof VILLAS_DATA !== 'undefined' ? VILLAS_DATA.find(item => item.id === id) : null;
      const host = $('.property-img-wrapper', card);
      if (!host || !villa) return;
      host.insertAdjacentHTML('beforeend', `<button class="btn-trip-add" data-trip-id="${villa.id}" data-trip-type="villa">＋ Carnet</button>`);
    });
    $$('.activity-card').forEach((card, index) => {
      if ($('.btn-trip-add', card)) return;
      const item = typeof ACTIVITIES_DATA !== 'undefined' ? ACTIVITIES_DATA.find(activity => activity.id === card.dataset.id) || ACTIVITIES_DATA[index] : null;
      const host = $('.activity-img-wrap', card);
      if (!host || !item) return;
      host.insertAdjacentHTML('beforeend', `<button class="btn-trip-add" data-trip-id="${item.id}" data-trip-type="activity">＋ Carnet</button>`);
    });
    $$('[data-trip-id]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        const source = button.dataset.tripType === 'villa' ? VILLAS_DATA : ACTIVITIES_DATA;
        const record = source.find(item => item.id === button.dataset.tripId);
        if (!record) return;
        const current = tripItems();
        if (!current.some(item => item.id === record.id)) {
          current.push({ id: record.id, type: button.dataset.tripType, title: record.name || record.title, image: record.images?.[0] || record.image });
          saveTrip(current);
          toast('Ajouté à votre carnet de séjour');
        } else toast('Déjà présent dans votre carnet');
      });
    });
  }

  function renderTrip() {
    const count = $('.trip-trigger b');
    const container = $('.trip-items');
    if (!count || !container) return;
    const items = tripItems();
    count.textContent = items.length;
    container.innerHTML = items.length ? items.map(item => `<article class="trip-item"><img src="${item.image}" alt=""><h4>${escapeHTML(item.title)}</h4><button class="trip-remove" data-remove-trip="${item.id}" aria-label="Retirer">×</button></article>`).join('') : '<div class="trip-empty"><p>Votre carnet est vide.</p><small>Ajoutez des villas et activités pour composer votre séjour.</small></div>';
  }

  function initNewsletterCapture() {
    $$('.newsletter-ochre-form').forEach(form => {
      form.onsubmit = null;
      // Zone de repli, lue par les lecteurs d'écran et affichée si la modale
      // ne peut pas s'ouvrir. Le message visible part dans la modale.
      const feedback = document.createElement('p');
      feedback.className = 'newsletter-feedback';
      feedback.setAttribute('role', 'status');
      form.insertAdjacentElement('afterend', feedback);
      let sending = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); event.stopImmediatePropagation();
        if (sending) return;
        const email = $('input[type="email"]', form)?.value || '';
        const phone = $('input[type="tel"]', form)?.value || '';
        const button = $('button[type="submit"], button:not([type])', form);
        sending = true;
        if (button) button.disabled = true;
        feedback.textContent = 'Inscription en cours…';
        try {
          const response = await fetch('/api/newsletter', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, phone, source: 'site' })
          });
          const result = await response.json();
          if (!response.ok || result.ok !== true) throw new Error(result.error || 'Inscription impossible. Merci de réessayer.');
          form.reset();
          feedback.textContent = '';
          openNewsletterModal({
            titre: 'Merci de votre inscription',
            message: result.message || 'Inscription reçue. Consultez votre e-mail pour la confirmer.',
            ton: 'succes'
          });
        } catch (error) {
          // Un fetch en échec n'a RIEN transmis : ne laissons pas croire que
          // l'adresse est enregistrée quelque part, elle ne l'est pas.
          const message = error instanceof TypeError
            ? 'Connexion au serveur impossible. Votre adresse n’a pas été enregistrée : vérifiez votre connexion et réessayez.'
            : (error.message || 'Inscription impossible. Merci de réessayer.');
          feedback.textContent = '';
          openNewsletterModal({ titre: 'Inscription non aboutie', message, ton: 'erreur' });
        } finally {
          sending = false;
          if (button) button.disabled = false;
        }
      }, true);
    });
  }

  /**
   * Modale de confirmation, centrée et partagée par tous les bandeaux.
   *
   * Construite une seule fois puis réutilisée. Accessibilité : le focus part
   * sur le bouton de fermeture et revient ensuite à l'élément d'origine ;
   * Échap, la croix et le clic sur le fond ferment la fenêtre.
   */
  let modaleNewsletter = null;
  function openNewsletterModal({ titre, message, ton = 'succes' }) {
    const origine = document.activeElement;
    if (!modaleNewsletter) {
      const fond = document.createElement('div');
      fond.className = 'newsletter-modal';
      fond.hidden = true;
      fond.innerHTML = `<div class="newsletter-modal-box" role="dialog" aria-modal="true" aria-labelledby="newsletterModalTitre">
        <button type="button" class="newsletter-modal-close" aria-label="Fermer">&times;</button>
        <div class="newsletter-modal-icon" aria-hidden="true"></div>
        <h3 id="newsletterModalTitre"></h3>
        <p class="newsletter-modal-text"></p>
        <button type="button" class="newsletter-modal-ok">Fermer</button>
      </div>`;
      document.body.appendChild(fond);
      const fermer = () => closeNewsletterModal();
      $('.newsletter-modal-close', fond).addEventListener('click', fermer);
      $('.newsletter-modal-ok', fond).addEventListener('click', fermer);
      fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !fond.hidden) fermer();
      });
      modaleNewsletter = fond;
    }
    const boite = $('.newsletter-modal-box', modaleNewsletter);
    boite.classList.toggle('is-erreur', ton === 'erreur');
    $('.newsletter-modal-icon', modaleNewsletter).textContent = ton === 'erreur' ? '!' : '✓';
    $('#newsletterModalTitre', modaleNewsletter).textContent = titre;
    $('.newsletter-modal-text', modaleNewsletter).textContent = message;
    modaleNewsletter.hidden = false;
    document.body.classList.add('has-newsletter-modal');
    modaleNewsletter.retourFocus = origine;
    $('.newsletter-modal-close', modaleNewsletter).focus();
  }

  function closeNewsletterModal() {
    if (!modaleNewsletter || modaleNewsletter.hidden) return;
    modaleNewsletter.hidden = true;
    document.body.classList.remove('has-newsletter-modal');
    const retour = modaleNewsletter.retourFocus;
    if (retour && typeof retour.focus === 'function') retour.focus();
  }

  async function applyManagedSettings() {
    let settings = window.DL_MANAGED_CONTENT?.settings;
    if (!settings) {
      try { settings = (await fetch('/api/content', { cache: 'no-store' }).then(response => response.json())).settings; } catch { return; }
    }
    if (!settings) return;
    if (settings.heroTitle && $('.hero-title')) {
      const title = $('.hero-title');
      const accent = $('.hero-animated-word', title);
      const words = String(settings.heroTitle).trim().split(/\s+/);
      const lastWord = words.pop() || '';
      if (accent) {
        [...title.childNodes].filter(node => node !== accent).forEach(node => node.remove());
        title.insertBefore(document.createTextNode(`${words.join(' ')} `), accent);
        accent.textContent = lastWord;
      } else {
        title.textContent = settings.heroTitle;
      }
    }
    if (settings.heroSubtitle && $('.hero-subtitle')) $('.hero-subtitle').textContent = settings.heroSubtitle;
  }

  // =========================================================================
  // MUR SOCIAL — carrousel de publications présentées comme les annonces
  // -------------------------------------------------------------------------
  // Demande du 12/09/2026 : les publications de la Page doivent se lire comme
  // les fiches du catalogue, et non comme un encart à part. On réemploie donc
  // littéralement les classes des annonces (.property-card, .property-img-
  // wrapper, .btn-property-detail) et la coque de la vue détaillée
  // (.villa-modal-overlay) : même carte, même modale, même vocabulaire visuel.
  //
  // Le carrousel remplace la grille de trois : les publications s'accumulent
  // au fil des mois, une grille les aurait fait descendre la page sans fin.
  // =========================================================================
  const MAX_PUBLICATIONS_MUR = 12;
  // Même numéro que le bouton flottant et les fiches de résidence.
  const NUMERO_WHATSAPP = '2250767696318';
  let publicationsSociales = [];

  async function loadSocialWall() {
    // Deux points de chute : le carrousel de l'accueil et la rubrique
    // « Depuis Facebook » du catalogue. Les deux puisent dans la MÊME liste,
    // pour que les index de la vue détaillée restent cohérents entre les
    // deux pages.
    const surAccueil = Boolean($('#featuredVillasGrid'));
    const grilleCatalogue = $('#cataloguePublicationsGrid');
    if (!surAccueil && !grilleCatalogue) return;
    try {
      const content = window.DL_MANAGED_CONTENT || await fetch('/api/content', { cache: 'no-store' }).then(response => response.json());
      const posts = (content.facebookPosts || []).filter(post => post && (post.message || post.full_picture));
      if (!posts.length) return;
      publicationsSociales = posts;
      if (grilleCatalogue && !grilleCatalogue.dataset.rempli) remplirCataloguePublications(grilleCatalogue);
      if (!surAccueil || $('#socialWall')) return;
      // Point d'accroche : la section des villas vedettes, dont le bouton
      // « Voir tout le catalogue » ferme désormais la marche. Le mur social
      // se lit donc juste après lui (demande du 12/09/2026). Les replis
      // successifs évitent que la section disparaisse en silence le jour où
      // un identifiant change.
      const anchor = $('#featuredVillasGrid')?.closest('section') || $('#homeTerrains') || $('#homeExperiences');
      if (!anchor) return;

      const pourLeCarrousel = publicationsSociales.slice(0, MAX_PUBLICATIONS_MUR);
      const pageFacebook = window.DL_MANAGED_CONTENT?.settings?.facebookPage
        || 'https://web.facebook.com/profile.php?id=100737595756553';

      const section = document.createElement('section');
      section.id = 'socialWall';
      section.className = 'social-wall';
      section.innerHTML = `<div class="container">
        <div class="social-wall-head">
          <div><span class="section-tag">EN DIRECT DE FACEBOOK</span><h2 class="section-title">La vie à Assinie,<br>en temps réel.</h2></div>
          <a href="${escapeHTML(pageFacebook)}" target="_blank" rel="noopener">Suivre la page →</a>
        </div>
        <div class="social-wall-carrousel">
          <button type="button" class="social-wall-fleche social-wall-fleche-avant" data-sens="-1" aria-label="Publications précédentes" aria-controls="socialWallPiste">‹</button>
          <ul class="social-wall-piste" id="socialWallPiste">${pourLeCarrousel.map(carteSociale).join('')}</ul>
          <button type="button" class="social-wall-fleche social-wall-fleche-apres" data-sens="1" aria-label="Publications suivantes" aria-controls="socialWallPiste">›</button>
        </div>
      </div>`;
      anchor.insertAdjacentElement('afterend', section);

      const piste = $('#socialWallPiste', section);
      $$('.social-wall-fleche', section).forEach(bouton => {
        bouton.addEventListener('click', () => defilerMurSocial(piste, Number(bouton.dataset.sens)));
      });
      piste.addEventListener('scroll', () => majFlechesMurSocial(section, piste), { passive: true });
      window.addEventListener('resize', () => majFlechesMurSocial(section, piste));

      // Toute la carte est cliquable, comme une annonce, et le bouton
      // « Détails » reste le point d'entrée explicite au clavier.
      $$('.social-post-card', section).forEach(carte => {
        const index = Number(carte.dataset.index);
        carte.addEventListener('click', () => ouvrirPublicationSociale(index));
        $('.btn-property-detail', carte)?.addEventListener('click', event => {
          event.stopPropagation();
          ouvrirPublicationSociale(index);
        });
      });

      majFlechesMurSocial(section, piste);
      // La section est insérée APRÈS le passage de l'observateur d'apparition :
      // sans ce rappel elle resterait à opacity 0, présente mais invisible.
      if (typeof initScrollReveal === 'function') initScrollReveal();
    } catch (erreur) {
      // Le mur social est décoratif : son échec ne doit jamais interrompre la
      // page. Il ne doit pas non plus disparaître sans un mot — un `catch {}`
      // muet a déjà masqué une faute de frappe qui privait le catalogue de
      // toute interaction, sans la moindre trace en console.
      console.warn('Mur social : ', erreur);
    }
  }


  /**
   * Rubrique « Depuis Facebook » du catalogue.
   * Mêmes cartes que le carrousel, mêmes index, même vue détaillée : une
   * publication ouverte depuis le catalogue se navigue exactement comme
   * depuis l'accueil.
   */
  function remplirCataloguePublications(grille) {
    grille.dataset.rempli = '1';
    grille.innerHTML = publicationsSociales.map(carteSociale).join('');
    $$('.social-post-card', grille).forEach(carte => {
      const index = Number(carte.dataset.index);
      carte.addEventListener('click', () => ouvrirPublicationSociale(index));
      $('.btn-property-detail', carte)?.addEventListener('click', event => {
        event.stopPropagation();
        ouvrirPublicationSociale(index);
      });
    });

    // La rubrique reste masquée dans le HTML tant qu'aucune publication n'est
    // arrivée : on la révèle seulement maintenant.
    const rubrique = document.getElementById('rubriqueFacebook');
    if (rubrique) {
      rubrique.hidden = false;
      delete rubrique.dataset.vide;
    }

    // Mêmes flèches que le carrousel de l’accueil : la rubrique du catalogue
    // est une piste défilante, pas une grille qui allonge la page.
    const cadre = grille.closest('.social-wall-carrousel');
    if (cadre) {
      $$('.social-wall-fleche', cadre).forEach(bouton => {
        bouton.addEventListener('click', () => defilerMurSocial(grille, Number(bouton.dataset.sens)));
      });
      grille.addEventListener('scroll', () => majFlechesMurSocial(cadre, grille), { passive: true });
      window.addEventListener('resize', () => majFlechesMurSocial(cadre, grille));
      majFlechesMurSocial(cadre, grille);
    }
    // Le catalogue réapplique sa recherche et ses compteurs sur ces cartes.
    window.dispatchEvent(new CustomEvent('dl:publications-rendues'));
    if (typeof initScrollReveal === 'function') initScrollReveal();
  }
  /** Titre d'une publication : sa première ligne utile, jamais un pavé. */
  function titrePublication(post) {
    const premiere = String(post.message || '')
      .split('\n')
      .map(ligne => ligne.trim())
      .find(ligne => ligne.length > 3);
    if (!premiere) return 'Publication de la Page';
    return premiere.length > 64 ? `${premiere.slice(0, 63).trimEnd()}…` : premiere;
  }

  // Le bouton porte le seul mot « Détails » : la flèche vient de
  // .btn-property-detail::after, et l ecrire aussi dans le texte en
  // affichait deux. Ce commentaire reste HORS du gabarit ci-dessous —
  // des backticks glisses dans un template literal referment la chaine.
  function carteSociale(post, index) {
    const quand = new Date(post.created_time || Date.now());
    const jour = quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const annee = quand.getFullYear();
    const titre = titrePublication(post);
    const photos = photosDuPost(post);
    const visuel = photos.length
      ? `<img src="${escapeHTML(photos[0])}" class="property-img" alt="" loading="lazy" decoding="async">`
      : '<div class="social-post-sans-image" aria-hidden="true">f</div>';
    // Un album ne montre que sa couverture sur la carte : on annonce le
    // nombre de photos pour que le visiteur sache qu'il y a plus à voir.
    const compteurPhotos = post.video
      ? ''
      : photos.length > 1
        ? `<span class="social-post-photos">${photos.length} photos</span>`
        : '';
    // Vidéo : bouton de lecture sur la vignette, lue dans la vue détaillée.
    const lecture = post.video
      ? '<span class="social-post-lecture" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5.14v13.72L19 12z"/></svg></span>'
      : '';

    // Fiche du bien renseignée dans le studio : rien n'en est affiché sur la
    // carte, mais la recherche du catalogue (js/catalogue.js) s'en sert —
    // critères pour le filtre multicritère, texte pour la recherche libre.
    const fiche = post.fiche || {};
    const criteresFiche = JSON.stringify({
      category: fiche.category || '', environment: fiche.environment || '',
      localisationId: fiche.localisationId || '',
      pricePerNight: fiche.pricePerNight ?? null, capacity: fiche.capacity ?? null,
      bedrooms: fiche.bedrooms ?? null,
      features: Array.isArray(fiche.features) ? fiche.features : [],
      equipements: Array.isArray(fiche.equipements) ? fiche.equipements : []
    });
    const texteFiche = [fiche.name, fiche.tagline, fiche.categoryLabel, fiche.location, fiche.beds, fiche.badge,
      ...(Array.isArray(fiche.features) ? fiche.features : []), ...(Array.isArray(fiche.highlights) ? fiche.highlights : [])]
      .filter(Boolean).join(' ');

    return `<li class="social-wall-item"><article class="property-card social-post-card" data-index="${index}" data-fiche="${escapeHTML(criteresFiche)}" data-recherche-texte="${escapeHTML(texteFiche)}">
      <div class="property-img-wrapper">
        ${visuel}
        <span class="badge-tag-rent">${post.video ? 'VIDÉO' : 'FACEBOOK'}</span>
        ${lecture}
        ${compteurPhotos}
      </div>
      <div class="property-card-body">
        <div class="property-card-title-row">
          <h3 class="property-card-title">${escapeHTML(titre)}</h3>
        </div>
        <div class="property-location">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
          <span>${escapeHTML(quand.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }))}</span>
        </div>
        ${ligneLieuFiche(fiche)}
        ${pastillesFiche(fiche)}
        <p class="social-post-extrait">${escapeHTML(post.message || 'Nouvelle publication depuis Assinie')}</p>
        <div class="property-card-footer">
          <div class="property-price-block">
            ${aUnTarif(fiche)
              ? `<span class="property-price">${escapeHTML(montantFCFA(fiche.pricePerNight))}</span><span class="property-period">${escapeHTML(typeof T === 'function' ? T('js.parNuitee') : '/ nuit')}</span>`
              : `<span class="property-price">${escapeHTML(jour)}</span><span class="property-period">${annee}</span>`}
          </div>
          <button type="button" class="btn-property-detail" data-index="${index}">Détails</button>
        </div>
      </div>
    </article></li>`;
  }

  /*
   * Fiche du bien sur les cartes et la vue détaillée d'une publication.
   * Corrigé le 13/09/2026 : la recherche retenait une publication pour
   * « 8 à 12 personnes » ou « Bord d'océan » sans que sa carte montre ni
   * capacité, ni lieu, ni prix. Mêmes repères et mêmes libellés que la carte
   * d'une villa ; un champ vide n'affiche rien.
   */
  // Déclarations de fonction, et non constantes fléchées : carteSociale peut
  // être appelée avant que l'exécution n'atteigne ces lignes.
  function estNombre(valeur) { return typeof valeur === 'number' && Number.isFinite(valeur); }
  function aUnTarif(fiche) { return estNombre(fiche.pricePerNight) && fiche.pricePerNight > 0; }
  function montantFCFA(valeur) {
    return typeof formatFCFA === 'function'
      ? formatFCFA(valeur)
      : `${new Intl.NumberFormat('fr-FR').format(valeur)} FCFA`;
  }

  function ligneLieuFiche(fiche) {
    if (!fiche.location) return '';
    return `<div class="property-location">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>${escapeHTML(fiche.location)}</span>
        </div>`;
  }

  function pastillesFiche(fiche) {
    // Icônes identiques à celles de la carte d'une villa (js/app.js).
    const icone = trace => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${trace}</svg>`;
    const pastilles = [
      estNombre(fiche.bedrooms) ? `<span class="amenity-pill" title="Chambres">${icone('<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>')} ${fiche.bedrooms} Ch.</span>` : '',
      estNombre(fiche.bathrooms) ? `<span class="amenity-pill" title="Salles d'eau">${icone('<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.67 3 4 3.67 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4.5c0-.83-.67-1.5-1.5-1.5-.4 0-.77.16-1.04.44L15 6"/>')} ${fiche.bathrooms} Bains</span>` : '',
      estNombre(fiche.capacity) ? `<span class="amenity-pill" title="Capacité">${icone('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>')} ${fiche.capacity} pers.</span>` : ''
    ].filter(Boolean);
    return pastilles.length ? `<div class="property-amenities-row">${pastilles.join('')}</div>` : '';
  }

  /** Repères de la fiche dans la vue détaillée, comme pour une résidence. */
  function repereFicheDetail(fiche) {
    return [
      fiche.location ? `📍 ${escapeHTML(fiche.location)}` : '',
      estNombre(fiche.capacity) ? `👥 Capacité : ${fiche.capacity} personnes` : '',
      estNombre(fiche.bedrooms) ? `🛏️ ${fiche.bedrooms} Chambres` : '',
      estNombre(fiche.bathrooms) ? `🚿 ${fiche.bathrooms} Salles de bain` : '',
      aUnTarif(fiche) ? `${escapeHTML(montantFCFA(fiche.pricePerNight))} / nuit` : ''
    ].filter(Boolean).map(texte => `<span class="spec-pill">${texte}</span>`).join('');
  }

  /** Défile d'une carte entière, quel que soit le nombre de colonnes visibles. */
  function defilerMurSocial(piste, sens) {
    const carte = $('.social-wall-item', piste);
    const pas = carte ? carte.getBoundingClientRect().width + 24 : piste.clientWidth * 0.8;
    piste.scrollBy({ left: sens * pas, behavior: 'smooth' });
  }

  /** Une flèche qui ne mène nulle part est désactivée plutôt que trompeuse. */
  function majFlechesMurSocial(section, piste) {
    const marge = 4;
    const auDebut = piste.scrollLeft <= marge;
    const aLaFin = piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - marge;
    const avant = $('.social-wall-fleche-avant', section);
    const apres = $('.social-wall-fleche-apres', section);
    if (avant) avant.disabled = auDebut;
    if (apres) apres.disabled = aLaFin;
    section.classList.toggle('sans-defilement', auDebut && aLaFin);
  }


  // ---- Galerie d'une publication ------------------------------------------
  let photosCourantes = [];
  let indexPhotoCourante = 0;
  let legendePhoto = '';

  /**
   * Photos d'une publication, de la plus fiable à la plus ancienne source.
   * `images` est renseigné depuis que la synchronisation demande les albums à
   * Graph ; `full_picture` reste le repli pour les publications importées
   * avant cette évolution, tant qu'une synchronisation ne les a pas revues.
   */
  function photosDuPost(post) {
    const liste = Array.isArray(post.images) && post.images.length
      ? post.images
      : [post.full_picture];
    return liste.filter(Boolean);
  }

  function afficherPhotoSociale(rang) {
    if (!photosCourantes.length) return;
    indexPhotoCourante = Math.max(0, Math.min(rang, photosCourantes.length - 1));
    const image = $('.modal-main-img', modaleSociale);
    image.src = photosCourantes[indexPhotoCourante];
    image.alt = photosCourantes.length > 1
      ? `${legendePhoto} — photo ${indexPhotoCourante + 1} sur ${photosCourantes.length}`
      : legendePhoto;
    $$('.social-modal-thumbs .modal-thumb', modaleSociale).forEach((vignette, rangVignette) => {
      const choisie = rangVignette === indexPhotoCourante;
      vignette.classList.toggle('active', choisie);
      vignette.setAttribute('aria-current', String(choisie));
    });
    const precedente = $('.social-photo-prec', modaleSociale);
    const suivante = $('.social-photo-suiv', modaleSociale);
    if (precedente) precedente.disabled = indexPhotoCourante <= 0;
    if (suivante) suivante.disabled = indexPhotoCourante >= photosCourantes.length - 1;
  }
  // ---- Vue de détail -------------------------------------------------------
  // Coque empruntée à la modale des résidences (.villa-modal-overlay et ses
  // enfants) : le visiteur retrouve exactement la fenêtre qu'il connaît des
  // annonces, image en haut et texte dessous.
  let modaleSociale = null;
  let indexSocialCourant = 0;
  let origineFocusSocial = null;

  function ouvrirPublicationSociale(index) {
    const post = publicationsSociales[index];
    if (!post) return;
    if (!modaleSociale) modaleSociale = construireModaleSociale();
    origineFocusSocial = document.activeElement;
    indexSocialCourant = index;

    const quand = new Date(post.created_time || Date.now());
    // Galerie de la publication. Une publication d'album porte plusieurs
    // photos : elles se parcourent ici comme celles d'une résidence, avec
    // vignettes et flèches.
    photosCourantes = photosDuPost(post);
    legendePhoto = `Publication Facebook du ${quand.toLocaleDateString('fr-FR')}`;
    const figure = $('.modal-main-media', modaleSociale);
    const bandeVignettes = $('.social-modal-thumbs', modaleSociale);
    const navGalerie = $('.modal-gallery-nav', modaleSociale);
    arreterVideoSociale();

    if (post.video && post.video.url) {
      // Vidéo ou Reel : lecteur Facebook intégré à la place de la galerie.
      // L'adresse du fichier renvoyée par Graph expire ; celle du lecteur non.
      figure.hidden = false;
      bandeVignettes.hidden = true;
      bandeVignettes.innerHTML = '';
      if (navGalerie) navGalerie.hidden = true;
      // style et non [hidden] : la règle d'affichage de l'image l'emporterait.
      $('.modal-main-img', modaleSociale).style.display = 'none';
      const cadre = document.createElement('iframe');
      cadre.className = `social-modal-video${post.video.vertical ? ' est-verticale' : ''}`;
      cadre.src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(post.video.url)}&show_text=false&autoplay=true`;
      cadre.title = `Vidéo Facebook du ${quand.toLocaleDateString('fr-FR')}`;
      cadre.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
      cadre.allowFullscreen = true;
      cadre.loading = 'lazy';
      figure.classList.add('avec-video');
      figure.appendChild(cadre);
    } else if (photosCourantes.length) {
      $('.modal-main-img', modaleSociale).style.display = '';
      figure.hidden = false;
      // Vignettes et flèches ne s'affichent que s'il y a bien de quoi
      // naviguer : une publication à photo unique ne doit pas donner
      // l'impression qu'il en manque.
      const plusieurs = photosCourantes.length > 1;
      bandeVignettes.hidden = !plusieurs;
      if (navGalerie) navGalerie.hidden = !plusieurs;
      bandeVignettes.innerHTML = plusieurs
        ? photosCourantes.map((url, rang) => `<button type="button" class="modal-thumb${rang === 0 ? ' active' : ''}" style="background-image:url('${escapeHTML(url)}')" aria-label="Afficher la photo ${rang + 1} sur ${photosCourantes.length}" aria-current="${rang === 0}" data-photo="${rang}"></button>`).join('')
        : '';
      $$('.modal-thumb', bandeVignettes).forEach(vignette => {
        vignette.addEventListener('click', () => afficherPhotoSociale(Number(vignette.dataset.photo)));
      });
      afficherPhotoSociale(0);
    } else {
      figure.hidden = true;
      bandeVignettes.hidden = true;
      if (navGalerie) navGalerie.hidden = true;
    }

    $('.social-modal-titre', modaleSociale).textContent = titrePublication(post);
    $('.modal-location', modaleSociale).textContent = quand.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const reperes = repereFicheDetail(post.fiche || {});
    const blocReperes = $('.social-modal-specs', modaleSociale);
    blocReperes.innerHTML = reperes;
    blocReperes.hidden = !reperes;

    // Le texte des publications porte ses propres retours à la ligne : on les
    // rend en paragraphes au lieu de tout aplatir en un bloc compact.
    $('.social-modal-texte', modaleSociale).innerHTML = String(post.message || 'Nouvelle publication depuis Assinie')
      .split(/\n{2,}/)
      .filter(paragraphe => paragraphe.trim())
      .map(paragraphe => `<p>${escapeHTML(paragraphe.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('') || '<p>Nouvelle publication depuis Assinie</p>';

    const lien = $('.social-modal-lien', modaleSociale);
    if (post.permalink_url) { lien.href = post.permalink_url; lien.hidden = false; }
    else { lien.hidden = true; }

    // Réservation directe, comme depuis une fiche du catalogue. Le message
    // cite la publication : la conciergerie sait de quoi on lui parle sans
    // avoir à demander « laquelle ? ».
    const whatsapp = $('.social-modal-whatsapp', modaleSociale);
    if (whatsapp) {
      const demande = [
        'Bonjour Détente & Loisirs à Assinie !',
        `Je vous écris au sujet de votre publication du ${quand.toLocaleDateString('fr-FR')} : « ${titrePublication(post)} ».`,
        'Pouvez-vous me donner les disponibilités et les tarifs ?'
      ].join(' ');
      whatsapp.href = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(demande)}`;
    }

    $('.social-modal-rang', modaleSociale).textContent = `Publication ${index + 1} sur ${publicationsSociales.length}`;
    $('.social-modal-prec', modaleSociale).disabled = index <= 0;
    $('.social-modal-suiv', modaleSociale).disabled = index >= publicationsSociales.length - 1;

    modaleSociale.classList.add('active');
    modaleSociale.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('.modal-close-btn', modaleSociale).focus();
  }

  function construireModaleSociale() {
    const fond = document.createElement('div');
    fond.className = 'villa-modal-overlay social-modal';
    fond.id = 'socialModal';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.setAttribute('aria-hidden', 'true');
    fond.setAttribute('aria-labelledby', 'socialModalTitre');
    fond.innerHTML = `<div class="villa-modal-container">
      <button type="button" class="modal-close-btn" aria-label="Fermer la vue détaillée">×</button>
      <div class="modal-content-grid">
        <div class="modal-gallery">
          <div class="modal-main-media">
            <img class="modal-main-img" src="" alt="">
            <div class="modal-gallery-nav" aria-label="Navigation dans la galerie">
              <button type="button" class="social-photo-prec" aria-label="Photo précédente">←</button>
              <button type="button" class="social-photo-suiv" aria-label="Photo suivante">→</button>
            </div>
          </div>
          <div class="modal-thumbs social-modal-thumbs" aria-label="Photos de la publication"></div>
        </div>
        <div class="modal-details">
          <span class="modal-eyebrow">EN DIRECT DE FACEBOOK</span>
          <h2 id="socialModalTitre" class="social-modal-titre"></h2>
          <p class="modal-location"></p>
          <div class="modal-specs social-modal-specs" hidden></div>
          <div class="modal-description social-modal-texte"></div>
          <div class="modal-actions social-modal-actions">
            <a class="social-modal-whatsapp is-primary" target="_blank" rel="noopener noreferrer">Réserver via WhatsApp</a>
            <a class="social-modal-lien" target="_blank" rel="noopener">Voir sur Facebook →</a>
          </div>
          <div class="social-modal-pied">
            <p class="social-modal-rang"></p>
            <div class="social-modal-nav">
              <button type="button" class="social-modal-prec" aria-label="Publication précédente">← Précédente</button>
              <button type="button" class="social-modal-suiv" aria-label="Publication suivante">Suivante →</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(fond);

    $('.modal-close-btn', fond).addEventListener('click', fermerPublicationSociale);
    $('.social-photo-prec', fond).addEventListener('click', () => afficherPhotoSociale(indexPhotoCourante - 1));
    $('.social-photo-suiv', fond).addEventListener('click', () => afficherPhotoSociale(indexPhotoCourante + 1));
    $('.social-modal-prec', fond).addEventListener('click', () => ouvrirPublicationSociale(indexSocialCourant - 1));
    $('.social-modal-suiv', fond).addEventListener('click', () => ouvrirPublicationSociale(indexSocialCourant + 1));
    fond.addEventListener('click', event => { if (event.target === fond) fermerPublicationSociale(); });
    document.addEventListener('keydown', event => {
      if (!fond.classList.contains('active')) return;
      if (event.key === 'Escape') fermerPublicationSociale();
      if (event.key === 'ArrowLeft') ouvrirPublicationSociale(indexSocialCourant - 1);
      if (event.key === 'ArrowRight') ouvrirPublicationSociale(indexSocialCourant + 1);
    });
    return fond;
  }

  /** Retire le lecteur : fermer ou changer de publication coupe le son. */
  function arreterVideoSociale() {
    if (!modaleSociale) return;
    $$('.social-modal-video', modaleSociale).forEach(cadre => cadre.remove());
    $('.modal-main-media', modaleSociale)?.classList.remove('avec-video');
  }

  function fermerPublicationSociale() {
    if (!modaleSociale || !modaleSociale.classList.contains('active')) return;
    arreterVideoSociale();
    modaleSociale.classList.remove('active');
    modaleSociale.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (origineFocusSocial && document.contains(origineFocusSocial)) origineFocusSocial.focus();
    origineFocusSocial = null;
  }

  function toast(message) {
    const stack = $('.toast-stack'); if (!stack) return;
    const item = document.createElement('div'); item.className = 'site-toast'; item.textContent = message; stack.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
})();
