// Plain-English answers to the handful of questions people actually ask
// about a budget/schedule ("what's over? what's left? what's the biggest
// spend?") — computed by arithmetic over data already entered, so this
// works with zero AI configured. A pure function: hand it the same arrays
// the Dashboard already fetches, get back a list of {label, value} lines.

const { centsToDisplay } = require('./render');

function buildInsights({ categories, transactions, stages, complianceItems, boqItems }) {
  const insights = [];

  const totalSpent = transactions.reduce((sum, t) => sum + Number(t.amount_cents), 0);
  insights.push({
    label: 'Total spent so far',
    value: `${centsToDisplay(totalSpent)} across ${transactions.length} transaction${
      transactions.length === 1 ? '' : 's'
    }`,
  });

  const actualByCategory = {};
  for (const t of transactions) {
    actualByCategory[t.category_id] = (actualByCategory[t.category_id] || 0) + Number(t.amount_cents);
  }
  const withActuals = categories.map((c) => ({ ...c, actual: actualByCategory[c.id] || 0 }));

  const overBudget = withActuals.filter((c) => c.budgeted_cents > 0 && c.actual > c.budgeted_cents);
  insights.push({
    label: 'Categories over budget',
    value: overBudget.length ? overBudget.map((c) => c.name).join(', ') : 'None so far.',
  });

  const biggest = [...withActuals].sort((a, b) => b.actual - a.actual)[0];
  if (biggest && biggest.actual > 0) {
    insights.push({ label: 'Biggest spend category', value: `${biggest.name} (${centsToDisplay(biggest.actual)})` });
  }

  if (stages.length) {
    const doneStages = stages.filter((s) => s.status === 'done').length;
    insights.push({ label: 'Build progress', value: `${doneStages} of ${stages.length} stages done` });
  }

  if (complianceItems.length) {
    const pendingCompliance = complianceItems.filter((i) => i.status !== 'done').length;
    insights.push({
      label: 'Compliance remaining',
      value: `${pendingCompliance} of ${complianceItems.length} item${complianceItems.length === 1 ? '' : 's'} outstanding`,
    });
  }

  if (boqItems.length) {
    const notOrdered = boqItems.filter((i) => i.status === 'not_ordered').length;
    insights.push({ label: 'Materials not yet ordered', value: `${notOrdered} of ${boqItems.length} line items` });
  }

  return insights;
}

module.exports = { buildInsights };
