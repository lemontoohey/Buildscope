const path = require('node:path');
const crypto = require('node:crypto');
const { saveFile, readFile } = require('../lib/file-storage');
const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { sendJson, notFound } = require('../lib/http');

const DOC_CATEGORIES = [
  'DA / council approval',
  'BASIX',
  'Bushfire (BAL)',
  'Plan / drawing',
  'Contract',
  'Insurance',
  'Compliance certificate',
  'Warranty',
  'Receipt',
  'Other',
];

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

async function handleDocumentsPage(req, res, { sendHtml }, query) {
  const filter = query.category || '';
  const allDocuments = await store.listAll('documents', { orderBy: 'uploaded_at desc' });
  const documents = filter ? allDocuments.filter((d) => d.category === filter) : allDocuments;

  const filterOptions = DOC_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}" ${c === filter ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');

  const uploadOptions = DOC_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(
    ''
  );

  const rows = documents
    .map(
      (d) => `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4"><a class="text-blue-700 hover:underline" href="/documents/file/${d.id}" target="_blank">${escapeHtml(
        d.filename
      )}</a></td>
        <td class="py-2 pr-4"><span class="inline-block px-2 py-0.5 rounded bg-slate-100 text-xs">${escapeHtml(
          d.category
        )}</span></td>
        <td class="py-2 pr-4 text-slate-500 text-sm">${escapeHtml(d.uploaded_at.slice(0, 10))}</td>
      </tr>`
    )
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-6">Documents vault</h1>

    <form method="get" action="/documents" class="mb-4 flex items-center gap-2">
      <label class="text-sm text-slate-600">Filter:</label>
      <select name="category" class="rounded border border-slate-300 px-2 py-1 text-sm" onchange="this.form.submit()">
        <option value="">All</option>
        ${filterOptions}
      </select>
    </form>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">File</th>
            <th class="py-2 pr-4 font-medium">Category</th>
            <th class="py-2 pr-4 font-medium">Uploaded</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="3">No documents yet.</td></tr>'}</tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mb-3">Upload a document</h2>
    <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg">
      <input id="fileInput" type="file" class="block w-full text-sm mb-4" />
      <label class="block text-sm font-medium mb-1">Category</label>
      <select id="categorySelect" class="w-full rounded border border-slate-300 px-3 py-2 text-sm mb-4">
        ${uploadOptions}
      </select>
      <button id="uploadBtn" class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Upload</button>
      <div id="status" class="mt-4 text-sm text-slate-600"></div>
    </div>

    <script>
      const fileInput = document.getElementById('fileInput');
      const categorySelect = document.getElementById('categorySelect');
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
        if (!file) { statusEl.textContent = 'Choose a file first.'; return; }
        statusEl.textContent = 'Uploading...';
        uploadBtn.disabled = true;
        try {
          const base64 = await fileToBase64(file);
          const res = await fetch('/api/documents/upload', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filename: file.name, mime: file.type, base64, category: categorySelect.value }),
          });
          const data = await res.json();
          if (data.ok) {
            window.location.href = '/documents';
          } else {
            statusEl.textContent = 'Upload failed: ' + (data.error || 'unknown error');
            uploadBtn.disabled = false;
          }
        } catch (err) {
          statusEl.textContent = 'Upload failed: ' + err.message;
          uploadBtn.disabled = false;
        }
      });
    </script>
  `;

  sendHtml(res, layout({ title: 'Documents', activePath: '/documents', body }));
}

async function handleDocumentUploadApi(req, res, { readJsonBody }) {
  const { filename, mime, base64, category } = await readJsonBody(req);
  if (!base64) return sendJson(res, { ok: false, error: 'No file received.' }, 400);

  const ext = EXT_BY_MIME[mime] || path.extname(filename || '').replace('.', '') || 'bin';
  const id = crypto.randomUUID();
  const storedFilename = `${id}.${ext}`;
  const storedPath = await saveFile({ filename: storedFilename, mimeType: mime, buffer: Buffer.from(base64, 'base64') });

  await store.insert('documents', {
    id,
    filename: filename || storedFilename,
    mime_type: mime || null,
    category: category || 'Other',
    file_path: storedPath,
    uploaded_at: new Date().toISOString(),
  });

  sendJson(res, { ok: true, document_id: id });
}

async function handleDocumentFile(req, res, id) {
  const doc = await store.getById('documents', id);
  if (!doc) return notFound(res);
  const buffer = await readFile(doc.file_path);
  if (!buffer) return notFound(res);

  res.writeHead(200, { 'content-type': doc.mime_type || 'application/octet-stream' });
  res.end(buffer);
}

module.exports = { handleDocumentsPage, handleDocumentUploadApi, handleDocumentFile, DOC_CATEGORIES };
