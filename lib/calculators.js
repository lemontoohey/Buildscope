// Deterministic, no-AI construction quantity estimators. These exist so the
// app is genuinely useful even if nobody ever adds an AI key: a manual
// "materials takeoff" is mostly arithmetic with sensible trade defaults, not
// something that actually needs a language model.
//
// Structure: four small pure functions do all the actual maths (easy to
// hand-check, easy to unit test), and CALCULATORS is a plain data table
// describing each calculator on the page — its fields, defaults, and which
// pure function it calls. routes/calculators.js just renders that table and
// calls compute(); adding a seventh calculator later is a data-table entry,
// not new UI code.

function roundUp(n) {
  return Math.ceil(n - 1e-9); // guard against e.g. 4.0000000001 rounding up to 5
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Area-based coverage: sheets, tiles, turf, insulation batts — "how many of
// this size covers this area, plus wastage for cuts and offcuts".
function unitsForArea({ areaM2, coveragePerUnitM2, wastagePct = 0 }) {
  if (!areaM2 || !coveragePerUnitM2) return 0;
  return roundUp((areaM2 * (1 + wastagePct / 100)) / coveragePerUnitM2);
}

// Volume: concrete, mulch, gravel, topsoil.
function volumeM3({ lengthM, widthM, depthM, wastagePct = 0 }) {
  if (!lengthM || !widthM || !depthM) return 0;
  return round2(lengthM * widthM * depthM * (1 + wastagePct / 100));
}

// Linear spacing: studs, fence posts, deck joists — uprights along a
// straight run at a fixed spacing (+1 to close both ends of the run).
function unitsForSpacing({ runLengthM, spacingMm }) {
  if (!runLengthM || !spacingMm) return 0;
  return roundUp((runLengthM * 1000) / spacingMm) + 1;
}

// Paint: area × coats, at a coverage rate per litre.
function paintLitres({ areaM2, coats = 2, coveragePerLitreM2, wastagePct = 0 }) {
  if (!areaM2 || !coveragePerLitreM2) return 0;
  return round2((areaM2 * coats * (1 + wastagePct / 100)) / coveragePerLitreM2);
}

const CALCULATORS = [
  {
    id: 'plasterboard',
    label: 'Plasterboard / cladding sheets',
    help: 'Standard sheet is 1200×2400mm (2.88m²) — change it if yours is a different size.',
    kind: 'area',
    unit: 'sheets',
    fields: [
      { name: 'area_m2', label: 'Area to cover (m²)', default: '' },
      { name: 'coverage_m2', label: 'Sheet size (m²)', default: '2.88' },
      { name: 'wastage_pct', label: 'Wastage (%)', default: '10' },
    ],
  },
  {
    id: 'roofing',
    label: 'Roof sheeting',
    help: "Coverage = one sheet's effective covered width × length once lapped — check the manufacturer's spec sheet.",
    kind: 'area',
    unit: 'sheets',
    fields: [
      { name: 'area_m2', label: 'Roof area (m²)', default: '' },
      { name: 'coverage_m2', label: 'Sheet coverage (m²)', default: '4.5' },
      { name: 'wastage_pct', label: 'Wastage (%)', default: '10' },
    ],
  },
  {
    id: 'tiles',
    label: 'Floor / wall tiles',
    help: 'Coverage is per tile — or per box, if you enter a box\'s total m² instead.',
    kind: 'area',
    unit: 'tiles',
    fields: [
      { name: 'area_m2', label: 'Area to cover (m²)', default: '' },
      { name: 'coverage_m2', label: 'Coverage per tile/box (m²)', default: '' },
      { name: 'wastage_pct', label: 'Wastage (%)', default: '10' },
    ],
  },
  {
    id: 'paint',
    label: 'Paint',
    help: 'Coverage rate is per litre, per coat — check the tin, it varies by product and surface.',
    kind: 'paint',
    unit: 'litres',
    fields: [
      { name: 'area_m2', label: 'Area to paint (m²)', default: '' },
      { name: 'coats', label: 'Number of coats', default: '2' },
      { name: 'coverage_m2', label: 'Coverage per litre (m²)', default: '14' },
      { name: 'wastage_pct', label: 'Wastage (%)', default: '5' },
    ],
  },
  {
    id: 'concrete',
    label: 'Concrete slab / footing',
    help: 'Gives m³. A 20kg premix bag is roughly 0.01m³ — check your bag, brands vary.',
    kind: 'volume',
    unit: 'm³',
    fields: [
      { name: 'length_m', label: 'Length (m)', default: '' },
      { name: 'width_m', label: 'Width (m)', default: '' },
      { name: 'depth_m', label: 'Depth (m)', default: '0.1' },
      { name: 'wastage_pct', label: 'Wastage (%)', default: '10' },
    ],
  },
  {
    id: 'framing',
    label: 'Timber studs / fence posts',
    help: 'Counts uprights along a straight run at a fixed spacing, including both end posts/studs.',
    kind: 'spacing',
    unit: 'posts/studs',
    fields: [
      { name: 'length_m', label: 'Run length (m)', default: '' },
      { name: 'spacing_mm', label: 'Spacing (mm)', default: '450' },
    ],
  },
];

function compute(calc, values) {
  const num = (v) => (v === undefined || v === '' ? 0 : parseFloat(v));
  switch (calc.kind) {
    case 'area':
      return unitsForArea({
        areaM2: num(values.area_m2),
        coveragePerUnitM2: num(values.coverage_m2),
        wastagePct: num(values.wastage_pct),
      });
    case 'paint':
      return paintLitres({
        areaM2: num(values.area_m2),
        coats: num(values.coats) || 2,
        coveragePerLitreM2: num(values.coverage_m2),
        wastagePct: num(values.wastage_pct),
      });
    case 'volume':
      return volumeM3({
        lengthM: num(values.length_m),
        widthM: num(values.width_m),
        depthM: num(values.depth_m),
        wastagePct: num(values.wastage_pct),
      });
    case 'spacing':
      return unitsForSpacing({ runLengthM: num(values.length_m), spacingMm: num(values.spacing_mm) });
    default:
      return 0;
  }
}

module.exports = { CALCULATORS, compute, unitsForArea, volumeM3, unitsForSpacing, paintLitres };
