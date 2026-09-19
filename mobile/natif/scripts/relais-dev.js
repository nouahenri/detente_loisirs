/**
 * Relais de mise au point pour `npm run web` (navigateur uniquement).
 *
 * Le navigateur refuse d'appeler l'API de henri-philippe.com depuis
 * localhost ; les téléphones, eux, l'appellent directement. Ce relais :
 *   - lit /api/content et /data/* sur le site en ligne (lecture seule) ;
 *   - SIMULE POST /api/leads : aucune demande de test n'arrive dans le studio ;
 *   - SIMULE le suivi (POST /api/app/suivi) : une demande de test passe à
 *     « contacte » après 20 s puis à « confirme » après 60 s ;
 *   - SIMULE l'inscription aux notifications (/api/app/appareils) ;
 *   - lit les avis des annonces (/api/avis) sur le site, mais SIMULE les
 *     « J'aime » et les commentaires : rien n'est publié sur le site.
 *
 *   node scripts/relais-dev.js   → http://localhost:5175
 */
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const PORT = 5175;
const SITE = 'https://henri-philippe.com';
const ENTETES = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Cache-Control': 'no-store',
};
const demandesSimulees = new Map();
// Avis simulés par annonce (« kind:id ») : { jaime: Set de visiteurs, commentaires: [] }.
const avisSimules = new Map();
const avisDe = cle => {
  if (!avisSimules.has(cle)) avisSimules.set(cle, { jaime: new Set(), commentaires: [] });
  return avisSimules.get(cle);
};
const lireSite = chemin => new Promise(resolve => {
  https.get(SITE + chemin, { headers: { 'User-Agent': 'DetenteLoisirsApp-dev', Accept: 'application/json' } }, amont => {
    let corps = '';
    amont.on('data', morceau => { corps += morceau; });
    amont.on('end', () => { try { resolve(JSON.parse(corps)); } catch { resolve(null); } });
  }).on('error', () => resolve(null));
});
/** Avis du site, complétés par les avis simulés de cette session. */
async function avisFusionnes(kind, id, visiteur) {
  const site = (await lireSite(`/api/avis?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`)) || { likes: 0, note: null, nombre: 0, commentaires: [] };
  const local = avisDe(`${kind}:${id}`);
  const commentaires = [...local.commentaires, ...(site.commentaires || [])];
  const somme = commentaires.reduce((total, c) => total + Number(c.note || 0), 0);
  return {
    ok: true,
    likes: Math.max(0, (site.likes || 0) + local.jaime.size),
    note: commentaires.length ? Math.round((somme / commentaires.length) * 10) / 10 : null,
    nombre: commentaires.length,
    jaime: local.jaime.has(visiteur),
    commentaires,
  };
}

const lireCorps = req => new Promise(resolve => {
  let corps = '';
  req.on('data', morceau => { corps += morceau; });
  req.on('end', () => { try { resolve(JSON.parse(corps || '{}')); } catch { resolve({}); } });
});
const repondre = (res, statut, donnees) => {
  res.writeHead(statut, { ...ENTETES, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(donnees));
};

http.createServer(async (req, res) => {
  const chemin = req.url.split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, ENTETES); return res.end(); }

  if (req.method === 'POST' && chemin === '/api/leads') {
    const corps = await lireCorps(req);
    const id = crypto.randomUUID();
    demandesSimulees.set(id, Date.now());
    console.log('[demande simulée]', id, JSON.stringify(corps));
    return repondre(res, 201, { ok: true, simulee: true, lead: { id, status: 'nouveau' } });
  }

  if (req.method === 'POST' && chemin === '/api/app/suivi') {
    const { ids } = await lireCorps(req);
    const statuts = {};
    (Array.isArray(ids) ? ids : []).forEach(id => {
      if (!demandesSimulees.has(id)) return;
      const age = Date.now() - demandesSimulees.get(id);
      statuts[id] = age > 60000 ? 'confirme' : age > 20000 ? 'contacte' : 'nouveau';
    });
    return repondre(res, 200, { ok: true, statuts });
  }

  if (chemin === '/api/app/appareils') {
    await lireCorps(req);
    return repondre(res, 200, { ok: true, simulee: true });
  }

  if (req.method === 'GET' && chemin === '/api/avis') {
    const params = new URL(req.url, 'http://relais').searchParams;
    return repondre(res, 200, await avisFusionnes(params.get('kind'), params.get('id'), params.get('visiteur')));
  }

  if (req.method === 'POST' && chemin === '/api/avis/jaime') {
    const { kind, id, visiteur } = await lireCorps(req);
    if (!kind || !id || !/^[A-Za-z0-9-]{16,64}$/.test(String(visiteur || ''))) return repondre(res, 400, { ok: false, error: 'Visiteur non identifié.' });
    const local = avisDe(`${kind}:${id}`);
    if (local.jaime.has(visiteur)) local.jaime.delete(visiteur); else local.jaime.add(visiteur);
    console.log('[j’aime simulé]', kind, id, local.jaime.has(visiteur));
    return repondre(res, 200, await avisFusionnes(kind, id, visiteur));
  }

  if (req.method === 'POST' && chemin === '/api/avis/commentaires') {
    const corps = await lireCorps(req);
    const note = Number(corps.note);
    if (String(corps.nom || '').trim().length < 2) return repondre(res, 422, { ok: false, error: 'Indiquez votre nom.' });
    if (!Number.isInteger(note) || note < 1 || note > 5) return repondre(res, 422, { ok: false, error: 'Choisissez une note de 1 à 5 étoiles.' });
    if (String(corps.commentaire || '').trim().length < 3) return repondre(res, 422, { ok: false, error: 'Écrivez votre commentaire.' });
    const commentaire = { id: crypto.randomUUID(), nom: String(corps.nom).trim().slice(0, 60), note, commentaire: String(corps.commentaire).trim().slice(0, 1000), creeLe: new Date().toISOString() };
    avisDe(`${corps.kind}:${corps.id}`).commentaires.unshift(commentaire);
    console.log('[avis simulé]', corps.kind, corps.id, JSON.stringify(commentaire));
    return repondre(res, 201, { ...(await avisFusionnes(corps.kind, corps.id, corps.visiteur)), commentaire });
  }

  if (req.method === 'GET' && (chemin === '/api/content' || chemin.startsWith('/data/'))) {
    https.get(SITE + req.url, { headers: { 'User-Agent': 'DetenteLoisirsApp-dev', Accept: 'application/json' } }, amont => {
      res.writeHead(amont.statusCode || 502, { ...ENTETES, 'Content-Type': amont.headers['content-type'] || 'application/json' });
      amont.pipe(res);
    }).on('error', () => { res.writeHead(502, ENTETES); res.end('{"ok":false}'); });
    return;
  }

  res.writeHead(404, ENTETES);
  res.end();
}).listen(PORT, () => console.log(`Relais de mise au point : http://localhost:${PORT}`));
