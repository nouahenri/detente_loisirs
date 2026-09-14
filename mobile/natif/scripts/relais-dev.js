/**
 * Relais de mise au point pour `npm run web` (navigateur uniquement).
 *
 * Le navigateur refuse d'appeler l'API de henri-philippe.com depuis
 * localhost ; les téléphones, eux, l'appellent directement. Ce relais :
 *   - lit /api/content et /data/* sur le site en ligne (lecture seule) ;
 *   - SIMULE POST /api/leads : aucune demande de test n'arrive dans le studio ;
 *   - SIMULE le suivi (POST /api/app/suivi) : une demande de test passe à
 *     « contacte » après 20 s puis à « confirme » après 60 s ;
 *   - SIMULE l'inscription aux notifications (/api/app/appareils).
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
