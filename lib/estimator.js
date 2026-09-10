// The Job Estimator's matching engine: turns a library of past custom jobs
// (each with what it actually cost, broken down by budget category) into a
// defensible estimate for a new one.
//
// Deliberately NOT an AI call and NOT a trained model. It's a weighted
// nearest-neighbour match over plain JS objects — every number in the
// output traces back to a specific past job you can name and point to
// ("we built one like this for the Smiths, it cost $X/m²"), which is what
// actually earns trust on a custom quote, and it costs nothing to run.
//
// This is the same idea as lib/price-history.js's "let price data compound"
// pattern — this build's own paid prices beat a generic seeded rate — just
// applied one level up, at the whole-job level instead of the line-item
// level. A job "learns" the moment its real status is set to `completed`
// with real final numbers filled in (see routes/estimator.js); there's no
// separate training step, no model file, nothing to retrain. The next
// estimate just has one more data point to weigh in.

function toTagArray(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (!raw) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
      } catch {
        // fall through to comma-split
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size && !setB.size) return 1; // neither job has tags — no signal either way, don't penalise
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

const QUALITY_LEVELS = ['budget', 'standard', 'premium', 'luxury'];

function qualityCloseness(a, b) {
  if (!a || !b) return 0.5; // one/both unknown — neutral, not a penalty
  const ia = QUALITY_LEVELS.indexOf(String(a).toLowerCase());
  const ib = QUALITY_LEVELS.indexOf(String(b).toLowerCase());
  if (ia === -1 || ib === -1) return String(a).toLowerCase() === String(b).toLowerCase() ? 1 : 0.5;
  const dist = Math.abs(ia - ib);
  return Math.max(0, 1 - dist / (QUALITY_LEVELS.length - 1));
}

function sizeCloseness(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!x || !y) return 0.5;
  return x > y ? y / x : x / y; // 0..1, 1 = identical floor area
}

// Explicit, easy-to-retune weights rather than anything fitted to data —
// there's no training set big enough to fit against yet, and a plain
// weighted match is something a person can read and argue with, which
// matters more than squeezing out a bit more accuracy.
const WEIGHTS = {
  construction_type: 0.3,
  quality_level: 0.2,
  site_conditions: 0.2,
  floor_area: 0.2,
  region: 0.1,
};

// Similarity between a target job (the one being estimated) and a candidate
// past job, from 0 (nothing in common) to 1 (as alike as this model can
// tell). A dimension only counts when BOTH the target and the candidate
// have something filled in for it — missing on either side means there's
// no signal to compare, so it drops out of the weighting rather than
// counting for OR against the match. (Without that "both sides" rule, a
// job with almost nothing filled in yet could still pick up a fabricated
// mid-range score against everything in the library — worse than no
// estimate at all, because it looks like one.)
//
// MIN_WEIGHT_COVERAGE then guards the other side of the same problem: even
// with the both-sides rule, a target with only ONE attribute filled in
// (say, just a quality level) could still score a deceptively high match
// purely off that one dimension. Below this much of the total weight
// actually compared, the match isn't trusted at all — similarity comes
// back 0, which reads as "not enough is filled in about this job yet" via
// confidenceFor()'s "No data" path, rather than a shaky number dressed up
// as a real one.
const MIN_WEIGHT_COVERAGE = 0.5;

function similarity(target, candidate) {
  let score = 0;
  let weightUsed = 0;

  if (target.construction_type && candidate.construction_type) {
    const match =
      String(target.construction_type).trim().toLowerCase() === String(candidate.construction_type).trim().toLowerCase() ? 1 : 0;
    score += match * WEIGHTS.construction_type;
    weightUsed += WEIGHTS.construction_type;
  }

  if (target.quality_level && candidate.quality_level) {
    score += qualityCloseness(target.quality_level, candidate.quality_level) * WEIGHTS.quality_level;
    weightUsed += WEIGHTS.quality_level;
  }

  const targetTags = toTagArray(target.site_conditions);
  const candidateTags = toTagArray(candidate.site_conditions);
  if (targetTags.length && candidateTags.length) {
    score += jaccard(targetTags, candidateTags) * WEIGHTS.site_conditions;
    weightUsed += WEIGHTS.site_conditions;
  }

  if (target.floor_area_m2 && candidate.floor_area_m2) {
    score += sizeCloseness(target.floor_area_m2, candidate.floor_area_m2) * WEIGHTS.floor_area;
    weightUsed += WEIGHTS.floor_area;
  }

  if (target.region && candidate.region) {
    const match = String(target.region).trim().toLowerCase() === String(candidate.region).trim().toLowerCase() ? 1 : 0;
    score += match * WEIGHTS.region;
    weightUsed += WEIGHTS.region;
  }

  if (weightUsed < MIN_WEIGHT_COVERAGE) return 0;
  return score / weightUsed;
}

// Reference pool = completed jobs with a real total and a floor area (both
// are needed to turn "what it cost" into a $/m² rate that scales to a
// different-sized target job). Draft/quoted/won-but-not-built jobs never
// count as reference data — only a real, finished, actually-costed job does.
function referencePool(jobs) {
  return jobs.filter((j) => j.status === 'completed' && Number(j.actual_total_cents) > 0 && Number(j.floor_area_m2) > 0);
}

function findMatches(target, jobs, { minScore = 0.25, maxMatches = 6 } = {}) {
  return referencePool(jobs)
    .filter((j) => j.id !== target.id)
    .map((job) => ({ job, score: similarity(target, job) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMatches);
}

// Whole-job estimate: each matched job's own $/m² rate, weighted by how
// similar it is to the target, averaged, then scaled to the target's floor
// area. Returns null if nothing matched (nothing to estimate from — the
// caller should say so plainly rather than guessing).
function estimateTotal(target, matches) {
  let weightedRate = 0;
  let weight = 0;
  const contributors = [];
  for (const m of matches) {
    const rate = m.job.actual_total_cents / m.job.floor_area_m2;
    weightedRate += rate * m.score;
    weight += m.score;
    contributors.push({
      job_id: m.job.id,
      job_name: m.job.name,
      score: m.score,
      rate_per_m2_cents: Math.round(rate),
      actual_total_cents: m.job.actual_total_cents,
      floor_area_m2: m.job.floor_area_m2,
    });
  }
  if (!weight) return null;
  const ratePerM2 = weightedRate / weight;
  const targetArea = Number(target.floor_area_m2) || 0;
  return {
    estimated_cents: Math.round(ratePerM2 * targetArea),
    rate_per_m2_cents: Math.round(ratePerM2),
    contributors: contributors.sort((a, b) => b.score - a.score),
  };
}

// Category-level estimate: same weighted-$/m² idea, run once per budget
// category, using only the matched jobs that actually recorded a real
// figure for that category. A category none of the matches costed out
// individually just doesn't come back — never backfilled with a guess.
function estimateCategories(target, matches, lineItemsByJobId) {
  const categoryNames = new Set();
  for (const m of matches) {
    for (const li of lineItemsByJobId[m.job.id] || []) {
      if (li.actual_cents != null) categoryNames.add(li.category_name);
    }
  }

  const targetArea = Number(target.floor_area_m2) || 0;
  const results = {};
  for (const categoryName of categoryNames) {
    let weightedRate = 0;
    let weight = 0;
    const contributors = [];
    for (const m of matches) {
      const li = (lineItemsByJobId[m.job.id] || []).find((row) => row.category_name === categoryName);
      if (!li || li.actual_cents == null) continue;
      const rate = li.actual_cents / m.job.floor_area_m2;
      weightedRate += rate * m.score;
      weight += m.score;
      contributors.push({
        job_id: m.job.id,
        job_name: m.job.name,
        score: m.score,
        rate_per_m2_cents: Math.round(rate),
        actual_cents: li.actual_cents,
      });
    }
    if (weight > 0) {
      const rate = weightedRate / weight;
      results[categoryName] = {
        estimated_cents: Math.round(rate * targetArea),
        contributors: contributors.sort((a, b) => b.score - a.score),
      };
    }
  }
  return results;
}

// Plain-English confidence rating — never just a bare number. Weighs how
// many jobs matched, how close a match they were, and how much they agree
// with each other on $/m² (tight agreement = trustworthy; wide spread =
// "these past jobs vary a lot, treat this as a rough start").
function confidenceFor(totalResult) {
  if (!totalResult || !totalResult.contributors.length) {
    return {
      label: 'No data',
      detail: 'No past completed jobs matched closely enough to estimate from. Price this one manually, then mark it Completed once it is done so it can inform the next estimate.',
      matchCount: 0,
      avgScore: 0,
      spreadPct: null,
    };
  }

  const rates = totalResult.contributors.map((c) => c.rate_per_m2_cents);
  const n = rates.length;
  const mean = rates.reduce((a, b) => a + b, 0) / n;
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const cv = mean ? stdev / mean : 1; // coefficient of variation — spread relative to the average

  const avgScore = totalResult.contributors.reduce((a, c) => a + c.score, 0) / n;

  let label = 'Low';
  if (n >= 3 && avgScore >= 0.6 && cv <= 0.25) label = 'High';
  else if (n >= 2 && avgScore >= 0.4 && cv <= 0.45) label = 'Medium';

  const bits = [
    `${n} past job${n === 1 ? '' : 's'} matched`,
    `average similarity ${(avgScore * 100).toFixed(0)}%`,
    `$/m² spread ${(cv * 100).toFixed(0)}% of the mean across them`,
  ];
  if (n < 3) bits.push('few matches — treat this as a rough starting point, not a quote');

  return {
    label,
    detail: bits.join(', ') + '.',
    matchCount: n,
    avgScore,
    spreadPct: Math.round(cv * 100),
  };
}

module.exports = {
  toTagArray,
  similarity,
  referencePool,
  findMatches,
  estimateTotal,
  estimateCategories,
  confidenceFor,
  QUALITY_LEVELS,
};
