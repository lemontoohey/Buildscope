// Single source of truth for which tables hold one account's own build data
// (must never be visible to another account) versus which tables are a
// shared, generic reference catalogue the app ships with (a starter price
// book, calculator "recipes") that every account reads the same copy of.
//
// lib/store.js consults this to decide whether to inject/check account_id
// on a given table; sqlite-db.js consults it to know which tables need an
// account_id column at all.
//
// Deliberately NOT in here: 'suppliers', 'price_book_items',
// 'formulate_recipes', 'formulate_lines' — these are the seeded reference
// price book and calculator library, shared across every account like a
// built-in catalogue, not anyone's private business data. estimate_jobs
// (and its line items/attachments) ARE in here — that's a business's own
// job-costing history, not generic reference content, so each account gets
// its own copy (seeded with demo data fresh, same as everything else).
const TENANT_TABLES = new Set([
  'budget_categories',
  'documents',
  'transactions',
  'diary_entries',
  'boq_items',
  'quotes',
  'trades',
  'schedule_stages',
  'compliance_items',
  'plan_sheets',
  'plan_measurements',
  'purchase_orders',
  'purchase_order_lines',
  'photos',
  'selections',
  'selection_options',
  'signatures',
  'estimate_jobs',
  'estimate_line_items',
  'estimate_attachments',
]);

module.exports = { TENANT_TABLES };
