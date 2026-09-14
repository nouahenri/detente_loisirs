/**
 * SERVICE WORKER — site installable (Android, iOS) et apps des stores.
 *
 * Règle d'or : ne jamais servir une page ou des données périmées quand le
 * réseau répond. Le cache n'est qu'un secours hors ligne.
 *   · pages HTML et /api/content : réseau d'abord, cache si hors ligne ;
 *   · CSS / JS / images du site  : cache immédiat + mise à jour en arrière-plan
 *     (les CSS/JS portent un ?v= : une nouvelle version a une nouvelle adresse) ;
 *   · studio (admin.html), API d'administration, authentification, envois
 *     (POST) et domaines extérieurs : jamais interceptés.
 *
 * Changer VERSION purge les anciens caches à l'activation.
 */
const VERSION = 'dl-2026-09-13-1';
const CACHE_PAGES = `${VERSION}-pages`;
const CACHE_FICHIERS = `${VERSION}-fichiers`;
const HORS_LIGNE = '/offline.html';
const PRECHARGE = [HORS_LIGNE, '/assets/app/icon-192.png', '/assets/images/logo.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_PAGES).then(cache => cache.addAll(PRECHARGE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(nom => !nom.startsWith(VERSION)).map(nom => caches.delete(nom))))
      .then(() => self.clients.claim())
  );
});

function ignorer(requete, adresse) {
  if (requete.method !== 'GET') return true;
  if (adresse.origin !== self.location.origin) return true;
  const chemin = adresse.pathname;
  return chemin === '/admin.html'
    || chemin.startsWith('/api/admin')
    || chemin.startsWith('/api/auth')
    || chemin.startsWith('/api/newsletter')
    || chemin.startsWith('/api/facebook')
    || chemin === '/sw.js';
}

/** Réseau d'abord ; en cas d'échec, dernière copie, puis page hors ligne. */
async function reseauDabord(requete, secoursHorsLigne) {
  const cache = await caches.open(CACHE_PAGES);
  try {
    const reponse = await fetch(requete);
    if (reponse && reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  } catch (erreur) {
    const copie = await cache.match(requete, { ignoreSearch: requete.mode === 'navigate' });
    if (copie) return copie;
    if (secoursHorsLigne) return (await cache.match(HORS_LIGNE)) || Response.error();
    throw erreur;
  }
}

/** Cache immédiat, rafraîchi en arrière-plan. */
async function cachePuisMiseAJour(requete) {
  const cache = await caches.open(CACHE_FICHIERS);
  const copie = await cache.match(requete);
  const miseAJour = fetch(requete)
    .then(reponse => { if (reponse && reponse.ok) cache.put(requete, reponse.clone()); return reponse; })
    .catch(() => copie);
  return copie || miseAJour;
}

self.addEventListener('fetch', event => {
  const requete = event.request;
  const adresse = new URL(requete.url);
  if (ignorer(requete, adresse)) return;

  if (requete.mode === 'navigate' || adresse.pathname.endsWith('.html')) {
    event.respondWith(reseauDabord(requete, true));
    return;
  }
  if (adresse.pathname === '/api/content') {
    event.respondWith(reseauDabord(requete, false));
    return;
  }
  if (adresse.pathname.startsWith('/api/')) return;
  if (/^\/(css|js|assets)\//.test(adresse.pathname)) {
    event.respondWith(cachePuisMiseAJour(requete));
  }
});
