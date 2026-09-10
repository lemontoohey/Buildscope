// Job Estimator — a library of past custom jobs, and a similarity-matching
// engine (lib/estimator.js) that uses them to estimate a new prospective
// job. This is the tool built for pricing CUSTOM/non-standard work, which
// is exactly where a generic estimating package struggles: instead of a
// catalogue of standard assemblies, it leans on "what did OUR past jobs
// like this one actually cost", and it gets sharper the moment a job is
// marked Completed with its real final numbers — no retraining step, no
// model file, just one more data point the next estimate can weigh in.
//
// Every generated number is shown next to the specific past jobs that
// produced it (name, similarity, $/m²) — same "confirm before saving"
// spirit as the rest of this app's AI-assisted features. Nothing here
// calls an external AI provider; it's the "local similarity engine"
// approach, chosen so it works with zero setup and every figure is
// traceable back to a real job, not a black box.

const { store } = require('../lib/store');
const { layout, planVariantFor } = require('../lib/layout');
const { escapeHtml, centsToDisplay, dollarsToCents } = require('../lib/render');
const { readFormBody, redirect, sendJson, notFound } = require('../lib/http');
const { saveFile, readFile } = require('../lib/file-storage');
const crypto = require('node:crypto');
const path = require('node:path');
const estimator = require('../lib/estimator');
const { DEFAULT_CATEGORIES } = require('../lib/seed-data');

const STATUS_LABELS = {
  draft: 'Draft',
  quoted: 'Quoted',
  won: 'Won — building',
  lost: 'Lost',
  completed: 'Completed (reference data)',
};

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-700',
  quoted: 'bg-blue-100 text-blue-800',
  won: 'bg-amber-100 text-amber-800',
  lost: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-800',
};

const CONSTRUCTION_TYPE_SUGGESTIONS = [
  'Timber frame',
  'Steel frame',
  'Brick veneer',
  'Masonry block',
  'Rammed earth',
  'SIP panel',
  'ICF (insulated concrete formwork)',
  'Kit home',
  'Container conversion',
];

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function parseConfidence(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ratePerM2Display(totalCents, areaM2) {
  if (!totalCents || !areaM2) return '—';
  return centsToDisplay(Math.round(totalCents / areaM2)) + '/m²';
}

async function loadLineItemsByJobId() {
  const all = await store.listAll('estimate_line_items', { orderBy: 'sort_order' });
  const byJob = {};
  for (const li of all) {
    if (!byJob[li.job_id]) byJob[li.job_id] = [];
    byJob[li.job_id].push(li);
  }
  return byJob;
}

// --- List page -------------------------------------------------------

async function handleEstimatorPage(req, res, { sendHtml }, flash) {
  const jobs = await store.listAll('estimate_jobs', { orderBy: 'updated_at desc' });
  const active = jobs.filter((j) => j.status !== 'completed');
  const reference = jobs.filter((j) => j.status === 'completed');

  function row(j) {
    const total = j.status === 'completed' ? j.actual_total_cents : j.estimated_total_cents;
    const confidence = parseConfidence(j.estimated_confidence);
    return `<tr class="border-b border-slate-100">
      <td class="py-2 pr-4"><a class="text-blue-700 hover:underline font-medium" href="/estimator/${j.id}">${escapeHtml(j.name)}</a></td>
      <td class="py-2 pr-4"><span class="inline-block px-2 py-0.5 rounded text-xs ${STATUS_BADGE[j.status] || 'bg-slate-100 text-slate-700'}">${escapeHtml(STATUS_LABELS[j.status] || j.status)}</span></td>
      <td class="py-2 pr-4 text-sm text-slate-600">${escapeHtml(j.construction_type || '—')}</td>
      <td class="py-2 pr-4 text-sm text-slate-600">${j.floor_area_m2 ? j.floor_area_m2 + ' m²' : '—'}</td>
      <td class="py-2 pr-4 text-right">${total ? centsToDisplay(total) : '—'}</td>
      <td class="py-2 pr-4 text-sm text-slate-500">${confidence ? escapeHtml(confidence.label) : '—'}</td>
    </tr>`;
  }

  const activeRows = active.map(row).join('\n');
  const referenceRows = reference.map(row).join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Job Estimator</h1>
    <p class="text-sm text-slate-500 mb-6 max-w-3xl">
      Price a new custom job from what your own past jobs actually cost. Enter a new draft with its
      floor area, construction type and site conditions, hit Generate estimate, and it matches it
      against your completed jobs below — weighted by how alike they are — instead of a generic rate.
      Mark a job Completed once it's built and its real numbers are in, and it joins the reference
      library for the next estimate. No AI calls, nothing hidden: every figure links back to the jobs
      that produced it.
    </p>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <h2 class="text-lg font-semibold mb-3">Draft &amp; active estimates</h2>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Job</th>
            <th class="py-2 pr-4 font-medium">Status</th>
            <th class="py-2 pr-4 font-medium">Construction</th>
            <th class="py-2 pr-4 font-medium">Floor area</th>
            <th class="py-2 pr-4 font-medium text-right">Estimated</th>
            <th class="py-2 pr-4 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>${activeRows || '<tr><td class="py-3 text-slate-500" colspan="6">No drafts yet — add one below.</td></tr>'}</tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mb-3">Add a job</h2>
    <form method="post" action="/estimator/new" class="bg-white rounded-lg border border-slate-200 p-4 flex gap-2 max-w-xl mb-8">
      <input
        type="text"
        name="name"
        required
        placeholder="e.g. Smith residence — Bellingen"
        class="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Add draft</button>
    </form>

    <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
      <h2 class="text-lg font-semibold mb-1">Completed jobs (reference library)</h2>
      <p class="text-xs text-slate-500 mb-3">These are what new estimates are matched against. The demo jobs seeded here have invented numbers — replace them with your real completed jobs as you go.</p>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Job</th>
            <th class="py-2 pr-4 font-medium">Status</th>
            <th class="py-2 pr-4 font-medium">Construction</th>
            <th class="py-2 pr-4 font-medium">Floor area</th>
            <th class="py-2 pr-4 font-medium text-right">Actual total</th>
            <th class="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>${referenceRows || '<tr><td class="py-3 text-slate-500" colspan="6">None yet.</td></tr>'}</tbody>
      </table>
    </div>
  `;

  sendHtml(res, layout({ title: 'Job Estimator', activePath: '/estimator', body, flash, wide: true }));
}

async function handleEstimatorNew(req, res) {
  const form = await readFormBody(req);
  const name = (form.name || '').trim();
  if (name) {
    const now = new Date().toISOString();
    const job = await store.insert('estimate_jobs', {
      name,
      status: 'draft',
      description: null,
      floor_area_m2: null,
      storeys: null,
      construction_type: null,
      quality_level: null,
      site_conditions: '[]',
      region: null,
      client_name: null,
      estimated_total_cents: null,
      estimated_confidence: null,
      actual_total_cents: null,
      notes: null,
      created_at: now,
      updated_at: now,
    });
    return redirect(res, `/estimator/${job.id}`);
  }
  redirect(res, '/estimator');
}

// --- Detail page -------------------------------------------------------

function attributesForm(job) {
  const tags = estimator.toTagArray(job.site_conditions).join(', ');
  const qualityOptions = estimator.QUALITY_LEVELS.map(
    (q) => `<option value="${q}" ${job.quality_level === q ? 'selected' : ''}>${q[0].toUpperCase()}${q.slice(1)}</option>`
  ).join('');
  const datalistOptions = CONSTRUCTION_TYPE_SUGGESTIONS.map((t) => `<option value="${escapeHtml(t)}">`).join('');

  return `
  <form method="post" action="/estimator/${job.id}/update" class="bg-white rounded-lg border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="md:col-span-2">
      <label class="block text-sm font-medium mb-1">Job name</label>
      <input type="text" name="name" value="${escapeHtml(job.name)}" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="md:col-span-2">
      <label class="block text-sm font-medium mb-1">Scope / site description</label>
      <textarea name="description" rows="3" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="What makes this one non-standard — layout, access, anything unusual.">${escapeHtml(job.description || '')}</textarea>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Floor area (m²)</label>
      <input type="number" step="0.1" name="floor_area_m2" value="${job.floor_area_m2 ?? ''}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Storeys</label>
      <input type="number" step="1" name="storeys" value="${job.storeys ?? ''}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Construction type</label>
      <input list="construction-types" type="text" name="construction_type" value="${escapeHtml(job.construction_type || '')}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Steel frame" />
      <datalist id="construction-types">${datalistOptions}</datalist>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Quality level</label>
      <select name="quality_level" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
        <option value="">—</option>
        ${qualityOptions}
      </select>
    </div>
    <div class="md:col-span-2">
      <label class="block text-sm font-medium mb-1">Site conditions (comma-separated)</label>
      <input type="text" name="site_conditions" value="${escapeHtml(tags)}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="sloping site, bushfire BAL-29, remote access" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Region</label>
      <input type="text" name="region" value="${escapeHtml(job.region || '')}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Northern Rivers NSW" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Client name</label>
      <input type="text" name="client_name" value="${escapeHtml(job.client_name || '')}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">Actual total (once known)</label>
      <input type="text" name="actual_total" value="${job.actual_total_cents != null ? (job.actual_total_cents / 100).toFixed(2) : ''}" class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="$" />
    </div>
    <div class="md:col-span-2">
      <label class="block text-sm font-medium mb-1">Notes</label>
      <textarea name="notes" rows="2" class="w-full rounded border border-slate-300 px-3 py-2 text-sm">${escapeHtml(job.notes || '')}</textarea>
    </div>
    <div class="md:col-span-2">
      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Save attributes</button>
    </div>
  </form>`;
}

function statusActions(job) {
  const next = {
    draft: [
      ['quoted', 'Mark Quoted'],
      ['lost', 'Mark Lost'],
    ],
    quoted: [
      ['won', 'Mark Won'],
      ['lost', 'Mark Lost'],
    ],
    won: [['completed', 'Mark Completed']],
    lost: [],
    completed: [],
  };
  const buttons = (next[job.status] || [])
    .map(
      ([status, label]) => `<form method="post" action="/estimator/${job.id}/status" class="inline">
        <input type="hidden" name="status" value="${status}" />
        <button class="text-sm bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded mr-2">${label}</button>
      </form>`
    )
    .join('');
  const note =
    job.status === 'won'
      ? '<p class="text-xs text-slate-500 mt-2">Marking this Completed adds it to your reference library — the next estimate can learn from it. Fill in the actual total (and ideally the category actuals below) first.</p>'
      : job.status === 'completed'
        ? '<p class="text-xs text-green-700 mt-2">In the reference library — future estimates can match against this job.</p>'
        : '';
  return `<div class="bg-white rounded-lg border border-slate-200 p-4">${buttons || '<span class="text-sm text-slate-400">No further status changes.</span>'}${note}</div>`;
}

function generatePanel(job, matchResult) {
  if (job.status === 'completed') return '';
  const canGenerate = job.floor_area_m2 && job.construction_type;
  const confidence = parseConfidence(job.estimated_confidence);

  let resultHtml = '';
  if (confidence) {
    const badgeClass =
      confidence.label === 'High' ? 'bg-green-100 text-green-800' : confidence.label === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
    const contributorsRows = (confidence.contributors || [])
      .map(
        (c) => `<tr class="border-b border-slate-100">
          <td class="py-1.5 pr-4"><a class="text-blue-700 hover:underline" href="/estimator/${c.job_id}">${escapeHtml(c.job_name || 'Job #' + c.job_id)}</a></td>
          <td class="py-1.5 pr-4">${(c.score * 100).toFixed(0)}%</td>
          <td class="py-1.5 pr-4">${c.floor_area_m2} m²</td>
          <td class="py-1.5 pr-4 text-right">${centsToDisplay(c.rate_per_m2_cents)}/m²</td>
          <td class="py-1.5 pr-4 text-right">${centsToDisplay(c.actual_total_cents)}</td>
        </tr>`
      )
      .join('');

    resultHtml = `
      <div class="mt-4 border-t border-slate-200 pt-4">
        <div class="flex items-center gap-3 mb-2">
          <span class="text-2xl font-bold">${job.estimated_total_cents ? centsToDisplay(job.estimated_total_cents) : '—'}</span>
          <span class="inline-block px-2 py-0.5 rounded text-xs ${badgeClass}">${escapeHtml(confidence.label)} confidence</span>
        </div>
        <p class="text-sm text-slate-600 mb-3">${escapeHtml(confidence.detail)}</p>
        ${
          contributorsRows
            ? `<p class="text-xs font-medium text-slate-500 mb-1">Matched against:</p>
        <table class="w-full text-xs mb-1">
          <thead><tr class="text-left text-slate-400 border-b border-slate-200">
            <th class="py-1 pr-4 font-medium">Job</th><th class="py-1 pr-4 font-medium">Similarity</th><th class="py-1 pr-4 font-medium">Floor area</th><th class="py-1 pr-4 font-medium text-right">Rate</th><th class="py-1 pr-4 font-medium text-right">Their total</th>
          </tr></thead>
          <tbody>${contributorsRows}</tbody>
        </table>`
            : ''
        }
      </div>`;
  }

  return `
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Estimate</h2>
        <form method="post" action="/estimator/${job.id}/generate">
          <button ${canGenerate ? '' : 'disabled'} class="text-sm bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7a1611]">Generate estimate</button>
        </form>
      </div>
      ${canGenerate ? '' : '<p class="text-xs text-amber-700 mt-2">Set floor area and construction type above before generating.</p>'}
      ${resultHtml}
    </div>`;
}

function lineItemsTable(job, lineItems) {
  const categoryOptions = DEFAULT_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  const rows = lineItems
    .map(
      (li) => `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4">${escapeHtml(li.category_name)}</td>
        <td class="py-2 pr-4">
          <span class="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${li.source === 'manual' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}">${li.source === 'manual' ? 'Manual' : 'Computed'}</span>
        </td>
        <td class="py-2 pr-4">
          <form method="post" action="/estimator/${job.id}/line-items/upsert" class="flex items-center gap-1">
            <input type="hidden" name="line_item_id" value="${li.id}" />
            <input type="hidden" name="category_name" value="${escapeHtml(li.category_name)}" />
            <span class="text-slate-400">$</span>
            <input type="text" name="estimated" value="${li.estimated_cents != null ? (li.estimated_cents / 100).toFixed(2) : ''}" class="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right" />
            <span class="text-slate-400 ml-2">actual $</span>
            <input type="text" name="actual" value="${li.actual_cents != null ? (li.actual_cents / 100).toFixed(2) : ''}" class="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-right" />
            <button class="text-xs bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded ml-1">Save</button>
          </form>
        </td>
      </tr>`
    )
    .join('\n');

  const estimatedTotal = lineItems.reduce((s, li) => s + (li.estimated_cents || 0), 0);
  const actualTotal = lineItems.reduce((s, li) => s + (li.actual_cents || 0), 0);

  return `
    <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
      <h2 class="text-lg font-semibold mb-3">Category breakdown</h2>
      <table class="w-full text-sm mb-4">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Category</th>
            <th class="py-2 pr-4 font-medium">Source</th>
            <th class="py-2 pr-4 font-medium">Estimated / Actual</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="3">No line items yet — generate an estimate or add one below.</td></tr>'}</tbody>
        ${
          lineItems.length
            ? `<tfoot><tr class="border-t border-slate-300 font-semibold">
                <td class="py-2 pr-4">Total</td><td></td>
                <td class="py-2 pr-4">${centsToDisplay(estimatedTotal)} / ${centsToDisplay(actualTotal)}</td>
              </tr></tfoot>`
            : ''
        }
      </table>

      <h3 class="text-sm font-semibold mb-2">Add a category line</h3>
      <form method="post" action="/estimator/${job.id}/line-items/upsert" class="flex flex-wrap items-center gap-2">
        <input list="category-names" type="text" name="category_name" required placeholder="Category" class="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <datalist id="category-names">${categoryOptions}</datalist>
        <span class="text-slate-400 text-sm">est. $</span>
        <input type="text" name="estimated" class="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm text-right" />
        <span class="text-slate-400 text-sm">actual $</span>
        <input type="text" name="actual" class="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm text-right" />
        <button class="text-sm bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded">Add</button>
      </form>
    </div>`;
}

function attachmentsSection(job, attachments) {
  const rows = attachments
    .map(
      (a) =>
        `<li class="text-sm"><a class="text-blue-700 hover:underline" href="/estimator/${job.id}/attachments/${a.id}" target="_blank">${escapeHtml(a.filename)}</a> <span class="text-slate-400 text-xs">${escapeHtml(a.uploaded_at.slice(0, 10))}</span></li>`
    )
    .join('\n');

  return `
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <h2 class="text-lg font-semibold mb-3">Docs &amp; photos</h2>
      <p class="text-xs text-slate-500 mb-3">Attach past quotes, invoices or site photos for reference. For now these are filed for you to read — they're not auto-parsed into numbers yet, so enter figures into the breakdown above yourself.</p>
      <ul class="mb-4 space-y-1">${rows || '<li class="text-sm text-slate-500">Nothing attached yet.</li>'}</ul>
      <input id="attachInput-${job.id}" type="file" class="block w-full text-sm mb-2" />
      <button id="attachBtn-${job.id}" class="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-sm">Upload</button>
      <div id="attachStatus-${job.id}" class="mt-2 text-sm text-slate-600"></div>
      <script>
        (function () {
          var input = document.getElementById('attachInput-${job.id}');
          var btn = document.getElementById('attachBtn-${job.id}');
          var statusEl = document.getElementById('attachStatus-${job.id}');
          function fileToBase64(file) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }
          btn.addEventListener('click', async () => {
            const file = input.files[0];
            if (!file) { statusEl.textContent = 'Choose a file first.'; return; }
            statusEl.textContent = 'Uploading...';
            btn.disabled = true;
            try {
              const base64 = await fileToBase64(file);
              const res = await fetch('/api/estimator/${job.id}/attachments/upload', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ filename: file.name, mime: file.type, base64 }),
              });
              const data = await res.json();
              if (data.ok) { window.location.reload(); }
              else { statusEl.textContent = 'Upload failed: ' + (data.error || 'unknown error'); btn.disabled = false; }
            } catch (err) {
              statusEl.textContent = 'Upload failed: ' + err.message;
              btn.disabled = false;
            }
          });
        })();
      </script>
    </div>`;
}

async function handleEstimatorDetail(req, res, { sendHtml }, id, flash) {
  const job = await store.getById('estimate_jobs', id);
  if (!job) return notFound(res);

  const [lineItems, attachments] = await Promise.all([
    store.getWhere('estimate_line_items', { job_id: job.id }, { orderBy: 'sort_order' }),
    store.getWhere('estimate_attachments', { job_id: job.id }, { orderBy: 'uploaded_at' }),
  ]);

  const body = `
    <div class="flex items-center justify-between mb-2">
      <h1 class="text-2xl font-bold">${escapeHtml(job.name)}</h1>
      <span class="inline-block px-2 py-1 rounded text-sm ${STATUS_BADGE[job.status] || 'bg-slate-100 text-slate-700'}">${escapeHtml(STATUS_LABELS[job.status] || job.status)}</span>
    </div>
    <p class="mb-6"><a class="text-sm text-blue-700 hover:underline" href="/estimator">&larr; Back to Job Estimator</a></p>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        ${attributesForm(job)}
        ${generatePanel(job)}
        ${lineItemsTable(job, lineItems)}
      </div>
      <div class="space-y-6">
        ${statusActions(job)}
        ${attachmentsSection(job, attachments)}
      </div>
    </div>
  `;

  sendHtml(res, layout({ title: job.name, activePath: '/estimator', body, flash, wide: true, planVariant: planVariantFor(job.construction_type) }));
}

async function handleEstimatorUpdate(req, res, id) {
  const form = await readFormBody(req);
  const patch = {
    name: (form.name || '').trim() || 'Untitled job',
    description: form.description || null,
    floor_area_m2: form.floor_area_m2 ? Number(form.floor_area_m2) : null,
    storeys: form.storeys ? Number(form.storeys) : null,
    construction_type: form.construction_type ? form.construction_type.trim() : null,
    quality_level: form.quality_level || null,
    site_conditions: JSON.stringify(estimator.toTagArray(form.site_conditions)),
    region: form.region ? form.region.trim() : null,
    client_name: form.client_name ? form.client_name.trim() : null,
    notes: form.notes || null,
    updated_at: new Date().toISOString(),
  };
  if (form.actual_total !== undefined && form.actual_total !== '') {
    patch.actual_total_cents = dollarsToCents(form.actual_total);
  }
  await store.update('estimate_jobs', id, patch);
  redirect(res, `/estimator/${id}`);
}

async function handleEstimatorStatus(req, res, id) {
  const form = await readFormBody(req);
  const nextStatus = form.status;
  const job = await store.getById('estimate_jobs', id);
  if (!job) return notFound(res);

  if (nextStatus === 'completed') {
    let actualTotal = job.actual_total_cents;
    if (!actualTotal) {
      const lineItems = await store.getWhere('estimate_line_items', { job_id: job.id });
      const sum = lineItems.reduce((s, li) => s + (li.actual_cents || 0), 0);
      if (sum > 0) actualTotal = sum;
    }
    if (!actualTotal || !job.floor_area_m2) {
      return redirect(
        res,
        `/estimator/${id}?flash=${encodeURIComponent('Add a floor area and either an actual total or category actuals before marking this Completed.')}`
      );
    }
    await store.update('estimate_jobs', id, { status: 'completed', actual_total_cents: actualTotal, updated_at: new Date().toISOString() });
  } else {
    await store.update('estimate_jobs', id, { status: nextStatus, updated_at: new Date().toISOString() });
  }
  redirect(res, `/estimator/${id}`);
}

async function handleEstimatorGenerate(req, res, id) {
  const job = await store.getById('estimate_jobs', id);
  if (!job) return notFound(res);

  const [allJobs, lineItemsByJobId, ownLineItems] = await Promise.all([
    store.listAll('estimate_jobs'),
    loadLineItemsByJobId(),
    store.getWhere('estimate_line_items', { job_id: job.id }),
  ]);

  const target = {
    id: job.id,
    floor_area_m2: job.floor_area_m2,
    construction_type: job.construction_type,
    quality_level: job.quality_level,
    site_conditions: job.site_conditions,
    region: job.region,
  };

  const matches = estimator.findMatches(target, allJobs);
  const totalResult = estimator.estimateTotal(target, matches);
  const confidence = estimator.confidenceFor(totalResult);
  const categoryResults = estimator.estimateCategories(target, matches, lineItemsByJobId);

  await store.update('estimate_jobs', id, {
    estimated_total_cents: totalResult ? totalResult.estimated_cents : null,
    estimated_confidence: JSON.stringify({ ...confidence, contributors: totalResult ? totalResult.contributors : [] }),
    updated_at: new Date().toISOString(),
  });

  const existingByCategory = Object.fromEntries(ownLineItems.map((li) => [li.category_name, li]));
  let nextSort = ownLineItems.reduce((m, li) => Math.max(m, li.sort_order), -1) + 1;

  for (const [categoryName, result] of Object.entries(categoryResults)) {
    const existing = existingByCategory[categoryName];
    const contributorNote =
      'Computed from ' +
      result.contributors.length +
      ' job' +
      (result.contributors.length === 1 ? '' : 's') +
      ': ' +
      result.contributors.map((c) => `${c.job_name} (${centsToDisplay(c.rate_per_m2_cents)}/m²)`).join(', ') +
      '.';
    if (existing) {
      if (existing.source === 'manual') continue; // never silently overwrite a hand-typed figure
      await store.update('estimate_line_items', existing.id, { estimated_cents: result.estimated_cents, source: 'computed', notes: contributorNote });
    } else {
      await store.insert('estimate_line_items', {
        job_id: job.id,
        category_name: categoryName,
        estimated_cents: result.estimated_cents,
        actual_cents: null,
        source: 'computed',
        notes: contributorNote,
        sort_order: nextSort++,
      });
    }
  }

  redirect(res, `/estimator/${id}`);
}

async function handleEstimatorLineItemUpsert(req, res, id) {
  const form = await readFormBody(req);
  const categoryName = (form.category_name || '').trim();
  if (!categoryName) return redirect(res, `/estimator/${id}`);

  const patch = { source: 'manual' };
  if (form.estimated !== undefined) patch.estimated_cents = form.estimated === '' ? null : dollarsToCents(form.estimated);
  if (form.actual !== undefined) patch.actual_cents = form.actual === '' ? null : dollarsToCents(form.actual);

  if (form.line_item_id) {
    await store.update('estimate_line_items', Number(form.line_item_id), patch);
  } else {
    const existing = await store.getWhere('estimate_line_items', { job_id: Number(id) });
    const maxSort = existing.reduce((m, li) => Math.max(m, li.sort_order), -1);
    const duplicate = existing.find((li) => li.category_name.toLowerCase() === categoryName.toLowerCase());
    if (duplicate) {
      await store.update('estimate_line_items', duplicate.id, patch);
    } else {
      await store.insert('estimate_line_items', {
        job_id: Number(id),
        category_name: categoryName,
        estimated_cents: patch.estimated_cents ?? null,
        actual_cents: patch.actual_cents ?? null,
        source: 'manual',
        notes: null,
        sort_order: maxSort + 1,
      });
    }
  }
  redirect(res, `/estimator/${id}`);
}

async function handleEstimatorAttachmentUploadApi(req, res, { readJsonBody }, jobId) {
  const { filename, mime, base64 } = await readJsonBody(req);
  if (!base64) return sendJson(res, { ok: false, error: 'No file received.' }, 400);

  const ext = EXT_BY_MIME[mime] || path.extname(filename || '').replace('.', '') || 'bin';
  const id = crypto.randomUUID();
  const storedFilename = `estimator-${id}.${ext}`;
  const storedPath = await saveFile({ filename: storedFilename, mimeType: mime, buffer: Buffer.from(base64, 'base64') });

  await store.insert('estimate_attachments', {
    id,
    job_id: Number(jobId),
    filename: filename || storedFilename,
    mime_type: mime || null,
    file_path: storedPath,
    uploaded_at: new Date().toISOString(),
  });

  sendJson(res, { ok: true, attachment_id: id });
}

async function handleEstimatorAttachmentFile(req, res, jobId, attachmentId) {
  const attachment = await store.getById('estimate_attachments', attachmentId);
  if (!attachment || String(attachment.job_id) !== String(jobId)) return notFound(res);
  const buffer = await readFile(attachment.file_path);
  if (!buffer) return notFound(res);
  res.writeHead(200, { 'content-type': attachment.mime_type || 'application/octet-stream' });
  res.end(buffer);
}

module.exports = {
  handleEstimatorPage,
  handleEstimatorNew,
  handleEstimatorDetail,
  handleEstimatorUpdate,
  handleEstimatorStatus,
  handleEstimatorGenerate,
  handleEstimatorLineItemUpsert,
  handleEstimatorAttachmentUploadApi,
  handleEstimatorAttachmentFile,
};
