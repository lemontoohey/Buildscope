// Seed catalogues for Plan Measure → Formulate → Price Book.
//
// Prices are indicative 2026 Australian retail/trade ballparks (GST-inclusive),
// not live dealer feeds. They're here so the Price Book can actually price a
// typical owner-build estimate out of the box; treat them as a starting point
// to overwrite with real quotes.

const DEFAULT_SUPPLIERS = [
  { key: 'bunnings', name: 'Bunnings Warehouse', region: 'National', notes: 'Retail DIY / trade. Good for small quantities and hardware.' },
  { key: 'mitre10', name: 'Mitre 10', region: 'National', notes: 'Independent hardware; trade desks vary by store.' },
  { key: 'reece', name: 'Reece', region: 'National', notes: 'Plumbing, bathrooms, civil.' },
  { key: 'hanson', name: 'Hanson Concrete', region: 'NSW / QLD', notes: 'Agitated concrete. Price excludes pump and waiting time.' },
  { key: 'lysaght', name: 'Lysaght (BlueScope)', region: 'National', notes: 'Colorbond roofing, rainwater, light steel.' },
  { key: 'csr', name: 'CSR Gyprock', region: 'National', notes: 'Plasterboard, compounds, cornice.' },
  { key: 'hardie', name: 'James Hardie', region: 'National', notes: 'Fibre cement cladding and lining.' },
  { key: 'itl', name: 'Independent Timber Supplies', region: 'NSW North Coast', notes: 'Framing, treated pine, structural timber. Placeholder for a local yard.' },
];

// unit_cost is dollars (converted to cents at seed time).
const DEFAULT_PRICE_BOOK = [
  // Concrete
  { supplier: 'hanson', sku: 'N32', description: 'Concrete N32 / 32 MPa', unit: 'm3', unit_cost: 335, category: 'Footings & slab' },
  { supplier: 'hanson', sku: 'N25', description: 'Concrete N25 / 25 MPa', unit: 'm3', unit_cost: 305, category: 'Footings & slab' },
  { supplier: 'hanson', sku: 'N20', description: 'Concrete N20 / 20 MPa', unit: 'm3', unit_cost: 285, category: 'Footings & slab' },
  { supplier: 'bunnings', sku: 'BC-20KG', description: 'Premix concrete bag 20kg', unit: 'ea', unit_cost: 8.5, category: 'Footings & slab' },
  { supplier: 'mitre10', sku: 'M10-20KG', description: 'Premix concrete bag 20kg', unit: 'ea', unit_cost: 8.2, category: 'Footings & slab' },

  // Steel / mesh
  { supplier: 'bunnings', sku: 'SL82', description: 'SL82 trench mesh 6m', unit: 'ea', unit_cost: 42, category: 'Footings & slab' },
  { supplier: 'mitre10', sku: 'SL82', description: 'SL82 trench mesh 6m', unit: 'ea', unit_cost: 39.5, category: 'Footings & slab' },
  { supplier: 'bunnings', sku: 'N12', description: 'N12 reinforcing bar', unit: 'lm', unit_cost: 4.8, category: 'Footings & slab' },
  { supplier: 'mitre10', sku: 'N12', description: 'N12 reinforcing bar', unit: 'lm', unit_cost: 4.5, category: 'Footings & slab' },
  { supplier: 'bunnings', sku: 'SL72', description: 'SL72 slab mesh 6×2.4m', unit: 'ea', unit_cost: 89, category: 'Footings & slab' },
  { supplier: 'mitre10', sku: 'SL72', description: 'SL72 slab mesh 6×2.4m', unit: 'ea', unit_cost: 84, category: 'Footings & slab' },

  // Timber
  { supplier: 'itl', sku: '90x45-MGP10', description: '90×45 MGP10 pine stud', unit: 'lm', unit_cost: 5.4, category: 'Structural frame (steel & timber)' },
  { supplier: 'bunnings', sku: '90x45-MGP10', description: '90×45 MGP10 pine stud', unit: 'lm', unit_cost: 6.9, category: 'Structural frame (steel & timber)' },
  { supplier: 'mitre10', sku: '90x45-MGP10', description: '90×45 MGP10 pine stud', unit: 'lm', unit_cost: 6.2, category: 'Structural frame (steel & timber)' },
  { supplier: 'itl', sku: '90x45-H2', description: '90×45 H2 treated pine', unit: 'lm', unit_cost: 6.1, category: 'Structural frame (steel & timber)' },
  { supplier: 'bunnings', sku: '90x45-H2', description: '90×45 H2 treated pine', unit: 'lm', unit_cost: 7.8, category: 'Structural frame (steel & timber)' },
  { supplier: 'itl', sku: '240x45-LVL', description: '240×45 LVL beam', unit: 'lm', unit_cost: 28, category: 'Structural frame (steel & timber)' },
  { supplier: 'bunnings', sku: '240x45-LVL', description: '240×45 LVL beam', unit: 'lm', unit_cost: 34, category: 'Structural frame (steel & timber)' },

  // Roofing
  { supplier: 'lysaght', sku: 'CUSTOM-ORB', description: 'Colorbond Custom Orb roof sheet', unit: 'm2', unit_cost: 38, category: 'Roofing (Colorbond) & solar' },
  { supplier: 'bunnings', sku: 'CUSTOM-ORB', description: 'Colorbond Custom Orb roof sheet', unit: 'm2', unit_cost: 46, category: 'Roofing (Colorbond) & solar' },
  { supplier: 'lysaght', sku: 'GUTTER', description: 'Colorbond quad gutter', unit: 'lm', unit_cost: 18, category: 'Roofing (Colorbond) & solar' },
  { supplier: 'bunnings', sku: 'GUTTER', description: 'Colorbond quad gutter', unit: 'lm', unit_cost: 22, category: 'Roofing (Colorbond) & solar' },
  { supplier: 'lysaght', sku: 'DOWNPIPE', description: 'Colorbond downpipe 100mm', unit: 'lm', unit_cost: 14, category: 'Roofing (Colorbond) & solar' },

  // Cladding
  { supplier: 'hardie', sku: 'AXON', description: 'Scyon Axon cladding 4200×1200', unit: 'm2', unit_cost: 52, category: 'External cladding & stonework' },
  { supplier: 'bunnings', sku: 'AXON', description: 'Scyon Axon cladding 4200×1200', unit: 'm2', unit_cost: 61, category: 'External cladding & stonework' },
  { supplier: 'hardie', sku: 'LINEA', description: 'Linea weatherboard', unit: 'm2', unit_cost: 48, category: 'External cladding & stonework' },

  // Plasterboard
  { supplier: 'csr', sku: 'GP10', description: 'Gyprock 10mm plasterboard 1200×2400', unit: 'ea', unit_cost: 17.5, category: 'Plasterboard & internal linings' },
  { supplier: 'bunnings', sku: 'GP10', description: 'Gyprock 10mm plasterboard 1200×2400', unit: 'ea', unit_cost: 22, category: 'Plasterboard & internal linings' },
  { supplier: 'mitre10', sku: 'GP10', description: 'Gyprock 10mm plasterboard 1200×2400', unit: 'ea', unit_cost: 19.8, category: 'Plasterboard & internal linings' },
  { supplier: 'csr', sku: 'GP13', description: 'Gyprock 13mm plasterboard 1200×2400', unit: 'ea', unit_cost: 21, category: 'Plasterboard & internal linings' },
  { supplier: 'bunnings', sku: 'GP13', description: 'Gyprock 13mm plasterboard 1200×2400', unit: 'ea', unit_cost: 26, category: 'Plasterboard & internal linings' },

  // Insulation
  { supplier: 'bunnings', sku: 'R2.5', description: 'Wall insulation batts R2.5', unit: 'm2', unit_cost: 9.4, category: 'Insulation' },
  { supplier: 'mitre10', sku: 'R2.5', description: 'Wall insulation batts R2.5', unit: 'm2', unit_cost: 8.8, category: 'Insulation' },
  { supplier: 'bunnings', sku: 'R3.5', description: 'Ceiling insulation batts R3.5', unit: 'm2', unit_cost: 11.2, category: 'Insulation' },
  { supplier: 'mitre10', sku: 'R3.5', description: 'Ceiling insulation batts R3.5', unit: 'm2', unit_cost: 10.5, category: 'Insulation' },

  // Paint
  { supplier: 'bunnings', sku: 'WW-10L', description: 'Interior low-sheen paint 10L', unit: 'ea', unit_cost: 98, category: 'Painting' },
  { supplier: 'mitre10', sku: 'WW-10L', description: 'Interior low-sheen paint 10L', unit: 'ea', unit_cost: 92, category: 'Painting' },

  // Tiling / flooring
  { supplier: 'bunnings', sku: 'TILE-STD', description: 'Ceramic floor tile', unit: 'm2', unit_cost: 32, category: 'Flooring & tiling' },
  { supplier: 'mitre10', sku: 'TILE-STD', description: 'Ceramic floor tile', unit: 'm2', unit_cost: 29, category: 'Flooring & tiling' },

  // Plumbing
  { supplier: 'reece', sku: 'PVC100', description: 'PVC DWV pipe 100mm', unit: 'lm', unit_cost: 18.5, category: 'Plumbing rough-in & fixout' },
  { supplier: 'bunnings', sku: 'PVC100', description: 'PVC DWV pipe 100mm', unit: 'lm', unit_cost: 22, category: 'Plumbing rough-in & fixout' },
  { supplier: 'reece', sku: 'PEX20', description: 'PEX-a pipe 20mm', unit: 'lm', unit_cost: 3.2, category: 'Plumbing rough-in & fixout' },
  { supplier: 'bunnings', sku: 'PEX20', description: 'PEX-a pipe 20mm', unit: 'lm', unit_cost: 4.1, category: 'Plumbing rough-in & fixout' },

  // Earthworks
  { supplier: 'bunnings', sku: 'ROADBASE', description: 'Road base / crushed rock', unit: 'm3', unit_cost: 85, category: 'Site establishment & earthworks' },
  { supplier: 'mitre10', sku: 'ROADBASE', description: 'Road base / crushed rock', unit: 'm3', unit_cost: 79, category: 'Driveway & external works' },
];

const DEFAULT_RECIPES = [
  {
    slug: 'strip-footing',
    name: 'Strip footing (beam × dig × footing)',
    description:
      'The classic AB formula: beam length × dig width × footing depth = concrete volume. Add mesh, bar, formwork and excavation from the same three numbers.',
    output_unit: 'm',
    category: 'Footings & slab',
    variables: [
      { name: 'beam', label: 'Beam / run length', unit: 'm', default: '' },
      { name: 'dig', label: 'Dig / trench width', unit: 'm', default: '0.45' },
      { name: 'footing', label: 'Footing depth', unit: 'm', default: '0.40' },
    ],
    lines: [
      { description: 'AB — concrete N32', unit: 'm3', expression: 'beam * dig * footing', wastage_pct: 10, sku_hint: 'N32' },
      { description: 'Excavation (same volume as AB)', unit: 'm3', expression: 'beam * dig * footing', wastage_pct: 5, sku_hint: '' },
      { description: 'SL82 trench mesh', unit: 'ea', expression: 'beam / 6', wastage_pct: 5, sku_hint: 'SL82' },
      { description: 'N12 bar (2 bars continuous)', unit: 'lm', expression: 'beam * 2', wastage_pct: 10, sku_hint: 'N12' },
      { description: 'Formwork to both faces', unit: 'm2', expression: 'beam * footing * 2', wastage_pct: 10, sku_hint: '' },
    ],
  },
  {
    slug: 'pad-footing',
    name: 'Pad footing',
    description: 'Square or rectangular pad: length × width × depth, plus mesh and excavation.',
    output_unit: 'ea',
    category: 'Footings & slab',
    variables: [
      { name: 'length', label: 'Pad length', unit: 'm', default: '1.2' },
      { name: 'width', label: 'Pad width', unit: 'm', default: '1.2' },
      { name: 'depth', label: 'Pad depth', unit: 'm', default: '0.4' },
      { name: 'count', label: 'Number of pads', unit: 'ea', default: '1' },
    ],
    lines: [
      { description: 'Concrete N32 pads', unit: 'm3', expression: 'length * width * depth * count', wastage_pct: 10, sku_hint: 'N32' },
      { description: 'Excavation', unit: 'm3', expression: 'length * width * depth * count', wastage_pct: 10, sku_hint: '' },
      { description: 'SL72 mesh pieces', unit: 'ea', expression: 'count', wastage_pct: 0, sku_hint: 'SL72' },
    ],
  },
  {
    slug: 'slab-on-ground',
    name: 'Slab on ground',
    description: 'Floor area × thickness for concrete, plus mesh coverage and edge formwork.',
    output_unit: 'm2',
    category: 'Footings & slab',
    variables: [
      { name: 'area', label: 'Slab area', unit: 'm2', default: '' },
      { name: 'thickness', label: 'Slab thickness', unit: 'm', default: '0.1' },
      { name: 'perimeter', label: 'Perimeter (formwork)', unit: 'm', default: '' },
    ],
    lines: [
      { description: 'Concrete N25 slab', unit: 'm3', expression: 'area * thickness', wastage_pct: 10, sku_hint: 'N25' },
      { description: 'SL72 slab mesh', unit: 'ea', expression: 'area / 14.4', wastage_pct: 10, sku_hint: 'SL72' },
      { description: 'Edge formwork', unit: 'lm', expression: 'perimeter', wastage_pct: 5, sku_hint: '' },
    ],
  },
  {
    slug: 'stud-wall',
    name: 'Timber stud wall',
    description: 'One wall length becomes plates, studs at a set spacing, and lining sheets.',
    output_unit: 'm',
    category: 'Structural frame (steel & timber)',
    variables: [
      { name: 'length', label: 'Wall length', unit: 'm', default: '' },
      { name: 'height', label: 'Wall height', unit: 'm', default: '2.7' },
      { name: 'spacing', label: 'Stud spacing', unit: 'm', default: '0.45' },
    ],
    lines: [
      { description: '90×45 plates (top + bottom)', unit: 'lm', expression: 'length * 2', wastage_pct: 10, sku_hint: '90x45-MGP10' },
      { description: '90×45 studs', unit: 'ea', expression: '(length / spacing) + 1', wastage_pct: 5, sku_hint: '90x45-MGP10' },
      { description: 'Wall insulation R2.5', unit: 'm2', expression: 'length * height', wastage_pct: 10, sku_hint: 'R2.5' },
      { description: '10mm plasterboard sheets', unit: 'ea', expression: '(length * height) / 2.88', wastage_pct: 10, sku_hint: 'GP10' },
    ],
  },
  {
    slug: 'colorbond-roof',
    name: 'Colorbond roof',
    description: 'Roof area to sheeting, plus gutter from eaves length.',
    output_unit: 'm2',
    category: 'Roofing (Colorbond) & solar',
    variables: [
      { name: 'area', label: 'Roof area (on slope)', unit: 'm2', default: '' },
      { name: 'eaves', label: 'Eaves / gutter length', unit: 'm', default: '' },
      { name: 'downpipes', label: 'Downpipe runs', unit: 'm', default: '12' },
    ],
    lines: [
      { description: 'Colorbond Custom Orb', unit: 'm2', expression: 'area', wastage_pct: 10, sku_hint: 'CUSTOM-ORB' },
      { description: 'Quad gutter', unit: 'lm', expression: 'eaves', wastage_pct: 5, sku_hint: 'GUTTER' },
      { description: 'Downpipe 100mm', unit: 'lm', expression: 'downpipes', wastage_pct: 5, sku_hint: 'DOWNPIPE' },
    ],
  },
  {
    slug: 'gyprock-lining',
    name: 'Gyprock lining',
    description: 'Wall/ceiling area converted to 1200×2400 sheets (2.88 m² each).',
    output_unit: 'm2',
    category: 'Plasterboard & internal linings',
    variables: [
      { name: 'area', label: 'Area to line', unit: 'm2', default: '' },
    ],
    lines: [
      { description: '10mm plasterboard sheets', unit: 'ea', expression: 'area / 2.88', wastage_pct: 10, sku_hint: 'GP10' },
    ],
  },
];

function dollarsToCents(n) {
  return Math.round(Number(n) * 100);
}

function buildEstimatingTables({ startIds = {} } = {}) {
  let supplierId = startIds.suppliers || 1;
  let priceId = startIds.price_book_items || 1;
  let recipeId = startIds.formulate_recipes || 1;
  let lineId = startIds.formulate_lines || 1;

  const suppliers = DEFAULT_SUPPLIERS.map((s, i) => ({
    id: supplierId++,
    key: s.key,
    name: s.name,
    region: s.region,
    website: s.website || null,
    notes: s.notes,
    sort_order: i,
  }));
  const supplierIdByKey = Object.fromEntries(suppliers.map((s) => [s.key, s.id]));

  const price_book_items = DEFAULT_PRICE_BOOK.map((p, i) => ({
    id: priceId++,
    supplier_id: supplierIdByKey[p.supplier],
    sku: p.sku,
    description: p.description,
    unit: p.unit,
    unit_cost_cents: dollarsToCents(p.unit_cost),
    category: p.category,
    notes: 'Indicative GST-inc ballpark — replace with a real quote.',
    sort_order: i,
  }));

  const formulate_recipes = [];
  const formulate_lines = [];
  DEFAULT_RECIPES.forEach((r, i) => {
    const id = recipeId++;
    formulate_recipes.push({
      id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      output_unit: r.output_unit,
      category: r.category,
      variables_json: JSON.stringify(r.variables),
      created_at: 'seed',
      sort_order: i,
    });
    r.lines.forEach((line, li) => {
      formulate_lines.push({
        id: lineId++,
        recipe_id: id,
        description: line.description,
        unit: line.unit,
        expression: line.expression,
        wastage_pct: line.wastage_pct || 0,
        sku_hint: line.sku_hint || '',
        sort_order: li,
      });
    });
  });

  return {
    suppliers,
    price_book_items,
    formulate_recipes,
    formulate_lines,
    nextIds: {
      suppliers: supplierId,
      price_book_items: priceId,
      formulate_recipes: recipeId,
      formulate_lines: lineId,
    },
  };
}

module.exports = {
  DEFAULT_SUPPLIERS,
  DEFAULT_PRICE_BOOK,
  DEFAULT_RECIPES,
  buildEstimatingTables,
};
