// Mot de passe du studio (17/09/2026) : lien « mot de passe oublié » envoyé par
// e-mail, changement sans l'ancien mot de passe avec e-mail d'alerte.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(racine, 'server.js'), 'utf8');
const auth = fs.readFileSync(path.join(racine, 'db', 'auth-store.js'), 'utf8');
const admin = fs.readFileSync(path.join(racine, 'js', 'admin.js'), 'utf8');
const templates = require('../db/mail-templates');

const route = chemin => {
  const debut = server.indexOf(`url.pathname === '${chemin}')`);
  assert.ok(debut > 0, `route ${chemin} absente`);
  return server.slice(debut, server.indexOf('\n  }\n', debut));
};

test('mot de passe oublié : même réponse que le compte existe ou non, débit limité, lien vers le studio', () => {
  const bloc = route('/api/auth/mot-de-passe-oublie');
  assert.match(bloc, /rateLimit\(req, 'mot-de-passe-oublie', 5\)/);
  assert.equal((bloc.match(/return json\(res, 200, reponse\)/g) || []).length, 2, 'compte inconnu et compte trouvé : réponse identique');
  assert.doesNotMatch(bloc, /json\(res, 404/);
  assert.match(bloc, /admin\.html#reinitialiser=\$\{encodeURIComponent\(demande\.token\)\}/);
});

test('jeton : aléatoire, empreinte seule stockée, une heure, usage unique, compte actif avec e-mail', () => {
  const creation = auth.slice(auth.indexOf('async function createPasswordReset('), auth.indexOf('async function consumePasswordReset('));
  assert.match(creation, /crypto\.randomBytes\(32\)/);
  assert.match(creation, /const tokenHash = hashToken\(token\)/);
  assert.doesNotMatch(creation, /\[token, user\.id|token,\s*userId/, 'le jeton en clair n’est jamais enregistré');
  assert.match(creation, /user\.active === false \|\| !user\.email\) return null/);
  assert.match(auth, /const RESET_TTL_MS = 60 \* 60 \* 1000;/);
  const usage = auth.slice(auth.indexOf('async function consumePasswordReset('), auth.indexOf('async function deleteUser('));
  assert.ok(usage.indexOf('setPassword(') < usage.indexOf("DELETE FROM password_resets WHERE user_id"), 'lien détruit après usage');
  assert.match(usage, /expires_at > UTC_TIMESTAMP\(\)/);
});

test('changement sans l’ancien mot de passe : vérifié seulement s’il est saisi, alerte envoyée, sessions fermées', () => {
  const bloc = route('/api/auth/mot-de-passe');
  assert.match(bloc, /const sansActuel = !String\(payload\.currentPassword \|\| ''\)/);
  assert.match(bloc, /if \(!sansActuel\) \{\s*const check = await auth\.authenticate/);
  assert.match(bloc, /alerterChangementMotDePasse\(actor, \{ withoutCurrent: sansActuel \}\)/);
  assert.match(bloc, /clearedSessionCookie\(req\)/);
  assert.match(route('/api/auth/reinitialiser'), /alerterChangementMotDePasse\(user, \{ byReset: true \}\)/);
});

test('e-mails : lien et durée dans le message, alerte explicite', () => {
  const lien = 'https://henri-philippe.com/admin.html#reinitialiser=abc';
  const message = templates.passwordReset({ username: 'henri', resetUrl: lien, expiresMinutes: 60 });
  assert.ok(message.html.includes(lien) && message.text.includes(lien));
  assert.match(message.text, /60 minutes/);
  assert.match(templates.passwordChanged({ username: 'henri', withoutCurrent: true }).text, /sans saisir l’ancien mot de passe/);
});

test('studio : jeton retiré de l’adresse dès la lecture, confirmation du nouveau mot de passe', () => {
  const bloc = admin.slice(admin.indexOf('function brancherMotDePasseOublie('), admin.indexOf('async function restoreSession('));
  assert.ok(bloc.indexOf('history.replaceState') > bloc.indexOf('jetonReinitialisation = decodeURIComponent'));
  assert.match(bloc, /reinitConfirmation/);
  assert.match(admin, /name="currentPassword" type="password" autocomplete="current-password">/, 'ancien mot de passe facultatif');
});
