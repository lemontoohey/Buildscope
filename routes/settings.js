const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { getAiConfig, saveAiConfig, PROVIDERS } = require('../lib/ai');
const { getBackendConfig, saveBackendConfig } = require('../lib/config');
const googleAuth = require('../lib/google-auth');
const xeroAuth = require('../lib/xero-auth');

const PROVIDER_LABELS = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)' };

function backendCard({ id, emoji, title, description, isActive, bodyHtml }) {
  return `<div class="rounded-lg border-2 ${
    isActive ? 'border-[#4f6070]' : 'border-slate-200'
  } bg-white p-5 mb-4">
    <div class="flex items-start gap-3">
      <span class="text-2xl leading-none">${emoji}</span>
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-lg">${escapeHtml(title)}</h3>
          ${isActive ? '<span class="text-xs px-2 py-0.5 rounded-full bg-[#4f6070] text-white">In use now</span>' : ''}
        </div>
        <p class="text-sm text-slate-600 mt-0.5 mb-3">${description}</p>
        <div id="${id}">${bodyHtml}</div>
      </div>
    </div>
  </div>`;
}

async function handleSettingsPage(req, res, { sendHtml }, flash) {
  const cfg = getBackendConfig();
  const { provider, key } = await getAiConfig();
  const maskedKey = key ? `•••• ${key.slice(-4)}` : null;
  const googleConnected = googleAuth.isConnected();
  const googleReady = googleAuth.isGoogleClientConfigured();

  const providerOptions = PROVIDERS.map(
    (p) => `<option value="${p}" ${p === provider ? 'selected' : ''}>${PROVIDER_LABELS[p]}</option>`
  ).join('');

  // --- "Where is your data stored?" — three plain-language options -------
  const localCard = backendCard({
    id: 'card-local',
    emoji: '💻',
    title: 'This computer only',
    description: 'No setup needed. Your data stays in a file on this computer — nothing to connect.',
    isActive: cfg.backend === 'sqlite',
    bodyHtml:
      cfg.backend === 'sqlite'
        ? ''
        : `<form method="post" action="/settings/backend/local">
             <button class="text-sm bg-[#9b1b15] hover:bg-[#7a1611] text-white px-3 py-1.5 rounded transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]">
               Switch to this computer only
             </button>
           </form>`,
  });

  let driveBody;
  if (!googleReady) {
    driveBody = `<p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
      Not set up yet — whoever installed this app needs to finish the one-time Google setup in the README before this option can be used.
    </p>`;
  } else if (googleConnected) {
    driveBody = `<div class="flex items-center gap-3 flex-wrap">
      <span class="text-sm text-emerald-700">✓ Your Google account is connected.</span>
      ${
        cfg.backend !== 'google_drive'
          ? `<form method="post" action="/settings/backend/google_drive">
               <button class="text-sm bg-[#9b1b15] hover:bg-[#7a1611] text-white px-3 py-1.5 rounded transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]">Use Google Drive</button>
             </form>`
          : ''
      }
      <form method="post" action="/settings/google/disconnect">
        <button class="text-sm text-red-700 hover:underline">Disconnect</button>
      </form>
    </div>`;
  } else {
    driveBody = `<a href="/oauth/google/start"
      class="inline-block text-sm bg-[#9b1b15] hover:bg-[#7a1611] text-white px-3 py-1.5 rounded transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]">
      Connect Google Drive
    </a>`;
  }
  const driveCard = backendCard({
    id: 'card-drive',
    emoji: '☁️',
    title: 'Google Drive',
    description:
      'The easy cloud option. Click connect, sign in with the Google account you already have, and your data backs up there automatically. This app can only see the one file it creates — nothing else in your Drive.',
    isActive: cfg.backend === 'google_drive',
    bodyHtml: driveBody,
  });

  // --- Xero accounting sync (scaffolding) — separate from the data
  // backend above; this is about pushing transactions out to Xero, not
  // about where this app's own data lives.
  const xeroConnected = xeroAuth.isConnected();
  const xeroReady = xeroAuth.isXeroClientConfigured();
  let xeroBody;
  if (!xeroReady) {
    xeroBody = `<p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
      Not set up yet — whoever installed this app needs to finish the one-time Xero Developer setup in the README before this option can be used.
    </p>`;
  } else if (xeroConnected) {
    xeroBody = `<div class="flex items-center gap-3 flex-wrap">
      <span class="text-sm text-emerald-700">✓ Connected${
        xeroAuth.getTenantName() ? ' to ' + escapeHtml(xeroAuth.getTenantName()) : ''
      }.</span>
      <form method="post" action="/settings/xero/disconnect">
        <button class="text-sm text-red-700 hover:underline">Disconnect</button>
      </form>
    </div>`;
  } else {
    xeroBody = `<a href="/oauth/xero/start"
      class="inline-block text-sm bg-[#9b1b15] hover:bg-[#7a1611] text-white px-3 py-1.5 rounded transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]">
      Connect Xero
    </a>`;
  }
  const xeroCard = `<div class="rounded-lg border-2 border-slate-200 bg-white p-5 mb-4">
    <div class="flex items-start gap-3">
      <span class="text-2xl leading-none">🧾</span>
      <div class="flex-1">
        <h3 class="font-semibold text-lg">Xero</h3>
        <p class="text-sm text-slate-600 mt-0.5 mb-3">
          Optional. Once connected, transactions on the Dashboard get a "→ Xero" button that pushes that
          receipt into Xero as a bill, ready for your accountant to code — this app doesn't try to guess
          GST treatment or account codes, Xero (and your accountant) stay in charge of that.
        </p>
        <div>${xeroBody}</div>
      </div>
    </div>
  </div>`;

  const body = `
    <h1 class="text-2xl font-bold mb-2">Settings</h1>

    <h2 class="text-lg font-semibold mt-6 mb-1">Where is your data stored?</h2>
    <p class="text-sm text-slate-600 mb-4">
      Pick one. You can change your mind later — switching here never deletes anything.
    </p>
    ${localCard}
    ${driveCard}

    <h2 class="text-lg font-semibold mt-10 mb-1">Accounting sync</h2>
    <p class="text-sm text-slate-600 mb-4">Optional — send transactions straight into your accounting software.</p>
    ${xeroCard}

    <h2 class="text-lg font-semibold mt-10 mb-1">AI receipt reading</h2>
    <p class="text-sm text-slate-600 mb-4">
      Optional. Pick whichever AI provider you already use and paste in your own API key, and receipt parsing turns on immediately.
    </p>
    <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg">
      <form method="post" action="/settings/ai" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Provider</label>
          <select name="provider" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            ${providerOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">API key</label>
          <input type="password" name="key" placeholder="${
            maskedKey ? 'Currently set: ' + escapeHtml(maskedKey) + ' — paste a new key to replace it' : 'sk-... or your provider\'s key'
          }"
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <p class="text-xs text-slate-500 mt-1">
            Anthropic keys come from console.anthropic.com. OpenAI keys come from platform.openai.com.
            Stored only on this computer — never sent anywhere except that provider's API.
          </p>
        </div>
        <button class="bg-[#9b1b15] hover:bg-[#7a1611] text-white px-4 py-2 rounded text-sm transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]">Save</button>
      </form>
      ${
        key
          ? `<div class="mt-4 text-sm text-emerald-700">✓ AI receipt parsing is on (${escapeHtml(
              PROVIDER_LABELS[provider]
            )}, key ending ${escapeHtml(key.slice(-4))}).</div>`
          : `<div class="mt-4 text-sm text-amber-700">AI receipt parsing is off until a key is added.</div>`
      }
    </div>
  `;

  sendHtml(res, layout({ title: 'Settings', activePath: '/settings', body, flash }));
}

async function handleSettingsAiUpdate(req, res) {
  const form = await readFormBody(req);
  await saveAiConfig({ provider: form.provider, key: form.key ? form.key.trim() : null });
  redirect(res, '/settings?flash=' + encodeURIComponent('Settings saved.'));
}

async function handleSettingsBackendLocal(req, res) {
  saveBackendConfig({ backend: 'sqlite' });
  redirect(res, '/settings?flash=' + encodeURIComponent('Now using this computer only.'));
}

async function handleSettingsBackendGoogleDrive(req, res) {
  if (!googleAuth.isConnected()) {
    return redirect(
      res,
      '/settings?flash=' + encodeURIComponent('Connect Google Drive first, then switch to it.')
    );
  }
  saveBackendConfig({ backend: 'google_drive' });
  redirect(res, '/settings?flash=' + encodeURIComponent('Now using Google Drive.'));
}

async function handleGoogleOauthStart(req, res) {
  if (!googleAuth.isGoogleClientConfigured()) {
    return redirect(
      res,
      '/settings?flash=' + encodeURIComponent('Google Drive is not set up on this install yet — see the README.')
    );
  }
  redirect(res, googleAuth.buildAuthUrl());
}

async function handleGoogleOauthCallback(req, res, { sendHtml }, query) {
  if (query.error) {
    return redirect(res, '/settings?flash=' + encodeURIComponent('Google sign-in was cancelled.'));
  }
  if (!query.code) {
    return redirect(res, '/settings?flash=' + encodeURIComponent('Google sign-in did not return a code.'));
  }
  try {
    await googleAuth.exchangeCodeForTokens(query.code);
    // Connecting is the whole point of clicking the button — switch to it
    // right away instead of making someone find a second "use it" button.
    saveBackendConfig({ backend: 'google_drive' });
    redirect(res, '/settings?flash=' + encodeURIComponent('Google Drive connected — now using it for your data.'));
  } catch (err) {
    redirect(res, '/settings?flash=' + encodeURIComponent('Google sign-in failed: ' + err.message));
  }
}

async function handleGoogleDisconnect(req, res) {
  googleAuth.disconnect();
  const cfg = getBackendConfig();
  if (cfg.backend === 'google_drive') {
    saveBackendConfig({ backend: 'sqlite' });
  }
  redirect(res, '/settings?flash=' + encodeURIComponent('Google Drive disconnected.'));
}

async function handleXeroOauthStart(req, res) {
  if (!xeroAuth.isXeroClientConfigured()) {
    return redirect(
      res,
      '/settings?flash=' + encodeURIComponent('Xero is not set up on this install yet — see the README.')
    );
  }
  redirect(res, xeroAuth.buildAuthUrl());
}

async function handleXeroOauthCallback(req, res, { sendHtml }, query) {
  if (query.error) {
    return redirect(res, '/settings?flash=' + encodeURIComponent('Xero sign-in was cancelled.'));
  }
  if (!query.code) {
    return redirect(res, '/settings?flash=' + encodeURIComponent('Xero sign-in did not return a code.'));
  }
  try {
    await xeroAuth.exchangeCodeForTokens(query.code);
    redirect(res, '/settings?flash=' + encodeURIComponent('Xero connected.'));
  } catch (err) {
    redirect(res, '/settings?flash=' + encodeURIComponent('Xero sign-in failed: ' + err.message));
  }
}

async function handleXeroDisconnect(req, res) {
  xeroAuth.disconnect();
  redirect(res, '/settings?flash=' + encodeURIComponent('Xero disconnected.'));
}

module.exports = {
  handleSettingsPage,
  handleSettingsAiUpdate,
  handleSettingsBackendLocal,
  handleSettingsBackendGoogleDrive,
  handleGoogleOauthStart,
  handleGoogleOauthCallback,
  handleGoogleDisconnect,
  handleXeroOauthStart,
  handleXeroOauthCallback,
  handleXeroDisconnect,
};
