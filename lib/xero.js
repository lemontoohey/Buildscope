// Xero accounting sync — the actual sync half, on top of lib/xero-auth.js.
// Scaffolding for now: one direction (push a transaction/receipt into Xero
// as a bill to pay), matching what the spec's "Accountant handoff" section
// asks for but as a live push instead of a CSV export. Buildxact's own
// Xero integration works the same way — job costs flow out to Xero, Xero
// stays the source of truth for GST/tax treatment and the chart of
// accounts, which is deliberately NOT something this app tries to get
// right on its own (see LineAmountTypes below).
//
// Needs a real Xero Developer app + a connected organisation to actually
// run — see lib/xero-auth.js and the README's Xero setup section. Safe to
// leave untouched: nothing else in the app calls this unless someone
// clicks "Push to Xero."

const { getAccessToken } = require('./xero-auth');

const INVOICES_ENDPOINT = 'https://api.xero.com/api.xro/2.0/Invoices';

// Xero requires an AccountCode on each line item, and that code has to
// exist in that organisation's own chart of accounts — something this app
// has no visibility into. Rather than guess (and risk silently mis-coding
// a real set of books), this is a single override any install can set once
// it knows its own chart of accounts; '429' is Xero's own default-chart
// "General Expenses" code, used only as a last resort.
function getDefaultAccountCode() {
  return process.env.XERO_DEFAULT_ACCOUNT_CODE || '429';
}

function centsToAmount(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

// Pushes one transaction as a Xero Bill (an ACCPAY invoice — money owed to
// a supplier). LineAmountTypes is "NoTax" deliberately: this app tracks a
// GST component per transaction for its own reporting, but guessing the
// right Xero tax *type* (GST on Income, GST Free, etc.) per line without
// knowing this organisation's tax settings is exactly the kind of "looks
// precise, might be wrong" mistake the AI estimate features are built to
// avoid — so the bill lands in Xero for the accountant to code properly,
// same spirit as the existing CSV "Accountant handoff" export.
async function pushTransactionAsBill({ transaction, categoryName }) {
  const { accessToken, tenantId } = await getAccessToken();

  const supplierName = (transaction.supplier || categoryName || 'Unknown supplier').trim();
  const payload = {
    Type: 'ACCPAY',
    Contact: { Name: supplierName },
    Date: (transaction.txn_date || '').slice(0, 10) || undefined,
    LineAmountTypes: 'NoTax',
    Reference: `Build Tracker — ${categoryName || 'Uncategorised'}`,
    LineItems: [
      {
        Description: transaction.description || categoryName || 'Build expense',
        Quantity: 1,
        UnitAmount: centsToAmount(transaction.amount_cents),
        AccountCode: getDefaultAccountCode(),
      },
    ],
  };

  const response = await fetch(INVOICES_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ Invoices: [payload] }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const validationMessage = data?.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join('; ');
    throw new Error(validationMessage || data?.Message || `Xero rejected the bill (${response.status}).`);
  }

  const invoice = data?.Invoices?.[0];
  return { ok: true, invoiceId: invoice?.InvoiceID, invoiceNumber: invoice?.InvoiceNumber };
}

module.exports = { pushTransactionAsBill };
