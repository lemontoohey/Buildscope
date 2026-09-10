// Registers the service worker and — the actual point of this file — lets
// the site diary form keep working with no signal. Rural building sites
// have patchy reception (see the spec's own §7 note on this), and the
// diary is the one thing that has to be usable standing on site.
//
// How it works: the diary form's submit is intercepted here. If the POST
// to /diary succeeds, it behaves exactly like a normal form post (follows
// the redirect). If the network is down, the entry is stashed in
// localStorage instead, the form is cleared with an on-page confirmation,
// and a small banner tracks how many entries are waiting. Whenever the
// browser comes back online (or every 20s while the tab's open, as a
// backstop in areas with flaky rather than fully-dead reception), the
// queue is flushed automatically.
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // Offline support is a nice-to-have, not a hard requirement — if
        // registration fails (unsupported browser, blocked, etc.) the app
        // still works normally online, so fail silently.
      });
    });
  }

  var QUEUE_KEY = 'owner_build_tracker_offline_diary_queue';

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
      // localStorage full or unavailable — nothing more we can do here.
    }
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
    var label = queue.length + ' diary entr' + (queue.length === 1 ? 'y' : 'ies') + ' saved on this device — will send once you’re back online.';
    existing.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = label;
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
        return fetch('/diary', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
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

  function queueEntry(body) {
    var queue = readQueue();
    queue.push({ body: body, savedAt: new Date().toISOString() });
    writeQueue(queue);
    renderBanner();
  }

  function wireDiaryForm() {
    var form = document.getElementById('diaryForm');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      // Always go through fetch so a network failure can be caught and
      // turned into an offline save, instead of the browser just showing
      // its own dead-end "no internet" page over the note someone typed.
      event.preventDefault();
      var body = new URLSearchParams(new FormData(form)).toString();
      fetch('/diary', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body,
      })
        .then(function (res) {
          if (res.redirected) {
            window.location.href = res.url;
          } else if (res.ok) {
            window.location.href = '/diary?flash=' + encodeURIComponent('Diary entry saved.');
          } else {
            throw new Error('save failed');
          }
        })
        .catch(function () {
          queueEntry(body);
          form.reset();
          var dateField = document.getElementById('entryDate');
          if (dateField) dateField.valueAsDate = new Date();
          var status = document.createElement('div');
          status.textContent = 'No connection — saved on this device and queued to send.';
          status.style.cssText = 'margin-top:8px;font-size:13px;color:#9b1b15;';
          form.appendChild(status);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireDiaryForm();
    renderBanner();
  });
  window.addEventListener('online', flushQueue);
  setInterval(flushQueue, 20000);
})();
