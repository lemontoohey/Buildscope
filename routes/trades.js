const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, todayIso } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');

function daysBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function insuranceBadge(expiry) {
  if (!expiry) return '<span class="text-xs text-slate-400">Not on file</span>';
  const today = todayIso();
  const daysLeft = daysBetween(today, expiry);
  if (daysLeft < 0) {
    return `<span class="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Expired ${escapeHtml(expiry)}</span>`;
  }
  if (daysLeft <= 30) {
    return `<span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Expires in ${daysLeft}d (${escapeHtml(
      expiry
    )})</span>`;
  }
  return `<span class="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Valid to ${escapeHtml(expiry)}</span>`;
}

async function handleTradesPage(req, res, { sendHtml }, flash) {
  const allTrades = await store.listAll('trades');
  const trades = [...allTrades].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const expiringSoon = trades.filter((t) => {
    if (!t.insurance_expiry) return false;
    return daysBetween(todayIso(), t.insurance_expiry) <= 30;
  });

  const alertBanner = expiringSoon.length
    ? `<div class="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
        <strong>${expiringSoon.length} trade${expiringSoon.length === 1 ? '' : 's'}</strong> with insurance expired or expiring within 30 days:
        ${expiringSoon.map((t) => escapeHtml(t.name)).join(', ')}.
       </div>`
    : '';

  const rows = trades
    .map(
      (t) => `<tr class="border-b border-slate-100 align-top">
        <td class="py-2 pr-4">
          <div class="font-medium">${escapeHtml(t.name)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(t.trade_type || '')}</div>
        </td>
        <td class="py-2 pr-4 text-sm">
          ${t.phone ? `<div>${escapeHtml(t.phone)}</div>` : ''}
          ${t.email ? `<div>${escapeHtml(t.email)}</div>` : ''}
        </td>
        <td class="py-2 pr-4 text-sm">${escapeHtml(t.licence_number || '—')}</td>
        <td class="py-2 pr-4">${insuranceBadge(t.insurance_expiry)}</td>
        <td class="py-2 pr-4 text-sm text-slate-600">${escapeHtml(t.scope_notes || '')}</td>
      </tr>`
    )
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Trades & suppliers</h1>
    <p class="text-sm text-slate-600 mb-4">Insurance expiry is flagged automatically — amber inside 30 days, red once it's lapsed.</p>
    ${alertBanner}

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Trade</th>
            <th class="py-2 pr-4 font-medium">Contact</th>
            <th class="py-2 pr-4 font-medium">Licence</th>
            <th class="py-2 pr-4 font-medium">Insurance</th>
            <th class="py-2 pr-4 font-medium">Scope / notes</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="5">No trades added yet.</td></tr>'}</tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mb-3">Add a trade</h2>
    <form method="post" action="/trades/new" class="bg-white rounded-lg border border-slate-200 p-6 max-w-2xl grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Name / business</label>
        <input type="text" name="name" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Trade type</label>
        <input type="text" name="trade_type" placeholder="e.g. Electrician, framer, plumber"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Phone</label>
        <input type="text" name="phone" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Email</label>
        <input type="email" name="email" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Licence number</label>
        <input type="text" name="licence_number" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Insurance expiry</label>
        <input type="date" name="insurance_expiry" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div class="col-span-2">
        <label class="block text-sm font-medium mb-1">Scope / notes</label>
        <textarea name="scope_notes" rows="2" class="w-full rounded border border-slate-300 px-3 py-2 text-sm"></textarea>
      </div>
      <div class="col-span-2">
        <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Add trade</button>
      </div>
    </form>
  `;

  sendHtml(res, layout({ title: 'Trades', activePath: '/trades', body, flash }));
}

async function handleTradeNew(req, res) {
  const form = await readFormBody(req);
  await store.insert('trades', {
    name: form.name,
    trade_type: form.trade_type || null,
    phone: form.phone || null,
    email: form.email || null,
    licence_number: form.licence_number || null,
    insurance_expiry: form.insurance_expiry || null,
    scope_notes: form.scope_notes || null,
    created_at: new Date().toISOString(),
  });
  redirect(res, '/trades?flash=' + encodeURIComponent('Trade added.'));
}

module.exports = { handleTradesPage, handleTradeNew, daysBetween };
