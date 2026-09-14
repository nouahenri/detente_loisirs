(function () {
  // L'authentification repose désormais sur un cookie de session HttpOnly posé
  // par le serveur : le navigateur l'envoie tout seul et le JavaScript de cette
  // page ne peut pas le lire. Plus aucun secret ne transite par sessionStorage,
  // où n'importe quel script tiers pourrait le récupérer.
  const state = {
    user: null,
    content: { villas: [], terrains: [], activities: [], reviews: [], faq: [], settings: {}, facebookPosts: [] },
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
    $('#keyForm').addEventListener('submit', event => {
      event.preventDefault();
      login({ key: $('#adminKey').value });
    });
    $('#logoutBtn').addEventListener('click', logout);
    $('#passwordBtn').addEventListener('click', openPasswordEditor);
    $('#newUserBtn').addEventListener('click', () => openUserEditor());
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

  /** Au chargement : le serveur dit qui nous sommes (ou que personne n'est connecté). */
  async function restoreSession() {
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
      if (!can(button.dataset.permission)) button.remove();
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

  async function loadAll() {
    // Chaque appel est conditionné à la permission correspondante : un rôle
    // restreint ne déclenche même pas la requête (et donc aucun 403 inutile).
    const [managed, leads, facebook, backups, audit, dashboard, users, newsletter] = await Promise.all([
      fetch('/api/content', { cache:'no-store' }).then(r => r.json()).catch(() => ({})),
      can('leads:read') ? api('/api/admin/leads').catch(() => ({ leads:[] })) : Promise.resolve({ leads:[] }),
      can('facebook:read') ? api('/api/admin/facebook/posts').catch(error => ({ connected:false, posts:[], error:error.message })) : Promise.resolve(null),
      can('backup:manage') ? api('/api/admin/backups').catch(() => ({ backups:[] })) : Promise.resolve({ backups:[] }),
      can('audit:read') ? api('/api/admin/audit').catch(() => ({ entries:[] })) : Promise.resolve({ entries:[] }),
      api('/api/admin/dashboard').catch(() => null),
      can('users:manage') ? api('/api/admin/users').catch(() => ({ users:[], roles:[] })) : Promise.resolve(null),
      can('newsletter:read') ? api('/api/admin/newsletter').catch(() => null) : Promise.resolve(null)
    ]);
    if (dashboard) state.dashboard = dashboard;
    if (users) { state.users = users.users || []; state.roles = users.roles || []; }
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
      reviews: managed.reviews?.length ? managed.reviews : structuredClone(REVIEWS_DATA),
      faq: managed.faq?.length ? managed.faq : structuredClone(FAQ_DATA),
      settings: managed.settings || { heroTitle:'Là où vos rêves prennent vie', heroSubtitle:"Des villas d’exception entre lagune et océan, pensées pour vos plus beaux souvenirs.", phone:CONTACT_CONFIG.phone, facebookPage:CONTACT_CONFIG.facebookPage },
      facebookPosts: managed.facebookPosts || []
    };
    state.leads = leads.leads || [];
    state.backups = backups.backups || [];
    state.audit = audit.entries || [];
    state.facebook = facebook;
    renderDashboard(); renderOperations();
    if (can('content:write')) { renderVillas(); renderTerrains(); renderActivities(); renderSettings(); renderReferentiels(); }
    if (can('leads:read')) { renderLeads(); chargerMessages(); }
    if (can('facebook:read') && facebook) renderFacebook(facebook);
    if (can('users:manage')) renderUsers();
    if (can('newsletter:read')) renderNewsletter();
  }

  const VIEW_TITLES = {
    dashboard:['PILOTAGE','Vue d’ensemble'], villas:['HÉBERGEMENTS','Villas'],
    terrains:['VENTE DE TERRAIN','Terrains'], activities:['EXPÉRIENCES','Activités & loisirs'],
    referentiels:['LISTES DE CHOIX','Référentiels'],
    leads:['RELATION CLIENT','Demandes'], messages:['RELATION CLIENT','Messages WhatsApp'], newsletter:['RELATION CLIENT','Newsletter'],
    facebook:['SOCIAL STUDIO','Publications'], users:['SÉCURITÉ','Utilisateurs'],
    settings:['SITE PUBLIC','Réglages']
  };

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
    // Les contacts viennent des demandes : on relit à chaque ouverture.
    if (name === 'messages' && can('leads:read')) chargerMessages();
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

  function renderVillas() {
    const head = '<div class="table-row header"><span>Visuel</span><span>Villa</span><span>Tarif / nuit</span><span>Capacité</span><span>Catégorie</span><span>Action</span></div>';
    $('#villasTable').innerHTML = head + state.content.villas.map(item => `<div class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || '')}" alt=""><div class="table-title"><strong>${esc(item.name)}</strong><small>${esc(item.location)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉE DU SITE</span>':''}</div><div class="table-cell"><strong>${money(item.pricePerNight)}</strong></div><div>${item.capacity} pers.</div><div><span class="status">${esc(item.categoryLabel || item.category)}</span></div><div class="row-actions"><button title="Modifier" data-edit-villa="${esc(item.id)}">✎</button><button title="Supprimer" data-delete-villa="${esc(item.id)}">×</button></div></div>`).join('');
    $$('[data-edit-villa]').forEach(button => button.addEventListener('click', () => openEditor('villa', button.dataset.editVilla)));
    $$('[data-delete-villa]').forEach(button => button.addEventListener('click', () => { if (confirm('Retirer cette villa du catalogue ?')) { state.content.villas = state.content.villas.filter(v => v.id !== button.dataset.deleteVilla); dirty(); renderVillas(); } }));
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
    $('#terrainsTable').innerHTML = state.content.terrains.length
      ? head + state.content.terrains.map(item => `<div class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || '')}" alt=""><div class="table-title"><strong>${esc(item.title)}</strong><small>${esc(item.reference)} · ${esc(item.location)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉ DU SITE</span>' : item.status === 'vendu' ? '<span class="visibility-note">VENDU — RETIRÉ DU SITE</span>' : ''}</div><div>${new Intl.NumberFormat('fr-FR').format(Number(item.areaSqm || 0))} m²</div><div class="table-cell"><strong>${money(item.priceTotal)}</strong><small>${money(perSqm(item))} / m²</small></div><div><span class="status ${esc(item.status)}">${esc(libelleStatut('terrain', item.status) || TERRAIN_STATUS[item.status] || item.status)}</span></div><div class="row-actions"><button title="Modifier" data-edit-terrain="${esc(item.id)}">✎</button><button title="Supprimer" data-delete-terrain="${esc(item.id)}">×</button></div></div>`).join('')
      : head + '<div class="empty">Aucun terrain enregistré. Cliquez sur « Ajouter un terrain » pour publier votre première parcelle.</div>';
    $$('[data-edit-terrain]').forEach(button => button.addEventListener('click', () => openEditor('terrain', button.dataset.editTerrain)));
    $$('[data-delete-terrain]').forEach(button => button.addEventListener('click', () => { if (confirm('Retirer ce terrain du catalogue ?')) { state.content.terrains = state.content.terrains.filter(v => v.id !== button.dataset.deleteTerrain); dirty(); renderTerrains(); } }));
  }

  function renderActivities() {
    const head = '<div class="table-row header"><span>Visuel</span><span>Activité</span><span>Tarif</span><span>Durée</span><span>Badge</span><span>Action</span></div>';
    $('#activitiesTable').innerHTML = head + state.content.activities.map(item => `<div class="table-row ${item.visible === false ? 'is-hidden':''}"><img src="${esc(item.images?.[0] || item.image || '')}" alt=""><div class="table-title"><strong>${esc(item.title)}</strong><small>${esc(item.subtitle)}</small>${item.visible === false ? '<span class="visibility-note">MASQUÉE DU SITE</span>':''}</div><div>${esc(item.price)}</div><div>${esc(item.duration)}</div><div><span class="status">${esc(item.badge)}</span></div><div class="row-actions"><button data-edit-activity="${esc(item.id)}">✎</button><button data-delete-activity="${esc(item.id)}">×</button></div></div>`).join('');
    $$('[data-edit-activity]').forEach(button => button.addEventListener('click', () => openEditor('activity', button.dataset.editActivity)));
    $$('[data-delete-activity]').forEach(button => button.addEventListener('click', () => { if (confirm('Retirer cette activité ?')) { state.content.activities = state.content.activities.filter(v => v.id !== button.dataset.deleteActivity); dirty(); renderActivities(); } }));
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

  function renderLeads() {
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
          <div class="lead-item-top"><strong>${esc(lead.name || lead.email || 'Visiteur')}</strong><span class="lead-type">${esc(d.formule)}</span><time datetime="${esc(lead.createdAt || '')}">${formatDate(lead.createdAt)}</time></div>
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
    const formules = { 'devis-whatsapp': 'Séjour', 'devis-activites': 'Activités', devis: 'Devis', terrain: 'Terrain', villa: 'Résidence', contact: 'Contact', newsletter: 'Newsletter' };
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
      <section class="lead-contact-card"><strong>${esc(lead.name || 'Nom non renseigné')}</strong><small>${esc(lead.phone || 'Téléphone non renseigné')}</small><small>${esc(lead.email || 'E-mail non renseigné')}</small>${actions ? `<div class="lead-actions">${actions}</div>` : ''}</section>
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
    </div><div class="editor-actions"><button type="button" data-close-editor>Fermer</button><button class="primary" type="submit">Enregistrer le suivi</button></div></form></div>`);
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
    // Focus sur « Fermer » : la fiche s'ouvre en haut, sur le client, et
    // Échap ou Entrée la referment sans rien modifier.
    $('.editor-head [data-close-editor]', backdrop)?.focus();
  }

  // ===== Messages WhatsApp promotionnels ===================================
  // Envoi par liens wa.me : le serveur prépare, pour chaque destinataire, le
  // lien avec le message personnalisé (db/whatsapp-promo.js). Destinataires :
  // clients ayant coché l'accord dans le simulateur, hors « ne plus contacter ».
  let chargementMessages = null;
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
    const list = isVilla ? state.content.villas : isTerrain ? state.content.terrains : state.content.activities;
    const source = list.find(item => item.id === id) || {};
    const data = structuredClone(source);
    let gallery = ((isVilla || isTerrain)
      ? (Array.isArray(data.images) ? data.images : [])
      : (Array.isArray(data.images) && data.images.length ? data.images : [data.image])).filter(Boolean);
    const heading = isVilla ? 'Villa' : isTerrain ? 'Terrain' : 'Activité';
    const fields = isVilla ? villaFields(data) : isTerrain ? terrainFields(data) : activityFields(data);
    document.body.insertAdjacentHTML('beforeend', `<div class="editor-backdrop"><form class="editor-drawer"><div class="editor-head"><div><span class="eyebrow">${id ? 'MODIFICATION':'NOUVEAU CONTENU'}</span><h2>${heading}</h2></div><button type="button" data-close-editor>×</button></div><div class="editor-fields">${fields}</div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form></div>`);
    const backdrop = $('.editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', onKeydown);
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
    if (!isVilla && !isTerrain) {
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
        : normalizeActivity(values, data, gallery);
      item.translations = lireTraductions(form, isVilla ? 'villa' : isTerrain ? 'terrain' : 'activity');
      if (!isVilla && !isTerrain) item.price = texteTarifActivite(item);
      const index = list.findIndex(existing => existing.id === id);
      if (index >= 0) list[index] = item; else list.unshift(item);
      dirty();
      if (isVilla) renderVillas(); else if (isTerrain) renderTerrains(); else renderActivities();
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
   * Case « Publier aussi sur Facebook ».
   * Le sens site → Facebook n'est JAMAIS automatique : rien ne part vers la
   * Page sans cette case explicitement cochée. Garde anti-boucle : une fiche
   * importée depuis Facebook ne peut pas y être renvoyée.
   */
  function shareToFacebookField(item, kind) {
    const fromFacebook = item.source === 'facebook' || Boolean(item.facebookOriginId);
    const connected = Boolean(state.facebook?.connected);
    // Déjà sur la Page (journal des publications, voir fichesPubliees dans
    // server.js) : case cochée et verrouillée, pour ne pas publier deux fois
    // la même annonce. Supprimer la publication sur Facebook la libère.
    const publiee = kind ? state.facebook?.fichesPubliees?.[`${kind}:${item.id}`] : null;
    if (publiee) {
      const date = publiee.publieeLe ? ` le ${formatDate(publiee.publieeLe)}` : '';
      const voir = publiee.lien ? ` · <a href="${esc(publiee.lien)}" target="_blank" rel="noopener">voir</a>` : '';
      return `<label class="share-fb publiee" title="Pour la republier, supprimez d’abord la publication sur Facebook."><input type="checkbox" checked tabindex="-1" aria-disabled="true"> Publier aussi sur Facebook <small>(déjà publiée${esc(date)}${voir})</small></label>`;
    }
    if (fromFacebook) return `<label class="share-fb blocked" title="Contenu importé depuis Facebook : republication bloquée pour éviter une boucle."><input type="checkbox" disabled> Publier aussi sur Facebook <small>(bloqué : contenu importé de Facebook)</small></label>`;
    if (!connected) return `<label class="share-fb blocked" title="Configurez la connexion Meta pour activer cette option."><input type="checkbox" disabled> Publier aussi sur Facebook <small>(connexion Meta requise)</small></label>`;
    return `<label class="share-fb"><input type="checkbox" name="shareToFacebook" value="yes" ${item.shareToFacebook ? 'checked':''}> Publier aussi sur Facebook <small>(à la prochaine publication)</small></label>`;
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
    badges: 'Badges', statuts: 'Statuts'
  };
  const refs = () => state.referentiels || { localisations: [], categories: [], equipements: [], badges: [], statuts: [] };
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

  function casesEquipements(cochees) {
    const liste = Array.isArray(cochees) ? cochees : [];
    const entrees = refs().equipements.filter(entree => entree.actif !== false || liste.includes(entree.id));
    if (!entrees.length) return '';
    return `<fieldset class="toggle-row equipements-row"><legend>Équipements (servent aux filtres du site)</legend>${entrees.map(entree => `<label><input type="checkbox" name="equipements" value="${esc(entree.id)}" ${liste.includes(entree.id) ? 'checked' : ''}> ${esc(libelleRef(entree))}</label>`).join('')}</fieldset>`;
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
      ['description', 'Description', 'texte', 8000], ['pricePrefix', 'Mention avant le prix', 'ligne', 80], ['priceSuffix', 'Précision après le prix', 'ligne', 80]]
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
      shareToFacebook: v.shareToFacebook === 'yes',
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
  function normalizeVilla(v, old, gallery) { const price = Number(v.pricePerNight || 0); return { ...old, shareToFacebook: v.shareToFacebook === 'yes', id:v.id.trim().toLowerCase(), name:v.name.trim(), category:v.category, categoryLabel: libelleRef(trouverRef('categories', v.category)) || v.category, environment: CADRES_VILLA.some(c => c.value === v.environment) ? v.environment : cadreDeVilla({ ...old, ...v }), status:v.status, visible:v.visible==='yes', featured:v.featured==='yes', badgeId: v.badgeId || '', badge: libelleRef(trouverRef('badges', v.badgeId)), localisationId: v.localisationId || '', localisationPrecision: v.localisationId ? String(v.localisationPrecision || '').trim() : '', location: adresseAffichee(v.localisationId, v.localisationPrecision, old.location), equipements: Array.isArray(v.equipements) ? v.equipements : [], pricePerNight:price, priceEuro:Math.round(price/655.957), weekendPackage:Number(v.weekendPackage || 0), capacity:Number(v.capacity), bedrooms:Number(v.bedrooms), bathrooms:Number(v.bathrooms), beds:v.beds, tagline:v.tagline, description:v.description, images:gallery.slice(0,12), features:lines(v.features), highlights:lines(v.highlights), rating:old.rating || 5, reviewsCount:old.reviewsCount || 0 }; }
  function normalizeActivity(v, old, gallery) { return { ...old, shareToFacebook: v.shareToFacebook === 'yes', id:v.id.trim().toLowerCase(), title:v.title.trim(), badgeId: v.badgeId || '', badge: libelleRef(trouverRef('badges', v.badgeId)), duration:v.duration, pricePrefix: String(v.pricePrefix || '').trim(), priceSuffix: String(v.priceSuffix || '').trim(), priceAmount: Number(v.priceAmount) || 0, priceUnit: ['forfait','jour','personne'].includes(v.priceUnit) ? v.priceUnit : 'forfait', groupPriceAmount: Number(v.groupPriceAmount) || 0, groupSize: Number(v.groupSize) || 0, subtitle:v.subtitle, description:v.description, visible:v.visible==='yes', featured:v.featured==='yes', image:gallery[0] || '', images:gallery.slice(0,12) }; }
  function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`)); reader.readAsDataURL(file); }); }
  async function uploadMedia(file) { return api('/api/admin/media', { method:'POST', body:JSON.stringify({ filename:file.name, mimeType:file.type, data:await fileAsDataUrl(file) }) }); }

  function renderSettings() {
    const s = state.content.settings;
    $('#settingsForm').innerHTML = `<span class="eyebrow">IDENTITÉ DU SITE</span><h2>Textes et coordonnées</h2><div class="form-grid"><label class="wide">Titre du hero<input name="heroTitle" maxlength="180" value="${esc(s.heroTitle)}"></label><label class="wide">Sous-titre du hero<textarea name="heroSubtitle" maxlength="500" rows="3">${esc(s.heroSubtitle)}</textarea></label><label>Téléphone<input name="phone" value="${esc(s.phone || CONTACT_CONFIG.phone)}"></label><label>Page Facebook<input type="url" name="facebookPage" value="${esc(s.facebookPage || CONTACT_CONFIG.facebookPage)}"></label><label>Horaires<input name="officeHours" value="${esc(s.officeHours || '7j/7 · 7h–22h')}"></label><label>Devise<input name="currency" maxlength="20" value="${esc(s.currency || 'FCFA')}"></label></div><label class="wide champ-bascule"><input type="checkbox" name="facebookAutoPublish" id="reglageFacebookAuto" ${s.facebookAutoPublish ? "checked" : ""}><span><strong>Publier automatiquement les nouvelles fiches sur la Page Facebook</strong><em>Seules les fiches ajoutées après activation partent, cinq au maximum par publication. Les fiches déjà en ligne ne seront pas republiées.</em></span></label><p>Ces réglages sont appliqués au prochain clic sur « Publier les changements ».</p>`;
  }
  function captureSettings() {
    state.content.settings = { ...state.content.settings, ...Object.fromEntries(new FormData($('#settingsForm'))) };
    // FormData omet purement et simplement une case décochée : sans lecture
    // directe, désactiver le relais automatique ne serait jamais enregistré,
    // la valeur vraie précédente survivant à la fusion ci-dessus.
    const bascule = $('#reglageFacebookAuto');
    if (bascule) state.content.settings.facebookAutoPublish = bascule.checked;
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
    captureSettings();
    const button = $('#saveAllBtn');
    button.disabled = true; button.textContent = 'Vérification…';
    try {
      const validation = await api('/api/admin/content/validate',{method:'POST',body:JSON.stringify(state.content)});
      button.textContent = 'Publication…';

      // Fiches explicitement cochées « Publier aussi sur Facebook ».
      const share = [
        ...state.content.villas.filter(item => item.shareToFacebook).map(item => ({ kind:'villa', id:item.id, label:item.name })),
        ...state.content.terrains.filter(item => item.shareToFacebook).map(item => ({ kind:'terrain', id:item.id, label:`${item.reference} — ${item.title}` })),
        ...state.content.activities.filter(item => item.shareToFacebook).map(item => ({ kind:'activity', id:item.id, label:item.title }))
      ];
      if (share.length && !confirm(`Publier aussi ${share.length} fiche(s) sur la Page Facebook officielle ?\n\n· ${share.map(entry => entry.label).join('\n· ')}`)) {
        button.disabled = false; button.textContent = 'Publier les changements'; return;
      }
      const body = { ...state.content, facebookShare: share.length ? { enabled:true, items:share.map(({ kind, id }) => ({ kind, id })) } : undefined };
      const published = await api('/api/admin/content',{method:'POST',body:JSON.stringify(body)});

      // Le drapeau est à usage unique : on le retire après envoi pour ne pas
      // republier la même fiche à chaque publication suivante.
      ['villas','terrains','activities'].forEach(key => state.content[key].forEach(item => { delete item.shareToFacebook; }));
      const fbAuto = published.facebookAuto;
      if (fbAuto?.enabled) {
        if (fbAuto.amorce) toast(`Relais automatique armé : ${fbAuto.amorce} fiche(s) existante(s) enregistrée(s) sans republication.`);
        else if (fbAuto.published) toast(`${fbAuto.published} nouvelle(s) fiche(s) publiée(s) automatiquement sur Facebook`);
        if (fbAuto.pending) toast(`${fbAuto.pending} fiche(s) partiront à la prochaine publication (plafond de 5).`);
        (fbAuto.errors || []).forEach(message => { console.warn('Facebook auto :', message); toast(`Facebook auto : ${message}`); });
      }
      const fbResult = published.facebookShare;
      if (fbResult?.requested) {
        if (fbResult.published) toast(`${fbResult.published} fiche(s) publiée(s) sur Facebook`);
        (fbResult.errors || []).forEach(message => console.warn('Facebook :', message));
        if (fbResult.blocked?.length) toast(`${fbResult.blocked.length} fiche(s) non republiée(s) : contenu importé de Facebook`);
        if (fbResult.dejaPubliees?.length) toast(`${fbResult.dejaPubliees.length} fiche(s) déjà publiée(s) sur Facebook : non renvoyée(s)`);
        if (!fbResult.published && fbResult.errors?.length) toast(`Facebook : ${fbResult.errors[0]}`);
      }
      // Les fiches qui viennent de partir verrouillent aussitôt leur case,
      // sans attendre le rechargement de l'état Facebook.
      const parties = [...(fbResult?.results || []), ...(fbAuto?.results || [])].filter(entree => entree.facebookId);
      if (parties.length && state.facebook) {
        state.facebook.fichesPubliees = { ...(state.facebook.fichesPubliees || {}) };
        parties.forEach(entree => {
          const cle = `${entree.kind}:${entree.id}`;
          if (!state.facebook.fichesPubliees[cle]) state.facebook.fichesPubliees[cle] = { facebookId: entree.facebookId, publieeLe: new Date().toISOString(), lien: '' };
        });
      }
      if (fbResult?.requested || parties.length) {
        renderVillas(); renderTerrains(); renderActivities();
        // Puis l'état réel (lien de la publication) une fois la synchronisation passée.
        setTimeout(() => api('/api/admin/facebook/posts').then(data => { state.facebook = data; }).catch(() => {}), 8000);
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
      if (!enBase) toast('Publié en fichiers uniquement : la base de données n’a PAS été mise à jour. Prévenez l’hébergeur.');
      else toast(validation.warnings?.length ? `Publié en base · ${validation.warnings.length} point(s) à surveiller` : 'Publié et enregistré en base de données');
    } catch(error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = 'Publier les changements'; }
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

    $('#rolesGrid').innerHTML = (state.roles || []).map(role => `<article class="role-card">
      <strong>${esc(role.label)}</strong>
      <p>${esc(role.description)}</p>
      <ul>${(role.permissions || []).map(permission => `<li>${esc(PERMISSION_LABELS[permission] || permission)}</li>`).join('')}</ul>
    </article>`).join('');
  }

  const PERMISSION_LABELS = {
    'dashboard:view':'Vue d’ensemble', 'content:read':'Consulter le contenu', 'content:write':'Modifier villas, terrains, activités',
    'settings:write':'Modifier les réglages du site', 'leads:read':'Consulter les demandes', 'leads:write':'Traiter les demandes',
    'leads:export':'Exporter les demandes', 'newsletter:read':'Consulter la newsletter', 'newsletter:write':'Envoyer des campagnes',
    'facebook:read':'Consulter les publications', 'facebook:write':'Publier sur Facebook', 'backup:manage':'Sauvegardes',
    'audit:read':'Journal d’audit', 'users:manage':'Gérer les utilisateurs'
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
        state.users = refreshed.users || []; state.roles = refreshed.roles || state.roles;
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
      <label>Mot de passe actuel<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>Nouveau mot de passe<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required placeholder="10 caractères minimum, lettres et chiffres"></label>
      <p class="field-note">Après validation, toutes vos sessions sont fermées : vous devrez vous reconnecter.</p>
    </div><div class="editor-actions"><button type="button" data-close-editor>Annuler</button><button class="primary" type="submit">Modifier</button></div></form></div>`);
    const backdrop = $('.password-editor-backdrop');
    const close = () => { document.removeEventListener('keydown', onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === 'Escape') close(); };
    $$('[data-close-editor]', backdrop).forEach(button => button.addEventListener('click', close));
    document.addEventListener('keydown', onKeydown);
    $('.editor-drawer', backdrop).addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
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
