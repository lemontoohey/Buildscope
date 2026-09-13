// Sign in with Apple. Needs a real Apple Developer Program membership
// (US$99/year) and some one-time setup only Liam can do himself in Apple's
// developer portal -- see README's "Turning on Apple Sign-In" section for
// the exact steps. Until the four env vars below are all set, isConfigured()
// returns false and the login page simply doesn't show an Apple button, the
// same pattern lib/google-auth.js already uses for "not set up yet".
//
// Required env vars:
//   APPLE_TEAM_ID           -- Apple Developer Team ID (top right of the
//                              developer portal, e.g. "A1B2C3D4E5")
//   APPLE_SERVICES_ID       -- the Services ID you create for this app --
//                              acts as the OAuth "client_id"
//   APPLE_KEY_ID            -- the Key ID of the "Sign In with Apple" key
//                              you generate (Keys section of the portal)
//   APPLE_PRIVATE_KEY       -- the full contents of the .p8 file that key
//                              download gives you, exactly as downloaded
//                              (can only be downloaded once -- keep it safe)
//   APPLE_LOGIN_REDIRECT_URI (optional) -- defaults to localhost for local
//                              dev; must be the exact Return URL registered
//                              against the Services ID for production

const crypto = require('node:crypto');

const REDIRECT_PATH = '/auth/apple/callback';

function isConfigured() {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_SERVICES_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
  );
}

function getRedirectUri() {
  return process.env.APPLE_LOGIN_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}${REDIRECT_PATH}`;
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Apple's OAuth "client_secret" isn't a fixed string like Google's -- it's a
// short-lived JWT signed with the private key from your Sign In with Apple
// key, regenerated fresh here for every token exchange so nothing sensitive
// beyond the .p8 key itself needs to be stored anywhere.
function buildClientSecret() {
  const header = { alg: 'ES256', kid: process.env.APPLE_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: process.env.APPLE_SERVICES_ID,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = process.env.APPLE_PRIVATE_KEY.includes('\\n')
    ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : process.env.APPLE_PRIVATE_KEY;
  // dsaEncoding: 'ieee-p1363' gets Node's crypto to hand back the raw r||s
  // signature JOSE/JWT expects for ES256, instead of the DER format
  // crypto.sign() defaults to -- no separate JWT library needed.
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(signature)}`;
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_SERVICES_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'name email',
    response_mode: 'form_post',
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

async function exchangeCodeForIdentity(code) {
  const clientSecret = buildClientSecret();
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.APPLE_SERVICES_ID,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Apple sign-in failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  if (!data.id_token) throw new Error('Apple sign-in did not return an identity token.');
  const parts = data.id_token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  return {
    provider: 'apple',
    providerSub: payload.sub,
    email: payload.email || null,
    // Apple only ever sends the person's name in the original form POST
    // (a separate `user` JSON field), the very first time they authorize --
    // never in the token itself. routes/auth.js fills this in from that
    // field when present; on every later sign-in it's just null here.
    name: null,
  };
}

module.exports = { isConfigured, buildAuthUrl, exchangeCodeForIdentity, getRedirectUri };
