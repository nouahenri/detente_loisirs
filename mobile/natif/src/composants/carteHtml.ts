/**
 * Page de carte (Leaflet, fonds sans clé d'API) partagée par la version
 * téléphone (WebView) et la version navigateur (iframe).
 *   · Fonds : Plan (OpenStreetMap), Satellite (Esri World Imagery), Relief (OpenTopoMap) ;
 *   · Calques : un par statut foncier, couleur du repère (bleu, or, gris foncé) ;
 *   · `focus` : centre la carte sur un terrain et ouvre sa bulle.
 * Un appui sur « Voir la fiche » renvoie { type, id } à l'application.
 */
export type PointCarte = { id: string; titre: string; detail: string; latitude: number; longitude: number; calque?: string };
export type CalqueCarte = { cle: string; libelle: string; couleur: string };

/** Couleur d'un repère selon le statut foncier du terrain. */
export const COULEURS_FONCIER: Record<string, string> = { 'titre-foncier': '#1f4fb3', acd: '#e8b904' };
export const COULEUR_AUTRE = '#3d4250';
export const couleurFoncier = (code: string) => COULEURS_FONCIER[code] ?? COULEUR_AUTRE;

const echapper = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function htmlCarte(points: PointCarte[], { sombre, libelleVoir, interactive = true, calques = [], fonds, focus }: {
  sombre: boolean; libelleVoir: string; interactive?: boolean; calques?: CalqueCarte[];
  fonds?: { plan: string; satellite: string; relief: string }; focus?: string;
}) {
  const donnees = JSON.stringify(points.map(p => ({ ...p, titre: echapper(p.titre), detail: echapper(p.detail) })));
  const listeCalques = JSON.stringify(calques.map(c => ({ ...c, libelle: echapper(c.libelle) })));
  const noms = JSON.stringify(fonds ?? { plan: 'Plan', satellite: 'Satellite', relief: 'Relief' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
  html,body,#carte{margin:0;height:100%;background:${sombre ? '#10122a' : '#e8eaf2'};font-family:-apple-system,Roboto,sans-serif}
  ${sombre ? '.fond-plan{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)}' : ''}
  .leaflet-popup-content-wrapper{border-radius:14px}
  .leaflet-popup-content{margin:12px 14px;min-width:170px}
  .titre{font-weight:700;font-size:14px;color:#151837;margin-bottom:2px}
  .detail{font-size:12.5px;color:#5d6479;margin-bottom:10px}
  button{border:0;border-radius:999px;background:#151837;color:#fff;font-weight:700;font-size:13px;padding:8px 14px;width:100%}
  .marqueur{width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);box-sizing:border-box}
  .marqueur::after{content:'';position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;background:#fff}
  .marqueur.actif{width:24px;height:24px;border-width:3px}
  .leaflet-control-layers{border-radius:12px!important;border:0!important;box-shadow:0 2px 10px rgba(0,0,0,.25)!important;font-size:13px}
  .leaflet-control-layers-list{padding:2px 4px}
  .leaflet-control-layers label{margin:6px 0}
  .pastille,.legende i{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 6px 0 2px;vertical-align:-1px;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)}
  .legende{background:rgba(255,255,255,.94);border-radius:10px;padding:6px 9px;font-size:11.5px;color:#151837;box-shadow:0 1px 6px rgba(0,0,0,.2);line-height:1.7}
</style></head><body><div id="carte"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
  var points = ${donnees};
  var calques = ${listeCalques};
  var noms = ${noms};
  var interactive = ${interactive};
  var focus = ${JSON.stringify(focus ?? '')};
  function envoyer(message) {
    var texte = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(texte);
    else if (window.parent) window.parent.postMessage(texte, '*');
  }
  var carte = L.map('carte', { zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, attributionControl: true });

  // Fonds de carte (sans clé d'API).
  var fonds = {};
  fonds[noms.plan] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'fond-plan', attribution: '&copy; OpenStreetMap' });
  fonds[noms.satellite] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
  fonds[noms.relief] = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', className: 'fond-plan', attribution: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap' });
  fonds[noms.plan].addTo(carte);

  // Un calque par statut foncier.
  var groupes = {}, superpositions = {}, couleurs = {};
  calques.forEach(function (c) {
    couleurs[c.cle] = c.couleur;
    groupes[c.cle] = L.layerGroup().addTo(carte);
    superpositions['<span class="pastille" style="background:' + c.couleur + '"></span>' + c.libelle] = groupes[c.cle];
  });

  var limites = [], marqueurFocus = null;
  points.forEach(function (p) {
    var actif = p.id === focus;
    var icone = L.divIcon({
      className: '',
      html: '<div class="marqueur' + (actif ? ' actif' : '') + '" style="background:' + (couleurs[p.calque] || '#e8b904') + '"></div>',
      iconSize: actif ? [24, 24] : [18, 18],
      iconAnchor: actif ? [12, 29] : [9, 22],
      popupAnchor: [0, actif ? -27 : -20],
    });
    var m = L.marker([p.latitude, p.longitude], { icon: icone, zIndexOffset: actif ? 1000 : 0 });
    m.addTo(p.calque && groupes[p.calque] ? groupes[p.calque] : carte);
    limites.push([p.latitude, p.longitude]);
    if (interactive) {
      m.bindPopup('<div class="titre">' + p.titre + '</div>' + (p.detail ? '<div class="detail">' + p.detail + '</div>' : '')
        + (actif ? '' : '<button onclick="envoyer({ type: \\'terrain\\', id: \\'' + p.id + '\\' })">${echapper(libelleVoir)}</button>'));
    }
    if (actif) marqueurFocus = m;
  });

  if (interactive) {
    L.control.layers(fonds, superpositions, { collapsed: true, position: 'topright' }).addTo(carte);
    if (calques.length > 1) {
      var legende = L.control({ position: 'bottomleft' });
      legende.onAdd = function () {
        var div = L.DomUtil.create('div', 'legende');
        div.innerHTML = calques.map(function (c) { return '<i style="background:' + c.couleur + '"></i>' + c.libelle; }).join('<br>');
        return div;
      };
      legende.addTo(carte);
    }
  }

  function cadrer() {
    carte.invalidateSize();
    if (marqueurFocus) { carte.setView(marqueurFocus.getLatLng(), 16); if (interactive) marqueurFocus.openPopup(); }
    else if (limites.length === 1) carte.setView(limites[0], 15);
    else if (limites.length) carte.fitBounds(limites, { padding: [36, 36], maxZoom: 15 });
    else carte.setView([5.13, -3.28], 12);
  }
  cadrer();
  // La vue n'a pas toujours sa taille définitive au chargement : on recadre.
  setTimeout(cadrer, 250);
  window.addEventListener('resize', function () { carte.invalidateSize(); });
</script></body></html>`;
}
