const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, todayIso } = require('../lib/render');
const { daysBetween } = require('./trades');
const { buildInsights } = require('../lib/insights');
const { isAiConfigured, reviewEstimate } = require('../lib/ai');
const xeroAuth = require('../lib/xero-auth');

async function handleDashboard(req, res, { sendHtml }) {
  const [rawCategories, transactions, diaryEntries, stages, complianceItems, trades, boqItems] = await Promise.all([
    store.listAll('budget_categories', { orderBy: 'sort_order' }),
    store.listAll('transactions'),
    store.listAll('diary_entries'),
    store.listAll('schedule_stages', { orderBy: 'sort_order' }),
    store.listAll('compliance_items'),
    store.listAll('trades'),
    store.listAll('boq_items'),
  ]);

  const actualByCategory = {};
  for (const t of transactions) {
    actualByCategory[t.category_id] = (actualByCategory[t.category_id] || 0) + Number(t.amount_cents);
  }
  const categories = rawCategories.map((c) => ({ ...c, actual_cents: actualByCategory[c.id] || 0 }));

  const totals = categories.reduce(
    (acc, c) => {
      acc.budgeted += Number(c.budgeted_cents);
      acc.actual += c.actual_cents;
      return acc;
    },
    { budgeted: 0, actual: 0 }
  );

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const recentTransactions = [...transactions]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8)
    .map((t) => ({ ...t, category_name: categoryById[t.category_id]?.name || 'Uncategorised' }));

  const recentDiary = [...diaryEntries]
    .sort((a, b) => (a.entry_date === b.entry_date ? (a.created_at < b.created_at ? 1 : -1) : a.entry_date < b.entry_date ? 1 : -1))
    .slice(0, 5);

  const remaining = totals.budgeted - totals.actual;
  const remainingClass = remaining < 0 ? 'text-red-600' : 'text-emerald-700';

  // Site status signals — pulled from Phase 2 modules so the dashboard flags
  // things worth attention without having to visit each page.
  const today = todayIso();
  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const overdueStages = sortedStages.filter((s) => s.status !== 'done' && s.planned_end && s.planned_end < today);
  const nextStage = sortedStages.find((s) => s.status !== 'done');

  const pendingCompliance = complianceItems.filter((i) => i.status !== 'done').length;

  const insuranceAlerts = trades.filter(
    (t) => t.insurance_expiry && daysBetween(today, t.insurance_expiry) <= 30
  );

  const insights = buildInsights({ categories, transactions, stages: sortedStages, complianceItems, boqItems });

  const alerts = [];
  if (overdueStages.length) {
    alerts.push(
      `<strong>${overdueStages.length} schedule stage${overdueStages.length === 1 ? '' : 's'}</strong> overdue: ${overdueStages
        .map((s) => escapeHtml(s.name))
        .join(', ')}.`
    );
  }
  if (insuranceAlerts.length) {
    alerts.push(
      `<strong>${insuranceAlerts.length} trade${insuranceAlerts.length === 1 ? '' : 's'}</strong> with insurance expired or expiring soon: ${insuranceAlerts
        .map((t) => escapeHtml(t.name))
        .join(', ')}.`
    );
  }

  const statusBanner = alerts.length
    ? `<div class="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm space-y-1">
        ${alerts.map((a) => `<div>⚠ ${a}</div>`).join('')}
       </div>`
    : '';

  const categoryRows = categories
    .map((c) => {
      const pct = c.budgeted_cents > 0 ? Math.round((c.actual_cents / c.budgeted_cents) * 100) : 0;
      const barColor = pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500';
      return `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4">${escapeHtml(c.name)}</td>
        <td class="py-2 pr-4 text-right">${centsToDisplay(c.budgeted_cents)}</td>
        <td class="py-2 pr-4 text-right">${centsToDisplay(c.actual_cents)}</td>
        <td class="py-2 w-32">
          <div class="h-2 rounded bg-slate-100 overflow-hidden">
            <div class="h-2 ${barColor}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
        </td>
      </tr>`;
    })
    .join('\n');

  const aiConfigured = await isAiConfigured();
  const xeroConnected = xeroAuth.isConnected();

  const txnRows = recentTransactions
    .map(
      (t) => `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4 whitespace-nowrap">${escapeHtml(t.txn_date)}</td>
        <td class="py-2 pr-4">${escapeHtml(t.supplier || '—')}</td>
        <td class="py-2 pr-4">${escapeHtml(t.category_name)}</td>
        <td class="py-2 text-right">${centsToDisplay(t.amount_cents)}</td>
        <td class="py-2 pl-4 text-right whitespace-nowrap">${
          !xeroConnected
            ? ''
            : t.xero_invoice_id
              ? '<span class="text-xs text-emerald-700">✓ Synced</span>'
              : `<button type="button" class="push-xero-btn text-xs rounded border border-slate-300 px-2 py-1 bg-white hover:border-slate-400" data-id="${t.id}">→ Xero</button>`
        }</td>
      </tr>`
    )
    .join('\n');

  const diaryRows = recentDiary
    .map(
      (d) => `<div class="border-b border-slate-100 py-2">
        <div class="text-sm font-medium">${escapeHtml(d.entry_date)} ${
        d.issues ? '<span class="ml-2 text-xs text-red-600">⚠ issue flagged</span>' : ''
      }</div>
        <div class="text-sm text-slate-600">${escapeHtml(d.work_done || '')}</div>
      </div>`
    )
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Dashboard</h1>
    ${statusBanner}

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-xs uppercase text-slate-500">Total budgeted</div>
        <div class="text-xl font-semibold">${centsToDisplay(totals.budgeted)}</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-xs uppercase text-slate-500">Total spent</div>
        <div class="text-xl font-semibold">${centsToDisplay(totals.actual)}</div>
      </div>
      <div class="bg-white rounded-lg border border-slate-200 p-4">
        <div class="text-xs uppercase text-slate-500">Remaining</div>
        <div class="text-xl font-semibold ${remainingClass}">${centsToDisplay(remaining)}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      <a href="/schedule" class="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300">
        <div class="text-xs uppercase text-slate-500">Next stage</div>
        <div class="text-lg font-semibold">${nextStage ? escapeHtml(nextStage.name) : 'All stages done 🎉'}</div>
      </a>
      <a href="/compliance" class="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300">
        <div class="text-xs uppercase text-slate-500">Compliance outstanding</div>
        <div class="text-lg font-semibold">${pendingCompliance} item${pendingCompliance === 1 ? '' : 's'}</div>
      </a>
    </div>

    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Quick answers</h2>
      <span class="text-xs text-slate-400">Computed from your data — no AI needed</span>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 divide-y divide-slate-100">
      ${insights
        .map(
          (i) => `<div class="py-2 flex items-baseline justify-between gap-4 text-sm">
            <span class="text-slate-500">${escapeHtml(i.label)}</span>
            <span class="text-right font-medium">${escapeHtml(i.value)}</span>
          </div>`
        )
        .join('\n')}
    </div>

    <div class="bg-white rounded-lg border-2 border-purple-200 p-4 mb-8">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 class="text-lg font-semibold text-purple-900">AI estimate check</h2>
        <span class="text-xs text-purple-500">Reviews your budget, BOQ and compliance for gaps — run it, don't trust it blindly</span>
      </div>
      ${
        aiConfigured
          ? ''
          : `<div class="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
               AI is off — <a class="underline" href="/settings">add your API key on the Settings page</a> to use this.
             </div>`
      }
      <button type="button" id="reviewRunBtn" class="rounded bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 text-sm" ${aiConfigured ? '' : 'disabled'}>
        Run AI check
      </button>
      <span id="reviewStatus" class="ml-3 text-sm text-slate-600"></span>
      <div id="reviewResults" class="mt-4 space-y-2"></div>
    </div>

    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Budget by category</h2>
      <a href="/budget" class="text-sm text-blue-700 hover:underline">Edit budgets →</a>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Category</th>
            <th class="py-2 pr-4 font-medium text-right">Budgeted</th>
            <th class="py-2 pr-4 font-medium text-right">Spent</th>
            <th class="py-2 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>${categoryRows}</tbody>
      </table>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Recent transactions</h2>
          <a href="/receipts/new" class="text-sm text-blue-700 hover:underline">Add receipt →</a>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
          ${
            recentTransactions.length
              ? `<table class="w-full text-sm"><tbody>${txnRows}</tbody></table>`
              : '<p class="text-sm text-slate-500">No transactions logged yet.</p>'
          }
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Recent diary entries</h2>
          <a href="/diary" class="text-sm text-blue-700 hover:underline">Site diary →</a>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-4">
          ${diaryRows || '<p class="text-sm text-slate-500">No diary entries yet.</p>'}
        </div>
      </div>
    </div>
  `;

  const reviewScript = `
    <script>
      (function () {
        const btn = document.getElementById('reviewRunBtn');
        const status = document.getElementById('reviewStatus');
        const results = document.getElementById('reviewResults');
        if (!btn) return;
        const severityColor = { high: 'border-red-300 bg-red-50 text-red-900', medium: 'border-amber-300 bg-amber-50 text-amber-900', low: 'border-slate-200 bg-slate-50 text-slate-700' };
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          status.textContent = 'Checking…';
          results.innerHTML = '';
          try {
            const res = await fetch('/api/dashboard/review', { method: 'POST' });
            const data = await res.json();
            if (!data.ok) {
              status.textContent = data.error || 'Could not run the check.';
              btn.disabled = false;
              return;
            }
            status.textContent = data.findings.length ? (data.findings.length + ' finding' + (data.findings.length === 1 ? '' : 's')) : 'No issues found.';
            results.innerHTML = data.findings.map(function (f) {
              const cls = severityColor[f.severity] || severityColor.low;
              return '<div class="rounded-md border px-4 py-3 text-sm ' + cls + '">' +
                '<div class="font-semibold uppercase text-xs mb-1">' + f.severity + ' — ' + f.category + '</div>' +
                '<div class="mb-1">' + f.finding + '</div>' +
                '<div class="text-xs opacity-80">Suggestion: ' + f.suggestion + '</div>' +
                '</div>';
            }).join('');
          } catch (err) {
            status.textContent = 'Something went wrong running the check.';
          }
          btn.disabled = false;
        });
      })();
      (function () {
        document.querySelectorAll('.push-xero-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            btn.disabled = true;
            var original = btn.textContent;
            btn.textContent = 'Sending…';
            fetch('/api/xero/push-transaction', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ transaction_id: btn.dataset.id }),
            })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                if (data.ok) {
                  btn.outerHTML = '<span class="text-xs text-emerald-700">✓ Synced</span>';
                } else {
                  btn.textContent = original;
                  btn.disabled = false;
                  alert(data.error || 'Could not push to Xero.');
                }
              })
              .catch(function () {
                btn.textContent = original;
                btn.disabled = false;
                alert('Could not push to Xero.');
              });
          });
        });
      })();
    </script>
  `;

  sendHtml(res, layout({ title: 'Dashboard', activePath: '/', body: body + reviewScript }));
}


async function handleDashboardReviewApi(req, res, { sendJson }) {
  try {
    const [categories, boqItems, complianceItems] = await Promise.all([
      store.listAll('budget_categories', { orderBy: 'sort_order' }),
      store.listAll('boq_items'),
      store.listAll('compliance_items'),
    ]);
    const result = await reviewEstimate({ categories, boqItems, complianceItems });
    sendJson(res, result);
  } catch (err) {
    sendJson(res, { ok: false, error: err.message || 'AI check failed.' });
  }
}

module.exports = { handleDashboard, handleDashboardReviewApi };
