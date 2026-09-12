const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { CALCULATORS, compute } = require('../lib/calculators');
const { listCategories } = require('./budget');

function fieldName(calc, field) {
  return `${calc.id}__${field.name}`;
}

// Server-side render is kept as a genuine fallback (query params computed
// with the exact same compute() the browser uses -- see lib/calculators.js)
// for the rare case JS doesn't run at all. Whenever JS *does* run -- which
// is virtually always -- the inline script below takes over completely:
// it recomputes on every keystroke with zero network round trip, so this
// page keeps working with no signal at all once it's been opened once
// while online. The <form method="get"> submit is intercepted for exactly
// that reason; it's not dead markup.
function calculatorCard(calc, query, categoryOptions) {
  const values = {};
  calc.fields.forEach((f) => {
    const raw = query[fieldName(calc, f)];
    values[f.name] = raw !== undefined ? raw : f.default;
  });

  const primaryField = fieldName(calc, calc.fields[0]);
  const submitted = query[primaryField] !== undefined && query[primaryField] !== '';
  const result = submitted ? compute(calc, values) : null;

  const fieldsHtml = calc.fields
    .map(
      (f) => `<div>
        <label class="block text-xs text-slate-500 mb-1">${escapeHtml(f.label)}</label>
        <input type="text" inputmode="decimal" data-calc-field="${escapeHtml(f.name)}" name="${fieldName(calc, f)}" value="${escapeHtml(
        String(values[f.name] ?? '')
      )}"
          class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>`
    )
    .join('');

  return `<div class="bg-white rounded-lg border border-slate-200 p-5 mb-4" data-calc-card data-calc-id="${escapeHtml(calc.id)}" data-calc-kind="${escapeHtml(calc.kind)}" data-calc-unit="${escapeHtml(calc.unit)}" data-calc-label="${escapeHtml(calc.label)}">
    <h3 class="font-semibold mb-1">${escapeHtml(calc.label)}</h3>
    <p class="text-xs text-slate-500 mb-3">${escapeHtml(calc.help)}</p>
    <form method="get" action="/calculators" data-calc-form class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
      ${fieldsHtml}
      <div><button type="submit" class="text-sm bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-3 py-1.5 rounded hover:bg-[#7a1611] w-full">Calculate</button></div>
    </form>
    <div data-calc-result class="mt-3 rounded bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between flex-wrap gap-2" ${result === null ? 'hidden' : ''}>
      <div class="text-sm" data-calc-result-text>${result !== null ? `≈ <strong>${result}</strong> ${escapeHtml(calc.unit)} needed` : ''}</div>
      <form method="post" action="/materials/new" data-offline-queue="${escapeHtml(calc.label)} (calculated)" class="flex items-center gap-1 flex-wrap">
        <input type="hidden" name="description" data-calc-desc value="${escapeHtml(calc.label)} (calculated)" />
        <input type="hidden" name="quantity" data-calc-qty value="${result ?? 0}" />
        <input type="hidden" name="unit" value="${escapeHtml(calc.unit)}" />
        <select name="category_id" class="text-xs rounded border border-slate-300 px-1 py-1">
          ${categoryOptions}
        </select>
        <button class="text-xs bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-2 py-1 rounded hover:bg-[#7a1611]">Add to materials list</button>
      </form>
    </div>
  </div>`;
}

async function handleCalculatorsPage(req, res, { sendHtml }, query, flash) {
  const categories = await listCategories();
  const categoryOptions = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  const cardsHtml = CALCULATORS.map((calc) => calculatorCard(calc, query, categoryOptions)).join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Materials calculators</h1>
    <p class="text-sm text-slate-600 mb-6">
      Quick quantity estimates for common materials — no AI needed, and no signal needed either: once this
      page has loaded once, every calculation below runs entirely on your device. Plug in your measurements,
      get a starting number, and add it straight to your materials list to compare supplier quotes (that part
      queues automatically if you're offline). These are trade rules-of-thumb, not a substitute for a
      quantity surveyor or your actual plans.
    </p>
    ${cardsHtml}
    <script src="/public/calculators.js"></script>
    <script>
      (function () {
        if (!window.Calculators) return; // shared script failed to load -- GET-form fallback still works online
        var byId = {};
        window.Calculators.CALCULATORS.forEach(function (c) { byId[c.id] = c; });

        function readValues(card) {
          var values = {};
          card.querySelectorAll('[data-calc-field]').forEach(function (input) {
            values[input.getAttribute('data-calc-field')] = input.value;
          });
          return values;
        }

        function recompute(card) {
          var calc = byId[card.getAttribute('data-calc-id')];
          if (!calc) return;
          var values = readValues(card);
          var primary = calc.fields[0].name;
          var resultBox = card.querySelector('[data-calc-result]');
          if (!values[primary]) {
            resultBox.hidden = true;
            return;
          }
          var result = window.Calculators.compute(calc, values);
          resultBox.hidden = false;
          card.querySelector('[data-calc-result-text]').innerHTML =
            '≈ <strong>' + result + '</strong> ' + calc.unit + ' needed';
          card.querySelector('[data-calc-qty]').value = result;
        }

        document.querySelectorAll('[data-calc-card]').forEach(function (card) {
          card.querySelectorAll('[data-calc-field]').forEach(function (input) {
            input.addEventListener('input', function () { recompute(card); });
          });
          var form = card.querySelector('[data-calc-form]');
          form.addEventListener('submit', function (event) {
            // With JS running, calculating never needs the server (or a
            // connection) at all -- this just re-runs the same live compute
            // the input listeners above already do, instead of navigating.
            event.preventDefault();
            recompute(card);
          });
          recompute(card);
        });
      })();
    </script>
  `;

  sendHtml(res, layout({ title: 'Calculators', activePath: '/calculators', body, flash }));
}

module.exports = { handleCalculatorsPage };
