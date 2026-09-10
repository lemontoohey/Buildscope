// Client Selections Portal (Buildxact calls this "Selections") — a place
// to track choices that aren't nailed down at budget-time: which tile,
// which tapware, which door handle. Each selection can have several
// candidate options (with their own supplier/price), one of which gets
// marked chosen; the selection can optionally link to a BOQ line so the
// eventual price flows back into the budget picture rather than living
// only here.

const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, todayIso } = require('../lib/render');
const { readFormBody, redirect, notFound } = require('../lib/http');
const { BUTTON_CLASSES } = require('../lib/theme');

const STATUSES = ['pending', 'selected', 'ordered'];
const STATUS_LABELS = { pending: 'Pending', selected: 'Selected', ordered: 'Ordered' };
const STATUS_COLORS = {
  pending: 'bg-slate-100 text-slate-700',
  selected: 'bg-blue-100 text-blue-800',
  ordered: 'bg-emerald-100 text-emerald-800',
};

async function loadSelections() {
  const [selections, options, boqItems] = await Promise.all([
    store.listAll('selections', { orderBy: 'id desc' }),
    store.listAll('selection_options'),
    store.listAll('boq_items'),
  ]);
  const optionsBySelection = {};
  for (const o of options) (optionsBySelection[o.selection_id] ||= []).push(o);
  const boqById = Object.fromEntries(boqItems.map((b) => [b.id, b]));
  return selections.map((s) => ({
    ...s,
    options: (optionsBySelection[s.id] || []).sort((a, b) => a.id - b.id),
    boqItem: s.boq_item_id ? boqById[s.boq_item_id] : null,
  }));
}

async function handleSelectionsPage(req, res, { sendHtml }, flash) {
  const [selections, boqItems] = await Promise.all([loadSelections(), store.listAll('boq_items')]);

  const boqOptions =
    '<option value="">— not linked to a BOQ line —</option>' +
    boqItems.map((b) => `<option value="${b.id}">${escapeHtml(b.description)}</option>`).join('');

  const cards = selections
    .map((s) => {
      const chosen = s.options.find((o) => o.is_chosen);
      const optionRows = s.options
        .map((o) => {
          const isChosen = !!o.is_chosen;
          return `<div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 text-sm">
            <div>
              <div class="font-medium ${isChosen ? 'text-emerald-700' : ''}">${escapeHtml(o.label)} ${isChosen ? '✓ chosen' : ''}</div>
              <div class="text-xs text-slate-500">${o.supplier ? escapeHtml(o.supplier) + ' · ' : ''}${o.unit_cost_cents != null ? centsToDisplay(o.unit_cost_cents) : 'no price yet'}${o.notes ? ' · ' + escapeHtml(o.notes) : ''}</div>
            </div>
            ${
              isChosen
                ? ''
                : `<form method="post" action="/selections/${s.id}/options/${o.id}/choose">
                     <button class="text-xs rounded border border-slate-300 px-2 py-1 bg-white hover:border-slate-400" type="submit">Choose</button>
                   </form>`
            }
          </div>`;
        })
        .join('\n');

      const statusOptions = STATUSES.map(
        (st) => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${STATUS_LABELS[st]}</option>`
      ).join('');

      return `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <div class="text-xs uppercase text-slate-500">${escapeHtml(s.category)}</div>
            <h2 class="font-semibold">${escapeHtml(s.description || s.category)}</h2>
            ${s.boqItem ? `<div class="text-xs text-slate-500">Linked to BOQ: ${escapeHtml(s.boqItem.description)}</div>` : ''}
            ${s.due_date ? `<div class="text-xs text-slate-500">Due ${escapeHtml(s.due_date)}</div>` : ''}
          </div>
          <form method="post" action="/selections/${s.id}/status">
            <select name="status" onchange="this.form.submit()" class="text-xs rounded border border-slate-300 px-2 py-1 ${STATUS_COLORS[s.status]}">${statusOptions}</select>
          </form>
        </div>
        ${s.notes ? `<p class="text-sm text-slate-600 mb-2">${escapeHtml(s.notes)}</p>` : ''}
        <div class="mt-2">
          ${optionRows || '<p class="text-sm text-slate-500 py-2">No options added yet.</p>'}
        </div>
        <form method="post" action="/selections/${s.id}/options/new" class="mt-3 flex flex-wrap gap-2 items-end">
          <div>
            <label class="block text-[11px] text-slate-500">Option</label>
            <input type="text" name="label" required placeholder="e.g. Bianco Carrara 600x600" class="rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label class="block text-[11px] text-slate-500">Supplier</label>
            <input type="text" name="supplier" class="rounded border border-slate-300 px-2 py-1 text-sm w-32" />
          </div>
          <div>
            <label class="block text-[11px] text-slate-500">Price ($)</label>
            <input type="number" step="0.01" min="0" name="unit_cost" class="rounded border border-slate-300 px-2 py-1 text-sm w-24" />
          </div>
          <div class="flex-1 min-w-[120px]">
            <label class="block text-[11px] text-slate-500">Notes</label>
            <input type="text" name="notes" class="rounded border border-slate-300 px-2 py-1 text-sm w-full" />
          </div>
          <button type="submit" class="text-xs rounded border border-slate-300 px-3 py-1.5 bg-white hover:border-slate-400">Add option</button>
        </form>
      </div>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Client selections</h1>
    <p class="text-sm text-slate-600 mb-6 max-w-2xl">
      Track the choices that aren't locked in yet — tiles, tapware, handles, paint colours — with a few
      candidate options each. Mark one chosen once it's decided, and link it to a Materials/BOQ line if
      the price should flow into the budget.
    </p>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-6 max-w-xl">
      <h2 class="font-semibold text-sm mb-3">Add a selection</h2>
      <form method="post" action="/selections/new" class="space-y-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">Category</label>
          <input type="text" name="category" required placeholder="e.g. Kitchen benchtop" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Description (optional)</label>
          <input type="text" name="description" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">Link to BOQ line</label>
            <select name="boq_item_id" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">${boqOptions}</select>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Needed by</label>
            <input type="date" name="due_date" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Notes</label>
          <textarea name="notes" rows="2" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"></textarea>
        </div>
        <button type="submit" class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Add selection</button>
      </form>
    </div>

    ${cards || '<p class="text-sm text-slate-500">No selections yet — add one above.</p>'}
  `;
  sendHtml(res, layout({ title: 'Client selections', activePath: '/selections', body, flash }));
}

async function handleSelectionCreate(req, res) {
  const form = await readFormBody(req);
  if (!form.category) {
    return redirect(res, '/selections?flash=' + encodeURIComponent('Give the selection a category first.'));
  }
  await store.insert('selections', {
    category: form.category,
    description: form.description || null,
    boq_item_id: form.boq_item_id ? Number(form.boq_item_id) : null,
    status: 'pending',
    due_date: form.due_date || null,
    notes: form.notes || null,
    created_at: new Date().toISOString(),
  });
  redirect(res, '/selections?flash=' + encodeURIComponent('Selection added.'));
}

async function handleSelectionOptionCreate(req, res, helpers, id) {
  const form = await readFormBody(req);
  if (!form.label) {
    return redirect(res, '/selections?flash=' + encodeURIComponent('Give the option a name first.'));
  }
  await store.insert('selection_options', {
    selection_id: Number(id),
    label: form.label,
    supplier: form.supplier || null,
    unit_cost_cents: form.unit_cost ? Math.round(Number(form.unit_cost) * 100) : null,
    notes: form.notes || null,
    is_chosen: 0,
    created_at: new Date().toISOString(),
  });
  redirect(res, '/selections?flash=' + encodeURIComponent('Option added.'));
}

async function handleSelectionOptionChoose(req, res, helpers, id, optionId) {
  const siblings = await store.getWhere('selection_options', { selection_id: Number(id) });
  await Promise.all(
    siblings.map((o) => store.update('selection_options', o.id, { is_chosen: String(o.id) === String(optionId) ? 1 : 0 }))
  );
  const selection = await store.getById('selections', Number(id));
  if (selection && selection.status === 'pending') {
    await store.update('selections', selection.id, { status: 'selected' });
  }
  redirect(res, '/selections?flash=' + encodeURIComponent('Choice saved.'));
}

async function handleSelectionStatus(req, res, helpers, id) {
  const form = await readFormBody(req);
  if (STATUSES.includes(form.status)) {
    await store.update('selections', Number(id), { status: form.status });
  }
  redirect(res, '/selections');
}

module.exports = {
  handleSelectionsPage,
  handleSelectionCreate,
  handleSelectionOptionCreate,
  handleSelectionOptionChoose,
  handleSelectionStatus,
};
