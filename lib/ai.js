// AI receipt parsing — provider-agnostic. Whoever runs this build (you or
// your friend) picks a provider and pastes their own API key on the
// Settings page; nothing is hardcoded to one AI account. Both providers are
// called over plain fetch (built into Node 22+) — no SDK to install.
//
// This never writes to the database itself — it only extracts a best-guess
// structure from a receipt image/PDF page. A human still has to confirm it
// on the "Add receipt" screen before it becomes a real transaction.

const { getBackendConfig, saveBackendConfig } = require('./config');

const PROVIDERS = ['anthropic', 'openai'];

// Stored locally (data/backend-config.json) rather than in the pluggable
// data backend — this is a per-machine credential, like which Google
// account is connected, so it has to keep working even while someone's
// mid-way through switching or connecting a data backend.
async function getAiConfig() {
  const cfg = getBackendConfig();
  const provider = cfg.ai_provider || process.env.AI_PROVIDER || 'anthropic';
  const key =
    cfg.ai_api_key ||
    (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) ||
    null;
  return { provider: PROVIDERS.includes(provider) ? provider : 'anthropic', key };
}

async function saveAiConfig({ provider, key }) {
  const update = {};
  if (PROVIDERS.includes(provider)) update.ai_provider = provider;
  if (key) update.ai_api_key = key;
  if (Object.keys(update).length) saveBackendConfig(update);
}

async function isAiConfigured() {
  const { key } = await getAiConfig();
  return Boolean(key);
}

function receiptFields(categoryNames) {
  return {
    supplier: { type: 'string', description: 'Business name on the receipt.' },
    date: { type: 'string', description: 'Receipt date in YYYY-MM-DD format, if legible.' },
    total_amount: { type: 'number', description: 'Total amount paid, in dollars (e.g. 452.30).' },
    gst_amount: {
      type: 'number',
      description: 'GST component in dollars, if shown or calculable. 0 if not applicable.',
    },
    line_items: {
      type: 'array',
      description: 'Individual line items on the receipt.',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, amount: { type: 'number' } },
        required: ['description', 'amount'],
      },
    },
    suggested_category: {
      type: 'string',
      description: `Best-guess budget category for this receipt, chosen from exactly this list: ${categoryNames.join(
        ', '
      )}. Use "Uncategorised" only if nothing fits.`,
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident you are in this extraction overall.',
    },
  };
}

const RECEIPT_PROMPT =
  'This is a photo or scan of a building-materials receipt or invoice for a house build. ' +
  'Extract the details into the record_receipt tool/function. If a figure is not legible, leave it out ' +
  "rather than guessing a specific number. Flag your overall confidence honestly — this is a " +
  'construction site owner-builder tool, not a source of truth, so under-confidence is safer than over-confidence.';

async function callAnthropic({ apiKey, base64, mediaType, categoryNames }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const tool = {
    name: 'record_receipt',
    description: 'Records the structured details extracted from a photographed or scanned receipt/invoice.',
    input_schema: {
      type: 'object',
      properties: receiptFields(categoryNames),
      required: ['total_amount', 'suggested_category', 'confidence'],
    },
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'record_receipt' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: RECEIPT_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a structured extraction for this receipt.');
  return toolUse.input;
}

async function callOpenAi({ apiKey, base64, mediaType, categoryNames }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const tool = {
    type: 'function',
    function: {
      name: 'record_receipt',
      description: 'Records the structured details extracted from a photographed or scanned receipt/invoice.',
      parameters: {
        type: 'object',
        properties: receiptFields(categoryNames),
        required: ['total_amount', 'suggested_category', 'confidence'],
      },
    },
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'record_receipt' } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: RECEIPT_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('OpenAI did not return a structured extraction for this receipt.');
  return JSON.parse(call.function.arguments);
}

async function parseReceipt({ base64, mediaType, categoryNames }) {
  const { provider, key } = await getAiConfig();
  if (!key) {
    throw new Error('No AI provider configured — add an API key on the Settings page to enable AI receipt parsing.');
  }

  if (provider === 'openai') {
    return callOpenAi({ apiKey: key, base64, mediaType, categoryNames });
  }
  return callAnthropic({ apiKey: key, base64, mediaType, categoryNames });
}


// --- AI materials takeoff from plan drawings (spec §4.2) -------------------
// Multiple page images (rendered client-side from the uploaded PDF, so no
// PDF-rasterising dependency is needed server-side) go in; a draft bill of
// quantities comes out. Every quantity is explicitly a starting estimate —
// the UI is responsible for keeping that visually loud, not this file.

function takeoffFields(categoryNames) {
  return {
    floor_area_sqm: { type: 'number', description: 'Total internal floor area in square metres, if estimable from the drawings. Omit if not visible.' },
    roof_area_sqm: { type: 'number', description: 'Total roof area in square metres, if estimable. Omit if not visible.' },
    assumptions: { type: 'string', description: 'Brief note on method/assumptions used (e.g. assumed slab depth, how floor area was summed).' },
    unusual_features: {
      type: 'array',
      description:
        'Do this pass FIRST, before drafting items below: scan every page for anything you notice that ' +
        "is NOT a standard, repeatable residential element — a curved or non-rectangular wall, an unusual " +
        'roofline or structural detail, bespoke joinery, an odd-shaped room, a one-off feature with no ' +
        "normal unit-rate equivalent. List each in plain language, even if you can't quantify it or fit it " +
        'into a budget category below. The point is to surface anything unusual rather than silently ' +
        'dropping it because it did not fit a normal line item.',
      items: { type: 'string' },
    },
    items: {
      type: 'array',
      description: 'Draft bill-of-quantities lines.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'e.g. "Window W1.01, 1200x1800 awning" or "Slab concrete N32".' },
          category: {
            type: 'string',
            description: `Best-guess budget category, chosen from exactly this list: ${categoryNames.join(', ')}.`,
          },
          quantity: { type: 'number' },
          unit: { type: 'string', description: 'e.g. m2, m3, ea, lm.' },
          source: { type: 'string', description: 'Where this came from, e.g. "Window/door schedule, page 4" or "Floor plan area x 0.15m assumed slab depth".' },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'How clearly the drawings let you read/derive this quantity — not whether the element itself is unusual (see is_novel for that).',
          },
          is_novel: {
            type: 'boolean',
            description:
              'true if this is a bespoke/non-standard element (not something you would price with a normal ' +
              "unit rate because it doesn't repeat across typical homes) — e.g. a curved feature wall, an " +
              'unusual structural member, custom joinery. false for ordinary repeatable elements (standard ' +
              'stud wall, a normal window, a typical slab area) even if you are only medium/low confidence ' +
              'about the exact quantity.',
          },
          novelty_reason: {
            type: 'string',
            description: 'One short phrase on why this is non-standard, only when is_novel is true. Empty string otherwise.',
          },
        },
        required: ['description', 'category', 'quantity', 'unit'],
      },
    },
  };
}

const TAKEOFF_PROMPT =
  'These are page images from a residential construction plan set (architectural drawings) for an ' +
  "owner-build. Draft a STARTING bill of quantities via the draft_takeoff tool/function. Work in two " +
  'passes: FIRST, scan every page for anything unusual — a curved or non-rectangular wall, an odd roofline, ' +
  'bespoke joinery, a structural detail you would not see on a standard project-home plan — and record each ' +
  'in unusual_features even if you cannot quantify it or fit it into a normal item below (this pass matters: ' +
  'a generic takeoff tool tends to silently drop whatever does not match a standard element, which is ' +
  'exactly the failure mode this list exists to avoid). SECOND, draft the items: total internal floor area ' +
  'and total roof area in m2 if the drawings let you estimate them (state your method in assumptions); a ' +
  'full glazing/joinery list — every window and door tagged on a window/door schedule (codes like W1.01, ' +
  'D01) with its size/type; and rough quantities for big-ticket categories where the drawings support it ' +
  '(concrete volume for slab/footings as area x an assumed depth — state the assumed depth in assumptions; ' +
  'roof sheeting area; insulation area). For every item, set is_novel true if it is a bespoke one-off rather ' +
  'than something a normal unit rate would price correctly — this is a different judgement from confidence ' +
  '(confidence is about how clearly you could read the drawing; is_novel is about whether a standard rate ' +
  'even applies). This is a starting checklist for an owner-builder to confirm against a real quote or ' +
  "quantity surveyor, not a substitute for one — if you can't make out a schedule or measurement, omit it " +
  'rather than inventing a number. Under-confidence is safer than over-confidence, and flagging something as ' +
  'novel is safer than pricing it like a routine item.';

async function callAnthropicTakeoff({ apiKey, pages, categoryNames }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const tool = {
    name: 'draft_takeoff',
    description: 'Records a draft bill of quantities read from plan drawing page images.',
    input_schema: { type: 'object', properties: takeoffFields(categoryNames), required: ['items'] },
  };
  const imageBlocks = pages.map((p) => ({
    type: 'image',
    source: { type: 'base64', media_type: p.mediaType || 'image/png', data: p.base64 },
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'draft_takeoff' },
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: TAKEOFF_PROMPT }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a structured takeoff for these pages.');
  return toolUse.input;
}

async function callOpenAiTakeoff({ apiKey, pages, categoryNames }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const tool = {
    type: 'function',
    function: {
      name: 'draft_takeoff',
      description: 'Records a draft bill of quantities read from plan drawing page images.',
      parameters: { type: 'object', properties: takeoffFields(categoryNames), required: ['items'] },
    },
  };
  const imageParts = pages.map((p) => ({
    type: 'image_url',
    image_url: { url: `data:${p.mediaType || 'image/png'};base64,${p.base64}` },
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'draft_takeoff' } },
      messages: [{ role: 'user', content: [{ type: 'text', text: TAKEOFF_PROMPT }, ...imageParts] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('OpenAI did not return a structured takeoff for these pages.');
  return JSON.parse(call.function.arguments);
}

async function draftTakeoff({ pages, categoryNames }) {
  const { provider, key } = await getAiConfig();
  if (!key) {
    throw new Error('No AI provider configured — add an API key on the Settings page to enable AI plan takeoff.');
  }
  if (!pages || !pages.length) {
    throw new Error('No pages selected.');
  }
  if (provider === 'openai') return callOpenAiTakeoff({ apiKey: key, pages, categoryNames });
  return callAnthropicTakeoff({ apiKey: key, pages, categoryNames });
}

// --- AI diary structuring (spec §4.3) --------------------------------------
// Text-only — no image. Turns a rough end-of-day note into a structured
// diary entry, explicitly flagging delays rather than burying them in prose.

function diaryFields() {
  return {
    trades_present: { type: 'string', description: 'Comma-separated trades/people on site, if mentioned. Empty string if none mentioned.' },
    work_done: { type: 'string', description: 'A tidied-up (not embellished) account of what work happened, in the note\'s own words where possible.' },
    issues: { type: 'string', description: 'Any issues/delays/problems mentioned. Empty string if none.' },
    delay_flagged: {
      type: 'boolean',
      description: 'true if the note describes a delay, a trade not showing up, damaged/missing material, a failed inspection, or "waiting on" something.',
    },
    schedule_note: {
      type: 'string',
      description: 'If the note implies a build stage started or finished, a short suggestion like "Sounds like Roof may be done - check and update Schedule." Empty string otherwise.',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  };
}

const DIARY_PROMPT =
  "This is a rough end-of-day site note from an owner-builder's residential construction diary — typed " +
  'quickly or dictated, so it may be terse or run-on. Turn it into a structured entry via the ' +
  'structure_diary_entry tool/function. Stay close to what was actually said; you are structuring, not ' +
  'embellishing or inventing detail. Flag delay_flagged honestly — this matters if there is ever a dispute ' +
  'with a builder or trade, so under-flagging is worse than over-flagging.';

async function callAnthropicDiary({ apiKey, note }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const tool = {
    name: 'structure_diary_entry',
    description: 'Records a structured site diary entry extracted from a rough note.',
    input_schema: { type: 'object', properties: diaryFields(), required: ['work_done', 'delay_flagged', 'confidence'] },
  };
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'structure_diary_entry' },
      messages: [{ role: 'user', content: `${DIARY_PROMPT}\n\nNote:\n${note}` }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a structured diary entry for this note.');
  return toolUse.input;
}

async function callOpenAiDiary({ apiKey, note }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const tool = {
    type: 'function',
    function: {
      name: 'structure_diary_entry',
      description: 'Records a structured site diary entry extracted from a rough note.',
      parameters: { type: 'object', properties: diaryFields(), required: ['work_done', 'delay_flagged', 'confidence'] },
    },
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'structure_diary_entry' } },
      messages: [{ role: 'user', content: `${DIARY_PROMPT}\n\nNote:\n${note}` }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('OpenAI did not return a structured diary entry for this note.');
  return JSON.parse(call.function.arguments);
}

async function structureDiaryNote({ note }) {
  const { provider, key } = await getAiConfig();
  if (!key) {
    throw new Error('No AI provider configured — add an API key on the Settings page to enable the diary assistant.');
  }
  if (!note || !note.trim()) {
    throw new Error('Write a quick note first.');
  }
  if (provider === 'openai') return callOpenAiDiary({ apiKey: key, note });
  return callAnthropicDiary({ apiKey: key, note });
}


// --- AI estimate reviewer (Buildxact "Blu"-style cross-check) --------------
// No new inputs — reads the Budget/Materials/Compliance data that already
// exists and flags likely gaps (a compliance obligation with nothing
// costed against it, a category with budget but no BOQ lines, etc). Text
// only, cheap to run, and explicitly a second pair of eyes — never edits
// anything itself.

function reviewFields() {
  return {
    findings: {
      type: 'array',
      description: 'Likely gaps or things worth double-checking, most important first.',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string', description: 'The budget category this concerns, if any.' },
          finding: { type: 'string', description: 'What looks off, in one sentence.' },
          suggestion: { type: 'string', description: 'What to check or do about it, in one sentence.' },
        },
        required: ['severity', 'finding'],
      },
    },
  };
}

const REVIEW_PROMPT =
  'You are cross-checking a residential owner-build\'s budget, materials list and compliance checklist ' +
  'against each other for gaps — the kind of thing a second pair of eyes would catch before something gets ' +
  'forgotten. Look for: a compliance item that is still pending but has no linked materials/budget spend at ' +
  'all in a plausibly related category; a budget category with money allocated but zero materials lines ' +
  'itemised yet; a category most owner-builds need that has no budget line at all; anything that looks like ' +
  'a placeholder or an obviously round/default number nobody has actually checked. Also specifically look ' +
  'for the "generic rate on a custom job" trap: a materials line whose description sounds bespoke or ' +
  'one-off (curved, custom, feature, bespoke, non-standard, or an unusual shape/size) priced at a suspiciously ' +
  'round number, or a category that reads as if a blended $/m2-style rate was applied rather than a real, ' +
  'itemised quote — flag these explicitly as "this looks like a generic rate on what may be a bespoke item — ' +
  'get an actual quote before relying on this number". Do NOT flag things that are simply early / not ' +
  'started yet in a normal way — only flag things that look genuinely overlooked or genuinely suspect. Be ' +
  'specific and brief. If nothing looks concerning, return an empty findings array rather than inventing ' +
  'something to say.';

function summariseForReview({ categories, boqItems, complianceItems }) {
  const boqByCategory = {};
  for (const b of boqItems) (boqByCategory[b.category_id] ||= []).push(b);

  const categoryLines = categories
    .map((c) => {
      const items = boqByCategory[c.id] || [];
      return `- ${c.name}: budgeted $${(c.budgeted_cents / 100).toFixed(0)}, ${items.length} materials line(s)${
        items.length ? ' (' + items.map((i) => i.description).slice(0, 5).join('; ') + ')' : ''
      }`;
    })
    .join('\n');

  const complianceLines = complianceItems
    .map((i) => `- [${i.regime}] ${i.item} — ${i.status}`)
    .join('\n');

  return `BUDGET CATEGORIES AND MATERIALS LINES:\n${categoryLines}\n\nCOMPLIANCE CHECKLIST:\n${complianceLines}`;
}

async function callAnthropicReview({ apiKey, summary }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const tool = {
    name: 'review_estimate',
    description: 'Records cross-check findings between budget, materials and compliance data.',
    input_schema: { type: 'object', properties: reviewFields(), required: ['findings'] },
  };
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'review_estimate' },
      messages: [{ role: 'user', content: `${REVIEW_PROMPT}\n\n${summary}` }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a structured review.');
  return toolUse.input;
}

async function callOpenAiReview({ apiKey, summary }) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const tool = {
    type: 'function',
    function: {
      name: 'review_estimate',
      description: 'Records cross-check findings between budget, materials and compliance data.',
      parameters: { type: 'object', properties: reviewFields(), required: ['findings'] },
    },
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'review_estimate' } },
      messages: [{ role: 'user', content: `${REVIEW_PROMPT}\n\n${summary}` }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('OpenAI did not return a structured review.');
  return JSON.parse(call.function.arguments);
}

async function reviewEstimate({ categories, boqItems, complianceItems }) {
  const { provider, key } = await getAiConfig();
  if (!key) {
    throw new Error('No AI provider configured — add an API key on the Settings page to run the AI check.');
  }
  const summary = summariseForReview({ categories, boqItems, complianceItems });
  if (provider === 'openai') return callOpenAiReview({ apiKey: key, summary });
  return callAnthropicReview({ apiKey: key, summary });
}

module.exports = {
  parseReceipt,
  isAiConfigured,
  getAiConfig,
  saveAiConfig,
  PROVIDERS,
  draftTakeoff,
  structureDiaryNote,
  reviewEstimate,
};
