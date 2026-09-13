// Google Sign-In for LOGGING IN, distinct from lib/google-auth.js (which
// connects a specific account's Google Drive as a data-storage backend and
// asks for drive.file). This module asks for openid/email/profile instead,
// and only ever uses the tokens once, at the moment someone signs in, to
// learn who they are -- nothing here is stored for later API calls.
//
// Reuses the same GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET as the Drive
// connection -- Google lets one OAuth client request different scopes on
// different requests, so there's no need for a second Cloud Console project
// just to add login.

const REDIRECT_PATH = '/auth/google/callback';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'openid email profile';

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri() {
  return process.env.GOOGLE_LOGIN_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}${REDIRECT_PATH}`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function decodeIdTokenPayload(idToken) {
  const parts = idToken.split('.');
  if (parts.length < 2) throw new Error('Malformed Google identity token.');
  const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

async function exchangeCodeForIdentity(code) {
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
  if (!data.id_token) throw new Error('Google sign-in did not return an identity token.');
  const payload = decodeIdTokenPayload(data.id_token);
  return {
    provider: 'google',
    providerSub: payload.sub,
    email: payload.email || null,
    name: payload.name || payload.email || null,
  };
}

module.exports = { isConfigured, buildAuthUrl, exchangeCodeForIdentity, getRedirectUri };
