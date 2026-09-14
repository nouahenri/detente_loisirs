// Capture newsletter côté visiteur : appel API, téléphone facultatif, et
// affichage du résultat dans la modale. Aucun accès réseau, DOM simulé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/premium.js'), 'utf8');

/**
 * DOM factice, réduit à ce dont la capture newsletter a besoin.
 * La modale est construite par innerHTML dans le vrai code : on expose donc
 * des éléments interrogeables par `$` sans réimplémenter un moteur de sélecteurs.
 */
function setup(fetch, { email = 'test@example.invalid', phone = '' } = {}) {
  let submit, reset = 0;
  const button = { disabled: false, focus() {} };
  const feedback = { textContent: '', setAttribute() {}, className: '' };
  const form = {
    insertAdjacentElement() {},
    addEventListener(type, fn) { submit = fn; },
    reset() { reset += 1; }
  };

  // Éléments de la modale, repérés par le sélecteur qui les demande.
  const modale = {
    titre: { textContent: '' },
    texte: { textContent: '' },
    icone: { textContent: '' },
    boite: { classList: { toggle(_c, on) { modale.boite.erreur = on; }, contains: () => false }, erreur: false },
    fermer: { addEventListener() {}, focus() { modale.focusMis = true; } },
    ok: { addEventListener() {} },
    focusMis: false
  };
  const fond = {
    className: '', hidden: true, innerHTML: '',
    addEventListener() {}, appendChild() {}
  };

  const select = selector => {
    if (selector.startsWith('input[type="email"]')) return { value: email };
    if (selector.startsWith('input[type="tel"]')) return { value: phone };
    if (selector.startsWith('button[type="submit"]')) return button;
    if (selector.includes('newsletter-modal-close')) return modale.fermer;
    if (selector.includes('newsletter-modal-ok')) return modale.ok;
    if (selector.includes('newsletter-modal-icon')) return modale.icone;
    if (selector.includes('newsletter-modal-text')) return modale.texte;
    if (selector.includes('newsletterModalTitre')) return modale.titre;
    if (selector.includes('newsletter-modal-box')) return modale.boite;
    return button;
  };

  const body = { classList: { add() {}, remove() {} }, appendChild() {} };
  const context = vm.createContext({
    document: {
      createElement: tag => (tag === 'div' ? fond : feedback),
      body,
      activeElement: button,
      addEventListener() {}
    },
    $$: () => [form],
    $: select,
    fetch, TypeError
  });

  vm.runInContext(
    source.slice(source.indexOf('  function initNewsletterCapture()'),
      source.indexOf('  async function applyManagedSettings()')) + ';initNewsletterCapture();',
    context);

  return {
    send: () => submit({ preventDefault() {}, stopImmediatePropagation() {} }),
    button, feedback, modale, fond,
    resets: () => reset
  };
}

test('inscription acceptée : appel API, modale de succès, formulaire vidé', async () => {
  let request;
  const ui = setup(async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ ok: true, message: 'Confirmez par e-mail' }) };
  });
  await ui.send();
  assert.equal(request.url, '/api/newsletter');
  assert.equal(request.body.email, 'test@example.invalid');
  assert.equal(ui.resets(), 1);
  assert.equal(ui.modale.texte.textContent, 'Confirmez par e-mail');
  assert.equal(ui.modale.titre.textContent, 'Merci de votre inscription');
  assert.equal(ui.modale.icone.textContent, '✓');
  assert.equal(ui.fond.hidden, false, 'La modale doit être visible.');
  assert.equal(ui.feedback.textContent, '', 'Le message ne doit plus rester sous le formulaire.');
  assert.equal(ui.button.disabled, false);
});

test('le téléphone saisi est transmis, un champ vide reste vide', async () => {
  let envoye;
  const avec = setup(async (url, options) => {
    envoye = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  }, { phone: '+225 07 07 12 34 56' });
  await avec.send();
  assert.equal(envoye.phone, '+225 07 07 12 34 56', 'Le numéro doit partir au serveur.');

  const sans = setup(async (url, options) => {
    envoye = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  await sans.send();
  assert.equal(envoye.phone, '', 'Sans saisie, le champ part vide — il est facultatif.');
  assert.equal(sans.resets(), 1, 'L’inscription aboutit sans numéro.');
});

for (const scenario of ['HTTP', 'network', 'invalid-json']) {
  test('échec conservé et réessayable : ' + scenario, async () => {
    const ui = setup(async () => {
      if (scenario === 'network') throw new TypeError('offline');
      return { ok: false, json: async () => {
        if (scenario === 'invalid-json') throw new Error('Invalid JSON');
        return { ok: false, error: 'Trop de demandes' };
      } };
    });
    await ui.send();
    assert.equal(ui.resets(), 0, 'La saisie du visiteur doit être conservée.');
    assert.equal(ui.button.disabled, false, 'Le bouton doit redevenir utilisable.');
    assert.equal(ui.modale.titre.textContent, 'Inscription non aboutie');
    assert.equal(ui.modale.icone.textContent, '!');
    assert.ok(ui.modale.texte.textContent);
    // Un envoi qui a échoué n'a rien transmis : ne jamais laisser croire le
    // contraire au visiteur.
    assert.doesNotMatch(ui.modale.texte.textContent, /sauvegardée dès|adresse est conservée/);
  });
}

test('double soumission bloquée pendant la requête', async () => {
  let release, calls = 0;
  const ui = setup(() => { calls += 1; return new Promise(r => { release = r; }); });
  const first = ui.send();
  await ui.send();
  assert.equal(calls, 1);
  assert.equal(ui.button.disabled, true);
  release({ ok: true, json: async () => ({ ok: true }) });
  await first;
  assert.equal(ui.button.disabled, false);
});
