// Where uploaded files (receipts, DA approvals, contracts, plans, etc.)
// physically live — follows the same backend choice as the data store, so
// "Google Drive" means the documents vault backs up there too, not just the
// budget/schedule/etc. tables. This matters a lot for a hosted deployment:
// a server on an ephemeral disk (most free hosting) wipes local files on
// every restart, so anything meant to survive that has to go to Drive.
//
// Encoding: a document's stored `file_path` is either a bare filename
// (local disk, under DOCS_DIR — the original Phase 1 behaviour, so old
// rows keep working untouched) or `drive:<driveFileId>` for anything saved
// while Google Drive was the active backend. readFile() branches on that
// prefix, so a document keeps working even if the backend is switched
// after it was uploaded.

const fs = require('node:fs');
const path = require('node:path');
const { getBackendConfig } = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DOCS_DIR = path.join(DATA_DIR, 'documents');
fs.mkdirSync(DOCS_DIR, { recursive: true });

function isDriveBackend() {
  return getBackendConfig().backend === 'google_drive';
}

async function saveFile({ filename, mimeType, buffer }) {
  if (isDriveBackend()) {
    const { uploadFile } = require('./google-drive-files');
    const fileId = await uploadFile({ filename, mimeType, buffer });
    return `drive:${fileId}`;
  }
  fs.writeFileSync(path.join(DOCS_DIR, filename), buffer);
  return filename;
}

async function readFile(filePath) {
  if (filePath.startsWith('drive:')) {
    const { downloadFile } = require('./google-drive-files');
    return downloadFile(filePath.slice('drive:'.length));
  }
  const fullPath = path.join(DOCS_DIR, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

module.exports = { saveFile, readFile, DOCS_DIR };
