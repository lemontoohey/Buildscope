const { layout } = require('../lib/layout');
const { escapeHtml } = require('../lib/render');
const { CALCULATORS, compute } = require('../lib/calculators');
const { listCategories } = require('./budget');

function fieldName(calc, field) {
  return `${calc.id}__${field.name}`;
}

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
        <input type="text" inputmode="decimal" name="${fieldName(calc, f)}" value="${escapeHtml(
        String(values[f.name] ?? '')
      )}"
          class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>`
    )
    .join('');

  const resultHtml =
    result !== null
      ? `<div class="mt-3 rounded bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
          <div class="text-sm">≈ <strong>${result}</strong> ${escapeHtml(calc.unit)} needed</div>
          <form method="post" action="/materials/new" class="flex items-center gap-1 flex-wrap">
            <input type="hidden" name="description" value="${escapeHtml(calc.label)} (calculated)" />
            <input type="hidden" name="quantity" value="${result}" />
            <input type="hidden" name="unit" value="${escapeHtml(calc.unit)}" />
            <select name="category_id" class="text-xs rounded border border-slate-300 px-1 py-1">
              ${categoryOptions}
            </select>
            <button class="text-xs bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-2 py-1 rounded hover:bg-[#7a1611]">Add to materials list</button>
          </form>
        </div>`
      : '';

  return `<div class="bg-white rounded-lg border border-slate-200 p-5 mb-4">
    <h3 class="font-semibold mb-1">${escapeHtml(calc.label)}</h3>
    <p class="text-xs text-slate-500 mb-3">${escapeHtml(calc.help)}</p>
    <form method="get" action="/calculators" class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
      ${fieldsHtml}
      <div><button class="text-sm bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-3 py-1.5 rounded hover:bg-[#7a1611] w-full">Calculate</button></div>
    </form>
    ${resultHtml}
  </div>`;
}

async function handleCalculatorsPage(req, res, { sendHtml }, query, flash) {
  const categories = await listCategories();
  const categoryOptions = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  const cardsHtml = CALCULATORS.map((calc) => calculatorCard(calc, query, categoryOptions)).join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Materials calculators</h1>
    <p class="text-sm text-slate-600 mb-6">
      Quick quantity estimates for common materials — no AI needed. Plug in your measurements, get a starting
      number, and add it straight to your materials list to compare supplier quotes. These are trade
      rules-of-thumb, not a substitute for a quantity surveyor or your actual plans.
    </p>
    ${cardsHtml}
  `;

  sendHtml(res, layout({ title: 'Calculators', activePath: '/calculators', body, flash }));
}

module.exports = { handleCalculatorsPage };
