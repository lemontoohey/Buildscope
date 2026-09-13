// Sign-in page and the OAuth start/callback/logout handlers for both
// providers. Deliberately does not go through lib/layout.js's shared shell
// (that shell assumes a signed-in account with a build to show nav for) --
// this is a small standalone page shown before any of that exists.

const crypto = require('node:crypto');
const { redirect, sendHtml, readFormBody, parseCookies, setCookie, clearCookie } = require('../lib/http');
const identityGoogle = require('../lib/identity-google');
const identityApple = require('../lib/identity-apple');
const { findOrCreateAccountForIdentity, createSession, destroySession } = require('../lib/accounts');

const SESSION_COOKIE = 'bs_session';
const STATE_COOKIE = 'bs_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches lib/accounts.js's SESSION_TTL_DAYS

function renderLoginPage({ error } = {}) {
  const googleReady = identityGoogle.isConfigured();
  const appleReady = identityApple.isConfigured();
  const buttons = [];
  if (googleReady) {
    buttons.push(`<a href="/auth/google/start"
      class="flex items-center justify-center gap-2 w-full bg-white border border-stone-300 text-stone-800 px-4 py-2.5 rounded-lg font-medium hover:bg-stone-50 transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
      Continue with Google
    </a>`);
  }
  if (appleReady) {
    buttons.push(`<a href="/auth/apple/start"
      class="flex items-center justify-center gap-2 w-full bg-black text-white px-4 py-2.5 rounded-lg font-medium hover:bg-stone-900 transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
      Continue with Apple
    </a>`);
  }
  if (!buttons.length) {
    buttons.push(`<p class="text-sm text-stone-600">Sign-in isn't configured on this deployment yet -- see the README's "Setting up sign-in" section.</p>`);
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in - Buildscope</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen flex items-center justify-center bg-[#efe9df]">
  <div class="w-full max-w-sm mx-auto px-6">
    <div class="bg-white rounded-2xl shadow-lg border border-stone-200 p-8">
      <h1 class="text-2xl font-semibold text-[#2f1b4c] mb-1">Buildscope</h1>
      <p class="text-sm text-stone-600 mb-6">Sign in to get to your build.</p>
      ${error ? `<div class="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">${escapeHtml(error)}</div>` : ''}
      <div class="space-y-3">
        ${buttons.join('\n        ')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function handleLoginPage(req, res, helpers, query) {
  sendHtml(res, renderLoginPage({ error: query && query.error }));
}

function startOauth(res, identityModule, providerLabel) {
  if (!identityModule.isConfigured()) {
    return redirect(res, '/login?error=' + encodeURIComponent(`${providerLabel} sign-in is not set up yet.`));
  }
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, STATE_COOKIE, state, { maxAgeSeconds: 600 });
  redirect(res, identityModule.buildAuthUrl(state));
}

async function completeLogin(req, res, account) {
  const sessionId = createSession(account.id);
  clearCookie(res, STATE_COOKIE);
  setCookie(res, SESSION_COOKIE, sessionId, { maxAgeSeconds: SESSION_MAX_AGE });
  redirect(res, '/');
}

async function handleGoogleLoginStart(req, res) {
  startOauth(res, identityGoogle, 'Google');
}

async function handleGoogleLoginCallback(req, res, helpers, query) {
  const cookies = parseCookies(req);
  if (!query || query.error) {
    return redirect(res, '/login?error=' + encodeURIComponent('Google sign-in was cancelled.'));
  }
  if (!query.code) {
    return redirect(res, '/login?error=' + encodeURIComponent('Google sign-in did not return a code.'));
  }
  if (!query.state || query.state !== cookies[STATE_COOKIE]) {
    return redirect(res, '/login?error=' + encodeURIComponent('Sign-in session expired -- please try again.'));
  }
  try {
    const identity = await identityGoogle.exchangeCodeForIdentity(query.code);
    const account = findOrCreateAccountForIdentity(identity);
    await completeLogin(req, res, account);
  } catch (err) {
    redirect(res, '/login?error=' + encodeURIComponent(err.message));
  }
}

async function handleAppleLoginStart(req, res) {
  startOauth(res, identityApple, 'Apple');
}

async function handleAppleLoginCallback(req, res) {
  const cookies = parseCookies(req);
  let body;
  try {
    body = await readFormBody(req);
  } catch {
    return redirect(res, '/login?error=' + encodeURIComponent('Apple sign-in response could not be read.'));
  }
  if (!body.code) {
    return redirect(res, '/login?error=' + encodeURIComponent('Apple sign-in was cancelled.'));
  }
  if (!body.state || body.state !== cookies[STATE_COOKIE]) {
    return redirect(res, '/login?error=' + encodeURIComponent('Sign-in session expired -- please try again.'));
  }
  try {
    const identity = await identityApple.exchangeCodeForIdentity(body.code);
    if (body.user) {
      try {
        const parsed = JSON.parse(body.user);
        if (parsed && parsed.name) {
          identity.name = [parsed.name.firstName, parsed.name.lastName].filter(Boolean).join(' ') || null;
        }
      } catch {
        // Apple sent something unparseable in `user` -- not fatal, just no name.
      }
    }
    const account = findOrCreateAccountForIdentity(identity);
    await completeLogin(req, res, account);
  } catch (err) {
    redirect(res, '/login?error=' + encodeURIComponent(err.message));
  }
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) destroySession(cookies[SESSION_COOKIE]);
  clearCookie(res, SESSION_COOKIE);
  redirect(res, '/login');
}

module.exports = {
  SESSION_COOKIE,
  handleLoginPage,
  handleGoogleLoginStart,
  handleGoogleLoginCallback,
  handleAppleLoginStart,
  handleAppleLoginCallback,
  handleLogout,
};
