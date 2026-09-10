const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, todayIso } = require('../lib/render');
const { readFormBody, redirect } = require('../lib/http');
const { isAiConfigured, structureDiaryNote } = require('../lib/ai');
const { getWeatherForDate } = require('../lib/weather');
const { BUTTON_CLASSES } = require('../lib/theme');

async function handleDiaryPage(req, res, { sendHtml }, flash) {
  const aiConfigured = await isAiConfigured();
  const allEntries = await store.listAll('diary_entries');
  const entries = [...allEntries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const entryCards = entries
    .map(
      (e) => `<div class="bg-white rounded-lg border border-slate-200 p-4 mb-3">
        <div class="flex items-center justify-between mb-1">
          <span class="font-semibold">${escapeHtml(e.entry_date)}</span>
          <span class="flex items-center gap-2">
            ${e.ai_generated ? '<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">AI-structured</span>' : ''}
            ${e.weather ? `<span class="text-xs text-slate-500">${escapeHtml(e.weather)}</span>` : ''}
          </span>
        </div>
        ${
          e.trades_present
            ? `<div class="text-sm text-slate-600 mb-1"><strong>Trades:</strong> ${escapeHtml(e.trades_present)}</div>`
            : ''
        }
        ${e.work_done ? `<div class="text-sm mb-1">${escapeHtml(e.work_done)}</div>` : ''}
        ${
          e.issues
            ? `<div class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">⚠ ${escapeHtml(
                e.issues
              )}</div>`
            : ''
        }
        ${
          e.delay_flagged
            ? `<div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">🚩 Flagged as a possible delay — worth logging against the <a href="/schedule" class="underline">Schedule</a>.</div>`
            : ''
        }
        ${
          e.schedule_note
            ? `<div class="text-xs text-slate-500 italic mt-1">${escapeHtml(e.schedule_note)}</div>`
            : ''
        }
      </div>`
    )
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-6">Site diary</h1>

    <div class="bg-white rounded-lg border border-slate-200 p-5 max-w-lg mb-6">
      <h2 class="font-semibold mb-1">Quick note</h2>
      <p class="text-xs text-slate-500 mb-3">Talk or type a rough end-of-day note — the AI turns it into trades, work done and issues below for you to check before saving.</p>
      ${
        aiConfigured
          ? ''
          : `<div class="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
               AI is off — <a class="underline" href="/settings">add your API key on Settings</a> to use this. You can still fill the form below by hand.
             </div>`
      }
      <textarea id="quickNote" rows="3" class="w-full rounded border border-slate-300 px-3 py-2 text-sm mb-2"
        placeholder="e.g. Framer here all day, got the wall frames up on the south side. Electrician was meant to come for rough-in but no show, need to chase him."></textarea>
      <div class="flex items-center gap-2">
        <button type="button" id="micBtn" class="text-xs rounded border border-slate-300 px-3 py-1.5 bg-white hidden">🎤 Dictate</button>
        <button type="button" id="structureBtn" class="${BUTTON_CLASSES} px-3 py-1.5 rounded text-xs" ${aiConfigured ? '' : 'disabled'}>Structure with AI</button>
        <span id="structureStatus" class="text-xs text-slate-600"></span>
      </div>
    </div>

    <h2 class="text-lg font-semibold mb-3">New entry</h2>
    <form method="post" action="/diary" id="diaryForm" class="bg-white rounded-lg border border-slate-200 p-6 max-w-lg space-y-4 mb-10">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Date</label>
          <input type="date" id="entryDate" name="entry_date" value="${todayIso()}" required
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Weather</label>
          <input type="text" id="weatherInput" name="weather" placeholder="e.g. Fine, 24°C"
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <span id="weatherHint" class="text-[11px] text-slate-400"></span>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Trades on site</label>
        <input type="text" id="tradesInput" name="trades_present" placeholder="e.g. Framer, electrician rough-in"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Work done today</label>
        <textarea id="workDoneInput" name="work_done" rows="3" class="w-full rounded border border-slate-300 px-3 py-2 text-sm"></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Issues / delays (leave blank if none)</label>
        <textarea id="issuesInput" name="issues" rows="2" class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Concrete pour delayed a day — truck no-show"></textarea>
      </div>
      <div id="scheduleNoteHint" class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 hidden"></div>
      <input type="hidden" name="raw_note" id="rawNoteField" value="" />
      <input type="hidden" name="ai_generated" id="aiGeneratedField" value="0" />
      <input type="hidden" name="delay_flagged" id="delayFlaggedField" value="0" />
      <input type="hidden" name="schedule_note" id="scheduleNoteField" value="" />
      <button class="bg-[#9b1b15] transition-all duration-200 ease-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] text-white px-4 py-2 rounded text-sm hover:bg-[#7a1611]">Save entry</button>
    </form>

    <h2 class="text-lg font-semibold mb-3">History</h2>
    ${entryCards || '<p class="text-sm text-slate-500">No entries yet.</p>'}

    <script>
      (function () {
        var dateInput = document.getElementById('entryDate');
        var weatherInput = document.getElementById('weatherInput');
        var weatherHint = document.getElementById('weatherHint');

        async function fetchWeather() {
          if (weatherInput.value) return;
          var d = dateInput.value;
          if (!d) return;
          try {
            var res = await fetch('/api/diary/weather?date=' + encodeURIComponent(d));
            var data = await res.json();
            if (data.ok && data.weather) {
              weatherInput.value = data.weather;
              weatherHint.textContent = 'Auto-filled — edit if this looks wrong.';
            }
          } catch (e) {}
        }
        dateInput.addEventListener('change', fetchWeather);
        fetchWeather();

        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        var quickNote = document.getElementById('quickNote');
        var micBtn = document.getElementById('micBtn');
        if (SpeechRec && quickNote && micBtn) {
          micBtn.classList.remove('hidden');
          var recognizing = false;
          var recognizer = new SpeechRec();
          recognizer.lang = 'en-AU';
          recognizer.interimResults = false;
          recognizer.onresult = function (ev) {
            var text = ev.results[0][0].transcript;
            quickNote.value = (quickNote.value ? quickNote.value + ' ' : '') + text;
          };
          recognizer.onend = function () { recognizing = false; micBtn.textContent = '🎤 Dictate'; };
          micBtn.addEventListener('click', function () {
            if (recognizing) { recognizer.stop(); return; }
            recognizing = true;
            micBtn.textContent = '⏺ Listening…';
            recognizer.start();
          });
        }

        var structureBtn = document.getElementById('structureBtn');
        var structureStatus = document.getElementById('structureStatus');
        if (structureBtn) {
          structureBtn.addEventListener('click', async function () {
            var note = quickNote.value.trim();
            if (!note) { structureStatus.textContent = 'Write or dictate a note first.'; return; }
            structureStatus.textContent = 'Structuring…';
            structureBtn.disabled = true;
            try {
              var res = await fetch('/api/diary/structure', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ note: note }),
              });
              var data = await res.json();
              if (!data.ok) {
                structureStatus.textContent = 'Could not structure that: ' + (data.error || 'unknown error');
                return;
              }
              document.getElementById('tradesInput').value = data.trades_present || '';
              document.getElementById('workDoneInput').value = data.work_done || '';
              document.getElementById('issuesInput').value = data.issues || '';
              document.getElementById('rawNoteField').value = note;
              document.getElementById('aiGeneratedField').value = '1';
              document.getElementById('delayFlaggedField').value = data.delay_flagged ? '1' : '0';
              document.getElementById('scheduleNoteField').value = data.schedule_note || '';
              var hint = document.getElementById('scheduleNoteHint');
              if (data.schedule_note) {
                hint.textContent = data.schedule_note;
                hint.classList.remove('hidden');
              } else {
                hint.classList.add('hidden');
              }
              structureStatus.textContent = data.delay_flagged
                ? 'Structured — possible delay flagged below. Check the fields, then Save entry.'
                : 'Structured — check the fields below, then Save entry.';
            } catch (err) {
              structureStatus.textContent = 'Failed: ' + err.message;
            } finally {
              structureBtn.disabled = false;
            }
          });
        }
      })();
    </script>
  `;

  sendHtml(res, layout({ title: 'Site diary', activePath: '/diary', body, flash }));
}

async function handleDiaryCreate(req, res) {
  const form = await readFormBody(req);
  await store.insert('diary_entries', {
    entry_date: form.entry_date,
    weather: form.weather || null,
    trades_present: form.trades_present || null,
    work_done: form.work_done || null,
    issues: form.issues || null,
    raw_note: form.raw_note || null,
    ai_generated: form.ai_generated === '1',
    delay_flagged: form.delay_flagged === '1',
    schedule_note: form.schedule_note || null,
    created_at: new Date().toISOString(),
  });
  const msg = form.delay_flagged === '1' ? 'Diary entry saved — possible delay flagged.' : 'Diary entry saved.';
  redirect(res, '/diary?flash=' + encodeURIComponent(msg));
}

// --- AI diary assistant APIs (spec §4.3) ------------------------------------

async function handleDiaryStructureApi(req, res, { readJsonBody, sendJson }) {
  const { note } = await readJsonBody(req);
  try {
    const structured = await structureDiaryNote({ note });
    sendJson(res, { ok: true, ...structured });
  } catch (err) {
    sendJson(res, { ok: false, error: err.message });
  }
}

async function handleDiaryWeatherApi(req, res, { sendJson }, query) {
  const date = query.date;
  if (!date) return sendJson(res, { ok: false, error: 'Missing date.' }, 400);
  const weather = await getWeatherForDate(date);
  sendJson(res, { ok: true, weather });
}

module.exports = {
  handleDiaryPage,
  handleDiaryCreate,
  handleDiaryStructureApi,
  handleDiaryWeatherApi,
};
