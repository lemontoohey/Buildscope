// Match estimate / Formulate lines to the Australian supplier price book.
// Token overlap plus a unit bonus — good enough to suggest a price, not a
// substitute for reading the quote.

const STOP = new Set(['the', 'and', 'for', 'with', 'per', 'a', 'an', 'of', 'to', 'in', 'mm', 'm2', 'm3', 'lm']);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !STOP.has(w));
}

function unitKey(u) {
  return String(u || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('m²', 'm2')
    .replace('m³', 'm3')
    .replace('metres', 'm')
    .replace('meter', 'm')
    .replace('sheets', 'ea')
    .replace('each', 'ea');
}

function scoreMatch(itemDescription, candidate, { unit } = {}) {
  const a = new Set(tokenize(itemDescription));
  const b = tokenize(`${candidate.description || ''} ${candidate.sku || ''}`);
  if (!a.size || !b.length) return 0;
  let hits = 0;
  for (const t of b) if (a.has(t)) hits += 1;
  if (!hits) return 0;
  let score = hits / Math.max(a.size, b.length);
  if (unit && unitKey(unit) && unitKey(unit) === unitKey(candidate.unit)) score += 0.35;
  if (candidate.sku && tokenize(itemDescription).includes(String(candidate.sku).toLowerCase())) score += 0.25;
  // A price this build actually paid on a past job beats a generic seeded
  // rate for the same description — it's not an industry average, it's
  // literally what this project pays. Nudges it ahead without letting it
  // win purely on being "own" data over an otherwise much better match.
  if (candidate.source === 'own_job') score += 0.4;
  return score;
}

function bestMatches(item, priceBook, { perSupplier = true, minScore = 0.15 } = {}) {
  const scored = priceBook
    .map((p) => ({ ...p, score: scoreMatch(item.description, p, { unit: item.unit }) }))
    .filter((p) => p.score >= minScore)
    .sort((a, b) => b.score - a.score || a.unit_cost_cents - b.unit_cost_cents);

  if (!perSupplier) return scored.slice(0, 8);

  const bySupplier = {};
  for (const row of scored) {
    if (!bySupplier[row.supplier_id]) bySupplier[row.supplier_id] = row;
  }
  return Object.values(bySupplier).sort((a, b) => a.unit_cost_cents - b.unit_cost_cents);
}

function cheapestForItem(item, priceBook) {
  let matches = bestMatches(item, priceBook);
  if (item.unit) {
    const sameUnit = matches.filter((p) => unitKey(p.unit) === unitKey(item.unit));
    if (sameUnit.length) matches = sameUnit;
  }
  if (!matches.length) return null;
  return matches.reduce((best, row) => (row.unit_cost_cents < best.unit_cost_cents ? row : best));
}

module.exports = { tokenize, scoreMatch, bestMatches, cheapestForItem, unitKey };
