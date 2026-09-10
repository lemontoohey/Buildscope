// Demo reference jobs for the Job Estimator.
//
// IMPORTANT: every dollar figure here is an invented, illustrative number
// for demonstrating how the matching engine works end to end — NOT a
// verified real-world construction cost. Nobody should quote off these.
// Replace or delete every one of them as James's real completed jobs go
// in; the engine gets more useful (and more accurate) the moment real
// data replaces this placeholder set, exactly the same way
// lib/estimating-seed.js's price book is a starting point to overwrite
// with real quotes.
//
// Category cost splits use three rough "mix" templates (a plain % of the
// job total per budget category) rather than one-off numbers per job, so
// this file stays short — real jobs won't share a template, the estimator
// doesn't care, and this is demo data either way.

const STANDARD_MIX = {
  'Site establishment & earthworks': 6,
  'Footings & slab': 8,
  'Structural frame (steel & timber)': 15,
  'Roofing (Colorbond) & solar': 6,
  'External cladding & stonework': 9,
  'Windows & doors': 7,
  Waterproofing: 2,
  'Plumbing rough-in & fixout': 5,
  'Electrical rough-in & fixout': 5,
  Insulation: 3,
  'Plasterboard & internal linings': 5,
  Painting: 3,
  'Kitchen & joinery': 8,
  'Flooring & tiling': 5,
  'Bathroom fixtures': 4,
  'Driveway & external works': 3,
  'Council/certifier fees': 2,
  Contingency: 4,
};

// Masonry / rammed-earth / brick-veneer builds: more of the budget sits in
// the walls themselves (External cladding & stonework), less in a light
// structural frame.
const MASONRY_MIX = {
  ...STANDARD_MIX,
  'Structural frame (steel & timber)': 9,
  'External cladding & stonework': 15,
};

// Architectural glazing-heavy builds: big glass runs and a heavier steel
// structure to carry them, less spent proportionally on internal fit-out.
const GLAZING_MIX = {
  ...STANDARD_MIX,
  'Structural frame (steel & timber)': 18,
  'Windows & doors': 13,
  'Kitchen & joinery': 6,
  'Flooring & tiling': 4,
};

function dollarsToCents(n) {
  return Math.round(Number(n) * 100);
}

function splitByMix(totalDollars, mix) {
  const lines = [];
  let allocated = 0;
  const entries = Object.entries(mix);
  entries.forEach(([category_name, pct], i) => {
    // Last line absorbs the rounding remainder so the split always sums
    // exactly to the job total instead of drifting a few cents off.
    const cents =
      i === entries.length - 1
        ? dollarsToCents(totalDollars) - allocated
        : Math.round((dollarsToCents(totalDollars) * pct) / 100);
    allocated += cents;
    lines.push({ category_name, actual_cents: cents });
  });
  return lines;
}

// floor_area_m2 × an indicative $/m² gives the illustrative total — see the
// warning above; these rates are invented for the demo, not researched.
const DEMO_JOBS = [
  {
    name: 'Steel-frame hillside home — Bexhill',
    status: 'completed',
    description:
      'Split-level steel frame on a sloping rural block, standard fit-out. Owner supplied some fixtures. Demo data.',
    floor_area_m2: 140,
    storeys: 2,
    construction_type: 'Steel frame',
    quality_level: 'standard',
    site_conditions: ['sloping site', 'remote access', 'off-grid power'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — J. Alcorn',
    rate_per_m2: 3200,
    mix: STANDARD_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
  {
    name: 'Rammed earth passive home — Federal',
    status: 'completed',
    description:
      'Single-storey rammed earth walls, passive solar design, off-grid water and power, BAL-29 bushfire construction. Demo data.',
    floor_area_m2: 180,
    storeys: 1,
    construction_type: 'Rammed earth',
    quality_level: 'premium',
    site_conditions: ['sloping site', 'bushfire bal-29', 'off-grid power', 'off-grid water'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — R. Mackenzie',
    rate_per_m2: 5200,
    mix: MASONRY_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
  {
    name: 'Timber pole home — Dorroughby',
    status: 'completed',
    description:
      'Elevated timber pole construction on a steep, flood-prone rural block with a long unsealed access road. Demo data.',
    floor_area_m2: 165,
    storeys: 2,
    construction_type: 'Timber frame',
    quality_level: 'standard',
    site_conditions: ['steep slope', 'flood-prone', 'remote access'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — S. Whitton',
    rate_per_m2: 3600,
    mix: STANDARD_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
  {
    name: 'Kit-home extension — Lismore',
    status: 'completed',
    description:
      'Budget timber-frame extension onto an existing flood-affected house; owner project-managed most trades directly. Demo data.',
    floor_area_m2: 90,
    storeys: 1,
    construction_type: 'Timber frame',
    quality_level: 'budget',
    site_conditions: ['existing structure', 'flood-prone'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — T. Ferris',
    rate_per_m2: 2600,
    mix: STANDARD_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
  {
    name: 'Architectural steel & glass — Byron hinterland',
    status: 'completed',
    description:
      'Steep hinterland block, full-height glazing runs, exposed steel structure, BAL-40 bushfire construction, crane-assisted access. Demo data.',
    floor_area_m2: 220,
    storeys: 2,
    construction_type: 'Steel frame',
    quality_level: 'luxury',
    site_conditions: ['steep slope', 'bushfire bal-40', 'difficult access'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — Confidential (hinterland build)',
    rate_per_m2: 6800,
    mix: GLAZING_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
  {
    name: 'Brick veneer family home — Goonellabah',
    status: 'completed',
    description: 'Standard brick veneer build on a flat, fully serviced town block. The closest thing to a "standard" job in this set. Demo data.',
    floor_area_m2: 200,
    storeys: 1,
    construction_type: 'Brick veneer',
    quality_level: 'standard',
    site_conditions: ['flat site', 'town water', 'town sewer'],
    region: 'Northern Rivers NSW',
    client_name: 'Demo — M. & K. Ostini',
    rate_per_m2: 2800,
    mix: MASONRY_MIX,
    notes: 'Demo reference job — placeholder data. Replace with a real completed job.',
  },
];

function buildEstimatorTables({ startIds = {} } = {}) {
  let jobId = startIds.estimate_jobs || 1;
  let lineId = startIds.estimate_line_items || 1;
  const nowIso = new Date().toISOString();

  const estimate_jobs = [];
  const estimate_line_items = [];

  for (const spec of DEMO_JOBS) {
    const id = jobId++;
    const totalDollars = spec.floor_area_m2 * spec.rate_per_m2;
    const totalCents = dollarsToCents(totalDollars);

    estimate_jobs.push({
      id,
      name: spec.name,
      status: spec.status,
      description: spec.description,
      floor_area_m2: spec.floor_area_m2,
      storeys: spec.storeys,
      construction_type: spec.construction_type,
      quality_level: spec.quality_level,
      site_conditions: JSON.stringify(spec.site_conditions),
      region: spec.region,
      client_name: spec.client_name,
      estimated_total_cents: null,
      estimated_confidence: null,
      actual_total_cents: totalCents,
      notes: spec.notes,
      created_at: nowIso,
      updated_at: nowIso,
    });

    splitByMix(totalDollars, spec.mix).forEach((line, i) => {
      estimate_line_items.push({
        id: lineId++,
        job_id: id,
        category_name: line.category_name,
        estimated_cents: null,
        actual_cents: line.actual_cents,
        source: 'manual',
        notes: null,
        sort_order: i,
      });
    });
  }

  return {
    estimate_jobs,
    estimate_line_items,
    nextIds: { estimate_jobs: jobId, estimate_line_items: lineId },
  };
}

module.exports = { DEMO_JOBS, STANDARD_MIX, MASONRY_MIX, GLAZING_MIX, buildEstimatorTables };
