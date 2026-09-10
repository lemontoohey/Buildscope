const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');

const REGIME_ORDER = ['DA / Council', 'BASIX', 'Bushfire (BAL)', 'Pool', 'Septic / AWTS'];

async function handleCompliancePage(req, res, { sendHtml }, flash) {
  const allItems = await store.listAll('compliance_items');
  const items = [...allItems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const byRegime = {};
  for (const item of items) {
    (byRegime[item.regime] ||= []).push(item);
  }

  const regimes = [...REGIME_ORDER, ...Object.keys(byRegime).filter((r) => !REGIME_ORDER.includes(r))];

  const sections = regimes
    .filter((r) => byRegime[r] && byRegime[r].length)
    .map((regime) => {
      const regimeItems = byRegime[regime];
      const doneCount = regimeItems.filter((i) => i.status === 'done').length;

      const rows = regimeItems
        .map(
          (i) => `<form method="post" action="/compliance/toggle" class="flex items-start gap-2 py-1.5">
            <input type="hidden" name="item_id" value="${i.id}" />
            <input type="hidden" name="next_status" value="${i.status === 'done' ? 'pending' : 'done'}" />
            <button type="submit" class="mt-0.5 w-4 h-4 flex-shrink-0 rounded border ${
              i.status === 'done'
                ? 'bg-emerald-600 border-emerald-600'
                : 'bg-white border-slate-300'
            }" aria-label="Toggle done"></button>
            <span class="text-sm ${i.status === 'done' ? 'text-slate-400 line-through' : 'text-[#484848]'}">${escapeHtml(
            i.item
          )}</span>
          </form>`
        )
        .join('\n');

      return `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-semibold">${escapeHtml(regime)}</h2>
          <span class="text-xs text-slate-500">${doneCount}/${regimeItems.length} done</span>
        </div>
        ${rows}
      </div>`;
    })
    .join('\n');

  const regimeOptions = REGIME_ORDER.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join(
    ''
  );

  const body = `
    <h1 class="text-2xl font-bold mb-2">Compliance checklist</h1>
    <p class="text-sm text-slate-600 mb-6">
      Seeded from this project's actual DA conditions, BASIX Commitments table, bushfire water requirement, pool, and septic/AWTS system — not a generic list. Click a box to mark it done.
    </p>
    ${sections}

    <h2 class="text-lg font-semibold mb-3">Add a checklist item</h2>
    <form method="post" action="/compliance/new" class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Regime</label>
        <select name="regime" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          ${regimeOptions}
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Item</label>
        <input type="text" name="item" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Add item</button>
    </form>
  `;

  sendHtml(res, layout({ title: 'Compliance', activePath: '/compliance', body, flash }));
}

async function handleComplianceToggle(req, res) {
  const form = await readFormBody(req);
  const status = form.next_status === 'done' ? 'done' : 'pending';
  await store.update('compliance_items', Number(form.item_id), { status });
  redirect(res, '/compliance');
}

async function handleComplianceNew(req, res) {
  const form = await readFormBody(req);
  const allItems = await store.listAll('compliance_items');
  const maxOrder = allItems.reduce((m, i) => Math.max(m, i.sort_order ?? 0), 0);
  await store.insert('compliance_items', {
    regime: form.regime || 'Other',
    item: form.item,
    status: 'pending',
    sort_order: maxOrder + 1,
  });
  redirect(res, '/compliance?flash=' + encodeURIComponent('Checklist item added.'));
}

module.exports = { handleCompliancePage, handleComplianceToggle, handleComplianceNew };
