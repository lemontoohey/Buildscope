// Google Drive sign-in. Two different things live at two different levels:
//
//  - The Client ID/Secret identify this *app* (like how a Slack app has one
//    Client ID shared by everyone who installs it). Whoever sets this build
//    up (you) creates these once in Google Cloud Console and puts them in
//    .env — see README. Nobody using the app day to day ever sees them.
//  - The tokens below are the specific Google account someone connected via
//    the Settings page's "Connect Google Drive" button. Stored locally in
//    data/google-tokens.json, independent of which data backend is active —
//    same reasoning as DOCS_DIR / backend-config.json.
//
// Scope is drive.file only: this app can see and edit just the one file it
// creates for its own data, never anything else in the person's Drive.

const fs = require('node:fs');
const path = require('node:path');

const TOKENS_PATH = path.join(__dirname, '..', 'data', 'google-tokens.json');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function isGoogleClientConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth/google/callback`;
}

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.mkdirSync(path.dirname(TOKENS_PATH), { recursive: true });
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function disconnect() {
  try {
    fs.unlinkSync(TOKENS_PATH);
  } catch {
    // Already disconnected — fine.
  }
}

async function exchangeCodeForTokens(code) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google sign-in failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const existing = readTokens();
  const tokens = {
    access_token: data.access_token,
    // Google only sends a refresh_token on the very first consent (with
    // prompt=consent we always ask, but keep the old one as a fallback
    // just in case a re-connect ever comes back without one).
    refresh_token: data.refresh_token || existing?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(tokens) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google sign-in expired and could not refresh (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const next = { ...tokens, access_token: data.access_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
  saveTokens(next);
  return next;
}

async function getAccessToken() {
  let tokens = readTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Google Drive is not connected yet — go to Settings and click "Connect Google Drive".');
  }
  if (!tokens.expires_at || Date.now() > tokens.expires_at) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens.access_token;
}

function isConnected() {
  const tokens = readTokens();
  return Boolean(tokens && tokens.refresh_token);
}

module.exports = {
  isGoogleClientConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  isConnected,
  disconnect,
};
