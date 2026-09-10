const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, dollarsToCents } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { bestMatches, cheapestForItem } = require('../lib/price-match');
const { listCategories } = require('./budget');
const { BUTTON_CLASSES } = require('../lib/theme');

function withSupplierNames(items, suppliers) {
  const byId = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  return items.map((p) => ({ ...p, supplier_name: byId[p.supplier_id]?.name || 'Unknown', supplier_region: byId[p.supplier_id]?.region || '' }));
}

async function handlePriceBookPage(req, res, { sendHtml }, query, flash) {
  const tab = query.tab === 'price' ? 'price' : 'catalogue';
  const suppliers = await store.listAll('suppliers', { orderBy: 'sort_order' });
  const rawItems = await store.listAll('price_book_items', { orderBy: 'sort_order' });
  const items = withSupplierNames(rawItems, suppliers);
  const categories = await listCategories();
  const filterSupplier = query.supplier || '';
  const filtered = filterSupplier ? items.filter((i) => String(i.supplier_id) === String(filterSupplier)) : items;

  const tabCls = (id) =>
    id === tab
      ? 'bg-[#4f6070] text-white'
      : 'bg-white text-slate-700 hover:bg-slate-50';

  let main = '';
  if (tab === 'catalogue') {
    const supplierCards = suppliers
      .map(
        (s) => `<div class="bg-white rounded-lg border border-slate-200 p-4">
          <div class="font-semibold">${escapeHtml(s.name)}</div>
          <div class="text-xs text-slate-500 mt-1">${escapeHtml(s.region || '')}</div>
          <p class="text-sm text-slate-600 mt-2">${escapeHtml(s.notes || '')}</p>
        </div>`
      )
      .join('');

    const supplierFilter = suppliers
      .map((s) => `<option value="${s.id}" ${String(s.id) === String(filterSupplier) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
      .join('');

    const rows = filtered
      .map(
        (p) => `<tr class="border-b border-slate-100">
          <td class="py-2 pr-4">
            <div class="font-medium">${escapeHtml(p.description)} ${
              p.source === 'own_job'
                ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800" title="From a purchase order you actually confirmed on this build">your price</span>'
                : ''
            }</div>
            <div class="text-xs text-slate-500">${escapeHtml(p.sku || '')}${p.category ? ' · ' + escapeHtml(p.category) : ''}</div>
          </td>
          <td class="py-2 pr-4">${escapeHtml(p.supplier_name)}</td>
          <td class="py-2 pr-4">${escapeHtml(p.unit)}</td>
          <td class="py-2 pr-4 text-right">${centsToDisplay(p.unit_cost_cents)}</td>
        </tr>`
      )
      .join('');

    const categoryOptions = categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    const supplierOptions = suppliers.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

    main = `
      <h2 class="text-lg font-semibold mb-3">Australian suppliers in this book</h2>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">${supplierCards}</div>

      <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
        <h2 class="text-lg font-semibold">Catalogue</h2>
        <form method="get" action="/price-book" class="flex items-center gap-2">
          <input type="hidden" name="tab" value="catalogue" />
          <select name="supplier" onchange="this.form.submit()" class="rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="">All suppliers</option>
            ${supplierFilter}
          </select>
        </form>
      </div>
      <p class="text-xs text-slate-500 mb-3">Indicative GST-inclusive ballparks for 2026 — overwrite with real quotes. Not live dealer pricing.</p>
      <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="py-2 pr-4 font-medium">Item</th>
              <th class="py-2 pr-4 font-medium">Supplier</th>
              <th class="py-2 pr-4 font-medium">Unit</th>
              <th class="py-2 pr-4 font-medium text-right">Unit rate</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="4">Catalogue is empty.</td></tr>'}</tbody>
        </table>
      </div>

      <h2 class="text-lg font-semibold mb-3">Add a rate</h2>
      <form method="post" action="/price-book/items/new" class="bg-white rounded-lg border border-slate-200 p-4 grid sm:grid-cols-2 lg:grid-cols-6 gap-3 max-w-5xl">
        <select name="supplier_id" required class="rounded border border-slate-300 px-2 py-1.5 text-sm">${supplierOptions}</select>
        <input name="description" required placeholder="Description" class="rounded border border-slate-300 px-2 py-1.5 text-sm lg:col-span-2" />
        <input name="sku" placeholder="SKU" class="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="unit" required placeholder="m3, lm, ea" class="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="unit_cost" required placeholder="Unit $ inc GST" class="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <select name="category" class="rounded border border-slate-300 px-2 py-1.5 text-sm lg:col-span-2">${categoryOptions}</select>
        <div class="lg:col-span-4"><button class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Add to catalogue</button></div>
      </form>
    `;
  } else {
    const boq = await store.listAll('boq_items');
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

    if (!boq.length) {
      main = `<div class="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-600">
        No estimate lines yet. Measure a plan, run a Formulate recipe, or add items on
        <a href="/materials" class="text-blue-700 underline">Materials</a> first — then come back here to price them against the book.
      </div>`;
    } else {
      let estimateTotal = 0;
      const blocks = boq
        .map((item) => {
          const matches = bestMatches(item, items);
          const cheapest = cheapestForItem(item, items);
          const qty = Number(item.quantity) || 0;
          const currentExt = item.unit_cost_cents != null ? Math.round(qty * item.unit_cost_cents) : 0;
          estimateTotal += cheapest ? Math.round(qty * cheapest.unit_cost_cents) : currentExt;
          const matchRows = matches
            .map((m) => {
              const ext = Math.round(qty * m.unit_cost_cents);
              const isCheapest = cheapest && m.id === cheapest.id;
              return `<tr class="border-b border-slate-50 ${isCheapest ? 'bg-emerald-50' : ''}">
                <td class="py-1 pr-3">${escapeHtml(m.supplier_name)}</td>
                <td class="py-1 pr-3 text-xs text-slate-500">${escapeHtml(m.description)}</td>
                <td class="py-1 pr-3 text-right">${centsToDisplay(m.unit_cost_cents)}</td>
                <td class="py-1 pr-3 text-right">${qty ? centsToDisplay(ext) : '—'}</td>
                <td class="py-1 pr-3">
                  <form method="post" action="/price-book/apply-one">
                    <input type="hidden" name="boq_item_id" value="${item.id}" />
                    <input type="hidden" name="price_book_item_id" value="${m.id}" />
                    <button class="text-xs ${BUTTON_CLASSES} px-2 py-0.5 rounded">Use this</button>
                  </form>
                </td>
              </tr>`;
            })
            .join('');
          return `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-3">
            <div class="flex flex-wrap justify-between gap-2 mb-2">
              <div>
                <div class="font-medium">${escapeHtml(item.description)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(categoryById[item.category_id]?.name || '')} · ${item.quantity ?? '—'} ${escapeHtml(item.unit || '')}</div>
              </div>
              <div class="text-sm text-slate-600">Current: ${item.unit_cost_cents != null ? centsToDisplay(item.unit_cost_cents) : 'unpriced'}${item.supplier ? ' · ' + escapeHtml(item.supplier) : ''}</div>
            </div>
            ${
              matches.length
                ? `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 text-xs">
                    <th class="py-1 pr-3 font-medium">Supplier</th>
                    <th class="py-1 pr-3 font-medium">Matched catalogue item</th>
                    <th class="py-1 pr-3 font-medium text-right">Rate</th>
                    <th class="py-1 pr-3 font-medium text-right">Extension</th>
                    <th></th>
                  </tr></thead><tbody>${matchRows}</tbody></table>`
                : '<p class="text-xs text-slate-500">No catalogue match — add a rate, or rename the Materials line so it shares words with a catalogue item (e.g. “concrete N32”).</p>'
            }
          </div>`;
        })
        .join('');

      main = `
        <p class="text-sm text-slate-600 mb-4">
          Each Materials line is matched against the catalogue (same idea as a supplier quote comparison in
          Buildertrend / a merchant price file — without claiming live dealer feeds). Green row is the cheapest match.
        </p>
        <form method="post" action="/price-book/apply-cheapest" class="mb-4">
          <button class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Stamp cheapest match onto every line</button>
        </form>
        <p class="text-sm font-semibold mb-4">Indicative build total at cheapest matches: ${centsToDisplay(estimateTotal)}</p>
        ${blocks}
      `;
    }
  }

  const body = `
    <h1 class="text-2xl font-bold mb-2">Price Book</h1>
    <p class="text-sm text-slate-600 mb-4 max-w-3xl">
      Price the estimate against a database of Australian suppliers. Rates here are a starter book
      (Bunnings, Mitre 10, Reece, Hanson, Lysaght, CSR, James Hardie, and a North Coast timber yard)
      so you can compare — then replace them with the quote you actually received.
    </p>
    <div class="flex gap-2 mb-6">
      <a href="/price-book?tab=catalogue" class="px-3 py-1.5 rounded text-sm border border-slate-200 ${tabCls('catalogue')}">Catalogue</a>
      <a href="/price-book?tab=price" class="px-3 py-1.5 rounded text-sm border border-slate-200 ${tabCls('price')}">Price this build</a>
    </div>
    ${main}
  `;

  sendHtml(res, layout({ title: 'Price Book', activePath: '/price-book', body, flash, wide: true }));
}

async function handlePriceBookItemNew(req, res) {
  const form = await readFormBody(req);
  const existing = await store.listAll('price_book_items');
  await store.insert('price_book_items', {
    supplier_id: Number(form.supplier_id),
    sku: form.sku || null,
    description: form.description,
    unit: form.unit,
    unit_cost_cents: dollarsToCents(form.unit_cost),
    category: form.category || null,
    notes: 'User-entered rate',
    sort_order: existing.length,
  });
  redirect(res, '/price-book?tab=catalogue&flash=' + encodeURIComponent('Rate added.'));
}

async function applyPriceToBoq(boqItemId, priceRow, supplierName) {
  await store.update('boq_items', boqItemId, {
    unit_cost_cents: priceRow.unit_cost_cents,
    supplier: supplierName,
  });
}

async function handlePriceBookApplyOne(req, res) {
  const form = await readFormBody(req);
  const price = await store.getById('price_book_items', Number(form.price_book_item_id));
  const supplier = price ? await store.getById('suppliers', price.supplier_id) : null;
  if (price) await applyPriceToBoq(Number(form.boq_item_id), price, supplier ? supplier.name : '');
  redirect(res, '/price-book?tab=price&flash=' + encodeURIComponent('Rate applied.'));
}

async function handlePriceBookApplyCheapest(req, res) {
  const suppliers = await store.listAll('suppliers');
  const items = withSupplierNames(await store.listAll('price_book_items'), suppliers);
  const boq = await store.listAll('boq_items');
  let n = 0;
  for (const item of boq) {
    const cheapest = cheapestForItem(item, items);
    if (!cheapest) continue;
    await applyPriceToBoq(item.id, cheapest, cheapest.supplier_name);
    n += 1;
  }
  redirect(res, '/price-book?tab=price&flash=' + encodeURIComponent(`${n} lines priced at cheapest catalogue match.`));
}

module.exports = {
  handlePriceBookPage,
  handlePriceBookItemNew,
  handlePriceBookApplyOne,
  handlePriceBookApplyCheapest,
};
