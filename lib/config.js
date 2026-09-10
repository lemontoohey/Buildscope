// Which data backend is active, and that backend's connection details —
// always stored locally on this machine (data/backend-config.json),
// regardless of which backend is actually chosen. Same idea as DOCS_DIR in
// db.js: the app needs to know how to find itself before it can decide
// where the real data lives, so this one small file lives outside the
// backend abstraction.
//
// This is deliberately editable from the Settings page rather than only
// from .env, so switching backends never requires opening a text editor —
// whoever runs this app day to day might not be comfortable doing that.

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'backend-config.json');

const DEFAULTS = {
  backend: 'sqlite', // 'sqlite' | 'supabase' | 'google_drive'
  supabase_url: '',
  supabase_key: '',
  // AI receipt parsing is a per-machine credential (like whose Google
  // account is connected), not "data" — kept here rather than inside the
  // pluggable data backend so it works no matter which backend is active,
  // even mid-way through connecting one.
  ai_provider: '',
  ai_api_key: '',
};

function readConfigFile() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Returns the active backend config. If no choice has ever been made on
// the Settings page, falls back to the old env-var-only behaviour (Phase 3):
// SUPABASE_URL + SUPABASE_KEY set in .env means "use Supabase".
function getBackendConfig() {
  const file = readConfigFile();
  if (file) {
    const merged = { ...DEFAULTS, ...file };
    if (!merged.supabase_url) merged.supabase_url = process.env.SUPABASE_URL || '';
    if (!merged.supabase_key) merged.supabase_key = process.env.SUPABASE_KEY || '';
    return merged;
  }
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    return { ...DEFAULTS, backend: 'supabase', supabase_url: process.env.SUPABASE_URL, supabase_key: process.env.SUPABASE_KEY };
  }
  return { ...DEFAULTS };
}

function saveBackendConfig(partial) {
  const current = readConfigFile() || { ...DEFAULTS };
  const next = { ...current, ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { getBackendConfig, saveBackendConfig };
