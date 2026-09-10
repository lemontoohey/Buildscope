const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, dollarsToCents } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');

async function listCategories() {
  const [categories, transactions] = await Promise.all([
    store.listAll('budget_categories', { orderBy: 'sort_order' }),
    store.listAll('transactions'),
  ]);

  const actualByCategory = {};
  for (const t of transactions) {
    actualByCategory[t.category_id] = (actualByCategory[t.category_id] || 0) + Number(t.amount_cents);
  }

  return categories.map((c) => ({ ...c, actual_cents: actualByCategory[c.id] || 0 }));
}

async function handleBudgetPage(req, res, { sendHtml }, flash) {
  const categories = await listCategories();

  const rows = categories
    .map((c) => {
      const remaining = c.budgeted_cents - c.actual_cents;
      const remainingClass = remaining < 0 ? 'text-red-600' : 'text-slate-700';
      return `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4">${escapeHtml(c.name)}</td>
        <td class="py-2 pr-4">
          <form method="post" action="/budget/update" class="flex items-center gap-2">
            <input type="hidden" name="category_id" value="${c.id}" />
            <span class="text-slate-400">$</span>
            <input
              type="text"
              name="budgeted"
              value="${(c.budgeted_cents / 100).toFixed(2)}"
              class="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-right"
            />
            <button class="text-sm bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-3 py-1 rounded hover:bg-[#7a1611]">Save</button>
          </form>
        </td>
        <td class="py-2 pr-4 text-right">${centsToDisplay(c.actual_cents)}</td>
        <td class="py-2 pr-4 text-right ${remainingClass}">${centsToDisplay(remaining)}</td>
      </tr>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-6">Budget</h1>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mb-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 border-b border-slate-200">
            <th class="py-2 pr-4 font-medium">Category</th>
            <th class="py-2 pr-4 font-medium">Budgeted</th>
            <th class="py-2 pr-4 font-medium text-right">Spent</th>
            <th class="py-2 pr-4 font-medium text-right">Remaining</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <h2 class="text-lg font-semibold mb-3">Add a category</h2>
    <form method="post" action="/budget/new" class="bg-white rounded-lg border border-slate-200 p-4 flex gap-2 max-w-md">
      <input
        type="text"
        name="name"
        required
        placeholder="e.g. Skip bins & site waste"
        class="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Add</button>
    </form>
  `;

  sendHtml(res, layout({ title: 'Budget', activePath: '/budget', body, flash }));
}

async function handleBudgetUpdate(req, res) {
  const form = await readFormBody(req);
  const categoryId = Number(form.category_id);
  const cents = dollarsToCents(form.budgeted);
  await store.update('budget_categories', categoryId, { budgeted_cents: cents });
  redirect(res, '/budget');
}

async function handleBudgetNew(req, res) {
  const form = await readFormBody(req);
  const name = (form.name || '').trim();
  if (name) {
    const existing = await store.listAll('budget_categories');
    const alreadyExists = existing.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!alreadyExists) {
      const maxOrder = existing.reduce((m, c) => Math.max(m, c.sort_order), 0);
      try {
        await store.insert('budget_categories', { name, budgeted_cents: 0, sort_order: maxOrder + 1 });
      } catch (err) {
        // Duplicate name (unique constraint) or transient error — fall through to redirect either way.
      }
    }
  }
  redirect(res, '/budget');
}

module.exports = { handleBudgetPage, handleBudgetUpdate, handleBudgetNew, listCategories };
