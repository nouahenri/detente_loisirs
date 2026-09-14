/**
 * Catalogue unifié — résidences, terrains à vendre et publications de la Page.
 *
 * Demande du 12/09/2026 : « toutes les annonces publiées depuis Facebook
 * doivent apparaître aussi dans le catalogue des annonces, ainsi que tous les
 * terrains à vendre, par section de catégorisation et filtre de recherche ».
 *
 * Le module ne rend RIEN lui-même : les trois grilles sont peuplées par
 * js/app.js (villas, terrains) et js/premium.js (publications). Il se contente
 * de les coiffer — rubriques, recherche transversale, compteurs — en filtrant
 * les cartes déjà posées dans le DOM. C'est délibéré : dupliquer la logique de
 * rendu aurait créé deux vérités à maintenir, et les filtres propres à chaque
 * rubrique (catégorie de villa, statut foncier, superficie) continuent de
 * fonctionner exactement comme avant.
 */
(function () {
  const catalogue = document.getElementById('catalogSection');
  if (!catalogue || !catalogue.dataset.catalogueUnifie) return;

  const $ = (selecteur, racine = catalogue) => racine.querySelector(selecteur);
  const $$ = (selecteur, racine = catalogue) => [...racine.querySelectorAll(selecteur)];

  const champRecherche = $('#catalogueRecherche');
  const boutonEffacer = $('#catalogueEffacer');
  const resultat = $('#catalogueResultat');
  const blocCriteres = $('#catalogueCriteres');
  const vide = $('#catalogueVide');
  const sections = $$('.catalogue-section');

  /**
   * Critères de la recherche multicritère venue de l'accueil, ou null.
   * Les règles vivent dans js/app.js (correspondRecherche), les mêmes que
   * pour les villas : ce module ne fait que les appliquer aux publications,
   * que js/app.js ne rend pas.
   */
  function criteresEnCours() {
    if (typeof rechercheMulticritereActive !== 'function' || !rechercheMulticritereActive()) return null;
    const criteres = lireCriteresRecherche();
    return Object.values(criteres).some(valeur => valeur !== 'all') ? criteres : null;
  }

  /** Fiche du bien portée par une carte de publication (js/premium.js). */
  function ficheDeCarte(carte) {
    try { return JSON.parse(carte.dataset.fiche || '{}'); } catch { return {}; }
  }

  function afficherCriteres(criteres) {
    if (!blocCriteres) return;
    const libelles = criteres ? libellesCriteresRecherche(criteres) : [];
    blocCriteres.hidden = !libelles.length;
    if (!libelles.length) return;
    $('[data-criteres-intitule]', blocCriteres).textContent = T('js.votreRecherche');
    $('[data-criteres-liste]', blocCriteres).textContent = libelles.join(' · ');
    $('[data-criteres-effacer]', blocCriteres).textContent = T('js.effacerCriteres');
  }

  // Les cartes portent des classes différentes selon la rubrique.
  const SELECTEUR_CARTE = '.property-card, .terrain-card, .social-post-card';

  let rubriqueActive = 'tout';

  /** Normalise pour comparer sans se soucier des accents ni de la casse. */
  function sansAccents(valeur) {
    return String(valeur || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Applique la recherche et la rubrique choisies.
   * Appelée après chaque rendu : js/app.js réécrit les grilles entières à
   * chaque changement de filtre, ce qui efface le masquage précédent.
   */
  function appliquer() {
    const requete = sansAccents(champRecherche ? champRecherche.value.trim() : '');
    const mots = requete.split(/\s+/).filter(Boolean);
    const criteres = criteresEnCours();
    afficherCriteres(criteres);
    let totalVisible = 0;

    sections.forEach(section => {
      const rubrique = section.dataset.rubrique;
      const rubriqueDemandee = rubriqueActive === 'tout' || rubriqueActive === rubrique;
      const cartes = $$(SELECTEUR_CARTE, section);
      let visiblesIci = 0;

      cartes.forEach(carte => {
        // Tous les mots doivent apparaître, dans n'importe quel ordre : taper
        // « assinie piscine » doit trouver la villa avec piscine à Assinie.
        // Pour une publication, la fiche du bien compte aussi (localisation,
        // nom, équipements…) : elle n'est pas écrite sur la carte.
        const texte = sansAccents(`${carte.textContent} ${carte.dataset.rechercheTexte || ''}`);
        const estPublication = carte.classList.contains('social-post-card');
        // Les villas sont déjà filtrées par critères au rendu (js/app.js) ;
        // les publications le sont ici, avec la même règle.
        const respecteCriteres = !criteres || !estPublication || correspondRecherche(ficheDeCarte(carte), criteres);
        const correspond = respecteCriteres && mots.every(mot => texte.includes(mot));
        carte.classList.toggle('catalogue-masque', !correspond);
        if (correspond) visiblesIci += 1;
      });

      // Une rubrique masquée ne compte pas dans le total : le visiteur ne doit
      // pas lire « 14 résultats » quand il n'en voit que trois à l'écran.
      // Les critères masquent la rubrique Facebook quand rien n'y répond ;
      // la rubrique des résidences reste affichée, car ses onglets de
      // catégorie sont le moyen d'élargir la recherche.
      const filtree = mots.length > 0 || (Boolean(criteres) && rubrique === 'facebook');
      const afficher = rubriqueDemandee && (visiblesIci > 0 || (!filtree && !section.dataset.vide));
      section.hidden = !afficher;
      if (afficher) totalVisible += visiblesIci;

      const compteur = $('[data-compteur]', section);
      if (compteur) compteur.textContent = etiquetteNombre(visiblesIci, rubrique);
    });

    if (boutonEffacer) boutonEffacer.hidden = !mots.length;
    // Critères seuls, sans texte : la rubrique des résidences reste affichée
    // et porte déjà son propre message « aucune résidence ». Le répéter ici
    // afficherait deux messages l'un sous l'autre.
    if (vide) vide.hidden = totalVisible > 0 || (!mots.length && Boolean(criteres));
    if (resultat) {
      resultat.textContent = mots.length
        ? `${totalVisible} résultat${totalVisible > 1 ? 's' : ''} pour « ${champRecherche.value.trim()} »`
        : '';
    }
  }

  function etiquetteNombre(nombre, rubrique) {
    if (!nombre) return 'aucune annonce';
    const mot = rubrique === 'facebook'
      ? `publication${nombre > 1 ? 's' : ''}`
      : rubrique === 'terrains'
        ? `terrain${nombre > 1 ? 's' : ''}`
        : `résidence${nombre > 1 ? 's' : ''}`;
    return `${nombre} ${mot}`;
  }

  function choisirRubrique(rubrique) {
    rubriqueActive = rubrique;
    $$('.catalogue-rubrique-btn').forEach(bouton => {
      const choisi = bouton.dataset.rubrique === rubrique;
      bouton.classList.toggle('active', choisi);
      bouton.setAttribute('aria-pressed', String(choisi));
    });
    appliquer();
  }

  $$('.catalogue-rubrique-btn').forEach(bouton => {
    bouton.addEventListener('click', () => choisirRubrique(bouton.dataset.rubrique));
  });

  if (champRecherche) {
    let minuteur;
    champRecherche.addEventListener('input', () => {
      // Le catalogue peut compter une centaine de cartes : on attend une
      // courte pause dans la frappe plutôt que de tout refiltrer à chaque
      // caractère.
      window.clearTimeout(minuteur);
      minuteur = window.setTimeout(appliquer, 140);
    });
    champRecherche.addEventListener('search', appliquer);
  }

  if (boutonEffacer) {
    boutonEffacer.addEventListener('click', () => {
      champRecherche.value = '';
      champRecherche.focus();
      appliquer();
    });
  }

  const reinitialiser = $('#catalogueReset');
  if (reinitialiser) {
    reinitialiser.addEventListener('click', () => {
      // « Tout le catalogue » inclut les critères venus de l'accueil : sans
      // les retirer de l'adresse, le bouton laissait la page aussi vide.
      if (criteresEnCours()) {
        window.location.href = 'residences.html';
        return;
      }
      if (champRecherche) champRecherche.value = '';
      choisirRubrique('tout');
    });
  }

  // Les grilles sont reconstruites par js/app.js (filtres de catégorie, de
  // statut foncier, de superficie) et par js/premium.js quand les
  // publications arrivent. Chaque rendu efface le masquage : on le réapplique.
  window.addEventListener('dl:cards-rendered', appliquer);
  window.addEventListener('dl:publications-rendues', appliquer);

  // Ceinture : on surveille aussi les grilles elles-mêmes. Un rendu qui
  // oublierait de signaler son passage laissait le compteur figé — c’est
  // arrivé avec les terrains, qui affichaient « 4 terrains » quand le filtre
  // n’en montrait que deux. On n’observe que childList : appliquer() ne
  // touche qu’à des classes, il ne peut donc pas se rappeler lui-même.
  if (typeof MutationObserver === "function") {
    let attente;
    const observateur = new MutationObserver(() => {
      window.clearTimeout(attente);
      attente = window.setTimeout(appliquer, 60);
    });
    ['#villasGrid', '#terrainsGrid', '#cataloguePublicationsGrid'].forEach(selecteur => {
      const grille = $(selecteur);
      if (grille) observateur.observe(grille, { childList: true });
    });
  }

  // Une rubrique déclarée vide dans le HTML (les publications, tant que la
  // passerelle Meta n'a rien renvoyé) reste masquée jusqu'à son remplissage.
  sections.forEach(section => { if (section.hidden) section.dataset.vide = '1'; });

  appliquer();
  // Second passage différé : les grilles peuvent être peuplées après ce
  // script, notamment quand le contenu géré arrive du serveur.
  window.setTimeout(appliquer, 600);
  window.setTimeout(appliquer, 1600);
})();
