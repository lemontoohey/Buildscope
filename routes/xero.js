// API endpoint for the "Push to Xero" button on the Dashboard's recent
// transactions list. Kept as its own small route module (like
// routes/signatures.js) rather than folding into dashboard.js, since the
// Settings page also needs lib/xero-auth.js for the connect/disconnect flow.

const { store } = require('../lib/store');
const xeroAuth = require('../lib/xero-auth');
const { pushTransactionAsBill } = require('../lib/xero');

async function handleXeroPushTransaction(req, res, { readJsonBody, sendJson }) {
  const { transaction_id } = (await readJsonBody(req)) || {};
  if (!transaction_id) {
    return sendJson(res, { ok: false, error: 'No transaction specified.' });
  }
  if (!xeroAuth.isConnected()) {
    return sendJson(res, { ok: false, error: 'Xero is not connected — add it on the Settings page first.' });
  }
  try {
    const transaction = await store.getById('transactions', Number(transaction_id));
    if (!transaction) return sendJson(res, { ok: false, error: 'Transaction not found.' });
    const category = await store.getById('budget_categories', transaction.category_id);
    const result = await pushTransactionAsBill({ transaction, categoryName: category?.name });
    await store.update('transactions', transaction.id, { xero_invoice_id: result.invoiceId || 'synced' });
    sendJson(res, { ok: true, invoiceNumber: result.invoiceNumber });
  } catch (err) {
    sendJson(res, { ok: false, error: err.message || 'Could not push to Xero.' });
  }
}

module.exports = { handleXeroPushTransaction };
