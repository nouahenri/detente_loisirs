/**
 * COMPTES UTILISATEURS, RÔLES ET SESSIONS DU STUDIO.
 *
 * Remplace la clé partagée unique (`ADMIN_SECRET` + en-tête `x-admin-key`)
 * par de vrais comptes nominatifs.
 *
 * ---------------------------------------------------------------------------
 * CHOIX DE STOCKAGE — pourquoi PAS de double écriture JSON + MySQL ici
 * ---------------------------------------------------------------------------
 * Le reste du projet écrit en double (JSON + MySQL) pour que le JSON serve de
 * filet. Pour des identifiants, ce serait un défaut de sécurité : un compte
 * supprimé en base survivrait dans `data/users.json` et redeviendrait valide
 * le jour où MySQL tombe. On applique donc une règle simple :
 *   · MySQL disponible  → MySQL fait autorité, et lui seul.
 *   · MySQL indisponible → fichiers `data/users.json` / `data/sessions.json`.
 * Le mode est choisi au démarrage par server.js via `configure({ isDbReady })`.
 *
 * ---------------------------------------------------------------------------
 * HACHAGE DES MOTS DE PASSE — scrypt natif (module `crypto`)
 * ---------------------------------------------------------------------------
 * Aucune dépendance à installer (ni bcrypt, ni argon2) : `crypto.scrypt` est
 * fourni par Node. Paramètres retenus, volontairement explicites :
 *   N = 16384  coût CPU/mémoire (2^14). Mémoire nécessaire = 128 × N × r,
 *              soit 16 Mo par calcul : tenable sur un mutualisé cPanel tout en
 *              rendant une attaque par dictionnaire très coûteuse.
 *   r = 8      taille de bloc (valeur de référence de la RFC 7914).
 *   p = 1      parallélisme (inutile de paralléliser côté serveur web).
 *   keylen=64  longueur du condensé.
 *   maxmem     relevé à 64 Mo car la limite par défaut de Node (32 Mo) est
 *              trop juste pour N=16384 et ferait échouer le calcul.
 * Le sel fait 16 octets aléatoires, différent pour chaque utilisateur : deux
 * comptes avec le même mot de passe donnent deux condensés différents.
 * La comparaison passe TOUJOURS par `crypto.timingSafeEqual`.
 *
 * Le condensé est stocké au format « scrypt$N$r$p$keylen$hex » : les
 * paramètres voyagent avec la valeur, ce qui permettra de les durcir plus tard
 * sans invalider les mots de passe existants.
 */

const crypto = require('crypto');
const jsonStore = require('./json-store');

const USERS_FILE = 'users.json';
const SESSIONS_FILE = 'sessions.json';

// --- Paramètres scrypt (voir l'en-tête) ------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

// --- Sessions ---------------------------------------------------------------
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;          // 8 heures glissantes
const SESSION_REFRESH_AFTER_MS = 15 * 60 * 1000;     // on ne prolonge qu'au-delà de 15 min

// --- Verrouillage progressif ------------------------------------------------
// À partir du 5e échec consécutif, le compte est bloqué pour une durée qui
// croît à chaque nouvel échec. Objectif : rendre le forçage brut inutilisable
// sans jamais bloquer définitivement un utilisateur légitime.
const MAX_ATTEMPTS_BEFORE_LOCK = 5;
const LOCK_STEPS_MINUTES = [1, 5, 15, 60, 240, 1440];

// ---------------------------------------------------------------------------
// RÔLES ET PERMISSIONS
// ---------------------------------------------------------------------------
const ROLES = ['proprietaire', 'editeur', 'commercial'];

const ROLE_LABELS = {
  proprietaire: 'Propriétaire',
  editeur: 'Éditeur',
  commercial: 'Commercial'
};

const ROLE_DESCRIPTIONS = {
  proprietaire: 'Accès complet, y compris la gestion des utilisateurs, les réglages du site et le journal d’audit.',
  editeur: 'Villas, terrains, activités, contenus et publications Facebook. Pas d’accès aux utilisateurs ni aux réglages du site.',
  commercial: 'Demandes clients et newsletter, en lecture et en traitement. Aucun accès au contenu du site.'
};

/**
 * Matrice des permissions. Chaque route /api/admin/* exige une permission
 * précise : être authentifié ne suffit jamais.
 */
const ROLE_PERMISSIONS = {
  proprietaire: [
    'dashboard:view',
    'content:read', 'content:write', 'settings:write',
    'leads:read', 'leads:write', 'leads:export',
    'newsletter:read', 'newsletter:write',
    'facebook:read', 'facebook:write',
    'backup:manage', 'audit:read', 'users:manage',
    // Comptabilité (17/09/2026) : salaires et finances, propriétaire seulement.
    'compta:manage'
  ],
  editeur: [
    'dashboard:view',
    'content:read', 'content:write',
    'facebook:read', 'facebook:write'
  ],
  commercial: [
    'dashboard:view',
    'leads:read', 'leads:write', 'leads:export',
    'newsletter:read', 'newsletter:write'
  ]
};

/*
 * RÔLES ADMINISTRABLES (demande du 17/09/2026) : les rôles ci-dessus sont les
 * rôles prédéfinis ; leurs permissions se cochent au studio (Utilisateurs →
 * Rôles et permissions), et d'autres rôles peuvent être créés. Le serveur lit
 * le registre en mémoire, rafraîchi toutes les 30 secondes et après chaque
 * modification (plusieurs processus Passenger partagent la même base).
 */
const CATALOGUE_PERMISSIONS = [
  { groupe: 'Pilotage', permissions: [['dashboard:view', 'Voir la vue d’ensemble']] },
  { groupe: 'Catalogue du site', permissions: [['content:read', 'Consulter les annonces'], ['content:write', 'Créer et modifier les annonces, référentiels et avis'], ['settings:write', 'Modifier les réglages du site']] },
  { groupe: 'Clients', permissions: [['leads:read', 'Consulter les demandes'], ['leads:write', 'Traiter les demandes et bloquer des demandeurs'], ['leads:export', 'Exporter les demandes']] },
  { groupe: 'Newsletter', permissions: [['newsletter:read', 'Consulter abonnés et campagnes'], ['newsletter:write', 'Envoyer des campagnes']] },
  { groupe: 'Facebook', permissions: [['facebook:read', 'Consulter les publications'], ['facebook:write', 'Publier et synchroniser']] },
  { groupe: 'Finances', permissions: [['compta:manage', 'Comptabilité : entrées, sorties, salaires']] },
  { groupe: 'Administration', permissions: [['backup:manage', 'Sauvegardes et exports'], ['audit:read', 'Journal d’audit'], ['users:manage', 'Utilisateurs, rôles et permissions']] }
];
const TOUTES_PERMISSIONS = CATALOGUE_PERMISSIONS.flatMap(groupe => groupe.permissions.map(([code]) => code));
// Sans elle, plus personne ne pourrait rendre des droits : le propriétaire la garde.
const PERMISSION_VITALE = 'users:manage';
const ROLES_FILE = 'roles.json';
const ROLES_TTL_MS = 30_000;

const ROLES_INITIAUX = ROLES.map((code, index) => ({
  code, libelle: ROLE_LABELS[code], description: ROLE_DESCRIPTIONS[code],
  permissions: [...ROLE_PERMISSIONS[code]], ordre: index + 1, systeme: true
}));

/** Registre complet : rôles prédéfinis, puis modifications et rôles créés. */
function normaliserRoles(lignes = []) {
  const parCode = new Map(ROLES_INITIAUX.map(role => [role.code, { ...role, permissions: [...role.permissions] }]));
  for (const ligne of Array.isArray(lignes) ? lignes : []) {
    const code = text(ligne?.code, 20);
    if (!code) continue;
    const base = parCode.get(code);
    if (ligne.supprime) { if (!base?.systeme) parCode.delete(code); continue; }
    let permissions = Array.isArray(ligne.permissions) ? ligne.permissions : (() => { try { return JSON.parse(ligne.permissions || '[]'); } catch { return []; } })();
    permissions = TOUTES_PERMISSIONS.filter(p => permissions.includes(p));
    if (code === 'proprietaire' && !permissions.includes(PERMISSION_VITALE)) permissions.push(PERMISSION_VITALE);
    parCode.set(code, {
      code, libelle: text(ligne.libelle, 60) || base?.libelle || code, description: text(ligne.description, 240) || base?.description || '',
      permissions, ordre: Number.isFinite(Number(ligne.ordre)) ? Number(ligne.ordre) : (base?.ordre || 99), systeme: Boolean(base?.systeme)
    });
  }
  return [...parCode.values()].sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, 'fr'));
}

let registreRoles = normaliserRoles();
let rolesLusLe = 0;

function listeRoles() { return registreRoles.map(role => ({ ...role, permissions: [...role.permissions] })); }
function roleExiste(code) { return registreRoles.some(role => role.code === code); }
function libelleRole(code) { return registreRoles.find(role => role.code === code)?.libelle || ROLE_LABELS[code] || code; }

/** Relit les rôles en base ou dans data/roles.json (au plus toutes les 30 s, sauf `force`). */
async function actualiserRoles(force = false) {
  if (!force && Date.now() - rolesLusLe < ROLES_TTL_MS) return registreRoles;
  let lignes = null;
  if (useDb()) {
    try { [lignes] = await sql('SELECT code, libelle, description, permissions, ordre, supprime FROM roles'); }
    catch (error) { if (!(error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146)) { rolesLusLe = Date.now(); return registreRoles; } }
  }
  if (!lignes) lignes = jsonStore.read(ROLES_FILE, []);
  registreRoles = normaliserRoles(lignes);
  rolesLusLe = Date.now();
  return registreRoles;
}

/** Identifiant d'un nouveau rôle : minuscules, sans accents, 20 caractères au plus. */
function codeRole(libelle) {
  return text(libelle, 60).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20).replace(/-$/, '');
}

/** Rôle saisi au studio. Renvoie { role, erreurs }. */
function validerRole(source = {}, { existant = null } = {}) {
  const erreurs = [];
  const libelle = text(source.libelle, 60);
  if (!libelle) erreurs.push('Le nom du rôle est requis.');
  const code = existant?.code || codeRole(libelle);
  if (libelle && !existant && !code) erreurs.push('Nom de rôle invalide.');
  if (!existant && roleExiste(code)) erreurs.push(`Le rôle « ${libelle} » existe déjà.`);
  const demandees = Array.isArray(source.permissions) ? source.permissions : [];
  const permissions = TOUTES_PERMISSIONS.filter(p => demandees.includes(p));
  if (code === 'proprietaire' && !permissions.includes(PERMISSION_VITALE)) permissions.push(PERMISSION_VITALE);
  if (!permissions.length) erreurs.push('Cochez au moins une permission.');
  return {
    erreurs,
    role: erreurs.length ? null : { code, libelle, description: text(source.description, 240), permissions, ordre: Number.isInteger(Number(source.ordre)) ? Number(source.ordre) : (existant?.ordre || registreRoles.length + 1), systeme: Boolean(existant?.systeme) }
  };
}

async function enregistrerRole(role) {
  let enBase = false;
  if (useDb()) {
    try {
      await sql(`INSERT INTO roles (code, libelle, description, permissions, ordre, supprime) VALUES (?,?,?,?,?,0)
        ON DUPLICATE KEY UPDATE libelle=VALUES(libelle), description=VALUES(description), permissions=VALUES(permissions), ordre=VALUES(ordre), supprime=0`,
      [role.code, role.libelle, role.description, JSON.stringify(role.permissions), role.ordre]);
      enBase = true;
    } catch (error) { if (!(error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146)) throw error; }
  }
  if (!enBase) {
    const lignes = jsonStore.read(ROLES_FILE, []).filter(ligne => ligne.code !== role.code);
    jsonStore.write(ROLES_FILE, [...lignes, { code: role.code, libelle: role.libelle, description: role.description, permissions: role.permissions, ordre: role.ordre }]);
  }
  await actualiserRoles(true);
  return role;
}

/** Supprime un rôle créé au studio ; refusé pour un rôle prédéfini ou encore attribué. */
async function supprimerRole(code) {
  const role = registreRoles.find(entree => entree.code === code);
  if (!role) throw new Error('Rôle introuvable.');
  if (role.systeme) throw new Error('Rôle prédéfini : modifiez ses permissions plutôt que de le supprimer.');
  const titulaires = (await listUsers()).filter(user => user.role === code).length;
  if (titulaires) throw new Error(`Rôle attribué à ${titulaires} utilisateur${titulaires > 1 ? 's' : ''} : changez d’abord leur rôle.`);
  let enBase = false;
  if (useDb()) {
    try { await sql('DELETE FROM roles WHERE code = ?', [code]); enBase = true; }
    catch (error) { if (!(error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146)) throw error; }
  }
  if (!enBase) jsonStore.write(ROLES_FILE, jsonStore.read(ROLES_FILE, []).filter(ligne => ligne.code !== code));
  await actualiserRoles(true);
  return true;
}

function permissionsFor(role) {
  const entree = registreRoles.find(item => item.code === role);
  return entree ? [...entree.permissions] : [];
}

function can(actor, permission) {
  if (!actor) return false;
  return permissionsFor(actor.role).includes(permission);
}

// ---------------------------------------------------------------------------
// Accès MySQL (optionnel)
// ---------------------------------------------------------------------------
let repository = null;
let dbReadyProbe = () => false;

function configure(options = {}) {
  if (typeof options.isDbReady === 'function') dbReadyProbe = options.isDbReady;
}

function useDb() {
  try { return Boolean(dbReadyProbe()); } catch { return false; }
}

function repo() {
  if (repository === null) {
    try { repository = require('./repository'); } catch { repository = false; }
  }
  return repository;
}

async function sql(query, params = []) {
  const active = repo();
  if (!active) throw new Error('MySQL non configuré');
  return active.query(query, params);
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function toMysqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : null;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Normalise un nom d'utilisateur : minuscules, sans espace ni accent. */
function normalizeUsername(value) {
  return text(value, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '');
}

function isValidUsername(value) {
  return /^[a-z0-9][a-z0-9._-]{2,59}$/.test(value);
}

/**
 * Règle de robustesse du mot de passe. Volontairement lisible et expliquée à
 * l'utilisateur : 10 caractères minimum, au moins une lettre et un chiffre.
 * Un minimum long vaut mieux qu'une exigence de symboles qui pousse aux
 * « Motdepasse1! » notés sur un papier.
 */
function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (value.length > 200) return 'Le mot de passe ne peut pas dépasser 200 caractères.';
  if (!/[a-zA-Z]/.test(value)) return 'Le mot de passe doit contenir au moins une lettre.';
  if (!/[0-9]/.test(value)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}

// ---------------------------------------------------------------------------
// Hachage
// ---------------------------------------------------------------------------
function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      Buffer.from(String(password), 'utf8'), salt, SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem },
      (error, derived) => (error ? reject(error) : resolve(derived))
    );
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt);
  return {
    hash: `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${SCRYPT.keylen}$${derived.toString('hex')}`,
    salt: salt.toString('hex')
  };
}

/**
 * Vérifie un mot de passe. Ne lève jamais : renvoie false sur toute donnée
 * malformée (condensé tronqué, sel absent, ancien format…).
 */
async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const parts = String(storedHash || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, N, r, p, keylen, hex] = parts;
    const salt = Buffer.from(String(storedSalt || ''), 'hex');
    if (!salt.length) return false;
    const expected = Buffer.from(hex, 'hex');
    if (!expected.length) return false;
    const derived = await new Promise((resolve, reject) => {
      crypto.scrypt(
        Buffer.from(String(password), 'utf8'), salt, Number(keylen),
        { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem },
        (error, value) => (error ? reject(error) : resolve(value))
      );
    });
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Conversion ligne SQL ↔ objet
// ---------------------------------------------------------------------------
function userFromRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    role: row.role,
    active: Boolean(row.active),
    lastLoginAt: toIso(row.last_login_at),
    failedAttempts: Number(row.failed_attempts || 0),
    lockedUntil: toIso(row.locked_until),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

/** Projection sûre : ce qui peut être renvoyé à l'interface (jamais le condensé). */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    role: user.role,
    roleLabel: libelleRole(user.role),
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt || null,
    failedAttempts: Number(user.failedAttempts || 0),
    lockedUntil: user.lockedUntil || null,
    locked: isLocked(user),
    createdAt: user.createdAt || null
  };
}

function isLocked(user) {
  if (!user?.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// Lecture / écriture des utilisateurs
// ---------------------------------------------------------------------------
function readUsersFile() {
  const list = jsonStore.read(USERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function writeUsersFile(list) {
  jsonStore.write(USERS_FILE, list);
}

async function countUsers() {
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT COUNT(*) AS total FROM users');
      return Number(rows[0]?.total || 0);
    } catch { /* repli fichier ci-dessous */ }
  }
  return readUsersFile().length;
}

async function listUsers() {
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM users ORDER BY username ASC');
      return rows.map(userFromRow);
    } catch { /* repli fichier */ }
  }
  return readUsersFile().slice().sort((a, b) => String(a.username).localeCompare(String(b.username), 'fr'));
}

async function getUserByUsername(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM users WHERE username = ? LIMIT 1', [key]);
      return rows.length ? userFromRow(rows[0]) : null;
    } catch { /* repli fichier */ }
  }
  return readUsersFile().find(user => user.username === key) || null;
}

async function getUserById(id) {
  const key = text(id, 36);
  if (!key) return null;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT * FROM users WHERE id = ? LIMIT 1', [key]);
      return rows.length ? userFromRow(rows[0]) : null;
    } catch { /* repli fichier */ }
  }
  return readUsersFile().find(user => user.id === key) || null;
}

/**
 * Crée un compte. Lève une erreur explicite (message destiné à l'interface)
 * si le nom est invalide, déjà pris, si le rôle est inconnu ou si le mot de
 * passe est trop faible.
 */
async function createUser({ username, email = '', password, role = 'editeur', active = true }) {
  const key = normalizeUsername(username);
  if (!isValidUsername(key)) {
    throw new Error('Nom d’utilisateur invalide : 3 à 60 caractères, lettres non accentuées, chiffres, point, tiret ou souligné.');
  }
  await actualiserRoles();
  if (!roleExiste(role)) throw new Error(`Rôle inconnu « ${role} » (attendus : ${registreRoles.map(r => r.code).join(', ')}).`);
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);
  if (await getUserByUsername(key)) throw new Error(`Le nom d’utilisateur « ${key} » est déjà utilisé.`);

  const { hash, salt } = await hashPassword(password);
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    username: key,
    email: text(email, 180),
    passwordHash: hash,
    passwordSalt: salt,
    role,
    active: active !== false,
    lastLoginAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now
  };

  if (useDb()) {
    await sql(
      `INSERT INTO users (id, username, email, password_hash, password_salt, role, active, failed_attempts, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,0,?,?)`,
      [user.id, user.username, user.email, user.passwordHash, user.passwordSalt,
        user.role, user.active ? 1 : 0, toMysqlDate(now), toMysqlDate(now)]
    );
  } else {
    const list = readUsersFile();
    list.push(user);
    writeUsersFile(list);
  }
  return publicUser(user);
}

/** Met à jour rôle / e-mail / activation. Ne touche jamais au mot de passe. */
async function updateUser(id, patch = {}) {
  const user = await getUserById(id);
  if (!user) return null;
  const next = { ...user };
  if (patch.role !== undefined) {
    await actualiserRoles();
    if (!roleExiste(patch.role)) throw new Error(`Rôle inconnu « ${patch.role} ».`);
    next.role = patch.role;
  }
  if (patch.email !== undefined) next.email = text(patch.email, 180);
  if (patch.active !== undefined) next.active = Boolean(patch.active);
  next.updatedAt = new Date().toISOString();

  // Réactiver un compte remet à zéro le compteur d'échecs et lève le verrou.
  if (patch.active === true) { next.failedAttempts = 0; next.lockedUntil = null; }
  if (patch.unlock === true) { next.failedAttempts = 0; next.lockedUntil = null; }

  if (useDb()) {
    await sql(
      'UPDATE users SET email = ?, role = ?, active = ?, failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?',
      [next.email, next.role, next.active ? 1 : 0, next.failedAttempts,
        toMysqlDate(next.lockedUntil), toMysqlDate(next.updatedAt), next.id]
    );
  } else {
    const list = readUsersFile();
    const index = list.findIndex(item => item.id === next.id);
    if (index < 0) return null;
    list[index] = next;
    writeUsersFile(list);
  }
  // Un compte désactivé ou changé de rôle ne doit pas garder de session ouverte.
  if (patch.active === false || patch.role !== undefined) await deleteUserSessions(next.id);
  return publicUser(next);
}

async function setPassword(id, password) {
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);
  const user = await getUserById(id);
  if (!user) return null;
  const { hash, salt } = await hashPassword(password);
  const updatedAt = new Date().toISOString();

  if (useDb()) {
    await sql(
      'UPDATE users SET password_hash = ?, password_salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
      [hash, salt, toMysqlDate(updatedAt), user.id]
    );
  } else {
    const list = readUsersFile();
    const index = list.findIndex(item => item.id === user.id);
    if (index < 0) return null;
    list[index] = { ...list[index], passwordHash: hash, passwordSalt: salt, failedAttempts: 0, lockedUntil: null, updatedAt };
    writeUsersFile(list);
  }
  // Changer un mot de passe invalide toutes les sessions ouvertes du compte :
  // c'est le geste attendu quand on soupçonne une compromission.
  await deleteUserSessions(user.id);
  return true;
}

// ---------------------------------------------------------------------------
// MOT DE PASSE OUBLIÉ (demande du 17/09/2026)
// Lien envoyé par e-mail, valable une heure, utilisable une seule fois. Comme
// pour les sessions, seule l'empreinte SHA-256 du jeton est enregistrée.
// ---------------------------------------------------------------------------
const RESET_TTL_MS = 60 * 60 * 1000;
const RESETS_FILE = 'password-resets.json';

function readResetsFile() {
  const list = jsonStore.read(RESETS_FILE, []);
  return Array.isArray(list) ? list : [];
}

const tableAbsente = error => error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;

/** Compte désigné par son nom d'utilisateur ou son adresse e-mail. */
async function getUserByLogin(identifiant) {
  const brut = text(identifiant, 180).toLowerCase();
  if (!brut) return null;
  if (!brut.includes('@')) return getUserByUsername(brut);
  const trouve = (await listUsers()).find(user => String(user.email || '').toLowerCase() === brut);
  return trouve ? getUserById(trouve.id) : null;
}

/**
 * Prépare une réinitialisation. Renvoie { user, token, expiresAt }, ou null
 * si aucun compte ACTIF avec une adresse e-mail ne correspond — l'appelant
 * répond alors exactement comme en cas de succès (pas d'énumération).
 */
async function createPasswordReset(identifiant) {
  const user = await getUserByLogin(identifiant);
  if (!user || user.active === false || !user.email) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  let enBase = false;
  if (useDb()) {
    try {
      await sql('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
      await sql('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)',
        [tokenHash, user.id, toMysqlDate(expiresAt), toMysqlDate(createdAt)]);
      enBase = true;
    } catch (error) { if (!tableAbsente(error)) throw error; }
  }
  if (!enBase) {
    // Une seule demande en cours par compte : la précédente est annulée.
    const autres = readResetsFile().filter(entry => entry.userId !== user.id && new Date(entry.expiresAt).getTime() > Date.now());
    jsonStore.write(RESETS_FILE, [...autres, { tokenHash, userId: user.id, expiresAt, createdAt }]);
  }
  return { user: publicUser(user), token, expiresAt };
}

/** Utilise un lien de réinitialisation. Lève une erreur lisible s'il est invalide. */
async function consumePasswordReset(token, newPassword) {
  const weak = passwordProblem(newPassword);
  if (weak) throw new Error(weak);
  const tokenHash = hashToken(text(token, 200));
  let userId = null;
  let enBase = false;
  if (useDb()) {
    try {
      const [rows] = await sql('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1', [tokenHash]);
      userId = rows[0]?.user_id || null;
      enBase = true;
    } catch (error) { if (!tableAbsente(error)) throw error; }
  }
  if (!enBase) {
    const entry = readResetsFile().find(item => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now());
    userId = entry?.userId || null;
  }
  const user = userId ? await getUserById(userId) : null;
  if (!user || user.active === false) throw new Error('Lien invalide ou expiré : demandez-en un nouveau.');
  await setPassword(user.id, newPassword);
  if (enBase) await sql('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
  else jsonStore.write(RESETS_FILE, readResetsFile().filter(item => item.userId !== user.id));
  return publicUser(user);
}

async function deleteUser(id) {
  const user = await getUserById(id);
  if (!user) return null;
  await deleteUserSessions(user.id);
  if (useDb()) {
    await sql('DELETE FROM users WHERE id = ?', [user.id]);
  } else {
    writeUsersFile(readUsersFile().filter(item => item.id !== user.id));
  }
  return publicUser(user);
}

/** Nombre de propriétaires actifs — sert à interdire la suppression du dernier. */
async function countActiveOwners(excludeId = null) {
  const users = await listUsers();
  return users.filter(user => user.role === 'proprietaire' && user.active !== false && user.id !== excludeId).length;
}

// ---------------------------------------------------------------------------
// Échecs de connexion et verrouillage progressif
// ---------------------------------------------------------------------------
async function registerFailure(user) {
  const attempts = Number(user.failedAttempts || 0) + 1;
  let lockedUntil = null;
  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCK) {
    const step = Math.min(attempts - MAX_ATTEMPTS_BEFORE_LOCK, LOCK_STEPS_MINUTES.length - 1);
    lockedUntil = new Date(Date.now() + LOCK_STEPS_MINUTES[step] * 60_000).toISOString();
  }
  if (useDb()) {
    await sql('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [attempts, toMysqlDate(lockedUntil), user.id]);
  } else {
    const list = readUsersFile();
    const index = list.findIndex(item => item.id === user.id);
    if (index >= 0) { list[index].failedAttempts = attempts; list[index].lockedUntil = lockedUntil; writeUsersFile(list); }
  }
  return { attempts, lockedUntil };
}

async function registerSuccess(user) {
  const now = new Date().toISOString();
  if (useDb()) {
    await sql('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
      [toMysqlDate(now), toMysqlDate(now), user.id]);
  } else {
    const list = readUsersFile();
    const index = list.findIndex(item => item.id === user.id);
    if (index >= 0) { list[index].failedAttempts = 0; list[index].lockedUntil = null; list[index].lastLoginAt = now; writeUsersFile(list); }
  }
}

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function readSessionsFile() {
  const list = jsonStore.read(SESSIONS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function writeSessionsFile(list) {
  jsonStore.write(SESSIONS_FILE, list);
}

/**
 * Ouvre une session et renvoie le jeton EN CLAIR (seule occasion où il
 * existe). Seule son empreinte SHA-256 est enregistrée.
 */
async function createSession(userId, { ip = '', userAgent = '' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const record = {
    tokenHash, userId, expiresAt: expiresAt.toISOString(), createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(), ip: text(ip, 64), userAgent: text(userAgent, 255)
  };
  if (useDb()) {
    await sql(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)',
      [tokenHash, userId, toMysqlDate(expiresAt), toMysqlDate(now), toMysqlDate(now), record.ip, record.userAgent]
    );
  } else {
    const list = readSessionsFile().filter(item => new Date(item.expiresAt).getTime() > Date.now());
    list.push(record);
    writeSessionsFile(list.slice(-500));
  }
  return { token, expiresAt: record.expiresAt, ttlSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

/**
 * Retrouve la session correspondant au jeton en clair et prolonge la fenêtre
 * glissante si nécessaire. Renvoie null si le jeton est inconnu ou expiré.
 */
async function touchSession(token) {
  const tokenHash = hashToken(token);
  const now = Date.now();
  if (useDb()) {
    const [rows] = await sql('SELECT * FROM sessions WHERE token_hash = ? LIMIT 1', [tokenHash]);
    if (!rows.length) return null;
    const session = rows[0];
    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      await sql('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
      return null;
    }
    let renewed = false;
    if (expiresAt - now < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
      await sql('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?',
        [toMysqlDate(new Date(now + SESSION_TTL_MS)), toMysqlDate(new Date(now)), tokenHash]);
      renewed = true;
    }
    return { tokenHash, userId: session.user_id, renewed, expiresAt: toIso(new Date(now + SESSION_TTL_MS)) };
  }

  const list = readSessionsFile();
  const index = list.findIndex(item => item.tokenHash === tokenHash);
  if (index < 0) return null;
  const session = list[index];
  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    list.splice(index, 1);
    writeSessionsFile(list);
    return null;
  }
  let renewed = false;
  if (expiresAt - now < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
    session.expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    session.lastSeenAt = new Date(now).toISOString();
    list[index] = session;
    writeSessionsFile(list);
    renewed = true;
  }
  return { tokenHash, userId: session.userId, renewed, expiresAt: session.expiresAt };
}

async function deleteSession(token) {
  const tokenHash = hashToken(token);
  if (useDb()) {
    await sql('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    return true;
  }
  const list = readSessionsFile();
  const next = list.filter(item => item.tokenHash !== tokenHash);
  if (next.length !== list.length) writeSessionsFile(next);
  return true;
}

async function deleteUserSessions(userId) {
  if (useDb()) {
    try { await sql('DELETE FROM sessions WHERE user_id = ?', [userId]); } catch { /* best-effort */ }
    return;
  }
  const list = readSessionsFile();
  const next = list.filter(item => item.userId !== userId);
  if (next.length !== list.length) writeSessionsFile(next);
}

/** Purge des sessions expirées (appelée périodiquement par server.js). */
async function purgeExpiredSessions() {
  if (useDb()) {
    try { await sql('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()'); } catch { /* best-effort */ }
    return;
  }
  const now = Date.now();
  const list = readSessionsFile();
  const next = list.filter(item => new Date(item.expiresAt).getTime() > now);
  if (next.length !== list.length) writeSessionsFile(next);
}

// ---------------------------------------------------------------------------
// CONNEXION
// ---------------------------------------------------------------------------
/**
 * Tente une connexion.
 *
 * RÈGLE : le message d'erreur renvoyé à l'appelant est TOUJOURS le même,
 * qu'il s'agisse d'un utilisateur inconnu, d'un mot de passe faux ou d'un
 * compte désactivé. Distinguer les cas offrirait un oracle permettant
 * d'énumérer les comptes existants. Le détail réel part uniquement dans le
 * journal d'audit, via la propriété `reason` (jamais affichée au visiteur).
 *
 * Seul le verrouillage est signalé explicitement : l'utilisateur légitime
 * doit comprendre pourquoi il ne peut plus essayer, et cette information
 * n'est disponible qu'après 5 échecs — elle ne sert donc pas à énumérer.
 */
const GENERIC_LOGIN_ERROR = 'Identifiants incorrects.';

async function authenticate(username, password) {
  const key = normalizeUsername(username);
  const user = key ? await getUserByUsername(key) : null;

  if (!user) {
    // Calcul factice pour que la réponse prenne le même temps qu'avec un
    // compte réel : sans cela, la durée de réponse trahit l'existence du compte.
    await hashPassword(String(password || 'comparaison-a-vide')).catch(() => null);
    return { ok: false, error: GENERIC_LOGIN_ERROR, reason: 'utilisateur-inconnu', username: key };
  }

  if (isLocked(user)) {
    const minutes = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      error: `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      reason: 'verrouille', username: key, lockedUntil: user.lockedUntil
    };
  }

  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);

  if (!valid) {
    const failure = await registerFailure(user);
    return {
      ok: false, error: GENERIC_LOGIN_ERROR, reason: 'mot-de-passe-invalide',
      username: key, attempts: failure.attempts, lockedUntil: failure.lockedUntil
    };
  }

  if (user.active === false) {
    // Compte désactivé : même message générique, pour ne pas révéler qu'un
    // couple identifiant/mot de passe est correct.
    return { ok: false, error: GENERIC_LOGIN_ERROR, reason: 'compte-desactive', username: key };
  }

  await registerSuccess(user);
  return { ok: true, user: publicUser({ ...user, lastLoginAt: new Date().toISOString(), failedAttempts: 0, lockedUntil: null }) };
}

/** Résout l'acteur d'une requête à partir du jeton de session. */
async function resolveSession(token) {
  if (!token) return null;
  // Permissions du rôle telles qu'elles sont réglées au studio en ce moment.
  await actualiserRoles();
  const session = await touchSession(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user || user.active === false) {
    await deleteSession(token);
    return null;
  }
  return {
    actor: { ...publicUser(user), permissions: permissionsFor(user.role), degraded: false },
    session
  };
}

module.exports = {
  ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS,
  CATALOGUE_PERMISSIONS, TOUTES_PERMISSIONS, PERMISSION_VITALE,
  normaliserRoles, listeRoles, roleExiste, libelleRole, actualiserRoles, validerRole, enregistrerRole, supprimerRole,
  SESSION_TTL_MS, MAX_ATTEMPTS_BEFORE_LOCK, LOCK_STEPS_MINUTES,
  GENERIC_LOGIN_ERROR,
  configure, permissionsFor, can, publicUser, isLocked,
  normalizeUsername, isValidUsername, passwordProblem,
  hashPassword, verifyPassword,
  countUsers, listUsers, getUserById, getUserByUsername,
  createUser, updateUser, setPassword, deleteUser, countActiveOwners,
  RESET_TTL_MS, getUserByLogin, createPasswordReset, consumePasswordReset,
  createSession, resolveSession, deleteSession, deleteUserSessions, purgeExpiredSessions,
  authenticate
};
