// Feeds real job costs back into the Price Book once a purchase order is
// actually confirmed — the "let price data compound" idea from the custom-
// estimate brainstorm. A generic supplier catalogue is right on average
// and wrong on any specific bespoke job; this build's OWN paid prices are
// exactly right for its own work, and get more useful the more jobs run
// through the tool. Deliberately one-way and additive — it never edits or
// removes the seeded reference catalogue, only adds alongside it.

const { store } = require('../lib/store');

async function findOrCreateSupplier(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const suppliers = await store.listAll('suppliers');
  const existing = suppliers.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  return store.insert('suppliers', {
    key: null,
    name: trimmed,
    region: null,
    website: null,
    notes: 'Added automatically from a confirmed purchase order.',
    sort_order: suppliers.length,
  });
}

// Called when a PO's status is set to 'confirmed'. Idempotent at the call
// site (routes/purchase-orders.js checks purchase_orders.price_history_recorded
// first) rather than here, so this stays a plain "go do it" function.
async function recordConfirmedPoAsPriceHistory(po, lines) {
  const supplier = await findOrCreateSupplier(po.supplier);
  if (!supplier) return { recorded: 0 };

  const boqItems = await store.listAll('boq_items');
  const categories = await store.listAll('budget_categories');
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const boqById = Object.fromEntries(boqItems.map((b) => [b.id, b]));

  let recorded = 0;
  for (const line of lines) {
    if (line.unit_cost_cents == null) continue; // nothing paid recorded — nothing useful to bank
    const linkedItem = line.boq_item_id ? boqById[line.boq_item_id] : null;
    const category = linkedItem ? categoryNameById[linkedItem.category_id] || null : null;
    await store.insert('price_book_items', {
      supplier_id: supplier.id,
      sku: null,
      description: line.description,
      unit: line.unit || 'ea',
      unit_cost_cents: line.unit_cost_cents,
      category,
      notes: `From PO-${String(po.id).padStart(4, '0')}, confirmed ${new Date().toISOString().slice(0, 10)}.`,
      sort_order: 0,
      source: 'own_job',
    });
    recorded += 1;
  }
  return { recorded };
}

module.exports = { recordConfirmedPoAsPriceHistory };
