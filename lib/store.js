// Data-access abstraction. Three backends, same shape:
//
//  - sqlite (default): node:sqlite, local file, zero setup.
//  - supabase: Postgres via Supabase's REST API (PostgREST), reached with
//    plain fetch — no `pg` driver, no npm install.
//  - google_drive: one JSON file in the person's own Google Drive, read and
//    rewritten with plain fetch against the Drive API — no Google client
//    library needed. The easiest cloud option for someone non-technical:
//    "Connect Google Drive" is a much smaller ask than "create a Supabase
//    project and paste in a URL and a key".
//
// Routes call this generic interface (listAll/getById/getWhere/insert/update)
// instead of writing SQL directly, so the same route code works against any
// backend. Joins and aggregation that used to be SQL now happen in plain JS
// in the route files — simple enough at this scale, and it keeps every
// backend an honest implementation of the same handful of operations.
//
// Which backend is active comes from lib/config.js (set from the Settings
// page) rather than being fixed at process start, so switching backends
// there takes effect on the very next request — nobody has to know what
// "restart the server" means.

const { getBackendConfig } = require('./config');

// node:sqlite refuses to bind raw JS booleans — normalize to 0/1 so route
// code can pass real booleans either way (Supabase accepts them natively).
function toSqliteValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function buildSqliteStore() {
  const { db } = require('../sqlite-db');

  function listAll(table, { orderBy } = {}) {
    const sql = orderBy ? `SELECT * FROM ${table} ORDER BY ${orderBy}` : `SELECT * FROM ${table}`;
    return Promise.resolve(db.prepare(sql).all());
  }

  function getById(table, id) {
    return Promise.resolve(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) || null);
  }

  function getWhere(table, filters = {}, { orderBy } = {}) {
    const keys = Object.keys(filters);
    const where = keys.length ? 'WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ') : '';
    const orderClause = orderBy ? ` ORDER BY ${orderBy}` : '';
    const sql = `SELECT * FROM ${table} ${where}${orderClause}`;
    return Promise.resolve(db.prepare(sql).all(...keys.map((k) => toSqliteValue(filters[k]))));
  }

  function insert(table, data) {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const result = db.prepare(sql).run(...keys.map((k) => toSqliteValue(data[k])));
    if (data.id !== undefined) {
      return getById(table, data.id);
    }
    return getById(table, result.lastInsertRowid);
  }

  function update(table, id, data) {
    const keys = Object.keys(data);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(
      ...keys.map((k) => toSqliteValue(data[k])),
      id
    );
    return getById(table, id);
  }

  function count(table, filters = {}) {
    const keys = Object.keys(filters);
    const where = keys.length ? 'WHERE ' + keys.map((k) => `${k} = ?`).join(' AND ') : '';
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`)
      .get(...keys.map((k) => filters[k]));
    return Promise.resolve(row.n);
  }

  async function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  async function setSetting(key, value) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  }

  function remove(table, id) {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return Promise.resolve(true);
  }

  return { backend: 'sqlite', listAll, getById, getWhere, insert, update, remove, count, getSetting, setSetting };
}

// Converts our "column" / "column desc" convention (same string used for
// the sqlite backend's raw SQL) into PostgREST's "column.asc" / "column.desc".
function toPostgrestOrder(orderBy) {
  const parts = orderBy.trim().split(/\s+/);
  const column = parts[0];
  const direction = (parts[1] || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  return `${column}.${direction}`;
}

function buildSupabaseStore(cfg) {
  const BASE = `${cfg.supabase_url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: cfg.supabase_key,
    Authorization: `Bearer ${cfg.supabase_key}`,
    'content-type': 'application/json',
  };

  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    } catch (err) {
      // DNS failure, connection refused, bad URL, etc. — thrown before
      // there's any HTTP response to check .ok on. Most likely cause is a
      // mistyped project URL, so point back at Settings rather than a raw
      // "fetch failed".
      throw new Error(`Supabase error — couldn't reach ${BASE} (check the project URL on Settings): ${err.message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase REST error ${res.status} on ${path}: ${text.slice(0, 300)}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function listAll(table, { orderBy } = {}) {
    const order = orderBy ? `&order=${encodeURIComponent(toPostgrestOrder(orderBy))}` : '';
    return request(`/${table}?select=*${order}`);
  }

  async function getById(table, id) {
    const rows = await request(`/${table}?select=*&id=eq.${encodeURIComponent(id)}`);
    return rows[0] || null;
  }

  function getWhere(table, filters = {}, { orderBy } = {}) {
    const filterParams = Object.entries(filters)
      .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
      .join('&');
    const order = orderBy ? `&order=${encodeURIComponent(toPostgrestOrder(orderBy))}` : '';
    const qs = [filterParams, order.replace(/^&/, '')].filter(Boolean).join('&');
    return request(`/${table}?select=*${qs ? '&' + qs : ''}`);
  }

  async function insert(table, data) {
    const rows = await request(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });
    return rows[0];
  }

  async function update(table, id, data) {
    const rows = await request(`/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });
    return rows[0];
  }

  async function count(table, filters = {}) {
    const rows = await getWhere(table, filters);
    return rows.length;
  }

  async function getSetting(key) {
    const rows = await request(`/settings?select=value&key=eq.${encodeURIComponent(key)}`);
    return rows[0] ? rows[0].value : null;
  }

  async function setSetting(key, value) {
    await request('/settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key, value }),
    });
  }

  async function remove(table, id) {
    await request(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  }

  return { backend: 'supabase', listAll, getById, getWhere, insert, update, remove, count, getSetting, setSetting };
}

// --- Google Drive backend -------------------------------------------------
// The whole "database" is one JSON file (owner-build-tracker-data.json) in a
// drive.file-scoped app folder — this app can only ever see files it
// creates itself, never anything else in the person's Drive. Loaded once
// per connection and kept in memory; every mutation rewrites the file.
// Fine at this app's scale (one household, not concurrent multi-user
// writes) and it means reads don't hit the network on every page view.

function buildGoogleDriveStore() {
  const { getAccessToken } = require('./google-auth');
  const { buildInitialState } = require('./seed-data');

  const FILE_NAME = 'owner-build-tracker-data.json';
  const BOUNDARY = 'hcbt_boundary_7c2f91';

  let state = null;
  let fileId = null;
  let loadingPromise = null;

  async function driveFetch(url, options = {}) {
    const token = await getAccessToken();
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
    } catch (err) {
      throw new Error(`Google Drive error — couldn't reach Google: ${err.message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Drive error ${res.status}: ${text.slice(0, 300)}`);
    }
    return res;
  }

  function buildMultipartBody(dataObj) {
    const metadata = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
    const content = JSON.stringify(dataObj);
    return (
      `--${BOUNDARY}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${BOUNDARY}\r\ncontent-type: application/json\r\n\r\n${content}\r\n` +
      `--${BOUNDARY}--`
    );
  }

  async function findOrCreateFile() {
    if (fileId) return fileId;
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const listRes = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`
    );
    const listData = await listRes.json();
    if (listData.files && listData.files.length) {
      fileId = listData.files[0].id;
      return fileId;
    }
    // First time this Google account has connected — create the file
    // pre-seeded with the same starting categories/stages/checklist a
    // brand-new local database gets.
    const initial = buildInitialState();
    const createRes = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${BOUNDARY}` },
      body: buildMultipartBody(initial),
    });
    const createData = await createRes.json();
    fileId = createData.id;
    state = initial;
    return fileId;
  }

  async function load() {
    if (state) return state;
    if (!loadingPromise) {
      loadingPromise = (async () => {
        await findOrCreateFile();
        if (state) return state; // findOrCreateFile just created + seeded it
        const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        const text = await res.text();
        const { ensureEstimatingState } = require('./seed-data');
        const parsed = text ? JSON.parse(text) : buildInitialState();
        const hadSuppliers = parsed.tables && parsed.tables.suppliers && parsed.tables.suppliers.length;
        state = ensureEstimatingState(parsed);
        if (!hadSuppliers && state.tables.suppliers.length) {
          await persist();
        }
        return state;
      })();
    }
    try {
      return await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  async function persist() {
    await findOrCreateFile();
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
  }

  function ensureTable(table) {
    if (!state.tables[table]) state.tables[table] = [];
    if (state.nextIds[table] === undefined) state.nextIds[table] = 1;
  }

  function sortRows(rows, orderBy) {
    if (!orderBy) return rows;
    const [col, dir] = orderBy.trim().split(/\s+/);
    const mult = (dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * mult);
  }

  async function listAll(table, { orderBy } = {}) {
    await load();
    ensureTable(table);
    return sortRows(state.tables[table], orderBy);
  }

  async function getById(table, id) {
    await load();
    ensureTable(table);
    return state.tables[table].find((r) => String(r.id) === String(id)) || null;
  }

  async function getWhere(table, filters = {}, { orderBy } = {}) {
    await load();
    ensureTable(table);
    const rows = state.tables[table].filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
    return sortRows(rows, orderBy);
  }

  async function insert(table, data) {
    await load();
    ensureTable(table);
    const row = { ...data };
    if (row.id === undefined) {
      row.id = state.nextIds[table]++;
    } else if (typeof row.id === 'number') {
      state.nextIds[table] = Math.max(state.nextIds[table], row.id + 1);
    }
    state.tables[table].push(row);
    await persist();
    return row;
  }

  async function update(table, id, data) {
    await load();
    ensureTable(table);
    const row = state.tables[table].find((r) => String(r.id) === String(id));
    if (!row) return null;
    Object.assign(row, data);
    await persist();
    return row;
  }

  async function count(table, filters = {}) {
    const rows = await getWhere(table, filters);
    return rows.length;
  }

  async function getSetting(key) {
    await load();
    ensureTable('settings');
    const row = state.tables.settings.find((r) => r.key === key);
    return row ? row.value : null;
  }

  async function setSetting(key, value) {
    await load();
    ensureTable('settings');
    const row = state.tables.settings.find((r) => r.key === key);
    if (row) row.value = value;
    else state.tables.settings.push({ key, value });
    await persist();
  }

  async function remove(table, id) {
    await load();
    ensureTable(table);
    const idx = state.tables[table].findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return false;
    state.tables[table].splice(idx, 1);
    await persist();
    return true;
  }

  return { backend: 'google_drive', listAll, getById, getWhere, insert, update, remove, count, getSetting, setSetting };
}

// --- Backend selection, hot-swappable -------------------------------------
// Built once per distinct config and cached — so a page load right after
// changing Settings doesn't reconnect to Drive/Supabase on every single call
// within the same request, but a genuine backend change (or newly-pasted
// Supabase key) takes effect on the very next request either way.

let cachedKey = null;
let cachedInstance = null;

function getStoreInstance() {
  const cfg = getBackendConfig();
  // Only the fields that actually change which backend gets built — an AI
  // key edit shouldn't tear down an already-loaded Google Drive connection.
  const key = `${cfg.backend}|${cfg.supabase_url}|${cfg.supabase_key}`;
  if (key !== cachedKey) {
    if (cfg.backend === 'supabase' && cfg.supabase_url && cfg.supabase_key) {
      cachedInstance = buildSupabaseStore(cfg);
    } else if (cfg.backend === 'google_drive') {
      cachedInstance = buildGoogleDriveStore();
    } else {
      // Either an explicit "local" choice, or "supabase"/"google_drive"
      // picked but not finished being set up yet (e.g. Supabase chosen but
      // no URL/key pasted in). Falling back to local SQLite here means the
      // app still works while someone's half-way through connecting a
      // cloud backend, instead of failing to start at all.
      cachedInstance = buildSqliteStore();
    }
    cachedKey = key;
  }
  return cachedInstance;
}

// Routes import `store` once at require-time and call store.listAll(...) etc
// directly, so this is a thin Proxy that resolves to whichever backend is
// currently configured on every call, rather than a plain object fixed at
// startup.
const store = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'backend') return getStoreInstance().backend;
      if (prop === 'then') return undefined; // don't look like a thenable to accidental `await store`
      return (...args) => getStoreInstance()[prop](...args);
    },
  }
);

module.exports = { store };
