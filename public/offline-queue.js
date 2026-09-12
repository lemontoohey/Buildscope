// Registers the service worker, and generalises what used to be a
// diary-only trick to every form on the site that opts in via
// data-offline-queue="<friendly label>".
//
// How it works: a marked form's submit is intercepted here. If the POST
// succeeds (server responds, redirect followed), it behaves exactly like a
// normal form post. If the network is down, the request (URL, method, body)
// is stashed in localStorage instead, the form is reset with an on-page
// confirmation, and a shared banner at the bottom of the screen tracks how
// many submissions are waiting across every page. Whenever the browser
// comes back online (or every 20s while the tab's open, as a backstop in
// areas with flaky rather than fully-dead reception), the queue is flushed
// automatically, in the order things were saved.
//
// This deliberately mirrors the very first version of this file, which did
// exactly this for the site diary alone -- rural building sites have patchy
// reception, and losing what someone just typed to the browser's own dead
// -end "no internet" page is the thing this exists to prevent, everywhere
// in the app that a person adds or updates something on site, not just the
// diary.
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // Offline support is a nice-to-have, not a hard requirement -- if
        // registration fails (unsupported browser, blocked, etc.) the app
        // still works normally online, so fail silently.
      });
    });
  }

  var QUEUE_KEY = 'owner_build_tracker_offline_queue';

  function readQueue() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      // localStorage full or unavailable -- nothing more we can do here.
    }
  }

  function labelCounts(queue) {
    var counts = {};
    queue.forEach(function (entry) {
      var label = entry.label || 'item';
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  }

  function summarise(queue) {
    if (queue.length === 0) return '';
    var counts = labelCounts(queue);
    var labels = Object.keys(counts);
    if (labels.length === 1) {
      var n = counts[labels[0]];
      return n + ' ' + labels[0] + (n === 1 ? '' : 's') + ' saved on this device — will send once you’re back online.';
    }
    return queue.length + ' items saved on this device (' + labels.join(', ') + ') — will send once you’re back online.';
  }

  function renderBanner() {
    var queue = readQueue();
    var existing = document.getElementById('offlineQueueBanner');
    if (queue.length === 0) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'offlineQueueBanner';
      existing.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#4f6070;color:#fff;' +
        'font:13px system-ui,sans-serif;padding:10px 16px;display:flex;align-items:center;' +
        'justify-content:space-between;gap:12px;box-shadow:0 -2px 8px rgba(0,0,0,0.15);';
      document.body.appendChild(existing);
    }
    existing.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = summarise(queue);
    var btn = document.createElement('button');
    btn.textContent = 'Retry now';
    btn.style.cssText = 'background:#fff;color:#4f6070;border:none;border-radius:4px;padding:4px 10px;font:inherit;cursor:pointer;flex-shrink:0;';
    btn.addEventListener('click', flushQueue);
    existing.appendChild(span);
    existing.appendChild(btn);
  }

  function flushQueue() {
    var queue = readQueue();
    if (queue.length === 0) return;
    var remaining = [];
    var chain = Promise.resolve();
    queue.forEach(function (entry) {
      chain = chain.then(function () {
        return fetch(entry.url, {
          method: entry.method || 'POST',
          headers: { 'content-type': entry.contentType || 'application/x-www-form-urlencoded' },
          body: entry.body,
        })
          .then(function (res) {
            if (!res.ok && res.status !== 0) remaining.push(entry);
          })
          .catch(function () {
            remaining.push(entry);
          });
      });
    });
    chain.then(function () {
      writeQueue(remaining);
      renderBanner();
    });
  }

  function queueEntry(entry) {
    var queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
    renderBanner();
  }

  function showInlineNote(form, text) {
    var existing = form.querySelector('[data-offline-note]');
    if (existing) existing.remove();
    var note = document.createElement('div');
    note.setAttribute('data-offline-note', '');
    note.textContent = text;
    note.style.cssText = 'margin-top:8px;font-size:13px;color:#9b1b15;';
    form.appendChild(note);
    setTimeout(function () {
      if (note.parentNode) note.remove();
    }, 8000);
  }

  function wireForm(form) {
    var label = form.getAttribute('data-offline-queue') || 'item';
    var resetForm = form.hasAttribute('data-offline-reset');
    var dateField = form.getAttribute('data-offline-date-field');

    form.addEventListener('submit', function (event) {
      // Always go through fetch so a network failure can be caught and
      // turned into an offline save, instead of the browser just showing
      // its own dead-end "no internet" page over what someone just filled in.
      event.preventDefault();
      var url = form.getAttribute('action') || window.location.pathname;
      var method = (form.getAttribute('method') || 'POST').toUpperCase();
      var body = new URLSearchParams(new FormData(form)).toString();

      fetch(url, {
        method: method,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body,
      })
        .then(function (res) {
          if (res.redirected) {
            window.location.href = res.url;
          } else if (res.ok) {
            window.location.reload();
          } else {
            throw new Error('save failed');
          }
        })
        .catch(function () {
          queueEntry({
            id: Date.now() + '-' + Math.random().toString(36).slice(2),
            url: url,
            method: method,
            body: body,
            contentType: 'application/x-www-form-urlencoded',
            label: label,
            savedAt: new Date().toISOString(),
          });
          if (resetForm) {
            form.reset();
            if (dateField) {
              var field = document.getElementById(dateField);
              if (field) field.valueAsDate = new Date();
            }
          }
          showInlineNote(form, 'No connection — saved on this device and queued to send.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
  }

  function wireAllForms() {
    document.querySelectorAll('form[data-offline-queue]').forEach(wireForm);
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireAllForms();
    renderBanner();
  });
  window.addEventListener('online', flushQueue);
  setInterval(flushQueue, 20000);
})();
