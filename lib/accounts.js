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

module.exports = {
  getAccountById,
  findOrCreateAccountForIdentity,
  createSession,
  getSession,
  destroySession,
};
