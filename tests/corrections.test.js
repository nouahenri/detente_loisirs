// Tests isolés : aucun accès réseau, aucune écriture dans data/ ni dans MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };

function storage(repo, options = {}) {
  const calls = [];
  const start = server.indexOf('const store = {');
  const context = vm.createContext({
    loadRepository: () => repo, repository: repo,
    databaseReady: false, databaseError: null, console: quiet,
    CONTENT_FILE: 'content', LEADS_FILE: 'leads',
    readJSON: () => structuredClone(options.leads || []),
    writeJSON: (file, value) => {
      calls.push({ file, value });
      if (options.failMirror) throw new Error('disk full');
    },
    text: (value, max) => String(value).slice(0, max),
    positiveNumber: (value, fallback, max) => Math.max(0, Math.min(Number(value) || fallback, max))
  });
  vm.runInContext(server.slice(start, server.indexOf('\n};', start) + 3) + '\nthis.subject = store;', context);
  return { subject: context.subject, context, calls };
}

test('mode local : conserve la publication JSON', async () => {
  const s = storage(false);
  const result = await s.subject.writeContent({ title: 'local' });
  assert.equal(result.dbExpected, false);
  assert.equal(s.calls[0].value.title, 'local');
});

test('sonde initiale échouée : tente quand même SQL puis actualise le miroir', async () => {
  let committed = false;
  const s = storage({ writeContent: async () => { assert.equal(s.calls.length, 0); committed = true; } });
  const result = await s.subject.writeContent({ title: 'published' });
  assert.equal(committed, true);
  assert.equal(result.persistedToDb, true);
  assert.equal(s.context.databaseReady, true);
  assert.equal(s.calls.length, 1);
});

test('refus SQL : aucun écrasement du contenu publié en JSON', async () => {
  const s = storage({ writeContent: async () => { throw new Error('Unknown column group_size'); } });
  const result = await s.subject.writeContent({ title: 'rejected' });
  assert.equal(result.dbExpected, true);
  assert.equal(result.persistedToDb, false);
  assert.match(result.error, /group_size/);
  assert.equal(s.calls.length, 0);
});

test('COMMIT réussi puis disque indisponible : succès SQL avec avertissement', async () => {
  const s = storage({ writeContent: async () => {} }, { failMirror: true });
  const result = await s.subject.writeContent({});
  assert.equal(result.persistedToDb, true);
  assert.match(result.warning, /copie de secours/);
});

test('dossier présent seulement dans MySQL : modification et création du miroir', async () => {
  const s = storage({ updateLead: async (id, patch) => ({ id, ...patch }) });
  const result = await s.subject.updateLead('db-only', { status: 'confirme', adminNotes: 'Suivi' });
  assert.equal(result.id, 'db-only');
  assert.equal(s.calls[0].value[0].status, 'confirme');
});

test('dossier refusé par MySQL : erreur visible et miroir inchangé', async () => {
  const s = storage({ updateLead: async () => { throw new Error('offline'); } });
  await assert.rejects(s.subject.updateLead('test', {}), /en base refusé/);
  assert.equal(s.calls.length, 0);
});

test('reconnexion : une seule sonde simultanée, même après dix secondes', async () => {
  let now = 1000, probes = 0, finish;
  const context = vm.createContext({
    Date: { now: () => now }, console: quiet, databaseReady: false,
    loadRepository: () => ({}), reportAuthState: async () => {},
    initDatabase: () => { probes++; return new Promise(resolve => { finish = resolve; }); }
  });
  vm.runInContext(server.slice(server.indexOf('let databaseProbe = null;'), server.indexOf('\nasync function initDatabase()')), context);
  const first = context.ensureDatabaseProbed();
  now += 11000;
  assert.equal(context.ensureDatabaseProbed(), first);
  assert.equal(probes, 1);
  finish(); await first;
  const retry = context.ensureDatabaseProbed();
  assert.equal(probes, 2);
  finish(); await retry;
});

test('migration : charge .env avant le pool et ajoute seulement les colonnes absentes', async () => {
  const source = fs.readFileSync(path.join(root, 'scripts/migrate.js'), 'utf8');
  const events = [], columns = new Set(['villas.environment', 'activities.price_amount']);
  const connection = {
    query: async sql => {
      events.push(sql);
      const match = sql.match(/ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/);
      if (match) columns.add(match[1] + '.' + match[2]);
      return [[], []];
    },
    execute: async (sql, [table, column]) => [columns.has(table + '.' + column) ? [{}] : []],
    release() {}
  };
  const pool = { isEnabled: () => true, describe: () => ({}), ping: async () => ({ ok: true }),
    getPool: () => ({ getConnection: async () => connection, query: async () => [[]] }) };
  const context = vm.createContext({
    __dirname: path.join(root, 'scripts'), console: quiet, process: { exitCode: 0 },
    require: id => {
      if (id === '../db/env') return { load: () => events.push('env') };
      if (id === '../db/pool') { assert.equal(events[0], 'env'); return pool; }
      if (id === 'fs') return { readFileSync: () => '', existsSync: () => true };
      return require(id);
    }
  });
  vm.runInContext(source.slice(0, source.lastIndexOf('\nmain()')), context);
  await context.main();
  // On ne fige pas le nombre de colonnes (la liste grandit avec le produit) :
  // ce qui doit rester vrai, c'est qu'un second passage n'ajoute plus rien.
  const premierPassage = events.filter(s => s.startsWith('ALTER TABLE'));
  assert.ok(premierPassage.length > 0, 'Les colonnes manquantes doivent être ajoutées.');
  await context.main();
  assert.equal(events.filter(s => s.startsWith('ALTER TABLE')).length, premierPassage.length,
    'Rejouer la migration ne doit ajouter aucune colonne.');
  assert.equal(events.some(s => /^(UPDATE|DELETE|INSERT)/.test(s)), false);
  // Le téléphone des abonnés fait partie des colonnes rattrapées sur une base
  // déjà en service : sans elle, toute inscription échouerait en MySQL.
  assert.ok(premierPassage.some(s => /`newsletter_subscribers` ADD COLUMN `phone`/.test(s)),
    'La colonne newsletter_subscribers.phone doit être ajoutée aux bases existantes.');
});

test('parallaxe : mouvement plus lent que la page, borné et désactivable', () => {
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  let top = 700;
  const image = { offsetHeight: 640, style: {}, complete: true };
  const section = { offsetHeight: 500, querySelector: () => image,
    getBoundingClientRect: () => ({ top, height: 500 }) };
  const handlers = {}, preference = { matches: false, addEventListener: (name, fn) => { handlers.motion = fn; } };
  const context = vm.createContext({
    document: { querySelector: () => section },
    window: { innerHeight: 700, matchMedia: () => preference,
      addEventListener: (name, fn) => { handlers[name] = fn; }, requestAnimationFrame: fn => fn() }
  });
  const start = source.indexOf('function initBandeauParallaxe()');
  vm.runInContext(source.slice(start, source.indexOf('\n}\n', start) + 2), context);
  context.initBandeauParallaxe();
  assert.match(image.style.transform, /-140px/);
  top = 100; handlers.scroll();
  assert.match(image.style.transform, /-70px/);
  top = -500; handlers.scroll();
  assert.match(image.style.transform, / 0px/);
  preference.matches = true; handlers.motion();
  assert.equal(image.style.transform, '');
});

for (const reject of [false, true]) {
  test(`publication du catalogue : ${reject ? 'erreur activité et rollback global' : 'requêtes paramétrées et COMMIT'}`, async () => {
    const events = [];
    const connection = {
      beginTransaction: async () => events.push('begin'),
      commit: async () => events.push('commit'),
      rollback: async () => events.push('rollback'),
      release: () => events.push('release'),
      execute: async (sql, params = []) => {
        assert.equal((sql.match(/\?/g) || []).length, params.length);
        assert.equal(params.includes(undefined), false);
        if (reject && sql.startsWith('INSERT INTO activities')) throw new Error('Unknown column group_size');
        events.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        return [[], []];
      }
    };
    const context = vm.createContext({
      module: { exports: {} }, console: quiet,
      require: id => id === './pool'
        ? { getPool: () => ({ getConnection: async () => connection }) }
        : require(id)
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'db/repository.js'), 'utf8'), context);
    const content = {
      villas: [{ id: 'test-villa', name: 'Test' }],
      terrains: [{ id: 'test-terrain', reference: 'TEST', priceTotal: 1000, areaSqm: 10 }],
      activities: [{ id: 'test-activity', title: 'Test', priceAmount: 2500, groupPriceAmount: 8000, groupSize: 4 }],
      reviews: [{ id: 'test-review', author: 'Test' }], faq: [{ id: 'test-faq', q: 'Test', a: 'Test' }], settings: { heroTitle: 'Test' }
    };
    const operation = context.module.exports.writeContent(content);
    if (reject) await assert.rejects(operation, /group_size/); else await operation;
    assert.equal(events.includes('commit'), !reject);
    assert.equal(events.includes('rollback'), reject);
    assert.equal(events.at(-1), 'release');
  });
}

// ---------------------------------------------------------------------------
// Non-régression : « les souscripteurs n'entrent pas en base ».
//
// Trois causes cumulées avaient été trouvées. Chacune est verrouillée ici.
// ---------------------------------------------------------------------------

test('migration : la table newsletter_subscribers est bien créée par npm run migrate', () => {
  // scripts/migrate.js n'appliquait que db/schema.sql, qui ne contient PAS
  // newsletter_subscribers : une base créée par ce seul script était
  // incomplète. (Ce n'était pas la cause du bug d'inscription — la table
  // existait bien en production, importée à la main — mais un piège réel
  // pour toute nouvelle installation.)
  const migrate = fs.readFileSync(path.join(root, 'scripts/migrate.js'), 'utf8');
  assert.match(migrate, /migration-auth-newsletter\.sql/,
    'migrate.js doit appliquer la migration qui crée les tables newsletter.');

  const applique = [];
  for (const fichier of ['db/schema.sql', 'db/migration-auth-newsletter.sql']) {
    applique.push(fs.readFileSync(path.join(root, fichier), 'utf8'));
  }
  const sql = applique.join('\n');
  for (const table of ['newsletter_subscribers', 'newsletter_campaigns', 'mail_queue', 'users', 'sessions']) {
    assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS `' + table + '`'),
      `La table ${table} doit être créée par les fichiers appliqués.`);
  }
});

test('formulaires : aucune page ne simule un succès sans rien envoyer', () => {
  // Les 7 bandeaux affichaient « Merci pour votre inscription ! » via un
  // onsubmit inline, sans le moindre appel réseau. Si le script de la page ne
  // se chargeait pas, le visiteur croyait s'être inscrit et rien n'arrivait.
  const pages = ['index.html', 'contact.html', 'devis.html', 'faq.html',
    'loisirs.html', 'residences.html', 'terrains.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /onsubmit=[^>]*alert\(/,
      `${page} ne doit pas afficher un faux message de succès.`);
    assert.match(html, /class="newsletter-ochre-form"[^>]*action="\/api\/newsletter"[^>]*method="post"/,
      `${page} doit poster vers l'API même sans JavaScript.`);
  }
});

test('serveur : accepte un formulaire HTML natif et ne divulgue aucune erreur SQL', () => {
  // parseBody n'acceptait que du JSON : une soumission sans JavaScript était
  // rejetée. Et l'erreur brute (« Table ... doesn't exist ») partait au visiteur.
  assert.match(server, /application\/x-www-form-urlencoded/,
    'parseBody doit accepter les formulaires HTML classiques.');
  assert.match(server, /Inscription momentanément indisponible/,
    'Une panne de stockage doit renvoyer un message neutre, pas le détail SQL.');
  assert.doesNotMatch(server.slice(server.indexOf('async function handlePublicNewsletter')),
    /json\(res, 400, \{ ok: false, error: error\.message \}\);\s*\n\s*return true;\s*\n\s*\}\s*\n\s*\/\/ --- Confirmation/,
    'Le handler ne doit plus relayer error.message tel quel au visiteur.');
});

test('newsletter : une panne MySQL ne fait plus perdre l’adresse du visiteur', async () => {
  // persist() levait sans écrire nulle part : l'adresse était définitivement
  // perdue. Elle doit désormais être conservée et le parcours aller au bout.
  const ecrits = [];
  const Module = require('node:module');
  const origine = Module._load;
  const store = path.join(root, 'db/newsletter-store.js');
  delete require.cache[require.resolve(store)];
  Module._load = function (id) {
    if (id === './repository') {
      return { async query(q) { if (/newsletter_subscribers/.test(q)) throw new Error("Table doesn't exist"); return [[]]; } };
    }
    if (id === './json-store') {
      return {
        read: () => ecrits.slice(),
        write: (_f, liste) => { ecrits.length = 0; ecrits.push(...liste); }
      };
    }
    return origine.apply(this, arguments);
  };
  try {
    const nl = require(store);
    nl.configure({ isDbReady: () => true });
    const inscription = await nl.subscribe({ email: 'panne@example.invalid', source: 'site' });
    assert.ok(inscription.confirmToken, 'Le visiteur doit recevoir son lien de confirmation.');
    assert.equal(ecrits.length, 1, 'L’adresse doit être conservée malgré la panne.');
    const confirmation = await nl.confirm(inscription.confirmToken);
    assert.equal(confirmation.ok, true, 'Le lien de confirmation doit fonctionner en mode dégradé.');
    assert.equal(confirmation.subscriber.status, 'confirme');
    assert.ok(nl.degradedWrite(), 'L’incident doit être signalé au studio.');
  } finally {
    Module._load = origine;
    delete require.cache[require.resolve(store)];
  }
});

test('newsletter : le formulaire vise /api/newsletter, jamais /api/leads', () => {
  // CAUSE RÉELLE du bug « les souscripteurs n'entrent pas en base » : la
  // version déployée postait vers /api/leads avec { type:'newsletter' }.
  // Les adresses atterrissaient donc dans la table `leads` et la table
  // `newsletter_subscribers` — pourtant bien présente — restait vide.
  const premium = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
  const capture = premium.slice(
    premium.indexOf('function initNewsletterCapture()'),
    premium.indexOf('function applyManagedSettings()')
  );
  assert.ok(capture.length > 0, 'initNewsletterCapture doit exister.');
  assert.match(capture, /fetch\('\/api\/newsletter'/,
    'L’inscription doit appeler /api/newsletter (double opt-in).');
  assert.doesNotMatch(capture, /\/api\/leads/,
    'L’inscription ne doit plus être enregistrée comme une demande client.');
});

test('studio : la ligne des abonnés a sa propre grille (5 cellules, pas 6)', () => {
  // La ligne des abonnés n'a pas de vignette : 5 cellules seulement. Sans
  // règle propre elle héritait de .table-row dont la 1re colonne fait 76px et
  // sert à l'image — l'adresse e-mail y était comprimée et débordait sur la
  // date. Le responsive générique masquait en prime le statut ET les boutons
  // d'action.
  const css = fs.readFileSync(path.join(root, 'css/admin.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');

  const entete = js.match(/subscribers-grid-row header">(.*?)<\/div>/);
  assert.ok(entete, 'En-tête du tableau des abonnés introuvable.');
  const colonnes = (entete[1].match(/<span>/g) || []).length;
  assert.equal(colonnes, 5, 'Le tableau des abonnés compte 5 colonnes.');

  assert.match(css, /\.subscribers-grid-row\s*\{[^}]*grid-template-columns/,
    'La ligne des abonnés doit définir ses propres colonnes.');
  const base = css.match(/\.subscribers-grid-row\s*\{([^}]*)\}/)[1];
  const pistes = base.match(/grid-template-columns\s*:\s*([^;]+)/)[1].trim().split(/\s+/);
  assert.equal(pistes.length, 5, `La grille doit déclarer 5 pistes, pas ${pistes.length}.`);

  // Les cellules doivent pouvoir rétrécir, sinon une adresse longue déborde
  // quelle que soit la largeur de colonne (min-width:auto par défaut).
  assert.match(css, /\.subscribers-grid-row\s*>\s*\*\s*\{[^}]*min-width\s*:\s*0/,
    'Les cellules doivent avoir min-width:0.');

  // Statut (4e) et action (5e) doivent rester visibles à chaque palier.
  // On découpe sur « @media » plutôt que d'écrire une regex sur tout le
  // fichier : plusieurs blocs visent la même largeur, et seul celui qui parle
  // des abonnés nous intéresse.
  for (const palier of ['1050', '760']) {
    const blocs = css.split('@media')
      .filter(bloc => bloc.trimStart().startsWith(`(max-width:${palier}px)`));
    assert.ok(blocs.length, `Aucun bloc ${palier}px dans la feuille de style.`);
    const rétabli = blocs.some(bloc =>
      /\.subscribers-grid-row\s*>\s*\*:nth-child\(4\)[\s\S]*?nth-child\(5\)[^}]*display\s*:\s*block/.test(bloc));
    assert.ok(rétabli, `À ${palier}px, le statut et les actions doivent rester affichés.`);
  }
});

test('newsletter : le WhatsApp est facultatif mais exige son indicatif', () => {
  const nl = require(path.join(root, 'db/newsletter-store.js'));
  // Facultatif : un champ vide ne bloque jamais l'inscription.
  assert.equal(nl.isValidPhone(''), true);
  assert.equal(nl.isValidPhone('   '), true);
  // Forme internationale acceptée, quelle que soit la ponctuation.
  for (const numero of ['+225 07 07 12 34 56', '00225 07 07 12 34 56', '+33 6 12 34 56 78', '+1 (212) 555 0199']) {
    assert.equal(nl.isValidPhone(numero), true, `${numero} doit être accepté.`);
  }
  // Sans indicatif, WhatsApp ne peut pas joindre le contact : on refuse plutôt
  // que d'enregistrer un numéro inexploitable.
  for (const saisie of ['0707123456', '07.07.12.34.56', 'abc', '+12']) {
    assert.equal(nl.isValidPhone(saisie), false, `${saisie} doit être refusé.`);
  }
  // « 00 » et « + » désignent le même numéro : une seule forme est stockée.
  assert.equal(nl.normalizePhone('+225 07 07 12 34 56'), '+2250707123456');
  assert.equal(nl.normalizePhone('00225 07 07 12 34 56'), '+2250707123456');
});

test('newsletter : le champ WhatsApp est présent et non obligatoire sur les 7 pages', () => {
  const pages = ['index.html', 'contact.html', 'devis.html', 'faq.html',
    'loisirs.html', 'residences.html', 'terrains.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const champ = html.match(/<input type="tel"[^>]*class="[^"]*newsletter-ochre-phone[^"]*"[^>]*>/);
    assert.ok(champ, `${page} doit proposer un champ WhatsApp.`);
    assert.doesNotMatch(champ[0], /\srequired/,
      `${page} : le téléphone doit rester facultatif.`);
    assert.match(champ[0], /name="phone"/, `${page} : le champ doit s'appeler « phone ».`);
    assert.match(champ[0], /aria-label="[^"]*facultatif[^"]*"/,
      `${page} : le caractère facultatif doit être annoncé aux lecteurs d'écran.`);
    assert.match(champ[0], /aria-label="[^"]*indicatif[^"]*"/,
      `${page} : l'indicatif attendu doit être annoncé aux lecteurs d'écran.`);
    // Le placeholder est court (le champ est étroit) : l'indicatif est montré
    // par l'exemple « +225… », et détaillé dans title/aria-label.
    assert.match(champ[0], /placeholder="[^"]*\+[0-9]/,
      `${page} : le champ doit montrer un exemple d'indicatif.`);
    assert.match(champ[0], /title="[^"]*indicatif[^"]*"/,
      `${page} : l'infobulle doit expliquer l'indicatif attendu.`);
    assert.match(champ[0], /(placeholder|aria-label)="[^"]*WhatsApp[^"]*"/,
      `${page} : le champ doit dire qu'il s'agit du numéro WhatsApp.`);
  }
});

test('newsletter : la confirmation passe par une modale fermable', () => {
  const js = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/refonte.css'), 'utf8');

  assert.match(js, /function openNewsletterModal/, 'La modale doit exister.');
  assert.match(js, /aria-modal="true"/, 'La modale doit être annoncée comme telle.');
  assert.match(js, /event\.key === 'Escape'/, 'Échap doit fermer la modale.');
  assert.match(js, /if \(event\.target === fond\) fermer\(\)/, 'Le clic sur le fond doit fermer.');
  assert.match(js, /retour\.focus\(\)/, 'Le focus doit revenir à son point de départ.');

  // Centrage effectif, et non une simple boîte posée en haut de page.
  const bloc = css.match(/\.newsletter-modal \{([^}]*)\}/);
  assert.ok(bloc, 'Le style de la modale doit exister.');
  assert.match(bloc[1], /position:\s*fixed/);
  assert.match(bloc[1], /place-items:\s*center/);
});

test('facebook : bascule sur /feed quand published_posts n’existe pas', async () => {
  // Constaté en production le 12/09/2026 : les Pages « New Pages Experience »
  // (adresse en profile.php) n'exposent pas published_posts. Meta répond
  // « (#100) Tried accessing nonexisting field (published_posts) » et la
  // synchronisation ne ramenait rien, sans que le studio montre d'erreur.
  const appels = [];
  const context = vm.createContext({
    PAGE_ID: '100075922063365',
    console: quiet,
    graphRequest: async chemin => {
      appels.push(chemin);
      if (chemin.includes('published_posts')) {
        throw new Error('(#100) Tried accessing nonexisting field (published_posts)');
      }
      return { data: [{ id: '1', message: 'Bonjour Assinie' }] };
    }
  });
  const debut = server.indexOf('let edgePublications = null;');
  const fin = server.indexOf('\n}', server.indexOf('async function getFacebookPosts()')) + 2;
  vm.runInContext(server.slice(debut, fin) + '\nthis.getFacebookPosts = getFacebookPosts;', context);

  const premier = await context.getFacebookPosts();
  assert.equal(premier.data.length, 1, 'La bascule doit ramener les publications.');
  assert.equal(appels.length, 2, 'Un essai sur published_posts, puis un sur feed.');
  assert.match(appels[0], /published_posts/);
  assert.match(appels[1], /\/feed\?/);

  // Le choix est mémorisé : plus d'appel perdu aux synchronisations suivantes.
  await context.getFacebookPosts();
  assert.equal(appels.length, 3, 'Le second passage ne doit interroger que /feed.');
  assert.match(appels[2], /\/feed\?/);

  // Toute autre erreur Graph doit remonter, pas être masquée par la bascule.
  const autre = vm.createContext({
    PAGE_ID: 'x', console: quiet,
    graphRequest: async () => { throw new Error('(#190) Invalid OAuth access token'); }
  });
  vm.runInContext(server.slice(debut, fin) + '\nthis.getFacebookPosts = getFacebookPosts;', autre);
  await assert.rejects(autre.getFacebookPosts(), /Invalid OAuth access token/);
});

test('facebook : plusieurs images partent en un seul post (album), pas en rafale', async () => {
  // Demande du 12/09/2026 : pouvoir joindre plusieurs photos. Meta n'accepte
  // pas d'album en un appel : chaque photo est téléversée SANS être publiée,
  // puis un unique post les rassemble via attached_media. Sans cela, chaque
  // photo apparaîtrait comme une publication distincte sur la Page.
  const appels = [];
  const context = vm.createContext({
    PAGE_ID: '123', PUBLIC_SITE_URL: 'https://henri-philippe.com',
    console: quiet, crypto: require('node:crypto'),
    text: (v, max) => String(v ?? '').trim().slice(0, max),
    readJSON: () => [], writeJSON: () => {}, FB_PUBLISH_FILE: 'publish.json',
    URLSearchParams, JSON, Date,
    dbEnabled: () => false, tryDb: async () => null,
    updateFacebookState: () => {}, audit: () => {}, publicationsSupprimees: () => new Set(),
    cleanPublicUrl: (valeur, label, local) => {
      const brut = String(valeur ?? '').trim();
      if (!brut) return '';
      if (local && /^assets\/uploads\//.test(brut)) return `https://henri-philippe.com/${brut}`;
      return brut;
    },
    // Nécessaires depuis que les visuels locaux partent en multipart plutôt
    // que par URL : le publieur lit le fichier sur le disque du serveur.
    path: require('node:path'), fs: require('node:fs'), ROOT: root,
    MIME: { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' },
    FormData, Blob,
    GRAPH_UPLOAD_TIMEOUT_MS: 90000,
    estAssetLocalPublic: chemin =>
      /^assets(?:\/[A-Za-z0-9._-]+)+\.(?:jpe?g|png|webp|gif|avif)$/i.test(chemin)
      && !chemin.split('/').includes('..'),
    graphRequest: async (chemin, options) => {
      const corps = options?.body instanceof FormData
        ? 'multipart:' + [...options.body.keys()].join(',')
        : (options?.body ? String(options.body) : '');
      appels.push({ chemin, corps, multipart: options?.body instanceof FormData });
      if (chemin.endsWith('/photos')) return { id: `photo${appels.length}` };
      return { id: 'post_final' };
    }
  });
  // La tranche part des helpers de téléversement : publishFacebookPost les
  // appelle, les isoler seuls laisserait « resoudreVisuel is not defined ».
  const debut = server.indexOf('const TAILLE_MAX_PHOTO');
  // La fin se calcule depuis publishFacebookPost, pas depuis `debut` : sinon
  // la tranche s'arrêterait à la première accolade fermante, celle d'un helper.
  const fin = server.indexOf('\n}\n', server.indexOf('async function publishFacebookPost(')) + 3;
  vm.runInContext(server.slice(debut, fin) + '\nthis.publier = publishFacebookPost;', context);

  const resultat = await context.publier({
    message: 'Trois vues de la villa',
    imageUrls: ['assets/uploads/a.jpg', 'assets/uploads/b.jpg', 'assets/uploads/c.jpg']
  });

  const photos = appels.filter(a => a.chemin.endsWith('/photos'));
  const posts = appels.filter(a => a.chemin.endsWith('/feed'));
  assert.equal(photos.length, 3, 'Chaque image doit être téléversée.');
  assert.equal(posts.length, 1, 'Un seul post final, pas une publication par photo.');
  for (const photo of photos) {
    assert.match(photo.corps, /published=false/,
      'Les photos ne doivent pas être publiées séparément sur la Page.');
  }
  assert.match(posts[0].corps, /attached_media%5B0%5D/, 'Les photos doivent être rattachées au post.');
  assert.match(posts[0].corps, /attached_media%5B2%5D/, 'Les trois photos doivent être rattachées.');
  assert.equal(resultat.duplicate, false);

  // Une seule image suit le même chemin depuis le 17/09/2026 : la légende
  // d'une publication /photos ne se modifie pas par Graph, le texte d'une
  // publication du fil, si (synchronisation des annonces site → Facebook).
  appels.length = 0;
  const seule = await context.publier({ message: 'Une seule vue', imageUrls: ['assets/uploads/a.jpg'] });
  assert.equal(appels.length, 2);
  assert.match(appels[0].corps, /published=false/);
  assert.match(appels[1].chemin, /\/feed$/);
  assert.equal(seule.photos.length, 1, 'photo envoyée rattachée à sa valeur sur le site');
  assert.equal(seule.photos[0].local, 'assets/uploads/a.jpg');

  // Rétrocompatibilité : `imageUrl` (singulier) reste accepté.
  appels.length = 0;
  await context.publier({ message: 'Depuis le catalogue', imageUrl: 'assets/uploads/z.jpg' });
  assert.equal(appels.length, 2);
  assert.match(appels[1].chemin, /\/feed$/);
});
