// The local SQLite backend — built on node:sqlite (built into Node 22.5+),
// so there's nothing to `npm install`. This is the default data backend;
// lib/store.js switches to the Supabase backend instead when SUPABASE_URL
// and SUPABASE_KEY are set in .env. Both backends implement the same
// interface, so this file is only ever required from lib/store.js.

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    budgeted_cents INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    file_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    txn_date TEXT NOT NULL,
    supplier TEXT,
    description TEXT,
    amount_cents INTEGER NOT NULL,
    gst_cents INTEGER NOT NULL DEFAULT 0,
    document_id TEXT REFERENCES documents(id),
    note TEXT,
    ai_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    weather TEXT,
    trades_present TEXT,
    work_done TEXT,
    issues TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boq_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    description TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    unit_cost_cents INTEGER,
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'not_ordered',
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
    supplier TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    quote_date TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trade_type TEXT,
    phone TEXT,
    email TEXT,
    licence_number TEXT,
    insurance_expiry TEXT,
    scope_notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,
    status TEXT NOT NULL DEFAULT 'not_started',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS compliance_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regime TEXT NOT NULL,
    item TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    due_date TEXT,
    document_id TEXT REFERENCES documents(id),
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS plan_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    scale_label TEXT,
    pixels_per_metre REAL,
    rotation INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plan_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    color TEXT,
    depth_m REAL,
    points_json TEXT NOT NULL,
    category_id INTEGER,
    boq_item_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    name TEXT NOT NULL,
    region TEXT,
    website TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS price_book_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    sku TEXT,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    category TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS formulate_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    name TEXT NOT NULL,
    description TEXT,
    output_unit TEXT,
    category TEXT,
    variables_json TEXT,
    created_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    signature_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    boq_item_id INTEGER REFERENCES boq_items(id),
    description TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    unit_cost_cents INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_path TEXT NOT NULL,
    caption TEXT,
    taken_at TEXT NOT NULL,
    linked_type TEXT,
    linked_id TEXT,
    is_defect INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS formulate_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    expression TEXT NOT NULL,
    wastage_pct REAL NOT NULL DEFAULT 0,
    sku_hint TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    description TEXT,
    boq_item_id INTEGER REFERENCES boq_items(id),
    status TEXT NOT NULL DEFAULT 'pending',
    due_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS selection_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    selection_id INTEGER NOT NULL REFERENCES selections(id),
    label TEXT NOT NULL,
    supplier TEXT,
    unit_cost_cents INTEGER,
    notes TEXT,
    is_chosen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signer_name TEXT NOT NULL,
    image_data TEXT NOT NULL,
    signed_at TEXT NOT NULL,
    linked_type TEXT,
    linked_id INTEGER,
    created_at TEXT NOT NULL
  );
`);

// --- Lightweight column migrations -----------------------------------
// CREATE TABLE IF NOT EXISTS only helps brand-new databases; an already-
// existing data/app.db (anyone who ran this before today) needs its
// diary_entries table widened in place for the AI diary assistant.
// Safe to run on every boot — it's a no-op once the columns exist.
function ensureColumn(table, column, ddlType) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
  }
}

ensureColumn('diary_entries', 'raw_note', 'TEXT');
ensureColumn('diary_entries', 'ai_generated', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('diary_entries', 'delay_flagged', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('diary_entries', 'schedule_note', 'TEXT');

// Xero accounting sync (scaffolding) — tracks which transactions have
// already been pushed to Xero as a bill, so the button on the dashboard
// can show "Synced" instead of letting the same receipt go over twice.
ensureColumn('transactions', 'xero_invoice_id', 'TEXT');

// Custom-estimate improvements: once a purchase order is marked
// "confirmed" (i.e. actually agreed/paid, not just drafted), its real
// line prices get folded into the Price Book as this build's own price
// history — so the NEXT estimate on a similar item is grounded in what
// this build actually paid, not a generic seed rate. `source` marks
// which price_book_items rows came from a real job vs the seeded
// reference catalogue; `price_history_recorded` stops a PO's lines from
// being recorded twice if its status flips back and forth.
ensureColumn('price_book_items', 'source', 'TEXT');
ensureColumn('purchase_orders', 'price_history_recorded', 'INTEGER NOT NULL DEFAULT 0');

// Seed the Phase 1 budget categories — a reasonable starting point for an
// Australian owner-build, only if the table is empty, so re-running the
// server never duplicates them or clobbers amounts someone has already
// entered. Add, rename or delete categories freely once you're set up.
const DEFAULT_CATEGORIES = [
  'Site establishment & earthworks',
  'Retaining & cut-fill',
  'Septic / on-site wastewater system',
  'Water tanks (drinking, BASIX, bushfire)',
  'Footings & slab',
  'Structural frame (steel & timber)',
  'Roofing (Colorbond) & solar',
  'External cladding & stonework',
  'Windows & doors',
  'Waterproofing',
  'Plumbing rough-in & fixout',
  'Electrical rough-in & fixout',
  'Insulation',
  'Plasterboard & internal linings',
  'Painting',
  'Kitchen & joinery',
  'Flooring & tiling',
  'Bathroom fixtures',
  'Pool & fencing',
  'Driveway & external works',
  'Landscaping',
  'Fencing (property & pool safety)',
  'Council/certifier fees',
  'Contingency',
];

// Standard owner-build stage sequence (spec §3.4).
const DEFAULT_STAGES = [
  'Site establishment',
  'Earthworks & retaining',
  'Footings',
  'Slab',
  'Structural frame',
  'Roof',
  'Lock-up (windows & doors)',
  'Rough-in (plumbing, electrical, wastewater)',
  'Insulation & plasterboard',
  'Fix-out (carpentry, joinery)',
  'Flooring & tiling',
  'Painting',
  'External works (driveway, pool, landscaping)',
  'Final inspections & occupation certificate',
];

// Compliance checklist seeded with the regimes a typical NSW owner-build
// runs into — DA/council, BASIX, bushfire (BAL), pool, and on-site
// wastewater — as a starting checklist. Add or delete items freely; this
// isn't a substitute for your own certifier's actual conditions.
const DEFAULT_COMPLIANCE = [
  ['DA / Council', 'Footings inspection booked & passed'],
  ['DA / Council', 'Slab inspection booked & passed'],
  ['DA / Council', 'Frame inspection booked & passed'],
  ['DA / Council', 'Waterproofing inspection booked & passed'],
  ['DA / Council', 'Final inspection booked & passed'],
  ['DA / Council', 'As-built checked against DA/CDC-approved plans (note any variations)'],

  ['BASIX', 'Showerheads — minimum star rating per your BASIX certificate'],
  ['BASIX', 'Toilets — minimum star rating per your BASIX certificate'],
  ['BASIX', 'Dishwasher — minimum star rating per your BASIX certificate'],
  ['BASIX', 'Kitchen & bathroom taps — minimum star rating per your BASIX certificate'],
  ['BASIX', 'Rainwater tank installed & plumbed as specified on your BASIX certificate'],
  ['BASIX', 'Stormwater detention/reuse installed as specified'],
  ['BASIX', 'Ceiling insulation installed to the specified R-value'],
  ['BASIX', 'Wall insulation installed to the specified R-value'],
  ['BASIX', 'Hot water system meets the specified star rating'],
  ['BASIX', 'Exhaust fans to bathrooms/laundry/kitchen installed'],
  ['BASIX', 'LED lighting throughout'],
  ['BASIX', 'External shading (blinds/eaves) installed as specified'],
  ['BASIX', 'Clothes line installed'],

  ['Bushfire (BAL)', 'Assessed BAL rating confirmed with certifier'],
  ['Bushfire (BAL)', 'Bushfire water supply installed & accessible to fire services'],
  ['Bushfire (BAL)', 'Construction materials meet BAL rating (windows, decking, external walls)'],
  ['Bushfire (BAL)', 'Asset Protection Zone (APZ) landscaping maintained'],

  ['Pool', 'Pool safety fencing to AS1926.1 installed'],
  ['Pool', 'Pool safety certificate obtained'],
  ['Pool', 'Pool registered with council/state register'],

  ['Septic / wastewater', 'On-site wastewater treatment system installed & commissioned'],
  ['Septic / wastewater', 'Effluent/irrigation area installed per design'],
  ['Septic / wastewater', 'Council on-site wastewater (health) approval obtained'],
  ['Septic / wastewater', 'Service contract set up for ongoing maintenance'],
];

function seed() {
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM budget_categories').get();
  if (catCount.n === 0) {
    const insertCat = db.prepare(
      'INSERT INTO budget_categories (name, budgeted_cents, sort_order) VALUES (?, 0, ?)'
    );
    DEFAULT_CATEGORIES.forEach((name, i) => insertCat.run(name, i));
  }

  const stageCount = db.prepare('SELECT COUNT(*) AS n FROM schedule_stages').get();
  if (stageCount.n === 0) {
    const insertStage = db.prepare(
      'INSERT INTO schedule_stages (name, sort_order, status) VALUES (?, ?, \'not_started\')'
    );
    DEFAULT_STAGES.forEach((name, i) => insertStage.run(name, i));
  }

  const complianceCount = db.prepare('SELECT COUNT(*) AS n FROM compliance_items').get();
  if (complianceCount.n === 0) {
    const insertItem = db.prepare(
      "INSERT INTO compliance_items (regime, item, status, sort_order) VALUES (?, ?, 'pending', ?)"
    );
    DEFAULT_COMPLIANCE.forEach(([regime, item], i) => insertItem.run(regime, item, i));
  }

  const supplierCount = db.prepare('SELECT COUNT(*) AS n FROM suppliers').get();
  if (supplierCount.n === 0) {
    const { buildEstimatingTables } = require('./lib/estimating-seed');
    const seeded = buildEstimatingTables();
    const insertSupplier = db.prepare(
      'INSERT INTO suppliers (id, key, name, region, website, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const s of seeded.suppliers) {
      insertSupplier.run(s.id, s.key, s.name, s.region, s.website, s.notes, s.sort_order);
    }
    const insertPrice = db.prepare(
      'INSERT INTO price_book_items (id, supplier_id, sku, description, unit, unit_cost_cents, category, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const p of seeded.price_book_items) {
      insertPrice.run(
        p.id,
        p.supplier_id,
        p.sku,
        p.description,
        p.unit,
        p.unit_cost_cents,
        p.category,
        p.notes,
        p.sort_order
      );
    }
    const insertRecipe = db.prepare(
      'INSERT INTO formulate_recipes (id, slug, name, description, output_unit, category, variables_json, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const r of seeded.formulate_recipes) {
      insertRecipe.run(
        r.id,
        r.slug,
        r.name,
        r.description,
        r.output_unit,
        r.category,
        r.variables_json,
        r.created_at,
        r.sort_order
      );
    }
    const insertLine = db.prepare(
      'INSERT INTO formulate_lines (id, recipe_id, description, unit, expression, wastage_pct, sku_hint, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const l of seeded.formulate_lines) {
      insertLine.run(
        l.id,
        l.recipe_id,
        l.description,
        l.unit,
        l.expression,
        l.wastage_pct,
        l.sku_hint,
        l.sort_order
      );
    }
  }
}

seed();

module.exports = { db };
