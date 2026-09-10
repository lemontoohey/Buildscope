// Build Tracker service worker.
//
// Goal: the app should still open (and the diary should still be usable)
// on a rural site with patchy or no reception. This is deliberately simple
// — no build step, no Workbox — two strategies only:
//
//   - GET page navigations: network first (so you always see live data
//     when you have signal), falling back to a cached copy of that same
//     page, and finally to a small offline notice if it was never cached.
//   - GET static assets (/public/*, icons, manifest): cache first, with a
//     background refetch to keep the cache warm.
//
// Anything that isn't a GET (form posts, the JSON APIs) is left completely
// alone and goes straight to the network — offline handling for writes
// (like new diary entries) is done in public/offline-queue.js instead,
// where it can be visible to the user rather than silently swallowed here.
const CACHE_NAME = 'owner-build-tracker-v1';
const APP_SHELL = [
  '/',
  '/public/offline-queue.js',
  '/public/icon-192.png',
  '/public/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/public/') || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave third-party (CDN) requests alone

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.open(CACHE_NAME).then((cache) =>
            cache.match(request).then(
              (cached) =>
                cached ||
                new Response(
                  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
                    '<body style="font-family:system-ui;padding:2rem;color:#484848"><h1>You’re offline</h1>' +
                    '<p>This page hasn’t been visited before while online, so there’s nothing saved to show. ' +
                    'Diary entries you write now will still be saved on this device and sent once you’re back online.</p>' +
                    '<p><a href="/diary">Go to the site diary →</a></p></body>',
                  { headers: { 'content-type': 'text/html; charset=utf-8' } }
                )
            )
          )
        )
    );
  }
});
