const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, dollarsToCents, todayIso } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { listCategories } = require('./budget');

async function renderTransactionForm({ prefill = {}, flash } = {}) {
  const categories = await listCategories();
  const options = categories
    .map((c) => {
      const selected = String(c.id) === String(prefill.category_id) ? 'selected' : '';
      return `<option value="${c.id}" ${selected}>${escapeHtml(c.name)}</option>`;
    })
    .join('\n');

  const aiNotice = prefill.ai_generated
    ? `<div class="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 text-sm">
         <strong>AI-extracted from your receipt — estimate, check it.</strong>
         Confidence: ${escapeHtml(prefill.confidence || 'unknown')}. Review every field below before saving.
       </div>`
    : '';

  const lineItemsNotice =
    prefill.line_items && prefill.line_items.length
      ? `<div class="mb-4 text-sm text-slate-600">
           <div class="font-medium mb-1">Line items the AI read off the receipt:</div>
           <ul class="list-disc list-inside">
             ${prefill.line_items
               .map((li) => `<li>${escapeHtml(li.description)} — $${escapeHtml(li.amount)}</li>`)
               .join('')}
           </ul>
         </div>`
      : '';

  const body = `
    <h1 class="text-2xl font-bold mb-6">Add transaction</h1>
    ${aiNotice}
    ${lineItemsNotice}
    <form method="post" action="/transactions" class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg space-y-4">
      <input type="hidden" name="document_id" value="${escapeHtml(prefill.document_id || '')}" />
      <input type="hidden" name="ai_generated" value="${prefill.ai_generated ? '1' : '0'}" />

      <div>
        <label class="block text-sm font-medium mb-1">Category</label>
        <select name="category_id" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
          ${options}
        </select>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Date</label>
        <input type="date" name="txn_date" value="${escapeHtml(prefill.txn_date || todayIso())}" required
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Supplier</label>
        <input type="text" name="supplier" value="${escapeHtml(prefill.supplier || '')}"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Bunnings, local timber yard" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Description</label>
        <input type="text" name="description" value="${escapeHtml(prefill.description || '')}"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="What was this for?" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Amount ($, inc. GST)</label>
          <input type="text" name="amount" value="${escapeHtml(prefill.amount || '')}" required
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">GST ($)</label>
          <input type="text" name="gst" value="${escapeHtml(prefill.gst || '')}"
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Note</label>
        <textarea name="note" rows="2" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">${escapeHtml(
          prefill.note || ''
        )}</textarea>
      </div>

      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Save transaction</button>
    </form>
  `;

  return layout({ title: 'Add transaction', activePath: '/receipts/new', body, flash });
}

async function handleTransactionNew(req, res, { sendHtml }, query) {
  const prefill = {
    category_id: query.category_id,
    txn_date: query.txn_date,
    supplier: query.supplier,
    description: query.description,
    amount: query.amount,
    gst: query.gst,
    document_id: query.document_id,
    ai_generated: query.ai_generated === '1',
    confidence: query.confidence,
    line_items: query.line_items ? JSON.parse(query.line_items) : null,
  };
  sendHtml(res, await renderTransactionForm({ prefill }));
}

async function handleTransactionCreate(req, res) {
  const form = await readFormBody(req);
  const amountCents = dollarsToCents(form.amount);
  const gstCents = dollarsToCents(form.gst);

  await store.insert('transactions', {
    category_id: Number(form.category_id),
    txn_date: form.txn_date,
    supplier: form.supplier || null,
    description: form.description || null,
    amount_cents: amountCents,
    gst_cents: gstCents,
    document_id: form.document_id || null,
    note: form.note || null,
    ai_generated: form.ai_generated === '1',
    created_at: new Date().toISOString(),
  });

  redirect(res, '/?flash=' + encodeURIComponent('Transaction saved.'));
}

module.exports = { handleTransactionNew, handleTransactionCreate, renderTransactionForm };
