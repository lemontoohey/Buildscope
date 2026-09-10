const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, todayIso } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { BUTTON_CLASSES } = require('../lib/theme');

const STATUSES = ['not_started', 'in_progress', 'done'];
const STATUS_LABELS = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' };

const BAR_FILL = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#059669',
};

function parseDay(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysIso(iso, n) {
  const d = parseDay(iso) || new Date(`${todayIso()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysInclusive(a, b) {
  const start = parseDay(a);
  const end = parseDay(b);
  if (!start || !end) return null;
  return Math.round((end - start) / 86400000) + 1;
}

function stageBadge(stage) {
  const today = todayIso();
  if (stage.status === 'done') {
    const late = stage.actual_end && stage.planned_end && stage.actual_end > stage.planned_end;
    return late
      ? '<span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Done (late)</span>'
      : '<span class="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Done</span>';
  }
  if (stage.planned_end && today > stage.planned_end) {
    return '<span class="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Overdue</span>';
  }
  if (stage.status === 'in_progress') {
    return '<span class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">In progress</span>';
  }
  return '<span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">Not started</span>';
}

function collectBounds(stages) {
  const dates = [];
  for (const s of stages) {
    for (const key of ['planned_start', 'planned_end', 'actual_start', 'actual_end']) {
      const d = parseDay(s[key]);
      if (d) dates.push(d);
    }
  }
  const today = parseDay(todayIso());
  if (today) dates.push(today);
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  min.setDate(min.getDate() - 3);
  max.setDate(max.getDate() + 7);
  return { min, max, span: (max - min) / 86400000 || 1 };
}

function xFor(day, bounds, left, width) {
  const t = (day - bounds.min) / 86400000;
  return left + (t / bounds.span) * width;
}

function monthTicks(bounds, left, width) {
  const ticks = [];
  const cursor = new Date(bounds.min.getFullYear(), bounds.min.getMonth(), 1);
  if (cursor < bounds.min) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= bounds.max) {
    ticks.push({
      x: xFor(cursor, bounds, left, width),
      label: cursor.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

function waterfallChart(stages) {
  const bounds = collectBounds(stages);
  if (!bounds) return '';

  const labelW = 210;
  const rowH = 28;
  const top = 28;
  const height = top + stages.length * rowH + 16;
  const width = 920;
  const plotW = width - labelW - 16;
  const todayX = xFor(parseDay(todayIso()), bounds, labelW, plotW);
  const ticks = monthTicks(bounds, labelW, plotW);

  const tickLines = ticks
    .map(
      (t) =>
        `<line x1="${t.x.toFixed(1)}" y1="${top - 6}" x2="${t.x.toFixed(1)}" y2="${height}" stroke="#e2e8f0" />` +
        `<text x="${t.x.toFixed(1)}" y="16" font-size="10" fill="#64748b">${escapeHtml(t.label)}</text>`
    )
    .join('');

  const rows = stages
    .map((s, i) => {
      const y = top + i * rowH;
      const plannedStart = parseDay(s.planned_start);
      const plannedEnd = parseDay(s.planned_end);
      const actualStart = parseDay(s.actual_start);
      const actualEnd = parseDay(s.actual_end) || (s.actual_start ? parseDay(todayIso()) : null);
      const fill = BAR_FILL[s.status] || BAR_FILL.not_started;
      const overdue = s.status !== 'done' && s.planned_end && todayIso() > s.planned_end;
      let plannedBar = '';
      if (plannedStart && plannedEnd) {
        const x1 = xFor(plannedStart, bounds, labelW, plotW);
        const x2 = Math.max(xFor(plannedEnd, bounds, labelW, plotW), x1 + 4);
        plannedBar = `<rect x="${x1.toFixed(1)}" y="${y + 6}" width="${(x2 - x1).toFixed(1)}" height="10" rx="3" fill="${overdue ? '#fecaca' : '#cbd5e1'}" />`;
      }
      let actualBar = '';
      if (actualStart && actualEnd) {
        const x1 = xFor(actualStart, bounds, labelW, plotW);
        const x2 = Math.max(xFor(actualEnd, bounds, labelW, plotW), x1 + 4);
        actualBar = `<rect x="${x1.toFixed(1)}" y="${y + 10}" width="${(x2 - x1).toFixed(1)}" height="10" rx="3" fill="${fill}" />`;
      } else if (plannedStart && plannedEnd && s.status === 'in_progress') {
        const x1 = xFor(plannedStart, bounds, labelW, plotW);
        const x2 = Math.max(todayX, x1 + 4);
        actualBar = `<rect x="${x1.toFixed(1)}" y="${y + 10}" width="${(x2 - x1).toFixed(1)}" height="10" rx="3" fill="${fill}" />`;
      }
      const dur = daysInclusive(s.planned_start, s.planned_end);
      return `<text x="0" y="${y + 16}" font-size="11" fill="#334155">${escapeHtml(s.name)}${dur ? `  (${dur}d)` : ''}</text>${plannedBar}${actualBar}`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" role="img" aria-label="Schedule waterfall">
      ${tickLines}
      <line x1="${todayX.toFixed(1)}" y1="${top - 6}" x2="${todayX.toFixed(1)}" y2="${height}" stroke="#9b1b15" stroke-dasharray="4 3" />
      <text x="${todayX.toFixed(1)}" y="${height - 2}" font-size="10" fill="#9b1b15">Today</text>
      ${rows}
    </svg>`;
}

async function handleSchedulePage(req, res, { sendHtml }, flash) {
  const stages = await store.listAll('schedule_stages', { orderBy: 'sort_order' });
  const hasDates = stages.some((s) => s.planned_start && s.planned_end);
  const chart = hasDates
    ? `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-6 overflow-x-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="font-semibold">Waterfall</h2>
          <div class="flex flex-wrap gap-3 text-xs text-slate-600">
            <span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-2.5 rounded bg-slate-300"></span> Planned</span>
            <span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-2.5 rounded bg-blue-500"></span> Actual / in progress</span>
            <span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-2.5 rounded bg-emerald-600"></span> Done</span>
            <span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-0.5 bg-[#9b1b15]"></span> Today</span>
          </div>
        </div>
        <p class="text-xs text-slate-500 mb-3">
          Dates from the forms below draw this Gantt-style waterfall — the same pattern Buildertrend and CoConstruct
          use so a delay in one stage is visible against the rest of the cascade.
        </p>
        ${waterfallChart(stages)}
      </div>`
    : `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-6 text-sm text-slate-600">
        Enter planned start/end dates on the stages, or cascade a sequence below, and a waterfall chart will draw from those numbers.
      </div>`;

  const rows = stages
    .map((s) => {
      const statusOptions = STATUSES.map(
        (st) => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${STATUS_LABELS[st]}</option>`
      ).join('');
      const dur = daysInclusive(s.planned_start, s.planned_end);

      return `<form method="post" action="/schedule/update" class="bg-white rounded-lg border border-slate-200 p-4 mb-3">
        <input type="hidden" name="stage_id" value="${s.id}" />
        <div class="flex items-center justify-between mb-3">
          <span class="font-semibold">${escapeHtml(s.name)}${dur ? ` <span class="text-xs font-normal text-slate-500">· ${dur} days planned</span>` : ''}</span>
          ${stageBadge(s)}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label class="block text-xs text-slate-500 mb-1">Planned start</label>
            <input type="date" name="planned_start" value="${s.planned_start || ''}"
              class="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Planned end</label>
            <input type="date" name="planned_end" value="${s.planned_end || ''}"
              class="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Actual start</label>
            <input type="date" name="actual_start" value="${s.actual_start || ''}"
              class="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Actual end</label>
            <input type="date" name="actual_end" value="${s.actual_end || ''}"
              class="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Status</label>
            <select name="status" class="w-full rounded border border-slate-300 px-2 py-1 text-sm">
              ${statusOptions}
            </select>
          </div>
        </div>
        <div class="mt-3">
          <input type="text" name="notes" value="${escapeHtml(s.notes || '')}" placeholder="Notes (optional)"
            class="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
        </div>
        <div class="mt-3">
          <button class="text-sm ${BUTTON_CLASSES} px-3 py-1 rounded">Save</button>
        </div>
      </form>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Schedule</h1>
    <p class="text-sm text-slate-600 mb-6">
      Planned vs. actual dates per stage. The waterfall above reads those dates directly — change a date, save, and the bars move.
      "Overdue" means today is past the planned end date and the stage isn't marked done yet.
    </p>
    ${chart}
    <form method="post" action="/schedule/cascade" class="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6 flex flex-wrap gap-3 items-end">
      <div>
        <label class="block text-xs text-slate-500 mb-1">Cascade from</label>
        <input type="date" name="start_date" value="${todayIso()}" required class="rounded border border-slate-300 px-2 py-1 text-sm" />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Days per stage</label>
        <input type="number" name="days" value="7" min="1" class="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
      </div>
      <button class="text-sm ${BUTTON_CLASSES} px-3 py-1.5 rounded">Lay stages end-to-end</button>
      <p class="text-xs text-slate-500 max-w-md">Fills planned dates as a finish-to-start chain (each stage starts the day after the one before). Does not overwrite actual dates.</p>
    </form>
    ${rows}
  `;

  sendHtml(res, layout({ title: 'Schedule', activePath: '/schedule', body, flash, wide: true }));
}

async function handleScheduleUpdate(req, res) {
  const form = await readFormBody(req);
  const status = STATUSES.includes(form.status) ? form.status : 'not_started';
  await store.update('schedule_stages', Number(form.stage_id), {
    planned_start: form.planned_start || null,
    planned_end: form.planned_end || null,
    actual_start: form.actual_start || null,
    actual_end: form.actual_end || null,
    status,
    notes: form.notes || null,
  });
  redirect(res, '/schedule?flash=' + encodeURIComponent('Schedule updated.'));
}

async function handleScheduleCascade(req, res) {
  const form = await readFormBody(req);
  const days = Math.max(1, parseInt(form.days, 10) || 7);
  let cursor = form.start_date || todayIso();
  const stages = await store.listAll('schedule_stages', { orderBy: 'sort_order' });
  for (const stage of stages) {
    const start = cursor;
    const end = addDaysIso(start, days - 1);
    await store.update('schedule_stages', stage.id, { planned_start: start, planned_end: end });
    cursor = addDaysIso(end, 1);
  }
  redirect(res, '/schedule?flash=' + encodeURIComponent('Planned dates cascaded finish-to-start.'));
}

module.exports = { handleSchedulePage, handleScheduleUpdate, handleScheduleCascade };
