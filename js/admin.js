(function () {
  // L'authentification repose désormais sur un cookie de session HttpOnly posé
  // par le serveur : le navigateur l'envoie tout seul et le JavaScript de cette
  // page ne peut pas le lire. Plus aucun secret ne transite par sessionStorage,
  // où n'importe quel script tiers pourrait le récupérer.
  const state = {
    user: null,
    content: { villas: [], terrains: [], activities: [], vehicles: [], reviews: [], faq: [], settings: {}, facebookPosts: [] },
    // Faux tant que le contenu réel n'est pas chargé et affiché : publier l'état
    // initial vide ci-dessus a effacé tout le catalogue le 16/09/2026.
    contenuCharge: false,
    // Horodatage du contenu chargé : le serveur refuse de publier un état
    // périmé (annonce mise à jour depuis Facebook entre-temps).
    baseUpdatedAt: null,
    // Filtre d'état des listes d'annonces (décision du 17/09/2026).
    filtreEtat: { villa: 'active', terrain: 'active', activity: 'active', vehicle: 'active' },
    leads: [], dashboard: null, dirty: false, leadFilter: 'all', leadSearch: '', backups: [], audit: [], facebook: null,
    users: [], roles: [], newsletter: null, subscriberFilter: 'all', subscriberSearch: ''
  };
  // Publications de la Page telles qu'affichées dans la liste : la vue de
  // détail y puise par son rang, et l'interrupteur y met à jour l'état retenu.
  let publicationsStudio = [];
  // Remplacée par initMenuMobile() ; neutre tant que le menu n'existe pas.
  let fermerMenuMobile = () => {};
  const can = permission => Boolean(state.user?.permissions?.includes(permission));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const money = value => new Intl.NumberFormat('fr-FR').format(Number(value || 0)) + ' F';
  // Images du panneau « Publier sur Facebook ». Jamais déclarées jusqu'au
  // 13/09/2026 : préparer une publication depuis une fiche levait
  // « MAX_IMAGES_FACEBOOK is not defined ». 10 = plafond d'un album chez Meta.
  const MAX_IMAGES_FACEBOOK = 10;
  let imagesFacebook = [];

  document.addEventListener('DOMContentLoaded', () => {
    $('#loginForm').addEventListener('submit', event => {
      event.preventDefault();
      login({ username: $('#loginUsername').value, password: $('#loginPassword').value });
    });
    brancherMotDePasseOublie();
    $('#comptaSousMenu')?.addEventListener('click', event => {
      const bouton = event.target.closest('[data-compta-aller]');
      if (!bouton) return;
      compta.onglet = bouton.dataset.comptaAller;
      fermerMenuMobile();
      const vueOuverte = $('.admin-view[data-panel="compta"]')?.classList.contains('active');
      if (vueOuverte && compta.donnees) {
        renderCompta();
        $('#comptaVue [data-compta-onglets]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else showView('compta');
    });
    $('#messagesSousMenu')?.addEventListener('click', event => {
      const bouton = event.target.closest('[data-messages-aller]');
      if (!bouton) return;
      gestionMessages.onglet = bouton.dataset.messagesAller;
      fermerMenuMobile();
      if ($('.admin-view[data-panel="messages"]')?.classList.contains('active')) ouvrirSectionMessages(); else showView('messages');
    });
    $('#locationSousMenu')?.addEventListener('click', event => {
      const bouton = event.target.closest('[data-location-aller]');
      if (!bouton) return;
      gestionLocation.onglet = bouton.dataset.locationAller;
      fermerMenuMobile();
      const vueOuverte = $('.admin-view[data-panel="location"]')?.classList.contains('active');
      // Relu à chaque fois : de nouvelles demandes arrivent du site et de l'application.
      if (vueOuverte) chargerLocation(); else showView('location');
    });
    $('#keyForm').addEventListener('submit', event => {
      event.preventDefault();
      login({ key: $('#adminKey').value });
    });
    $('#logoutBtn').addEventListener('click', logout);
    $('#passwordBtn').addEventListener('click', openPasswordEditor);
    $('#newUserBtn').addEventListener('click', () => openUserEditor());
    $('#newRoleBtn')?.addEventListener('click', () => ouvrirRole(null));
    $('#campaignSendBtn').addEventListener('click', sendCampaign);
    $('#exportSubscribersBtn').addEventListener('click', exportSubscribers);
    $('#subscriberSearch').addEventListener('input', event => { state.subscriberSearch = event.target.value; renderSubscribers(); });
    $('#subscriberFilters').addEventListener('click', event => {
      const button = event.target.closest('[data-status]'); if (!button) return;
      state.subscriberFilter = button.dataset.status;
      $$('#subscriberFilters button').forEach(b => b.classList.toggle('active', b === button));
      renderSubscribers();
    });
    $('#saveAllBtn').addEventListener('click', saveContent);
    $('#adminNav').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) showView(button.dataset.view); });
    initMenuMobile();
    $('#refOnglets')?.addEventListener('click', event => {
      const bouton = event.target.closest('[data-ref-type]');
      if (!bouton) return;
      state.refType = bouton.dataset.refType;
      renderReferentiels();
    });
    $('#refNouveauBtn')?.addEventListener('click', () => ouvrirEditeurReferentiel(state.refType || 'localisations'));
    document.addEventListener('click', event => {
      const jump = event.target.closest('[data-jump]'); if (jump) showView(jump.dataset.jump);
      const add = event.target.closest('[data-new]'); if (add) openEditor(add.dataset.new);
      // Aperçu d'une annonce (20/09/2026) : toute la ligne ouvre la fiche,
      // sauf les boutons d'action (crayon, corbeille) qu'elle contient.
      const ligne = event.target.closest('[data-apercu]');
      if (ligne && !event.target.closest('button, a')) {
        const [kind, ...reste] = ligne.dataset.apercu.split('|');
        ouvrirApercuAnnonce(kind, reste.join('|'));
      }
    });
    // Même geste au clavier : Entrée ou Espace sur la ligne sélectionnée.
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const ligne = event.target.closest?.('[data-apercu]');
      if (!ligne || event.target !== ligne) return;
      event.preventDefault();
      const [kind, ...reste] = ligne.dataset.apercu.split('|');
      ouvrirApercuAnnonce(kind, reste.join('|'));
    });
    $('#leadFilters').addEventListener('click', event => { const button = event.target.closest('[data-status]'); if (!button) return; state.leadFilter = button.dataset.status; $$('#leadFilters button').forEach(b => b.classList.toggle('active', b === button)); renderLeads(); });
    $('#fbPublishBtn').addEventListener('click', publishFacebook);
    $('#fbSyncBtn').addEventListener('click', syncFacebook);
    $('#fbContentSource').addEventListener('change', prepareFacebookFromContent);
    $('#fbImageFiles').addEventListener('change', importerImagesFacebook);
    $('#fbAddImageUrl').addEventListener('click', ajouterImageFacebookParUrl);
    $('#fbImageUrl').addEventListener('keydown', evenement => {
      if (evenement.key === 'Enter') { evenement.preventDefault(); ajouterImageFacebookParUrl(); }
    });
    $('#fbCheckSubBtn').addEventListener('click', checkFacebookSubscription);
    $('#refreshAdminBtn').addEventListener('click', refreshAdmin);
    $('#exportLeadsBtn').addEventListener('click', () => downloadAdminExport('csv'));
    $('#exportBackupBtn').addEventListener('click', () => downloadAdminExport('json'));
    $('#createBackupBtn').addEventListener('click', createManualBackup);
    $('#leadSearch').addEventListener('input', event => { state.leadSearch = event.target.value; renderLeads(); });
    $('#settingsForm').addEventListener('input', captureSettings);
    window.addEventListener('beforeunload', event => { if (!state.dirty) return; event.preventDefault(); event.returnValue = ''; });
    restoreSession();
  });

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      // Le cookie de session part avec la requête ; `X-Requested-With` est
      // exigé par le serveur sur toute écriture (défense anti-CSRF).
      credentials: 'same-origin',
      headers: { 'Content-Type':'application/json', 'X-Requested-With':'studio', ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    // 503 « retryable » : la base n'a pas répondu, mais la session reste
    // valide. On affiche l'erreur SANS déconnecter — sinon l'administrateur
    // est éjecté vers l'écran de connexion en pleine saisie et perd son
    // travail pour un incident passager.
    if (response.status === 503 && payload.retryable) {
      throw new Error(payload.error || 'Service momentanément indisponible. Réessayez.');
    }
    if (response.status === 401 && state.user) { sessionExpired(); throw new Error('Session expirée'); }
    if (!response.ok) throw new Error(payload.error || 'Une erreur est survenue');
    return payload;
  }

  /**
   * Mot de passe oublié (17/09/2026). Le lien reçu par e-mail ouvre le studio
   * sur #reinitialiser=<jeton> ; le jeton est aussitôt retiré de l'adresse
   * (historique, partage d'écran) et gardé en mémoire le temps du formulaire.
   */
  let jetonReinitialisation = '';
  function afficherEcranConnexion(ecran) {
    $('#loginForm').hidden = ecran !== 'connexion';
    $('#motDePasseOublieBtn').hidden = ecran !== 'connexion';
    $('#loginOubli').hidden = ecran !== 'oubli';
    $('#loginReinitialisation').hidden = ecran !== 'reinitialisation';
    $('#loginError').textContent = '';
    const champ = { connexion: '#loginUsername', oubli: '#oubliIdentifiant', reinitialisation: '#reinitMotDePasse' }[ecran];
    $(champ)?.focus();
  }

  function brancherMotDePasseOublie() {
    const correspondance = /^#reinitialiser=([A-Za-z0-9_%-]{20,200})$/.exec(location.hash);
    if (correspondance) {
      jetonReinitialisation = decodeURIComponent(correspondance[1]);
      history.replaceState(null, '', location.pathname + location.search);
    }
    $('#motDePasseOublieBtn').addEventListener('click', () => afficherEcranConnexion('oubli'));
    $$('[data-retour-connexion]').forEach(bouton => bouton.addEventListener('click', () => afficherEcranConnexion('connexion')));
    $('#oubliForm').addEventListener('submit', async event => {
      event.preventDefault();
      const bouton = $('#oubliSubmit');
      bouton.disabled = true;
      try {
        const reponse = await fetch('/api/auth/mot-de-passe-oublie', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'studio' }, body: JSON.stringify({ identifiant: $('#oubliIdentifiant').value }) });
        const resultat = await reponse.json().catch(() => ({}));
        $('#oubliMessage').textContent = resultat.message || resultat.error || 'Envoi impossible pour le moment.';
      } catch { $('#oubliMessage').textContent = 'Le serveur ne répond pas.'; }
      finally { bouton.disabled = false; }
    });
    $('#reinitialisationForm').addEventListener('submit', async event => {
      event.preventDefault();
      // Gardé avant l'attente : après un await, event.currentTarget vaut null.
      const formulaire = event.currentTarget;
      const message = $('#reinitMessage');
      if ($('#reinitMotDePasse').value !== $('#reinitConfirmation').value) { message.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
      const bouton = $('#reinitSubmit');
      bouton.disabled = true;
      try {
        const reponse = await fetch('/api/auth/reinitialiser', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'studio' }, body: JSON.stringify({ token: jetonReinitialisation, newPassword: $('#reinitMotDePasse').value }) });
        const resultat = await reponse.json().catch(() => ({}));
        if (!reponse.ok) throw new Error(resultat.error || 'Enregistrement impossible.');
        jetonReinitialisation = '';
        formulaire.reset();
        message.textContent = '';
        afficherEcranConnexion('connexion');
        $('#loginError').textContent = resultat.message;
      } catch (error) { message.textContent = error.message; }
      finally { bouton.disabled = false; }
    });
  }

  /** Au chargement : le serveur dit qui nous sommes (ou que personne n'est connecté). */
  async function restoreSession() {
    if (jetonReinitialisation) {
      hideBootScreen();
      $('#loginScreen').hidden = false; $('#adminShell').hidden = true;
      afficherEcranConnexion('reinitialisation');
      return;
    }
    try {
      const session = await fetch('/api/auth/session', { credentials:'same-origin', cache:'no-store' }).then(r => r.json());
      $('#loginFallback').hidden = !session.setupRequired;
      if (session.authenticated) { state.user = session.user; await openStudio(); return; }
      state.roles = session.roles || [];
    } catch { $('#loginError').textContent = 'Le serveur ne répond pas.'; }
    hideBootScreen();
    $('#loginScreen').hidden = false; $('#adminShell').hidden = true;
    $('#loginUsername').focus();
  }

  async function login(credentials) {
    const button = $('#loginSubmit');
    $('#loginError').textContent = '';
    button.disabled = true;
    try {
      const result = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type':'application/json', 'X-Requested-With':'studio' },
        body: JSON.stringify(credentials)
      }).then(async response => ({ ok: response.ok, payload: await response.json().catch(() => ({})) }));
      if (!result.ok) throw new Error(result.payload.error || 'Connexion impossible.');
      state.user = result.payload.user;
      await openStudio();
    } catch (error) {
      $('#loginError').textContent = error.message;
      $('#loginPassword').value = '';
    } finally { button.disabled = false; }
  }

  /** Retire l'écran d'attente dès qu'on sait quoi afficher. */
  function hideBootScreen() { const boot = $('#bootScreen'); if (boot) boot.hidden = true; }

  async function openStudio() {
    hideBootScreen();
    $('#loginScreen').hidden = true;
    $('#adminShell').hidden = false;
    applyRole();
    await loadAll();
  }

  /**
   * Adapte l'interface au rôle : les onglets sans permission sont retirés du
   * DOM (et pas seulement masqués), et la vue affichée bascule sur le premier
   * onglet réellement accessible. Le serveur applique de toute façon les mêmes
   * règles : ceci n'est qu'un confort, jamais une barrière.
   */
  function applyRole() {
    const degraded = Boolean(state.user?.degraded);
    $('#degradedBanner').hidden = !degraded;
    $('#sidebarIdentity').hidden = false;
    $('#identityName').textContent = state.user?.username || '—';
    $('#identityRole').textContent = state.user?.roleLabel || state.user?.role || '';
    $('#passwordBtn').hidden = degraded;

    $$('#adminNav [data-permission]').forEach(button => {
      // « leads:read notifications:manage » : l'une ou l'autre suffit.
      if (!button.dataset.permission.split(' ').some(permission => can(permission))) button.remove();
    });
    // Le bouton « Publier les changements » n'a de sens que pour qui peut écrire.
    $('#saveAllBtn').hidden = !can('content:write');
    $('#saveState').hidden = !can('content:write');
    const first = $('#adminNav [data-view]');
    if (first) showView(first.dataset.view);
  }

  function sessionExpired() {
    state.user = null;
    // Sans rechargement de page : le menu mobile ouvert le resterait à la
    // reconnexion, voile compris.
    fermerMenuMobile();
    hideBootScreen();
    $('#adminShell').hidden = true;
    $('#loginScreen').hidden = false;
    $('#loginError').textContent = 'Votre session a expiré. Reconnectez-vous.';
  }

  async function logout() {
    try { await api('/api/auth/logout', { method:'POST', body:'{}' }); } catch { /* on se déconnecte quand même */ }
    location.reload();
  }

  function majBoutonPublier() {
    $('#saveAllBtn').disabled = !state.contenuCharge;
    $('#saveAllBtn').title = state.contenuCharge ? '' : 'Chargement du contenu en cours…';
  }

  async function loadAll() {
    state.contenuCharge = false;
    majBoutonPublier();
    // Chaque appel est conditionné à la permission correspondante : un rôle
    // restreint ne déclenche même pas la requête (et donc aucun 403 inutile).
    const [contenuLu, leads, facebook, backups, audit, dashboard, users, newsletter] = await Promise.all([
      // Studio : contenu complet, annonces suspendues et archivées comprises
      // (le site public ne les reçoit pas).
      fetch(can('content:read') ? '/api/admin/content' : '/api/content', { cache:'no-store', credentials:'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      can('leads:read') ? api('/api/admin/leads').catch(() => ({ leads:[] })) : Promise.resolve({ leads:[] }),
      can('facebook:read') ? api('/api/admin/facebook/posts').catch(error => ({ connected:false, posts:[], error:error.message })) : Promise.resolve(null),
      can('backup:manage') ? api('/api/admin/backups').catch(() => ({ backups:[] })) : Promise.resolve({ backups:[] }),
      can('audit:read') ? api('/api/admin/audit').catch(() => ({ entries:[] })) : Promise.resolve({ entries:[] }),
      api('/api/admin/dashboard').catch(() => null),
      can('users:manage') ? api('/api/admin/users').catch(() => ({ users:[], roles:[] })) : Promise.resolve(null),
      can('newsletter:read') ? api('/api/admin/newsletter').catch(() => null) : Promise.resolve(null)
    ]);
    const managed = contenuLu || {};
    if (dashboard) state.dashboard = dashboard;
    if (users) { state.users = users.users || []; state.roles = users.roles || []; state.catalogue = users.catalogue || []; state.permissionVitale = users.permissionVitale || 'users:manage'; }
    state.newsletter = newsletter;
    // Référentiels : servis avec le contenu public ; le studio y ajoute le
    // nombre de fiches par entrée, qui décide entre suppression et désactivation.
    state.referentiels = managed.referentiels || null;
    if (can('content:write')) {
      const detail = await api('/api/admin/referentiels').catch(() => null);
      if (detail) { state.referentiels = detail.referentiels; state.refUsages = detail.usages || {}; }
    }
    state.content = {
      villas: managed.villas?.length ? managed.villas : structuredClone(VILLAS_DATA),
      terrains: Array.isArray(managed.terrains) ? managed.terrains : [],
      activities: managed.activities?.length ? managed.activities : structuredClone(ACTIVITIES_DATA),
      vehicles: Array.isArray(managed.vehicles) ? managed.vehicles : [],
      reviews: managed.reviews?.length ? managed.reviews : structuredClone(REVIEWS_DATA),
      faq: managed.faq?.length ? managed.faq : structuredClone(FAQ_DATA),
      settings: managed.settings || { heroTitle:'Là où vos rêves prennent vie', heroSubtitle:"Des villas d’exception entre lagune et océan, pensées pour vos plus beaux souvenirs.", phone:CONTACT_CONFIG.phone, facebookPage:CONTACT_CONFIG.facebookPage },
      facebookPosts: managed.facebookPosts || []
    };
    state.leads = leads.leads || [];
    state.backups = backups.backups || [];
    state.audit = audit.entries || [];
    state.facebook = facebook;
    state.baseUpdatedAt = managed.updatedAt || null;
    initialiserCasesFacebook();
    renderDashboard(); renderOperations();
    if (can('content:write')) { renderVillas(); renderTerrains(); renderActivities(); renderVehicles(); renderSettings(); renderReferentiels(); }
    if (can('leads:read')) { renderLeads(); chargerMessages(); }
    if (can('facebook:read') && facebook) renderFacebook(facebook);
    if (can('users:manage')) renderUsers();
    if (can('newsletter:read')) renderNewsletter();
    // Contenu illisible : l'écran montre des valeurs de repli, qu'une
    // publication substituerait au vrai catalogue. On bloque et on le dit.
    state.contenuCharge = Boolean(contenuLu);
    majBoutonPublier();
    if (!contenuLu) toast('Contenu du site illisible : publication bloquée. Rechargez la page.');
  }

  const VIEW_TITLES = {
    dashboard:['PILOTAGE','Vue d’ensemble'], villas:['HÉBERGEMENTS','Villas'],
    terrains:['VENTE DE TERRAIN','Terrains'], activities:['EXPÉRIENCES','Activités & loisirs'],
    vehicles:['LOCATION DE VOITURES','Voitures'], location:['LOCATION DE VOITURES','Planning & réservations'],
    referentiels:['LISTES DE CHOIX','Référentiels'],
    leads:['RELATION CLIENT','Demandes'], compta:['FINANCES','Comptabilité'], messages:['COMMUNICATION','Messagerie push'],
    appUtilisateurs:['APPLICATION MOBILE','Utilisateurs de l’app'], newsletter:['RELATION CLIENT','Newsletter'],
    facebook:['SOCIAL STUDIO','Publications'], users:['SÉCURITÉ','Utilisateurs'],
    settings:['SITE PUBLIC','Réglages']
  };

  /* =====================================================================
   * ONGLETS DU STUDIO (19/09/2026)
   * Une seule barre d'onglets pour tout le studio : icône au-dessus,
   * libellé dessous, cellules de largeur égale et trait de couleur sous
   * l'onglet ouvert. Comptabilité, Location, Messages, Utilisateurs et
   * Référentiels passent tous par `barreOnglets()` : un seul endroit à
   * corriger le jour où le modèle change.
   * ===================================================================== */
  const ICONES_ONGLET = {
    journal: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>',
    carte: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10.2h18"/>',
    equipe: '<circle cx="9.2" cy="8" r="3.2"/><path d="M3.6 19.4a5.6 5.6 0 0 1 11.2 0"/><path d="M16.2 5.7a3.2 3.2 0 0 1 0 5.6M17.8 14.3a5.6 5.6 0 0 1 2.8 5.1"/>',
    recurrent: '<path d="M4 12a8 8 0 0 1 13.6-5.7"/><path d="M18 3.4V7h-3.6"/><path d="M20 12a8 8 0 0 1-13.6 5.7"/><path d="M6 20.6V17h3.6"/>',
    graphique: '<path d="M4 3.8v16.4h16"/><rect x="7.4" y="11.2" width="3.3" height="5.8" rx="1.1"/><rect x="13.2" y="7.4" width="3.3" height="9.6" rx="1.1"/>',
    reglages: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 5V2.9M12 19v2.1M19 12h2.1M5 12H2.9M16.95 7.05l1.5-1.5M7.05 16.95l-1.5 1.5M16.95 16.95l1.5 1.5M7.05 7.05 5.55 5.55"/>',
    calendrier: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3.2v3.6M16 3.2v3.6"/>',
    liste: '<path d="M9.4 6.6h10.6M9.4 12h10.6M9.4 17.4h10.6"/><path d="m4 6.3 1.3 1.3L7.4 5M4 11.7 5.3 13l2.1-2.5M4 17.1l1.3 1.3 2.1-2.5"/>',
    interdit: '<circle cx="12" cy="12" r="8.2"/><path d="m6.2 6.2 11.6 11.6"/>',
    bulle: '<path d="M20.5 11.6c0 4-3.8 7.3-8.5 7.3-1 0-2-.15-2.9-.42L4 19.9l1.5-3.5c-1.2-1.3-2-3-2-4.8 0-4 3.8-7.3 8.5-7.3s8.5 3.3 8.5 7.3z"/>',
    cloche: '<path d="M18 9.2a6 6 0 1 0-12 0c0 4.8-2 6.3-2 6.3h16s-2-1.5-2-6.3z"/><path d="M10.3 18.8a2 2 0 0 0 3.4 0"/>',
    carnet: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><circle cx="12" cy="10" r="2.4"/><path d="M8.2 17.2a4.2 4.2 0 0 1 7.6 0"/>',
    bouclier: '<path d="M12 3.2 20 6v6c0 4.4-3.3 7.6-8 8.8C7.3 19.6 4 16.4 4 12V6z"/><path d="m9 12.2 2 2 4-4"/>',
    epingle: '<path d="M12 20.8s7-5.5 7-10.8a7 7 0 1 0-14 0c0 5.3 7 10.8 7 10.8z"/><circle cx="12" cy="10" r="2.6"/>',
    etiquette: '<path d="M11.2 3.5H20v8.8l-8.9 8.9a1.8 1.8 0 0 1-2.5 0L3.4 15.5a1.8 1.8 0 0 1 0-2.5z"/><circle cx="16.2" cy="7.7" r="1.3"/>',
    grille: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    etoile: '<path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.75l5.9-.85z"/>',
    drapeau: '<path d="M5.5 21V3.6"/><path d="M5.5 4.8h11l-1.8 3.6 1.8 3.6h-11"/>',
    entree: '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.2v7.6M8.2 12h7.6"/>',
    sortie: '<circle cx="12" cy="12" r="8.2"/><path d="M8.2 12h7.6"/>',
    defaut: '<circle cx="12" cy="12" r="8.2"/>'
  };

  /** Une icône d'onglet (trait fin, reprend la couleur du texte). */
  const icoOnglet = nom => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES_ONGLET[nom] || ICONES_ONGLET.defaut}</svg>`;

  /**
   * Fabrique la barre d'onglets commune.
   * @param {string} attribut  attribut `data-*` qui porte l'identifiant (ex. `data-compta-onglet`).
   * @param {Array}  onglets   `[id, libellé, icône, nombre|null]` — nombre à `null` : pas de pastille.
   * @param {string} actif     identifiant de l'onglet ouvert.
   * @param {Object} options   `label` (aria-label de la barre), `classe` (classe en plus), `attrs` (attributs de la balise).
   */
  const boutonsOnglets = (attribut, onglets, actif) => onglets.map(([id, libelle, icone, nombre = null]) => `<button type="button" role="tab" ${attribut}="${esc(id)}" class="${actif === id ? 'active' : ''}" aria-selected="${actif === id}">`
    + `<span class="onglet-ico">${icoOnglet(icone)}${nombre === null || nombre === undefined ? '' : `<span class="onglet-compte">${Number(nombre) > 99 ? '99+' : nombre}</span>`}</span>`
    + `<span class="onglet-texte">${esc(libelle)}</span></button>`).join('');

  const barreOnglets = (attribut, onglets, actif, options = {}) =>
    `<nav class="onglets-nav${options.classe ? ` ${options.classe}` : ''}" role="tablist" aria-label="${esc(options.label || 'Sections')}"${options.attrs ? ` ${options.attrs}` : ''}>${boutonsOnglets(attribut, onglets, actif)}</nav>`;

  /**
   * Menu burger du studio sur mobile (≤ 760 px).
   * Demande du 13/09/2026 : il remplace la barre d'onglets fixée en bas
   * d'écran, qui ne montrait que des pictogrammes et privait le mobile du
   * pied de colonne (voir le site, mot de passe, déconnexion). La colonne
   * latérale devient un panneau coulissant ; sur bureau, rien ne change.
   */
  function initMenuMobile() {
    const bouton = $('#adminMenuBtn');
    const shell = $('#adminShell');
    const voile = $('#adminMenuVoile');
    const colonne = $('#adminSidebar');
    if (!bouton || !shell || !voile || !colonne) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    const estOuvert = () => shell.classList.contains('menu-ouvert');

    const ouvrir = () => {
      shell.classList.add('menu-ouvert');
      voile.hidden = false;
      bouton.setAttribute('aria-expanded', 'true');
      bouton.setAttribute('aria-label', 'Fermer le menu');
      // Le focus entre dans le panneau : au clavier, on n'a pas à le chercher.
      const actif = $('#adminNav button.active:not([hidden])', colonne) || $('#adminNav button:not([hidden])', colonne);
      actif?.focus();
    };
    const fermer = rendreLeFocus => {
      if (!estOuvert()) return;
      shell.classList.remove('menu-ouvert');
      voile.hidden = true;
      bouton.setAttribute('aria-expanded', 'false');
      bouton.setAttribute('aria-label', 'Ouvrir le menu');
      if (rendreLeFocus) bouton.focus();
    };

    fermerMenuMobile = () => fermer(false);
    bouton.addEventListener('click', () => (estOuvert() ? fermer(true) : ouvrir()));
    voile.addEventListener('click', () => fermer(true));
    // Choisir une rubrique ferme le menu : on veut voir la page demandée. Le
    // focus revient au bouton, en tête de la nouvelle vue — le laisser sur un
    // onglet devenu invisible le perdrait au clavier.
    $('#adminNav').addEventListener('click', event => {
      if (event.target.closest('[data-view]')) fermer(true);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && estOuvert()) fermer(true);
    });
    // Passage en largeur bureau menu ouvert : on referme pour ne pas laisser
    // le voile derrière soi. Aucun verrou n'est posé sur le défilement de la
    // page : une déconnexion menu ouvert le laisserait bloqué sur l'écran de
    // connexion. Le panneau contient son propre défilement (CSS).
    mobile.addEventListener('change', () => { if (!mobile.matches) fermer(false); });
  }

  function showView(name) {
    const titles = VIEW_TITLES[name];
    if (!titles) return;
    $$('.admin-view').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
    $$('#adminNav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    $('#viewKicker').textContent = titles[0]; $('#viewTitle').textContent = titles[1];
    const sousMenuCompta = $('#comptaSousMenu');
    if (sousMenuCompta) sousMenuCompta.hidden = name !== 'compta';
    const sousMenuLocation = $('#locationSousMenu');
    if (sousMenuLocation) sousMenuLocation.hidden = name !== 'location';
    if (name === 'location' && can('location:manage')) chargerLocation();
    const sousMenuMessages = $('#messagesSousMenu');
    if (sousMenuMessages) sousMenuMessages.hidden = name !== 'messages';
    // Les contacts viennent des demandes : on relit à chaque ouverture.
    if (name === 'messages') ouvrirSectionMessages();
    // Utilisateurs de l'app : les profils changent à chaque inscription.
    if (name === 'appUtilisateurs' && can('notifications:manage')) chargerNotifications('utilisateurs');
    if (name === 'compta' && can('compta:manage')) chargerCompta();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function renderDashboard() {
    const k = state.dashboard?.kpis || {};
    const cards = [
      ['Demandes', k.leads || state.leads.length, `${k.newLeads || 0} à traiter`],
      ['Confirmations', k.confirmed || 0, 'Séjours validés'],
      ['Revenu confirmé', money(k.revenue || 0), 'Cumul des dossiers'],
      ['Conversion', `${k.conversionRate || 0} %`, 'Demandes actives confirmées'],
      ['Panier moyen', money(k.averageBooking || 0), 'Par séjour confirmé'],
      ['Catalogue', state.content.villas.length, `${state.content.activities.length} activités`],
      ['Terrains', state.content.terrains.length, `${state.content.terrains.filter(item => item.status === 'disponible').length} disponible(s)`]
    ];
    $('#kpiGrid').innerHTML = cards.map(card => `<article class="kpi-card"><small>${card[0]}</small><strong>${card[1]}</strong><em>${card[2]}</em></article>`).join('');
    $('#recentLeads').innerHTML = state.leads.length ? state.leads.slice(0,6).map(lead => `<div class="lead-mini"><div><strong>${esc(lead.name || lead.email || 'Visiteur')}</strong><br><small>${esc(lead.villa || lead.type)} · ${formatDate(lead.createdAt)}</small></div><span class="status ${lead.status}">${lead.status}</span></div>`).join('') : '<div class="empty">Les premières demandes apparaîtront ici.</div>';
    const rawValues = state.dashboard?.weeklyLeads || [];
    const values = rawValues.length === 8 ? rawValues : [0,0,0,0,0,0,0,state.leads.length];
    const maximum = Math.max(...values, 1);
    $('#barChart').innerHTML = values.map((value,index) => `<span title="${value} demande(s)" style="height:${Math.max(8, Math.round(value / maximum * 100))}%" data-label="S${index+1}"></span>`).join('');
  }

  function renderOperations() {
    const latestBackup = state.backups[0];
    const latestAudit = state.audit[0];
    const chips = [
      latestBackup ? `Dernière sauvegarde : ${formatDateTime(latestBackup.createdAt)}` : 'Aucune sauvegarde manuelle',
      latestAudit ? `Dernière action : ${esc(latestAudit.action || 'mise à jour')} · ${formatDateTime(latestAudit.createdAt)}` : 'Journal prêt',
      `${state.leads.length} demande${state.leads.length > 1 ? 's' : ''} exportable${state.leads.length > 1 ? 's' : ''}`
    ];
    $('#operationsStatus').innerHTML = chips.map(label => `<span class="operation-chip">${label}</span>`).join('');
  }

  // ---------------------------------------------------------------------
  // GESTION DES ANNONCES (décisions du 17/09/2026)
  // Suspendre (retirée du site, réactivable), Archiver (rangée dans
  // « Archives », restaurable), Supprimer (définitif). Facebook suit
  // l'annonce : dans les trois cas sa publication est supprimée. Tout prend
  // effet au clic sur « Publier les changements », comme les autres réglages.
  // ---------------------------------------------------------------------
  const ETATS_ANNONCE = { active: 'En ligne', suspendue: 'Suspendue', archivee: 'Archivée' };
  const COLLECTIONS = { villa: 'villas', terrain: 'terrains', activity: 'activities', vehicle: 'vehicles' };
  const etatAnnonce = item => (['active', 'suspendue', 'archivee'].includes(item?.etat) ? item.etat : 'active');

  function renderListe(kind) {
    if (kind === 'villa') renderVillas(); else if (kind === 'terrain') renderTerrains(); else if (kind === 'vehicle') renderVehicles(); else renderActivities();
  }

  /** Annonces de la rubrique dans l'état choisi, et les onglets de filtre. */
  function annoncesFiltrees(kind) {
    const liste = state.content[COLLECTIONS[kind]];
    const actuel = state.filtreEtat[kind] || 'active';
    const onglets = `<div class="filter-pills etat-filtres" role="group" aria-label="État des annonces">${Object.entries({ active: 'En ligne', suspendue: 'Suspendues', archivee: 'Archives' }).map(([etat, libelle]) => `<button type="button" data-filtre-etat="${kind}:${etat}" class="${actuel === etat ? 'active' : ''}" aria-pressed="${actuel === etat}">${libelle} <span>${liste.filter(item => etatAnnonce(item) === etat).length}</span></button>`).join('')}</div>`;
    return { onglets, items: liste.filter(item => etatAnnonce(item) === actuel), actuel };
  }

  function brancherListe(hote, kind) {
    $$('[data-filtre-etat]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      state.filtreEtat[kind] = bouton.dataset.filtreEtat.split(':')[1];
      renderListe(kind);
    }));
  }

  /** Pastilles d'une ligne : état hors ligne, présence sur Facebook. */
  function pastillesAnnonce(kind, item) {
    const etat = etatAnnonce(item);
    const facebook = state.facebook?.fichesPubliees?.[`${kind}:${item.id}`];
    const avis = item.avis || {};
    return (etat !== 'active' ? `<span class="visibility-note etat-${etat}">${ETATS_ANNONCE[etat].toUpperCase()}</span>` : '')
      + (facebook ? '<span class="fb-pastille" title="En ligne sur la Page Facebook">f</span>' : '')
      + (avis.likes || avis.nombre ? `<span class="avis-pastille" title="Avis des visiteurs">♥ ${Number(avis.likes) || 0}${avis.nombre ? ` · ★ ${String(avis.note).replace('.', ',')} (${avis.nombre})` : ''}</span>` : '');
  }

  function supprimerAnnonce(kind, id) {
    const cle = COLLECTIONS[kind];
    const item = state.content[cle].find(entree => entree.id === id);
    if (!item) return false;
    const surFacebook = Boolean(state.facebook?.fichesPubliees?.[`${kind}:${id}`]);
    const nom = item.name || item.title || id;
    if (!confirm(`Supprimer définitivement « ${nom} » ?${surFacebook ? '\n\nSa publication Facebook sera supprimée aussi.' : ''}\n\nEffectif au clic sur « Publier les changements ».`)) return false;
    state.content[cle] = state.content[cle].filter(entree => entree.id !== id);
    dirty(); renderListe(kind);
    return true;
  }

  function changerEtatAnnonce(kind, id, etat) {
    const liste = state.content[COLLECTIONS[kind]];
    const index = liste.findIndex(entree => entree.id === id);
    if (index < 0) return;
    liste[index] = { ...liste[index], etat };
    dirty(); renderListe(kind);
    const messages = { active: 'Annonce remise en ligne', suspendue: 'Annonce suspendue', archivee: 'Annonce archivée' };
    toast(`${messages[etat]} : effectif au clic sur « Publier les changements »`);
  }

  /** Bandeau de gestion en tête de la fiche d'une annonce existante. */
  function barreGestionAnnonce(item) {
    const etat = etatAnnonce(item);
    const boutons = etat === 'active' ? [['suspendue', 'Suspendre'], ['archivee', 'Archiver']]
      : etat === 'suspendue' ? [['active', 'Réactiver'], ['archivee', 'Archiver']]
      : [['active', 'Restaurer']];
    const aide = {
      active: 'Suspendre retire l’annonce du site et de Facebook jusqu’à sa réactivation. Archiver la range dans « Archives ».',
      suspendue: 'Annonce retirée du site et de Facebook. Réactivez-la pour la remettre en ligne.',
      archivee: 'Annonce archivée : absente du site et de Facebook. Restaurez-la pour la remettre en ligne.'
    }[etat];
    return `<div class="gestion-annonce"><span class="etat-annonce etat-${etat}">${ETATS_ANNONCE[etat]}</span><div class="gestion-annonce-boutons">${boutons.map(([cible, libelle]) => `<button type="button" data-etat-annonce="${cible}">${libelle}</button>`).join('')}<button type="button" class="danger" data-supprimer-annonce>Supprimer</button></div><small>${aide} Les modifications non enregistrées de la fiche ne sont pas conservées.</small></div>`;
  }

  /**
   * Avis des visiteurs d'une annonce (17/09/2026) : « J'aime », note moyenne et
   * commentaires, publiés aussitôt sur le site. Masquer ou supprimer un
   * commentaire agit immédiatement, sans attendre « Publier les changements ».
   */
  async function rendreAvisStudio(hote, kind, id) {
    let donnees;
    try { donnees = await api(`/api/admin/avis?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`); }
    catch (error) { hote.innerHTML = `<h3>Avis des visiteurs</h3><p class="avis-studio-vide">${esc(error.message)}</p>`; return; }
    const item = state.content[COLLECTIONS[kind]].find(entree => entree.id === id);
    if (item) item.avis = { likes: donnees.likes, note: donnees.note, nombre: donnees.nombre };
    const etoiles = note => `<span class="avis-studio-etoiles" aria-label="${note} sur 5">${'★'.repeat(note)}<span>${'★'.repeat(5 - note)}</span></span>`;
    const synthese = `♥ ${donnees.likes} J’aime · ${donnees.nombre ? `★ ${String(donnees.note).replace('.', ',')} / 5 sur ${donnees.nombre} avis visible${donnees.nombre > 1 ? 's' : ''}` : 'aucun avis visible'}`;
    hote.innerHTML = `<h3>Avis des visiteurs</h3><p class="avis-studio-synthese">${esc(synthese)}</p>${donnees.commentaires.length ? `<ol class="avis-studio-liste">${donnees.commentaires.map(c => `<li class="${c.statut === 'masque' ? 'est-masque' : ''}"><div class="avis-studio-tete"><strong>${esc(c.nom)}</strong>${etoiles(Number(c.note) || 0)}<time>${formatDate(c.creeLe)}</time>${c.statut === 'masque' ? '<span class="avis-studio-statut">Masqué du site</span>' : ''}</div><p>${esc(c.commentaire).replace(/\n/g, '<br>')}</p><div class="avis-studio-actions"><button type="button" data-avis-statut="${esc(c.id)}" data-cible="${c.statut === 'masque' ? 'visible' : 'masque'}">${c.statut === 'masque' ? 'Réafficher' : 'Masquer'}</button><button type="button" class="danger" data-avis-supprimer="${esc(c.id)}">Supprimer</button></div></li>`).join('')}</ol>` : '<p class="avis-studio-vide">Aucun commentaire pour le moment.</p>'}`;
    $$('[data-avis-statut]', hote).forEach(bouton => bouton.addEventListener('click', async () => {
      bouton.disabled = true;
      try {
        await api(`/api/admin/avis/commentaires/${encodeURIComponent(bouton.dataset.avisStatut)}`, { method: 'PATCH', body: JSON.stringify({ statut: bouton.dataset.cible }) });
        toast(bouton.dataset.cible === 'masque' ? 'Commentaire masqué du site' : 'Commentaire de nouveau visible');
        await rendreAvisStudio(hote, kind, id); renderListe(kind);
      } catch (error) { toast(error.message); bouton.disabled = false; }
    }));
    $$('[data-avis-supprimer]', hote).forEach(bouton => bouton.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement ce commentaire ? Il disparaît aussitôt du site.')) return;
      bouton.disabled = true;
      try {
        await api(`/api/admin/avis/commentaires/${encodeURIComponent(bouton.dataset.avisSupprimer)}`, { method: 'DELETE' });
        toast('Commentaire supprimé');
        await rendreAvisStudio(hote, kind, id); renderListe(kind);
      } catch (error) { toast(error.message); bouton.disabled = false; }
    }));
  }

  /**
   * Case « Publier sur Facebook » des annonces antérieures au 17/09/2026 :
   * jamais enregistrée, elle reprend l'état réel de la Page.
   */
  function initialiserCasesFacebook() {
    const publiees = state.facebook?.fichesPubliees;
    if (!publiees) return;
    Object.entries(COLLECTIONS).filter(([kind]) => kind !== 'vehicle').forEach(([kind, cle]) => state.content[cle].forEach(item => {
      if (item.facebook !== true && item.facebook !== false) item.facebook = Boolean(publiees[`${kind}:${item.id}`]);
    }));
  }

  function renderVillas() {
    const head = '<div class="table-row header"><span>Visuel</span><span>Villa</span><span>Tarif / nuit</span><span>Capacité</span><span>Catégorie</span><span>Action</span></div>';
    const { onglets, items, actuel } = annoncesFiltrees('villa');
    $('#villasTable').innerHTML = onglets + head + (items.length ? '' : `<div class="empty">${actuel === 'active' ? 'Aucune villa en ligne.' : actuel === 'suspendue' ? 'Aucune villa suspendue.' : 'Aucune villa archivée.'}</div>`) + items.map(item => `<div role="button" tabindex="0" data-apercu="villa|${esc(item.id)}" class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || '')}" alt=""><div class="table-title"><strong>${esc(item.name)}</strong><small>${esc(item.location)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉE DU SITE</span>':''}${pastillesAnnonce('villa', item)}</div><div class="table-cell"><strong>${money(item.pricePerNight)}</strong></div><div>${item.capacity} pers.</div><div><span class="status">${esc(item.categoryLabel || item.category)}</span></div><div class="row-actions"><button title="Modifier" data-edit-villa="${esc(item.id)}">✎</button><button title="Supprimer" data-delete-villa="${esc(item.id)}">×</button></div></div>`).join('');
    $$('[data-edit-villa]').forEach(button => button.addEventListener('click', () => openEditor('villa', button.dataset.editVilla)));
    $$('[data-delete-villa]').forEach(button => button.addEventListener('click', () => supprimerAnnonce('villa', button.dataset.deleteVilla)));
    brancherListe($('#villasTable'), 'villa');
  }

  // --- Vente de terrain -------------------------------------------------
  // Référentiel identique à celui du serveur (server.js) : toute valeur hors
  // de ces listes est refusée à la publication.
  const LAND_STATUS = {
    'titre-foncier': 'Titre foncier',
    'acd': 'ACD (Arrêté de Concession Définitive)',
    'lettre-attribution': 'Lettre d’attribution',
    'certificat-propriete': 'Certificat de propriété'
  };
  const TERRAIN_STATUS = { disponible:'Disponible', reserve:'Réservé', vendu:'Vendu' };
  const TERRAIN_UTILITIES = {
    'eau':'Eau courante', 'electricite':'Électricité', 'voie-bitumee':'Voie bitumée',
    'assainissement':'Assainissement', 'cloture':'Clôture', 'borne':'Bornage'
  };
  const EURO_RATE = 655.957;
  const perSqm = item => (Number(item.areaSqm) > 0 ? Math.round(Number(item.priceTotal || 0) / Number(item.areaSqm)) : 0);

  function renderTerrains() {
    const head = '<div class="table-row header"><span>Visuel</span><span>Terrain</span><span>Superficie</span><span>Prix total</span><span>Statut</span><span>Action</span></div>';
    const { onglets, items, actuel } = annoncesFiltrees('terrain');
    $('#terrainsTable').innerHTML = items.length
      ? onglets + head + items.map(item => `<div role="button" tabindex="0" data-apercu="terrain|${esc(item.id)}" class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || '')}" alt=""><div class="table-title"><strong>${esc(item.title)}</strong><small>${esc(item.reference)} · ${esc(item.location)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉ DU SITE</span>' : item.status === 'vendu' ? '<span class="visibility-note">VENDU — RETIRÉ DU SITE</span>' : ''}${pastillesAnnonce('terrain', item)}</div><div>${new Intl.NumberFormat('fr-FR').format(Number(item.areaSqm || 0))} m²</div><div class="table-cell"><strong>${money(item.priceTotal)}</strong><small>${money(perSqm(item))} / m²</small></div><div><span class="status ${esc(item.status)}">${esc(libelleStatut('terrain', item.status) || TERRAIN_STATUS[item.status] || item.status)}</span></div><div class="row-actions"><button title="Modifier" data-edit-terrain="${esc(item.id)}">✎</button><button title="Supprimer" data-delete-terrain="${esc(item.id)}">×</button></div></div>`).join('')
      : onglets + head + `<div class="empty">${actuel !== 'active' ? (actuel === 'suspendue' ? 'Aucun terrain suspendu.' : 'Aucun terrain archivé.') : 'Aucun terrain en ligne. Cliquez sur « Ajouter un terrain » pour publier une parcelle.'}</div>`;
    $$('[data-edit-terrain]').forEach(button => button.addEventListener('click', () => openEditor('terrain', button.dataset.editTerrain)));
    $$('[data-delete-terrain]').forEach(button => button.addEventListener('click', () => supprimerAnnonce('terrain', button.dataset.deleteTerrain)));
    brancherListe($('#terrainsTable'), 'terrain');
  }

  function renderActivities() {
    const head = '<div class="table-row header"><span>Visuel</span><span>Activité</span><span>Tarif</span><span>Durée</span><span>Badge</span><span>Action</span></div>';
    const { onglets, items, actuel } = annoncesFiltrees('activity');
    $('#activitiesTable').innerHTML = onglets + head + (items.length ? '' : `<div class="empty">${actuel === 'active' ? 'Aucune activité en ligne.' : actuel === 'suspendue' ? 'Aucune activité suspendue.' : 'Aucune activité archivée.'}</div>`) + items.map(item => `<div role="button" tabindex="0" data-apercu="activity|${esc(item.id)}" class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || item.image || '')}" alt=""><div class="table-title"><strong>${esc(item.title)}</strong><small>${esc(item.subtitle)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉE DU SITE</span>':''}${pastillesAnnonce('activity', item)}</div><div>${esc(item.price)}</div><div>${esc(item.duration)}</div><div><span class="status">${esc(item.badge)}</span></div><div class="row-actions"><button data-edit-activity="${esc(item.id)}">✎</button><button data-delete-activity="${esc(item.id)}">×</button></div></div>`).join('');
    $$('[data-edit-activity]').forEach(button => button.addEventListener('click', () => openEditor('activity', button.dataset.editActivity)));
    $$('[data-delete-activity]').forEach(button => button.addEventListener('click', () => supprimerAnnonce('activity', button.dataset.deleteActivity)));
    brancherListe($('#activitiesTable'), 'activity');
  }

  // ---------------------------------------------------------------------
  // VUE « RÉFÉRENTIELS »
  // Localisations, catégories, équipements, badges et statuts. Chaque
  // enregistrement part aussitôt en base (sans passer par « Publier les
  // changements ») : les formulaires des fiches doivent pouvoir s'en servir
  // dans la foulée, et une fiche ne peut pas référencer une entrée inexistante.
  // ---------------------------------------------------------------------
  const AIDES_REFERENTIELS = {
    localisations: 'Les villes, communes ou villages où se trouvent vos biens. Sur chaque annonce, vous choisissez la ville dans cette liste, puis vous précisez le repère à côté (« Km 8 », « bord de lagune »).',
    categories: 'Les thèmes de séjour (événements, escapade en amoureux…). Ils s’ajoutent aux onglets de la page « Nos Résidences » et au menu « Type de résidence » de la recherche. Le bord de lagune ou d’océan se choisit dans le Cadre de la fiche, la piscine se coche dans ses Équipements : ce ne sont pas des catégories.',
    equipements: 'Ce que propose le bien (piscine, Wi-Fi…). Vous les cochez sur chaque villa ou publication, et le site s’en sert pour filtrer : une villa avec « Piscine » cochée apparaît dans « Piscines Privées ».',
    'equipements-voiture': 'Ce qu’offre un véhicule (climatisation, GPS, caméra de recul…). Vous les cochez sur la fiche de la voiture : la liste affichée sur le site vient de là, traduite automatiquement, et ne se saisit plus à la main.',
    badges: 'La petite étiquette affichée sur la photo d’une annonce (« Coup de Cœur », « Plage Privée »…).',
    statuts: 'L’état d’un bien : disponible, sur demande ou indisponible pour une villa ; disponible, réservé ou vendu pour un terrain. Le site en dépend (un terrain vendu disparaît du site, une villa indisponible ne peut plus être choisie dans le devis), donc on ne peut ni en ajouter ni en supprimer. Vous pouvez seulement changer le texte montré aux visiteurs, par exemple « Réservé » en « Sous compromis ».'
  };

  function renderReferentiels() {
    const hote = $('#refTable');
    if (!hote) return;
    const type = state.refType || 'localisations';
    $$('#refOnglets [data-ref-type]').forEach(bouton => {
      const actif = bouton.dataset.refType === type;
      bouton.classList.toggle('active', actif);
      bouton.setAttribute('aria-pressed', String(actif));
      bouton.setAttribute('aria-selected', String(actif));
    });
    $('#refAide').textContent = AIDES_REFERENTIELS[type];
    $('#refNouveauBtn').hidden = type === 'statuts';

    const usages = state.refUsages?.[type] || {};
    const entrees = refs()[type];
    const etat = entree => (entree.actif === false ? '<span class="status ref-inactif">Désactivé</span>' : '<span class="status">Actif</span>');
    const traductions = entree => [entree.libelle?.en && `EN : ${esc(entree.libelle.en)}`, entree.libelle?.es && `ES : ${esc(entree.libelle.es)}`].filter(Boolean).join(' · ') || '<small>Français seulement</small>';

    let lignes;
    if (type === 'statuts') {
      // Regroupés par type de bien (villas, puis terrains), dans leur ordre fixe.
      const groupes = ['villa', 'terrain'];
      const tries = [...entrees].sort((a, b) => groupes.indexOf(a.cible) - groupes.indexOf(b.cible) || a.ordre - b.ordre);
      lignes = '<div class="table-row ref-row ref-statut header"><span>Concerne</span><span>Libellé affiché</span><span>Traductions</span><span>Code (fixe)</span><span>Action</span></div>'
        + tries.map(entree => `<div class="table-row ref-row ref-statut"><div>${entree.cible === 'villa' ? 'Villas' : 'Terrains'}</div><div class="table-title"><strong>${esc(libelleRef(entree))}</strong></div><div>${traductions(entree)}</div><div><code>${esc(entree.code)}</code></div><div class="row-actions"><button title="Modifier le libellé" data-ref-modifier="${esc(entree.id)}">✎</button></div></div>`).join('');
    } else {
      lignes = `<div class="table-row ref-row ref-ordonnable header"><span aria-hidden="true"></span><span>${type === 'localisations' ? 'Nom' : 'Libellé'}</span><span>${type === 'localisations' ? 'Identifiant' : 'Traductions'}</span><span>Fiches</span><span>État</span><span>Action</span></div>`
        + (entrees.length ? entrees.map(entree => {
          const n = Number(usages[entree.id] || 0);
          return `<div class="table-row ref-row ref-ordonnable ${entree.actif === false ? 'is-hidden' : ''}" data-ref-id="${esc(entree.id)}"><button type="button" class="ref-poignee" data-ref-poignee title="Glisser vers le haut ou le bas pour changer l’ordre" aria-label="Déplacer « ${esc(libelleRef(entree))} » : flèches haut et bas">⠿</button><div class="table-title"><strong>${esc(libelleRef(entree))}</strong><small>Ordre ${Number(entree.ordre) || 0}</small></div><div>${type === 'localisations' ? `<code>${esc(entree.id)}</code>` : traductions(entree)}</div><div>${n}</div><div>${etat(entree)}</div><div class="row-actions"><button title="Modifier" data-ref-modifier="${esc(entree.id)}">✎</button><button title="${n ? 'Utilisé : désactivez-le plutôt' : 'Supprimer'}" data-ref-supprimer="${esc(entree.id)}" ${n ? 'disabled' : ''}>×</button></div></div>`;
        }).join('') : '<div class="empty">Aucune entrée. Cliquez sur « Ajouter » pour créer la première.</div>');
    }
    hote.innerHTML = lignes;
    brancherGlisserReferentiels(hote);
    $$('[data-ref-modifier]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirEditeurReferentiel(type, bouton.dataset.refModifier)));
    $$('[data-ref-supprimer]', hote).forEach(bouton => bouton.addEventListener('click', () => supprimerReferentiel(type, bouton.dataset.refSupprimer)));
  }

  /**
   * Ordre des entrées par glisser-déposer (demande du 13/09/2026).
   * Événements « pointer » : souris, doigt et stylet avec le même code — le
   * glisser-déposer HTML natif ne fonctionne pas au doigt sur mobile. Les
   * flèches haut/bas sur la poignée font la même chose au clavier.
   * Branché une seule fois sur le conteneur : les lignes sont redessinées à
   * chaque changement, le conteneur, lui, reste.
   */
  function brancherGlisserReferentiels(hote) {
    if (hote.dataset.glisser) return;
    hote.dataset.glisser = '1';
    const lignes = () => $$('.ref-row[data-ref-id]', hote);
    const ordre = () => lignes().map(ligne => ligne.dataset.refId);
    let glisse = null;
    let minuteurClavier;

    hote.addEventListener('pointerdown', event => {
      const poignee = event.target.closest('[data-ref-poignee]');
      if (!poignee || event.button > 0) return;
      event.preventDefault();
      poignee.setPointerCapture(event.pointerId);
      glisse = { ligne: poignee.closest('.ref-row'), avant: ordre() };
      glisse.ligne.classList.add('ref-glisse');
    });

    hote.addEventListener('pointermove', event => {
      if (!glisse) return;
      // La ligne se place avant la première autre ligne dont le milieu est
      // sous le pointeur ; à défaut, en dernière position.
      const suivante = lignes().filter(ligne => ligne !== glisse.ligne).find(ligne => {
        const cadre = ligne.getBoundingClientRect();
        return event.clientY < cadre.top + cadre.height / 2;
      });
      if (suivante) { if (glisse.ligne.nextElementSibling !== suivante) hote.insertBefore(glisse.ligne, suivante); }
      else if (hote.lastElementChild !== glisse.ligne) hote.appendChild(glisse.ligne);
    });

    const terminer = () => {
      if (!glisse) return;
      const { ligne, avant } = glisse;
      glisse = null;
      ligne.classList.remove('ref-glisse');
      if (ordre().join('|') !== avant.join('|')) enregistrerOrdreReferentiel(state.refType || 'localisations', ordre());
    };
    hote.addEventListener('pointerup', terminer);
    hote.addEventListener('pointercancel', terminer);

    hote.addEventListener('keydown', event => {
      const poignee = event.target.closest('[data-ref-poignee]');
      if (!poignee || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      const ligne = poignee.closest('.ref-row');
      const voisine = event.key === 'ArrowUp' ? ligne.previousElementSibling : ligne.nextElementSibling;
      if (!voisine || !voisine.dataset.refId) return;
      if (event.key === 'ArrowUp') hote.insertBefore(ligne, voisine);
      else hote.insertBefore(voisine, ligne);
      poignee.focus();
      // Plusieurs appuis de suite : un seul enregistrement, à la fin.
      window.clearTimeout(minuteurClavier);
      minuteurClavier = window.setTimeout(() => enregistrerOrdreReferentiel(state.refType || 'localisations', ordre(), ligne.dataset.refId), 600);
    });
  }

  async function enregistrerOrdreReferentiel(type, ids, idAFocaliser) {
    try {
      const reponse = await api(`/api/admin/referentiels/${type}/ordre`, { method: 'POST', body: JSON.stringify({ ids }) });
      await actualiserReferentiels(reponse.referentiels);
      toast('Ordre enregistré');
    } catch (error) {
      toast(error.message);
      renderReferentiels(); // l'ordre affiché revient à celui enregistré
    }
    if (idAFocaliser) $(`#refTable [data-ref-id="${CSS.escape(idAFocaliser)}"] [data-ref-poignee]`)?.focus();
  }

  function ouvrirEditeurReferentiel(type, id) {
    const entree = id ? trouverRef(type, id) : null;
    const nouveau = !entree;
    const e = entree || { ordre: (refs()[type].length + 1), actif: true, libelle: {} };
    const champsLibelles = `<label>Libellé en français<input name="fr" maxlength="160" required value="${esc(e.libelle?.fr)}"></label><div class="form-grid"><label>Anglais (facultatif)<input name="en" maxlength="160" value="${esc(e.libelle?.en)}"></label><label>Espagnol (facultatif)<input name="es" maxlength="160" value="${esc(e.libelle?.es)}"></label></div>`;
    const champs = type === 'localisations'
      ? `<label>Nom de la ville, commune ou village<input name="nom" maxlength="160" required placeholder="Grand-Bassam" value="${esc(e.nom)}"></label>`
      : champsLibelles;
    const identifiant = type === 'statuts' ? `<p class="fb-fiche-aide">Code <code>${esc(e.code)}</code> (${e.cible === 'villa' ? 'villas' : 'terrains'}) : fixe.</p>`
      : `<label>Identifiant${nouveau ? ' (facultatif, déduit du libellé)' : ' (ne change plus)'}<input name="id" pattern="[a-z0-9\\-]*" maxlength="80" ${nouveau ? '' : 'readonly'} value="${esc(e.id)}"></label>`;
    const reglages = type === 'statuts' ? '' : `<div class="form-grid"><label>Ordre d’affichage<input type="number" name="ordre" min="0" max="9999" step="1" value="${Number(e.ordre) || 0}"></label></div><div class="toggle-row"><label><input type="checkbox" name="actif" value="yes" ${e.actif !== false ? 'checked' : ''}> Proposé dans les formulaires et sur le site</label></div>`;

    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop ref-editor-backdrop"><form class="editor-drawer"><div class="editor-head"><div><span class="eyebrow">${nouveau ? 'NOUVELLE ENTRÉE' : 'MODIFICATION'}</span><h2>${esc(TYPES_REFERENTIELS[type])}</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">${champs}${identifiant}${reglages}</div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></div>`);
    const fond = $('.ref-editor-backdrop');
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const echap = event => { if (event.key === 'Escape') fermer(); };
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    document.addEventListener('keydown', echap);
    $('.editor-drawer', fond).addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const v = Object.fromEntries(new FormData(form));
      const donnees = type === 'statuts'
        ? { cible: e.cible, code: e.code, libelle: { fr: v.fr, en: v.en, es: v.es } }
        : type === 'localisations'
          ? { id: v.id, nom: v.nom, ordre: Number(v.ordre) || 0, actif: form.elements.actif.checked }
          : { id: v.id, libelle: { fr: v.fr, en: v.en, es: v.es }, ordre: Number(v.ordre) || 0, actif: form.elements.actif.checked };
      const bouton = $('button[type="submit"]', form);
      bouton.disabled = true;
      try {
        const reponse = await api(`/api/admin/referentiels/${type}`, { method: 'POST', body: JSON.stringify({ entree: donnees, nouveau }) });
        await actualiserReferentiels(reponse.referentiels);
        fermer();
        toast(nouveau ? 'Entrée ajoutée' : 'Entrée enregistrée');
      } catch (error) {
        toast(error.message);
        bouton.disabled = false;
      }
    });
    $('input:not([readonly])', fond)?.focus();
  }

  async function supprimerReferentiel(type, id) {
    const entree = trouverRef(type, id);
    if (!entree || !confirm(`Supprimer « ${libelleRef(entree)} » ? Cette action est définitive.`)) return;
    try {
      const reponse = await api(`/api/admin/referentiels/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await actualiserReferentiels(reponse.referentiels);
      toast('Entrée supprimée');
    } catch (error) { toast(error.message); }
  }

  /** Après une modification : nouvelles listes, nouveaux compteurs, tableaux redessinés. */
  async function actualiserReferentiels(referentiels) {
    state.referentiels = referentiels;
    const detail = await api('/api/admin/referentiels').catch(() => null);
    if (detail) { state.referentiels = detail.referentiels; state.refUsages = detail.usages || {}; }
    renderReferentiels(); renderVillas(); renderTerrains(); renderActivities();
  }

  const LEAD_STATUTS = [['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['confirme', 'Confirmé'], ['archive', 'Archivé']];

  /**
   * Pastille du menu (20/09/2026) : le nombre de demandes encore à traiter,
   * visible sans ouvrir la rubrique. Zéro demande, pas de pastille.
   */
  function majCompteurDemandes() {
    const bouton = $('#adminNav [data-view="leads"]');
    if (!bouton) return;
    const nombre = (state.leads || []).filter(lead => lead.status === 'nouveau').length;
    let pastille = $('.nav-compte', bouton);
    if (!nombre) { pastille?.remove(); return; }
    if (!pastille) { pastille = document.createElement('span'); pastille.className = 'nav-compte'; bouton.appendChild(pastille); }
    pastille.textContent = nombre > 99 ? '99+' : nombre;
    pastille.title = `${nombre} demande${nombre > 1 ? 's' : ''} à traiter`;
  }

  function renderLeads() {
    majCompteurDemandes();
    const query = state.leadSearch.trim().toLocaleLowerCase('fr');
    const items = state.leads.filter(item => {
      if (state.leadFilter !== 'all' && item.status !== state.leadFilter) return false;
      if (!query) return true;
      return [item.name,item.email,item.phone,item.villa,item.type,item.message,item.dates].some(value => String(value || '').toLocaleLowerCase('fr').includes(query));
    });
    // Liste compacte (demande du 13/09/2026) : une ligne = client, résumé de
    // la réservation, montant et statut. Toute la ligne ouvre la fiche ; seul
    // le menu de statut reste manipulable sur place.
    $('#leadsTable').innerHTML = items.length ? items.map(lead => {
      const d = resumeDemande(lead);
      const contact = [lead.phone, lead.email].filter(Boolean).join(' · ');
      return `<div class="lead-item" role="button" tabindex="0" data-open-lead="${esc(lead.id)}" aria-label="Ouvrir la demande de ${esc(lead.name || 'ce client')}">
        <div class="lead-item-main">
          <div class="lead-item-top"><strong>${esc(lead.name || lead.email || 'Visiteur')}</strong><span class="lead-type">${esc(d.formule)}</span>${lead.restriction ? `<span class="lead-restriction ${esc(lead.restriction.type)}">${lead.restriction.type === 'bloque' ? 'Bloqué' : 'Suspendu'}</span>` : ''}<time datetime="${esc(lead.createdAt || '')}">${formatDate(lead.createdAt)}</time></div>
          <p class="lead-item-brief">${esc(d.brief || lead.message || '—')}</p>
          ${contact ? `<small class="lead-item-contact">${esc(contact)}</small>` : ''}
        </div>
        <div class="lead-item-side">
          <strong class="lead-amount">${lead.amount ? money(lead.amount) : 'Sur devis'}</strong>
          <select aria-label="Statut de ${esc(lead.name || 'la demande')}" data-lead-status="${esc(lead.id)}">${LEAD_STATUTS.map(([value, label]) => `<option value="${value}" ${lead.status === value ? 'selected':''}>${label}</option>`).join('')}</select>
        </div>
      </div>`;
    }).join('') : '<div class="empty">Aucune demande ne correspond à votre recherche.</div>';
    $$('[data-lead-status]').forEach(select => {
      // Le menu vit dans la ligne cliquable : il ne doit pas ouvrir la fiche.
      ['click', 'keydown'].forEach(type => select.addEventListener(type, event => event.stopPropagation()));
      select.addEventListener('change', async () => { try { const result = await api(`/api/admin/leads/${select.dataset.leadStatus}`, { method:'PATCH', body:JSON.stringify({ status:select.value }) }); const index = state.leads.findIndex(item => item.id === result.lead.id); state.leads[index] = result.lead; state.dashboard = await api('/api/admin/dashboard'); toast('Statut mis à jour'); renderDashboard(); } catch(error) { toast(error.message); } });
    });
    $$('[data-open-lead]').forEach(row => {
      row.addEventListener('click', () => openLeadEditor(row.dataset.openLead));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLeadEditor(row.dataset.openLead); }
      });
    });
  }

  /**
   * Lecture d'une demande pour la liste et la fiche. Le simulateur envoie
   * `dates` = « AAAA-MM-JJ → AAAA-MM-JJ » et `message` = « 8 voyageur(s) ·
   * option, option » (ou « Sans option ») ; les autres demandes gardent leur
   * texte libre, affiché tel quel.
   */
  function resumeDemande(lead) {
    const formules = { 'devis-whatsapp': 'Séjour', 'devis-activites': 'Activités', devis: 'Devis', terrain: 'Terrain', villa: 'Résidence', contact: 'Contact', newsletter: 'Newsletter', 'location-voiture': 'Location de voiture' };
    const simulateur = lead.type === 'devis-whatsapp' || lead.type === 'devis-activites';
    const [debut, fin] = String(lead.dates || '').split('→').map(part => part.trim());
    const jour = valeur => /^\d{4}-\d{2}-\d{2}$/.test(valeur || '') ? new Date(`${valeur}T12:00:00`) : null;
    const arrivee = jour(debut);
    const depart = jour(fin);
    const duree = arrivee && depart ? Math.max(1, Math.round((depart - arrivee) / 86400000)) : 0;
    const court = date => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
    let voyageurs = '';
    let options = [];
    if (simulateur && lead.message) {
      const [tete, ...reste] = String(lead.message).split(' · ');
      voyageurs = (tete.match(/^(\S+)\s+voyageur/) || [])[1] || '';
      const liste = reste.join(' · ').trim();
      options = liste && liste !== 'Sans option' ? liste.split(', ').filter(Boolean) : [];
    }
    const lieu = lead.type === 'devis-activites' ? '' : (lead.villa || (lead.terrainRef ? `Terrain ${lead.terrainRef}` : ''));
    const brief = [
      lieu,
      arrivee && depart ? `${court(arrivee)} → ${court(depart)}` : (lead.dates || ''),
      duree ? `${duree} ${lead.type === 'devis-activites' ? `journée${duree > 1 ? 's' : ''}` : `nuit${duree > 1 ? 's' : ''}`}` : '',
      voyageurs ? `${voyageurs} voyageurs` : '',
      options.length ? (options.length === 1 ? options[0] : `${options.length} options`) : ''
    ].filter(Boolean).join(' · ');
    return {
      formule: formules[lead.type] || lead.type || 'Demande', simulateur, lieu,
      arrivee, depart, duree, voyageurs, options, brief: simulateur || lieu ? brief : ''
    };
  }

  /** Lien WhatsApp d'un numéro saisi librement ; 10 chiffres = numéro ivoirien sans indicatif. */
  function lienWhatsApp(telephone) {
    let chiffres = String(telephone || '').replace(/\D/g, '');
    if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
    if (chiffres.length === 10) chiffres = `225${chiffres}`;
    return chiffres.length >= 8 ? `https://wa.me/${chiffres}` : '';
  }

  function openLeadEditor(id) {
    const lead = state.leads.find(item => item.id === id);
    if (!lead) return;
    const d = resumeDemande(lead);
    const long = date => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    const horodatage = value => { try { return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; } catch { return '—'; } };
    const ligne = (label, valeur) => valeur ? `<div><dt>${esc(label)}</dt><dd>${valeur}</dd></div>` : '';
    const wa = lienWhatsApp(lead.phone);
    const statut = (LEAD_STATUTS.find(([value]) => value === lead.status) || [lead.status, lead.status])[1];
    const actions = [
      wa ? `<a class="lead-action whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : '',
      lead.phone ? `<a class="lead-action" href="tel:${esc(String(lead.phone).replace(/[^\d+]/g, ''))}">Appeler</a>` : '',
      lead.email ? `<a class="lead-action" href="mailto:${esc(lead.email)}">E-mail</a>` : ''
    ].join('');
    // Texte libre : affiché seulement s'il n'est pas déjà décomposé ci-dessus.
    const messageLibre = d.simulateur ? '' : String(lead.message || '').trim();
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop lead-editor-backdrop"><form class="editor-drawer lead-detail"><div class="editor-head"><div><span class="eyebrow">DEMANDE DE RÉSERVATION · ${esc(d.formule.toUpperCase())}</span><h2>${esc(lead.name || 'Visiteur')}</h2><span class="status lead-status-${esc(lead.status)}">${esc(statut)}</span> <small class="lead-recue">Reçue le ${esc(horodatage(lead.createdAt))}</small></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">
      <section class="lead-contact-card"><strong>${esc(lead.name || 'Nom non renseigné')}</strong><small>${esc(lead.phone || 'Téléphone non renseigné')}</small><small>${esc(lead.email || 'E-mail non renseigné')}</small>${actions ? `<div class="lead-actions">${actions}</div>` : ''}${can('leads:write') ? gestionDemandeur(lead) : ''}</section>
      <section class="lead-bloc"><h3>Réservation</h3><dl class="lead-dl">
        ${ligne('Formule', esc(d.formule === 'Séjour' ? 'Séjour en résidence' : d.formule === 'Activités' ? 'Activités uniquement (sans hébergement)' : d.formule))}
        ${ligne(lead.terrainRef ? 'Terrain' : 'Résidence', esc(d.lieu))}
        ${d.arrivee ? ligne(lead.type === 'devis-activites' ? 'Début' : 'Arrivée', esc(long(d.arrivee))) : ligne('Dates', esc(lead.dates || ''))}
        ${d.depart ? ligne(lead.type === 'devis-activites' ? 'Fin' : 'Départ', esc(long(d.depart))) : ''}
        ${ligne('Durée', d.duree ? esc(`${d.duree} ${lead.type === 'devis-activites' ? `journée${d.duree > 1 ? 's' : ''}` : `nuit${d.duree > 1 ? 's' : ''}`}`) : '')}
        ${ligne('Voyageurs', esc(d.voyageurs))}
        ${d.simulateur ? ligne('Options', d.options.length ? `<ul>${d.options.map(option => `<li>${esc(option)}</li>`).join('')}</ul>` : 'Aucune') : ''}
        ${ligne('Montant', lead.amount ? `<strong>${esc(money(lead.amount))}</strong>` : 'Sur devis')}
        ${ligne('Offres WhatsApp', lead.whatsappOptIn === true ? `Accord donné${lead.whatsappOptInAt ? ` le ${esc(formatDate(lead.whatsappOptInAt))}` : ''}` : lead.whatsappOptIn === false ? 'Pas d’accord (case non cochée)' : 'Accord non recueilli')}
      </dl>${messageLibre ? `<h3>Message</h3><p class="lead-message">${esc(messageLibre).replace(/\n/g, '<br>')}</p>` : ''}</section>
      <section class="lead-bloc"><h3>Suivi</h3><div class="form-grid"><label>Statut<select name="status">${LEAD_STATUTS.map(([value, label]) => `<option value="${value}" ${lead.status === value ? 'selected':''}>${label}</option>`).join('')}</select></label><label>Montant confirmé (FCFA)<input name="amount" type="number" min="0" step="1000" value="${Number(lead.amount || 0)}"></label></div><label>Notes internes<textarea name="adminNotes" rows="5" placeholder="Relance, préférences, informations utiles…">${esc(lead.adminNotes || '')}</textarea></label>
      <p class="lead-meta">Dernière mise à jour : ${esc(horodatage(lead.updatedAt || lead.createdAt))} · Réf. ${esc(String(lead.id || '').slice(0, 8))}</p></section>
      ${lead.type === 'location-voiture' && can('location:manage') ? '<section class="lead-bloc"><h3>Véhicule</h3><p class="lead-meta">Cette demande a créé une réservation dans le planning. La confirmer ici confirme la réservation (dates bloquées) ; l’archiver l’annule.</p><button type="button" class="content-action" data-voir-reservation>Ouvrir la réservation dans « Location »</button></section>' : ''}
      ${can('compta:manage') ? '<section class="lead-bloc lead-paiements-bloc" data-paiements-demande><h3>Paiements</h3><p class="lead-paiements-synthese">Chargement…</p></section>' : ''}
    </div><div class="editor-actions lead-editor-actions">${can('leads:write') ? `<button type="button" data-archiver-demande>${lead.status === 'archive' ? 'Désarchiver' : 'Archiver'}</button><button type="button" class="danger" data-supprimer-demande>Supprimer la demande</button>` : ''}<button type="button" data-close-editor>Fermer</button><button class="primary" type="submit">Enregistrer le suivi</button></div></form></div>`);
    const backdrop = $('.lead-editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKeydown);
    $('.editor-drawer', backdrop).addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const result = await api(`/api/admin/leads/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ status:values.status, amount:Number(values.amount || 0), adminNotes:values.adminNotes }) });
        const index = state.leads.findIndex(item => item.id === result.lead.id);
        state.leads[index] = result.lead;
        state.dashboard = await api('/api/admin/dashboard');
        renderDashboard(); renderLeads(); close(); toast('Dossier client enregistré');
      } catch (error) { toast(error.message); }
    });
    brancherGestionDemande(backdrop, lead, close);
    $('[data-voir-reservation]', backdrop)?.addEventListener('click', () => {
      close();
      gestionLocation.onglet = 'reservations';
      gestionLocation.ouvrirPourDemande = lead.id;
      showView('location');
    });
    const hotePaiements = $('[data-paiements-demande]', backdrop);
    if (hotePaiements) paiementsDemande(hotePaiements, lead);
    // Focus sur « Fermer » : la fiche s'ouvre en haut, sur le client, et
    // Échap ou Entrée la referment sans rien modifier.
    $('.editor-head [data-close-editor]', backdrop)?.focus();
  }

  // =========================================================================
  // LOCATION DE VOITURES (17/09/2026)
  // Rubrique « Voitures » : fiches des véhicules, annonces du catalogue comme
  // les villas (publiées par « Publier les changements »).
  // Rubrique « Location » : planning, réservations, indisponibilités et
  // réglages — enregistrés aussitôt, comme la comptabilité.
  // Tarifs et planning : js/location-voitures.js, partagé avec le site et le
  // serveur, donc une seule façon de calculer.
  // =========================================================================
  const LV = window.LocationVoitures;
  const gestionLocation = { donnees: null, onglet: 'planning', debut: '', jours: 14, filtre: 'demande', recherche: '', ouvrirPourDemande: null };
  const optionsListe = (table, actuel) => (Array.isArray(table) ? table.map(e => [e.id, e.libelle.fr]) : Object.entries(table).map(([id, l]) => [id, l.fr]))
    .map(([id, libelle]) => `<option value="${esc(id)}" ${actuel === id ? 'selected' : ''}>${esc(libelle)}</option>`).join('');
  const nombreChamp = (nom, libelle, valeur, attributs = '') => `<label>${libelle}<input type="number" name="${nom}" value="${esc(valeur ?? '')}" ${attributs}></label>`;

  function vehicleFields(item) {
    const mode = item.driverMode || 'choix';
    return `<label>Nom (marque et modèle)<input name="name" maxlength="160" required value="${esc(item.name)}" placeholder="ex. Toyota Land Cruiser Prado"></label>
      <div class="form-grid">
        <label>Identifiant<input name="id" pattern="[a-z0-9\\-]+" required value="${esc(item.id || `vehicule-${Date.now()}`)}"></label>
        <label>Catégorie<select name="category">${optionsListe(LV.CATEGORIES, item.category || 'berline')}</select></label>
        <label>Marque<input name="brand" maxlength="60" value="${esc(item.brand)}"></label>
        <label>Modèle<input name="model" maxlength="80" value="${esc(item.model)}"></label>
        ${nombreChamp('year', 'Année', item.year, 'min="1990" max="2100" step="1"')}
        ${champBadge(item)}
        <label>Boîte de vitesses<select name="transmission">${optionsListe(LV.BOITES, item.transmission || 'manuelle')}</select></label>
        <label>Carburant<select name="fuel">${optionsListe(LV.CARBURANTS, item.fuel || 'essence')}</select></label>
        ${nombreChamp('seats', 'Places', item.seats ?? 5, 'min="1" max="60" step="1"')}
        ${nombreChamp('doors', 'Portes', item.doors ?? 4, 'min="0" max="6" step="1"')}
        ${nombreChamp('luggage', 'Bagages', item.luggage ?? 2, 'min="0" max="30" step="1"')}
      </div>
      <!-- « Climatisation » a quitté cette ligne le 20/09/2026 : elle se coche
           dans les équipements du véhicule, plus bas. Le serveur en déduit
           l'ancien champ « airConditioning » pour le site et l'application. -->
      <div class="toggle-row"><label><input type="checkbox" name="visible" value="yes" ${item.visible !== false ? 'checked' : ''}> Visible sur le site</label><label><input type="checkbox" name="featured" value="yes" ${item.featured ? 'checked' : ''}> Mise en avant</label></div>
      <fieldset class="vehicule-bloc"><legend>Formule</legend>
        <label>Conduite<select name="driverMode" data-mode-chauffeur>${optionsListe(LV.MODES_CHAUFFEUR, mode)}</select></label>
        <p class="vehicule-aide" data-aide-chauffeur></p>
        <div class="form-grid">
          <span data-si-chauffeur>${nombreChamp('driverPricePerDay', 'Supplément chauffeur / jour (FCFA)', item.driverPricePerDay ?? 0, 'min="0" step="500"')}</span>
          <span data-si-conducteur>${nombreChamp('deposit', 'Caution (FCFA, restituée)', item.deposit ?? 0, 'min="0" step="5000"')}</span>
          <span data-si-conducteur>${nombreChamp('minAge', 'Âge minimum du conducteur', item.minAge || 21, 'min="18" max="35" step="1"')}</span>
          <span data-si-conducteur>${nombreChamp('licenseYears', 'Permis depuis (années)', item.licenseYears ?? 2, 'min="0" max="15" step="1"')}</span>
        </div>
      </fieldset>
      <fieldset class="vehicule-bloc"><legend>Tarifs</legend>
        <div class="form-grid">
          ${nombreChamp('pricePerDay', 'Prix par jour (FCFA)', item.pricePerDay ?? 0, 'min="0" step="1000" required')}
          ${nombreChamp('pricePerDayWeek', 'Prix par jour dès 7 jours', item.pricePerDayWeek || '', 'min="0" step="1000" placeholder="vide = prix par jour"')}
          ${nombreChamp('pricePerDayMonth', 'Prix par jour dès 30 jours', item.pricePerDayMonth || '', 'min="0" step="1000" placeholder="vide = tarif semaine"')}
          ${nombreChamp('minDays', 'Durée minimale (jours)', item.minDays || 1, 'min="1" max="30" step="1"')}
          ${nombreChamp('kmIncludedPerDay', 'Km inclus par jour', item.kmIncludedPerDay ?? 0, 'min="0" max="5000" step="10" placeholder="0 = illimité"')}
          ${nombreChamp('extraKmPrice', 'Prix du km supplémentaire', item.extraKmPrice ?? 0, 'min="0" step="10"')}
        </div>
        <p class="vehicule-apercu" data-apercu-tarif aria-live="polite"></p>
      </fieldset>
      <label>Accroche<input name="tagline" maxlength="240" value="${esc(item.tagline)}" placeholder="ex. Le confort pour vos trajets Abidjan ⇄ Assinie"></label>
      <label>Description<textarea name="description" rows="5" maxlength="8000">${esc(item.description)}</textarea></label>
      ${mediaFields()}
      ${champsEquipementsVehicule(item)}
      ${champsTraductions('vehicle', item)}`;
  }

  /** Champs affichés selon la formule, et aperçu des tarifs, pendant la saisie. */
  function brancherFicheVehicule(racine) {
    const form = $('.editor-drawer', racine);
    const maj = () => {
      const mode = form.elements.driverMode.value;
      $$('[data-si-chauffeur]', form).forEach(el => { el.hidden = mode === 'sans'; });
      $$('[data-si-conducteur]', form).forEach(el => { el.hidden = mode === 'avec'; });
      $('[data-aide-chauffeur]', form).textContent = {
        avec: 'Toujours conduit par votre chauffeur : pas de caution ni de conditions de permis. Mettez 0 au supplément si le chauffeur est compris dans le prix.',
        sans: 'Le client conduit : caution, âge et ancienneté de permis s’appliquent. Il les atteste en réservant.',
        choix: 'Le client choisit : avec chauffeur (supplément par jour, sans caution) ou sans chauffeur (caution et conditions de permis).'
      }[mode];
      const vehicule = { pricePerDay: form.elements.pricePerDay.value, pricePerDayWeek: form.elements.pricePerDayWeek.value, pricePerDayMonth: form.elements.pricePerDayMonth.value };
      const jour = LV.tarifApplicable(vehicule, 1).tarifJour;
      const semaine = LV.tarifApplicable(vehicule, 7);
      const mois = LV.tarifApplicable(vehicule, 30);
      $('[data-apercu-tarif]', form).textContent = jour
        ? `1 jour : ${money(jour)} · 7 jours : ${money(semaine.tarifJour * 7)} (${money(semaine.tarifJour)}/j) · 30 jours : ${money(mois.tarifJour * 30)} (${money(mois.tarifJour)}/j). Site : « à partir de ${money(LV.prixAPartirDe(vehicule))} / jour ».`
        : 'Sans prix par jour, le site affiche « tarif sur demande ».';
    };
    form.addEventListener('input', maj);
    form.addEventListener('change', maj);
    maj();
  }

  function normalizeVehicle(v, old, gallery) {
    const n = (valeur, repli = 0) => (valeur === '' || valeur === undefined ? repli : Number(valeur) || 0);
    return {
      ...old, id: v.id.trim().toLowerCase(), name: v.name.trim(), brand: String(v.brand || '').trim(), model: String(v.model || '').trim(),
      year: n(v.year, null), category: v.category, transmission: v.transmission, fuel: v.fuel,
      seats: n(v.seats, 5), doors: n(v.doors, 4), luggage: n(v.luggage, 2),
      // `airConditioning` : recalculé par le serveur depuis l'équipement coché.
      airConditioning: Array.isArray(v.equipements) && v.equipements.includes('climatisation'),
      driverMode: v.driverMode, driverPricePerDay: n(v.driverPricePerDay), deposit: n(v.deposit), minAge: n(v.minAge, 21), licenseYears: n(v.licenseYears, 2),
      pricePerDay: n(v.pricePerDay), pricePerDayWeek: n(v.pricePerDayWeek), pricePerDayMonth: n(v.pricePerDayMonth), minDays: n(v.minDays, 1),
      kmIncludedPerDay: n(v.kmIncludedPerDay), extraKmPrice: n(v.extraKmPrice),
      badgeId: v.badgeId || '', badge: libelleRef(trouverRef('badges', v.badgeId)),
      tagline: v.tagline, description: v.description,
      // Équipements cochés (19/09/2026) : le serveur en déduit `features`,
      // la liste affichée sur la fiche, traduite depuis le référentiel.
      equipements: Array.isArray(v.equipements) ? v.equipements : [],
      visible: v.visible === 'yes', featured: v.featured === 'yes', images: gallery.slice(0, 12)
    };
  }

  /* =====================================================================
   * APERÇU D'UNE ANNONCE (20/09/2026)
   * Un clic sur une ligne de liste — villa, terrain, activité, voiture —
   * montre la fiche telle que le client la voit : photo, titre, tarifs,
   * description. Dessous, le propriétaire du bien : sa zone s'ouvre sur les
   * trois gestes utiles, l'appeler, lui écrire sur WhatsApp, lui envoyer une
   * notification. Le crayon de la ligne continue d'ouvrir l'éditeur.
   * ===================================================================== */
  const LISTES_ANNONCES = { villa: 'villas', terrain: 'terrains', activity: 'activities', vehicle: 'vehicles' };
  const SURTITRES_ANNONCE = { villa: 'HÉBERGEMENT', terrain: 'VENTE DE TERRAIN', activity: 'EXPÉRIENCE', vehicle: 'LOCATION DE VOITURE' };
  const annonceParId = (kind, id) => (state.content?.[LISTES_ANNONCES[kind]] || []).find(item => String(item.id) === String(id)) || null;

  /** Titre, sous-titre et informations clés, selon le type d'annonce. */
  function resumeAnnonce(kind, item) {
    const l = (cle, valeur) => (valeur || valeur === 0 ? [cle, String(valeur)] : null);
    if (kind === 'villa') {
      return { titre: item.name, sous: item.location, lignes: [
        l('Tarif par nuit', money(item.pricePerNight)), l('Forfait week-end', item.weekendPackage ? money(item.weekendPackage) : ''),
        l('Capacité', `${item.capacity || '?'} personnes`), l('Chambres', item.bedrooms), l('Salles de bain', item.bathrooms),
        l('Thème', item.categoryLabel), l('Badge', item.badge)] };
    }
    if (kind === 'terrain') {
      const m2 = Number(item.areaSqm || 0);
      return { titre: item.title || item.reference, sous: [item.reference, item.location].filter(Boolean).join(' · '), lignes: [
        l('Prix total', money(item.priceTotal)), l('Superficie', m2 ? `${new Intl.NumberFormat('fr-FR').format(m2)} m²` : ''),
        l('Prix au m²', m2 ? money(Math.round(Number(item.priceTotal || 0) / m2)) : ''),
        l('Statut', libelleStatut('terrain', item.status) || item.status), l('Badge', item.badge)] };
    }
    if (kind === 'activity') {
      return { titre: item.title, sous: item.subtitle, lignes: [
        l('Tarif', item.price), l('Durée', item.duration), l('Badge', item.badge), l('Lieu', item.location)] };
    }
    return { titre: item.name, sous: [LV.libelle(LV.CATEGORIES, item.category, 'fr'), item.year].filter(Boolean).join(' · '), lignes: [
      l('À partir de', LV.prixAPartirDe(item) ? `${money(LV.prixAPartirDe(item))} / jour` : 'Sur demande'),
      l('Conduite', LV.libelle(LV.MODES_CHAUFFEUR, item.driverMode, 'fr')),
      l('Chauffeur', item.driverPricePerDay ? `${money(item.driverPricePerDay)} / jour` : ''),
      l('Caution', item.deposit ? money(item.deposit) : ''), l('Places', item.seats), l('Boîte', LV.libelle(LV.BOITES, item.transmission, 'fr')),
      l('Kilométrage', item.kmIncludedPerDay ? `${item.kmIncludedPerDay} km / jour` : 'Illimité')] };
  }

  /** Bloc « Propriétaire du bien », cliquable quand le bien en a un. */
  function blocProprietaireApercu(p) {
    if (!p || !(p.nom || p.prenom || p.telephone || p.whatsapp)) {
      return '<div class="apercu-proprietaire apercu-proprietaire-vide">Aucun propriétaire renseigné sur cette annonce. Ajoutez-le avec le crayon, pour pouvoir l’appeler d’ici.</div>';
    }
    const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || p.telephone || p.whatsapp;
    return `<button type="button" class="apercu-proprietaire" data-ouvrir-proprietaire>
      <span class="apercu-proprietaire-avatar" aria-hidden="true">${esc((nom || '?').slice(0, 1).toUpperCase())}</span>
      <span class="apercu-proprietaire-texte"><small>PROPRIÉTAIRE DU BIEN</small><strong>${esc(nom)}</strong><em>${esc([p.telephone, p.whatsapp && p.whatsapp !== p.telephone ? `WhatsApp ${p.whatsapp}` : ''].filter(Boolean).join(' · ') || 'Numéro non renseigné')}</em></span>
      <span class="apercu-proprietaire-fleche" aria-hidden="true">›</span>
    </button>`;
  }

  /** Vue de contact : appeler, WhatsApp, notification. */
  function vueProprietaire(p, kind, item) {
    const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || p.telephone || p.whatsapp;
    const tel = String(p.telephone || p.whatsapp || '').replace(/[^\d+]/g, '');
    // Même règle que les campagnes WhatsApp : 10 chiffres = numéro ivoirien,
    // wa.me exige l'indicatif pays, sinon le lien n'ouvre aucune conversation.
    const wa = lienWhatsApp(p.whatsapp || p.telephone);
    return `<div class="apercu-contact">
      <button type="button" class="apercu-retour" data-retour-apercu>‹ Retour à la fiche</button>
      <div class="apercu-contact-tete"><span class="apercu-proprietaire-avatar" aria-hidden="true">${esc((nom || '?').slice(0, 1).toUpperCase())}</span>
        <div><small>PROPRIÉTAIRE</small><strong>${esc(nom)}</strong><em>${esc(resumeAnnonce(kind, item).titre || '')}</em></div></div>
      <dl class="apercu-infos">
        ${p.telephone ? `<div><dt>Téléphone</dt><dd>${esc(p.telephone)}</dd></div>` : ''}
        ${p.whatsapp ? `<div><dt>WhatsApp</dt><dd>${esc(p.whatsapp)}</dd></div>` : ''}
      </dl>
      <div class="apercu-actions">
        ${tel ? `<a class="apercu-action" href="tel:${esc(tel)}"><span aria-hidden="true">📞</span> Appeler</a>` : ''}
        ${wa ? `<a class="apercu-action apercu-action-wa" href="${esc(wa)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>` : ''}
        ${can('notifications:manage') ? `<button type="button" class="apercu-action apercu-action-push" data-push-proprietaire="${esc(p.telephone || p.whatsapp || '')}"><span aria-hidden="true">🔔</span> Notification</button>` : ''}
      </div>
      ${tel || wa ? '' : '<p class="apercu-vide">Ce propriétaire n’a ni téléphone ni WhatsApp : ajoutez-les dans la fiche de l’annonce.</p>'}
    </div>`;
  }

  function ouvrirApercuAnnonce(kind, id) {
    const item = annonceParId(kind, id);
    if (!item) return;
    const { titre, sous, lignes } = resumeAnnonce(kind, item);
    const photo = (item.images || [])[0] || item.image || '';
    const equipements = (item.features || []).slice(0, 24);
    const infos = lignes.filter(Boolean).map(([cle, valeur]) => `<div><dt>${esc(cle)}</dt><dd>${esc(valeur)}</dd></div>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop apercu-backdrop">
      <div class="editor-drawer apercu-drawer" role="dialog" aria-modal="true" aria-label="Aperçu de l’annonce">
        <div class="editor-head"><div><span class="eyebrow">${esc(SURTITRES_ANNONCE[kind] || 'ANNONCE')}</span><h2>${esc(titre || item.id)}</h2>${sous ? `<small class="apercu-sous">${esc(sous)}</small>` : ''}</div><button type="button" data-close-editor aria-label="Fermer">×</button></div>
        <div class="editor-fields apercu-corps">
          ${photo ? `<img class="apercu-photo" src="${esc(photo)}" alt="">` : ''}
          ${item.visible === false ? '<p class="apercu-masquee">Cette annonce est masquée du site.</p>' : ''}
          ${infos ? `<dl class="apercu-infos">${infos}</dl>` : ''}
          ${item.tagline ? `<p class="apercu-accroche">${esc(item.tagline)}</p>` : ''}
          ${item.description ? `<p class="apercu-description">${esc(item.description)}</p>` : ''}
          ${equipements.length ? `<div class="apercu-equipements"><h3>Équipements</h3><ul>${equipements.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
          ${blocProprietaireApercu(item.proprietaire)}
          <!-- Avis des visiteurs : même bloc que dans l'éditeur, modération
               comprise (masquer, supprimer), chargé après l'ouverture. -->
          <section class="avis-studio apercu-avis" data-avis-apercu><h3>Avis des visiteurs</h3><p class="avis-studio-vide">Chargement…</p></section>
        </div>
        <div class="editor-actions"><button type="button" data-close-editor>Fermer</button>${can('content:write') ? '<button type="button" class="primary" data-modifier-annonce>Modifier</button>' : ''}</div>
      </div></div>`);
    const fond = $('.apercu-backdrop');
    const fermer = () => fond.remove();
    if (can('content:write')) rendreAvisStudio($('[data-avis-apercu]', fond), kind, item.id);
    else $('[data-avis-apercu]', fond)?.remove();
    $$('[data-close-editor]', fond).forEach(b => b.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    $('[data-modifier-annonce]', fond)?.addEventListener('click', () => { fermer(); ouvrirEditeurAnnonce(kind, item); });
    $('[data-ouvrir-proprietaire]', fond)?.addEventListener('click', () => {
      $('.apercu-corps', fond).innerHTML = vueProprietaire(item.proprietaire, kind, item);
      $('[data-retour-apercu]', fond)?.addEventListener('click', () => { fermer(); ouvrirApercuAnnonce(kind, item.id); });
      $('[data-push-proprietaire]', fond)?.addEventListener('click', () => {
        gestionMessages.preselection = { cible: 'proprietaires', telephone: item.proprietaire.telephone || item.proprietaire.whatsapp || '' };
        gestionMessages.onglet = 'notifications';
        fermer();
        showView('messages');
      });
    });
  }

  /** Ouvre l'éditeur du bon type depuis l'aperçu, via le crayon de la ligne. */
  function ouvrirEditeurAnnonce(kind, item) {
    const attribut = `data-edit-${kind}`;
    $$(`[${attribut}]`).find(bouton => bouton.getAttribute(attribut) === String(item.id))?.click();
  }

  function renderVehicles() {
    const hote = $('#vehiclesTable');
    if (!hote) return;
    const head = '<div class="table-row header"><span>Visuel</span><span>Véhicule</span><span>À partir de</span><span>Conduite</span><span>Catégorie</span><span>Action</span></div>';
    const { onglets, items, actuel } = annoncesFiltrees('vehicle');
    hote.innerHTML = onglets + head + (items.length ? '' : `<div class="empty">${actuel === 'active' ? 'Aucun véhicule en ligne. Cliquez sur « Ajouter un véhicule ».' : actuel === 'suspendue' ? 'Aucun véhicule suspendu.' : 'Aucun véhicule archivé.'}</div>`) + items.map(item => `<div role="button" tabindex="0" data-apercu="vehicle|${esc(item.id)}" class="table-row ${item.visible === false ? 'is-hidden' : ''}"><img src="${esc(item.images?.[0] || '')}" alt=""><div class="table-title"><strong>${esc(item.name)}</strong><small>${esc([LV.libelle(LV.BOITES, item.transmission, 'fr'), LV.libelle(LV.CARBURANTS, item.fuel, 'fr'), `${item.seats || 5} places`].join(' · '))}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉ DU SITE</span>' : ''}${pastillesAnnonce('vehicle', item)}</div><div class="table-cell"><strong>${LV.prixAPartirDe(item) ? money(LV.prixAPartirDe(item)) : 'Sur demande'}</strong><small>par jour</small></div><div>${esc(LV.libelle(LV.MODES_CHAUFFEUR, item.driverMode, 'fr'))}</div><div><span class="status">${esc(LV.libelle(LV.CATEGORIES, item.category, 'fr'))}</span></div><div class="row-actions"><button title="Modifier" data-edit-vehicle="${esc(item.id)}">✎</button><button title="Supprimer" data-delete-vehicle="${esc(item.id)}">×</button></div></div>`).join('');
    $$('[data-edit-vehicle]', hote).forEach(button => button.addEventListener('click', () => openEditor('vehicle', button.dataset.editVehicle)));
    $$('[data-delete-vehicle]', hote).forEach(button => button.addEventListener('click', () => supprimerAnnonce('vehicle', button.dataset.deleteVehicle)));
    brancherListe(hote, 'vehicle');
  }

  // --- Vue « Location » ----------------------------------------------------
  const dateHeureLisible = iso => { try { return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso)); } catch { return iso || '—'; } };
  const STATUTS_LOCATION_CLASSES = { demande: 'loc-demande', confirmee: 'loc-confirmee', en_cours: 'loc-en-cours', terminee: 'loc-terminee', annulee: 'loc-annulee' };
  const pastilleLocation = statut => `<span class="loc-statut ${STATUTS_LOCATION_CLASSES[statut] || ''}">${esc(LV.STATUTS[statut] || statut)}</span>`;
  const ACTIONS_STATUT = { confirmee: 'Confirmer la réservation', en_cours: 'Remise des clés (démarrer)', terminee: 'Retour du véhicule (terminer)', annulee: 'Annuler', demande: 'Remettre en demande' };
  const SOURCES_LOCATION = { site: 'Site', app: 'Application', studio: 'Studio' };
  /** Fiche complète d'un véhicule (tarifs) : catalogue du studio, sinon résumé du planning. */
  const vehiculeLocation = id => (state.content.vehicles || []).find(v => v.id === id) || (gestionLocation.donnees?.vehicules || []).find(v => v.id === id) || null;
  const aujourdhuiUtc = () => new Date().toISOString().slice(0, 10);

  async function chargerLocation() {
    const hote = $('#locationVue');
    if (!hote || !can('location:manage')) return;
    if (!gestionLocation.debut) gestionLocation.debut = aujourdhuiUtc();
    hote.setAttribute('aria-busy', 'true');
    try {
      gestionLocation.donnees = await api('/api/admin/location');
      renderLocation();
      // Ouverture depuis la fiche d'une demande : on montre sa réservation.
      if (gestionLocation.ouvrirPourDemande) {
        const reservation = gestionLocation.donnees.reservations.find(r => r.leadId === gestionLocation.ouvrirPourDemande);
        gestionLocation.ouvrirPourDemande = null;
        if (reservation) ouvrirReservationLocation(reservation); else toast('Aucune réservation liée à cette demande.');
      }
    } catch (error) {
      hote.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    } finally { hote.removeAttribute('aria-busy'); }
  }

  function renderLocation() {
    const hote = $('#locationVue');
    const d = gestionLocation.donnees;
    if (!hote || !d) return;
    const maintenant = Date.now();
    const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
    const finMois = new Date(debutMois); finMois.setUTCMonth(finMois.getUTCMonth() + 1);
    const aTraiter = d.reservations.filter(r => r.statut === 'demande');
    const enCours = d.reservations.filter(r => r.statut === 'en_cours');
    const aVenir = d.reservations.filter(r => r.statut === 'confirmee' && new Date(r.debut).getTime() > maintenant);
    const chiffreMois = d.reservations.filter(r => ['confirmee', 'en_cours', 'terminee'].includes(r.statut) && new Date(r.debut) >= debutMois && new Date(r.debut) < finMois).reduce((s, r) => s + (Number(r.montant) || 0), 0);
    const indispos = d.indisponibilites.filter(b => new Date(b.fin).getTime() > maintenant);
    const onglets = [['planning', 'Planning', 'calendrier', null], ['reservations', 'Réservations', 'liste', aTraiter.length || null], ['indisponibilites', 'Indisponibilités', 'interdit', indispos.length || null], ['reglages', 'Réglages', 'reglages', null]];
    hote.innerHTML = `
      <div class="kpi-grid location-kpis">
        <article class="kpi-card"><small>Demandes à traiter</small><strong>${aTraiter.length}</strong><em>À confirmer ou refuser</em></article>
        <article class="kpi-card"><small>Locations en cours</small><strong>${enCours.length}</strong><em>Véhicules chez les clients</em></article>
        <article class="kpi-card"><small>Départs à venir</small><strong>${aVenir.length}</strong><em>Réservations confirmées</em></article>
        <article class="kpi-card"><small>Chiffre du mois</small><strong>${money(chiffreMois)}</strong><em>Locations confirmées débutant ce mois-ci</em></article>
      </div>
      ${barreOnglets('data-location-onglet', onglets, gestionLocation.onglet, { label: 'Sections de la location', attrs: 'data-location-onglets' })}
      <div class="location-contenu" data-location-contenu></div>`;
    $$('[data-location-onglet]', hote).forEach(bouton => bouton.addEventListener('click', () => { gestionLocation.onglet = bouton.dataset.locationOnglet; renderLocation(); }));
    $$('#locationSousMenu [data-location-aller]').forEach(bouton => {
      const actif = bouton.dataset.locationAller === gestionLocation.onglet;
      bouton.classList.toggle('active', actif);
      if (actif) bouton.setAttribute('aria-current', 'page'); else bouton.removeAttribute('aria-current');
    });
    $('[data-location-onglets] .active', hote)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const contenu = $('[data-location-contenu]', hote);
    ({ planning: renderPlanningLocation, reservations: renderReservationsLocation, indisponibilites: renderIndisponibilitesLocation, reglages: renderReglagesLocation })[gestionLocation.onglet](contenu);
  }

  /** Planning : une ligne par véhicule, une colonne par jour (heure d'Abidjan = UTC). */
  function renderPlanningLocation(hote) {
    const d = gestionLocation.donnees;
    const jours = gestionLocation.jours;
    const debut = new Date(`${gestionLocation.debut}T00:00:00Z`);
    const fin = new Date(debut.getTime() + jours * 86400000);
    const vehicules = d.vehicules.filter(v => v.etat !== 'archivee');
    const pct = date => ((new Date(date).getTime() - debut.getTime()) / (fin.getTime() - debut.getTime())) * 100;
    const barre = (element, genre) => {
      const a = Math.max(0, pct(element.debut));
      const b = Math.min(100, pct(element.fin));
      if (b <= 0 || a >= 100) return '';
      const reservation = genre === 'reservation';
      const texte = reservation ? (element.client?.nom || 'Client') : (d.motifs[element.motif] || element.motif);
      const titre = `${texte} · ${dateHeureLisible(element.debut)} → ${dateHeureLisible(element.fin)}${reservation ? ` · ${LV.STATUTS[element.statut]}` : ''}`;
      return `<button type="button" class="loc-barre ${reservation ? STATUTS_LOCATION_CLASSES[element.statut] : 'loc-indispo'}" style="left:${a}%;width:${Math.max(b - a, 1.5)}%" data-${reservation ? 'loc-reservation' : 'loc-indispo'}="${esc(element.id)}" title="${esc(titre)}">${esc(texte)}</button>`;
    };
    const aujourdHui = aujourdhuiUtc();
    const colonnes = Array.from({ length: jours }, (_, i) => new Date(debut.getTime() + i * 86400000));
    const entete = colonnes.map(jour => {
      const iso = jour.toISOString().slice(0, 10);
      const semaine = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(jour).replace('.', '');
      return `<div class="loc-jour ${[0, 6].includes(jour.getUTCDay()) ? 'we' : ''} ${iso === aujourdHui ? 'auj' : ''}"><small>${semaine}</small><strong>${jour.getUTCDate()}</strong></div>`;
    }).join('');
    const titrePeriode = `${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(debut)} → ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(fin.getTime() - 1))}`;
    const lignes = vehicules.map(v => {
      const reservations = d.reservations.filter(r => r.vehiculeId === v.id && r.statut !== 'annulee');
      const indispos = d.indisponibilites.filter(b => b.vehiculeId === v.id);
      return `<div class="loc-ligne"><div class="loc-vehicule"><div><strong>${esc(v.name)}</strong><small>${esc(LV.libelle(LV.CATEGORIES, v.category, 'fr'))}${v.etat !== 'active' ? ` · ${esc(ETATS_ANNONCE[v.etat] || v.etat)}` : ''}</small></div><button type="button" class="loc-ajout" data-loc-nouvelle="${esc(v.id)}" title="Nouvelle réservation pour ce véhicule" aria-label="Nouvelle réservation : ${esc(v.name)}">＋</button></div><div class="loc-piste" style="--jours:${jours}">${indispos.map(b => barre(b, 'indispo')).join('')}${reservations.map(r => barre(r, 'reservation')).join('')}</div></div>`;
    }).join('');
    hote.innerHTML = `
      <div class="loc-outils">
        <div class="loc-navigation">
          <button type="button" data-loc-periode="-1" aria-label="Période précédente">←</button>
          <button type="button" data-loc-aujourdhui>Aujourd’hui</button>
          <button type="button" data-loc-periode="1" aria-label="Période suivante">→</button>
          <strong>${esc(titrePeriode)}</strong>
        </div>
        <div class="loc-navigation">
          <label class="loc-duree">Afficher<select data-loc-jours>${[7, 14, 30].map(n => `<option value="${n}" ${jours === n ? 'selected' : ''}>${n} jours</option>`).join('')}</select></label>
          <button type="button" class="primary" data-loc-nouvelle="">＋ Réservation</button>
          <button type="button" data-loc-nouvelle-indispo>＋ Indisponibilité</button>
        </div>
      </div>
      ${vehicules.length ? `<div class="loc-planning" role="region" aria-label="Planning des véhicules" tabindex="0"><div class="loc-grille" style="--jours:${jours}"><div class="loc-ligne loc-entete"><div class="loc-vehicule"><strong>Véhicule</strong></div><div class="loc-jours" style="--jours:${jours}">${entete}</div></div>${lignes}</div></div>
      <ul class="loc-legende"><li><i class="loc-demande"></i>Demande à traiter (ne bloque pas)</li><li><i class="loc-confirmee"></i>Confirmée</li><li><i class="loc-en-cours"></i>En cours</li><li><i class="loc-terminee"></i>Terminée</li><li><i class="loc-indispo"></i>Indisponible (entretien, panne…)</li></ul>`
      : '<div class="empty">Aucun véhicule dans le catalogue. Ajoutez-en dans « Voitures », puis publiez.</div>'}`;
    $$('[data-loc-periode]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      gestionLocation.debut = new Date(debut.getTime() + Number(bouton.dataset.locPeriode) * jours * 86400000).toISOString().slice(0, 10);
      renderPlanningLocation(hote);
    }));
    $('[data-loc-aujourdhui]', hote).addEventListener('click', () => { gestionLocation.debut = aujourdhuiUtc(); renderPlanningLocation(hote); });
    $('[data-loc-jours]', hote).addEventListener('change', event => { gestionLocation.jours = Number(event.target.value); renderPlanningLocation(hote); });
    $$('[data-loc-nouvelle]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirReservationLocation(null, { vehiculeId: bouton.dataset.locNouvelle || '' })));
    $('[data-loc-nouvelle-indispo]', hote)?.addEventListener('click', () => ouvrirIndisponibiliteLocation(null));
    $$('[data-loc-reservation]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirReservationLocation(d.reservations.find(r => r.id === bouton.dataset.locReservation))));
    $$('[data-loc-indispo]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirIndisponibiliteLocation(d.indisponibilites.find(b => b.id === bouton.dataset.locIndispo))));
  }

  function renderReservationsLocation(hote) {
    const d = gestionLocation.donnees;
    const filtres = [['demande', 'À traiter'], ['confirmee', 'Confirmées'], ['en_cours', 'En cours'], ['terminee', 'Terminées'], ['annulee', 'Annulées'], ['toutes', 'Toutes']];
    hote.innerHTML = `<div class="compta-filtres">
        <div class="filter-pills">${filtres.map(([id, libelle]) => `<button type="button" data-loc-filtre="${id}" class="${gestionLocation.filtre === id ? 'active' : ''}">${libelle} <span>${id === 'toutes' ? d.reservations.length : d.reservations.filter(r => r.statut === id).length}</span></button>`).join('')}</div>
        <label class="admin-search"><span>Rechercher</span><input type="search" data-loc-recherche value="${esc(gestionLocation.recherche)}" placeholder="Client, téléphone, véhicule…"></label>
        <button type="button" class="primary" data-loc-nouvelle="">＋ Réservation</button>
      </div><div class="content-table loc-reservations" data-loc-liste></div>`;
    const lister = () => {
      const requete = gestionLocation.recherche.trim().toLocaleLowerCase('fr');
      const lignes = d.reservations
        .filter(r => gestionLocation.filtre === 'toutes' || r.statut === gestionLocation.filtre)
        .filter(r => !requete || [r.client?.nom, r.client?.telephone, r.client?.email, r.vehiculeNom].some(v => String(v || '').toLocaleLowerCase('fr').includes(requete)))
        .sort((a, b) => (['terminee', 'annulee', 'toutes'].includes(gestionLocation.filtre) ? -1 : 1) * (new Date(a.debut) - new Date(b.debut)));
      const liste = $('[data-loc-liste]', hote);
      liste.innerHTML = lignes.length ? lignes.map(r => `<div class="table-row loc-ligne-reservation" role="button" tabindex="0" data-loc-reservation="${esc(r.id)}"><div class="table-title"><strong>${esc(r.client?.nom || '—')}</strong><small>${esc(r.client?.telephone || '')}</small></div><div class="table-title"><strong>${esc(vehiculeLocation(r.vehiculeId)?.name || r.vehiculeNom || r.vehiculeId)}</strong><small>${r.chauffeur ? 'Avec chauffeur' : 'Sans chauffeur'}</small></div><div class="table-title"><strong>${esc(dateHeureLisible(r.debut))}</strong><small>→ ${esc(dateHeureLisible(r.fin))} · ${r.jours} j</small></div><div class="table-cell"><strong>${money(r.montant)}</strong>${r.caution ? `<small>caution ${money(r.caution)}</small>` : ''}</div><div>${pastilleLocation(r.statut)}<small class="loc-source">${esc(SOURCES_LOCATION[r.source] || r.source)}</small></div></div>`).join('')
        : '<div class="empty">Aucune réservation dans cette liste.</div>';
      $$('[data-loc-reservation]', liste).forEach(ligne => {
        const ouvrir = () => ouvrirReservationLocation(d.reservations.find(r => r.id === ligne.dataset.locReservation));
        ligne.addEventListener('click', ouvrir);
        ligne.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ouvrir(); } });
      });
    };
    $$('[data-loc-filtre]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      gestionLocation.filtre = bouton.dataset.locFiltre;
      $$('[data-loc-filtre]', hote).forEach(b => b.classList.toggle('active', b === bouton));
      lister();
    }));
    $('[data-loc-recherche]', hote).addEventListener('input', event => { gestionLocation.recherche = event.target.value; lister(); });
    $('[data-loc-nouvelle]', hote).addEventListener('click', () => ouvrirReservationLocation(null));
    lister();
  }

  function renderIndisponibilitesLocation(hote) {
    const d = gestionLocation.donnees;
    const maintenant = Date.now();
    const lignes = [...d.indisponibilites].sort((a, b) => new Date(b.debut) - new Date(a.debut));
    hote.innerHTML = `<p class="compta-aide">Entretien, panne, usage interne… Une indisponibilité bloque le véhicule sur le site et dans l’application pour la période. Les réservations confirmées qui tombent dessus sont signalées.</p>
      <div class="compta-filtres"><button type="button" class="primary" data-loc-nouvelle-indispo>＋ Indisponibilité</button></div>
      <div class="content-table">${lignes.length ? lignes.map(b => `<div class="table-row loc-ligne-reservation ${new Date(b.fin).getTime() < maintenant ? 'is-hidden' : ''}" role="button" tabindex="0" data-loc-indispo="${esc(b.id)}"><div class="table-title"><strong>${esc(vehiculeLocation(b.vehiculeId)?.name || b.vehiculeId)}</strong><small>${esc(d.motifs[b.motif] || b.motif)}</small></div><div class="table-title"><strong>${esc(dateHeureLisible(b.debut))}</strong><small>→ ${esc(dateHeureLisible(b.fin))}</small></div><div class="table-title"><small>${esc(b.notes || '')}</small></div><div>${new Date(b.fin).getTime() < maintenant ? '<span class="loc-statut loc-terminee">Passée</span>' : '<span class="loc-statut loc-indispo">Bloque les dates</span>'}</div></div>`).join('') : '<div class="empty">Aucune indisponibilité enregistrée.</div>'}</div>`;
    $('[data-loc-nouvelle-indispo]', hote).addEventListener('click', () => ouvrirIndisponibiliteLocation(null));
    $$('[data-loc-indispo]', hote).forEach(ligne => {
      const ouvrir = () => ouvrirIndisponibiliteLocation(d.indisponibilites.find(b => b.id === ligne.dataset.locIndispo));
      ligne.addEventListener('click', ouvrir);
      ligne.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ouvrir(); } });
    });
  }

  function renderReglagesLocation(hote) {
    const r = gestionLocation.donnees.reglages;
    const ligneLieu = (l = {}) => `<div class="loc-reglage-ligne" data-lieu><input name="nom" maxlength="120" required value="${esc(l.nom || '')}" placeholder="ex. Aéroport FHB" aria-label="Nom du lieu"><label class="loc-montant">Frais (FCFA)<input type="number" name="frais" min="0" step="500" value="${Number(l.frais) || 0}"></label><label class="loc-actif"><input type="checkbox" name="actif" ${l.actif !== false ? 'checked' : ''}> Proposé</label><input type="hidden" name="id" value="${esc(l.id || '')}">${l.precision ? '<span class="loc-precision" title="Le client indique l’adresse">Adresse à préciser</span>' : '<button type="button" class="danger" data-retirer-ligne aria-label="Retirer ce lieu">×</button>'}</div>`;
    const ligneOption = (o = {}) => `<div class="loc-reglage-ligne" data-option><input name="nom" maxlength="120" required value="${esc(o.nom || '')}" placeholder="ex. Siège bébé" aria-label="Nom de l’option"><label class="loc-montant">Prix (FCFA)<input type="number" name="prix" min="0" step="500" value="${Number(o.prix) || 0}"></label><select name="unite" aria-label="Facturation"><option value="jour" ${o.unite !== 'location' ? 'selected' : ''}>par jour</option><option value="location" ${o.unite === 'location' ? 'selected' : ''}>par location</option></select><label class="loc-actif"><input type="checkbox" name="actif" ${o.actif !== false ? 'checked' : ''}> Proposée</label><input type="hidden" name="id" value="${esc(o.id || '')}"><button type="button" class="danger" data-retirer-ligne aria-label="Retirer cette option">×</button></div>`;
    hote.innerHTML = `<form class="loc-reglages" novalidate>
      <section class="panel"><h3>Lieux de prise en charge et de retour</h3><p class="compta-aide">Les frais s’ajoutent au départ et au retour du lieu choisi (livraison, aéroport…). Un lieu décoché n’est plus proposé. « À domicile », « Bureau » et « Autre » demandent l’adresse au client : fixez leurs frais ou décochez-les.</p><div data-liste-lieux>${r.lieux.map(ligneLieu).join('')}</div><button type="button" data-ajouter-lieu>＋ Ajouter un lieu</button></section>
      <section class="panel"><h3>Options</h3><p class="compta-aide">Facturées par jour de location ou une fois par location. Décochez pour ne plus les proposer.</p><div data-liste-options>${r.options.map(ligneOption).join('')}</div><button type="button" data-ajouter-option>＋ Ajouter une option</button></section>
      <section class="panel"><h3>Horaires et planning</h3><div class="form-grid">
        <label>Prise en charge et retour à partir de<input type="time" name="heureOuverture" value="${esc(r.heureOuverture)}"></label>
        <label>Jusqu’à<input type="time" name="heureFermeture" value="${esc(r.heureFermeture)}"></label>
        <label>Réserver au moins (heures à l’avance)<input type="number" name="delaiMinHeures" min="0" max="168" value="${r.delaiMinHeures}"></label>
        <label>Préparation entre deux locations (heures)<input type="number" name="battementHeures" min="0" max="48" value="${r.battementHeures}"></label>
      </div></section>
      <section class="panel"><h3>Conditions de location</h3><p class="compta-aide">Affichées sur le site et dans l’application, avant l’envoi de la demande.</p>
        <label>Français<textarea name="conditionsFr" rows="4" maxlength="3000">${esc(r.conditions.fr)}</textarea></label>
        <label>Anglais (facultatif)<textarea name="conditionsEn" rows="3" maxlength="3000">${esc(r.conditions.en)}</textarea></label>
        <label>Espagnol (facultatif)<textarea name="conditionsEs" rows="3" maxlength="3000">${esc(r.conditions.es)}</textarea></label>
      </section>
      <div class="editor-actions"><button class="primary" type="submit">Enregistrer les réglages</button></div>
    </form>`;
    const form = $('form', hote);
    form.addEventListener('click', event => {
      if (event.target.closest('[data-retirer-ligne]')) event.target.closest('.loc-reglage-ligne').remove();
      if (event.target.closest('[data-ajouter-lieu]')) { $('[data-liste-lieux]', form).insertAdjacentHTML('beforeend', ligneLieu()); $('[data-liste-lieux] .loc-reglage-ligne:last-child input', form).focus(); }
      if (event.target.closest('[data-ajouter-option]')) { $('[data-liste-options]', form).insertAdjacentHTML('beforeend', ligneOption({ actif: true })); $('[data-liste-options] .loc-reglage-ligne:last-child input', form).focus(); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const lire = ligne => Object.fromEntries([...ligne.querySelectorAll('input, select')].map(champ => [champ.name, champ.type === 'checkbox' ? champ.checked : champ.value]));
      const corps = {
        lieux: $$('[data-lieu]', form).map(lire).map(l => ({ ...l, frais: Number(l.frais) || 0 })),
        options: $$('[data-option]', form).map(lire).map(o => ({ ...o, prix: Number(o.prix) || 0 })),
        heureOuverture: form.elements.heureOuverture.value, heureFermeture: form.elements.heureFermeture.value,
        delaiMinHeures: Number(form.elements.delaiMinHeures.value), battementHeures: Number(form.elements.battementHeures.value),
        conditions: { fr: form.elements.conditionsFr.value, en: form.elements.conditionsEn.value, es: form.elements.conditionsEs.value }
      };
      const bouton = $('button[type="submit"]', form);
      bouton.disabled = true;
      try {
        const reponse = await api('/api/admin/location/reglages', { method: 'PUT', body: JSON.stringify(corps) });
        gestionLocation.donnees.reglages = reponse.reglages;
        toast('Réglages de location enregistrés : le site et l’application les utilisent aussitôt');
        renderLocation();
      } catch (error) { toast(error.message); bouton.disabled = false; }
    });
  }

  /** Tiroir d'édition de la location (enregistrement immédiat, puis rechargement). */
  function ouvrirTiroirLocation({ surtitre, titre, champs, supprimable, actions = '', apresOuverture, enregistrer, supprimer }) {
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop location-backdrop"><form class="editor-drawer location-fiche" novalidate><div class="editor-head"><div><span class="eyebrow">${esc(surtitre)}</span><h2>${esc(titre)}</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">${champs}</div><div class="editor-actions">${actions}${supprimable ? '<button type="button" class="danger" data-location-supprimer>Supprimer</button>' : ''}<button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></div>`);
    const fond = document.body.lastElementChild;
    const formulaire = $('form', fond);
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const echap = event => { if (event.key === 'Escape') fermer(); };
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    document.addEventListener('keydown', echap);
    apresOuverture?.(formulaire, fermer);
    formulaire.addEventListener('submit', async event => {
      event.preventDefault();
      const bouton = $('button[type="submit"]', formulaire);
      bouton.disabled = true;
      try { if (await enregistrer(formulaire) !== false) { fermer(); await chargerLocation(); } else bouton.disabled = false; }
      catch (error) { toast(error.message); bouton.disabled = false; }
    });
    $('[data-location-supprimer]', fond)?.addEventListener('click', async () => {
      try { if (await supprimer()) { fermer(); await chargerLocation(); } }
      catch (error) { toast(error.message); }
    });
    $('input:not([type=hidden]), select', formulaire)?.focus();
    return { fermer };
  }

  const optionsVehicules = actuel => (gestionLocation.donnees?.vehicules || []).filter(v => v.etat !== 'archivee' || v.id === actuel)
    .map(v => `<option value="${esc(v.id)}" ${actuel === v.id ? 'selected' : ''}>${esc(v.name)}${v.etat !== 'active' ? ` (${esc(ETATS_ANNONCE[v.etat] || v.etat)})` : ''}</option>`).join('');

  function ouvrirReservationLocation(reservation, preremplissage = {}) {
    const d = gestionLocation.donnees;
    const r = reservation || { statut: 'demande', chauffeur: false, options: [], client: {}, lieuPrise: d.reglages.lieux.find(l => l.actif)?.id || '', lieuRetour: d.reglages.lieux.find(l => l.actif)?.id || '', ...preremplissage };
    const lieux = actuel => d.reglages.lieux.filter(l => l.actif || l.id === actuel).map(l => `<option value="${esc(l.id)}" ${actuel === l.id ? 'selected' : ''}>${esc(l.nom)}${l.frais ? ` (+${money(l.frais)})` : ''}</option>`).join('');
    const transitions = reservation ? (d.transitions[r.statut] || []) : [];
    const lead = r.leadId ? state.leads.find(l => l.id === r.leadId) : null;
    const wa = lienWhatsApp(r.client?.telephone);
    const actions = transitions.map(cible => `<button type="button" class="${cible === 'annulee' ? 'danger' : ''} loc-transition" data-loc-transition="${cible}">${esc(ACTIONS_STATUT[cible] || cible)}</button>`).join('');
    ouvrirTiroirLocation({
      surtitre: reservation ? `LOCATION · ${(LV.STATUTS[r.statut] || r.statut).toUpperCase()}` : 'LOCATION · NOUVELLE RÉSERVATION',
      titre: reservation ? (r.client?.nom || 'Réservation') : 'Nouvelle réservation',
      supprimable: Boolean(reservation),
      actions,
      champs: `${reservation ? `<div class="loc-resume">${pastilleLocation(r.statut)} <small>${esc(SOURCES_LOCATION[r.source] || r.source)} · reçue ${esc(formatDateTime(r.creeLe))}${r.creePar ? ` · saisie par ${esc(r.creePar)}` : ''}${r.modifiePar ? ` · modifiée par ${esc(r.modifiePar)}` : ''}</small>${wa || lead ? `<div class="lead-actions">${wa ? `<a class="lead-action whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${lead && can('leads:read') ? '<button type="button" class="lead-action" data-voir-demande>Voir la demande</button>' : ''}</div>` : ''}</div>` : ''}
        <div class="form-grid">
          <label>Véhicule<select name="vehiculeId" required>${optionsVehicules(r.vehiculeId)}</select></label>
          <label class="loc-case-chauffeur"><span>Chauffeur</span><span><input type="checkbox" name="chauffeur" ${r.chauffeur ? 'checked' : ''}> Avec chauffeur</span><small data-aide-mode></small></label>
          <label>Prise en charge (heure d’Abidjan)<input type="datetime-local" name="debut" required value="${esc(LV.versSaisie(r.debut))}"></label>
          <label>Retour<input type="datetime-local" name="fin" required value="${esc(LV.versSaisie(r.fin))}"></label>
          <label>Lieu de prise en charge<select name="lieuPrise"><option value="">—</option>${lieux(r.lieuPrise)}</select></label>
          <label>Lieu de retour<select name="lieuRetour"><option value="">—</option>${lieux(r.lieuRetour)}</select></label>
          <label data-adresse-studio="lieuPrise" hidden>Adresse de prise en charge<input name="adressePrise" maxlength="200" value="${esc(r.adressePrise || '')}"></label>
          <label data-adresse-studio="lieuRetour" hidden>Adresse de retour<input name="adresseRetour" maxlength="200" value="${esc(r.adresseRetour || '')}"></label>
        </div>
        ${d.reglages.options.some(o => o.actif || (r.options || []).includes(o.id)) ? `<fieldset class="vehicule-bloc"><legend>Options</legend><div class="toggle-row">${d.reglages.options.filter(o => o.actif || (r.options || []).includes(o.id)).map(o => `<label><input type="checkbox" name="options" value="${esc(o.id)}" ${(r.options || []).includes(o.id) ? 'checked' : ''}> ${esc(o.nom)} (${money(o.prix)} ${o.unite === 'jour' ? '/ jour' : '/ location'})</label>`).join('')}</div></fieldset>` : ''}
        <div class="loc-estimation" data-estimation aria-live="polite"></div>
        <div class="form-grid">
          <label>Client<input name="clientNom" maxlength="120" required value="${esc(r.client?.nom || '')}"></label>
          <label>Téléphone<input name="clientTelephone" maxlength="40" value="${esc(r.client?.telephone || '')}"></label>
          <label>E-mail<input name="clientEmail" type="email" maxlength="180" value="${esc(r.client?.email || '')}"></label>
          <label>Montant retenu (FCFA)<input name="montant" type="number" min="0" step="500" value="${reservation ? Number(r.montant) || 0 : ''}" placeholder="vide = montant calculé"></label>
        </div>
        <label>Notes<textarea name="notes" rows="3" maxlength="1000">${esc(r.notes || '')}</textarea></label>`,
      apresOuverture: (form, fermer) => {
        const estimer = () => {
          const vehicule = vehiculeLocation(form.elements.vehiculeId.value);
          const mode = vehicule?.driverMode || 'choix';
          const caseChauffeur = form.elements.chauffeur;
          if (mode !== 'choix') caseChauffeur.checked = mode === 'avec';
          caseChauffeur.disabled = mode !== 'choix';
          $('[data-aide-mode]', form).textContent = mode === 'choix' ? 'Au choix du client' : mode === 'avec' ? 'Imposé : toujours avec chauffeur' : 'Imposé : le client conduit';
          const devis = LV.devis(vehicule, d.reglages, {
            debut: form.elements.debut.value, fin: form.elements.fin.value, chauffeur: caseChauffeur.checked,
            lieuPrise: form.elements.lieuPrise.value, lieuRetour: form.elements.lieuRetour.value,
            adressePrise: form.elements.adressePrise.value, adresseRetour: form.elements.adresseRetour.value,
            options: $$('[name="options"]:checked', form).map(c => c.value)
          }, { controlerDelai: false });
          $$('[data-adresse-studio]', form).forEach(bloc => { bloc.hidden = !d.reglages.lieux.find(l => l.id === form.elements[bloc.dataset.adresseStudio].value)?.precision; });
          const bloquantes = devis.erreurs.filter(e => ['dates', 'ordre', 'duree', 'tarif'].includes(e.code));
          const occupees = vehicule ? LV.occupations(vehicule.id, d.reservations, d.indisponibilites, { battementHeures: d.reglages.battementHeures, ignorer: reservation?.id }) : [];
          const gene = devis.debut && devis.fin ? LV.conflit(occupees, devis.debut, devis.fin) : null;
          $('[data-estimation]', form).innerHTML = bloquantes.length
            ? `<p class="loc-alerte">${esc(bloquantes[0].message)}</p>`
            : `<p><strong>${money(devis.total)}</strong> calculés pour ${devis.jours} jour${devis.jours > 1 ? 's' : ''} (tarif ${devis.palier}, ${money(devis.tarifJour)}/j)${devis.caution ? ` · caution ${money(devis.caution)}` : ''}${devis.kmInclus ? ` · ${devis.kmInclus} km inclus` : ' · kilométrage illimité'}</p>${gene ? `<p class="loc-alerte">Chevauche ${gene.type === 'indisponibilite' ? 'une indisponibilité' : 'une réservation confirmée'} (${esc(dateHeureLisible(gene.debut))} → ${esc(dateHeureLisible(gene.fin))}, préparation comprise) : la confirmation sera refusée.</p>` : ''}${devis.erreurs.filter(e => ['horaires', 'minimum', 'lieu'].includes(e.code)).map(e => `<p class="loc-note">${esc(e.message)} (règle du site ; libre au studio)</p>`).join('')}`;
        };
        form.addEventListener('input', estimer);
        form.addEventListener('change', estimer);
        estimer();
        $$('[data-loc-transition]', form.parentElement).forEach(bouton => bouton.addEventListener('click', async () => {
          const cible = bouton.dataset.locTransition;
          if (cible === 'annulee' && !confirm('Annuler cette réservation ? Les dates seront libérées et la demande liée archivée.')) return;
          bouton.disabled = true;
          try {
            await api(`/api/admin/location/reservations/${encodeURIComponent(reservation.id)}`, { method: 'PATCH', body: JSON.stringify({ statut: cible }) });
            toast({ confirmee: 'Réservation confirmée : dates bloquées, demande confirmée', en_cours: 'Location démarrée', terminee: 'Location terminée', annulee: 'Réservation annulée', demande: 'Réservation remise en demande' }[cible] || 'Statut mis à jour');
            fermer(); await chargerLocation();
            if (can('leads:read')) { state.leads = (await api('/api/admin/leads').catch(() => ({ leads: state.leads }))).leads || state.leads; renderLeads(); }
          } catch (error) { toast(error.message); bouton.disabled = false; }
        }));
        $('[data-voir-demande]', form)?.addEventListener('click', () => { fermer(); showView('leads'); openLeadEditor(r.leadId); });
      },
      enregistrer: async form => {
        const valeurs = Object.fromEntries(new FormData(form));
        const corps = {
          vehiculeId: valeurs.vehiculeId, debut: valeurs.debut, fin: valeurs.fin, chauffeur: form.elements.chauffeur.checked,
          lieuPrise: valeurs.lieuPrise, lieuRetour: valeurs.lieuRetour, adressePrise: valeurs.adressePrise || '', adresseRetour: valeurs.adresseRetour || '',
          options: $$('[name="options"]:checked', form).map(c => c.value),
          client: { nom: valeurs.clientNom, telephone: valeurs.clientTelephone, email: valeurs.clientEmail },
          montant: valeurs.montant === '' ? null : Number(valeurs.montant), notes: valeurs.notes
        };
        await api(reservation ? `/api/admin/location/reservations/${encodeURIComponent(reservation.id)}` : '/api/admin/location/reservations', { method: reservation ? 'PATCH' : 'POST', body: JSON.stringify(corps) });
        toast(reservation ? 'Réservation mise à jour' : 'Réservation enregistrée (à confirmer pour bloquer les dates)');
      },
      supprimer: async () => {
        if (!confirm('Supprimer définitivement cette réservation ? La demande liée reste dans « Demandes ».')) return false;
        await api(`/api/admin/location/reservations/${encodeURIComponent(reservation.id)}`, { method: 'DELETE' });
        toast('Réservation supprimée');
        return true;
      }
    });
  }

  function ouvrirIndisponibiliteLocation(indispo, preremplissage = {}) {
    const d = gestionLocation.donnees;
    const b = indispo || { motif: 'entretien', ...preremplissage };
    const envoyer = async (form, forcer = false) => {
      const valeurs = Object.fromEntries(new FormData(form));
      const url = indispo ? `/api/admin/location/indisponibilites/${encodeURIComponent(indispo.id)}` : '/api/admin/location/indisponibilites';
      const reponse = await fetch(url, { method: indispo ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...valeurs, forcer }) });
      const corps = await reponse.json().catch(() => ({}));
      if (reponse.status === 409 && corps.conflit && !forcer) {
        if (!confirm(`${corps.error}\n\nEnregistrer quand même l’indisponibilité ? Pensez à prévenir le client.`)) return false;
        return envoyer(form, true);
      }
      if (!reponse.ok) throw new Error(corps.error || 'Enregistrement impossible');
      toast(indispo ? 'Indisponibilité mise à jour' : 'Indisponibilité enregistrée : les dates sont bloquées');
      return true;
    };
    ouvrirTiroirLocation({
      surtitre: 'LOCATION · INDISPONIBILITÉ', titre: indispo ? 'Indisponibilité' : 'Nouvelle indisponibilité', supprimable: Boolean(indispo),
      champs: `<div class="form-grid">
          <label>Véhicule<select name="vehiculeId" required>${optionsVehicules(b.vehiculeId)}</select></label>
          <label>Motif<select name="motif">${Object.entries(d.motifs).map(([id, libelle]) => `<option value="${id}" ${b.motif === id ? 'selected' : ''}>${esc(libelle)}</option>`).join('')}</select></label>
          <label>Début<input type="datetime-local" name="debut" required value="${esc(LV.versSaisie(b.debut))}"></label>
          <label>Fin<input type="datetime-local" name="fin" required value="${esc(LV.versSaisie(b.fin))}"></label>
        </div>
        <label>Notes<textarea name="notes" rows="3" maxlength="500">${esc(b.notes || '')}</textarea></label>`,
      enregistrer: form => envoyer(form),
      supprimer: async () => {
        if (!confirm('Supprimer cette indisponibilité ? Les dates redeviennent réservables.')) return false;
        await api(`/api/admin/location/indisponibilites/${encodeURIComponent(indispo.id)}`, { method: 'DELETE' });
        toast('Indisponibilité supprimée');
        return true;
      }
    });
  }

  // =========================================================================
  // COMPTABILITÉ (17/09/2026) — propriétaire seulement (compta:manage)
  // Journal des entrées et sorties, ventes à encaisser tirées des demandes
  // confirmées (paiements saisis), salaires, charges récurrentes, rapport et
  // export CSV. Chaque enregistrement part aussitôt en base : la comptabilité
  // ne passe pas par « Publier les changements », qui ne concerne que le site.
  // =========================================================================
  const compta = { donnees: null, onglet: 'journal', ongletParametres: 'entrees', periode: 'mois', debut: '', fin: '', sens: 'all', categorie: '', recherche: '' };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const signeMontant = e => `${e.sens === 'entree' ? '+' : '−'} ${money(e.montant)}`;
  const libelleCategorieCompta = id => compta.donnees?.categories?.find(c => c.id === id)?.libelle || id;
  const libelleModeCompta = id => compta.donnees?.modes?.find(m => m.id === id)?.libelle || '';
  const dateCourte = valeur => { try { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${valeur}T12:00:00Z`)); } catch { return valeur; } };
  const moisLisible = mois => { try { return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${mois}-15T12:00:00Z`)); } catch { return mois; } };

  function bornesPeriode(choix) {
    const d = new Date();
    const annee = d.getUTCFullYear();
    const mois = d.getUTCMonth();
    const iso = date => date.toISOString().slice(0, 10);
    if (choix === 'mois') return [iso(new Date(Date.UTC(annee, mois, 1))), iso(new Date(Date.UTC(annee, mois + 1, 0)))];
    if (choix === 'mois-precedent') return [iso(new Date(Date.UTC(annee, mois - 1, 1))), iso(new Date(Date.UTC(annee, mois, 0)))];
    if (choix === 'annee') return [`${annee}-01-01`, `${annee}-12-31`];
    if (choix === 'annee-precedente') return [`${annee - 1}-01-01`, `${annee - 1}-12-31`];
    return [compta.debut, compta.fin];
  }

  async function chargerCompta() {
    const hote = $('#comptaVue');
    if (!hote || !can('compta:manage')) return;
    if (compta.periode !== 'perso' || !compta.debut || !compta.fin) [compta.debut, compta.fin] = bornesPeriode(compta.periode === 'perso' ? 'mois' : compta.periode);
    hote.setAttribute('aria-busy', 'true');
    try {
      compta.donnees = await api(`/api/admin/compta?debut=${encodeURIComponent(compta.debut)}&fin=${encodeURIComponent(compta.fin)}`);
      renderCompta();
    } catch (error) {
      hote.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    } finally { hote.removeAttribute('aria-busy'); }
  }

  function renderCompta() {
    const hote = $('#comptaVue');
    const d = compta.donnees;
    if (!hote || !d) return;
    const r = d.rapport;
    const aEncaisser = d.ventes.filter(v => v.reste > 0);
    const periodes = [['mois', 'Ce mois'], ['mois-precedent', 'Mois précédent'], ['annee', 'Cette année'], ['annee-precedente', 'Année précédente'], ['perso', 'Personnalisée']];
    const onglets = [['journal', 'Journal', 'journal', d.ecritures.length], ['ventes', 'Ventes à encaisser', 'carte', aEncaisser.length], ['salaires', 'Salaires', 'equipe', d.employes.filter(e => e.actif).length], ['charges', 'Charges récurrentes', 'recurrent', d.charges.filter(c => c.actif).length], ['rapport', 'Rapport', 'graphique', null], ['parametres', 'Paramètres', 'reglages', null]];
    hote.innerHTML = `
      <div class="compta-outils">
        <label>Période<select data-compta-periode>${periodes.map(([valeur, libelle]) => `<option value="${valeur}" ${compta.periode === valeur ? 'selected' : ''}>${libelle}</option>`).join('')}</select></label>
        <label>Du<input type="date" data-compta-debut value="${esc(compta.debut)}"></label>
        <label>Au<input type="date" data-compta-fin value="${esc(compta.fin)}"></label>
        <div class="compta-boutons">
          <button type="button" class="primary" data-compta-nouvelle="entree">＋ Entrée</button>
          <button type="button" class="primary" data-compta-nouvelle="sortie">＋ Dépense</button>
          <a class="content-action" href="/api/admin/compta/export?debut=${encodeURIComponent(compta.debut)}&fin=${encodeURIComponent(compta.fin)}" download>Exporter (CSV)</a>
        </div>
      </div>
      <div class="kpi-grid compta-kpis">
        <article class="kpi-card"><small>Entrées encaissées</small><strong>${money(r.entrees)}</strong><em>Du ${esc(dateCourte(r.debut))} au ${esc(dateCourte(r.fin))}</em></article>
        <article class="kpi-card"><small>Sorties payées</small><strong>${money(r.sorties)}</strong><em>Dépenses, salaires, charges réglés</em></article>
        <article class="kpi-card compta-solde ${r.solde < 0 ? 'negatif' : ''}"><small>Solde de la période</small><strong>${r.solde < 0 ? '−' : ''}${money(Math.abs(r.solde))}</strong><em>Entrées − sorties réglées</em></article>
        <article class="kpi-card"><small>Reste à encaisser</small><strong>${money(r.resteAEncaisser)}</strong><em>${aEncaisser.length} vente${aEncaisser.length > 1 ? 's' : ''} confirmée${aEncaisser.length > 1 ? 's' : ''} non soldée${aEncaisser.length > 1 ? 's' : ''}</em></article>
        <article class="kpi-card"><small>Dépenses à payer</small><strong>${money(r.aPayer)}</strong><em>Dépenses en attente de règlement</em></article>
      </div>
      ${barreOnglets('data-compta-onglet', onglets, compta.onglet, { label: 'Sections de la comptabilité', attrs: 'data-compta-onglets' })}
      <div class="compta-contenu" data-compta-contenu></div>`;

    $('[data-compta-periode]', hote).addEventListener('change', event => {
      compta.periode = event.target.value;
      if (compta.periode !== 'perso') chargerCompta();
    });
    ['debut', 'fin'].forEach(borne => $(`[data-compta-${borne}]`, hote).addEventListener('change', event => {
      compta[borne] = event.target.value;
      compta.periode = 'perso';
      if (compta.debut && compta.fin && compta.debut <= compta.fin) chargerCompta();
    }));
    $$('[data-compta-nouvelle]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirEcriture(null, { sens: bouton.dataset.comptaNouvelle })));
    $$('[data-compta-onglet]', hote).forEach(bouton => bouton.addEventListener('click', () => { compta.onglet = bouton.dataset.comptaOnglet; renderCompta(); }));
    // Sous-menu latéral : même section en surbrillance que l'onglet.
    $$('#comptaSousMenu [data-compta-aller]').forEach(bouton => {
      const actif = bouton.dataset.comptaAller === compta.onglet;
      bouton.classList.toggle('active', actif);
      if (actif) bouton.setAttribute('aria-current', 'page'); else bouton.removeAttribute('aria-current');
    });
    // Onglet actif visible sur un écran étroit (barre défilante).
    $('[data-compta-onglets] .active', hote)?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const contenu = $('[data-compta-contenu]', hote);
    ({ journal: renderJournal, ventes: renderVentes, salaires: renderSalaires, charges: renderCharges, rapport: renderRapport, parametres: renderParametres })[compta.onglet](contenu);
  }

  /** Pastille d'un statut : sa couleur suit son effet (réglé, en attente, hors comptes). */
  function pastilleStatut(id) {
    const statut = compta.donnees?.statuts?.find(s => s.id === id);
    const classe = { regle: 'regle', attente: 'a-regler', exclu: 'exclu' }[statut?.effet] || '';
    return `<span class="compta-statut ${classe}">${esc(statut?.libelle || id)}</span>`;
  }

  function ligneEcriture(e) {
    const details = [libelleCategorieCompta(e.categorie), e.tiers, libelleModeCompta(e.mode), e.justificatif ? 'pièce jointe' : ''].filter(Boolean).join(' · ');
    return `<div class="compta-ligne" role="button" tabindex="0" data-compta-ecriture="${esc(e.id)}">
      <time datetime="${esc(e.date)}">${esc(dateCourte(e.date))}</time>
      <div class="compta-ligne-texte"><strong>${esc(e.libelle)}</strong><small>${esc(details)}</small></div>
      ${pastilleStatut(e.statut)}
      <strong class="compta-montant ${e.sens}">${esc(signeMontant(e))}</strong>
    </div>`;
  }

  function brancherLignesEcritures(hote) {
    $$('[data-compta-ecriture]', hote).forEach(ligne => {
      const ouvrir = () => ouvrirEcriture(compta.donnees.ecritures.find(e => e.id === ligne.dataset.comptaEcriture));
      ligne.addEventListener('click', ouvrir);
      ligne.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ouvrir(); } });
    });
  }

  function renderJournal(hote) {
    const d = compta.donnees;
    hote.innerHTML = `<div class="compta-filtres">
        <div class="filter-pills">${[['all', 'Tout'], ['entree', 'Entrées'], ['sortie', 'Sorties']].map(([v, l]) => `<button type="button" data-compta-sens="${v}" class="${compta.sens === v ? 'active' : ''}">${l}</button>`).join('')}</div>
        <select data-compta-categorie aria-label="Catégorie"></select>
        <label class="admin-search"><span>Rechercher</span><input type="search" data-compta-recherche value="${esc(compta.recherche)}" placeholder="Libellé, tiers, référence…"></label>
      </div><div class="content-table compta-journal" data-compta-journal></div>`;
    // Catégories du journal choisi : recettes pour « Entrées », dépenses pour « Sorties », les deux groupées pour « Tout ».
    const remplirCategories = () => {
      const visibles = d.categories.filter(c => (c.actif || d.ecritures.some(e => e.categorie === c.id)) && (compta.sens === 'all' || c.sens === compta.sens));
      if (compta.categorie && !visibles.some(c => c.id === compta.categorie)) compta.categorie = '';
      const option = c => `<option value="${esc(c.id)}" ${compta.categorie === c.id ? 'selected' : ''}>${esc(c.libelle)}</option>`;
      const groupe = (sens, titre) => {
        const items = visibles.filter(c => c.sens === sens);
        return items.length ? `<optgroup label="${titre}">${items.map(option).join('')}</optgroup>` : '';
      };
      const tous = { all: 'Toutes les catégories', entree: 'Toutes les recettes', sortie: 'Toutes les dépenses' }[compta.sens];
      $('[data-compta-categorie]', hote).innerHTML = `<option value="">${tous}</option>${compta.sens === 'all'
        ? groupe('entree', 'Recettes') + groupe('sortie', 'Dépenses')
        : visibles.map(option).join('')}`;
    };
    remplirCategories();
    const lister = () => {
      const requete = compta.recherche.trim().toLocaleLowerCase('fr');
      const lignes = d.ecritures.filter(e => (compta.sens === 'all' || e.sens === compta.sens) && (!compta.categorie || e.categorie === compta.categorie)
        && (!requete || [e.libelle, e.tiers, e.reference, e.notes].some(v => String(v || '').toLocaleLowerCase('fr').includes(requete))));
      const table = $('[data-compta-journal]', hote);
      table.innerHTML = lignes.length ? lignes.map(ligneEcriture).join('') : `<div class="empty">${d.ecritures.length ? 'Aucune écriture ne correspond à ces filtres.' : 'Aucune écriture sur cette période. Ajoutez une entrée ou une dépense.'}</div>`;
      brancherLignesEcritures(table);
    };
    $$('[data-compta-sens]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      compta.sens = bouton.dataset.comptaSens;
      $$('[data-compta-sens]', hote).forEach(b => b.classList.toggle('active', b === bouton));
      remplirCategories();
      lister();
    }));
    $('[data-compta-categorie]', hote).addEventListener('change', event => { compta.categorie = event.target.value; lister(); });
    $('[data-compta-recherche]', hote).addEventListener('input', event => { compta.recherche = event.target.value; lister(); });
    lister();
  }

  const STATUTS_VENTE = { a_encaisser: 'À encaisser', partiel: 'Partiellement payée', solde: 'Soldée' };
  const FORMULES_VENTE = { 'devis-whatsapp': 'Séjour', 'devis-activites': 'Activités', devis: 'Devis', terrain: 'Terrain', villa: 'Résidence', contact: 'Contact', 'location-voiture': 'Voiture' };

  function renderVentes(hote) {
    const ventes = compta.donnees.ventes;
    hote.innerHTML = `<p class="compta-aide">Chaque demande <strong>confirmée</strong> avec un montant devient une vente. Saisissez les paiements reçus (acompte, solde…) : le reste à encaisser se met à jour. Le montant de la vente se règle dans la fiche de la demande.</p>
      <div class="content-table">${ventes.length ? ventes.map(v => {
        const part = v.montant > 0 ? Math.min(100, Math.round((v.encaisse / v.montant) * 100)) : 100;
        const contexte = [FORMULES_VENTE[v.type] || v.type, v.lieu, v.dates].filter(Boolean).join(' · ');
        return `<div class="compta-vente">
          <div class="compta-vente-texte"><strong>${esc(v.client)}</strong> <span class="compta-statut ${v.statut === 'solde' ? 'regle' : 'a-regler'}">${STATUTS_VENTE[v.statut]}</span>${v.statutDemande !== 'confirme' ? ' <span class="compta-statut">Demande non confirmée</span>' : ''}
            <small>${esc(contexte)}</small>
            <div class="compta-barre" role="img" aria-label="${part} % encaissé"><span style="width:${part}%"></span></div>
            <small>Encaissé <strong>${money(v.encaisse)}</strong> sur ${money(v.montant)} · reste <strong>${money(v.reste)}</strong>${v.tropPercu ? ` · trop-perçu ${money(v.tropPercu)}` : ''}</small></div>
          <div class="compta-vente-actions">${v.reste > 0 || !v.montant ? `<button type="button" class="primary" data-compta-paiement="${esc(v.leadId)}">Enregistrer un paiement</button>` : ''}<button type="button" data-compta-demande="${esc(v.leadId)}">Voir la demande</button></div>
        </div>`;
      }).join('') : '<div class="empty">Aucune vente : confirmez une demande (statut « Confirmée » et montant) pour la suivre ici.</div>'}</div>`;
    $$('[data-compta-paiement]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirPaiement(bouton.dataset.comptaPaiement)));
    $$('[data-compta-demande]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      if (state.leads.some(lead => lead.id === bouton.dataset.comptaDemande)) openLeadEditor(bouton.dataset.comptaDemande);
      else toast('Demande introuvable (supprimée ?)');
    }));
  }

  /** Paiement d'une demande : écriture d'entrée pré-remplie, reste à payer proposé. */
  function ouvrirPaiement(leadId) {
    const lead = state.leads.find(entree => entree.id === leadId);
    const vente = compta.donnees?.ventes?.find(v => v.leadId === leadId);
    const categorie = vente?.categorie || (lead?.type === 'terrain' || lead?.terrainRef ? 'terrain' : lead?.type === 'devis-activites' ? 'activites' : 'sejour');
    const lieu = vente?.lieu || lead?.villa || '';
    ouvrirEcriture(null, {
      sens: 'entree', statut: 'regle', categorie, leadId, tiers: lead?.name || vente?.client || '',
      montant: vente ? (vente.reste || '') : (lead?.amount || ''),
      libelle: `Paiement ${lead?.name || vente?.client || 'client'}${lieu ? ` — ${lieu}` : ''}`
    });
  }

  function renderSalaires(hote) {
    const d = compta.donnees;
    const salaires = d.ecritures.filter(e => e.employeId);
    hote.innerHTML = `<div class="compta-section-tete"><h3>Employés</h3><button type="button" data-compta-employe>＋ Employé</button></div>
      <div class="content-table">${d.employes.length ? d.employes.map(e => `<div class="compta-ligne" role="button" tabindex="0" data-compta-fiche-employe="${esc(e.id)}"><span class="compta-avatar" aria-hidden="true">${esc((e.nom || '?').slice(0, 1).toUpperCase())}</span><div class="compta-ligne-texte"><strong>${esc([e.prenom, e.nom].filter(Boolean).join(' '))}</strong><small>${esc([e.poste, e.telephone, e.email, e.dateEmbauche ? `depuis le ${dateCourte(e.dateEmbauche)}` : ''].filter(Boolean).join(' · '))}</small></div>${e.actif ? '' : '<span class="compta-statut">Inactif</span>'}<strong class="compta-montant">${money(e.salaireMensuel)} / mois</strong></div>`).join('') : '<div class="empty">Aucun employé enregistré.</div>'}</div>
      <div class="compta-section-tete"><h3>Paie du mois</h3><div class="compta-generer"><label>Mois<input type="month" data-compta-mois-paie value="${esc((compta.debut || aujourdhui()).slice(0, 7))}"></label><button type="button" class="primary" data-compta-generer-paie>Générer la paie</button></div></div>
      <p class="compta-aide">Crée, pour chaque employé actif, son salaire du mois « à régler » (une seule fois par mois). Ouvrez ensuite chaque salaire pour le marquer réglé, avec la date et le mode de paiement.</p>
      <div class="content-table">${salaires.length ? salaires.map(ligneEcriture).join('') : '<div class="empty">Aucun salaire sur la période affichée.</div>'}</div>`;
    $('[data-compta-employe]', hote).addEventListener('click', () => ouvrirEmploye(null));
    $$('[data-compta-fiche-employe]', hote).forEach(ligne => ligne.addEventListener('click', () => ouvrirEmploye(d.employes.find(e => e.id === ligne.dataset.comptaFicheEmploye))));
    $('[data-compta-generer-paie]', hote).addEventListener('click', () => genererDuMois('paie', $('[data-compta-mois-paie]', hote).value));
    brancherLignesEcritures(hote);
  }

  function renderCharges(hote) {
    const d = compta.donnees;
    const echeances = d.ecritures.filter(e => e.chargeId);
    const periodeCharge = c => `le ${c.jour} de chaque mois, de ${c.debut}${c.fin ? ` à ${c.fin}` : ' sans fin'}`;
    hote.innerHTML = `<div class="compta-section-tete"><h3>Charges récurrentes</h3><button type="button" data-compta-charge>＋ Charge</button></div>
      <div class="content-table">${d.charges.length ? d.charges.map(c => `<div class="compta-ligne" role="button" tabindex="0" data-compta-fiche-charge="${esc(c.id)}"><span class="compta-avatar" aria-hidden="true">↻</span><div class="compta-ligne-texte"><strong>${esc(c.libelle)}</strong><small>${esc([libelleCategorieCompta(c.categorie), c.tiers, periodeCharge(c)].filter(Boolean).join(' · '))}</small></div>${c.actif ? '' : '<span class="compta-statut">Inactive</span>'}<strong class="compta-montant sortie">${money(c.montant)}</strong></div>`).join('') : '<div class="empty">Aucune charge récurrente (loyer, électricité, internet…).</div>'}</div>
      <div class="compta-section-tete"><h3>Échéances du mois</h3><div class="compta-generer"><label>Mois<input type="month" data-compta-mois-charges value="${esc((compta.debut || aujourdhui()).slice(0, 7))}"></label><button type="button" class="primary" data-compta-generer-charges>Générer les échéances</button></div></div>
      <p class="compta-aide">Crée les dépenses « à régler » du mois pour chaque charge active (une seule fois par charge et par mois).</p>
      <div class="content-table">${echeances.length ? echeances.map(ligneEcriture).join('') : '<div class="empty">Aucune échéance sur la période affichée.</div>'}</div>`;
    $('[data-compta-charge]', hote).addEventListener('click', () => ouvrirCharge(null));
    $$('[data-compta-fiche-charge]', hote).forEach(ligne => ligne.addEventListener('click', () => ouvrirCharge(d.charges.find(c => c.id === ligne.dataset.comptaFicheCharge))));
    $('[data-compta-generer-charges]', hote).addEventListener('click', () => genererDuMois('charges-du-mois', $('[data-compta-mois-charges]', hote).value));
    brancherLignesEcritures(hote);
  }

  async function genererDuMois(route, periode) {
    if (!/^\d{4}-\d{2}$/.test(periode || '')) { toast('Choisissez un mois'); return; }
    try {
      const resultat = await api(`/api/admin/compta/${route}`, { method: 'POST', body: JSON.stringify({ periode }) });
      toast(resultat.creees ? `${resultat.creees} écriture(s) « à régler » créée(s) pour ${periode} (${money(resultat.total)})` : `Rien à créer pour ${periode} : déjà fait, ou aucun élément actif`);
      await chargerCompta();
    } catch (error) { toast(error.message); }
  }

  /** Graphique mensuel entrées / sorties : barres groupées, une seule échelle. */
  function graphiqueMensuel(parMois) {
    const mois = parMois.slice(-24);
    const max = Math.max(1, ...mois.flatMap(m => [m.entrees, m.sorties]));
    const pas = [1, 2, 2.5, 5, 10].map(f => f * 10 ** Math.floor(Math.log10(max / 4))).find(p => max / p <= 5) || max / 4;
    const haut = Math.ceil(max / pas) * pas;
    const largeurGroupe = 56, marge = 58, hauteur = 220, bas = 26, haut0 = 10;
    const largeur = marge + mois.length * largeurGroupe + 8;
    const y = v => haut0 + (hauteur - bas - haut0) * (1 - v / haut);
    const barre = (x, valeur, classe, index, serie) => {
      if (!valeur) return '';
      const sommet = y(valeur), base = y(0), l = 20, rayon = Math.min(4, (base - sommet) / 2);
      return `<path class="${classe}" data-point="${index}" data-serie="${serie}" d="M${x},${base} V${sommet + rayon} Q${x},${sommet} ${x + rayon},${sommet} H${x + l - rayon} Q${x + l},${sommet} ${x + l},${sommet + rayon} V${base} Z"></path>`;
    };
    const court = v => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${(v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k` : String(v));
    const graduations = Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => i * pas);
    return `<div class="compta-graphique">
      <div class="compta-legende"><span><i class="entree"></i>Entrées encaissées</span><span><i class="sortie"></i>Sorties payées</span></div>
      <div class="compta-graphique-zone">
        <svg viewBox="0 0 ${largeur} ${hauteur}" width="${largeur}" height="${hauteur}" role="img" aria-label="Entrées et sorties réglées par mois (détail dans le tableau ci-dessous)">
          ${graduations.map(v => `<g class="grille"><line x1="${marge}" x2="${largeur - 4}" y1="${y(v)}" y2="${y(v)}"></line><text x="${marge - 8}" y="${y(v) + 4}" text-anchor="end">${court(v)}</text></g>`).join('')}
          ${mois.map((m, i) => {
            const x = marge + i * largeurGroupe + 7;
            return `<g>${barre(x, m.entrees, 'barre entree', i, 'entrees')}${barre(x + 22, m.sorties, 'barre sortie', i, 'sorties')}<rect class="zone-survol" data-point="${i}" x="${x - 6}" y="${haut0}" width="${largeurGroupe}" height="${hauteur - bas - haut0}"></rect><text class="mois" x="${x + 21}" y="${hauteur - 8}" text-anchor="middle">${esc(moisLisible(m.mois))}</text></g>`;
          }).join('')}
        </svg>
        <div class="compta-infobulle" hidden></div>
      </div>
    </div>`;
  }

  function renderRapport(hote) {
    const r = compta.donnees.rapport;
    const nomBien = (kind, id) => (state.content[COLLECTIONS[kind]] || []).find(item => item.id === id)?.[kind === 'villa' ? 'name' : 'title'] || id;
    const tableCategories = sens => {
      const lignes = r.parCategorie.filter(c => c.sens === sens);
      const total = lignes.reduce((t, c) => t + c.montant, 0);
      return lignes.length ? `<table class="compta-table"><thead><tr><th>${sens === 'entree' ? 'Recettes' : 'Dépenses'}</th><th>Écritures</th><th>Montant</th><th>Part</th></tr></thead><tbody>${lignes.map(c => `<tr><td>${esc(c.libelle)}</td><td>${c.nombre}</td><td>${money(c.montant)}</td><td>${total ? Math.round((c.montant / total) * 100) : 0} %</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td></td><td>${money(total)}</td><td></td></tr></tfoot></table>` : `<p class="compta-aide">Aucune ${sens === 'entree' ? 'recette' : 'dépense'} réglée sur la période.</p>`;
    };
    hote.innerHTML = `${r.parMois.length ? graphiqueMensuel(r.parMois) : ''}
      <div class="compta-rapport-grille">
        <section><h3>Par catégorie</h3>${tableCategories('entree')}${tableCategories('sortie')}</section>
        <section><h3>Par mois</h3>${r.parMois.length ? `<table class="compta-table"><thead><tr><th>Mois</th><th>Entrées</th><th>Sorties</th><th>Solde</th></tr></thead><tbody>${r.parMois.map(m => `<tr><td>${esc(moisLisible(m.mois))}</td><td>${money(m.entrees)}</td><td>${money(m.sorties)}</td><td class="${m.entrees - m.sorties < 0 ? 'negatif' : ''}">${m.entrees - m.sorties < 0 ? '−' : ''}${money(Math.abs(m.entrees - m.sorties))}</td></tr>`).join('')}</tbody></table>` : ''}
        <h3>Par bien</h3>${r.parBien.length ? `<table class="compta-table"><thead><tr><th>Bien</th><th>Entrées</th><th>Sorties</th><th>Résultat</th></tr></thead><tbody>${r.parBien.map(b => `<tr><td>${esc(nomBien(b.bienKind, b.bienId))}</td><td>${money(b.entrees)}</td><td>${money(b.sorties)}</td><td class="${b.entrees - b.sorties < 0 ? 'negatif' : ''}">${b.entrees - b.sorties < 0 ? '−' : ''}${money(Math.abs(b.entrees - b.sorties))}</td></tr>`).join('')}</tbody></table>` : '<p class="compta-aide">Rattachez les écritures à une villa, un terrain ou une activité pour suivre le résultat de chaque bien.</p>'}</section>
      </div>`;
    const zone = $('.compta-graphique-zone', hote);
    if (!zone) return;
    // Écran étroit : le graphique défile, on l'ouvre sur les mois les plus récents.
    zone.scrollLeft = zone.scrollWidth;
    const bulle = $('.compta-infobulle', zone);
    const montrer = (index, event) => {
      const m = r.parMois.slice(-24)[index];
      if (!m) return;
      bulle.innerHTML = `<strong>${esc(moisLisible(m.mois))}</strong><span><i class="entree"></i>Entrées ${money(m.entrees)}</span><span><i class="sortie"></i>Sorties ${money(m.sorties)}</span><span>Solde ${m.entrees - m.sorties < 0 ? '−' : ''}${money(Math.abs(m.entrees - m.sorties))}</span>`;
      bulle.hidden = false;
      const cadre = zone.getBoundingClientRect();
      const gauche = Math.min(Math.max(8, event.clientX - cadre.left + zone.scrollLeft + 12), zone.scrollWidth - 190);
      bulle.style.left = `${gauche}px`;
      bulle.style.top = `${Math.max(4, event.clientY - cadre.top - 60)}px`;
      $$('[data-point]', zone).forEach(el => el.classList.toggle('attenue', el.classList.contains('barre') && Number(el.dataset.point) !== index));
    };
    $$('.zone-survol', zone).forEach(rect => {
      rect.addEventListener('mousemove', event => montrer(Number(rect.dataset.point), event));
      rect.addEventListener('click', event => montrer(Number(rect.dataset.point), event));
    });
    zone.addEventListener('mouseleave', () => { bulle.hidden = true; $$('.attenue', zone).forEach(el => el.classList.remove('attenue')); });
  }

  // ---- Paramètres : catégories, modes de paiement, statuts ----------------
  const EFFETS_STATUT = {
    regle: ['Réglé', 'Argent réellement encaissé ou payé : compte dans le solde.'],
    attente: ['En attente', 'Dû mais pas encore réglé : compte dans « à payer » ou « à recevoir ».'],
    exclu: ['Hors comptes', 'N’entre dans aucun total (annulé, erreur de saisie…).']
  };

  function renderParametres(hote) {
    const d = compta.donnees;
    const bloc = (type, titre, aide, liste, detail) => `<section class="compta-parametres">
        <div class="compta-section-tete"><div><h3>${titre}</h3><p class="compta-aide">${aide}</p></div><button type="button" data-parametre-nouveau="${type}"${type === 'categories' ? ` data-sens="${liste[0]?.sens || 'entree'}"` : ''}>＋ Ajouter</button></div>
        <div class="content-table">${liste.length ? liste.map(p => {
          const usages = d.usages?.[type]?.[p.id] || 0;
          return `<div class="compta-ligne compta-parametre${p.actif ? '' : ' est-inactif'}" role="button" tabindex="0" data-parametre="${type}:${esc(p.id)}">
            <div class="compta-ligne-texte"><strong>${esc(p.libelle)}</strong><small>${esc([detail(p), `${usages} utilisation${usages > 1 ? 's' : ''}`, p.systeme ? 'indispensable' : ''].filter(Boolean).join(' · '))}</small></div>
            ${p.actif ? '' : '<span class="compta-statut">Désactivé</span>'}
          </div>`;
        }).join('') : '<div class="empty">Aucun élément.</div>'}</div>
      </section>`;
    // Une liste à la fois, choisie par des onglets (demande du 17/09/2026).
    const sections = {
      entrees: ['Catégories des entrées', () => bloc('categories', 'Catégories des entrées', 'Recettes : locations, ventes, commissions…', d.categories.filter(c => c.sens === 'entree'), () => 'Entrée'), d.categories.filter(c => c.sens === 'entree').length, 'entree'],
      sorties: ['Catégories des sorties', () => bloc('categories', 'Catégories des sorties', 'Dépenses : salaires, charges, entretien…', d.categories.filter(c => c.sens === 'sortie'), () => 'Sortie'), d.categories.filter(c => c.sens === 'sortie').length, 'sortie'],
      modes: ['Modes de paiement', () => bloc('modes', 'Modes de paiement', 'Espèces, Mobile Money, virement…', d.modes, () => ''), d.modes.length, 'carte'],
      statuts: ['Statuts', () => bloc('statuts', 'Statuts', 'L’effet d’un statut décide de ce qui compte dans le solde et dans les montants à payer ou à recevoir.', d.statuts, p => EFFETS_STATUT[p.effet]?.[0] || p.effet), d.statuts.length, 'drapeau']
    };
    if (!sections[compta.ongletParametres]) compta.ongletParametres = 'entrees';
    hote.innerHTML = `${barreOnglets('data-parametres-onglet', Object.entries(sections).map(([id, [libelle, , nombre, icone]]) => [id, libelle, icone, nombre]), compta.ongletParametres, { label: 'Paramètres de la comptabilité', classe: 'onglets-nav-compact' })}
      <p class="compta-aide">Les listes proposées dans les écritures et les charges. Un élément déjà utilisé ne peut pas être supprimé : désactivez-le pour ne plus le proposer, il reste lisible sur les écritures existantes.</p>
      ${sections[compta.ongletParametres][1]()}`;
    $$('[data-parametres-onglet]', hote).forEach(bouton => bouton.addEventListener('click', () => { compta.ongletParametres = bouton.dataset.parametresOnglet; renderParametres(hote); }));
    $$('[data-parametre-nouveau]', hote).forEach(bouton => bouton.addEventListener('click', () => ouvrirParametre(bouton.dataset.parametreNouveau, null, { sens: bouton.dataset.sens })));
    $$('[data-parametre]', hote).forEach(ligne => {
      const [type, ...reste] = ligne.dataset.parametre.split(':');
      const ouvrir = () => ouvrirParametre(type, d[type].find(p => p.id === reste.join(':')));
      ligne.addEventListener('click', ouvrir);
      ligne.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); ouvrir(); } });
    });
  }

  function ouvrirParametre(type, parametre, preremplissage = {}) {
    const p = { actif: true, ...preremplissage, ...(parametre || {}) };
    const noms = { categories: ['Catégorie', 'Nouvelle catégorie'], modes: ['Mode de paiement', 'Nouveau mode de paiement'], statuts: ['Statut', 'Nouveau statut'] }[type];
    const usages = parametre ? (compta.donnees.usages?.[type]?.[parametre.id] || 0) : 0;
    const verrou = parametre?.systeme ? ' disabled' : '';
    ouvrirTiroirCompta({
      surtitre: 'COMPTABILITÉ · PARAMÈTRES', titre: parametre ? parametre.libelle : noms[1],
      supprimable: Boolean(parametre) && !parametre.systeme,
      champs: `<label>Libellé<input name="libelle" maxlength="80" required value="${esc(p.libelle || '')}"></label>
        ${type === 'categories' ? `<fieldset class="compta-sens"><legend>Type</legend><label><input type="radio" name="sens" value="entree" ${p.sens === 'entree' ? 'checked' : ''}${verrou}> Entrée (recette)</label><label><input type="radio" name="sens" value="sortie" ${p.sens === 'sortie' ? 'checked' : ''}${verrou}> Sortie (dépense)</label></fieldset>` : ''}
        ${type === 'statuts' ? `<fieldset class="compta-effets"><legend>Effet sur les comptes</legend>${Object.entries(EFFETS_STATUT).map(([effet, [libelle, aide]]) => `<label><input type="radio" name="effet" value="${effet}" ${p.effet === effet ? 'checked' : ''}${verrou}><span><strong>${libelle}</strong><small>${aide}</small></span></label>`).join('')}</fieldset>` : ''}
        <div class="form-grid"><label>Ordre d’affichage<input type="number" name="ordre" min="0" max="999" step="1" value="${esc(p.ordre ?? '')}"></label></div>
        <div class="toggle-row"><label><input type="checkbox" name="actif" value="yes" ${p.actif !== false ? 'checked' : ''}${verrou}> Actif (proposé dans les listes)</label></div>
        ${parametre?.systeme ? '<p class="compta-aide">Élément indispensable (paie du mois, calcul du solde) : seuls son libellé et son ordre se modifient.</p>' : ''}
        ${parametre ? `<p class="compta-tracabilite">${usages ? `Utilisé par <strong>${usages}</strong> écriture(s) ou charge(s) : il ne peut pas être supprimé, désactivez-le pour ne plus le proposer.` : 'Utilisé nulle part : il peut être supprimé.'}</p>` : ''}`,
      enregistrer: async formulaire => {
        if (!formulaire.reportValidity()) throw new Error('Complétez les champs requis');
        const valeurs = Object.fromEntries(new FormData(formulaire));
        const corps = { id: parametre?.id, libelle: valeurs.libelle, ordre: valeurs.ordre === '' ? undefined : Number(valeurs.ordre), actif: formulaire.elements.actif.checked };
        if (type === 'categories') corps.sens = valeurs.sens || parametre?.sens;
        if (type === 'statuts') corps.effet = valeurs.effet || parametre?.effet;
        await api(`/api/admin/compta/parametres/${type}`, { method: 'POST', body: JSON.stringify(corps) });
        toast(parametre ? 'Paramètre mis à jour' : 'Paramètre ajouté');
      },
      supprimer: async () => {
        if (!confirm(`Supprimer « ${parametre.libelle} » ?`)) return false;
        await api(`/api/admin/compta/parametres/${type}/${encodeURIComponent(parametre.id)}`, { method: 'DELETE' });
        toast('Paramètre supprimé');
        return true;
      }
    });
  }

  // ---- Fiches de saisie -------------------------------------------------
  function ouvrirTiroirCompta({ surtitre, titre, champs, supprimable, apresOuverture, enregistrer, supprimer, recharger = chargerCompta }) {
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop compta-backdrop"><form class="editor-drawer compta-fiche" novalidate><div class="editor-head"><div><span class="eyebrow">${esc(surtitre)}</span><h2>${esc(titre)}</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">${champs}</div><div class="editor-actions">${supprimable ? '<button type="button" class="danger" data-compta-supprimer>Supprimer</button>' : ''}<button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></div>`);
    const fond = document.body.lastElementChild;
    const formulaire = $('form', fond);
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const echap = event => { if (event.key === 'Escape') fermer(); };
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    document.addEventListener('keydown', echap);
    apresOuverture?.(formulaire);
    formulaire.addEventListener('submit', async event => {
      event.preventDefault();
      const bouton = $('button[type="submit"]', formulaire);
      bouton.disabled = true;
      try { await enregistrer(formulaire); fermer(); await recharger(); }
      catch (error) { toast(error.message); bouton.disabled = false; }
    });
    $('[data-compta-supprimer]', fond)?.addEventListener('click', async () => {
      try { if (await supprimer()) { fermer(); await recharger(); } }
      catch (error) { toast(error.message); }
    });
    $('input:not([type=hidden]):not([type=radio]), select', formulaire)?.focus();
  }

  const optionsModes = actuel => `<option value="">—</option>${(compta.donnees?.modes || []).filter(m => m.actif || m.id === actuel).map(m => `<option value="${esc(m.id)}" ${actuel === m.id ? 'selected' : ''}>${esc(m.libelle)}${m.actif ? '' : ' (désactivé)'}</option>`).join('')}`;
  const optionsStatuts = actuel => (compta.donnees?.statuts || []).filter(s => s.actif || s.id === actuel).map(s => `<option value="${esc(s.id)}" ${actuel === s.id ? 'selected' : ''}>${esc(s.libelle)}${s.actif ? '' : ' (désactivé)'}</option>`).join('');
  const optionsBiens = (kind, id) => `<option value="">Aucun</option>${Object.entries({ villa: ['villas', 'Villa'], terrain: ['terrains', 'Terrain'], activity: ['activities', 'Activité'] }).map(([k, [cle, libelle]]) => (state.content[cle] || []).map(item => `<option value="${k}:${esc(item.id)}" ${kind === k && id === item.id ? 'selected' : ''}>${libelle} · ${esc(item.name || item.title || item.id)}</option>`).join('')).join('')}`;

  /** Qui a saisi et modifié l'écriture ; pour une nouvelle, l'utilisateur connecté. */
  function tracabiliteEcriture(ecriture) {
    const horodatage = valeur => { try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valeur)); } catch { return ''; } };
    const moi = state.user?.username || 'vous';
    if (!ecriture) return `<p class="compta-tracabilite">Sera enregistrée au nom de <strong>${esc(moi)}</strong>.</p>`;
    const saisie = `Saisie par <strong>${esc(ecriture.creePar || 'inconnu')}</strong>${ecriture.creeLe ? ` le ${esc(horodatage(ecriture.creeLe))}` : ''}`;
    const modification = ecriture.modifiePar ? ` · modifiée par <strong>${esc(ecriture.modifiePar)}</strong>${ecriture.majLe ? ` le ${esc(horodatage(ecriture.majLe))}` : ''}` : '';
    return `<p class="compta-tracabilite">${saisie}${modification}. Une nouvelle modification sera enregistrée au nom de <strong>${esc(moi)}</strong>.</p>`;
  }

  function ouvrirEcriture(ecriture, preremplissage = {}) {
    const e = { date: aujourdhui(), statut: 'regle', sens: 'sortie', ...preremplissage, ...(ecriture || {}) };
    const categoriesDe = sens => (compta.donnees?.categories || []).filter(c => c.sens === sens && (c.actif || c.id === e.categorie));
    const leads = [...state.leads].sort((a, b) => (b.status === 'confirme') - (a.status === 'confirme') || String(b.createdAt).localeCompare(String(a.createdAt)));
    const champs = `<fieldset class="compta-sens"><legend>Type d’écriture</legend><label><input type="radio" name="sens" value="entree" ${e.sens === 'entree' ? 'checked' : ''}> Entrée (recette)</label><label><input type="radio" name="sens" value="sortie" ${e.sens === 'sortie' ? 'checked' : ''}> Sortie (dépense)</label></fieldset>
      <div class="form-grid">
        <label>Date<input type="date" name="date" required value="${esc(e.date)}"></label>
        <label>Montant (FCFA)<input type="number" name="montant" min="1" step="1" required inputmode="numeric" value="${esc(e.montant ?? '')}"></label>
        <label>Catégorie<select name="categorie" required data-categories></select></label>
        <label>Statut<select name="statut">${optionsStatuts(e.statut)}</select></label>
        <label>Mode de paiement<select name="mode">${optionsModes(e.mode)}</select></label>
        <label>Référence (facture, reçu)<input name="reference" maxlength="80" value="${esc(e.reference || '')}"></label>
      </div>
      <label>Libellé<input name="libelle" maxlength="240" required value="${esc(e.libelle || '')}" placeholder="ex. Réparation de la pompe de la piscine"></label>
      <label>Tiers (client, fournisseur, employé)<input name="tiers" maxlength="160" value="${esc(e.tiers || '')}"></label>
      <div class="form-grid">
        <label>Bien concerné<select name="bien">${optionsBiens(e.bienKind, e.bienId)}</select></label>
        <label data-champ-demande>Demande liée (paiement client)<select name="leadId"><option value="">Aucune</option>${leads.map(l => `<option value="${esc(l.id)}" ${e.leadId === l.id ? 'selected' : ''}>${esc(l.name || l.email || 'Client')}${l.status === 'confirme' ? ' · confirmée' : ''}${l.amount ? ` · ${money(l.amount)}` : ''}</option>`).join('')}${e.leadId && !leads.some(l => l.id === e.leadId) ? `<option value="${esc(e.leadId)}" selected>Demande supprimée</option>` : ''}</select></label>
      </div>
      <div class="compta-piece"><input type="hidden" name="justificatif" value="${esc(e.justificatif || '')}"><span data-piece-etat>${e.justificatif ? `<a href="/api/admin/compta/justificatifs/${esc(e.justificatif)}" target="_blank" rel="noopener">Voir la pièce justificative</a>` : 'Aucune pièce justificative'}</span><label class="upload-button">＋ Joindre (photo ou PDF)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-piece-fichier></label>${e.justificatif ? '<button type="button" data-piece-retirer>Retirer</button>' : ''}</div>
      <label>Notes<textarea name="notes" rows="3" maxlength="2000">${esc(e.notes || '')}</textarea></label>
      ${tracabiliteEcriture(ecriture)}
      ${ecriture?.employeId ? '<p class="compta-aide">Salaire généré depuis la fiche de l’employé.</p>' : ecriture?.chargeId ? '<p class="compta-aide">Échéance générée depuis une charge récurrente.</p>' : ''}`;
    ouvrirTiroirCompta({
      surtitre: ecriture ? 'COMPTABILITÉ · MODIFICATION' : 'COMPTABILITÉ · NOUVELLE ÉCRITURE',
      titre: ecriture ? ecriture.libelle : (e.sens === 'entree' ? 'Entrée d’argent' : 'Dépense'),
      champs, supprimable: Boolean(ecriture),
      apresOuverture: formulaire => {
        const remplirCategories = () => {
          const sens = formulaire.elements.sens.value;
          const actuelle = formulaire.elements.categorie.value || e.categorie;
          formulaire.elements.categorie.innerHTML = categoriesDe(sens).map(c => `<option value="${c.id}" ${actuelle === c.id ? 'selected' : ''}>${esc(c.libelle)}</option>`).join('');
          $('[data-champ-demande]', formulaire).hidden = sens !== 'entree';
          if (sens !== 'entree') formulaire.elements.leadId.value = '';
        };
        $$('[name="sens"]', formulaire).forEach(radio => radio.addEventListener('change', remplirCategories));
        remplirCategories();
        $('[data-piece-fichier]', formulaire).addEventListener('change', async event => {
          const fichier = event.target.files[0];
          if (!fichier) return;
          const etat = $('[data-piece-etat]', formulaire);
          if (fichier.size > 8_000_000) { toast('La pièce doit peser moins de 8 Mo'); return; }
          etat.textContent = 'Envoi de la pièce…';
          try {
            const donnees = await new Promise((ok, ko) => { const lecteur = new FileReader(); lecteur.onload = () => ok(lecteur.result); lecteur.onerror = () => ko(new Error('Lecture du fichier impossible')); lecteur.readAsDataURL(fichier); });
            const resultat = await api('/api/admin/compta/justificatifs', { method: 'POST', body: JSON.stringify({ filename: fichier.name, mimeType: fichier.type, data: donnees }) });
            formulaire.elements.justificatif.value = resultat.fichier;
            etat.innerHTML = `<a href="/api/admin/compta/justificatifs/${esc(resultat.fichier)}" target="_blank" rel="noopener">${esc(fichier.name)}</a> (jointe)`;
          } catch (error) { etat.textContent = error.message; }
          event.target.value = '';
        });
        $('[data-piece-retirer]', formulaire)?.addEventListener('click', event => {
          formulaire.elements.justificatif.value = '';
          $('[data-piece-etat]', formulaire).textContent = 'Pièce retirée (effectif à l’enregistrement)';
          event.currentTarget.remove();
        });
      },
      enregistrer: async formulaire => {
        if (!formulaire.reportValidity()) throw new Error('Complétez les champs requis');
        const valeurs = Object.fromEntries(new FormData(formulaire));
        const [bienKind = '', bienId = ''] = String(valeurs.bien || '').split(':');
        const corps = { ...valeurs, montant: Number(valeurs.montant), bienKind, bienId };
        delete corps.bien;
        await api(ecriture ? `/api/admin/compta/ecritures/${encodeURIComponent(ecriture.id)}` : '/api/admin/compta/ecritures', { method: ecriture ? 'PATCH' : 'POST', body: JSON.stringify(corps) });
        toast(ecriture ? 'Écriture mise à jour' : 'Écriture enregistrée');
      },
      supprimer: async () => {
        if (!confirm(`Supprimer définitivement l’écriture « ${ecriture.libelle} » (${signeMontant(ecriture)}) ?`)) return false;
        await api(`/api/admin/compta/ecritures/${encodeURIComponent(ecriture.id)}`, { method: 'DELETE' });
        toast('Écriture supprimée');
        return true;
      }
    });
  }

  function ouvrirEmploye(employe) {
    const e = employe || { actif: true };
    ouvrirTiroirCompta({
      surtitre: 'COMPTABILITÉ · SALAIRES', titre: employe ? [employe.prenom, employe.nom].filter(Boolean).join(' ') : 'Nouvel employé', supprimable: Boolean(employe),
      // Coordonnées (19/09/2026) : le téléphone ou le WhatsApp rapproche
      // l'employé de son app pour les notifications de Messages ; l'e-mail
      // reçoit les mêmes messages.
      champs: `<div class="form-grid">
          <label>Nom<input name="nom" maxlength="120" required value="${esc(e.nom || '')}"></label>
          <label>Prénom<input name="prenom" maxlength="80" value="${esc(e.prenom || '')}"></label>
          <label>Poste<input name="poste" maxlength="120" value="${esc(e.poste || '')}" placeholder="ex. Gardien, gouvernante"></label>
          <label>E-mail<input type="email" name="email" maxlength="180" value="${esc(e.email || '')}"></label>
          <label>Téléphone<input type="tel" name="telephone" maxlength="40" value="${esc(e.telephone || '')}"></label>
          <label>WhatsApp<input type="tel" name="whatsapp" maxlength="40" value="${esc(e.whatsapp || '')}"></label>
          <label>Salaire mensuel (FCFA)<input type="number" name="salaireMensuel" min="0" step="1" required value="${esc(e.salaireMensuel ?? '')}"></label>
          <label>Date d’embauche<input type="date" name="dateEmbauche" value="${esc(e.dateEmbauche || '')}"></label>
        </div>
        <div class="toggle-row"><label><input type="checkbox" name="actif" value="yes" ${e.actif !== false ? 'checked' : ''}> Actif (inclus dans la paie du mois)</label></div>
        <label>Notes<textarea name="notes" rows="3" maxlength="2000">${esc(e.notes || '')}</textarea></label>`,
      enregistrer: async formulaire => {
        if (!formulaire.reportValidity()) throw new Error('Complétez les champs requis');
        const valeurs = Object.fromEntries(new FormData(formulaire));
        const corps = { ...valeurs, salaireMensuel: Number(valeurs.salaireMensuel), actif: formulaire.elements.actif.checked };
        await api(employe ? `/api/admin/compta/employes/${encodeURIComponent(employe.id)}` : '/api/admin/compta/employes', { method: employe ? 'PATCH' : 'POST', body: JSON.stringify(corps) });
        toast(employe ? 'Employé mis à jour' : 'Employé ajouté');
      },
      supprimer: async () => {
        if (!confirm(`Supprimer ${employe.nom} ? S’il a déjà des salaires enregistrés, désactivez-le plutôt.`)) return false;
        await api(`/api/admin/compta/employes/${encodeURIComponent(employe.id)}`, { method: 'DELETE' });
        toast('Employé supprimé');
        return true;
      }
    });
  }

  function ouvrirCharge(charge) {
    const c = charge || { actif: true, jour: 5, debut: aujourdhui().slice(0, 7) };
    const categories = (compta.donnees?.categories || []).filter(x => x.sens === 'sortie' && (x.actif || x.id === c.categorie));
    ouvrirTiroirCompta({
      surtitre: 'COMPTABILITÉ · CHARGES RÉCURRENTES', titre: charge ? charge.libelle : 'Nouvelle charge récurrente', supprimable: Boolean(charge),
      champs: `<label>Libellé<input name="libelle" maxlength="240" required value="${esc(c.libelle || '')}" placeholder="ex. Loyer du bureau, facture CIE"></label>
        <div class="form-grid">
          <label>Catégorie<select name="categorie" required>${categories.map(x => `<option value="${x.id}" ${c.categorie === x.id ? 'selected' : ''}>${esc(x.libelle)}</option>`).join('')}</select></label>
          <label>Montant (FCFA)<input type="number" name="montant" min="1" step="1" required value="${esc(c.montant ?? '')}"></label>
          <label>Jour d’échéance (1 à 28)<input type="number" name="jour" min="1" max="28" step="1" required value="${esc(c.jour ?? 5)}"></label>
          <label>Mode de paiement<select name="mode">${optionsModes(c.mode)}</select></label>
          <label>Premier mois<input type="month" name="debut" required value="${esc(c.debut || '')}"></label>
          <label>Dernier mois (facultatif)<input type="month" name="fin" value="${esc(c.fin || '')}"></label>
        </div>
        <label>Tiers (fournisseur)<input name="tiers" maxlength="160" value="${esc(c.tiers || '')}"></label>
        <label>Bien concerné<select name="bien">${optionsBiens(c.bienKind, c.bienId)}</select></label>
        <div class="toggle-row"><label><input type="checkbox" name="actif" value="yes" ${c.actif !== false ? 'checked' : ''}> Active (échéances générées chaque mois)</label></div>
        <label>Notes<textarea name="notes" rows="3" maxlength="2000">${esc(c.notes || '')}</textarea></label>`,
      enregistrer: async formulaire => {
        if (!formulaire.reportValidity()) throw new Error('Complétez les champs requis');
        const valeurs = Object.fromEntries(new FormData(formulaire));
        const [bienKind = '', bienId = ''] = String(valeurs.bien || '').split(':');
        const corps = { ...valeurs, montant: Number(valeurs.montant), jour: Number(valeurs.jour), actif: formulaire.elements.actif.checked, bienKind, bienId };
        delete corps.bien;
        await api(charge ? `/api/admin/compta/charges/${encodeURIComponent(charge.id)}` : '/api/admin/compta/charges', { method: charge ? 'PATCH' : 'POST', body: JSON.stringify(corps) });
        toast(charge ? 'Charge mise à jour' : 'Charge ajoutée');
      },
      supprimer: async () => {
        if (!confirm(`Supprimer la charge « ${charge.libelle} » ? Les échéances déjà créées restent dans le journal.`)) return false;
        await api(`/api/admin/compta/charges/${encodeURIComponent(charge.id)}`, { method: 'DELETE' });
        toast('Charge supprimée');
        return true;
      }
    });
  }

  /** Bloc « Paiements » de la fiche d'une demande (comptabilité). */
  async function paiementsDemande(hote, lead) {
    try {
      if (!compta.donnees) {
        [compta.debut, compta.fin] = bornesPeriode(compta.periode);
        compta.donnees = await api(`/api/admin/compta?debut=${encodeURIComponent(compta.debut)}&fin=${encodeURIComponent(compta.fin)}`);
      }
      const vente = compta.donnees.ventes.find(v => v.leadId === lead.id);
      hote.innerHTML = `<h3>Paiements</h3>${vente ? `<p class="lead-paiements-synthese">Encaissé <strong>${money(vente.encaisse)}</strong> sur ${money(vente.montant)} · reste <strong>${money(vente.reste)}</strong></p>${vente.paiements.length ? `<ul class="lead-paiements">${vente.paiements.map(p => `<li>${esc(dateCourte(p.date))} · ${money(p.montant)}${p.mode ? ` · ${esc(libelleModeCompta(p.mode))}` : ''}</li>`).join('')}</ul>` : ''}` : `<p class="lead-paiements-synthese">${lead.status === 'confirme' && lead.amount ? '' : 'Confirmez la demande avec un montant pour la suivre en comptabilité. '}Aucun paiement enregistré.</p>`}<button type="button" class="content-action" data-paiement-demande>Enregistrer un paiement</button>`;
      $('[data-paiement-demande]', hote).addEventListener('click', () => ouvrirPaiement(lead.id));
    } catch (error) { hote.innerHTML = `<h3>Paiements</h3><p class="lead-paiements-synthese">${esc(error.message)}</p>`; }
  }

  // ===== Gestion des demandes et des demandeurs (17/09/2026) =================
  // Bloquer : les prochaines demandes du même téléphone ou e-mail sont refusées
  // sur le site et l'application. Suspendre : idem pendant 7, 30 ou 90 jours.
  // Supprimer le demandeur : toutes ses demandes sont effacées, définitivement.
  function gestionDemandeur(lead) {
    const r = lead.restriction;
    if (r) {
      const depuis = r.creeLe ? ` le ${formatDate(r.creeLe)}` : '';
      const etat = r.type === 'bloque' ? `Bloqué${depuis}` : `Suspendu jusqu’au ${formatDate(r.jusquAu)}`;
      return `<div class="demandeur-gestion"><p class="demandeur-etat ${esc(r.type)}"><strong>${esc(etat)}</strong>${r.motif ? ` — ${esc(r.motif)}` : ''}<br><small>Ses nouvelles demandes sont refusées sur le site et dans l’application.</small></p><div class="demandeur-boutons"><button type="button" data-lever-restriction="${esc(r.id)}">Lever ${r.type === 'bloque' ? 'le blocage' : 'la suspension'}</button><button type="button" class="danger" data-supprimer-demandeur>Supprimer le demandeur</button></div></div>`;
    }
    return `<div class="demandeur-gestion"><label class="demandeur-motif">Motif (facultatif, interne)<input data-motif-restriction maxlength="500" placeholder="ex. demandes fantaisistes répétées"></label><div class="demandeur-boutons"><button type="button" data-bloquer-demandeur>Bloquer</button><span class="demandeur-suspendre"><select data-duree-suspension aria-label="Durée de suspension"><option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select><button type="button" data-suspendre-demandeur>Suspendre</button></span><button type="button" class="danger" data-supprimer-demandeur>Supprimer le demandeur</button></div></div>`;
  }

  async function rechargerDemandes() {
    const [leads, dashboard] = await Promise.all([api('/api/admin/leads'), api('/api/admin/dashboard').catch(() => null)]);
    state.leads = leads.leads || [];
    if (dashboard) state.dashboard = dashboard;
    renderLeads(); renderDashboard(); renderOperations();
  }

  function brancherGestionDemande(racine, lead, fermer) {
    const restreindre = async (type) => {
      const corps = { leadId: lead.id, type, motif: $('[data-motif-restriction]', racine)?.value || '' };
      if (type === 'suspendu') corps.jours = Number($('[data-duree-suspension]', racine).value);
      const qui = lead.name || 'ce demandeur';
      const quoi = type === 'bloque' ? `Bloquer ${qui}` : `Suspendre ${qui} pendant ${corps.jours} jours`;
      if (!confirm(`${quoi} ?\n\nSes prochaines demandes (même téléphone ou même e-mail) seront refusées sur le site et dans l’application.`)) return;
      try {
        await api('/api/admin/demandeurs/restrictions', { method: 'POST', body: JSON.stringify(corps) });
        await rechargerDemandes(); fermer(); openLeadEditor(lead.id);
        toast(type === 'bloque' ? 'Demandeur bloqué' : `Demandeur suspendu ${corps.jours} jours`);
      } catch (error) { toast(error.message); }
    };
    $('[data-bloquer-demandeur]', racine)?.addEventListener('click', () => restreindre('bloque'));
    $('[data-suspendre-demandeur]', racine)?.addEventListener('click', () => restreindre('suspendu'));
    $('[data-lever-restriction]', racine)?.addEventListener('click', async event => {
      try {
        await api(`/api/admin/demandeurs/restrictions/${encodeURIComponent(event.currentTarget.dataset.leverRestriction)}`, { method: 'DELETE' });
        await rechargerDemandes(); fermer(); openLeadEditor(lead.id);
        toast('Mesure levée : ses demandes sont de nouveau acceptées');
      } catch (error) { toast(error.message); }
    });
    $('[data-supprimer-demandeur]', racine)?.addEventListener('click', async () => {
      // Liste à jour : une demande arrivée depuis l'ouverture du studio compte aussi.
      try { state.leads = (await api('/api/admin/leads')).leads || state.leads; } catch { /* compte sur la liste connue */ }
      const lies =state.leads.filter(autre => autre.id === lead.id || memeDemandeurStudio(autre, lead)).length;
      if (!confirm(`Supprimer définitivement ${lead.name || 'ce demandeur'} et ses coordonnées ?\n\n${lies} demande${lies > 1 ? 's' : ''} (même téléphone ou même e-mail) ${lies > 1 ? 'seront effacées' : 'sera effacée'}. Cette action ne peut pas être annulée.${lead.restriction ? '\n\nLe blocage en cours est conservé.' : ''}`)) return;
      try {
        const resultat = await api('/api/admin/demandeurs/supprimer', { method: 'POST', body: JSON.stringify({ leadId: lead.id }) });
        fermer(); await rechargerDemandes();
        toast(`Demandeur supprimé : ${resultat.supprimees} demande(s) effacée(s)`);
      } catch (error) { toast(error.message); }
    });
    $('[data-supprimer-demande]', racine)?.addEventListener('click', async () => {
      if (!confirm(`Supprimer définitivement cette demande de ${lead.name || 'ce visiteur'} ?\n\nCette action ne peut pas être annulée. Pour la garder sans l’avoir sous les yeux, archivez-la plutôt.`)) return;
      try {
        await api(`/api/admin/leads/${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
        fermer(); await rechargerDemandes();
        toast('Demande supprimée');
      } catch (error) { toast(error.message); }
    });
    $('[data-archiver-demande]', racine)?.addEventListener('click', async () => {
      const status = lead.status === 'archive' ? 'nouveau' : 'archive';
      try {
        await api(`/api/admin/leads/${encodeURIComponent(lead.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        fermer(); await rechargerDemandes();
        toast(status === 'archive' ? 'Demande archivée' : 'Demande désarchivée (statut « Nouvelle »)');
      } catch (error) { toast(error.message); }
    });
  }

  /** Même téléphone ou même e-mail (règle de db/demandeurs.js, pour le compte affiché). */
  function memeDemandeurStudio(a, b) {
    const tel = valeur => { let c = String(valeur || '').replace(/\D/g, ''); if (c.startsWith('00')) c = c.slice(2); if (c.startsWith('225') && c.length === 13) c = c.slice(3); return c.length >= 8 ? c : ''; };
    const mail = valeur => String(valeur || '').trim().toLowerCase();
    return Boolean((tel(a.phone) && tel(a.phone) === tel(b.phone)) || (mail(a.email).includes('@') && mail(a.email) === mail(b.email)));
  }

  // ===== Messages WhatsApp promotionnels ===================================
  // Envoi par liens wa.me : le serveur prépare, pour chaque destinataire, le
  // lien avec le message personnalisé (db/whatsapp-promo.js). Destinataires :
  // clients ayant coché l'accord dans le simulateur, hors « ne plus contacter ».
  let chargementMessages = null;
  // ---- Messages : WhatsApp, notifications de l'app, propriétaires (19/09/2026) ----
  // `preselection` : renseignée quand on arrive depuis la fiche d'une annonce
  // (bouton « Notification » du propriétaire), consommée au premier rendu.
  const gestionMessages = { onglet: 'whatsapp', donnees: null, chargement: null, preselection: null };
  const SECTIONS_MESSAGES = [['whatsapp', 'WhatsApp', 'leads:read', 'bulle'], ['notifications', 'Notifications de l’app', 'notifications:manage', 'cloche'],
    ['proprietaires', 'Propriétaires', 'notifications:manage', 'carnet']];
  const TYPES_ANNONCE_PROPRIETAIRE = { villa: 'Résidences', vehicle: 'Véhicules', activity: 'Activités', terrain: 'Terrains' };
  const dateHeureCourte = valeur => { try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valeur)); } catch { return ''; } };
  const nomComplet = p => [p.prenom, p.nom].filter(Boolean).join(' ');

  /** Affiche la section choisie (onglets du panneau et sous-menu) et charge ses données. */
  function ouvrirSectionMessages() {
    const permises = SECTIONS_MESSAGES.filter(([, , permission]) => can(permission));
    if (!permises.length) return;
    if (!permises.some(([id]) => id === gestionMessages.onglet)) gestionMessages.onglet = permises[0][0];
    const onglets = $('#messagesOnglets');
    if (onglets) {
      onglets.hidden = permises.length < 2;
      onglets.innerHTML = boutonsOnglets('data-messages-onglet', permises.map(([id, libelle, , icone]) => [id, libelle, icone, null]), gestionMessages.onglet);
      $$('[data-messages-onglet]', onglets).forEach(bouton => bouton.addEventListener('click', () => { gestionMessages.onglet = bouton.dataset.messagesOnglet; ouvrirSectionMessages(); }));
    }
    $$('[data-messages-section]').forEach(section => { section.hidden = section.dataset.messagesSection !== gestionMessages.onglet; });
    $$('#messagesSousMenu [data-messages-aller]').forEach(bouton => {
      const actif = bouton.dataset.messagesAller === gestionMessages.onglet;
      bouton.classList.toggle('active', actif);
      if (actif) bouton.setAttribute('aria-current', 'page'); else bouton.removeAttribute('aria-current');
    });
    if (gestionMessages.onglet === 'whatsapp') chargerMessages(); else chargerNotifications();
  }

  // Ces vues vivent toutes sur la même réponse : un seul appel les sert.
  // « utilisateurs » a son propre menu dans la barre latérale (20/09/2026) ;
  // les deux autres sont des sections de Communication.
  const VUES_NOTIFICATIONS = { proprietaires: ['#proprietairesVue', () => renderProprietaires()], utilisateurs: ['#utilisateursVue', () => renderUtilisateursApp()], notifications: ['#notifVue', () => renderNotifications()] };

  /** `cible` : vue à dessiner ; sans elle, la section ouverte de Communication. */
  function chargerNotifications(cible) {
    // Section lue à l'arrivée de la réponse : on peut en changer pendant le chargement.
    const vue = () => VUES_NOTIFICATIONS[cible || gestionMessages.onglet] || VUES_NOTIFICATIONS.notifications;
    const requete = gestionMessages.chargement || api('/api/admin/notifications')
      .then(data => { gestionMessages.donnees = data; })
      .finally(() => { gestionMessages.chargement = null; });
    gestionMessages.chargement = requete;
    // Chaque appelant dessine SA vue : deux menus peuvent attendre la même réponse.
    return requete.then(() => vue()[1]()).catch(error => {
      const hote = $(vue()[0]);
      if (hote) hote.innerHTML = `<div class="empty">Indisponible : ${esc(error.message)}</div>`;
    });
  }

  /**
   * Notifications de l'app : envoi à une audience (tous, demandeurs, employés,
   * propriétaires), aperçu du nombre de téléphones et d'e-mails, historique.
   */
  function renderNotifications() {
    const d = gestionMessages.donnees;
    const hote = $('#notifVue');
    if (!d || !hote) return;
    const nombre = cible => d.audiences?.[cible]?.telephones ?? 0;
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    /*
     * Composition d'une notification (refonte du 20/09/2026, modèle fourni par
     * le propriétaire) : une carte unique qui se lit de haut en bas — à qui,
     * quoi, où cela ouvre, combien de téléphones, puis le bouton. Les compteurs
     * de caractères et l'effectif joignable sont affichés en continu, et ce qui
     * empêche l'envoi est écrit sous le bouton plutôt qu'en fenêtre d'alerte.
     */
    const AUDIENCES = [['tous', 'Tous les utilisateurs de l’app', 'Toute personne qui a installé l’application.'],
      ['demandeurs', 'Les demandeurs', 'Les clients qui ont envoyé une demande depuis le site ou l’app.'],
      ['employes', 'Les employés', 'Les salaires enregistrés en comptabilité, joints par leur numéro.'],
      ['proprietaires', 'Les propriétaires', 'Les propriétaires des biens, d’après les fiches des annonces.']];
    const ECRANS_APP = [['messages', 'Aucun — ouvrir l’application'], ['explorer', 'Explorer les annonces'], ['devis', 'Demander un devis'], ['profil', 'Mon profil']];
    hote.innerHTML = `
      <div class="notif-grille">
        <form class="notif-carte" id="notifForm" novalidate>
          <div class="notif-carte-tete">
            <span class="notif-carte-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9.2a6 6 0 1 0-12 0c0 4.8-2 6.3-2 6.3h16s-2-1.5-2-6.3z"/><path d="M10.3 18.8a2 2 0 0 0 3.4 0"/></svg></span>
            <div><small>NOUVEL ENVOI</small><strong>Composer une notification</strong></div>
          </div>
          <label class="notif-champ">Audience <abbr title="obligatoire">*</abbr>
            <select name="cible">${AUDIENCES.map(([id, libelle]) => `<option value="${id}">${libelle}</option>`).join('')}</select>
            <small data-notif-aide-audience></small>
          </label>
          <div class="notif-precision" data-notif-personnes hidden>
            <label class="notif-champ">Une personne précise
              <select name="personneId"><option value="">— toute l'audience —</option></select>
            </label>
          </div>
          <div class="notif-precision" data-notif-proprietaires hidden>
            <label class="notif-champ">Annonces concernées
              <select name="type"><option value="tous">Tous les propriétaires</option>${Object.entries(TYPES_ANNONCE_PROPRIETAIRE).map(([id, libelle]) => `<option value="${id}">Propriétaires des ${libelle.toLowerCase()}</option>`).join('')}</select>
            </label>
            <label class="notif-champ">Un propriétaire précis
              <select name="proprietaireId"><option value="">— toute l’audience —</option>${d.proprietaires.filter(p => p.actif).map(p => `<option value="${esc(p.id)}">${esc(nomComplet(p) || p.telephone || p.whatsapp)} · ${p.annonces.length} bien${p.annonces.length > 1 ? 's' : ''}</option>`).join('')}</select>
            </label>
          </div>
          <label class="notif-champ">Titre <abbr title="obligatoire">*</abbr><span class="notif-compte" data-compte-titre>0/80</span>
            <input name="titre" maxlength="80" required placeholder="Ex. : Nouvelle villa disponible à Assinie">
          </label>
          <label class="notif-champ">Message <abbr title="obligatoire">*</abbr><span class="notif-compte" data-compte-corps>0/500</span>
            <textarea name="corps" rows="5" maxlength="500" required placeholder="Rédigez le message tel qu’il apparaîtra sur le téléphone…"></textarea>
          </label>
          <label class="notif-champ">Écran ouvert au clic
            <select name="ecran">${ECRANS_APP.map(([id, libelle]) => `<option value="${id}">${libelle}</option>`).join('')}</select>
          </label>
          <label class="notif-email" data-notif-email hidden><input type="checkbox" name="email" checked> <span>Envoyer aussi par e-mail aux contacts qui ont une adresse <small data-notif-email-note></small></span></label>
          <p class="notif-effectif" data-notif-apercu aria-live="polite">Sélectionnez une audience pour connaître son effectif.</p>
          <button class="primary notif-envoyer" type="submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/></svg>
            Diffuser la notification
          </button>
          <p class="notif-erreur" data-notif-erreur role="alert"></p>
        </form>
        <div class="notif-carte notif-historique">
          <div class="notif-carte-tete">
            <span class="notif-carte-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.5V12l3 1.8"/><circle cx="12" cy="12" r="8.2"/></svg></span>
            <div><small>HISTORIQUE</small><strong>Notifications envoyées</strong></div>
          </div>
          <p class="notif-parc"><strong>${d.abonnes.push}</strong> appareil${d.abonnes.push > 1 ? 's' : ''} joignable${d.abonnes.push > 1 ? 's' : ''} sur <strong>${d.abonnes.total}</strong> téléphone${d.abonnes.total > 1 ? 's' : ''} inscrit${d.abonnes.total > 1 ? 's' : ''}${d.abonnes.identifies ? ` · ${d.abonnes.identifies} identifié${d.abonnes.identifies > 1 ? 's' : ''} par leur numéro` : ''}.</p>
          ${d.abonnes.push ? '' : '<p class="notif-aide">Aucun appareil ne peut recevoir de notification instantanée : l’application n’est pas encore reliée au service d’envoi (identifiant de projet Expo absent, voir mobile/natif/PUSH.md). En attendant, vos messages restent lisibles dans l’application, à son ouverture.</p>'}
          ${d.messages.length ? d.messages.map(m => `<article class="notif-envoi" data-notif-id="${esc(m.id)}"><header><strong>${esc(m.titre)}</strong><time>${esc(dateHeureCourte(m.creeLe))}</time></header><p>${esc(m.corps)}</p><footer>${esc(m.audience)} · ${pluriel(m.bilan?.telephones ?? 0, 'téléphone')}${m.bilan?.push ? ` · ${m.bilan.push} push` : ''}${m.bilan?.pushRefuses ? ` · ${m.bilan.pushRefuses} refusé${m.bilan.pushRefuses > 1 ? 's' : ''} par le service${m.bilan.pushMotif ? ` (${esc(m.bilan.pushMotif)})` : ''}` : ''}${m.bilan?.emails ? ` · ${m.bilan.emailsEnvoyes || 0} / ${pluriel(m.bilan.emails, 'e-mail')}` : ''}${m.creePar ? ` · par ${esc(m.creePar)}` : ''}</footer><div class="notif-envoi-actions"><button type="button" class="notif-renvoyer" data-notif-renvoyer>Renvoyer</button><button type="button" class="notif-supprimer" data-notif-supprimer>Supprimer</button></div></article>`).join('') : '<div class="empty">Aucune notification envoyée.</div>'}
        </div>
      </div>`;

    const form = $('#notifForm', hote);
    const audience = () => ({ cible: form.elements.cible.value, type: form.elements.type.value,
      proprietaireId: form.elements.proprietaireId.value, personneId: form.elements.personneId.value });
    const erreurFormulaire = () => {
      if (form.elements.titre.value.trim().length < 3) return 'Le titre doit contenir au moins 3 caractères.';
      if (!form.elements.corps.value.trim()) return 'Écrivez le message qui s’affichera sur le téléphone.';
      return '';
    };
    let minuterie = null;
    const majApercu = () => {
      const a = audience();
      $('[data-notif-proprietaires]', form).hidden = a.cible !== 'proprietaires';
      // Demandeurs et employés : même choix d'une personne que pour un
      // propriétaire (20/09/2026). La liste change avec l'audience.
      const blocPersonnes = $('[data-notif-personnes]', form);
      blocPersonnes.hidden = a.cible !== 'demandeurs' && a.cible !== 'employes';
      if (!blocPersonnes.hidden && blocPersonnes.dataset.pour !== a.cible) {
        blocPersonnes.dataset.pour = a.cible;
        const gens = a.cible === 'demandeurs' ? (d.demandeurs || []) : (d.employes || []);
        const choisi = form.elements.personneId.value;
        form.elements.personneId.innerHTML = `<option value="">— toute l'audience —</option>`
          + gens.map(g => `<option value="${esc(g.id)}">${esc(g.nom)}${g.telephone ? ` · ${esc(g.telephone)}` : ''}</option>`).join('');
        if (gens.some(g => g.id === choisi)) form.elements.personneId.value = choisi;
      }
      $('[data-notif-email]', form).hidden = a.cible === 'tous';
      $('[data-notif-email-note]', form).textContent = a.cible === 'demandeurs' ? '(seulement ceux qui ont accepté de recevoir nos offres)' : '';
      $('[data-notif-aide-audience]', form).textContent = (AUDIENCES.find(([id]) => id === a.cible) || [])[2] || '';
      $('[data-compte-titre]', form).textContent = `${form.elements.titre.value.length}/80`;
      $('[data-compte-corps]', form).textContent = `${form.elements.corps.value.length}/500`;
      const probleme = erreurFormulaire();
      $('[data-notif-erreur]', form).textContent = form.dataset.touche ? probleme : '';
      clearTimeout(minuterie);
      minuterie = setTimeout(async () => {
        try {
          const r = await api('/api/admin/notifications/apercu', { method: 'POST', body: JSON.stringify({ titre: 'aperçu', corps: 'aperçu', audience: a }) });
          const email = a.cible !== 'tous' && form.elements.email.checked ? `, et par e-mail à ${pluriel(r.emails, 'contact')}` : '';
          // Dire aussi qui ne recevra rien : un compte sans appareil joignable
          // n'est pas une erreur, mais il ne faut pas le croire prévenu.
          const muets = Math.max(0, (a.cible === 'tous' ? r.telephones : r.personnes) - r.push);
          const joignables = `${pluriel(r.push, 'appareil')} joignable${r.push > 1 ? 's' : ''} sur ${pluriel(a.cible === 'tous' ? r.telephones : r.personnes, a.cible === 'tous' ? 'téléphone' : 'personne')} dans cette audience${email}.`;
          $('[data-notif-apercu]', form).textContent = muets
            ? `${joignables} Les ${muets} autre${muets > 1 ? 's' : ''} n’${muets > 1 ? 'ont' : 'a'} pas encore ouvert l’application sur son téléphone : rien ne lui sera envoyé en direct.`
            : joignables;
        } catch { /* aperçu indicatif */ }
      }, 250);
    };
    form.addEventListener('input', majApercu);
    form.addEventListener('change', majApercu);
    majApercu();

    // Arrivée depuis la fiche d'une annonce : l'audience et le propriétaire
    // sont déjà choisis, il ne reste qu'à écrire le message.
    const pre = gestionMessages.preselection;
    if (pre) {
      gestionMessages.preselection = null;
      form.elements.cible.value = pre.cible || 'tous';
      if (pre.telephone) {
        const fin = String(pre.telephone).replace(/\D/g, '').slice(-8);
        const trouve = fin && d.proprietaires.find(p => [p.telephone, p.whatsapp].some(n => String(n || '').replace(/\D/g, '').endsWith(fin)));
        if (trouve) form.elements.proprietaireId.value = trouve.id;
      }
      majApercu();
      form.elements.titre.focus();
    }
    /*
     * Historique (20/09/2026) : « Renvoyer » recompose l'envoi dans le
     * formulaire — audience, personne visée, titre, message, écran — sans
     * rien expédier : le propriétaire relit, corrige et diffuse lui-même.
     * « Supprimer » retire l'envoi de l'historique et de la base.
     */
    // L'écoute est posée sur l'historique lui-même : il est redessiné à
    // chaque chargement, l'ancienne part avec lui.
    $('.notif-historique', hote).addEventListener('click', async event => {
      const carte = event.target.closest('.notif-envoi');
      if (!carte) return;
      const envoi = d.messages.find(m => m.id === carte.dataset.notifId);
      if (!envoi) return;
      if (event.target.closest('[data-notif-renvoyer]')) {
        const a = envoi.reprise?.audience || {};
        form.elements.cible.value = AUDIENCES.some(([id]) => id === a.cible) ? a.cible : 'tous';
        form.elements.type.value = a.type || 'tous';
        form.elements.proprietaireId.value = a.proprietaireId || '';
        form.elements.titre.value = envoi.titre || '';
        form.elements.corps.value = envoi.corps || '';
        form.elements.ecran.value = ECRANS_APP.some(([id]) => id === envoi.reprise?.ecran) ? envoi.reprise.ecran : 'messages';
        // La liste des personnes est redessinée par l'aperçu : la personne
        // visée se repose ensuite, une fois ses options présentes.
        majApercu();
        if (a.personneId) { form.elements.personneId.value = a.personneId; majApercu(); }
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        form.elements.titre.focus();
        toast('Notification reprise : relisez-la, puis diffusez-la.');
        return;
      }
      if (event.target.closest('[data-notif-supprimer]')) {
        if (!confirm(`Supprimer « ${envoi.titre} » de l'historique ?
Les téléphones qui l'ont déjà reçue la gardent.`)) return;
        try {
          await api(`/api/admin/notifications/messages/${encodeURIComponent(envoi.id)}`, { method: 'DELETE' });
          toast('Notification supprimée.');
          await chargerNotifications();
        } catch (error) { toast(error.message); }
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      // Ce qui manque s'écrit sous le bouton, où le regard vient de passer.
      form.dataset.touche = '1';
      const probleme = erreurFormulaire();
      $('[data-notif-erreur]', form).textContent = probleme;
      if (probleme) { (probleme.includes('titre') ? form.elements.titre : form.elements.corps).focus(); return; }
      const a = audience();
      const corps = { titre: form.elements.titre.value, corps: form.elements.corps.value, ecran: form.elements.ecran.value, audience: a, email: a.cible !== 'tous' && form.elements.email.checked };
      if (!confirm(`Envoyer « ${corps.titre} » ?\n${$('[data-notif-apercu]', form).textContent}`)) return;
      const bouton = $('button[type="submit"]', form);
      bouton.disabled = true;
      try {
        const r = await api('/api/admin/notifications', { method: 'POST', body: JSON.stringify(corps) });
        toast(`Notification envoyée : ${pluriel(r.message.bilan.telephones, 'téléphone')}${r.message.bilan.emails ? `, ${pluriel(r.message.bilan.emailsEnvoyes, 'e-mail')}` : ''}`);
        await chargerNotifications();
      } catch (error) { toast(error.message); bouton.disabled = false; }
    });
  }

  /**
   * Utilisateurs de l'application (20/09/2026). L'app envoie le profil dès
   * qu'un numéro est renseigné — les notifications sont facultatives : une
   * personne peut s'enregistrer seulement pour être rappelée avec un devis.
   * Le jeton d'envoi reste côté serveur : la liste dit seulement si le
   * téléphone est joignable par notification instantanée.
   */
  function renderUtilisateursApp() {
    const d = gestionMessages.donnees;
    const hote = $('#utilisateursVue');
    if (!d || !hote) return;
    const liste = d.utilisateurs || [];
    const ROLES = { demandeur: 'Demandeur', employe: 'Employé', proprietaire: 'Propriétaire' };
    const PLATEFORMES = { ios: 'iPhone', android: 'Android', web: 'Navigateur' };
    const avecNotifs = liste.filter(u => u.notifications).length;
    const joignables = liste.filter(u => u.joignable).length;

    const ligne = u => {
      const wa = lienWhatsApp(u.telephone);
      const meta = [PLATEFORMES[u.plateforme] || '', u.langue ? u.langue.toUpperCase() : '',
        u.inscritLe ? `inscrit le ${dateHeureCourte(u.inscritLe)}` : '', u.vuLe ? `vu le ${dateHeureCourte(u.vuLe)}` : ''].filter(Boolean).join(' · ');
      return `<div class="compta-ligne app-user">
        <span class="compta-avatar" aria-hidden="true">${esc((u.nom || u.telephone || '?').trim().slice(0, 1).toUpperCase())}</span>
        <div class="compta-ligne-texte">
          <strong>${esc(u.nom || 'Sans nom')}${u.role ? ` <span class="app-user-role">${esc(ROLES[u.role])}</span>` : ''}</strong>
          <small>${esc([u.telephone, u.email].filter(Boolean).join(' · ') || 'Aucune coordonnée renseignée')}</small>
          <small class="app-user-meta">${esc(meta)}</small>
        </div>
        <div class="app-user-etat">
          <span class="app-user-badge${u.notifications ? ' oui' : ''}">${u.notifications ? 'Notifications activées' : 'Sans notifications'}</span>
          ${u.joignable ? '<span class="app-user-badge oui">Joignable en direct</span>' : ''}
        </div>
        <div class="app-user-actions">
          ${u.telephone ? `<a class="app-user-lien" href="tel:${esc(u.telephone)}">Appeler</a>` : ''}
          ${wa ? `<a class="app-user-lien" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${u.email ? `<a class="app-user-lien" href="mailto:${esc(u.email)}">E-mail</a>` : ''}
          <button type="button" class="app-user-lien app-user-retrait" data-user-retirer="${esc(u.visiteur)}">Retirer</button>
        </div>
      </div>`;
    };

    hote.innerHTML = `<div class="compta-section-tete"><h3>Utilisateurs de l’application</h3></div>
      <p class="compta-aide">Les personnes qui ont renseigné leur profil dans l’application, pour être rappelées ou recevoir un devis. Les notifications sont facultatives : celles qui les ont activées apparaissent aussi dans les audiences de « Notifications de l’app ». Retirer un utilisateur efface son profil de nos serveurs ; son application le recréera s’il le renseigne à nouveau.</p>
      <div class="wa-kpis">
        <div><strong>${liste.length}</strong><small>profil${liste.length > 1 ? 's' : ''} enregistré${liste.length > 1 ? 's' : ''}</small></div>
        <div><strong>${avecNotifs}</strong><small>avec notifications</small></div>
        <div><strong>${joignables}</strong><small>joignable${joignables > 1 ? 's' : ''} en direct</small></div>
      </div>
      <input class="app-user-recherche" type="search" aria-label="Rechercher un utilisateur" placeholder="Rechercher un nom, un numéro, un e-mail…" data-users-recherche>
      <div class="content-table" data-users-liste>${liste.length ? liste.map(ligne).join('')
    : '<div class="empty">Aucun profil enregistré depuis l’application pour le moment.</div>'}</div>`;

    const conteneur = $('[data-users-liste]', hote);
    const champ = $('[data-users-recherche]', hote);
    champ.addEventListener('input', () => {
      const q = champ.value.trim().toLowerCase();
      const vus = q ? liste.filter(u => `${u.nom} ${u.telephone} ${u.email}`.toLowerCase().includes(q)) : liste;
      conteneur.innerHTML = vus.length ? vus.map(ligne).join('') : '<div class="empty">Aucun utilisateur ne correspond.</div>';
    });
    conteneur.addEventListener('click', async event => {
      const bouton = event.target.closest('[data-user-retirer]');
      if (!bouton) return;
      const u = liste.find(x => x.visiteur === bouton.dataset.userRetirer);
      if (!confirm(`Retirer ${u && u.nom ? u.nom : 'cet utilisateur'} de la liste ?`)) return;
      bouton.disabled = true;
      try {
        await api(`/api/admin/notifications/abonnes/${encodeURIComponent(bouton.dataset.userRetirer)}`, { method: 'DELETE' });
        toast('Utilisateur retiré.');
        await chargerNotifications('utilisateurs');
      } catch (error) { toast(error.message); bouton.disabled = false; }
    });
  }

  /**
   * Propriétaires des biens (19/09/2026) : vue récapitulative. Ils se
   * saisissent dans la fiche de chaque annonce (Villas, Voitures, Activités,
   * Terrains) ; cette vue les regroupe par numéro, avec leurs biens, et
   * signale les annonces dont le propriétaire manque.
   */
  function renderProprietaires() {
    const d = gestionMessages.donnees;
    const hote = $('#proprietairesVue');
    if (!d || !hote) return;
    const lienAnnonce = a => `<button type="button" class="lien-annonce" data-ouvrir-annonce="${esc(a.kind)}|${esc(a.id)}">${esc(a.titre || a.id)}</button>`;
    const sans = d.annoncesSansProprietaire || [];
    hote.innerHTML = `<div class="compta-section-tete"><h3>Propriétaires des biens</h3></div>
      <p class="compta-aide">Le propriétaire se renseigne dans la fiche de chaque annonce (Villas, Voitures, Activités, Terrains), puis « Publier les changements ». Ses coordonnées restent dans le studio : elles ne sont jamais montrées sur le site ni dans l’application. Depuis « Notifications de l’app », vous pouvez écrire aux propriétaires qui utilisent l’app avec le même numéro.</p>
      <div class="content-table">${d.proprietaires.length ? d.proprietaires.map(p => {
        const contacts = [p.telephone, p.whatsapp && p.whatsapp !== p.telephone ? `WhatsApp ${p.whatsapp}` : ''].filter(Boolean).join(' · ');
        return `<div class="compta-ligne proprietaire-ligne"><span class="compta-avatar" aria-hidden="true">${esc((p.prenom || p.nom || '?').slice(0, 1).toUpperCase())}</span><div class="compta-ligne-texte"><strong>${esc(nomComplet(p) || 'Sans nom')}</strong><small>${esc(contacts || 'Aucun numéro renseigné')}</small><span class="proprietaire-biens-liste">${p.annonces.map(a => `<span class="proprietaire-bien"><em>${esc(TYPES_ANNONCE_PROPRIETAIRE[a.kind] || a.kind)}</em> ${lienAnnonce(a)}</span>`).join('')}</span></div></div>`;
      }).join('') : '<div class="empty">Aucun propriétaire renseigné dans les fiches d’annonces.</div>'}</div>
      ${sans.length ? `<details class="proprietaire-manquants"><summary>${sans.length} annonce${sans.length > 1 ? 's' : ''} sans propriétaire renseigné</summary><div>${sans.map(a => `<span class="proprietaire-bien"><em>${esc(TYPES_ANNONCE_PROPRIETAIRE[a.kind] || a.kind)}</em> ${lienAnnonce(a)}</span>`).join('')}</div></details>` : ''}`;
    // Un bien s'ouvre dans sa fiche, où se modifie son propriétaire.
    $$('[data-ouvrir-annonce]', hote).forEach(bouton => bouton.addEventListener('click', () => {
      const [kind, ...reste] = bouton.dataset.ouvrirAnnonce.split('|');
      openEditor(kind, reste.join('|'));
    }));
  }

  function chargerMessages() {
    if (!$('#waIntro')) return Promise.resolve();
    chargementMessages = chargementMessages || api('/api/admin/whatsapp')
      .then(data => { state.whatsapp = data; renderMessages(); })
      .catch(error => { $('#waIntro').innerHTML = `<p class="wa-erreur">Messages indisponibles : ${esc(error.message)}</p>`; })
      .finally(() => { chargementMessages = null; });
    return chargementMessages;
  }

  function appliquerEtatMessages(data) { state.whatsapp = data; renderMessages(); }

  function renderMessages() {
    const wa = state.whatsapp;
    if (!wa) return;
    const contacts = wa.contacts || [];
    const eligibles = contacts.filter(contact => contact.eligible);
    const stops = contacts.filter(contact => contact.stop);
    const sansAccord = contacts.filter(contact => !contact.stop && contact.accord !== true);
    const ecrire = can('leads:write');
    $('#waIntro').innerHTML = `<div class="wa-kpis">
        <div><strong>${eligibles.length}</strong><small>avec accord</small></div>
        <div><strong>${sansAccord.length}</strong><small>sans accord</small></div>
        <div><strong>${stops.length}</strong><small>ne plus contacter</small></div>
      </div>
      <p>Seuls les clients qui ont coché « J’accepte de recevoir vos offres par WhatsApp » dans le simulateur reçoivent vos campagnes. Pour chacun, le bouton <strong>Envoyer</strong> ouvre WhatsApp avec le message déjà personnalisé : il ne reste qu’à appuyer sur Envoyer. La mention « ${esc(wa.mentionStop)} » est ajoutée automatiquement.</p>`;

    // ---- Formulaire ----
    const form = $('#waForm');
    form.hidden = !ecrire;
    const majApercu = () => {
      const message = form.elements.message.value;
      const exemple = eligibles[0] || { nom: 'Aya Kouassi' };
      const prenom = String(exemple.nom || '').trim().split(/\s+/)[0] || '';
      // Même règle que personnaliser() (db/whatsapp-promo.js).
      const remplacer = (texte, motif, valeur) => texte.replace(motif, trouve => (valeur ? trouve.replace(/\{\w+\}/, valeur) : ''));
      const texte = remplacer(remplacer(message, /[ \t]*\{prenom\}/gi, prenom), /[ \t]*\{nom\}/gi, String(exemple.nom || '').trim()).trim();
      $('#waApercuNom').textContent = exemple.nom || 'un client';
      $('#waApercu').textContent = texte ? `${texte}\n\n${wa.mentionStop}` : 'Le message apparaîtra ici.';
      $('#waCompteur').textContent = `${message.length} / ${wa.messageMax || 1500}`;
    };
    if (!form.dataset.branche) {
      form.dataset.branche = '1';
      form.elements.message.maxLength = wa.messageMax || 1500;
      form.elements.message.addEventListener('input', majApercu);
      $$('[data-inserer]', form).forEach(bouton => bouton.addEventListener('click', () => {
        const zone = form.elements.message;
        const debut = zone.selectionStart ?? zone.value.length;
        zone.setRangeText(bouton.dataset.inserer, debut, zone.selectionEnd ?? debut, 'end');
        zone.focus(); majApercu();
      }));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const bouton = $('#waCreer');
        bouton.disabled = true;
        try {
          const destinataires = [...(state.waSelection || [])];
          if (!destinataires.length) throw new Error('Sélectionnez au moins un destinataire.');
          const data = await api('/api/admin/whatsapp/campagnes', { method:'POST', body:JSON.stringify({ titre: form.elements.titre.value, message: form.elements.message.value, destinataires }) });
          form.reset();
          state.waSelection = null; // prochaine campagne : de nouveau tous cochés
          appliquerEtatMessages(data);
          toast('Campagne prête : envoyez les messages un par un');
          if (data.campagnes?.[0]) ouvrirCampagne(data.campagnes[0].id);
        } catch (error) { toast(error.message); }
        finally { majSelection(); }
      });
      // Sélection des destinataires : case par client, « Tous », recherche.
      $('#waSelListe').addEventListener('change', event => {
        const caseClient = event.target.closest('input[data-cle]');
        if (!caseClient) return;
        if (caseClient.checked) state.waSelection.add(caseClient.dataset.cle);
        else state.waSelection.delete(caseClient.dataset.cle);
        majSelection();
      });
      $('#waTous').addEventListener('change', event => {
        // « Tous » agit sur les clients affichés (recherche comprise).
        $$('#waSelListe input[data-cle]').forEach(caseClient => {
          if (caseClient.closest('.wa-sel').hidden) return;
          caseClient.checked = event.target.checked;
          if (event.target.checked) state.waSelection.add(caseClient.dataset.cle);
          else state.waSelection.delete(caseClient.dataset.cle);
        });
        majSelection();
      });
      $('#waSelRecherche').addEventListener('input', event => {
        const requete = event.target.value.trim().toLocaleLowerCase('fr');
        $$('#waSelListe .wa-sel').forEach(ligne => { ligne.hidden = Boolean(requete) && !ligne.dataset.recherche.includes(requete); });
        majSelection();
      });
    }
    majApercu();

    // Première ouverture : tous les clients avec accord sont cochés ; ensuite
    // la sélection est conservée, sans les clients qui n'y ont plus droit.
    const clesEligibles = new Set(eligibles.map(contact => contact.cle));
    if (!(state.waSelection instanceof Set)) state.waSelection = new Set(clesEligibles);
    state.waSelection.forEach(cle => { if (!clesEligibles.has(cle)) state.waSelection.delete(cle); });
    const recherche = $('#waSelRecherche').value.trim().toLocaleLowerCase('fr');
    $('#waSelection').hidden = !eligibles.length;
    $('#waSelRecherche').hidden = eligibles.length < 6;
    $('#waSelListe').innerHTML = eligibles.map(contact => {
      const cherchable = `${contact.nom} ${contact.telephone}`.toLocaleLowerCase('fr');
      return `<label class="wa-sel" data-recherche="${esc(cherchable)}"${recherche && !cherchable.includes(recherche) ? ' hidden' : ''}>
        <input type="checkbox" data-cle="${esc(contact.cle)}" ${state.waSelection.has(contact.cle) ? 'checked' : ''}>
        <span><strong>${esc(contact.nom || 'Nom non renseigné')}</strong><small>${esc(contact.telephone)} · dernière demande le ${formatDate(contact.derniereDemande)}</small></span>
      </label>`;
    }).join('');
    if (!eligibles.length) {
      // Hors du fieldset masqué : le message reste visible.
      $('#waSelection').insertAdjacentElement('afterend', $('#waDestinataires'));
    } else if ($('#waDestinataires').parentElement !== $('#waSelection')) {
      $('#waSelection').appendChild($('#waDestinataires'));
    }
    majSelection();

    // ---- Campagnes ----
    const campagnes = wa.campagnes || [];
    $('#waCampagnes').innerHTML = campagnes.length ? campagnes.map(campagne => {
      const { total, envoyes, ignores, restants } = campagne.compteurs;
      const pourcent = total ? Math.round(((envoyes + ignores) / total) * 100) : 0;
      return `<button type="button" class="wa-campagne" data-campagne="${esc(campagne.id)}">
        <span class="wa-campagne-titre"><strong>${esc(campagne.titre)}</strong><small>${formatDate(campagne.creeeLe)}</small></span>
        <span class="wa-progression" aria-hidden="true"><span style="width:${pourcent}%"></span></span>
        <small>${envoyes} envoyé${envoyes > 1 ? 's' : ''} · ${restants} restant${restants > 1 ? 's' : ''} sur ${total}</small>
      </button>`;
    }).join('') : '<p class="wa-vide">Aucune campagne pour l’instant.</p>';
    $$('[data-campagne]', $('#waCampagnes')).forEach(bouton => bouton.addEventListener('click', () => ouvrirCampagne(bouton.dataset.campagne)));

    // ---- Contacts ----
    const filtre = state.waFiltre || 'tous';
    $$('#waFiltres [data-filtre]').forEach(bouton => {
      bouton.classList.toggle('active', bouton.dataset.filtre === filtre);
      if (!bouton.dataset.branche) {
        bouton.dataset.branche = '1';
        bouton.addEventListener('click', () => { state.waFiltre = bouton.dataset.filtre; renderMessages(); });
      }
    });
    const visibles = contacts.filter(contact => filtre === 'accord' ? contact.eligible
      : filtre === 'sans' ? (!contact.stop && contact.accord !== true)
      : filtre === 'stop' ? contact.stop : true);
    const pastille = contact => contact.stop ? '<span class="wa-pastille stop">Ne plus contacter</span>'
      : contact.accord === true ? `<span class="wa-pastille oui">Accord ${contact.accordLe ? `du ${formatDate(contact.accordLe)}` : 'donné'}</span>`
      : contact.accord === false ? '<span class="wa-pastille non">Accord refusé</span>'
      : '<span class="wa-pastille inconnu">Accord non recueilli</span>';
    $('#waContacts').innerHTML = visibles.length ? visibles.map(contact => `<div class="wa-contact">
        <div class="wa-contact-id"><strong>${esc(contact.nom || 'Nom non renseigné')}</strong><small>${esc(contact.telephone)} · ${contact.demandes} demande${contact.demandes > 1 ? 's' : ''} · dernière le ${formatDate(contact.derniereDemande)}</small></div>
        ${pastille(contact)}
        ${ecrire ? `<button type="button" class="wa-lien-discret" data-stop="${esc(contact.cle)}" data-valeur="${contact.stop ? 'non' : 'oui'}">${contact.stop ? 'Réactiver' : 'Ne plus contacter'}</button>` : ''}
      </div>`).join('') : '<p class="wa-vide">Aucun contact dans cette liste.</p>';
    $$('[data-stop]', $('#waContacts')).forEach(bouton => bouton.addEventListener('click', () => basculerStop(bouton.dataset.stop, bouton.dataset.valeur === 'oui')));
  }

  /** Compteur, état de « Tous » et bouton de création selon la sélection. */
  function majSelection() {
    const eligibles = (state.whatsapp?.contacts || []).filter(contact => contact.eligible);
    const selection = state.waSelection instanceof Set ? state.waSelection : new Set();
    const nombre = eligibles.filter(contact => selection.has(contact.cle)).length;
    const visibles = $$('#waSelListe .wa-sel').filter(ligne => !ligne.hidden).map(ligne => $('input', ligne));
    const tous = $('#waTous');
    if (tous) {
      tous.checked = visibles.length > 0 && visibles.every(caseClient => caseClient.checked);
      tous.indeterminate = !tous.checked && visibles.some(caseClient => caseClient.checked);
      $('.wa-tous span').textContent = `Tous (${eligibles.length})`;
    }
    $('#waDestinataires').innerHTML = !eligibles.length
      ? 'Aucun client n’a encore donné son accord. La case est proposée dans le simulateur de devis depuis le 13 septembre 2026.'
      : `<strong>${nombre} destinataire${nombre > 1 ? 's' : ''}</strong> sélectionné${nombre > 1 ? 's' : ''} sur ${eligibles.length} client${eligibles.length > 1 ? 's' : ''} ayant donné leur accord. Les clients sans accord n’apparaissent pas ici.`;
    const bouton = $('#waCreer');
    bouton.disabled = !nombre;
    bouton.textContent = nombre ? `Préparer la campagne (${nombre})` : 'Préparer la campagne';
  }

  async function basculerStop(cle, stop) {
    if (stop && !confirm('Ce client ne recevra plus aucune campagne WhatsApp. Continuer ?')) return;
    try {
      appliquerEtatMessages(await api('/api/admin/whatsapp/stop', { method:'POST', body:JSON.stringify({ cle, stop }) }));
      toast(stop ? 'Client retiré des campagnes' : 'Client de nouveau joignable');
      const ouverte = $('.wa-campagne-backdrop');
      if (ouverte) ouvrirCampagne(ouverte.dataset.campagne);
    } catch (error) { toast(error.message); }
  }

  /** Fiche d'une campagne : un lien WhatsApp par destinataire, suivi de l'envoi. */
  function ouvrirCampagne(id) {
    const campagne = (state.whatsapp?.campagnes || []).find(entree => entree.id === id);
    if (!campagne) return;
    const ecrire = can('leads:write');
    const existante = $('.wa-campagne-backdrop');
    const defilement = existante ? $('.editor-fields', existante)?.scrollTop : 0;
    existante?.remove();
    const { total, envoyes, restants } = campagne.compteurs;
    const libelle = { 'a-envoyer': 'À envoyer', envoye: 'Envoyé', ignore: 'Ignoré' };
    const lignes = campagne.destinataires.map(entree => `<div class="wa-dest wa-dest-${entree.statut}${entree.stop ? ' est-stop' : ''}">
        <div class="wa-contact-id"><strong>${esc(entree.nom || 'Nom non renseigné')}</strong><small>${esc(entree.telephone)}${entree.le ? ` · ${libelle[entree.statut].toLowerCase()} le ${formatDate(entree.le)}` : ''}</small></div>
        ${entree.stop ? '<span class="wa-pastille stop">Ne plus contacter</span>'
          : !ecrire ? `<span class="wa-pastille">${libelle[entree.statut]}</span>`
          : entree.statut === 'a-envoyer'
            ? `<div class="wa-dest-actions"><a class="wa-envoyer" href="${esc(entree.lien)}" target="_blank" rel="noopener" data-envoyer="${esc(entree.cle)}">Envoyer ▸</a><button type="button" class="wa-lien-discret" data-marquer="${esc(entree.cle)}" data-statut="ignore">Ignorer</button></div>`
            : `<div class="wa-dest-actions"><span class="wa-pastille ${entree.statut === 'envoye' ? 'oui' : 'inconnu'}">${libelle[entree.statut]}</span><button type="button" class="wa-lien-discret" data-marquer="${esc(entree.cle)}" data-statut="a-envoyer">Annuler</button></div>`}
      </div>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop wa-campagne-backdrop" data-campagne="${esc(campagne.id)}"><div class="editor-drawer wa-campagne-fiche" role="dialog" aria-modal="true" aria-label="Campagne ${esc(campagne.titre)}">
      <div class="editor-head"><div><span class="eyebrow">CAMPAGNE WHATSAPP · ${formatDate(campagne.creeeLe).toUpperCase()}</span><h2>${esc(campagne.titre)}</h2><small class="lead-recue">${envoyes} envoyé${envoyes > 1 ? 's' : ''} sur ${total} · ${restants} restant${restants > 1 ? 's' : ''}</small></div><button type="button" data-close-editor aria-label="Fermer">×</button></div>
      <div class="editor-fields">
        <section class="lead-bloc"><h3>Message</h3><p class="lead-message wa-message">${esc(campagne.message).replace(/\n/g, '<br>')}<br><br><em>${esc(state.whatsapp.mentionStop)}</em></p></section>
        <section class="lead-bloc"><h3>Destinataires</h3>${ecrire ? '<p class="wa-aide">« Envoyer » ouvre WhatsApp avec le message personnalisé et marque le client comme envoyé. Revenez ensuite ici pour le suivant.</p>' : ''}<div class="wa-dests">${lignes}</div></section>
        ${ecrire ? '<section class="lead-bloc"><button type="button" class="wa-supprimer" data-supprimer>Supprimer la campagne</button></section>' : ''}
      </div>
      <div class="editor-actions"><button type="button" data-close-editor>Fermer</button></div>
    </div></div>`);
    const fond = $('.wa-campagne-backdrop');
    const champs = $('.editor-fields', fond);
    if (champs && defilement) champs.scrollTop = defilement;
    const fermer = () => { document.removeEventListener('keydown', surTouche); fond.remove(); };
    const surTouche = event => { if (event.key === 'Escape') fermer(); };
    document.addEventListener('keydown', surTouche);
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    const marquer = async (cle, statut) => {
      try {
        appliquerEtatMessages(await api(`/api/admin/whatsapp/campagnes/${encodeURIComponent(campagne.id)}`, { method:'PATCH', body:JSON.stringify({ cle, statut }) }));
        document.removeEventListener('keydown', surTouche);
        ouvrirCampagne(campagne.id);
      } catch (error) { toast(error.message); }
    };
    // Le lien s'ouvre (comportement normal du navigateur) ET l'envoi est noté.
    $$('[data-envoyer]', fond).forEach(lien => lien.addEventListener('click', () => marquer(lien.dataset.envoyer, 'envoye')));
    $$('[data-marquer]', fond).forEach(bouton => bouton.addEventListener('click', () => marquer(bouton.dataset.marquer, bouton.dataset.statut)));
    $('[data-supprimer]', fond)?.addEventListener('click', async () => {
      if (!confirm(`Supprimer la campagne « ${campagne.titre} » ? Le suivi des envois sera perdu (les messages déjà envoyés restent dans WhatsApp).`)) return;
      try {
        appliquerEtatMessages(await api(`/api/admin/whatsapp/campagnes/${encodeURIComponent(campagne.id)}`, { method:'DELETE' }));
        fermer(); toast('Campagne supprimée');
      } catch (error) { toast(error.message); }
    });
    $('.editor-head [data-close-editor]', fond)?.focus();
  }

  async function refreshAdmin() {
    const button = $('#refreshAdminBtn');
    button.disabled = true; button.textContent = 'Actualisation…';
    try {
      state.dashboard = await api('/api/admin/dashboard');
      await loadAll();
      toast('Données actualisées');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = '↻ Actualiser'; }
  }

  async function downloadAdminExport(format) {
    const response = await fetch(`/api/admin/export?format=${encodeURIComponent(format)}`, { credentials:'same-origin' });
    if (!response.ok) { toast('Export impossible'); return; }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || (format === 'csv' ? 'demandes-assinie.csv' : 'sauvegarde-assinie.json');
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href:url, download:filename });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(format === 'csv' ? 'Demandes exportées' : 'Sauvegarde exportée');
  }

  async function createManualBackup() {
    const button = $('#createBackupBtn');
    button.disabled = true;
    try {
      const result = await api('/api/admin/backups', { method:'POST', body:'{}' });
      state.backups = result.backups || [];
      state.audit = (await api('/api/admin/audit')).entries || state.audit;
      renderOperations(); toast('Point de reprise créé');
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function openEditor(type, id) {
    const isVilla = type === 'villa';
    const isTerrain = type === 'terrain';
    const isVehicle = type === 'vehicle';
    const list = isVilla ? state.content.villas : isTerrain ? state.content.terrains : isVehicle ? state.content.vehicles : state.content.activities;
    const source = list.find(item => item.id === id) || {};
    const data = structuredClone(source);
    let gallery = ((isVilla || isTerrain || isVehicle)
      ? (Array.isArray(data.images) ? data.images : [])
      : (Array.isArray(data.images) && data.images.length ? data.images : [data.image])).filter(Boolean);
    const heading = isVilla ? 'Villa' : isTerrain ? 'Terrain' : isVehicle ? 'Véhicule' : 'Activité';
    const fields = isVilla ? villaFields(data) : isTerrain ? terrainFields(data) : isVehicle ? vehicleFields(data) : activityFields(data);
    // Propriétaire du bien (19/09/2026) : la plateforme est intermédiaire entre
    // le client et le propriétaire. Studio seulement : le serveur le retire de
    // tout ce que voient le site et l'application.
    const proprietaire = data.proprietaire || {};
    const blocProprietaire = `<fieldset class="editor-proprietaire"><legend>Propriétaire du bien</legend>
      <p class="compta-aide">Visible seulement dans le studio : jamais affiché sur le site ni dans l’application. Sert à le joindre et à lui envoyer des notifications (Messages → Notifications de l’app).</p>
      <div class="form-grid">
        <label>Nom<input name="proprietaireNom" maxlength="120" autocomplete="off" value="${esc(proprietaire.nom || '')}"></label>
        <label>Prénom<input name="proprietairePrenom" maxlength="80" autocomplete="off" value="${esc(proprietaire.prenom || '')}"></label>
        <label>Téléphone<input type="tel" name="proprietaireTelephone" maxlength="40" autocomplete="off" value="${esc(proprietaire.telephone || '')}"></label>
        <label>WhatsApp<input type="tel" name="proprietaireWhatsapp" maxlength="40" autocomplete="off" value="${esc(proprietaire.whatsapp || '')}"></label>
      </div></fieldset>`;
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop"><form class="editor-drawer"><div class="editor-head"><div><span class="eyebrow">${id ? 'MODIFICATION':'NOUVEAU CONTENU'}</span><h2>${heading}</h2></div><button type="button" data-close-editor>×</button></div>${id && list.some(item => item.id === id) ? barreGestionAnnonce(source) : ''}<div class="editor-fields">${fields}${blocProprietaire}${id && list.some(item => item.id === id) ? '<section class="avis-studio" data-avis-studio aria-live="polite"><h3>Avis des visiteurs</h3><p class="avis-studio-vide">Chargement…</p></section>' : ''}</div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></div>`);
    const backdrop = $('.editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKeydown);
    $$('[data-etat-annonce]', backdrop).forEach(bouton => bouton.addEventListener('click', () => {
      changerEtatAnnonce(type, id, bouton.dataset.etatAnnonce);
      close();
    }));
    $('[data-supprimer-annonce]', backdrop)?.addEventListener('click', () => { if (supprimerAnnonce(type, id)) close(); });
    const hoteAvis = $('[data-avis-studio]', backdrop);
    if (hoteAvis) rendreAvisStudio(hoteAvis, type, id);
    const renderGallery = () => {
      $('[data-media-list]', backdrop).innerHTML = gallery.length ? gallery.map((url, index) => `<article class="media-card"><img src="${esc(url)}" alt="Aperçu ${index + 1}"><div><span>${index === 0 ? 'Image principale' : `Galerie ${index}`}</span><div>${index > 0 ? `<button type="button" data-media-main="${index}">Principale</button>` : ''}<button type="button" data-media-remove="${index}">Retirer</button></div></div></article>`).join('') : '<div class="media-empty">Ajoutez au moins une image pour présenter ce contenu.</div>';
    };
    renderGallery();
    $('[data-media-list]', backdrop).addEventListener('click', event => {
      const main = event.target.closest('[data-media-main]');
      const remove = event.target.closest('[data-media-remove]');
      if (main) { const [selected] = gallery.splice(Number(main.dataset.mediaMain), 1); gallery.unshift(selected); renderGallery(); }
      if (remove) { gallery.splice(Number(remove.dataset.mediaRemove), 1); renderGallery(); }
    });
    $('[data-add-media-url]', backdrop).addEventListener('click', () => {
      const input = $('[data-media-url]', backdrop);
      const value = input.value.trim();
      if (!value) return;
      gallery.push(value); input.value = ''; renderGallery();
    });
    $('[data-upload-media]', backdrop).addEventListener('change', async event => {
      const files = [...event.target.files].slice(0, Math.max(0, 12 - gallery.length));
      const status = $('[data-upload-status]', backdrop);
      if (!files.length) return;
      status.textContent = `Envoi de ${files.length} image(s)…`;
      try {
        for (const file of files) {
          if (file.size > 8_000_000) throw new Error(`${file.name} dépasse 8 Mo`);
          const result = await uploadMedia(file);
          gallery.push(result.url);
          renderGallery();
        }
        status.textContent = `${files.length} image(s) ajoutée(s)`;
      } catch (error) { status.textContent = error.message; toast(error.message); }
      event.target.value = '';
    });
    // Affichage EN DIRECT et EN LECTURE SEULE du prix au m² et de l'équivalent
    // euro pendant la saisie. Ce calcul est purement indicatif : c'est toujours
    // le serveur qui recalcule et fait foi à la publication.
    brancherTraductions(backdrop);
    if (isVehicle) brancherFicheVehicule(backdrop);
    if (type === 'activity') {
      const apercu = $('[data-tarif-apercu]', backdrop);
      const champsTarif = ['priceAmount', 'priceUnit', 'pricePrefix', 'priceSuffix', 'groupPriceAmount', 'groupSize'];
      const majTarif = () => {
        const form = $('.editor-drawer', backdrop);
        apercu.textContent = texteTarifActivite(Object.fromEntries(champsTarif.map(nom => [nom, form.elements[nom]?.value ?? ''])));
      };
      champsTarif.forEach(nom => {
        const champ = $(`[name="${nom}"]`, backdrop);
        champ?.addEventListener('input', majTarif);
        champ?.addEventListener('change', majTarif);
      });
    }
    if (isTerrain) {
      const area = $('[name="areaSqm"]', backdrop);
      const total = $('[name="priceTotal"]', backdrop);
      const output = $('[data-derived-prices]', backdrop);
      const refresh = () => {
        const a = Number(area.value) || 0;
        const t = Number(total.value) || 0;
        const nf = new Intl.NumberFormat('fr-FR');
        output.innerHTML = `<div><small>Prix au m² (calculé)</small><strong>${a > 0 ? nf.format(Math.round(t / a)) + ' FCFA' : '—'}</strong></div><div><small>Équivalent euro (calculé)</small><strong>${t > 0 ? nf.format(Math.round(t / EURO_RATE)) + ' €' : '—'}</strong></div><p>Valeurs indicatives : le serveur les recalcule à la publication.</p>`;
      };
      area.addEventListener('input', refresh);
      total.addEventListener('input', refresh);
      refresh();
      brancherPositionGps(backdrop, !id);
    }
    $('.editor-drawer', backdrop).addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      // Propriétaire du bien : mis à part, il ne se mélange pas aux champs de la fiche.
      const saisieProprietaire = { nom: values.proprietaireNom, prenom: values.proprietairePrenom, telephone: values.proprietaireTelephone, whatsapp: values.proprietaireWhatsapp };
      ['proprietaireNom', 'proprietairePrenom', 'proprietaireTelephone', 'proprietaireWhatsapp'].forEach(cle => delete values[cle]);
      // Cases multiples : Object.fromEntries n'en garderait que la dernière.
      values.equipements = $$('[name="equipements"]:checked', form).map(input => input.value);
      const normalizedId = String(values.id || '').trim().toLowerCase();
      if (list.some(existing => existing.id === normalizedId && existing.id !== id)) { toast('Cet identifiant est déjà utilisé'); form.elements.id.focus(); return; }
      if (isTerrain) {
        if (!(Number(values.areaSqm) > 0)) { toast('La superficie doit être supérieure à zéro'); form.elements.areaSqm.focus(); return; }
        if (!(Number(values.priceTotal) > 0)) { toast('Le prix de vente total est requis'); form.elements.priceTotal.focus(); return; }
        if (!String(values.reference || '').trim()) { toast('La référence est requise'); form.elements.reference.focus(); return; }
        const duplicate = list.some(existing => existing.id !== id && String(existing.reference || '').toLowerCase() === String(values.reference).trim().toLowerCase());
        if (duplicate) { toast('Cette référence est déjà utilisée'); form.elements.reference.focus(); return; }
      }
      if (!gallery.length && !confirm('Aucune image n’est définie. Continuer quand même ?')) return;
      const utilities = isTerrain ? $$('[name="utilities"]:checked', form).map(input => input.value) : [];
      const item = isVilla ? normalizeVilla(values, data, gallery)
        : isTerrain ? normalizeTerrain(values, data, gallery, utilities)
        : isVehicle ? normalizeVehicle(values, data, gallery)
        : normalizeActivity(values, data, gallery);
      item.translations = lireTraductions(form, type);
      const proprietaireNettoye = Object.fromEntries(Object.entries(saisieProprietaire).map(([cle, valeur]) => [cle, String(valeur || '').trim()]));
      item.proprietaire = Object.values(proprietaireNettoye).some(Boolean) ? proprietaireNettoye : null;
      if (type === 'activity') item.price = texteTarifActivite(item);
      const index = list.findIndex(existing => existing.id === id);
      if (index >= 0) list[index] = item; else list.unshift(item);
      dirty();
      renderListe(type);
      close(); toast('Contenu prêt à être publié');
    });
  }

  /**
   * Coordonnées GPS d'un terrain depuis la position de l'appareil.
   * Demande du 13/09/2026 : un terrain créé depuis un téléphone, sur place,
   * reçoit automatiquement sa latitude et sa longitude. Le navigateur demande
   * d'abord l'autorisation ; la captation automatique ne remplace jamais une
   * coordonnée déjà saisie. Le bouton reste disponible partout (ordinateur,
   * modification, autorisation accordée après coup) et, lui, remplace.
   */
  function brancherPositionGps(racine, nouveauTerrain) {
    const bouton = $('[data-gps-position]', racine);
    const etat = $('[data-gps-etat]', racine);
    const latitude = $('[name="latitude"]', racine);
    const longitude = $('[name="longitude"]', racine);
    if (!bouton || !latitude || !longitude) return;
    if (!('geolocation' in navigator)) {
      bouton.disabled = true;
      etat.textContent = 'Géolocalisation indisponible sur cet appareil : saisissez les coordonnées.';
      return;
    }
    const capter = automatique => {
      if (automatique && (latitude.value || longitude.value)) return;
      bouton.disabled = true;
      etat.textContent = 'Recherche de la position…';
      navigator.geolocation.getCurrentPosition(position => {
        bouton.disabled = false;
        if (!racine.isConnected) return;
        // Saisie manuelle pendant la recherche : elle est respectée.
        if (automatique && (latitude.value || longitude.value)) { etat.textContent = ''; return; }
        latitude.value = position.coords.latitude.toFixed(7);
        longitude.value = position.coords.longitude.toFixed(7);
        etat.textContent = `Position captée (précision ± ${Math.round(position.coords.accuracy)} m). Vérifiez qu’elle correspond bien au terrain.`;
      }, erreur => {
        bouton.disabled = false;
        etat.textContent = erreur.code === 1
          ? 'Localisation refusée : autorisez-la dans le navigateur ou saisissez les coordonnées.'
          : 'Position introuvable : réessayez à l’extérieur ou saisissez les coordonnées.';
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    };
    bouton.addEventListener('click', () => capter(false));
    // Téléphone ou tablette : écran tactile et largeur réduite.
    const surTelephone = window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 900px)').matches;
    if (nouveauTerrain && surTelephone) capter(true);
  }

  /**
   * Case « Publier sur Facebook » (décisions du 17/09/2026) : cochée, l'annonce
   * est sur la Page ; décochée, elle n'y est pas. Le changement part au clic sur
   * « Publier les changements », après confirmation. Garde anti-boucle : une
   * fiche importée depuis Facebook ne peut pas y être renvoyée.
   */
  function shareToFacebookField(item, kind) {
    if (item.source === 'facebook' || item.facebookOriginId) {
      return '<label class="share-fb blocked" title="Contenu importé depuis Facebook : republication bloquée pour éviter une boucle."><input type="checkbox" disabled> Publier sur Facebook <small>(contenu importé de Facebook)</small></label>';
    }
    const publiee = item.id ? state.facebook?.fichesPubliees?.[`${kind}:${item.id}`] : null;
    const cochee = item.facebook === true || (item.facebook !== false && Boolean(publiee));
    if (!state.facebook?.connected) {
      return `<label class="share-fb blocked" title="Configurez la connexion Meta pour activer cette option."><input type="checkbox" disabled ${cochee ? 'checked' : ''}> Publier sur Facebook <small>(connexion Meta requise)</small></label>`;
    }
    const date = publiee?.publieeLe ? ` depuis le ${formatDate(publiee.publieeLe)}` : '';
    const voir = publiee?.lien ? ` · <a href="${esc(publiee.lien)}" target="_blank" rel="noopener">voir</a>` : '';
    const aide = publiee ? `en ligne${esc(date)}${voir} — décocher supprime la publication` : 'publiée à la prochaine publication des changements';
    // `facebookPresent` : la case était modifiable. Décochée, elle n'est pas
    // envoyée par le formulaire ; sans ce témoin on ne saurait pas la distinguer
    // d'une case désactivée, dont la valeur doit rester inchangée.
    return `<label class="share-fb${publiee ? ' en-ligne' : ''}"><input type="hidden" name="facebookPresent" value="1"><input type="checkbox" name="facebook" value="yes" ${cochee ? 'checked' : ''}> Publier sur Facebook <small>(${aide})</small></label>`;
  }

  function mediaFields() { return `<section class="media-manager"><div class="media-manager-head"><div><strong>Images</strong><small>La première image est utilisée comme visuel principal.</small></div><label class="upload-button">＋ Importer<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload-media></label></div><div class="media-list" data-media-list></div><div class="media-url-row"><input type="text" data-media-url placeholder="Ou collez une URL / un chemin d’image"><button type="button" data-add-media-url>Ajouter</button></div><small class="upload-status" data-upload-status>JPG, PNG ou WebP · 8 Mo maximum par image · 12 images maximum</small></section>`; }
  // ---------------------------------------------------------------------
  // CADRE D'UNE RÉSIDENCE = son lieu (décision du 13/09/2026)
  // Distinct de « category », le thème affiché sur residences.html
  // (Événements, Romantique…). « Avec piscine » n'est plus un cadre : c'est
  // l'équipement Piscine. Valeurs identiques à FICHES.CADRES (db/fiches.js)
  // et à CADRES_VILLA (js/app.js).
  // ---------------------------------------------------------------------
  const CADRES_VILLA = [
    { value: 'mer-lagune', label: 'Bordure de mer & lagune' },
    { value: 'ocean', label: 'Bordure de mer' },
    { value: 'lagune', label: 'Bordure de lagune' },
    { value: 'terre', label: 'Terre ferme' }
  ];
  // Rétrocompatibilité : les fiches créées avant l'ajout du champ n'ont pas
  // d'`environment`. On le déduit de l'ancienne catégorie pour qu'aucune villa
  // n'arrive vide dans le formulaire.
  function cadreDeVilla(item) {
    if (CADRES_VILLA.some(c => c.value === item.environment)) return item.environment;
    if (item.category === 'lagune') return 'lagune';
    if (item.category === 'ocean') return 'ocean';
    return 'terre';
  }

  // ---------------------------------------------------------------------
  // RÉFÉRENTIELS (studio → Référentiels, db/referentiels.js)
  // Listes de choix des formulaires : villa, terrain, activité et fiche
  // d'une publication. Une entrée désactivée n'est plus proposée, sauf sur
  // la fiche qui l'utilise encore — elle ne disparaît jamais en silence.
  // ---------------------------------------------------------------------
  const TYPES_REFERENTIELS = {
    localisations: 'Localisations', categories: 'Catégories', equipements: 'Équipements',
    'equipements-voiture': 'Équipements voitures', badges: 'Badges', statuts: 'Statuts'
  };
  const refs = () => state.referentiels || { localisations: [], categories: [], equipements: [], 'equipements-voiture': [], badges: [], statuts: [] };
  const libelleRef = entree => (entree ? (entree.nom !== undefined ? entree.nom : (entree.libelle?.fr || '')) : '');
  const trouverRef = (type, id) => (id ? refs()[type].find(entree => entree.id === String(id)) || null : null);

  function optionsRef(type, actuelle, libelleVide) {
    const liste = refs()[type].filter(entree => entree.actif !== false || entree.id === actuelle);
    const absente = actuelle && !liste.some(entree => entree.id === actuelle)
      ? `<option value="${esc(actuelle)}" selected>${esc(actuelle)} (absent du référentiel)</option>` : '';
    const vide = libelleVide === null ? '' : `<option value="">${esc(libelleVide)}</option>`;
    return vide + absente + liste.map(entree => `<option value="${esc(entree.id)}" ${entree.id === actuelle ? 'selected' : ''}>${esc(libelleRef(entree))}${entree.actif === false ? ' (désactivé)' : ''}</option>`).join('');
  }

  function optionsStatut(cible, actuel) {
    return refs().statuts.filter(statut => statut.cible === cible)
      .map(statut => `<option value="${esc(statut.code)}" ${statut.code === actuel ? 'selected' : ''}>${esc(libelleRef(statut))}</option>`).join('');
  }

  const libelleStatut = (cible, code) => libelleRef(trouverRef('statuts', `${cible}:${code}`)) || code;

  /** Adresse affichée : même règle que le serveur (db/referentiels.js). */
  function adresseAffichee(localisationId, precision, repli) {
    const ville = trouverRef('localisations', localisationId);
    if (!ville) return repli || '';
    const detail = String(precision || '').trim();
    return detail ? `${ville.nom}, ${detail}` : ville.nom;
  }

  function champsLocalisation(item) {
    // Fiche antérieure aux référentiels : son adresse reste affichée sur le
    // site tant qu'aucune ville n'est choisie ; on la rappelle pour la reporter.
    const ancienne = !item.localisationId && item.location
      ? `<small class="ref-ancienne">Adresse actuelle, pas encore rattachée : « ${esc(item.location)} ». Choisissez la ville et reportez le repère.</small>` : '';
    return `<div class="form-grid"><label>Localisation (ville, commune, village)<select name="localisationId">${optionsRef('localisations', item.localisationId || '', '— Non rattachée —')}</select></label><label>Repère (Km, quartier…)<input name="localisationPrecision" maxlength="240" placeholder="Km 8" value="${esc(item.localisationPrecision)}"></label></div>${ancienne}`;
  }

  /**
   * Liste de badges d'une fiche. Une fiche antérieure aux référentiels n'a
   * que le texte de son badge : on présélectionne le badge de même libellé,
   * sinon un simple « Enregistrer » effacerait le badge affiché sur le site.
   */
  function champBadge(item) {
    const parLibelle = !item.badgeId && item.badge
      ? refs().badges.find(entree => libelleRef(entree) === item.badge)
      : null;
    const actuel = item.badgeId || parLibelle?.id || '';
    const orphelin = !actuel && item.badge
      ? `<small class="ref-ancienne">Badge actuel « ${esc(item.badge)} » absent du référentiel : ajoutez-le dans Référentiels → Badges, sinon il sera retiré à l’enregistrement.</small>` : '';
    return `<label>Badge<select name="badgeId">${optionsRef('badges', actuel, 'Aucun badge')}</select>${orphelin}</label>`;
  }

  function casesEquipements(cochees, type = 'equipements', legende = 'Équipements (servent aux filtres du site)') {
    const liste = Array.isArray(cochees) ? cochees : [];
    const entrees = (refs()[type] || []).filter(entree => entree.actif !== false || liste.includes(entree.id));
    if (!entrees.length) return '';
    return `<fieldset class="toggle-row equipements-row"><legend>${esc(legende)}</legend>${entrees.map(entree => `<label><input type="checkbox" name="equipements" value="${esc(entree.id)}" ${liste.includes(entree.id) ? 'checked' : ''}> ${esc(libelleRef(entree))}</label>`).join('')}</fieldset>`;
  }

  /*
   * Équipements d'un véhicule (19/09/2026) : cases à cocher, plus de saisie
   * libre. Une fiche antérieure n'a que ses anciennes lignes `features` :
   * elles sont rapprochées des entrées du référentiel (« Air Bag » →
   * « Airbags », « Gps » → « GPS ») et pré-cochées. Ce qui ne correspond à
   * rien est annoncé sous les cases plutôt que perdu en silence.
   */
  const cleEquipement = valeur => String(valeur ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '').replace(/s$/, '');

  function equipementsVehicule(item) {
    const entrees = refs()['equipements-voiture'] || [];
    if (Array.isArray(item.equipements)) return { coches: item.equipements, restes: [] };
    const parCle = new Map(entrees.flatMap(entree => [[cleEquipement(libelleRef(entree)), entree.id], [cleEquipement(entree.id), entree.id]]));
    const coches = [];
    const restes = [];
    for (const ligne of item.features || []) {
      const id = parCle.get(cleEquipement(ligne));
      if (id && !coches.includes(id)) coches.push(id); else if (!id) restes.push(ligne);
    }
    return { coches, restes };
  }

  function champsEquipementsVehicule(item) {
    const { coches, restes } = equipementsVehicule(item);
    const cases = casesEquipements(coches, 'equipements-voiture', 'Équipements du véhicule (affichés sur la fiche du site)');
    if (!cases) return '<p class="editor-note">Aucun équipement dans la liste : ajoutez-en dans Référentiels → Équipements voitures.</p>';
    return cases + (restes.length
      ? `<p class="editor-note">Anciennes lignes non reprises : ${esc(restes.join(', '))}. Ajoutez-les dans Référentiels → Équipements voitures pour pouvoir les cocher.</p>`
      : '');
  }

  // ---------------------------------------------------------------------
  // TARIF D'UNE ACTIVITÉ (décision du 13/09/2026)
  // Le texte affiché est généré depuis le montant du devis : copie conforme
  // de texteTarifActivite (db/fiches.js), vérifiée par tests/fiches.test.js.
  // ---------------------------------------------------------------------
  const TEXTES_TARIF = {
    fr: { personne: '/ personne', jour: '/ jour', forfait: '', groupe: 'les', surDemande: 'Tarif sur demande' },
    en: { personne: '/ person', jour: '/ day', forfait: '', groupe: 'for', surDemande: 'Price on request' },
    es: { personne: '/ persona', jour: '/ día', forfait: '', groupe: 'para', surDemande: 'Precio a consultar' }
  };

  function formaterMontant(valeur) {
    return String(Math.round(Number(valeur) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function texteTarifActivite(activite, langue = 'fr') {
    const item = activite && typeof activite === 'object' ? activite : {};
    const mots = TEXTES_TARIF[langue] || TEXTES_TARIF.fr;
    const traduction = (langue !== 'fr' && item.translations && item.translations[langue]) || {};
    const mention = champ => String(traduction[champ] || item[champ] || '').trim();
    const avant = mention('pricePrefix');
    const apres = mention('priceSuffix');
    const montant = Math.round(Number(item.priceAmount) || 0);
    if (montant <= 0) return mots.surDemande;
    const unite = ['forfait', 'jour', 'personne'].includes(item.priceUnit) ? item.priceUnit : 'forfait';
    let texte = [avant, `${formaterMontant(montant)} FCFA`, mots[unite], apres].filter(Boolean).join(' ');
    const groupe = Math.round(Number(item.groupPriceAmount) || 0);
    const taille = Math.round(Number(item.groupSize) || 0);
    if (unite === 'personne' && groupe > 0 && taille > 1) {
      texte += ` · ${formaterMontant(groupe)} FCFA ${mots.groupe} ${taille}`;
    }
    return texte;
  }

  // ---------------------------------------------------------------------
  // TRADUCTIONS D'UNE FICHE (point de l'audit du 13/09/2026)
  // Textes affichés en anglais et en espagnol ; un champ vide montre le
  // français (js/i18n.js, I18N.fiche). Mêmes champs que
  // CHAMPS_TRADUISIBLES (db/fiches.js), qui les nettoie côté serveur.
  // ---------------------------------------------------------------------
  const CHAMPS_TRADUCTION = {
    villa: [['tagline', 'Accroche', 'ligne', 240], ['description', 'Description', 'texte', 8000], ['beds', 'Couchages', 'ligne', 160],
      ['features', 'Détails des équipements (un par ligne)', 'liste', 160], ['highlights', 'Points forts (un par ligne)', 'liste', 160]],
    terrain: [['title', 'Titre', 'ligne', 160], ['description', 'Description', 'texte', 8000], ['highlights', 'Atouts (un par ligne)', 'liste', 160]],
    activity: [['title', 'Titre', 'ligne', 160], ['subtitle', 'Sous-titre', 'ligne', 240], ['duration', 'Durée', 'ligne', 80],
      ['description', 'Description', 'texte', 8000], ['pricePrefix', 'Mention avant le prix', 'ligne', 80], ['priceSuffix', 'Précision après le prix', 'ligne', 80]],
    // Les équipements du véhicule ne se traduisent plus ici (19/09/2026) :
    // ils viennent du référentiel « Équipements voitures », déjà traduit.
    vehicle: [['tagline', 'Accroche', 'ligne', 240], ['description', 'Description', 'texte', 8000]]
  };
  const LANGUES_TRADUCTION = [['en', 'Anglais', 'EN'], ['es', 'Espagnol', 'ES']];

  function champsTraductions(type, item) {
    const champs = CHAMPS_TRADUCTION[type];
    if (!champs) return '';
    const traductions = item.translations || {};
    const valeur = (langue, champ) => {
      const brut = traductions[langue]?.[champ];
      return Array.isArray(brut) ? brut.join('\n') : (brut || '');
    };
    const francais = champ => {
      const brut = item[champ];
      const texte = Array.isArray(brut) ? brut.join(' · ') : String(brut || '');
      return texte.length > 150 ? `${texte.slice(0, 149).trimEnd()}…` : texte;
    };
    const panneau = ([code, nom], index) => `<div class="traductions-panneau" data-panneau-langue="${code}" role="tabpanel" aria-label="${nom}" ${index ? 'hidden' : ''}>${champs.map(([champ, libelle, genre, max]) => {
      const attributs = `data-traduction data-langue="${code}" data-champ="${champ}"${genre === 'liste' ? ' data-liste' : ''}`;
      const saisie = genre === 'ligne'
        ? `<input ${attributs} maxlength="${max}" value="${esc(valeur(code, champ))}">`
        : `<textarea ${attributs} rows="${genre === 'liste' ? 4 : 5}"${genre === 'texte' ? ` maxlength="${max}"` : ''}>${esc(valeur(code, champ))}</textarea>`;
      const original = francais(champ);
      return `<label>${libelle}${original ? `<small class="traduction-fr"><abbr title="Texte français">FR</abbr> ${esc(original)}</small>` : ''}${saisie}</label>`;
    }).join('')}</div>`;
    return `<details class="traductions-fiche">
      <summary><span>Traductions</span><small data-traductions-etat></small></summary>
      <p class="traductions-aide">Textes montrés quand le visiteur choisit l’anglais ou l’espagnol. Un champ laissé vide affiche le texte français.</p>
      <div class="traductions-onglets" role="tablist">${LANGUES_TRADUCTION.map(([code, nom], index) => `<button type="button" role="tab" data-onglet-langue="${code}" aria-selected="${index === 0}">${nom}<span data-compte-langue="${code}"></span></button>`).join('')}</div>
      ${LANGUES_TRADUCTION.map(panneau).join('')}
    </details>`;
  }

  /** { en: { tagline: '…' }, es: {…} } — champs vides ignorés. */
  function lireTraductions(form, type) {
    const resultat = {};
    if (!CHAMPS_TRADUCTION[type]) return resultat;
    $$('[data-traduction]', form).forEach(champ => {
      const texte = champ.value.trim();
      if (!texte) return;
      const langue = champ.dataset.langue;
      resultat[langue] = resultat[langue] || {};
      resultat[langue][champ.dataset.champ] = champ.hasAttribute('data-liste') ? lines(texte) : texte;
    });
    return resultat;
  }

  /** Onglets Anglais / Espagnol et compteur « EN 3/5 · ES 0/5 ». */
  function brancherTraductions(racine) {
    const bloc = $('.traductions-fiche', racine);
    if (!bloc) return;
    const onglets = $$('[data-onglet-langue]', bloc);
    onglets.forEach(onglet => onglet.addEventListener('click', () => {
      onglets.forEach(autre => autre.setAttribute('aria-selected', String(autre === onglet)));
      $$('[data-panneau-langue]', bloc).forEach(panneau => { panneau.hidden = panneau.dataset.panneauLangue !== onglet.dataset.ongletLangue; });
    }));
    const majCompte = () => {
      const resume = LANGUES_TRADUCTION.map(([code, , court]) => {
        const champs = $$(`[data-traduction][data-langue="${code}"]`, bloc);
        const remplis = champs.filter(champ => champ.value.trim()).length;
        const compte = $(`[data-compte-langue="${code}"]`, bloc);
        if (compte) compte.textContent = `${remplis}/${champs.length}`;
        return `${court} ${remplis}/${champs.length}`;
      });
      $('[data-traductions-etat]', bloc).textContent = resume.join(' · ');
    };
    bloc.addEventListener('input', majCompte);
    majCompte();
  }

  function villaFields(item) { return `<label>Nom<input name="name" maxlength="160" required value="${esc(item.name)}"></label><div class="form-grid"><label>Identifiant<input name="id" pattern="[a-z0-9\\-]+" required value="${esc(item.id || `villa-${Date.now()}`)}"></label><label>Thème (catégorie)<select name="category">${optionsRef('categories', item.category || '', 'Aucun thème')}</select></label><label>Cadre (lieu)<select name="environment">${CADRES_VILLA.map(c => `<option value="${c.value}" ${cadreDeVilla(item) === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label><label>Statut<select name="status">${optionsStatut('villa', item.status || 'disponible')}</select></label>${champBadge(item)}<label>Tarif par nuit (FCFA)<input type="number" min="0" max="100000000" name="pricePerNight" value="${item.pricePerNight || 150000}"></label><label>Forfait week-end (FCFA)<input type="number" min="0" max="100000000" name="weekendPackage" value="${item.weekendPackage || 0}"></label><label>Capacité<input type="number" min="1" max="100" name="capacity" value="${item.capacity || 6}"></label><label>Chambres<input type="number" min="1" max="50" name="bedrooms" value="${item.bedrooms || 3}"></label><label>Salles de bain<input type="number" min="1" max="50" name="bathrooms" value="${item.bathrooms || 3}"></label><label>Couchages<input name="beds" value="${esc(item.beds)}"></label></div><div class="toggle-row"><label><input type="checkbox" name="visible" value="yes" ${item.visible !== false ? 'checked':''}> Visible sur le site</label><label><input type="checkbox" name="featured" value="yes" ${item.featured ? 'checked':''}> Mise en avant</label>${shareToFacebookField(item, 'villa')}</div>${champsLocalisation(item)}<label>Accroche<input name="tagline" maxlength="240" value="${esc(item.tagline)}"></label><label>Description<textarea name="description" rows="5" maxlength="8000">${esc(item.description)}</textarea></label>${mediaFields()}${casesEquipements(item.equipements)}<label>Détails des équipements (un par ligne, affichés sur la fiche)<textarea name="features" rows="7">${esc((item.features || []).join('\n'))}</textarea></label><label>Points forts (un par ligne)<textarea name="highlights" rows="5">${esc((item.highlights || []).join('\n'))}</textarea></label>${champsTraductions('villa', item)}`; }
  function activityFields(item) { return `<label>Titre<input name="title" maxlength="160" required value="${esc(item.title)}"></label><div class="form-grid"><label>Identifiant<input name="id" pattern="[a-z0-9\\-]+" required value="${esc(item.id || `activite-${Date.now()}`)}"></label>${champBadge(item)}<label>Durée<input name="duration" value="${esc(item.duration)}"></label><label>Montant (FCFA)<input type="number" name="priceAmount" min="0" max="100000000" step="500" value="${Number(item.priceAmount) || 0}" placeholder="0 = sur devis"></label><label>Facturation<select name="priceUnit"><option value="forfait" ${(item.priceUnit || 'forfait') === 'forfait' ? 'selected' : ''}>Forfait (une fois)</option><option value="jour" ${item.priceUnit === 'jour' ? 'selected' : ''}>Par jour de séjour</option><option value="personne" ${item.priceUnit === 'personne' ? 'selected' : ''}>Par personne</option></select></label><label>Forfait groupe (FCFA)<input type="number" name="groupPriceAmount" min="0" max="100000000" step="500" value="${Number(item.groupPriceAmount) || 0}" placeholder="0 = aucun forfait"></label><label>Taille du groupe<input type="number" name="groupSize" min="0" max="50" value="${Number(item.groupSize) || 0}" placeholder="ex. 4"></label></div><p class="hint-groupe">Forfait groupe : appliqué automatiquement par le simulateur dès que le nombre de participants atteint la taille indiquée. Laissez à 0 pour ne pas en proposer.</p><div class="form-grid"><label>Mention avant le prix<input name="pricePrefix" maxlength="80" placeholder="ex. À partir de" value="${esc(item.pricePrefix)}"></label><label>Précision après le prix<input name="priceSuffix" maxlength="80" placeholder="ex. / 30 min" value="${esc(item.priceSuffix)}"></label></div><div class="tarif-apercu" aria-live="polite"><small>Tarif affiché sur le site</small><strong data-tarif-apercu>${esc(texteTarifActivite(item))}</strong><span>Calculé à partir du montant : il est toujours identique au devis.</span></div><div class="toggle-row"><label><input type="checkbox" name="visible" value="yes" ${item.visible !== false ? 'checked':''}> Visible sur le site</label><label><input type="checkbox" name="featured" value="yes" ${item.featured ? 'checked':''}> Mise en avant</label>${shareToFacebookField(item, 'activity')}</div><label>Sous-titre<input name="subtitle" maxlength="240" value="${esc(item.subtitle)}"></label><label>Description<textarea name="description" maxlength="8000" rows="6">${esc(item.description)}</textarea></label>${mediaFields()}${champsTraductions('activity', item)}`; }
  function terrainFields(item) {
    const utilities = Array.isArray(item.utilities) ? item.utilities : [];
    return `<label>Titre<input name="title" maxlength="160" required value="${esc(item.title)}"></label>`
      + `<div class="form-grid">`
      + `<label>Référence<input name="reference" maxlength="40" required placeholder="TER-ASS-001" value="${esc(item.reference)}"></label>`
      + `<label>Identifiant<input name="id" pattern="[a-z0-9\\-]+" required value="${esc(item.id || `terrain-${Date.now()}`)}"></label>`
      + `<label>Superficie (m²)<input type="number" name="areaSqm" min="1" max="100000000" step="1" required value="${Number(item.areaSqm) || ''}"></label>`
      + `<label>Prix de vente total (FCFA)<input type="number" name="priceTotal" min="0" step="1000" required value="${Number(item.priceTotal) || ''}"></label>`
      + `<label>Statut foncier<select name="landStatus">${Object.entries(LAND_STATUS).map(([value, label]) => `<option value="${value}" ${item.landStatus === value ? 'selected':''}>${label}</option>`).join('')}</select></label>`
      + `<label>Statut<select name="status">${optionsStatut('terrain', item.status || 'disponible')}</select></label>`
      + `${champBadge(item)}`
      + `<label>Quartier / lotissement<input name="district" maxlength="120" value="${esc(item.district)}"></label>`
      + `<label>Latitude (GPS)<input type="number" name="latitude" step="0.0000001" min="-90" max="90" placeholder="5.1421" value="${item.latitude ?? ''}"></label>`
      + `<label>Longitude (GPS)<input type="number" name="longitude" step="0.0000001" min="-180" max="180" placeholder="-3.2894" value="${item.longitude ?? ''}"></label>`
      + `</div>`
      + `<div class="gps-position"><button type="button" data-gps-position>📍 Utiliser ma position actuelle</button><small data-gps-etat aria-live="polite"></small></div>`
      + `<div class="derived-prices" data-derived-prices aria-live="polite"></div>`
      + `<fieldset class="toggle-row utilities-row"><legend>Viabilisation</legend>${Object.entries(TERRAIN_UTILITIES).map(([value, label]) => `<label><input type="checkbox" name="utilities" value="${value}" ${utilities.includes(value) ? 'checked':''}> ${label}</label>`).join('')}</fieldset>`
      + `<div class="toggle-row"><label><input type="checkbox" name="visible" value="yes" ${item.visible !== false ? 'checked':''}> Visible sur le site</label><label><input type="checkbox" name="featured" value="yes" ${item.featured ? 'checked':''}> Mis en avant</label>${shareToFacebookField(item, 'terrain')}</div>`
      + champsLocalisation(item)
      + `<label>Description<textarea name="description" rows="6" maxlength="8000">${esc(item.description)}</textarea></label>`
      + mediaFields()
      + `<label>Atouts (un par ligne)<textarea name="highlights" rows="5" placeholder="24 m de façade lagune">${esc((item.highlights || []).join('\n'))}</textarea></label>`
      + champsTraductions('terrain', item);
  }

  function normalizeTerrain(v, old, gallery, utilities) {
    const areaSqm = Math.round(Number(v.areaSqm) || 0);
    const priceTotal = Math.round(Number(v.priceTotal) || 0);
    const landStatus = LAND_STATUS[v.landStatus] ? v.landStatus : 'titre-foncier';
    const decimal = value => (value === '' || value === undefined || value === null || !Number.isFinite(Number(value)) ? null : Number(value));
    return {
      ...old,
      facebook: v.facebookPresent ? v.facebook === 'yes' : (old.facebook ?? null),
      id: String(v.id).trim().toLowerCase(),
      reference: String(v.reference).trim(),
      title: String(v.title).trim(),
      localisationId: v.localisationId || '',
      localisationPrecision: v.localisationId ? String(v.localisationPrecision || '').trim() : '',
      location: adresseAffichee(v.localisationId, v.localisationPrecision, old.location),
      district: v.district,
      areaSqm, priceTotal,
      // Affichés dans l'admin pour l'aperçu ; le serveur les recalcule
      // systématiquement et ignore ces valeurs.
      pricePerSqm: areaSqm ? Math.round(priceTotal / areaSqm) : 0,
      priceEuro: Math.round(priceTotal / EURO_RATE),
      landStatus, landStatusLabel: LAND_STATUS[landStatus],
      utilities: (utilities || []).filter(value => TERRAIN_UTILITIES[value]),
      status: TERRAIN_STATUS[v.status] ? v.status : 'disponible',
      description: v.description,
      images: gallery.slice(0, 12),
      highlights: lines(v.highlights),
      visible: v.visible === 'yes', featured: v.featured === 'yes',
      badgeId: v.badgeId || '',
      badge: libelleRef(trouverRef('badges', v.badgeId)),
      latitude: decimal(v.latitude), longitude: decimal(v.longitude)
    };
  }

  function lines(value) { return String(value || '').split('\n').map(item => item.trim()).filter(Boolean); }
  function normalizeVilla(v, old, gallery) { const price = Number(v.pricePerNight || 0); return { ...old, facebook: v.facebookPresent ? v.facebook === 'yes' : (old.facebook ?? null), id:v.id.trim().toLowerCase(), name:v.name.trim(), category:v.category, categoryLabel: libelleRef(trouverRef('categories', v.category)) || v.category, environment: CADRES_VILLA.some(c => c.value === v.environment) ? v.environment : cadreDeVilla({ ...old, ...v }), status:v.status, visible:v.visible==='yes', featured:v.featured==='yes', badgeId: v.badgeId || '', badge: libelleRef(trouverRef('badges', v.badgeId)), localisationId: v.localisationId || '', localisationPrecision: v.localisationId ? String(v.localisationPrecision || '').trim() : '', location: adresseAffichee(v.localisationId, v.localisationPrecision, old.location), equipements: Array.isArray(v.equipements) ? v.equipements : [], pricePerNight:price, priceEuro:Math.round(price/655.957), weekendPackage:Number(v.weekendPackage || 0), capacity:Number(v.capacity), bedrooms:Number(v.bedrooms), bathrooms:Number(v.bathrooms), beds:v.beds, tagline:v.tagline, description:v.description, images:gallery.slice(0,12), features:lines(v.features), highlights:lines(v.highlights), rating:old.rating || 5, reviewsCount:old.reviewsCount || 0 }; }
  function normalizeActivity(v, old, gallery) { return { ...old, facebook: v.facebookPresent ? v.facebook === 'yes' : (old.facebook ?? null), id:v.id.trim().toLowerCase(), title:v.title.trim(), badgeId: v.badgeId || '', badge: libelleRef(trouverRef('badges', v.badgeId)), duration:v.duration, pricePrefix: String(v.pricePrefix || '').trim(), priceSuffix: String(v.priceSuffix || '').trim(), priceAmount: Number(v.priceAmount) || 0, priceUnit: ['forfait','jour','personne'].includes(v.priceUnit) ? v.priceUnit : 'forfait', groupPriceAmount: Number(v.groupPriceAmount) || 0, groupSize: Number(v.groupSize) || 0, subtitle:v.subtitle, description:v.description, visible:v.visible==='yes', featured:v.featured==='yes', image:gallery[0] || '', images:gallery.slice(0,12) }; }
  function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`)); reader.readAsDataURL(file); }); }
  async function uploadMedia(file) { return api('/api/admin/media', { method:'POST', body:JSON.stringify({ filename:file.name, mimeType:file.type, data:await fileAsDataUrl(file) }) }); }

  function renderSettings() {
    const s = state.content.settings;
    $('#settingsForm').innerHTML = `<span class="eyebrow">IDENTITÉ DU SITE</span><h2>Textes et coordonnées</h2><div class="form-grid"><label class="wide">Titre du hero<input name="heroTitle" maxlength="180" value="${esc(s.heroTitle)}"></label><label class="wide">Sous-titre du hero<textarea name="heroSubtitle" maxlength="500" rows="3">${esc(s.heroSubtitle)}</textarea></label><label>Téléphone<input name="phone" value="${esc(s.phone || CONTACT_CONFIG.phone)}"></label><label>Page Facebook<input type="url" name="facebookPage" value="${esc(s.facebookPage || CONTACT_CONFIG.facebookPage)}"></label><label>Horaires<input name="officeHours" value="${esc(s.officeHours || '7j/7 · 7h–22h')}"></label><label>Devise<input name="currency" maxlength="20" value="${esc(s.currency || 'FCFA')}"></label></div><p>Ces réglages sont appliqués au prochain clic sur « Publier les changements ».</p>`;
  }
  function captureSettings() {
    state.content.settings = { ...state.content.settings, ...Object.fromEntries(new FormData($('#settingsForm'))) };
    // Relais automatique retiré le 17/09/2026 : la case de chaque annonce décide.
    delete state.content.settings.facebookAutoPublish;
    dirty();
  }

  function renderFacebook(data) {
    state.facebook = data;
    const sync = data.state || {};
    const statusLabel = data.error || sync.lastError ? 'Action requise' : data.connected ? 'Connexion active' : 'Connexion à terminer';
    const statusText = data.error || sync.lastError || (data.connected ? 'La Page Facebook est reliée au site.' : 'Ajoutez les identifiants Meta sur le serveur pour activer les échanges.');
    $('#fbConnection').className = `facebook-status-panel panel${data.connected ? ' connected':''}${data.error || sync.lastError ? ' has-error':''}`;
    $('#fbConnection').innerHTML = `<div class="facebook-status-main"><span class="facebook-status-dot" aria-hidden="true"></span><div><span class="eyebrow">ÉTAT DE LA PASSERELLE</span><h2>${esc(statusLabel)}</h2><p>${esc(statusText)}</p></div></div><div class="facebook-status-grid"><div><small>Page</small><strong>${esc(data.pageId || '100075922063365')}</strong></div><div><small>Dernière synchronisation</small><strong>${formatDateTime(sync.lastSyncAt)}</strong></div><div><small>Dernier événement reçu</small><strong>${formatDateTime(sync.lastWebhookAt)}</strong></div><div><small>Webhook sécurisé</small><strong>${data.webhookReady ? 'Prêt' : 'À configurer'}</strong></div><div><small>Adresse publique du site</small><strong>${data.publicSiteReady ? 'Prête' : 'À configurer'}</strong></div><div><small>Publications conservées</small><strong>${Number(sync.postCount || data.posts?.length || 0)}</strong></div></div>`;
    $('#fbPublishBtn').disabled = !data.connected;
    $('#fbSyncBtn').disabled = !data.connected;
    $('#fbPublishBtn').title = data.connected ? '' : 'Configurez la connexion Meta pour publier';
    $('#fbSyncBtn').title = data.connected ? '' : 'Configurez la connexion Meta pour synchroniser';
    $('#fbPublishHelp').textContent = data.connected ? 'Une confirmation est demandée avant tout envoi vers la Page officielle.' : 'La publication reste désactivée tant que la connexion Meta n’est pas prête.';
    const source = $('#fbContentSource');
    source.innerHTML = '<option value="">Publication libre</option>' + [
      ...state.content.villas.map(item => `<option value="villa:${esc(item.id)}">Villa · ${esc(item.name)}</option>`),
      ...state.content.terrains.map(item => `<option value="terrain:${esc(item.id)}">Terrain · ${esc(item.reference || item.id)} — ${esc(item.title)}</option>`),
      ...state.content.activities.map(item => `<option value="activity:${esc(item.id)}">Activité · ${esc(item.title)}</option>`)
    ].join('');
    const posts = data.posts || state.content.facebookPosts;
    rendrePublicationsStudio(posts);
  }

  /**
   * Liste linéaire des publications reçues de la Page.
   *
   * Une ligne par publication : vignette, première ligne du message, date et
   * nombre de photos, puis l'interrupteur. Les vignettes en colonnes rendaient
   * la lecture pénible dès qu'il y avait plus de quelques publications ; en
   * lignes, on parcourt la liste d'un seul coup d'œil.
   *
   * Le détail — toutes les photos, le texte entier, les commandes — s'ouvre au
   * clic sur la ligne.
   */
  function rendrePublicationsStudio(posts) {
    const hote = $('#fbPosts');
    if (!hote) return;
    publicationsStudio = Array.isArray(posts) ? posts : [];

    if (!publicationsStudio.length) {
      hote.innerHTML = '<div class="empty">Aucune publication synchronisée pour le moment.</div>';
      return;
    }

    hote.innerHTML = publicationsStudio.map((post, index) => ligneRublication(post, index)).join('');

    $$('[data-ouvrir-publication]', hote).forEach(bouton => {
      bouton.addEventListener('click', () => ouvrirDetailPublication(Number(bouton.dataset.ouvrirPublication)));
    });
    $$('[data-visibilite]', hote).forEach(champ => {
      champ.addEventListener('change', () => basculerVisibilitePublication(champ));
    });
  }

  /** Première ligne utile du message, pour servir de titre à la ligne. */
  function titrePublicationStudio(post) {
    const premiere = String(post.message || '')
      .split('\n')
      .map(ligne => ligne.trim())
      .find(ligne => ligne.length > 3);
    if (!premiere) return 'Publication sans texte';
    return premiere.length > 90 ? `${premiere.slice(0, 89).trimEnd()}…` : premiere;
  }

  /** Toutes les photos d'une publication, repli sur la vignette de couverture. */
  function photosPublication(post) {
    const liste = Array.isArray(post.images) && post.images.length ? post.images : [post.full_picture];
    return liste.filter(Boolean);
  }

  /** « la villa « Villa L'Oasis d'Assinie » » pour { kind: 'villa', id: 'villa-oasis' }. */
  function titreOrigine(origine) {
    if (!origine) return '';
    const collections = { villa: state.content?.villas, terrain: state.content?.terrains, activity: state.content?.activities };
    const fiche = (collections[origine.kind] || []).find(item => item.id === origine.id);
    const genre = { villa: 'la villa', terrain: 'le terrain', activity: 'l’activité' }[origine.kind] || 'la fiche';
    return fiche ? `${genre} « ${fiche.name || fiche.title} »` : `${genre} « ${origine.id} » (supprimée depuis)`;
  }

  /**
   * Publication envoyée par le site depuis une fiche (point de l'audit du
   * 13/09/2026) : jamais affichée sur le site, où la fiche l'est déjà. Son
   * interrupteur n'aurait pas d'objet ; le studio dit d'où elle vient.
   */
  function etatOrigine(post) {
    return `<span class="fb-origine" title="Publiée par le site depuis ${esc(titreOrigine(post.origine))}. Elle n’apparaît pas dans « Depuis Facebook » : la fiche est déjà sur le site.">Depuis le site</span>`;
  }

  function ligneRublication(post, index) {
    const visible = post.surLeSite !== false;
    const photos = photosPublication(post);
    const vignette = photos[0]
      ? `<img src="${esc(photos[0])}" alt="" loading="lazy">`
      : '<span class="fb-ligne-sans-image" aria-hidden="true">f</span>';
    const compte = photos.length > 1 ? ` · ${photos.length} photos` : photos.length ? ' · 1 photo' : '';
    return `<li class="fb-ligne${visible ? '' : ' est-masquee'}">
      <button type="button" class="fb-ligne-ouvrir" data-ouvrir-publication="${index}">
        <span class="fb-ligne-vignette">${vignette}</span>
        <span class="fb-ligne-texte">
          <strong>${esc(titrePublicationStudio(post))}</strong>
          <small>${formatDateTime(post.created_time)}${esc(compte)}</small>
        </span>
      </button>
      ${post.origine ? etatOrigine(post) : `<label class="bascule-publication" title="Afficher cette publication sur le site public">
        <input type="checkbox" data-visibilite="${esc(post.id || '')}" ${visible ? 'checked' : ''}>
        <span class="bascule-piste" aria-hidden="true"></span>
        <span class="bascule-texte">${visible ? 'Sur le site' : 'Masquée'}</span>
      </label>`}
    </li>`;
  }

  /** Vue de détail : toutes les photos, le texte entier et les commandes. */
  function ouvrirDetailPublication(index) {
    const post = publicationsStudio[index];
    if (!post) return;
    const photos = photosPublication(post);
    const visible = post.surLeSite !== false;

    const galerie = photos.length
      ? `<div class="fb-detail-galerie">${photos.map(url => `<figure><img src="${esc(url)}" alt="" loading="lazy"></figure>`).join('')}</div>`
      : '<p class="fb-detail-vide">Cette publication ne contient aucune image.</p>';

    const paragraphes = String(post.message || 'Publication sans texte')
      .split(/\n{2,}/)
      .filter(bloc => bloc.trim())
      .map(bloc => `<p>${esc(bloc.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('') || '<p>Publication sans texte</p>';

    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop fb-detail-backdrop"><form class="editor-drawer" novalidate>
      <div class="editor-head">
        <div><span class="eyebrow">PUBLICATION FACEBOOK</span><h2>${formatDateTime(post.created_time)}</h2></div>
        <button type="button" data-close-editor aria-label="Fermer">×</button>
      </div>
      <div class="editor-fields">
        ${post.origine
          ? `<p class="fb-origine-note">Publiée par le site depuis ${esc(titreOrigine(post.origine))}. Elle n’apparaît pas dans « Depuis Facebook » : la fiche est déjà affichée sur le site, avec sa localisation, sa capacité et son tarif. Aucune fiche à compléter ici.</p>`
          : champsFichePublication(post.fiche)}
        ${galerie}
        <div class="fb-detail-texte">${paragraphes}</div>
      </div>
      <div class="editor-actions fb-detail-actions">
        ${post.origine ? etatOrigine(post) : `<label class="bascule-publication" title="Afficher cette publication sur le site public">
          <input type="checkbox" data-visibilite="${esc(post.id || '')}" ${visible ? 'checked' : ''}>
          <span class="bascule-piste" aria-hidden="true"></span>
          <span class="bascule-texte">${visible ? 'Sur le site' : 'Masquée'}</span>
        </label>`}
        ${post.permalink_url ? `<a class="fb-detail-lien" href="${esc(post.permalink_url)}" target="_blank" rel="noopener">Voir sur Facebook →</a>` : ''}
        <button type="button" data-close-editor>Fermer</button>
        ${post.origine ? '' : '<button type="submit" class="primary">Enregistrer la fiche</button>'}
      </div>
    </form></div>`);

    const fond = $('.fb-detail-backdrop');
    const formulaire = $('form', fond);
    const fermer = () => fond.remove();
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    document.addEventListener('keydown', function echap(event) {
      if (event.key !== 'Escape') return;
      document.removeEventListener('keydown', echap);
      fermer();
    });
    $('[data-visibilite]', fond)?.addEventListener('change', event => basculerVisibilitePublication(event.target));
    formulaire.addEventListener('submit', event => {
      event.preventDefault();
      if (!post.origine) enregistrerFichePublication(post, formulaire, fermer);
    });
    $('[data-close-editor]', fond).focus();
  }

  /**
   * Champs de la fiche du bien : ceux du formulaire d'une villa, dans le même
   * ordre et avec les mêmes bornes, sans ce que la publication porte déjà
   * (description = son texte, images = son album, visibilité = l'interrupteur).
   * Tout est facultatif : un champ vide n'est pas pris en compte par la
   * recherche du site.
   */
  function champsFichePublication(fiche = {}) {
    const f = fiche || {};
    const nombre = valeur => (valeur === null || valeur === undefined ? '' : esc(valeur));
    const options = (valeurs, actuelle, vide) => `<option value="">${vide}</option>`
      + valeurs.map(([valeur, libelle]) => `<option value="${esc(valeur)}" ${actuelle === valeur ? 'selected' : ''}>${esc(libelle)}</option>`).join('');
    const cadres = CADRES_VILLA.map(c => [c.value, c.label]);
    return `<section class="fb-fiche" aria-labelledby="fbFicheTitre">
      <h3 id="fbFicheTitre">Fiche du bien</h3>
      <p class="fb-fiche-aide">La publication ne dit ni où, ni pour combien, ni à quel prix. Renseignez-le pour qu’elle ressorte dans la recherche du site. Tout est facultatif : un champ laissé vide n’est pas pris en compte.</p>
      <label>Nom<input name="name" maxlength="160" value="${esc(f.name)}"></label>
      <div class="form-grid">
        <label>Thème (catégorie)<select name="category">${optionsRef('categories', f.category || '', 'Aucun thème')}</select></label>
        <label>Cadre (lieu, filtre « Emplacement »)<select name="environment">${options(cadres, f.environment, 'Non renseigné')}</select></label>
        <label>Statut<select name="status"><option value="">Non renseigné</option>${optionsStatut('villa', f.status)}</select></label>
        ${champBadge(f)}
        <label>Tarif par nuit (FCFA)<input type="number" min="0" max="100000000" step="1" name="pricePerNight" value="${nombre(f.pricePerNight)}"></label>
        <label>Forfait week-end (FCFA)<input type="number" min="0" max="100000000" step="1" name="weekendPackage" value="${nombre(f.weekendPackage)}"></label>
        <label>Capacité<input type="number" min="1" max="100" step="1" name="capacity" value="${nombre(f.capacity)}"></label>
        <label>Chambres<input type="number" min="1" max="50" step="1" name="bedrooms" value="${nombre(f.bedrooms)}"></label>
        <label>Salles de bain<input type="number" min="1" max="50" step="1" name="bathrooms" value="${nombre(f.bathrooms)}"></label>
        <label>Couchages<input name="beds" maxlength="160" value="${esc(f.beds)}"></label>
      </div>
      <div class="toggle-row"><label><input type="checkbox" name="featured" value="yes" ${f.featured ? 'checked' : ''}> Mise en avant</label></div>
      ${champsLocalisation(f)}
      <label>Accroche<input name="tagline" maxlength="240" value="${esc(f.tagline)}"></label>
      ${casesEquipements(f.equipements)}
      <label>Détails des équipements (un par ligne)<textarea name="features" rows="5">${esc((f.features || []).join('\n'))}</textarea></label>
      <label>Points forts (un par ligne)<textarea name="highlights" rows="4">${esc((f.highlights || []).join('\n'))}</textarea></label>
    </section>`;
  }

  /** Envoie la fiche ; le serveur la valide et renvoie la version retenue. */
  async function enregistrerFichePublication(post, formulaire, fermer) {
    // Le navigateur signale lui-même un champ hors bornes, à l'endroit fautif.
    if (!formulaire.reportValidity()) return;
    const donnees = Object.fromEntries(new FormData(formulaire));
    const fiche = {
      ...donnees,
      featured: formulaire.elements.featured.checked,
      equipements: $$('[name="equipements"]:checked', formulaire).map(input => input.value),
      // Sans ville choisie, l'adresse d'origine est conservée telle quelle.
      location: donnees.localisationId ? '' : (post.fiche?.location || ''),
      features: lines(donnees.features),
      highlights: lines(donnees.highlights)
    };
    const bouton = $('button[type="submit"]', formulaire);
    bouton.disabled = true;
    try {
      const reponse = await api('/api/admin/facebook/fiche', {
        method: 'POST',
        body: JSON.stringify({ id: post.id, fiche })
      });
      post.fiche = reponse.fiche;
      toast(reponse.warning || 'Fiche enregistrée');
      fermer();
    } catch (error) {
      toast(error.message);
      bouton.disabled = false;
    }
  }

  /**
   * Applique le choix « afficher sur le site ».
   * Le champ est rendu à son état d'origine si le serveur refuse : mieux vaut
   * un interrupteur qui revient en arrière qu'un studio qui ment sur l'état
   * réel du site.
   */
  async function basculerVisibilitePublication(champ) {
    const id = champ.dataset.visibilite;
    const visible = champ.checked;
    champ.disabled = true;
    try {
      await api('/api/admin/facebook/visibilite', {
        method: 'POST',
        body: JSON.stringify({ id, visible })
      });
      // Toutes les copies de cet interrupteur — la ligne et le détail ouvert —
      // doivent refléter le même état.
      $$(`[data-visibilite="${CSS.escape(id)}"]`).forEach(autre => {
        autre.checked = visible;
        const etiquette = autre.parentElement.querySelector('.bascule-texte');
        if (etiquette) etiquette.textContent = visible ? 'Sur le site' : 'Masquée';
        const ligne = autre.closest('.fb-ligne');
        if (ligne) ligne.classList.toggle('est-masquee', !visible);
      });
      const memoire = publicationsStudio.find(item => String(item.id) === String(id));
      if (memoire) memoire.surLeSite = visible;
      toast(visible ? 'Publication affichée sur le site' : 'Publication retirée du site');
    } catch (error) {
      champ.checked = !visible;
      toast(error.message);
    } finally {
      champ.disabled = false;
    }
  }

  // Copie de titreFacebook (server.js) : titre en MAJUSCULES grasses Unicode.
  function titreFacebook(texte) {
    return String(texte || '').toLocaleUpperCase('fr-FR').normalize('NFD').replace(/[A-Z0-9]/g, lettre => {
      const code = lettre.charCodeAt(0);
      return String.fromCodePoint(code <= 57 ? 0x1D7EC + code - 48 : 0x1D5D4 + code - 65);
    });
  }

  function prepareFacebookFromContent() {
    const [type, id] = $('#fbContentSource').value.split(':');
    const collections = { villa: state.content.villas, terrain: state.content.terrains, activity: state.content.activities };
    const item = (collections[type] || []).find(entry => entry.id === id);
    if (!item) return;
    const title = item.name || item.title;
    const pages = { villa: 'residences.html', terrain: 'terrains.html', activity: 'loisirs.html' };
    if (type === 'terrain') {
      $('#fbMessage').value = [
        titreFacebook(`${item.reference ? `${item.reference} — ` : ''}${title}`),
        item.location,
        `${new Intl.NumberFormat('fr-FR').format(Number(item.areaSqm || 0))} m² · ${money(item.priceTotal)} (${money(perSqm(item))} / m²)`,
        item.landStatusLabel ? `Statut foncier : ${item.landStatusLabel}` : '',
        item.description || ''
      ].filter(Boolean).join('\n\n');
    } else {
      // Villas et activités : titre + description, sans prix (même règle que
      // buildShareMessage dans server.js, décision du 13/09/2026).
      $('#fbMessage').value = [titreFacebook(title), item.description || item.tagline || item.subtitle || '']
        .filter(Boolean).join('\n\n');
    }
    const base = state.facebook?.publicSiteUrl || '';
    $('#fbLink').value = base ? `${base}/${pages[type] || 'index.html'}` : '';
    // Le catalogue porte souvent plusieurs visuels : on les reprend tous,
    // l'exploitant retire ceux qu'il ne veut pas.
    imagesFacebook = (Array.isArray(item.images) && item.images.length ? item.images : [item.image])
      .filter(Boolean).slice(0, 10);
    renderFacebookImagePreview();
  }

  function renderFacebookImagePreview() {
    const liste = $('#fbImageList');
    if (!liste) return;
    if (!imagesFacebook.length) {
      liste.innerHTML = '<p class="fb-media-vide">Aucune image. La publication partira en texte seul.</p>';
    } else {
      liste.innerHTML = imagesFacebook.map((source, index) => `<figure class="fb-media-item">
        <img src="${esc(source)}" alt="" loading="lazy">
        ${index === 0 ? '<span class="fb-media-badge">Principale</span>' : ''}
        <button type="button" class="fb-media-remove" data-retirer-image="${index}" aria-label="Retirer cette image">×</button>
      </figure>`).join('');
      $$('[data-retirer-image]').forEach(bouton => bouton.addEventListener('click', () => {
        imagesFacebook.splice(Number(bouton.dataset.retirerImage), 1);
        renderFacebookImagePreview();
      }));
    }
    const restant = MAX_IMAGES_FACEBOOK - imagesFacebook.length;
    $('#fbImageStatus').textContent = imagesFacebook.length
      ? `${imagesFacebook.length} image(s) · ${restant} encore possible(s)${imagesFacebook.length > 1 ? ' · publiées en album' : ''}`
      : 'JPG, PNG ou WebP · 8 Mo maximum par image · 10 images maximum';
  }

  function ajouterImageFacebookParUrl() {
    const champ = $('#fbImageUrl');
    const valeur = champ.value.trim();
    if (!valeur) return;
    if (imagesFacebook.length >= MAX_IMAGES_FACEBOOK) return toast(`Maximum ${MAX_IMAGES_FACEBOOK} images par publication`);
    imagesFacebook.push(valeur);
    champ.value = '';
    renderFacebookImagePreview();
  }

  /**
   * Import de fichiers depuis le poste. Les images sont téléversées une par une
   * vers /api/admin/media, qui contrôle le format et la signature du fichier,
   * puis renvoie un chemin « assets/uploads/… » réutilisable.
   */
  async function importerImagesFacebook(evenement) {
    const fichiers = [...(evenement.target.files || [])];
    if (!fichiers.length) return;
    const statut = $('#fbImageStatus');
    const place = MAX_IMAGES_FACEBOOK - imagesFacebook.length;
    if (place <= 0) { evenement.target.value = ''; return toast(`Maximum ${MAX_IMAGES_FACEBOOK} images par publication`); }

    const aTraiter = fichiers.slice(0, place);
    if (fichiers.length > place) toast(`Seules ${place} image(s) ont pu être ajoutées`);

    let reussies = 0;
    for (const [index, fichier] of aTraiter.entries()) {
      statut.textContent = `Import de ${fichier.name} (${index + 1}/${aTraiter.length})…`;
      try {
        // Contrôle local avant de transférer 8 Mo pour rien : le serveur
        // refuserait de toute façon, autant le dire tout de suite.
        if (fichier.size > 8_000_000) throw new Error('dépasse 8 Mo');
        const media = await uploadMedia(fichier);
        // Une image refusée ne doit pas interrompre les suivantes.
        if (media?.url) { imagesFacebook.push(media.url); reussies += 1; }
        renderFacebookImagePreview();
      } catch (error) {
        toast(`${fichier.name} : ${error.message}`);
      }
    }
    evenement.target.value = '';
    renderFacebookImagePreview();
    if (reussies) toast(`${reussies} image(s) ajoutée(s)`);
  }
  async function publishFacebook() {
    const message = $('#fbMessage').value.trim();
    if (!message) return toast('Ajoutez le texte de la publication');
    const combien = imagesFacebook.length;
    const resume = combien > 1 ? ` avec ${combien} images (album)` : combien === 1 ? ' avec 1 image' : ' en texte seul';
    if (!confirm(`Publier maintenant ce contenu${resume} sur la Page Facebook officielle ?`)) return;
    const button = $('#fbPublishBtn');
    button.disabled = true; button.textContent = 'Publication…';
    try {
      const result = await api('/api/admin/facebook/publish',{method:'POST',body:JSON.stringify({ message, link:$('#fbLink').value.trim(), imageUrls:imagesFacebook.slice(), idempotencyKey:crypto.randomUUID() })});
      $('#fbMessage').value=''; $('#fbLink').value=''; $('#fbImageUrl').value=''; $('#fbContentSource').value='';
      imagesFacebook = []; renderFacebookImagePreview();
      toast(result.result.duplicate ? 'Cette publication avait déjà été envoyée' : 'Publication envoyée sur Facebook');
      setTimeout(async () => renderFacebook(await api('/api/admin/facebook/posts')), 700);
    } catch(error) { toast(error.message); }
    finally { button.disabled = !state.facebook?.connected; button.textContent = 'Publier sur Facebook'; }
  }
  /**
   * Point de contrôle : la Page est-elle réellement abonnée au champ `feed` ?
   * Sans cet abonnement, aucun webhook n'arrive : le sens Facebook → site ne
   * repose alors plus que sur la resynchronisation périodique (15 min).
   */
  async function checkFacebookSubscription() {
    const panel = $('#fbSubscription');
    const button = $('#fbCheckSubBtn');
    button.disabled = true; button.textContent = 'Vérification…';
    try {
      const result = await api('/api/admin/facebook/subscriptions');
      const fields = (result.apps || []).flatMap(app => app.fields);
      panel.innerHTML = result.feedSubscribed
        ? `<span>Abonnement webhook au champ <code>feed</code> :</span><strong class="ok">actif ✓</strong><small>${esc((result.apps || []).length)} application(s) abonnée(s) · champs : ${esc(fields.join(', ') || '—')}</small>`
        : `<span>Abonnement webhook au champ <code>feed</code> :</span><strong class="ko">absent ✗</strong><small>${esc(result.error || 'Abonnez la Page au champ feed dans l’application Meta, sinon aucune notification n’arrivera.')}</small>`;
      panel.appendChild(button);
    } catch (error) {
      panel.innerHTML = `<span>Abonnement webhook :</span><strong class="ko">vérification impossible</strong><small>${esc(error.message)}</small>`;
      panel.appendChild(button);
    } finally {
      button.disabled = false; button.textContent = 'Vérifier l’abonnement';
    }
  }

  async function syncFacebook() {
    const button = $('#fbSyncBtn'); button.disabled = true; button.textContent = 'Synchronisation…';
    try { const result = await api('/api/admin/facebook/sync-to-site',{method:'POST',body:'{}'}); toast(`${result.count} publications synchronisées`); renderFacebook(await api('/api/admin/facebook/posts')); }
    catch(error) { toast(error.message); }
    finally { button.disabled = !state.facebook?.connected; button.textContent = 'Synchroniser maintenant'; }
  }

function dirty() { state.dirty = true; $('#saveState').textContent = 'Modifications non publiées'; $('#saveState').style.color = '#cca203'; }
  async function saveContent() {
    if (!state.contenuCharge) { toast('Le contenu n’est pas encore chargé : patientez avant de publier.'); return; }
    captureSettings();
    const button = $('#saveAllBtn');
    button.disabled = true; button.textContent = 'Vérification…';
    try {
      const validation = await api('/api/admin/content/validate',{method:'POST',body:JSON.stringify(state.content)});
      button.textContent = 'Publication…';

      // Ce que la publication va faire sur la Page : confirmé avant l'envoi.
      const plan = validation.facebook;
      if (plan && (plan.publier.length || plan.photos.length || plan.retirer.length)) {
        const raisons = { 'case-decochee': 'case décochée', suspendue: 'annonce suspendue', archivee: 'annonce archivée', supprimee: 'annonce supprimée' };
        const blocs = [
          plan.publier.length ? `Publier sur Facebook :\n· ${plan.publier.join('\n· ')}` : '',
          plan.photos.length ? `Republier (photos modifiées : les likes et commentaires Facebook de la publication seront perdus) :\n· ${plan.photos.join('\n· ')}` : '',
          plan.retirer.length ? `Supprimer de Facebook :\n· ${plan.retirer.map(entree => `${entree.nom} (${raisons[entree.raison] || entree.raison})`).join('\n· ')}` : ''
        ].filter(Boolean);
        if (!confirm(`Cette publication va modifier la Page Facebook :\n\n${blocs.join('\n\n')}\n\nContinuer ?`)) {
          button.disabled = false; button.textContent = 'Publier les changements'; return;
        }
      }
      const published = await api('/api/admin/content',{method:'POST',body:JSON.stringify({ ...state.content, baseUpdatedAt: state.baseUpdatedAt })});
      state.baseUpdatedAt = published.updatedAt || state.baseUpdatedAt;
      const fb = published.facebook || {};
      const faits = [
        fb.publiees?.length ? `${fb.publiees.length} publiée(s)` : '',
        fb.republiees?.length ? `${fb.republiees.length} republiée(s)` : '',
        fb.textes?.length ? `${fb.textes.length} texte(s) mis à jour` : '',
        fb.retirees?.length ? `${fb.retirees.length} supprimée(s)` : '',
        fb.enAttente?.length ? `${fb.enAttente.length} à la prochaine publication (5 envois au plus à la fois)` : ''
      ].filter(Boolean);
      (fb.erreurs || []).forEach(message => console.warn('Facebook :', message));
      const messageFacebook = [faits.length ? `Facebook : ${faits.join(', ')}.` : '', fb.erreurs?.length ? `Facebook, échec : ${fb.erreurs[0]}` : ''].filter(Boolean).join(' ');
      // État réel de la Page (publications en ligne, liens) pour les cases.
      if (faits.length && can('facebook:read')) {
        try { renderFacebook(await api('/api/admin/facebook/posts')); } catch { /* l'état se rechargera à l'actualisation */ }
        renderVillas(); renderTerrains(); renderActivities();
      }
      state.dirty=false;
      // On affiche le stockage RÉELLEMENT utilisé. « Publié » sans préciser que
      // seul le JSON a été écrit a déjà fait croire à un enregistrement en base.
      const enBase = published.storage === 'mysql';
      $('#saveState').textContent = enBase ? 'Publié · enregistré en base' : 'Publié · FICHIERS SEULEMENT (base non écrite)';
      $('#saveState').style.color = enBase ? '' : '#c0392b';
      state.dashboard = await api('/api/admin/dashboard').catch(() => state.dashboard);
      // Sauvegardes et journal d'audit sont réservés au propriétaire : un
      // éditeur publie sans que ces appels ne fassent échouer la publication.
      if (can('backup:manage')) state.backups = (await api('/api/admin/backups').catch(() => ({}))).backups || state.backups;
      if (can('audit:read')) state.audit = (await api('/api/admin/audit').catch(() => ({}))).entries || state.audit;
      if (published.warnings?.length) published.warnings.forEach(warning => console.info('Publication :', warning));
      renderDashboard(); renderOperations();
      if (!enBase) toast(['Publié en fichiers uniquement : la base de données n’a PAS été mise à jour. Prévenez l’hébergeur.', messageFacebook].filter(Boolean).join(' '));
      else toast([validation.warnings?.length ? `Publié en base · ${validation.warnings.length} point(s) à surveiller.` : 'Publié et enregistré en base de données.', messageFacebook].filter(Boolean).join(' '));
    } catch(error) { toast(error.message); }
    finally { button.disabled = !state.contenuCharge; button.textContent = 'Publier les changements'; }
  }
  // =========================================================================
  // ONGLET UTILISATEURS (rôle « propriétaire » uniquement)
  // =========================================================================
  function renderUsers() {
    const head = '<div class="table-row users-grid-row header"><span>Utilisateur</span><span>Rôle</span><span>État</span><span>Dernière connexion</span><span>Action</span></div>';
    $('#usersTable').innerHTML = head + state.users.map(user => {
      const isSelf = user.id === state.user?.id;
      const etat = user.locked ? '<span class="status verrouille">Verrouillé</span>'
        : user.active ? '<span class="status disponible">Actif</span>'
          : '<span class="status vendu">Désactivé</span>';
      return `<div class="table-row users-grid-row ${user.active ? '' : 'is-hidden'}">
        <div class="table-title"><strong>${esc(user.username)}${isSelf ? ' <em class="self-tag">vous</em>' : ''}</strong><small>${esc(user.email || 'Aucune adresse renseignée')}</small></div>
        <div><span class="status">${esc(user.roleLabel || user.role)}</span></div>
        <div>${etat}${user.failedAttempts ? `<small class="attempts">${user.failedAttempts} échec(s)</small>` : ''}</div>
        <div>${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '<small>jamais</small>'}</div>
        <div class="row-actions">
          <button title="Modifier" data-edit-user="${esc(user.id)}">✎</button>
          <button title="Supprimer" data-delete-user="${esc(user.id)}" ${isSelf ? 'disabled' : ''}>×</button>
        </div>
      </div>`;
    }).join('');
    $$('[data-edit-user]').forEach(button => button.addEventListener('click', () => openUserEditor(button.dataset.editUser)));
    $$('[data-delete-user]').forEach(button => button.addEventListener('click', () => deleteUser(button.dataset.deleteUser)));

    renderOngletsUtilisateurs();
    renderRoles();
  }

  // ---- Rôles et permissions (17/09/2026) --------------------------------
  let ongletUtilisateurs = 'utilisateurs';
  function renderOngletsUtilisateurs() {
    const nav = $('#usersOnglets');
    if (!nav) return;
    const onglets = [['utilisateurs', 'Utilisateurs', 'equipe', state.users.length], ['roles', 'Rôles et permissions', 'bouclier', state.roles.length]];
    nav.innerHTML = boutonsOnglets('data-users-onglet', onglets, ongletUtilisateurs);
    $$('[data-users-panneau]').forEach(panneau => { panneau.hidden = panneau.dataset.usersPanneau !== ongletUtilisateurs; });
    $$('[data-users-onglet]', nav).forEach(bouton => bouton.addEventListener('click', () => { ongletUtilisateurs = bouton.dataset.usersOnglet; renderOngletsUtilisateurs(); }));
  }

  /*
   * Vue des rôles : liste compacte (une ligne par rôle, résumé de ses droits)
   * pour rester lisible quand les rôles se multiplient ; grille comparative
   * permissions × rôles en second affichage. Un clic sur un rôle ouvre ses cases à cocher.
   */
  let vueRoles = 'liste';
  let rechercheRoles = '';
  const SEUIL_RECHERCHE_ROLES = 6;
  function renderRoles() {
    const hote = $('#rolesMatrice');
    if (!hote) return;
    const roles = state.roles || [];
    hote.innerHTML = `<div class="roles-outils">
        <div class="filter-pills" aria-label="Affichage des rôles">${[['liste', 'Liste'], ['grille', 'Grille comparative']].map(([id, libelle]) => `<button type="button" data-roles-vue="${id}" class="${vueRoles === id ? 'active' : ''}" aria-pressed="${vueRoles === id}">${libelle}</button>`).join('')}</div>
        ${roles.length > SEUIL_RECHERCHE_ROLES ? `<label class="admin-search"><span>Rechercher</span><input type="search" data-roles-recherche value="${esc(rechercheRoles)}" placeholder="Nom ou description du rôle"></label>` : ''}
      </div><div data-roles-corps></div>`;
    $$('[data-roles-vue]', hote).forEach(bouton => bouton.addEventListener('click', () => { vueRoles = bouton.dataset.rolesVue; renderRoles(); }));
    $('[data-roles-recherche]', hote)?.addEventListener('input', event => { rechercheRoles = event.target.value; renderCorpsRoles(); });
    renderCorpsRoles();
  }

  function renderCorpsRoles() {
    const corps = $('#rolesMatrice [data-roles-corps]');
    if (!corps) return;
    const catalogue = state.catalogue || [];
    const requete = (state.roles || []).length > SEUIL_RECHERCHE_ROLES ? rechercheRoles.trim().toLocaleLowerCase('fr') : '';
    const roles = (state.roles || []).filter(role => !requete || `${role.label} ${role.description || ''}`.toLocaleLowerCase('fr').includes(requete));
    const utilisateurs = role => `${role.utilisateurs || 0} utilisateur${role.utilisateurs > 1 ? 's' : ''}`;
    if (!roles.length) {
      corps.innerHTML = '<div class="empty">Aucun rôle ne correspond à cette recherche.</div>';
    } else if (vueRoles === 'liste') {
      const total = catalogue.reduce((somme, groupe) => somme + groupe.permissions.length, 0);
      corps.innerHTML = `<div class="content-table roles-liste">${roles.map(role => {
        const accordees = role.permissions || [];
        const groupes = catalogue.map(groupe => {
          const nb = groupe.permissions.filter(([code]) => accordees.includes(code)).length;
          if (!nb) return '';
          const partiel = nb < groupe.permissions.length;
          return `<span class="roles-puce ${partiel ? 'partiel' : ''}" title="${esc(groupe.groupe)} : ${nb} sur ${groupe.permissions.length}">${esc(groupe.groupe)}${partiel ? ` <b>${nb}/${groupe.permissions.length}</b>` : ''}</span>`;
        }).join('');
        const part = total ? Math.round(accordees.length / total * 100) : 0;
        return `<button type="button" class="roles-ligne" data-ouvrir-role="${esc(role.value)}" title="Modifier le rôle ${esc(role.label)}">
          <span class="roles-ligne-nom"><strong>${esc(role.label)}</strong><em class="${role.systeme ? '' : 'cree'}">${role.systeme ? 'Prédéfini' : 'Créé'}</em>${role.description ? `<small>${esc(role.description)}</small>` : ''}</span>
          <span class="roles-ligne-puces">${groupes || '<small>Aucune permission</small>'}</span>
          <span class="roles-ligne-meta"><span class="roles-jauge" aria-hidden="true"><i style="width:${part}%"></i></span><small>${accordees.length}/${total} permissions</small><small>${utilisateurs(role)}</small></span>
          <span class="roles-ligne-fleche" aria-hidden="true">›</span>
        </button>`;
      }).join('')}</div>`;
    } else {
      corps.innerHTML = `<div class="content-table roles-table-cadre"><table class="roles-table">
      <thead><tr><th scope="col">Permission</th>${roles.map(role => `<th scope="col"><button type="button" data-ouvrir-role="${esc(role.value)}" title="Modifier le rôle ${esc(role.label)}"><strong>${esc(role.label)}</strong><small>${utilisateurs(role)}${role.systeme ? '' : ' · créé'}</small></button></th>`).join('')}</tr></thead>
      <tbody>${catalogue.map(groupe => `<tr class="roles-groupe"><th scope="rowgroup" colspan="${roles.length + 1}"><span>${esc(groupe.groupe)}</span></th></tr>${groupe.permissions.map(([code, libelle]) => `<tr><th scope="row">${esc(libelle)}</th>${roles.map(role => { const oui = (role.permissions || []).includes(code); return `<td class="${oui ? 'oui' : 'non'}"><span aria-label="${oui ? 'Autorisé' : 'Non autorisé'}">${oui ? '✓' : '—'}</span></td>`; }).join('')}</tr>`).join('')}`).join('')}</tbody>
    </table></div>`;
    }
    $$('[data-ouvrir-role]', corps).forEach(bouton => bouton.addEventListener('click', () => ouvrirRole(state.roles.find(role => role.value === bouton.dataset.ouvrirRole))));
  }

  function ouvrirRole(role) {
    const vitale = state.permissionVitale || 'users:manage';
    const cochee = code => (role?.permissions || []).includes(code);
    const verrou = code => role?.value === 'proprietaire' && code === vitale;
    // Une seule fiche de rôle à la fois, sinon les cases de l'une s'enregistreraient sous l'autre.
    $$('.role-editor-backdrop').forEach(ancienne => ancienne.remove());
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop role-editor-backdrop"><form class="editor-drawer role-fiche" novalidate><div class="editor-head"><div><span class="eyebrow">${role ? (role.systeme ? 'RÔLE PRÉDÉFINI' : 'RÔLE') : 'NOUVEAU RÔLE'}</span><h2>${role ? esc(role.label) : 'Nouveau rôle'}</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">
      <label>Nom du rôle<input name="libelle" maxlength="60" required value="${esc(role?.label || '')}" placeholder="ex. Comptable, Agent d’accueil"></label>
      <label>Description<input name="description" maxlength="240" value="${esc(role?.description || '')}" placeholder="Ce que fait une personne qui a ce rôle"></label>
      ${role ? `<p class="compta-tracabilite">${role.utilisateurs ? `<strong>${role.utilisateurs}</strong> utilisateur${role.utilisateurs > 1 ? 's ont' : ' a'} ce rôle : ${role.utilisateurs > 1 ? 'leurs' : 'ses'} droits changent dès l’enregistrement.` : 'Aucun utilisateur n’a encore ce rôle.'}</p>` : ''}
      <div class="roles-permissions">${(state.catalogue || []).map((groupe, index) => `<fieldset>
        <legend><span>${esc(groupe.groupe)}</span><label class="roles-tout"><input type="checkbox" data-tout-groupe="${index}"> Tout</label></legend>
        ${groupe.permissions.map(([code, libelle]) => `<label class="roles-case"><input type="checkbox" name="permissions" value="${esc(code)}" data-groupe="${index}" ${cochee(code) || verrou(code) ? 'checked' : ''} ${verrou(code) ? 'disabled' : ''}><span>${esc(libelle)}${verrou(code) ? '<small>Toujours active pour le propriétaire : sans elle, plus personne ne pourrait gérer les accès.</small>' : ''}</span></label>`).join('')}
      </fieldset>`).join('')}</div>
    </div><div class="editor-actions">${role && !role.systeme ? '<button type="button" class="danger" data-supprimer-role>Supprimer</button>' : ''}<button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">${role ? 'Enregistrer' : 'Créer le rôle'}</button></div></form></div>`);
    const fond = document.body.lastElementChild;
    const formulaire = $('form', fond);
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const echap = event => { if (event.key === 'Escape') fermer(); };
    $$('[data-close-editor]', fond).forEach(bouton => bouton.addEventListener('click', fermer));
    fond.addEventListener('click', event => { if (event.target === fond) fermer(); });
    document.addEventListener('keydown', echap);
    // Case « Tout » de chaque groupe : coche ou décoche le groupe, et reflète son état.
    const majTout = index => {
      const cases = $$(`[name="permissions"][data-groupe="${index}"]`, formulaire);
      const tout = $(`[data-tout-groupe="${index}"]`, formulaire);
      const nb = cases.filter(c => c.checked).length;
      tout.checked = nb === cases.length;
      tout.indeterminate = nb > 0 && nb < cases.length;
    };
    $$('[data-tout-groupe]', formulaire).forEach(tout => {
      const index = tout.dataset.toutGroupe;
      tout.addEventListener('change', () => { $$(`[name="permissions"][data-groupe="${index}"]:not(:disabled)`, formulaire).forEach(c => { c.checked = tout.checked; }); majTout(index); });
      $$(`[name="permissions"][data-groupe="${index}"]`, formulaire).forEach(c => c.addEventListener('change', () => majTout(index)));
      majTout(index);
    });
    const recharger = async () => {
      const donnees = await api('/api/admin/users');
      state.users = donnees.users || []; state.roles = donnees.roles || []; state.catalogue = donnees.catalogue || state.catalogue;
      renderUsers();
    };
    formulaire.addEventListener('submit', async event => {
      event.preventDefault();
      if (!formulaire.reportValidity()) return;
      const permissions = $$('[name="permissions"]:checked', formulaire).map(c => c.value);
      const bouton = $('button[type="submit"]', formulaire);
      bouton.disabled = true;
      try {
        await api('/api/admin/roles', { method: 'POST', body: JSON.stringify({ code: role?.value, libelle: formulaire.elements.libelle.value, description: formulaire.elements.description.value, permissions }) });
        fermer(); await recharger();
        toast(role ? 'Rôle mis à jour : droits appliqués aussitôt' : 'Rôle créé');
      } catch (error) { toast(error.message); bouton.disabled = false; }
    });
    $('[data-supprimer-role]', fond)?.addEventListener('click', async () => {
      if (!confirm(`Supprimer le rôle « ${role.label} » ?`)) return;
      try { await api(`/api/admin/roles/${encodeURIComponent(role.value)}`, { method: 'DELETE' }); fermer(); await recharger(); toast('Rôle supprimé'); }
      catch (error) { toast(error.message); }
    });
    $('input', formulaire)?.focus();
  }

  const PERMISSION_LABELS = {
    'dashboard:view':'Vue d’ensemble', 'content:read':'Consulter le contenu', 'content:write':'Modifier villas, terrains, activités',
    'settings:write':'Modifier les réglages du site', 'leads:read':'Consulter les demandes', 'leads:write':'Traiter les demandes',
    'leads:export':'Exporter les demandes', 'newsletter:read':'Consulter la newsletter', 'newsletter:write':'Envoyer des campagnes',
    'facebook:read':'Consulter les publications', 'facebook:write':'Publier sur Facebook', 'backup:manage':'Sauvegardes',
    'audit:read':'Journal d’audit', 'users:manage':'Gérer les utilisateurs', 'compta:manage':'Comptabilité'
  };

  function openUserEditor(id) {
    const user = state.users.find(item => item.id === id) || null;
    const roles = state.roles.length ? state.roles : [
      { value:'proprietaire', label:'Propriétaire' }, { value:'editeur', label:'Éditeur' }, { value:'commercial', label:'Commercial' }
    ];
    const isSelf = user && user.id === state.user?.id;
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop user-editor-backdrop"><form class="editor-drawer"><div class="editor-head"><div><span class="eyebrow">COMPTE</span><h2>${user ? esc(user.username) : 'Nouvel utilisateur'}</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">
      ${user ? '' : '<label>Nom d’utilisateur<input name="username" required minlength="3" maxlength="60" autocapitalize="none" spellcheck="false" placeholder="prenom.nom"></label>'}
      <label>Adresse e-mail<input name="email" type="email" maxlength="180" value="${esc(user?.email || '')}" placeholder="prenom@henri-philippe.com"></label>
      <label>Rôle<select name="role" ${isSelf ? 'disabled' : ''}>${roles.map(role => `<option value="${esc(role.value)}" ${user?.role === role.value ? 'selected' : ''}>${esc(role.label)}</option>`).join('')}</select></label>
      <p class="field-note" id="roleNote"></p>
      ${user ? `<div class="toggle-row"><label><input type="checkbox" name="active" ${user.active ? 'checked' : ''} ${isSelf ? 'disabled' : ''}> Compte actif</label>${user.locked ? '<label><input type="checkbox" name="unlock"> Lever le verrouillage</label>' : ''}</div>` : ''}
      <label>${user ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}<input name="password" type="password" autocomplete="new-password" ${user ? '' : 'required'} minlength="10" placeholder="10 caractères minimum, lettres et chiffres"></label>
      <p class="field-note">Le mot de passe n’est jamais enregistré en clair : seul un condensé scrypt est conservé. Le modifier ferme immédiatement toutes les sessions ouvertes de ce compte.</p>
    </div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">${user ? 'Enregistrer' : 'Créer le compte'}</button></div></form></div>`);

    const backdrop = $('.user-editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKeydown);

    const roleSelect = $('[name="role"]', backdrop);
    const describeRole = () => {
      const role = state.roles.find(item => item.value === roleSelect.value);
      $('#roleNote', backdrop).textContent = role?.description || '';
    };
    roleSelect.addEventListener('change', describeRole);
    describeRole();

    $('.editor-drawer', backdrop).addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try {
        if (!user) {
          await api('/api/admin/users', { method:'POST', body:JSON.stringify({
            username: values.username, email: values.email, role: values.role, password: values.password
          }) });
          toast('Compte créé');
        } else {
          const patch = { email: values.email };
          if (!isSelf) { patch.role = values.role; patch.active = values.active === 'on'; }
          if (values.unlock === 'on') patch.unlock = true;
          await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method:'PATCH', body:JSON.stringify(patch) });
          if (values.password) {
            await api(`/api/admin/users/${encodeURIComponent(user.id)}/mot-de-passe`, { method:'POST', body:JSON.stringify({ password: values.password }) });
            toast('Compte et mot de passe mis à jour');
          } else toast('Compte mis à jour');
        }
        const refreshed = await api('/api/admin/users');
        state.users = refreshed.users || []; state.roles = refreshed.roles || state.roles; state.catalogue = refreshed.catalogue || state.catalogue;
        renderUsers(); close();
      } catch (error) { toast(error.message); }
    });
    $('input, select', backdrop)?.focus();
  }

  async function deleteUser(id) {
    const user = state.users.find(item => item.id === id);
    if (!user) return;
    if (!confirm(`Supprimer définitivement le compte « ${user.username} » ?\n\nSes sessions ouvertes seront fermées immédiatement.`)) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}`, { method:'DELETE' });
      const refreshed = await api('/api/admin/users');
      state.users = refreshed.users || [];
      renderUsers(); toast('Compte supprimé');
    } catch (error) { toast(error.message); }
  }

  function openPasswordEditor() {
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop password-editor-backdrop"><form class="editor-drawer"><div class="editor-head"><div><span class="eyebrow">SÉCURITÉ</span><h2>Changer mon mot de passe</h2></div><button type="button" data-close-editor aria-label="Fermer">×</button></div><div class="editor-fields">
      <label>Mot de passe actuel <small>(facultatif)</small><input name="currentPassword" type="password" autocomplete="current-password"></label>
      <p class="field-note">Vous l’avez oublié ? Laissez ce champ vide : un e-mail d’alerte sera envoyé à l’adresse de votre compte pour signaler le changement.</p>
      <label>Nouveau mot de passe<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required placeholder="10 caractères minimum, lettres et chiffres"></label>
      <label>Confirmez le nouveau mot de passe<input name="confirmation" type="password" autocomplete="new-password" minlength="10" required></label>
      <p class="field-note">Après validation, toutes vos sessions sont fermées : vous devrez vous reconnecter.</p>
    </div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Modifier</button></div></form></div>`);
    const backdrop = $('.password-editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    document.addEventListener('keydown', onKeydown);
    $('.editor-drawer', backdrop).addEventListener('submit', async event => {
      event.preventDefault();
      const { confirmation, ...values } = Object.fromEntries(new FormData(event.currentTarget));
      if (values.newPassword !== confirmation) { toast('Les deux nouveaux mots de passe ne correspondent pas'); return; }
      try {
        await api('/api/auth/mot-de-passe', { method:'POST', body:JSON.stringify(values) });
        close();
        alert('Mot de passe modifié. Reconnectez-vous.');
        location.reload();
      } catch (error) { toast(error.message); }
    });
    $('input', backdrop)?.focus();
  }

  // =========================================================================
  // ONGLET NEWSLETTER
  // =========================================================================
  const SUBSCRIBER_STATUS = { 'en-attente':'En attente', 'confirme':'Confirmé', 'desabonne':'Désabonné' };

  function renderNewsletter() {
    const data = state.newsletter;
    if (!data) return;
    const mail = data.mail || {};
    const queue = mail.queue || {};
    const pending = Number(queue['en-attente'] || 0);
    const failed = Number(queue.echec || 0);
    const ready = mail.configured && mail.driverAvailable;
    const statusLabel = !mail.driverAvailable ? 'Module d’envoi absent'
      : !mail.configured ? 'Messagerie non configurée'
        : mail.lastError ? 'Envoi en difficulté' : 'Messagerie prête';
    const statusText = !mail.driverAvailable
      ? 'Le module nodemailer n’est pas installé sur le serveur. Lancez « Run NPM Install » dans cPanel. En attendant, les inscriptions sont enregistrées et les messages conservés en file d’attente.'
      : !mail.configured
        ? 'Renseignez SMTP_HOST, SMTP_USER et SMTP_PASSWORD dans cPanel. Le site fonctionne normalement en attendant : aucune inscription ni aucune demande n’est perdue.'
        : mail.lastError
          ? `Dernière erreur : ${mail.lastError}`
          : 'Les e-mails partent depuis la boîte du site.';

    $('#mailStatus').className = `mail-status-panel panel${ready && !mail.lastError ? ' connected' : ''}${(!ready || mail.lastError) ? ' has-error' : ''}`;
    $('#mailStatus').innerHTML = `<div class="facebook-status-main"><span class="facebook-status-dot" aria-hidden="true"></span><div><span class="eyebrow">ÉTAT DE LA MESSAGERIE</span><h2>${esc(statusLabel)}</h2><p>${esc(statusText)}</p></div></div>
      <div class="facebook-status-grid">
        <div><small>Serveur SMTP</small><strong>${esc(mail.host || 'non renseigné')}${mail.host ? `:${mail.port}` : ''}</strong></div>
        <div><small>Expéditeur</small><strong>${esc(mail.from || '—')}</strong></div>
        <div><small>Notifications vers</small><strong>${esc(mail.notifyTo || '—')}</strong></div>
        <div><small>Messages en attente</small><strong>${pending}</strong></div>
        <div><small>Échecs définitifs</small><strong>${failed}</strong></div>
        <div><small>Envoyés</small><strong>${Number(queue.envoye || 0)}</strong></div>
      </div>
      <div class="mail-actions">
        <button type="button" id="mailTestBtn">Envoyer un message de test</button>
        <button type="button" id="mailFlushBtn" ${pending ? '' : 'disabled'}>Relancer la file (${pending})</button>
      </div>`;
    $('#mailTestBtn').addEventListener('click', sendMailTest);
    $('#mailFlushBtn').addEventListener('click', flushMailQueue);

    // Alerte de stockage dégradé : la base a refusé une inscription et
    // l'adresse a été sauvée en fichier. Le taire laisserait croire que tout
    // va bien alors que les abonnés récents ne sont pas dans MySQL.
    const degraded = data.degradedWrite;
    if (degraded) {
      $('#mailStatus').insertAdjacentHTML('beforeend',
        `<p class="mail-degraded" style="margin-top:12px;padding:12px;border-radius:8px;background:#fdecea;color:#8a1c12;">
          <strong>Stockage dégradé.</strong> La base a refusé l’enregistrement de
          ${esc(degraded.email || 'une inscription')} le ${esc(new Date(degraded.at).toLocaleString('fr-FR'))}.
          L’adresse est conservée dans le fichier du serveur — rien n’est perdu —
          mais elle n’est pas dans MySQL. Faites exécuter « npm run migrate » pour
          créer les tables manquantes. Détail : ${esc(degraded.error || '')}
        </p>`);
    }

    const counters = data.counters || {};
    $('#newsletterKpis').innerHTML = [
      ['Abonnés confirmés', counters.confirme || 0, 'Destinataires des campagnes'],
      ['En attente', counters['en-attente'] || 0, 'Confirmation non cliquée'],
      ['Désabonnés', counters.desabonne || 0, 'Ne reçoivent plus rien']
    ].map(card => `<article class="kpi-card"><small>${card[0]}</small><strong>${card[1]}</strong><em>${card[2]}</em></article>`).join('');

    $('#campaignHint').textContent = (counters.confirme || 0)
      ? `${counters.confirme} destinataire(s) confirmé(s)${ready ? '' : ' — sans SMTP, l’envoi sera mis en file d’attente'}`
      : 'Aucun abonné confirmé pour le moment.';

    renderSubscribers();
    renderCampaigns();
  }

  function renderSubscribers() {
    const list = state.newsletter?.subscribers || [];
    const query = state.subscriberSearch.trim().toLocaleLowerCase('fr');
    const items = list
      .filter(item => state.subscriberFilter === 'all' || item.status === state.subscriberFilter)
      .filter(item => !query || `${item.email} ${item.name}`.toLocaleLowerCase('fr').includes(query));
    const head = '<div class="table-row subscribers-grid-row header"><span>Adresse</span><span>Inscription</span><span>Origine</span><span>Statut</span><span>Action</span></div>';
    $('#subscribersTable').innerHTML = items.length ? head + items.map(item => `<div class="table-row subscribers-grid-row">
      <div class="table-title"><strong>${esc(item.email)}</strong><small>${esc([item.name, item.phone].filter(Boolean).join(' · '))}</small></div>
      <div>${formatDate(item.createdAt)}</div>
      <div><small>${esc(item.source || 'site')}</small></div>
      <div><span class="status ${item.status === 'confirme' ? 'disponible' : item.status === 'desabonne' ? 'vendu' : 'reserve'}">${esc(SUBSCRIBER_STATUS[item.status] || item.status)}</span></div>
      <div class="row-actions">${item.status === 'desabonne'
        ? `<button title="Réactiver" data-subscriber-status="confirme" data-id="${esc(item.id)}">↺</button>`
        : `<button title="Désabonner" data-subscriber-status="desabonne" data-id="${esc(item.id)}">⊘</button>`}
        <button title="Supprimer" data-subscriber-delete="${esc(item.id)}">×</button></div>
    </div>`).join('') : head + '<div class="empty">Aucun abonné ne correspond à ce filtre.</div>';

    $$('[data-subscriber-status]').forEach(button => button.addEventListener('click', async () => {
      try {
        await api(`/api/admin/newsletter/abonnes/${encodeURIComponent(button.dataset.id)}`, { method:'PATCH', body:JSON.stringify({ status: button.dataset.subscriberStatus }) });
        state.newsletter = await api('/api/admin/newsletter');
        renderNewsletter(); toast('Statut de l’abonné mis à jour');
      } catch (error) { toast(error.message); }
    }));
    $$('[data-subscriber-delete]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement cet abonné de la liste ?')) return;
      try {
        await api(`/api/admin/newsletter/abonnes/${encodeURIComponent(button.dataset.subscriberDelete)}`, { method:'DELETE' });
        state.newsletter = await api('/api/admin/newsletter');
        renderNewsletter(); toast('Abonné supprimé');
      } catch (error) { toast(error.message); }
    }));
  }

  function renderCampaigns() {
    const campaigns = state.newsletter?.campaigns || [];
    $('#campaignList').innerHTML = campaigns.length ? campaigns.map(item => `<div class="lead-mini">
      <div><strong>${esc(item.subject)}</strong><br><small>${esc(item.preview || '')}</small><br><small>${item.sentAt ? formatDateTime(item.sentAt) : formatDateTime(item.createdAt)} · ${esc(item.createdBy || '')}</small></div>
      <span class="status ${item.status === 'envoye' ? 'disponible' : item.status === 'erreur' ? 'vendu' : 'reserve'}">${esc(item.status)} · ${item.sentCount}</span>
    </div>`).join('') : '<div class="empty">Aucune campagne pour le moment.</div>';
  }

  async function sendCampaign() {
    const subject = $('#campaignSubject').value.trim();
    const bodyText = $('#campaignBody').value.trim();
    if (!subject || !bodyText) { toast('Renseignez un objet et un message.'); return; }
    const confirmed = state.newsletter?.counters?.confirme || 0;
    if (!confirm(`Envoyer « ${subject} » à ${confirmed} abonné(s) confirmé(s) ?\n\nCette action est irréversible.`)) return;
    const button = $('#campaignSendBtn');
    button.disabled = true; button.textContent = 'Envoi en cours…';
    try {
      const created = await api('/api/admin/newsletter/campagnes', { method:'POST', body:JSON.stringify({ subject, bodyText }) });
      const result = await api(`/api/admin/newsletter/campagnes/${encodeURIComponent(created.campaign.id)}/envoyer`, { method:'POST', body:'{}' });
      const report = result.report;
      $('#campaignReport').hidden = false;
      $('#campaignReport').className = `campaign-report ${report.sent === report.recipients ? 'ok' : 'attention'}`;
      $('#campaignReport').innerHTML = `<strong>${esc(report.message)}</strong>
        <ul><li>Destinataires : ${report.recipients}</li><li>Envoyés : ${report.sent}</li><li>En file d’attente : ${report.queued}</li><li>Lots de ${report.batchSize} message(s)</li></ul>
        ${report.failures?.length ? `<small>Premiers échecs : ${report.failures.map(item => `${esc(item.email)} (${esc(item.error || 'inconnu')})`).join(', ')}</small>` : ''}`;
      if (report.sent) { $('#campaignSubject').value = ''; $('#campaignBody').value = ''; }
      state.newsletter = await api('/api/admin/newsletter');
      renderNewsletter();
      toast(report.message);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = 'Envoyer aux abonnés confirmés'; }
  }

  async function sendMailTest() {
    const email = prompt('Adresse à laquelle envoyer le message de test :', state.newsletter?.mail?.notifyTo || '');
    if (!email) return;
    try {
      const result = await api('/api/admin/newsletter/test', { method:'POST', body:JSON.stringify({ email }) });
      toast(result.ok ? `Message de test envoyé à ${email}` : `Envoi impossible : ${result.result?.error || result.connection?.error || 'erreur inconnue'}`);
      state.newsletter = await api('/api/admin/newsletter');
      renderNewsletter();
    } catch (error) { toast(error.message); }
  }

  async function flushMailQueue() {
    try {
      const result = await api('/api/admin/newsletter/file/relancer', { method:'POST', body:'{}' });
      toast(result.report.error || `${result.report.sent} message(s) envoyé(s), ${result.report.failed} échec(s)`);
      state.newsletter = await api('/api/admin/newsletter');
      renderNewsletter();
    } catch (error) { toast(error.message); }
  }

  async function exportSubscribers() {
    const response = await fetch(`/api/admin/newsletter/export?status=${encodeURIComponent(state.subscriberFilter)}`, { credentials:'same-origin' });
    if (!response.ok) { toast('Export impossible'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href:url, download:'newsletter-abonnes.csv' });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Abonnés exportés');
  }

  function toast(message) { const el=$('#adminToast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3200); }
  function formatDate(value) { if(!value) return '—'; try{return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));}catch{return '—';} }
  function formatDateTime(value) { if(!value) return '—'; try{return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return '—';} }
})();
