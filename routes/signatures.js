// Digital signatures — a bare-bones e-sign: draw on a canvas, save it as a
// PNG data URL against a signer name, and link it to whatever it's signing
// off on (currently just purchase orders). No third-party e-sign service,
// no legal-weight claims made anywhere in the UI — this is a lightweight
// "so-and-so signed this on this date" record, not a DocuSign replacement.

const { store } = require('../lib/store');

const MAX_IMAGE_BYTES = 300 * 1024; // a signature pad PNG is small; this is a generous ceiling

async function handleSignatureCreate(req, res, { readJsonBody, sendJson }) {
  const body = await readJsonBody(req);
  const { signer_name, image_data, linked_type, linked_id } = body || {};

  if (!signer_name || !String(signer_name).trim()) {
    return sendJson(res, { ok: false, error: 'Signer name is required.' });
  }
  if (!image_data || !/^data:image\/png;base64,/.test(image_data)) {
    return sendJson(res, { ok: false, error: 'No signature was drawn.' });
  }
  if (image_data.length > MAX_IMAGE_BYTES) {
    return sendJson(res, { ok: false, error: 'Signature image is too large.' });
  }

  const signature = await store.insert('signatures', {
    signer_name: String(signer_name).trim(),
    image_data,
    signed_at: new Date().toISOString(),
    linked_type: linked_type || null,
    linked_id: linked_id != null ? Number(linked_id) : null,
    created_at: new Date().toISOString(),
  });

  if (linked_type === 'purchase_order' && linked_id != null) {
    await store.update('purchase_orders', Number(linked_id), { signature_id: signature.id });
  }

  sendJson(res, { ok: true, id: signature.id });
}

module.exports = { handleSignatureCreate };
