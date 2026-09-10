const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { sendJson } = require('../lib/http');
const { listCategories } = require('./budget');
const { BUTTON_CLASSES } = require('../lib/theme');
const { isAiConfigured, draftTakeoff } = require('../lib/ai');

async function ensureSheet(documentId, pageNumber = 1) {
  const page = Number(pageNumber) || 1;
  const existing = await store.getWhere('plan_sheets', { document_id: String(documentId) });
  const match = existing.find((s) => Number(s.page_number) === page);
  if (match) return match;
  return store.insert('plan_sheets', {
    document_id: String(documentId),
    page_number: page,
    name: null,
    scale_label: null,
    pixels_per_metre: null,
    rotation: 0,
    created_at: new Date().toISOString(),
  });
}

function isPlanDocument(doc) {
  const mime = (doc.mime_type || '').toLowerCase();
  const name = (doc.filename || '').toLowerCase();
  const cat = doc.category || '';
  return (
    cat === 'Plan / drawing' ||
    mime.includes('pdf') ||
    mime.startsWith('image/') ||
    /\.(pdf|png|jpe?g|webp)$/.test(name)
  );
}

async function handlePlanMeasurePage(req, res, { sendHtml }, query, flash) {
  const docId = query.doc || '';
  const categories = await listCategories();
  const documents = (await store.listAll('documents', { orderBy: 'uploaded_at desc' })).filter(isPlanDocument);

  if (!docId) {
    const rows = documents
      .map(
        (d) => `<tr class="border-b border-slate-100">
          <td class="py-2 pr-4">${escapeHtml(d.filename)}</td>
          <td class="py-2 pr-4 text-xs text-slate-500">${escapeHtml(d.category)}</td>
          <td class="py-2 pr-4 text-xs text-slate-500">${escapeHtml((d.uploaded_at || '').slice(0, 10))}</td>
          <td class="py-2 pr-4"><a href="/plan-measure?doc=${encodeURIComponent(d.id)}" class="text-sm text-blue-700 hover:underline">Open on board</a></td>
        </tr>`
      )
      .join('\n');

    const body = `
      <h1 class="text-2xl font-bold mb-2">Plan Measure</h1>
      <p class="text-sm text-slate-600 mb-6 max-w-3xl">
        Measure quantities off the drawings, then push them into Materials or a Formulate recipe.
        Upload a PDF or image, set the scale (calibrate against a known dimension — the accurate way),
        then trace lengths, areas, volumes and counts. This is a quantity board for this job, not a
        substitute for a quantity surveyor.
      </p>

      <div class="bg-white rounded-lg border border-slate-200 p-5 mb-8 max-w-lg">
        <h2 class="font-semibold mb-3">Upload a plan</h2>
        <input id="fileInput" type="file" accept="application/pdf,image/*" class="block w-full text-sm mb-3" />
        <button id="uploadBtn" class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Upload and open</button>
        <div id="status" class="mt-3 text-sm text-slate-600"></div>
      </div>

      <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500 border-b border-slate-200">
              <th class="py-2 pr-4 font-medium">Plan</th>
              <th class="py-2 pr-4 font-medium">Category</th>
              <th class="py-2 pr-4 font-medium">Uploaded</th>
              <th class="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="4">No plans yet — upload a PDF or photo of a drawing.</td></tr>'}</tbody>
        </table>
      </div>
      <script>
        (function () {
          var fileInput = document.getElementById('fileInput');
          var uploadBtn = document.getElementById('uploadBtn');
          var statusEl = document.getElementById('status');
          function fileToBase64(file) {
            return new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () { resolve(reader.result.split(',')[1]); };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }
          uploadBtn.addEventListener('click', async function () {
            var file = fileInput.files[0];
            if (!file) { statusEl.textContent = 'Choose a PDF or image first.'; return; }
            statusEl.textContent = 'Uploading...';
            uploadBtn.disabled = true;
            try {
              var base64 = await fileToBase64(file);
              var res = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ filename: file.name, mime: file.type, base64, category: 'Plan / drawing' }),
              });
              var data = await res.json();
              if (data.ok) window.location.href = '/plan-measure?doc=' + encodeURIComponent(data.document_id);
              else {
                statusEl.textContent = 'Upload failed: ' + (data.error || 'unknown error');
                uploadBtn.disabled = false;
              }
            } catch (err) {
              statusEl.textContent = 'Upload failed: ' + err.message;
              uploadBtn.disabled = false;
            }
          });
        })();
      </script>
    `;
    return sendHtml(res, layout({ title: 'Plan Measure', activePath: '/plan-measure', body, flash }));
  }

  const doc = await store.getById('documents', docId);
  if (!doc) {
    return sendHtml(
      res,
      layout({
        title: 'Plan Measure',
        activePath: '/plan-measure',
        body: '<p>That plan was not found. <a class="text-blue-700 underline" href="/plan-measure">Back</a></p>',
        flash: 'Plan not found.',
      })
    );
  }

  const sheet = await ensureSheet(doc.id, 1);
  const measurements = await store.getWhere('plan_measurements', { sheet_id: sheet.id });
  const categoryOptions = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  const recipes = await store.listAll('formulate_recipes', { orderBy: 'sort_order' });
  const recipeOptions = recipes
    .map((r) => `<option value="${escapeHtml(r.slug || String(r.id))}">${escapeHtml(r.name)}</option>`)
    .join('');

  const aiConfigured = await isAiConfigured();

  const boot = {
    documentId: doc.id,
    filename: doc.filename,
    mime: doc.mime_type,
    fileUrl: '/documents/file/' + doc.id,
    sheet,
    measurements,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    aiConfigured,
  };

  const body = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <p class="text-xs text-slate-500 mb-1"><a href="/plan-measure" class="text-blue-700 hover:underline">All plans</a></p>
        <h1 class="text-2xl font-bold">Plan Measure</h1>
        <p class="text-sm text-slate-600">${escapeHtml(doc.filename)}</p>
      </div>
      <p class="text-xs text-slate-500 max-w-md">
        Wheel to zoom, drag with the hand tool to pan. Calibrate scale against a dimension printed on the drawing before measuring.
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div class="flex flex-wrap gap-2 items-center px-3 py-2 border-b border-slate-200 bg-slate-50 text-sm">
          <label class="text-xs text-slate-500">Scale</label>
          <select id="commonScale" class="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="">Common scale…</option>
            <option value="20">1:20</option>
            <option value="25">1:25</option>
            <option value="50">1:50</option>
            <option value="75">1:75</option>
            <option value="100">1:100</option>
            <option value="200">1:200</option>
            <option value="250">1:250</option>
            <option value="500">1:500</option>
          </select>
          <button type="button" id="calibrateBtn" class="text-xs rounded border border-slate-300 px-2 py-1 bg-white">Calibrate</button>
          <span id="scaleLabel" class="text-xs text-slate-600"></span>
          <span class="mx-1 text-slate-300">|</span>
          <div id="toolBtns" class="flex flex-wrap gap-1">
            <button type="button" data-tool="pan" class="tool-btn text-xs rounded border px-2 py-1">Hand</button>
            <button type="button" data-tool="line" class="tool-btn text-xs rounded border px-2 py-1">Length</button>
            <button type="button" data-tool="rect" class="tool-btn text-xs rounded border px-2 py-1">Rectangle</button>
            <button type="button" data-tool="polygon" class="tool-btn text-xs rounded border px-2 py-1">Area</button>
            <button type="button" data-tool="volume" class="tool-btn text-xs rounded border px-2 py-1">Volume</button>
            <button type="button" data-tool="count" class="tool-btn text-xs rounded border px-2 py-1">Count</button>
            <button type="button" data-tool="deduct" class="tool-btn text-xs rounded border px-2 py-1">Deduct</button>
          </div>
          <label class="text-xs text-slate-500 ml-1">Colour</label>
          <input id="colorInput" type="color" value="#9b1b15" class="h-7 w-8 p-0 border border-slate-300 rounded" />
          <label class="text-xs text-slate-500">Depth m</label>
          <input id="depthInput" type="text" value="0.3" class="w-16 rounded border border-slate-300 px-1 py-1 text-xs" />
          <button type="button" id="undoBtn" class="text-xs rounded border border-slate-300 px-2 py-1 bg-white">Undo point</button>
        </div>
        <div class="relative bg-slate-200 overflow-hidden" style="height: min(70vh, 720px);">
          <canvas id="planCanvas" class="block w-full h-full cursor-crosshair"></canvas>
        </div>
        <p id="measureHint" class="text-xs text-slate-500 px-3 py-2 border-t border-slate-100"></p>
      </div>

      <div class="bg-white rounded-lg border border-slate-200 p-3 flex flex-col min-h-[480px]">
        <h2 class="font-semibold text-sm mb-2">Measurements</h2>
        <div id="measureList" class="flex-1 overflow-y-auto text-sm space-y-2"></div>
        <div id="measureTotals" class="text-xs text-slate-600 border-t border-slate-100 pt-2 mt-2"></div>
        <div class="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <label class="block text-xs text-slate-500">Category for new materials</label>
          <select id="categorySelect" class="w-full rounded border border-slate-300 px-2 py-1 text-xs">${categoryOptions}</select>
          <button type="button" id="sendAllBtn" class="${BUTTON_CLASSES} w-full px-3 py-1.5 rounded text-xs">Send all to Materials</button>
          <label class="block text-xs text-slate-500">Send selected length into Formulate</label>
          <select id="recipeSelect" class="w-full rounded border border-slate-300 px-2 py-1 text-xs">${recipeOptions}</select>
          <button type="button" id="toFormulateBtn" class="w-full text-xs rounded border border-slate-300 px-3 py-1.5 bg-white">Open in Formulate</button>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-lg border border-slate-200 p-5 mt-6">
      <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 class="font-semibold">AI takeoff — draft a starting BOQ from this plan</h2>
      </div>
      <p class="text-sm text-slate-600 mb-3 max-w-3xl">
        Reads the pages you pick (floor plans, elevations, the window/door schedule, roof plan work best)
        and drafts rough quantities: floor/roof area, a full glazing list, big-ticket volumes.
        <strong>Every line is a starting estimate</strong> — check it against a real quote or quantity
        surveyor before ordering anything.
      </p>
      ${
        aiConfigured
          ? ''
          : `<div class="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
               AI is off — <a class="underline" href="/settings">add your API key on the Settings page</a> to use this.
             </div>`
      }
      <div id="takeoffPagesPanel" class="mb-3"></div>
      <button type="button" id="takeoffRunBtn" class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm" ${aiConfigured ? '' : 'disabled'}>
        Draft BOQ from selected pages
      </button>
      <span id="takeoffStatus" class="ml-3 text-sm text-slate-600"></span>
      <div id="takeoffResults" class="mt-4"></div>
    </div>
    <script>window.PLAN_MEASURE_BOOT = ${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="/public/plan-measure.js"></script>
  `;

  sendHtml(res, layout({ title: 'Plan Measure', activePath: '/plan-measure', body, flash, wide: true }));
}

async function handlePlanMeasureState(req, res, { sendJson }, query) {
  const documentId = query.document_id;
  if (!documentId) return sendJson(res, { ok: false, error: 'Missing document.' }, 400);
  const page = Number(query.page) || 1;
  const sheet = await ensureSheet(documentId, page);
  const measurements = await store.getWhere('plan_measurements', { sheet_id: sheet.id });
  sendJson(res, { ok: true, sheet, measurements });
}

async function handlePlanMeasureScale(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const sheet = await ensureSheet(body.document_id, body.page_number || 1);
  const updated = await store.update('plan_sheets', sheet.id, {
    scale_label: body.scale_label || null,
    pixels_per_metre: body.pixels_per_metre != null ? Number(body.pixels_per_metre) : null,
  });
  sendJson(res, { ok: true, sheet: updated });
}

async function handlePlanMeasureSave(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const sheet = await ensureSheet(body.document_id, body.page_number || 1);
  const row = await store.insert('plan_measurements', {
    sheet_id: sheet.id,
    kind: body.kind,
    label: body.label || body.kind,
    quantity: Number(body.quantity) || 0,
    unit: body.unit || '',
    color: body.color || '#9b1b15',
    depth_m: body.depth_m != null ? Number(body.depth_m) : null,
    points_json: JSON.stringify(body.points || []),
    category_id: body.category_id ? Number(body.category_id) : null,
    boq_item_id: null,
    created_at: new Date().toISOString(),
  });
  sendJson(res, { ok: true, measurement: row });
}

async function handlePlanMeasureDelete(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  await store.remove('plan_measurements', body.id);
  sendJson(res, { ok: true });
}

async function handlePlanMeasureSend(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const all = await store.listAll('plan_measurements');
  const selected = all.filter((m) => ids.includes(m.id) || ids.includes(String(m.id)));
  const created = [];
  for (const m of selected) {
    const item = await store.insert('boq_items', {
      category_id: Number(body.category_id || m.category_id),
      description: m.label,
      quantity: m.quantity,
      unit: m.unit,
      unit_cost_cents: null,
      supplier: null,
      status: 'not_ordered',
      note: 'From Plan Measure',
      created_at: new Date().toISOString(),
    });
    await store.update('plan_measurements', m.id, { boq_item_id: item.id, category_id: item.category_id });
    created.push(item);
  }
  sendJson(res, { ok: true, count: created.length });
}

// --- AI materials takeoff (spec §4.2) --------------------------------------
// Client renders each selected PDF page to an image (pdf.js, already loaded
// for the manual trace tool) and posts them here. Nothing is written to
// Materials until handlePlanMeasureTakeoffConfirm is called with the items
// the person actually ticked.

async function handlePlanMeasureTakeoffApi(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const pages = Array.isArray(body.pages) ? body.pages : [];
  if (!pages.length) return sendJson(res, { ok: false, error: 'No pages selected.' }, 400);
  if (pages.length > 10) return sendJson(res, { ok: false, error: 'Select 10 pages or fewer at a time.' }, 400);

  try {
    const categories = await listCategories();
    const draft = await draftTakeoff({
      pages: pages.map((p) => ({ base64: p.base64, mediaType: p.mediaType || 'image/png' })),
      categoryNames: categories.map((c) => c.name),
    });

    const items = (draft.items || []).map((item) => {
      const match = categories.find((c) => c.name.toLowerCase() === String(item.category || '').toLowerCase());
      return {
        description: item.description,
        category_id: match ? match.id : '',
        category_name: match ? match.name : item.category || '',
        quantity: item.quantity,
        unit: item.unit,
        source: item.source || '',
        confidence: item.confidence || 'medium',
        is_novel: Boolean(item.is_novel),
        novelty_reason: item.novelty_reason || '',
      };
    });

    sendJson(res, {
      ok: true,
      floor_area_sqm: draft.floor_area_sqm ?? null,
      roof_area_sqm: draft.roof_area_sqm ?? null,
      assumptions: draft.assumptions || '',
      unusual_features: Array.isArray(draft.unusual_features) ? draft.unusual_features : [],
      items,
    });
  } catch (err) {
    sendJson(res, { ok: false, error: err.message }, 200);
  }
}

async function handlePlanMeasureTakeoffConfirm(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  let count = 0;
  for (const item of items) {
    if (!item.category_id || !item.description) continue;
    const sourceNote = item.source ? ` (${item.source})` : '';
    await store.insert('boq_items', {
      category_id: Number(item.category_id),
      description: item.description,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || '',
      unit_cost_cents: null,
      supplier: null,
      status: 'not_ordered',
      note: `AI estimate from plans — confirm with your builder/supplier/QS before ordering.${sourceNote}`,
      created_at: new Date().toISOString(),
    });
    count += 1;
  }
  sendJson(res, { ok: true, count });
}

module.exports = {
  handlePlanMeasurePage,
  handlePlanMeasureState,
  handlePlanMeasureScale,
  handlePlanMeasureSave,
  handlePlanMeasureDelete,
  handlePlanMeasureSend,
  handlePlanMeasureTakeoffApi,
  handlePlanMeasureTakeoffConfirm,
  ensureSheet,
};
