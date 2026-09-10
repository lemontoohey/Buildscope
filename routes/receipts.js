const path = require('node:path');
const crypto = require('node:crypto');
const { saveFile } = require('../lib/file-storage');
const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { sendJson } = require('../lib/http');
const { isAiConfigured, parseReceipt } = require('../lib/ai');
const { listCategories } = require('./budget');

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

async function handleReceiptsNewPage(req, res, { sendHtml }) {
  const aiConfigured = await isAiConfigured();

  const aiBanner = aiConfigured
    ? ''
    : `<div class="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
         AI parsing is off — <a class="underline" href="/settings">add your API key on the Settings page</a> to have receipts read automatically.
         You can still upload a receipt to file it, or
         <a class="underline" href="/transactions/new">add a transaction manually</a>.
       </div>`;

  const body = `
    <h1 class="text-2xl font-bold mb-2">Add a receipt</h1>
    <p class="text-sm text-slate-600 mb-6">Photograph or scan a receipt/invoice. ${
      aiConfigured
        ? "The AI will read it and pre-fill a transaction for you to check."
        : "It'll be filed in your documents; you'll enter the details yourself below."
    }</p>
    ${aiBanner}

    <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg">
      <input id="fileInput" type="file" accept="image/*,application/pdf" capture="environment"
        class="block w-full text-sm mb-4" />
      <button id="uploadBtn" class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">
        Upload
      </button>
      <div id="status" class="mt-4 text-sm text-slate-600"></div>
    </div>

    <script>
      const fileInput = document.getElementById('fileInput');
      const uploadBtn = document.getElementById('uploadBtn');
      const statusEl = document.getElementById('status');

      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
          statusEl.textContent = 'Choose a file first.';
          return;
        }
        statusEl.textContent = 'Uploading and reading receipt...';
        uploadBtn.disabled = true;
        try {
          const base64 = await fileToBase64(file);
          const res = await fetch('/api/receipts/parse', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, mime: file.type, base64 }),
          });
          const data = await res.json();

          if (!data.ok) {
            statusEl.textContent = 'Filed, but could not auto-read it: ' + (data.error || 'unknown error') +
              '. You can still enter it manually.';
            const params = new URLSearchParams({ document_id: data.document_id || '' });
            uploadBtn.disabled = false;
            setTimeout(() => { window.location.href = '/transactions/new?' + params.toString(); }, 1500);
            return;
          }

          const p = data.parsed;
          const params = new URLSearchParams({
            document_id: data.document_id,
            ai_generated: '1',
            confidence: p.confidence || '',
            supplier: p.supplier || '',
            txn_date: p.date || '',
            amount: p.total_amount != null ? String(p.total_amount) : '',
            gst: p.gst_amount != null ? String(p.gst_amount) : '',
            category_id: data.suggested_category_id || '',
          });
          if (p.line_items) params.set('line_items', JSON.stringify(p.line_items));
          window.location.href = '/transactions/new?' + params.toString();
        } catch (err) {
          statusEl.textContent = 'Upload failed: ' + err.message;
          uploadBtn.disabled = false;
        }
      });
    </script>
  `;

  sendHtml(res, layout({ title: 'Add receipt', activePath: '/receipts/new', body }));
}

async function handleReceiptParseApi(req, res, { readJsonBody }) {
  const { filename, mime, base64 } = await readJsonBody(req);

  if (!base64) {
    return sendJson(res, { ok: false, error: 'No file received.' }, 400);
  }

  const ext = EXT_BY_MIME[mime] || path.extname(filename || '').replace('.', '') || 'bin';
  const id = crypto.randomUUID();
  const storedFilename = `${id}.${ext}`;
  const storedPath = await saveFile({ filename: storedFilename, mimeType: mime, buffer: Buffer.from(base64, 'base64') });

  await store.insert('documents', {
    id,
    filename: filename || storedFilename,
    mime_type: mime || null,
    category: 'Receipt',
    file_path: storedPath,
    uploaded_at: new Date().toISOString(),
  });

  if (!(await isAiConfigured())) {
    return sendJson(res, { ok: false, document_id: id, error: 'AI parsing is not configured.' });
  }

  try {
    const categories = await listCategories();
    const parsed = await parseReceipt({
      base64,
      mediaType: mime || 'image/jpeg',
      categoryNames: categories.map((c) => c.name),
    });

    const match = categories.find(
      (c) => c.name.toLowerCase() === String(parsed.suggested_category || '').toLowerCase()
    );

    sendJson(res, {
      ok: true,
      document_id: id,
      parsed,
      suggested_category_id: match ? match.id : '',
    });
  } catch (err) {
    sendJson(res, { ok: false, document_id: id, error: err.message });
  }
}

module.exports = { handleReceiptsNewPage, handleReceiptParseApi };
