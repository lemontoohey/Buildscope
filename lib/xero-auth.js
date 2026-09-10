// Xero accounting sync — sign-in half. Deliberately modelled on
// lib/google-auth.js (same shape: a Client ID/Secret for the app itself,
// set once in .env by whoever installs this; tokens for the specific Xero
// organisation someone connects via Settings, stored locally).
//
// Xero's OAuth has one extra step Google's doesn't: after the token
// exchange, you have an access token but not yet an organisation to act
// on — a separate call to /connections lists the Xero orgs (called
// "tenants") the person just authorised, and you pick one. This app is
// built for one business at a time, so it just takes the first tenant.
//
// This is scaffolding: the flow is complete and follows Xero's documented
// OAuth2 + Connections API exactly, but it hasn't been exercised against a
// real Xero Developer app yet (that needs its own Client ID/Secret from
// developer.xero.com, the same way Google Drive needed its own Cloud
// Console project — see the README section on turning this on).

const fs = require('node:fs');
const path = require('node:path');

const TOKENS_PATH = path.join(__dirname, '..', 'data', 'xero-tokens.json');
const XERO_SCOPE = 'offline_access accounting.transactions accounting.contacts';
const AUTH_ENDPOINT = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_ENDPOINT = 'https://identity.xero.com/connect/token';
const CONNECTIONS_ENDPOINT = 'https://api.xero.com/connections';

function isXeroClientConfigured() {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
}

function getRedirectUri() {
  return process.env.XERO_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth/xero/callback`;
}

function buildAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: XERO_SCOPE,
    state: 'owner-build-tracker',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
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

async function fetchTenantId(accessToken) {
  const response = await fetch(CONNECTIONS_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Could not list connected Xero organisations (${response.status}).`);
  }
  const connections = await response.json();
  if (!connections.length) {
    throw new Error('Signed in, but no Xero organisation was authorised — try connecting again and tick an organisation.');
  }
  // One business at a time — take the first (and usually only) org offered.
  return { tenantId: connections[0].tenantId, tenantName: connections[0].tenantName };
}

async function exchangeCodeForTokens(code) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: process.env.XERO_CLIENT_ID,
      client_secret: process.env.XERO_CLIENT_SECRET,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Xero sign-in failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const { tenantId, tenantName } = await fetchTenantId(data.access_token);
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    tenant_id: tenantId,
    tenant_name: tenantName,
  };
  saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(tokens) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: process.env.XERO_CLIENT_ID,
      client_secret: process.env.XERO_CLIENT_SECRET,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Xero sign-in expired and could not refresh (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  // Xero rotates the refresh token on every use — the old one stops working.
  const next = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(next);
  return next;
}

async function getAccessToken() {
  let tokens = readTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Xero is not connected yet — go to Settings and click "Connect Xero".');
  }
  if (!tokens.expires_at || Date.now() > tokens.expires_at) {
    tokens = await refreshAccessToken(tokens);
  }
  return { accessToken: tokens.access_token, tenantId: tokens.tenant_id, tenantName: tokens.tenant_name };
}

function isConnected() {
  const tokens = readTokens();
  return Boolean(tokens && tokens.refresh_token);
}

function getTenantName() {
  const tokens = readTokens();
  return tokens?.tenant_name || null;
}

module.exports = {
  isXeroClientConfigured,
  buildAuthUrl,
  exchangeCodeForTokens,
  getAccessToken,
  isConnected,
  disconnect,
  getTenantName,
};
