// Uploaded documents (receipts, contracts, plans, certificates, etc.) as
// individual files in Google Drive — reached with the same drive.file
// access token as lib/store.js's Drive data backend. Kept separate from
// store.js because this deals in raw file bytes, not JSON.
//
// This exists so a hosted deployment (an ephemeral disk that gets wiped on
// every restart/spin-down) doesn't lose uploaded files the moment the
// backend is Google Drive — "back up to Drive" should mean the documents
// vault too, not just the budget/schedule tables.

const { getAccessToken } = require('./google-auth');

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  } catch (err) {
    throw new Error(`Google Drive error — couldn't reach Google: ${err.message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Drive error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

// Binary-safe multipart body: text parts and the raw file bytes are
// concatenated as Buffers, never as JS strings (a string would corrupt
// arbitrary binary content like JPEGs/PDFs).
function buildMultipartBuffer({ filename, mimeType, fileBuffer, boundary }) {
  const metadata = JSON.stringify({ name: filename, mimeType });
  const preamble = Buffer.from(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  return Buffer.concat([preamble, fileBuffer, closing]);
}

async function uploadFile({ filename, mimeType, buffer }) {
  const boundary = `hcbt_file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const body = buildMultipartBuffer({
    filename,
    mimeType: mimeType || 'application/octet-stream',
    fileBuffer: buffer,
    boundary,
  });
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  return data.id;
}

async function downloadFile(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { uploadFile, downloadFile };
