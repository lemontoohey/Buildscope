// Import a quote: pick a file (PDF or image), render its pages to images
// client-side (pdf.js, same trick as the Plan Measure AI takeoff), send
// them to the AI to read, then let the person check/edit every line
// before anything is saved to Materials.
(function () {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var boot = window.QUOTE_IMPORT_BOOT;
  var fileInput = document.getElementById('quoteFileInput');
  var pagesPanel = document.getElementById('quotePagesPanel');
  var runBtn = document.getElementById('quoteRunBtn');
  var statusEl = document.getElementById('quoteStatus');
  var resultsEl = document.getElementById('quoteResults');
  if (!boot || !fileInput || !runBtn) return;

  var MAX_PAGES = 15;
  var pageThumbs = []; // { pageNumber, dataUrl, checked }
  var originalFile = null; // { filename, mime, base64 }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function base64ToUint8Array(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function renderThumbs() {
    if (!pageThumbs.length) {
      pagesPanel.innerHTML = '';
      return;
    }
    pagesPanel.innerHTML =
      '<p class="text-xs text-slate-500 mb-2">' + pageThumbs.length + ' page(s) found -- untick any that aren\'t priced lines (a cover page, T&Cs).</p>' +
      '<div class="flex flex-wrap gap-2">' +
      pageThumbs
        .map(function (p) {
          return (
            '<label class="block cursor-pointer border-2 rounded ' +
            (p.checked ? 'border-[#9b1b15]' : 'border-slate-200') +
            '" data-page="' + p.pageNumber + '">' +
            '<img src="' + p.dataUrl + '" class="block w-20 h-auto" />' +
            '<div class="text-[10px] text-center py-0.5 bg-slate-50">p.' + p.pageNumber + '</div>' +
            '</label>'
          );
        })
        .join('') +
      '</div>';

    Array.prototype.forEach.call(pagesPanel.querySelectorAll('[data-page]'), function (el) {
      el.addEventListener('click', function () {
        var pn = Number(el.getAttribute('data-page'));
        var thumb = pageThumbs.find(function (t) { return t.pageNumber === pn; });
        thumb.checked = !thumb.checked;
        renderThumbs();
      });
    });
  }

  async function loadFile(file) {
    statusEl.textContent = 'Loading document…';
    pageThumbs = [];
    resultsEl.innerHTML = '';
    runBtn.disabled = true;

    originalFile = { filename: file.name, mime: file.type, base64: await fileToBase64(file) };

    var mime = (file.type || '').toLowerCase();
    if (mime.includes('pdf') && window.pdfjsLib) {
      var pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(originalFile.base64) }).promise;
      var count = Math.min(pdf.numPages, MAX_PAGES);
      for (var i = 1; i <= count; i++) {
        var page = await pdf.getPage(i);
        var viewport = page.getViewport({ scale: 1.4 });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        pageThumbs.push({ pageNumber: i, dataUrl: canvas.toDataURL('image/png'), checked: true });
      }
    } else {
      pageThumbs.push({ pageNumber: 1, dataUrl: 'data:' + mime + ';base64,' + originalFile.base64, checked: true });
    }

    renderThumbs();
    statusEl.textContent = '';
    runBtn.disabled = false;
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    loadFile(file).catch(function (err) {
      statusEl.textContent = 'Could not load that file: ' + err.message;
    });
  });

  function boqOptionsHtml(selectedId) {
    var byCategory = {};
    boot.boqItems.forEach(function (item) {
      var cat = boot.categories.find(function (c) { return c.id === item.category_id; });
      var name = cat ? cat.name : 'Uncategorised';
      (byCategory[name] = byCategory[name] || []).push(item);
    });
    var html = '<option value="">— Add as a new item —</option>';
    Object.keys(byCategory).forEach(function (catName) {
      html += '<optgroup label="' + catName + '">';
      byCategory[catName].forEach(function (item) {
        html += '<option value="' + item.id + '" ' + (String(item.id) === String(selectedId) ? 'selected' : '') + '>' +
          item.description + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function categoryOptionsHtml(selectedId) {
    return boot.categories
      .map(function (c) {
        return '<option value="' + c.id + '" ' + (String(c.id) === String(selectedId) ? 'selected' : '') + '>' + c.name + '</option>';
      })
      .join('');
  }

  function renderResults(data) {
    if (!data.items || !data.items.length) {
      resultsEl.innerHTML = '<p class="text-sm text-slate-500">No priced lines found on that document.</p>';
      return;
    }

    var headerBits = [];
    if (data.supplier) headerBits.push('<strong>Supplier:</strong> ' + data.supplier);
    if (data.quote_date) headerBits.push('<strong>Date:</strong> ' + data.quote_date);
    var header = headerBits.length ? '<p class="text-sm text-slate-700 mb-3">' + headerBits.join(' &middot; ') + '</p>' : '';

    var rows = data.items
      .map(function (item, idx) {
        var flag = item.generic_rate_suspected
          ? '<div class="text-[11px] text-red-700 font-medium mt-0.5">⚠ generic rate on what may be a bespoke item' +
            (item.generic_rate_reason ? ' -- ' + item.generic_rate_reason : '') + ' -- get an actual quote</div>'
          : '';
        return (
          '<tr class="border-b border-slate-100 align-top' + (item.generic_rate_suspected ? ' bg-red-50' : '') + '" data-idx="' + idx + '">' +
          '<td class="py-1.5 pr-2"><input type="checkbox" class="qi-check" checked /></td>' +
          '<td class="py-1.5 pr-2"><input type="text" class="qi-desc text-sm w-full rounded border border-slate-300 px-1 py-0.5" value="' + (item.description || '').replace(/"/g, '&quot;') + '" />' + flag + '</td>' +
          '<td class="py-1.5 pr-2"><select class="qi-existing text-xs rounded border border-slate-300 px-1 py-0.5">' + boqOptionsHtml(item.suggested_boq_item_id) + '</select>' +
          '<div class="mt-1"><select class="qi-cat text-xs rounded border border-slate-300 px-1 py-0.5">' + categoryOptionsHtml(item.category_id) + '</select></div></td>' +
          '<td class="py-1.5 pr-2"><input type="text" class="qi-qty w-14 text-xs rounded border border-slate-300 px-1 py-0.5" value="' + (item.quantity ?? 1) + '" /></td>' +
          '<td class="py-1.5 pr-2"><input type="text" class="qi-unit w-14 text-xs rounded border border-slate-300 px-1 py-0.5" value="' + (item.unit || '') + '" /></td>' +
          '<td class="py-1.5 pr-2"><input type="text" class="qi-total w-20 text-xs rounded border border-slate-300 px-1 py-0.5" value="' + (item.line_total != null ? item.line_total : '') + '" /></td>' +
          '</tr>'
        );
      })
      .join('');

    resultsEl.innerHTML =
      '<div class="bg-white rounded-lg border border-slate-200 p-5">' +
      '<h2 class="font-semibold mb-2">Check before saving</h2>' +
      header +
      '<p class="text-xs text-slate-500 mb-3">Pick an existing Materials line to attach this price to, or leave "Add as a new item" and choose a category. Untick anything that isn\'t right.</p>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b border-slate-200">' +
      '<th class="py-1.5 pr-2"></th><th class="py-1.5 pr-2 font-medium">Line item</th>' +
      '<th class="py-1.5 pr-2 font-medium">Attach to</th><th class="py-1.5 pr-2 font-medium">Qty</th>' +
      '<th class="py-1.5 pr-2 font-medium">Unit</th><th class="py-1.5 pr-2 font-medium">Total $</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<button type="button" id="quoteConfirmBtn" class="' + runBtn.className + ' mt-4">Save checked lines to Materials</button>' +
      '<span id="quoteConfirmStatus" class="ml-3 text-sm text-slate-600"></span>' +
      '</div>';

    document.getElementById('quoteConfirmBtn').addEventListener('click', async function () {
      var confirmStatus = document.getElementById('quoteConfirmStatus');
      var trs = resultsEl.querySelectorAll('tbody tr');
      var lines = [];
      Array.prototype.forEach.call(trs, function (tr) {
        if (!tr.querySelector('.qi-check').checked) return;
        lines.push({
          description: tr.querySelector('.qi-desc').value,
          boq_item_id: tr.querySelector('.qi-existing').value,
          category_id: tr.querySelector('.qi-cat').value,
          quantity: tr.querySelector('.qi-qty').value,
          unit: tr.querySelector('.qi-unit').value,
          line_total: tr.querySelector('.qi-total').value,
        });
      });
      if (!lines.length) {
        confirmStatus.textContent = 'Nothing ticked.';
        return;
      }
      confirmStatus.textContent = 'Saving…';
      try {
        var res = await fetch('/api/materials/quote-import/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ supplier: data.supplier, quote_date: data.quote_date, lines: lines }),
        });
        var out = await res.json();
        if (out.ok) {
          window.location.href = '/materials?flash=' + encodeURIComponent(out.count + ' line(s) from this quote saved -- confirm before ordering.');
        } else {
          confirmStatus.textContent = 'Could not save: ' + (out.error || 'unknown error');
        }
      } catch (err) {
        confirmStatus.textContent = 'Failed: ' + err.message;
      }
    });
  }

  runBtn.addEventListener('click', async function () {
    var selected = pageThumbs.filter(function (t) { return t.checked; });
    if (!selected.length) {
      statusEl.textContent = 'Choose a file first.';
      return;
    }
    statusEl.textContent = 'Reading ' + selected.length + ' page(s) with AI — this can take a bit…';
    runBtn.disabled = true;
    resultsEl.innerHTML = '';
    try {
      var pages = selected.map(function (t) {
        return { base64: t.dataUrl.split(',')[1], mediaType: 'image/png' };
      });
      var res = await fetch('/api/materials/quote-import/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pages: pages, original: originalFile }),
      });
      var data = await res.json();
      if (!data.ok) {
        statusEl.textContent = 'Could not read that quote: ' + (data.error || 'unknown error');
      } else {
        statusEl.textContent = '';
        renderResults(data);
      }
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
    } finally {
      runBtn.disabled = false;
    }
  });
})();
