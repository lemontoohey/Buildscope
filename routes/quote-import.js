const path = require('node:path');
const crypto = require('node:crypto');
const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, dollarsToCents } = require('../lib/render');
const { saveFile } = require('../lib/file-storage');
const { isAiConfigured, extractQuoteLines } = require('../lib/ai');
const { BUTTON_CLASSES } = require('../lib/theme');
const { listCategories } = require('./budget');
const { scoreMatch } = require('../lib/price-match');

// --- Import a quote: upload a past supplier quote/invoice (PDF or image),
// have the AI read every priced line off it, then let the person check each
// line -- and either attach it to an existing BOQ item as a real quote, or
// use it to create a brand-new BOQ line -- before anything is saved.
// Same "draft, never auto-commit" shape as the Plan Measure AI takeoff.
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MIN_MATCH_SCORE = 0.35; // higher bar than the price-book's own 0.15 --
// a wrong suggested match here would misfile a real price against the
// wrong BOQ line, so it's better to default to "new item" than guess.

async function handleQuoteImportPage(req, res, { sendHtml }, flash) {
  const aiConfigured = await isAiConfigured();
  const [categories, boqItems] = await Promise.all([listCategories(), store.listAll('boq_items')]);

  const boot = {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    boqItems: boqItems.map((i) => ({ id: i.id, description: i.description, unit: i.unit, category_id: i.category_id })),
  };

  const body = `
    <h1 class="text-2xl font-bold mb-2">Import a quote</h1>
    <p class="text-sm text-slate-600 mb-6 max-w-2xl">
      Upload a quote or invoice you've already been sent (PDF or photo). The AI reads every priced line off
      it, and you'll get a chance to check, edit, or drop each one before anything is saved -- it either
      records a real quoted price against an existing Materials line, or creates a new one.
      <strong>Nothing is saved automatically.</strong>
    </p>
    ${
      aiConfigured
        ? ''
        : `<div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm max-w-2xl">
             AI is off -- <a class="underline" href="/settings">add your API key on the Settings page</a> to use this.
           </div>`
    }

    <div class="bg-white rounded-lg border border-slate-200 p-5 max-w-2xl">
      <input id="quoteFileInput" type="file" accept="image/*,application/pdf" class="block w-full text-sm mb-3" ${aiConfigured ? '' : 'disabled'} />
      <div id="quotePagesPanel" class="mb-3"></div>
      <button type="button" id="quoteRunBtn" class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm" ${aiConfigured ? '' : 'disabled'}>
        Read this quote
      </button>
      <span id="quoteStatus" class="ml-3 text-sm text-slate-600"></span>
    </div>

    <div id="quoteResults" class="mt-6"></div>

    <script>window.QUOTE_IMPORT_BOOT = ${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="/public/quote-import.js"></script>
  `;

  sendHtml(res, layout({ title: 'Import a quote', activePath: '/materials', body, flash, wide: true }));
}

async function handleQuoteParseApi(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (!pages.length) return sendJson(res, { ok: false, error: 'No pages to read.' }, 400);
  if (pages.length > 15) return sendJson(res, { ok: false, error: 'That document has too many pages -- 15 max at a time.' }, 400);

  // File the original document (best-effort) regardless of whether AI
  // parsing succeeds, same as the receipts flow -- so it's still on hand
  // under Documents even if the read comes back empty or errors out.
  let documentId = null;
  if (body.original && body.original.base64) {
    try {
      const mime = body.original.mime || 'application/octet-stream';
      const ext = EXT_BY_MIME[mime] || path.extname(body.original.filename || '').replace('.', '') || 'bin';
      documentId = crypto.randomUUID();
      const storedFilename = `${documentId}.${ext}`;
      const storedPath = await saveFile({
        filename: storedFilename,
        mimeType: mime,
        buffer: Buffer.from(body.original.base64, 'base64'),
      });
      await store.insert('documents', {
        id: documentId,
        filename: body.original.filename || storedFilename,
        mime_type: mime,
        category: 'Quote',
        file_path: storedPath,
        uploaded_at: new Date().toISOString(),
      });
    } catch (err) {
      documentId = null; // filing is a nice-to-have -- never block the read on it
    }
  }

  try {
    const [categories, boqItems] = await Promise.all([listCategories(), store.listAll('boq_items')]);
    const draft = await extractQuoteLines({
      pages: pages.map((p) => ({ base64: p.base64, mediaType: p.mediaType || 'image/png' })),
      categoryNames: categories.map((c) => c.name),
    });

    const items = (draft.line_items || []).map((line) => {
      const categoryMatch = categories.find((c) => c.name.toLowerCase() === String(line.category || '').toLowerCase());

      let bestBoqId = '';
      let bestScore = 0;
      for (const boqItem of boqItems) {
        const score = scoreMatch(line.description, boqItem, { unit: line.unit });
        if (score > bestScore) {
          bestScore = score;
          bestBoqId = boqItem.id;
        }
      }

      return {
        description: line.description,
        category_id: categoryMatch ? categoryMatch.id : '',
        category_name: categoryMatch ? categoryMatch.name : line.category || '',
        quantity: line.quantity ?? 1,
        unit: line.unit || '',
        unit_price: line.unit_price ?? null,
        line_total: line.line_total ?? (line.unit_price != null ? line.unit_price * (line.quantity ?? 1) : null),
        generic_rate_suspected: Boolean(line.generic_rate_suspected),
        generic_rate_reason: line.generic_rate_reason || '',
        suggested_boq_item_id: bestScore >= MIN_MATCH_SCORE ? bestBoqId : '',
      };
    });

    sendJson(res, {
      ok: true,
      document_id: documentId,
      supplier: draft.supplier || '',
      quote_date: draft.quote_date || '',
      items,
    });
  } catch (err) {
    sendJson(res, { ok: false, document_id: documentId, error: err.message }, 200);
  }
}

async function handleQuoteImportConfirmApi(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const supplier = (body.supplier || '').trim() || 'Unknown supplier';
  const quoteDate = body.quote_date || null;
  const lines = Array.isArray(body.lines) ? body.lines : [];

  let count = 0;
  for (const line of lines) {
    const description = (line.description || '').trim();
    if (!description) continue;
    const quantity = Number(line.quantity) || 1;

    const lineTotalCents = line.line_total !== '' && line.line_total != null
      ? dollarsToCents(line.line_total)
      : dollarsToCents(line.unit_price) * quantity;
    if (!lineTotalCents) continue; // nothing priced -- nothing useful to record

    let boqItemId = Number(line.boq_item_id) || null;

    if (!boqItemId) {
      const categoryId = Number(line.category_id);
      if (!categoryId) continue; // a new item needs a category to file under
      const unitCostCents = quantity > 0 ? Math.round(lineTotalCents / quantity) : lineTotalCents;
      const created = await store.insert('boq_items', {
        category_id: categoryId,
        description,
        quantity,
        unit: line.unit || '',
        unit_cost_cents: unitCostCents,
        supplier,
        status: 'not_ordered',
        note: `Imported from a quote (${supplier}${quoteDate ? ', ' + quoteDate : ''}) -- confirm before ordering.`,
        created_at: new Date().toISOString(),
      });
      boqItemId = created.id;
    }

    await store.insert('quotes', {
      boq_item_id: boqItemId,
      supplier,
      price_cents: lineTotalCents,
      quote_date: quoteDate,
      note: 'Auto-extracted from an uploaded quote -- confirm the numbers before relying on this.',
      created_at: new Date().toISOString(),
    });
    count += 1;
  }

  sendJson(res, { ok: true, count });
}

module.exports = {
  handleQuoteImportPage,
  handleQuoteParseApi,
  handleQuoteImportConfirmApi,
};
