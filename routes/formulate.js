const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { expandRecipe, parseVariablesJson, round3 } = require('../lib/formulate');
const { cheapestForItem } = require('../lib/price-match');
const { listCategories } = require('./budget');
const { BUTTON_CLASSES } = require('../lib/theme');

function categoryIdForName(categories, name) {
  const hit = categories.find((c) => c.name === name);
  return hit ? hit.id : categories[0] && categories[0].id;
}

async function loadRecipeBundle(recipeKey) {
  const recipes = await store.listAll('formulate_recipes', { orderBy: 'sort_order' });
  const recipe =
    recipes.find((r) => r.slug === recipeKey) ||
    recipes.find((r) => String(r.id) === String(recipeKey)) ||
    recipes[0] ||
    null;
  if (!recipe) return { recipes, recipe: null, lines: [] };
  const lines = (await store.getWhere('formulate_lines', { recipe_id: recipe.id })).sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  );
  return { recipes, recipe, lines };
}

function variableValuesFromQuery(variables, query) {
  const values = {};
  for (const v of variables) {
    if (query[v.name] !== undefined && query[v.name] !== '') values[v.name] = query[v.name];
    else if (v.name === 'beam' && query.qty) values[v.name] = query.qty;
    else if (v.name === 'area' && query.qty) values[v.name] = query.qty;
    else if (v.name === 'length' && query.qty) values[v.name] = query.qty;
    else values[v.name] = v.default || '';
  }
  return values;
}

async function handleFormulatePage(req, res, { sendHtml }, query, flash) {
  const categories = await listCategories();
  const { recipes, recipe, lines } = await loadRecipeBundle(query.recipe);
  const suppliers = await store.listAll('suppliers', { orderBy: 'sort_order' });
  const priceBook = await store.listAll('price_book_items', { orderBy: 'sort_order' });
  const supplierById = Object.fromEntries(suppliers.map((s) => [s.id, s]));
  const priceBookNamed = priceBook.map((p) => ({ ...p, supplier_name: supplierById[p.supplier_id]?.name || '' }));

  const recipeNav = recipes
    .map((r) => {
      const active = recipe && r.id === recipe.id;
      const cls = active
        ? 'bg-[#4f6070] text-white'
        : 'bg-white text-slate-700 hover:bg-slate-50';
      return `<a href="/formulate?recipe=${encodeURIComponent(r.slug || r.id)}" class="block rounded border border-slate-200 px-3 py-2 text-sm mb-1 ${cls}">${escapeHtml(r.name)}</a>`;
    })
    .join('');

  if (!recipe) {
    const body = `
      <h1 class="text-2xl font-bold mb-2">Formulate</h1>
      <p class="text-sm text-slate-600">No recipes yet.</p>
    `;
    return sendHtml(res, layout({ title: 'Formulate', activePath: '/formulate', body, flash }));
  }

  const variables = parseVariablesJson(recipe.variables_json);
  const values = variableValuesFromQuery(variables, query);
  const submitted = variables.some((v) => query[v.name] !== undefined && query[v.name] !== '') || query.qty;
  let expanded = [];
  let expandError = '';
  try {
    expanded = expandRecipe(recipe, lines, values);
  } catch (err) {
    expandError = err.message;
  }

  const priced = expanded.map((line) => {
    const match = cheapestForItem(
      { ...line, description: `${line.description} ${line.sku_hint || ''}`.trim() },
      priceBookNamed
    );
    const unitCost = match ? match.unit_cost_cents : null;
    const ext = unitCost != null ? Math.round(line.quantity * unitCost) : null;
    return { ...line, match, unitCost, ext };
  });

  const fields = variables
    .map(
      (v) => `<div>
        <label class="block text-xs text-slate-500 mb-1">${escapeHtml(v.label)} (${escapeHtml(v.unit)})</label>
        <input type="text" inputmode="decimal" name="${escapeHtml(v.name)}" value="${escapeHtml(String(values[v.name] ?? ''))}"
          class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </div>`
    )
    .join('');

  const lineRows = priced
    .map((line) => {
      const priceNote = line.match
        ? `${escapeHtml(line.match.supplier_name)} · ${centsToDisplay(line.unitCost)} / ${escapeHtml(line.unit)}`
        : 'No price-book match';
      return `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4">
          <div class="font-medium">${escapeHtml(line.description)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(line.expression)}${line.wastage_pct ? ' + ' + line.wastage_pct + '% waste' : ''}</div>
        </td>
        <td class="py-2 pr-4 whitespace-nowrap">${line.quantity} ${escapeHtml(line.unit)}</td>
        <td class="py-2 pr-4 text-xs text-slate-600">${priceNote}</td>
        <td class="py-2 pr-4 text-right">${line.ext != null ? centsToDisplay(line.ext) : '—'}</td>
      </tr>`;
    })
    .join('');

  const totalExt = priced.reduce((s, l) => s + (l.ext || 0), 0);
  const categoryOptions = categories
    .map(
      (c) =>
        `<option value="${c.id}" ${c.name === recipe.category ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    )
    .join('');

  const hiddenVars = variables
    .map((v) => `<input type="hidden" name="${escapeHtml(v.name)}" value="${escapeHtml(String(values[v.name] ?? ''))}" />`)
    .join('');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Formulate</h1>
    <p class="text-sm text-slate-600 mb-6 max-w-3xl">
      A recipe turns one measured number — or a few related ones — into the bill of quantities behind it.
      Example: <strong>beam × dig × footing = AB</strong> (concrete volume). Link a Plan Measure length
      in as <em>beam</em>, then drop the expanded lines into Materials.
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <div>
        <h2 class="text-sm font-semibold mb-2">Recipes</h2>
        ${recipeNav}
        <details class="mt-4 bg-white rounded-lg border border-slate-200 p-3">
          <summary class="text-sm font-medium cursor-pointer">New recipe</summary>
          <form method="post" action="/formulate/new" class="mt-3 space-y-2 text-sm">
            <input name="name" required placeholder="Name" class="w-full rounded border border-slate-300 px-2 py-1" />
            <input name="slug" placeholder="slug (optional)" class="w-full rounded border border-slate-300 px-2 py-1" />
            <textarea name="description" placeholder="What it calculates" class="w-full rounded border border-slate-300 px-2 py-1"></textarea>
            <input name="variables" placeholder="beam:m, dig:m, footing:m" class="w-full rounded border border-slate-300 px-2 py-1" />
            <p class="text-[11px] text-slate-500">Variables as name:unit, comma-separated.</p>
            <textarea name="lines" rows="4" placeholder="Concrete N32 | m3 | beam * dig * footing | 10&#10;Mesh | ea | beam / 6 | 5" class="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"></textarea>
            <p class="text-[11px] text-slate-500">Lines: description | unit | expression | wastage%</p>
            <button class="${BUTTON_CLASSES} px-3 py-1.5 rounded text-sm">Save recipe</button>
          </form>
        </details>
      </div>

      <div>
        <div class="bg-white rounded-lg border border-slate-200 p-5 mb-4">
          <h2 class="font-semibold mb-1">${escapeHtml(recipe.name)}</h2>
          <p class="text-sm text-slate-600 mb-4">${escapeHtml(recipe.description || '')}</p>
          <form method="get" action="/formulate" class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <input type="hidden" name="recipe" value="${escapeHtml(recipe.slug || String(recipe.id))}" />
            ${fields}
            <div><button class="${BUTTON_CLASSES} w-full px-3 py-1.5 rounded text-sm">Calculate</button></div>
          </form>
          ${expandError ? `<p class="text-sm text-red-700 mt-3">${escapeHtml(expandError)}</p>` : ''}
        </div>

        <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500 border-b border-slate-200">
                <th class="py-2 pr-4 font-medium">Line</th>
                <th class="py-2 pr-4 font-medium">Qty</th>
                <th class="py-2 pr-4 font-medium">Indicative price</th>
                <th class="py-2 pr-4 font-medium text-right">Extension</th>
              </tr>
            </thead>
            <tbody>${lineRows || '<tr><td class="py-3 text-slate-500" colspan="4">Enter the variables and calculate.</td></tr>'}</tbody>
            ${
              submitted && priced.length
                ? `<tfoot><tr class="font-semibold"><td class="pt-3" colspan="3">Indicative total</td><td class="pt-3 text-right">${centsToDisplay(totalExt)}</td></tr></tfoot>`
                : ''
            }
          </table>
        </div>

        ${
          submitted && priced.length
            ? `<form method="post" action="/formulate/apply" class="mt-4 bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
                <input type="hidden" name="recipe_id" value="${recipe.id}" />
                ${hiddenVars}
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Materials category</label>
                  <select name="category_id" class="rounded border border-slate-300 px-2 py-1 text-sm">${categoryOptions}</select>
                </div>
                <label class="text-sm flex items-center gap-2">
                  <input type="checkbox" name="with_prices" value="1" checked />
                  Stamp cheapest Price Book rates onto the lines
                </label>
                <button class="${BUTTON_CLASSES} px-4 py-2 rounded text-sm">Add lines to Materials</button>
              </form>`
            : ''
        }
      </div>
    </div>
  `;

  sendHtml(res, layout({ title: 'Formulate', activePath: '/formulate', body, flash, wide: true }));
}

function parseVariableSpec(raw) {
  return String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, unit] = part.split(':').map((s) => s.trim());
      return { name, label: name, unit: unit || '', default: '' };
    })
    .filter((v) => v.name);
}

function parseLineSpec(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const bits = line.split('|').map((s) => s.trim());
      return {
        description: bits[0] || 'Line',
        unit: bits[1] || 'ea',
        expression: bits[2] || '1',
        wastage_pct: Number(bits[3]) || 0,
        sku_hint: bits[4] || '',
        sort_order: i,
      };
    });
}

async function handleFormulateNew(req, res) {
  const form = await readFormBody(req);
  const name = (form.name || '').trim();
  if (!name) return redirect(res, '/formulate');
  const slug = (form.slug || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const existing = await store.listAll('formulate_recipes');
  const recipe = await store.insert('formulate_recipes', {
    slug,
    name,
    description: form.description || '',
    output_unit: 'ea',
    category: form.category || null,
    variables_json: JSON.stringify(parseVariableSpec(form.variables)),
    created_at: new Date().toISOString(),
    sort_order: existing.length,
  });
  const lines = parseLineSpec(form.lines);
  for (const line of lines) {
    await store.insert('formulate_lines', { ...line, recipe_id: recipe.id });
  }
  redirect(res, '/formulate?recipe=' + encodeURIComponent(slug) + '&flash=' + encodeURIComponent('Recipe saved.'));
}

async function handleFormulateApply(req, res) {
  const form = await readFormBody(req);
  const recipe = await store.getById('formulate_recipes', Number(form.recipe_id));
  if (!recipe) return redirect(res, '/formulate');
  const lines = (await store.getWhere('formulate_lines', { recipe_id: recipe.id })).sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  );
  const values = {};
  for (const v of parseVariablesJson(recipe.variables_json)) values[v.name] = form[v.name];
  const expanded = expandRecipe(recipe, lines, values);
  const categories = await listCategories();
  const categoryId = Number(form.category_id) || categoryIdForName(categories, recipe.category);
  const withPrices = form.with_prices === '1';
  const suppliers = await store.listAll('suppliers');
  const priceBook = (await store.listAll('price_book_items')).map((p) => ({
    ...p,
    supplier_name: suppliers.find((s) => s.id === p.supplier_id)?.name || '',
  }));

  let count = 0;
  for (const line of expanded) {
    if (!line.quantity) continue;
    const match = withPrices
      ? cheapestForItem({ ...line, description: `${line.description} ${line.sku_hint || ''}`.trim() }, priceBook)
      : null;
    await store.insert('boq_items', {
      category_id: categoryId,
      description: `${recipe.name}: ${line.description}`,
      quantity: round3(line.quantity),
      unit: line.unit,
      unit_cost_cents: match ? match.unit_cost_cents : null,
      supplier: match ? match.supplier_name : null,
      status: 'not_ordered',
      note: `Formulate ${line.expression}`,
      created_at: new Date().toISOString(),
    });
    count += 1;
  }
  redirect(res, '/materials?flash=' + encodeURIComponent(`${count} Formulate lines added to Materials.`));
}

module.exports = { handleFormulatePage, handleFormulateNew, handleFormulateApply };
