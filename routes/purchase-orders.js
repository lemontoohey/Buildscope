// Purchase orders — turn a set of Materials/BOQ lines into a formal
// document to send a supplier (Buildxact's PO/work-order concept). A PO
// snapshots each line's description/qty/unit/cost at creation time, so
// editing the BOQ later doesn't silently rewrite a PO already sent out.

const { store } = require('../lib/store');
const { layout } = require('../lib/layout');
const { escapeHtml, centsToDisplay, todayIso } = require('../lib/render');
const { readFormBody, redirect, notFound } = require('../lib/http');
const { BUTTON_CLASSES } = require('../lib/theme');
const { recordConfirmedPoAsPriceHistory } = require('../lib/price-history');

const STATUSES = ['draft', 'sent', 'confirmed'];
const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', confirmed: 'Confirmed' };
const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
};

async function lineTotal(lines) {
  return lines.reduce((sum, l) => sum + (l.unit_cost_cents || 0) * (l.quantity || 0), 0);
}

async function handlePurchaseOrdersPage(req, res, { sendHtml }, flash) {
  const [orders, allLines] = await Promise.all([
    store.listAll('purchase_orders', { orderBy: 'id desc' }),
    store.listAll('purchase_order_lines'),
  ]);
  const linesByPo = {};
  for (const l of allLines) (linesByPo[l.purchase_order_id] ||= []).push(l);

  const rows = orders
    .map((po) => {
      const lines = linesByPo[po.id] || [];
      const total = lines.reduce((sum, l) => sum + (l.unit_cost_cents || 0) * (l.quantity || 0), 0);
      return `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4"><a class="text-blue-700 hover:underline" href="/purchase-orders/${po.id}">PO-${String(po.id).padStart(4, '0')}</a></td>
        <td class="py-2 pr-4">${escapeHtml(po.supplier)}</td>
        <td class="py-2 pr-4">${lines.length} line${lines.length === 1 ? '' : 's'}</td>
        <td class="py-2 pr-4">${centsToDisplay(total)}</td>
        <td class="py-2 pr-4"><span class="text-xs px-2 py-0.5 rounded ${STATUS_COLORS[po.status]}">${STATUS_LABELS[po.status]}</span></td>
        <td class="py-2 pr-4 text-xs text-slate-500">${escapeHtml((po.created_at || '').slice(0, 10))}</td>
      </tr>`;
    })
    .join('\n');

  const body = `
    <h1 class="text-2xl font-bold mb-2">Purchase orders</h1>
    <p class="text-sm text-slate-600 mb-6 max-w-2xl">Formal orders built from your Materials lines — create one from the Materials page by ticking the items to send to a supplier.</p>
    <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-slate-500 border-b border-slate-200">
          <th class="py-2 pr-4 font-medium">PO</th><th class="py-2 pr-4 font-medium">Supplier</th>
          <th class="py-2 pr-4 font-medium">Lines</th><th class="py-2 pr-4 font-medium">Total</th>
          <th class="py-2 pr-4 font-medium">Status</th><th class="py-2 pr-4 font-medium">Created</th>
        </tr></thead>
        <tbody>${rows || '<tr><td class="py-3 text-slate-500" colspan="6">No purchase orders yet — create one from Materials.</td></tr>'}</tbody>
      </table>
    </div>
  `;
  sendHtml(res, layout({ title: 'Purchase orders', activePath: '/purchase-orders', body, flash }));
}

async function handlePurchaseOrderCreate(req, res) {
  const form = await readFormBody(req);
  const itemIds = [].concat(form.item_ids || []).filter(Boolean);
  if (!itemIds.length || !form.supplier) {
    return redirect(res, '/materials?flash=' + encodeURIComponent('Pick a supplier and at least one item first.'));
  }
  const po = await store.insert('purchase_orders', {
    supplier: form.supplier,
    status: 'draft',
    notes: form.notes || null,
    signature_id: null,
    created_at: new Date().toISOString(),
  });
  const allItems = await store.listAll('boq_items');
  let order = 0;
  for (const idStr of itemIds) {
    const item = allItems.find((b) => String(b.id) === String(idStr));
    if (!item) continue;
    await store.insert('purchase_order_lines', {
      purchase_order_id: po.id,
      boq_item_id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost_cents: item.unit_cost_cents,
      sort_order: order++,
    });
  }
  redirect(res, `/purchase-orders/${po.id}?flash=` + encodeURIComponent('Purchase order created.'));
}

async function loadPo(id) {
  const po = await store.getById('purchase_orders', Number(id));
  if (!po) return null;
  const lines = (await store.getWhere('purchase_order_lines', { purchase_order_id: po.id })).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const signature = po.signature_id ? await store.getById('signatures', po.signature_id) : null;
  return { po, lines, signature };
}

async function handlePurchaseOrderDetail(req, res, { sendHtml }, id, flash) {
  const loaded = await loadPo(id);
  if (!loaded) return sendHtml(res, layout({ title: 'Purchase order', activePath: '/purchase-orders', body: '<p>Not found.</p>' }));
  const { po, lines, signature } = loaded;
  const total = await lineTotal(lines);

  const lineRows = lines
    .map(
      (l) => `<tr class="border-b border-slate-100">
        <td class="py-2 pr-4">${escapeHtml(l.description)}</td>
        <td class="py-2 pr-4">${l.quantity ?? '—'} ${escapeHtml(l.unit || '')}</td>
        <td class="py-2 pr-4">${l.unit_cost_cents != null ? centsToDisplay(l.unit_cost_cents) : '—'}</td>
        <td class="py-2 pr-4">${l.unit_cost_cents != null && l.quantity != null ? centsToDisplay(l.unit_cost_cents * l.quantity) : '—'}</td>
      </tr>`
    )
    .join('\n');

  const statusOptions = STATUSES.map((s) => `<option value="${s}" ${s === po.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('');

  const body = `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">PO-${String(po.id).padStart(4, '0')}</h1>
      <a href="/purchase-orders/${po.id}/print" target="_blank" class="text-sm rounded border border-slate-300 px-3 py-1.5 bg-white">Print / Save as PDF</a>
    </div>
    <div class="bg-white rounded-lg border border-slate-200 p-5 mb-6 max-w-xl">
      <div class="grid grid-cols-2 gap-4 mb-2">
        <div><span class="text-xs text-slate-500">Supplier</span><div class="text-sm font-medium">${escapeHtml(po.supplier)}</div></div>
        <div>
          <span class="text-xs text-slate-500">Status</span>
          <form method="post" action="/purchase-orders/${po.id}/status" data-offline-queue="PO status">
            <select name="status" onchange="this.form.requestSubmit()" class="text-sm rounded border border-slate-300 px-2 py-1 ${STATUS_COLORS[po.status]}">${statusOptions}</select>
          </form>
        </div>
      </div>
      ${po.notes ? `<div class="text-sm text-slate-600 mt-2">${escapeHtml(po.notes)}</div>` : ''}
    </div>
    <div class="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto max-w-3xl">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-slate-500 border-b border-slate-200">
          <th class="py-2 pr-4 font-medium">Item</th><th class="py-2 pr-4 font-medium">Qty</th>
          <th class="py-2 pr-4 font-medium">Unit cost</th><th class="py-2 pr-4 font-medium">Line total</th>
        </tr></thead>
        <tbody>${lineRows}</tbody>
        <tfoot><tr><td colspan="3" class="py-2 pr-4 text-right font-medium">Total</td><td class="py-2 pr-4 font-medium">${centsToDisplay(total)}</td></tr></tfoot>
      </table>
    </div>

    <div class="bg-white rounded-lg border border-slate-200 p-4 mt-6 max-w-xl">
      <h2 class="font-semibold text-sm mb-3">Signature</h2>
      ${
        signature
          ? `<img src="${signature.image_data}" alt="Signature" class="border border-slate-200 rounded bg-white h-24" />
             <div class="text-xs text-slate-500 mt-1">Signed by ${escapeHtml(signature.signer_name)} on ${escapeHtml((signature.signed_at || '').slice(0, 10))}</div>`
          : `<div id="signaturePad">
               <canvas id="sigCanvas" width="480" height="140" class="border border-slate-300 rounded bg-white touch-none w-full max-w-md" style="cursor:crosshair;"></canvas>
               <div class="flex flex-wrap items-center gap-2 mt-2">
                 <input type="text" id="signerNameInput" placeholder="Signer's name" class="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                 <button type="button" id="sigClearBtn" class="text-xs rounded border border-slate-300 px-3 py-1.5 bg-white hover:border-slate-400">Clear</button>
                 <button type="button" id="sigSaveBtn" class="${BUTTON_CLASSES} px-3 py-1.5 rounded text-xs">Save signature</button>
                 <span id="sigStatus" class="text-xs text-slate-600"></span>
               </div>
             </div>
             <script>
               (function () {
                 var canvas = document.getElementById('sigCanvas');
                 var ctx = canvas.getContext('2d');
                 ctx.lineWidth = 2;
                 ctx.lineCap = 'round';
                 ctx.strokeStyle = '#1e293b';
                 var drawing = false;
                 var hasDrawn = false;

                 function pos(evt) {
                   var rect = canvas.getBoundingClientRect();
                   var scaleX = canvas.width / rect.width;
                   var scaleY = canvas.height / rect.height;
                   var point = evt.touches ? evt.touches[0] : evt;
                   return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
                 }
                 function start(evt) {
                   evt.preventDefault();
                   drawing = true;
                   hasDrawn = true;
                   var p = pos(evt);
                   ctx.beginPath();
                   ctx.moveTo(p.x, p.y);
                 }
                 function move(evt) {
                   if (!drawing) return;
                   evt.preventDefault();
                   var p = pos(evt);
                   ctx.lineTo(p.x, p.y);
                   ctx.stroke();
                 }
                 function end() { drawing = false; }

                 canvas.addEventListener('mousedown', start);
                 canvas.addEventListener('mousemove', move);
                 window.addEventListener('mouseup', end);
                 canvas.addEventListener('touchstart', start, { passive: false });
                 canvas.addEventListener('touchmove', move, { passive: false });
                 canvas.addEventListener('touchend', end);

                 document.getElementById('sigClearBtn').addEventListener('click', function () {
                   ctx.clearRect(0, 0, canvas.width, canvas.height);
                   hasDrawn = false;
                 });

                 document.getElementById('sigSaveBtn').addEventListener('click', function () {
                   var status = document.getElementById('sigStatus');
                   var name = document.getElementById('signerNameInput').value.trim();
                   if (!name) { status.textContent = 'Enter the signer\'s name first.'; return; }
                   if (!hasDrawn) { status.textContent = 'Draw a signature first.'; return; }
                   status.textContent = 'Saving…';
                   fetch('/api/signatures', {
                     method: 'POST',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify({
                       signer_name: name,
                       image_data: canvas.toDataURL('image/png'),
                       linked_type: 'purchase_order',
                       linked_id: ${po.id},
                     }),
                   })
                     .then(function (r) { return r.json(); })
                     .then(function (data) {
                       if (data.ok) { window.location.reload(); }
                       else { status.textContent = data.error || 'Could not save the signature.'; }
                     })
                     .catch(function () { status.textContent = 'Could not save the signature.'; });
                 });
               })();
             </script>`
      }
    </div>
  `;
  sendHtml(res, layout({ title: `PO-${String(po.id).padStart(4, '0')}`, activePath: '/purchase-orders', body, flash }));
}

async function handlePurchaseOrderStatus(req, res, helpers, id) {
  const form = await readFormBody(req);
  if (STATUSES.includes(form.status)) {
    await store.update('purchase_orders', Number(id), { status: form.status });
  }
  if (form.status === 'confirmed') {
    // Bank this PO's real prices into the Price Book as this build's own
    // history — but only once, even if the status gets flipped back and
    // forth later.
    const po = await store.getById('purchase_orders', Number(id));
    if (po && !po.price_history_recorded) {
      const lines = await store.getWhere('purchase_order_lines', { purchase_order_id: po.id });
      await recordConfirmedPoAsPriceHistory(po, lines);
      await store.update('purchase_orders', po.id, { price_history_recorded: 1 });
    }
  }
  redirect(res, `/purchase-orders/${id}`);
}

async function handlePurchaseOrderPrint(req, res, id) {
  const loaded = await loadPo(id);
  if (!loaded) return notFound(res);
  const { po, lines, signature } = loaded;
  const total = await lineTotal(lines);
  const lineRows = lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${escapeHtml(l.description)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${l.quantity ?? ''} ${escapeHtml(l.unit || '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${l.unit_cost_cents != null ? centsToDisplay(l.unit_cost_cents) : ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;">${l.unit_cost_cents != null && l.quantity != null ? centsToDisplay(l.unit_cost_cents * l.quantity) : ''}</td>
      </tr>`
    )
    .join('\n');

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8" />
    <title>PO-${String(po.id).padStart(4, '0')}</title>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; color: #222; max-width: 700px; margin: 40px auto; }
      h1 { font-size: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { text-align: left; padding: 6px 10px; border-bottom: 2px solid #222; }
      @media print { a.no-print { display: none; } }
    </style></head>
    <body>
      <a href="#" class="no-print" onclick="window.print();return false;">Print</a>
      <h1>Purchase Order PO-${String(po.id).padStart(4, '0')}</h1>
      <p><strong>Supplier:</strong> ${escapeHtml(po.supplier)}<br/>
      <strong>Date:</strong> ${escapeHtml((po.created_at || '').slice(0, 10))}<br/>
      <strong>Status:</strong> ${STATUS_LABELS[po.status]}</p>
      ${po.notes ? `<p>${escapeHtml(po.notes)}</p>` : ''}
      <table><thead><tr><th>Item</th><th>Qty</th><th>Unit cost</th><th>Line total</th></tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr><td colspan="3" style="text-align:right;padding:6px 10px;font-weight:bold;">Total</td><td style="padding:6px 10px;font-weight:bold;">${centsToDisplay(total)}</td></tr></tfoot></table>
      ${
        signature
          ? `<div style="margin-top:32px;"><img src="${signature.image_data}" alt="Signature" style="height:80px;border-bottom:1px solid #222;" /><p style="font-size:12px;color:#555;margin-top:4px;">Signed by ${escapeHtml(signature.signer_name)} on ${escapeHtml((signature.signed_at || '').slice(0, 10))}</p></div>`
          : ''
      }
      <p style="margin-top:40px;font-size:11px;color:#888;">Generated by Build Tracker — estimate only, confirm against the supplier's own quote.</p>
    </body></html>`);
}

module.exports = {
  handlePurchaseOrdersPage,
  handlePurchaseOrderCreate,
  handlePurchaseOrderDetail,
  handlePurchaseOrderStatus,
  handlePurchaseOrderPrint,
};
