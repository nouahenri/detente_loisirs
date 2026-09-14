/**
 * Site installable (13/09/2026) : enregistrement du service worker et
 * invitation discrète à installer l'application.
 *
 *   · Android / Chrome : l'événement `beforeinstallprompt` permet d'afficher
 *     un vrai bouton « Installer ».
 *   · iPhone / iPad (Safari) : aucun bouton possible, on explique le geste
 *     « Partager → Sur l'écran d'accueil ».
 *   · Déjà installée : rien.
 *
 * L'invitation n'apparaît qu'à la 2e page vue, et « Plus tard » la fait taire
 * 30 jours : elle ne doit jamais gêner la réservation.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(erreur => console.warn('Service worker non enregistré :', erreur));
  });

  const CLE_REPORT = 'dl-install-plus-tard';
  const CLE_PAGES = 'dl-pages-vues';
  const lire = cle => { try { return localStorage.getItem(cle); } catch { return null; } };
  const ecrire = (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch { /* navigation privée */ } };

  const dejaInstallee = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (dejaInstallee) {
    document.documentElement.classList.add('app-installee');
    return;
  }

  const pagesVues = Number(lire(CLE_PAGES) || 0) + 1;
  ecrire(CLE_PAGES, String(pagesVues));
  const reporteeJusqua = Number(lire(CLE_REPORT) || 0);
  const peutProposer = () => pagesVues >= 2 && Date.now() > reporteeJusqua;

  const ua = navigator.userAgent || '';
  const estIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const estSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

  function afficher({ texte, bouton, surClic }) {
    if (document.getElementById('invitationApp')) return;
    const bandeau = document.createElement('div');
    bandeau.id = 'invitationApp';
    bandeau.className = 'invitation-app';
    bandeau.setAttribute('role', 'dialog');
    bandeau.setAttribute('aria-label', 'Installer l’application');
    bandeau.innerHTML = `<img src="/assets/app/icon-192.png" alt="" width="44" height="44">
      <p><strong>Détente & Loisirs dans votre poche</strong><span></span></p>
      <div class="invitation-app-actions">
        ${bouton ? `<button type="button" class="invitation-app-oui">${bouton}</button>` : ''}
        <button type="button" class="invitation-app-non" aria-label="Plus tard">Plus tard</button>
      </div>`;
    bandeau.querySelector('p span').textContent = texte;
    document.body.appendChild(bandeau);
    requestAnimationFrame(() => bandeau.classList.add('est-visible'));
    const fermer = () => { bandeau.classList.remove('est-visible'); setTimeout(() => bandeau.remove(), 300); };
    bandeau.querySelector('.invitation-app-non').addEventListener('click', () => {
      ecrire(CLE_REPORT, String(Date.now() + 30 * 24 * 3600 * 1000));
      fermer();
    });
    const oui = bandeau.querySelector('.invitation-app-oui');
    if (oui) oui.addEventListener('click', async () => { fermer(); await surClic(); });
  }

  // Android / Chrome / Edge
  let invite = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    invite = event;
    if (!peutProposer()) return;
    setTimeout(() => afficher({
      texte: 'Installez l’application : accès direct, plein écran, même hors connexion.',
      bouton: 'Installer',
      surClic: async () => {
        invite.prompt();
        const choix = await invite.userChoice.catch(() => null);
        if (!choix || choix.outcome !== 'accepted') ecrire(CLE_REPORT, String(Date.now() + 30 * 24 * 3600 * 1000));
        invite = null;
      }
    }), 4000);
  });
  window.addEventListener('appinstalled', () => document.getElementById('invitationApp')?.remove());

  // iPhone / iPad : Safari seulement (les autres navigateurs iOS ne savent pas installer).
  if (estIOS && estSafari && peutProposer()) {
    window.addEventListener('load', () => setTimeout(() => afficher({
      texte: 'Touchez Partager ⎋ puis « Sur l’écran d’accueil » pour installer l’application.'
    }), 4000));
  }
})();
