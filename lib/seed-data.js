// Shared seed data for a brand-new data store — the same starting point
// regardless of which backend someone picks. sqlite-db.js and
// supabase/schema.sql each carry their own copy of this (needed at their
// respective creation time, before this file existed), kept identical by
// hand; the Google Drive backend (lib/store.js) uses this copy directly
// since it builds its "database" as a plain JS object, not SQL.

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

const DEFAULT_STAGES = [
  'Site establishment',
  'Earthworks & retaining',
  'Footings',
  'Slab',
  'Structural frame',
  'Roof',
  'Lock-up (windows & doors)',
  'Rough-in (plumbing, electrical, AWTS)',
  'Insulation & plasterboard',
  'Fix-out (carpentry, joinery)',
  'Flooring & tiling',
  'Painting',
  'External works (driveway, pool, landscaping)',
  'Final inspections & occupation certificate',
];

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

// Builds a brand-new, empty-except-for-seed-data store state — the shape
// the Google Drive backend keeps as one JSON blob. Mirrors what a fresh
// sqlite-db.js / supabase/schema.sql gives you.
function buildInitialState() {
  const tables = {
    budget_categories: DEFAULT_CATEGORIES.map((name, i) => ({
      id: i + 1,
      name,
      budgeted_cents: 0,
      sort_order: i,
    })),
    documents: [],
    transactions: [],
    diary_entries: [],
    boq_items: [],
    quotes: [],
    trades: [],
    schedule_stages: DEFAULT_STAGES.map((name, i) => ({
      id: i + 1,
      name,
      sort_order: i,
      planned_start: null,
      planned_end: null,
      actual_start: null,
      actual_end: null,
      status: 'not_started',
      notes: null,
    })),
    compliance_items: DEFAULT_COMPLIANCE.map(([regime, item], i) => ({
      id: i + 1,
      regime,
      item,
      status: 'pending',
      due_date: null,
      document_id: null,
      notes: null,
      sort_order: i,
    })),
    settings: [],
    plan_sheets: [],
    plan_measurements: [],
    suppliers: [],
    price_book_items: [],
    formulate_recipes: [],
    formulate_lines: [],
  };

  const { buildEstimatingTables } = require('./estimating-seed');
  const estimating = buildEstimatingTables();
  tables.suppliers = estimating.suppliers;
  tables.price_book_items = estimating.price_book_items;
  tables.formulate_recipes = estimating.formulate_recipes;
  tables.formulate_lines = estimating.formulate_lines;

  const nextIds = {
    budget_categories: DEFAULT_CATEGORIES.length + 1,
    documents: 1,
    transactions: 1,
    diary_entries: 1,
    boq_items: 1,
    quotes: 1,
    trades: 1,
    schedule_stages: DEFAULT_STAGES.length + 1,
    compliance_items: DEFAULT_COMPLIANCE.length + 1,
    settings: 1,
    plan_sheets: 1,
    plan_measurements: 1,
    suppliers: estimating.nextIds.suppliers,
    price_book_items: estimating.nextIds.price_book_items,
    formulate_recipes: estimating.nextIds.formulate_recipes,
    formulate_lines: estimating.nextIds.formulate_lines,
  };

  return { tables, nextIds };
}

function ensureEstimatingState(state) {
  if (!state.tables) state.tables = {};
  if (!state.nextIds) state.nextIds = {};
  const needed = [
    'plan_sheets',
    'plan_measurements',
    'suppliers',
    'price_book_items',
    'formulate_recipes',
    'formulate_lines',
  ];
  for (const table of needed) {
    if (!state.tables[table]) state.tables[table] = [];
    if (state.nextIds[table] === undefined) state.nextIds[table] = 1;
  }
  if (state.tables.suppliers.length === 0) {
    const { buildEstimatingTables } = require('./estimating-seed');
    const estimating = buildEstimatingTables({
      startIds: {
        suppliers: state.nextIds.suppliers || 1,
        price_book_items: state.nextIds.price_book_items || 1,
        formulate_recipes: state.nextIds.formulate_recipes || 1,
        formulate_lines: state.nextIds.formulate_lines || 1,
      },
    });
    state.tables.suppliers = estimating.suppliers;
    state.tables.price_book_items = estimating.price_book_items;
    state.tables.formulate_recipes = estimating.formulate_recipes;
    state.tables.formulate_lines = estimating.formulate_lines;
    Object.assign(state.nextIds, estimating.nextIds);
  }
  return state;
}

module.exports = {
  DEFAULT_CATEGORIES,
  DEFAULT_STAGES,
  DEFAULT_COMPLIANCE,
  buildInitialState,
  ensureEstimatingState,
};
