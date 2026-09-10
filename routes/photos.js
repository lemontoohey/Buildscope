// Photo & Media Log (spec §3.8) — timestamped photos, linkable to a diary
// entry, a BOQ item, or a schedule stage, with a defect flag so the same
// log doubles as a punch list in the lead-up to handover.

const path = require('node:path');
const crypto = require('node:crypto');
const { saveFile, readFile } = require('../lib/file-storage');
const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, todayIso } = require('../lib/render');
const { sendJson, notFound, redirect } = require('../lib/http');
const { BUTTON_CLASSES } = require('../lib/theme');

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function linkLabel(photo, diaryById, boqById, stageById) {
  if (photo.linked_type === 'diary_entries' && diaryById[photo.linked_id]) {
    return 'Diary: ' + diaryById[photo.linked_id].entry_date;
  }
  if (photo.linked_type === 'boq_items' && boqById[photo.linked_id]) {
    return 'Materials: ' + boqById[photo.linked_id].description;
  }
  if (photo.linked_type === 'schedule_stages' && stageById[photo.linked_id]) {
    return 'Schedule: ' + stageById[photo.linked_id].name;
  }
  return '';
}

async function handlePhotosPage(req, res, { sendHtml }, query, flash) {
  const defectsOnly = query.defects === '1';
  const [allPhotos, diaryEntries, boqItems, stages] = await Promise.all([
    store.listAll('photos', { orderBy: 'taken_at desc' }),
    store.listAll('diary_entries'),
    store.listAll('boq_items'),
    store.listAll('schedule_stages', { orderBy: 'sort_order' }),
  ]);

  const diaryById = Object.fromEntries(diaryEntries.map((d) => [String(d.id), d]));
  const boqById = Object.fromEntries(boqItems.map((b) => [String(b.id), b]));
  const stageById = Object.fromEntries(stages.map((s) => [String(s.id), s]));

  const photos = defectsOnly ? allPhotos.filter((p) => p.is_defect) : allPhotos;
  const defectCount = allPhotos.filter((p) => p.is_defect).length;

  const linkOptions =
    '<option value="">No link</option>' +
    '<optgroup label="Diary entries">' +
    diaryEntries.map((d) => `<option value="diary_entries:${d.id}">${escapeHtml(d.entry_date)}${d.work_done ? ' — ' + escapeHtml(d.work_done.slice(0, 40)) : ''}</option>`).join('') +
    '</optgroup>' +
    '<optgroup label="Materials / BOQ">' +
    boqItems.map((b) => `<option value="boq_items:${b.id}">${escapeHtml(b.description)}</option>`).join('') +
    '</optgroup>' +
    '<optgroup label="Schedule stages">' +
    stages.map((s) => `<option value="schedule_stages:${s.id}">${escapeHtml(s.name)}</option>`).join('') +
    '</optgroup>';

  const cards = photos
    .map((p) => {
      const label = linkLabel(p, diaryById, boqById, stageById);
      return `<div class="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <a href="/photos/file/${p.id}" target="_blank">
          <img src="/photos/file/${p.id}" class="w-full h-40 object-cover" />
        </a>
        <div class="p-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500">${escapeHtml((p.taken_at || '').slice(0, 10))}</span>
            ${p.is_defect ? '<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">Defect</span>' : ''}
          </div>
          ${p.caption ? `<p class="text-xs mt-1">${escapeHtml(p.caption)}</p>` : ''}
          ${label ? `<p class="text-[11px] text-blue-700 mt-1">${escapeHtml(label)}</p>` : ''}
          <form method="post" action="/photos/${p.id}/defect" class="mt-1">
            <button class="text-[11px] underline text-slate-500">${p.is_defect ? 'Unflag defect' : 'Flag as defect'}</button>
          </form>
        </div>
      </div>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Photos</h1>
    <p class="text-sm text-slate-600 mb-6 max-w-2xl">Timestamped photos linked to a diary entry, a materials line, or a schedule stage. Flag anything that needs fixing as a defect — the Defects tab doubles as a punch list for handover.</p>

    <div class="flex items-center gap-2 mb-4">
      <a href="/photos" class="text-sm px-3 py-1.5 rounded ${defectsOnly ? 'bg-white border border-slate-300' : 'bg-[#4f6070] text-white'}">All (${allPhotos.length})</a>
      <a href="/photos?defects=1" class="text-sm px-3 py-1.5 rounded ${defectsOnly ? 'bg-[#4f6070] text-white' : 'bg-white border border-slate-300'}">Defects (${defectCount})</a>
    </div>

    <div class="bg-white rounded-lg border border-slate-200 p-5 mb-8 max-w-lg">
      <h2 class="font-semibold mb-3">Add photos</h2>
      <input id="fileInput" type="file" accept="image/*" capture="environment" multiple class="block w-full text-sm mb-3" />
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">Taken</label>
          <input id="takenAt" type="date" value="${todayIso()}" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs text-slate-500 mb-1">Link to (optional)</label>
          <select id="linkSelect" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">${linkOptions}</select>
        </div>
      </div>
      <input id="captionInput" type="text" placeholder="Caption (optional)" class="w-full rounded border border-slate-300 px-3 py-2 text-sm mb-3" />
      <label class="flex items-center gap-2 text-sm mb-3"><input id="defectCheck" type="checkbox" /> Flag as defect</label>
      <button id="uploadBtn" class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Upload</button>
      <div id="status" class="mt-3 text-sm text-slate-600"></div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      ${cards || '<p class="text-sm text-slate-500 col-span-full">No photos yet.</p>'}
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
          var files = Array.prototype.slice.call(fileInput.files);
          if (!files.length) { statusEl.textContent = 'Choose at least one photo.'; return; }
          uploadBtn.disabled = true;
          var linkVal = document.getElementById('linkSelect').value;
          var parts = linkVal ? linkVal.split(':') : ['', ''];
          var ok = 0;
          for (var i = 0; i < files.length; i++) {
            statusEl.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '...';
            try {
              var base64 = await fileToBase64(files[i]);
              var res = await fetch('/api/photos/upload', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  filename: files[i].name,
                  mime: files[i].type,
                  base64: base64,
                  taken_at: document.getElementById('takenAt').value,
                  caption: document.getElementById('captionInput').value,
                  linked_type: parts[0] || null,
                  linked_id: parts[1] || null,
                  is_defect: document.getElementById('defectCheck').checked,
                }),
              });
              var data = await res.json();
              if (data.ok) ok++;
            } catch (err) {}
          }
          statusEl.textContent = ok + ' of ' + files.length + ' uploaded.';
          if (ok) window.location.href = '/photos';
          uploadBtn.disabled = false;
        });
      })();
    </script>
  `;

  sendHtml(res, layout({ title: 'Photos', activePath: '/photos', body, flash }));
}

async function handlePhotoUploadApi(req, res, { readJsonBody }) {
  const { filename, mime, base64, taken_at, caption, linked_type, linked_id, is_defect } = await readJsonBody(req);
  if (!base64) return sendJson(res, { ok: false, error: 'No file received.' }, 400);

  const ext = EXT_BY_MIME[mime] || path.extname(filename || '').replace('.', '') || 'jpg';
  const id = crypto.randomUUID();
  const storedFilename = `${id}.${ext}`;
  const storedPath = await saveFile({ filename: storedFilename, mimeType: mime, buffer: Buffer.from(base64, 'base64') });

  await store.insert('photos', {
    id,
    filename: filename || storedFilename,
    mime_type: mime || null,
    file_path: storedPath,
    caption: caption || null,
    taken_at: taken_at || new Date().toISOString().slice(0, 10),
    linked_type: linked_type || null,
    linked_id: linked_id ? String(linked_id) : null,
    is_defect: Boolean(is_defect),
    created_at: new Date().toISOString(),
  });

  sendJson(res, { ok: true, photo_id: id });
}

async function handlePhotoFile(req, res, id) {
  const photo = await store.getById('photos', id);
  if (!photo) return notFound(res);
  const buffer = await readFile(photo.file_path);
  if (!buffer) return notFound(res);
  res.writeHead(200, { 'content-type': photo.mime_type || 'application/octet-stream' });
  res.end(buffer);
}

async function handlePhotoToggleDefect(req, res, helpers, id) {
  const photo = await store.getById('photos', id);
  if (photo) await store.update('photos', id, { is_defect: photo.is_defect ? false : true });
  redirect(res, '/photos');
}

module.exports = {
  handlePhotosPage,
  handlePhotoUploadApi,
  handlePhotoFile,
  handlePhotoToggleDefect,
};
