// Small shared helpers for turning data into HTML strings.
// No templating library — plain template literals are enough at this size,
// and it keeps the whole project dependency-free.

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function centsToDisplay(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

// Parses a user-typed dollar amount ("1,234.50", "$980") into integer cents.
function dollarsToCents(input) {
  if (input === null || input === undefined) return 0;
  const cleaned = String(input).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const dollars = parseFloat(cleaned);
  if (Number.isNaN(dollars)) return 0;
  return Math.round(dollars * 100);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { escapeHtml, centsToDisplay, dollarsToCents, todayIso };
