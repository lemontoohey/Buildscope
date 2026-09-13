// Identity layer: accounts and sessions. Deliberately NOT routed through
// lib/store.js's pluggable backend -- who's signed in has to be knowable
// before we know which account's data to fetch, so it always lives
// straight in the local SQLite file, the same way Google Drive's own
// tokens (lib/google-auth.js) and the backend choice itself (lib/config.js)
// live outside the pluggable abstraction.

const crypto = require('node:crypto');
const { db, seedAccountDefaults } = require('../sqlite-db');

function getAccountById(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) || null;
}

function findAccountByProvider(provider, providerSub) {
  return db.prepare('SELECT * FROM accounts WHERE provider = ? AND provider_sub = ?').get(provider, providerSub) || null;
}

function findLegacyAccount() {
  // Only ever one of these -- created once, by sqlite-db.js's
  // migrateLegacyDataToAccount(), for pre-existing single-tenant data.
  return db.prepare("SELECT * FROM accounts WHERE provider = 'legacy'").get() || null;
}

function createAccount({ provider, providerSub, email, name }) {
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO accounts (provider, provider_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(provider, providerSub, email || null, name || null, now);
  const account = getAccountById(result.lastInsertRowid);
  seedAccountDefaults(account.id);
  return account;
}

function claimAccount(accountId, { provider, providerSub, email, name }) {
  db.prepare('UPDATE accounts SET provider = ?, provider_sub = ?, email = ?, name = ? WHERE id = ?').run(
    provider,
    providerSub,
    email || null,
    name || null,
    accountId
  );
  return getAccountById(accountId);
}

// Called from the OAuth callback routes once we know who just signed in.
// Three cases: (1) we've seen this exact provider+sub before -- welcome
// back; (2) nobody has claimed the pre-existing single-tenant data yet --
// hand it to this person, on the assumption the first person to ever sign
// in is whoever was already running the app; (3) neither -- brand new
// account, seeded with the same fresh-install defaults as always.
function findOrCreateAccountForIdentity({ provider, providerSub, email, name }) {
  const existing = findAccountByProvider(provider, providerSub);
  if (existing) return existing;

  const legacy = findLegacyAccount();
  if (legacy) return claimAccount(legacy.id, { provider, providerSub, email, name });

  return createAccount({ provider, providerSub, email, name });
}

// --- sessions --------------------------------------------------------
const SESSION_TTL_DAYS = 30;

function createSession(accountId) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (id, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    id,
    accountId,
    now.toISOString(),
    expires.toISOString()
  );
  return id;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return row;
}

function destroySession(sessionId) {
  if (!sessionId) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// --- email + password ------------------------------------------------
// Built on node:crypto's own scrypt, not bcrypt -- the app installs zero
// npm packages, and Node's built-in scrypt is a fine, modern KDF for this.
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [saltHex, keyHex] = storedHash.split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(keyHex, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, storedKey.length);
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, so that case is ruled out first.
  return storedKey.length === derivedKey.length && crypto.timingSafeEqual(storedKey, derivedKey);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// A password account's provider_sub is its normalised email -- reusing the
// same (provider, provider_sub) shape Google/Apple accounts use, so this
// stays a plain lookup rather than a special case.
function signUpWithPassword({ email, password, name }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error('Enter a valid email address.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (findAccountByProvider('password', normalized)) {
    throw new Error('An account with that email already exists -- try signing in instead.');
  }

  const passwordHash = hashPassword(password);
  const legacy = findLegacyAccount();
  const account = legacy
    ? claimAccount(legacy.id, { provider: 'password', providerSub: normalized, email: normalized, name })
    : createAccount({ provider: 'password', providerSub: normalized, email: normalized, name });
  db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(passwordHash, account.id);
  return getAccountById(account.id);
}

function verifyPasswordLogin({ email, password }) {
  const account = findAccountByProvider('password', normalizeEmail(email));
  if (!account || !account.password_hash) return null;
  if (!verifyPassword(password || '', account.password_hash)) return null;
  return account;
}

module.exports = {
  getAccountById,
  findOrCreateAccountForIdentity,
  signUpWithPassword,
  verifyPasswordLogin,
  createSession,
  getSession,
  destroySession,
};
