const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, dollarsToCents } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { listCategories } = require('./budget');

const STATUSES = ['not_ordered', 'ordered', 'delivered', 'installed'];
const STATUS_LABELS = {
  not_ordered: 'Not ordered',
  ordered: 'Ordered',
  delivered: 'Delivered',
  installed: 'Installed',
};
const STATUS_COLORS = {
  not_ordered: 'bg-slate-100 text-slate-700',
  ordered: 'bg-amber-100 text-amber-800',
  delivered: 'bg-blue-100 text-blue-800',
  installed: 'bg-emerald-100 text-emerald-800',
};

async function listBoqItems() {
  const [items, categories, allQuotes] = await Promise.all([
    store.listAll('boq_items'),
    store.listAll('budget_categories'),
    store.listAll('quotes'),
  ]);

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const quotesByItem = {};
  for (const q of [...allQuotes].sort((a, b) => a.price_cents - b.price_cents)) {
    (quotesByItem[q.boq_item_id] ||= []).push(q);
  }

  return [...items]
    .sort((a, b) => {
      const orderA = categoryById[a.category_id]?.sort_order ?? 0;
      const orderB = categoryById[b.category_id]?.sort_order ?? 0;
      return orderA - orderB || a.id - b.id;
    })
    .map((item) => ({
      ...item,
      category_name: categoryById[item.category_id]?.name || 'Uncategorised',
      quotes: quotesByItem[item.id] || [],
    }));
}

function statusSelect(itemId, current) {
  const options = STATUSES.map(
    (s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`
  ).join('');
  return `<form method="post" action="/materials/status" class="inline">
    <input type="hidden" name="item_id" value="${itemId}" />
    <select name="status" onchange="this.form.submit()"
      class="text-xs rounded border border-slate-300 px-2 py-1 ${STATUS_COLORS[current]}">
      ${options}
    </select>
  </form>`;
}

async function handleMaterialsPage(req, res, { sendHtml }, flash) {
  const items = await listBoqItems();
  const categories = await listCategories();

  const categoryOptions = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  const rows = items
    .map((item) => {
      const bestQuote = item.quotes[0];
      const quoteRows = item.quotes
        .map(
          (q) => `<div class="flex justify-between text-xs text-slate-600 py-0.5">
            <span>${escapeHtml(q.supplier)}${q.quote_date ? ' — ' + escapeHtml(q.quote_date) : ''}</span>
            <span>${centsToDisplay(q.price_cents)}</span>
          </div>`
        )
        .join('');

      return `<tr class="border-b border-slate-100 align-top">
        <td class="py-2 pr-2"><input type="checkbox" class="po-check" value="${item.id}" /></td>
        <td class="py-2 pr-4">
          <div class="font-medium">${escapeHtml(item.description)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(item.category_name)}</div>
          ${item.note ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(item.note)}</div>` : ''}
        </td>
        <td class="py-2 pr-4 whitespace-nowrap">${item.quantity ?? '—'} ${escapeHtml(item.unit || '')}</td>
        <td class="py-2 pr-4 whitespace-nowrap">${
          item.unit_cost_cents != null ? centsToDisplay(item.unit_cost_cents) : '—'
        }</td>
        <td class="py-2 pr-4">${escapeHtml(item.supplier || '—')}</td>
        <td class="py-2 pr-4">${statusSelect(item.id, item.status)}</td>
        <td class="py-2 pr-4 min-w-[220px]">
          <details>
            <summary class="text-xs text-blue-700 cursor-pointer">
              ${item.quotes.length} quote${item.quotes.length === 1 ? '' : 's'}${
        bestQuote ? ' — best ' + centsToDisplay(bestQuote.price_cents) : ''
      }
            </summary>
            <div class="mt-2">${quoteRows}</div>
            <form method="post" action="/materials/quotes/new" class="mt-2 flex flex-wrap gap-1 items-center">
              <input type="hidden" name="boq_item_id" value="${item.id}" />
              <input type="text" name="supplier" placeholder="Supplier" required
                class="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs" />
              <input type="text" name="price" placeholder="$" required
                class="w-16 rounded border border-slate-300 px-1 py-0.5 text-xs" />
              <input type="date" name="quote_date"
                class="rounded border border-slate-300 px-1 py-0.5 text-xs" />
              <button class="text-xs bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-2 py-0.5 rounded">Add</button>
            </form>
          </details>
        </td>
      </tr>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Materials & quantities</h1>
    <p class="text-sm text-slate-600 mb-6">
      A starting bill of quantities — quantities and costs here are what you or your supplier entered, not an AI estimate (that's Phase 3). Compare supplier quotes per line before ordering.
    </p>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-2 font-medium"></th>
            <th class="py-2 pr-4 font-medium">Item</th>
            <th class="py-2 pr-4 font-medium">Qty</th>
            <th class="py-2 pr-4 font-medium">Unit cost</th>
            <th class="py-2 pr-4 font-medium">Supplier</th>
            <th class="py-2 pr-4 font-medium">Status</th>
            <th class="py-2 pr-4 font-medium">Quotes</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="7">No items yet — add one below.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="bg-white rounded-lg border border-slate-200 p-5 mb-8 max-w-xl">
      <h2 class="font-semibold mb-1">Create a purchase order</h2>
      <p class="text-xs text-slate-500 mb-3">Tick items above, name the supplier, and generate a printable PO.</p>
      <form method="post" action="/purchase-orders/new" id="poForm" class="flex flex-wrap gap-2 items-center">
        <input type="text" name="supplier" placeholder="Supplier name" required class="rounded border border-slate-300 px-3 py-2 text-sm flex-1 min-w-[160px]" />
        <input type="text" name="notes" placeholder="Notes (optional)" class="rounded border border-slate-300 px-3 py-2 text-sm flex-1 min-w-[160px]" />
        <div id="poItemIdsHolder"></div>
        <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Create PO from checked items</button>
      </form>
    </div>
    <script>
      (function () {
        var form = document.getElementById('poForm');
        if (!form) return;
        form.addEventListener('submit', function () {
          var holder = document.getElementById('poItemIdsHolder');
          holder.innerHTML = '';
          Array.prototype.forEach.call(document.querySelectorAll('.po-check:checked'), function (cb) {
            var input = document.createElement('input');
            input.type = 'hidden'; input.name = 'item_ids'; input.value = cb.value;
            holder.appendChild(input);
          });
        });
      })();
    </script>

    <h2 class="text-lg font-semibold mb-3">Add a BOQ item</h2>
    <form method="post" action="/materials/new" class="bg-white rounded-lg border border-slate-200 p-6 max-w-2xl grid grid-cols-2 gap-4">
      <div class="col-span-2">
        <label class="block text-sm font-medium mb-1">Description</label>
        <input type="text" name="description" required placeholder="e.g. Colorbond roof sheeting"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Category</label>
        <select name="category_id" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          ${categoryOptions}
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Supplier (optional)</label>
        <input type="text" name="supplier" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Quantity</label>
        <input type="text" name="quantity" placeholder="e.g. 180" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Unit</label>
        <input type="text" name="unit" placeholder="e.g. m2, lm, ea" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Unit cost ($, optional)</label>
        <input type="text" name="unit_cost" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Note (optional)</label>
        <input type="text" name="note" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div class="col-span-2">
        <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Add item</button>
      </div>
    </form>
  `;

  sendHtml(res, layout({ title: 'Materials', activePath: '/materials', body, flash }));
}

async function handleMaterialNew(req, res) {
  const form = await readFormBody(req);
  const quantity = form.quantity ? parseFloat(String(form.quantity).replace(/[^0-9.-]/g, '')) : null;
  const unitCostCents = form.unit_cost ? dollarsToCents(form.unit_cost) : null;

  await store.insert('boq_items', {
    category_id: Number(form.category_id),
    description: form.description,
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: form.unit || null,
    unit_cost_cents: unitCostCents,
    supplier: form.supplier || null,
    status: 'not_ordered',
    note: form.note || null,
    created_at: new Date().toISOString(),
  });

  redirect(res, '/materials?flash=' + encodeURIComponent('Item added.'));
}

async function handleMaterialStatus(req, res) {
  const form = await readFormBody(req);
  if (STATUSES.includes(form.status)) {
    await store.update('boq_items', Number(form.item_id), { status: form.status });
  }
  redirect(res, '/materials');
}

async function handleQuoteNew(req, res) {
  const form = await readFormBody(req);
  const priceCents = dollarsToCents(form.price);
  await store.insert('quotes', {
    boq_item_id: Number(form.boq_item_id),
    supplier: form.supplier,
    price_cents: priceCents,
    quote_date: form.quote_date || null,
    note: form.note || null,
    created_at: new Date().toISOString(),
  });
  redirect(res, '/materials?flash=' + encodeURIComponent('Quote added.'));
}

module.exports = { handleMaterialsPage, handleMaterialNew, handleMaterialStatus, handleQuoteNew };
