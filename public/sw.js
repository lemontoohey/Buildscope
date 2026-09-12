// Buildscope service worker.
//
// Goal: as much of the app as possible should still open -- and stay
// usable -- on a rural site with patchy or no reception. This is
// deliberately simple -- no build step, no Workbox -- three strategies:
//
//   - GET page navigations: network first (so you always see live data
//     when you have signal), falling back to a cached copy of that same
//     page, and finally to a small offline notice if it was never cached.
//   - GET static assets (/public/*, icons, manifest) AND the binary files
//     behind an uploaded plan or job photo (/documents/file/*,
//     /photos/file/*): cache first, with a background refetch to keep the
//     cache warm. Plans and photos rarely change once uploaded, so this is
//     the right trade-off -- and it's what actually makes Plan Measure and
//     the Photos gallery work offline, not just their page shells.
//   - On install, proactively fetch and cache every main nav route (not
//     just "/"), so a fresh install works offline without the user first
//     having to click through every page once while connected.
//
// Anything that isn't a GET (form posts, the JSON APIs) is left completely
// alone and goes straight to the network -- offline handling for writes
// (new diary entries, BOQ items, schedule updates, and so on) is done in
// public/offline-queue.js instead, where it can be visible to the user
// rather than silently swallowed here.
const CACHE_NAME = 'buildscope-v2';

// Every top-level nav destination, so the app shell works offline right
// after install, not just on pages someone happened to visit already.
const NAV_ROUTES = [
  '/',
  '/budget',
  '/estimator',
  '/plan-measure',
  '/formulate',
  '/price-book',
  '/materials',
  '/materials/import-quote',
  '/purchase-orders',
  '/selections',
  '/calculators',
  '/schedule',
  '/trades',
  '/compliance',
  '/documents',
  '/photos',
  '/diary',
  '/settings',
];

const APP_SHELL = [
  ...NAV_ROUTES,
  '/public/offline-queue.js',
  '/public/calculators.js',
  '/public/plan-measure.js',
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
  return (
    url.pathname.startsWith('/public/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/documents/file/') ||
    url.pathname.startsWith('/photos/file/')
  );
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
                    'Diary entries, BOQ items and most other forms you fill in now will still be saved on this ' +
                    'device and sent once you’re back online.</p>' +
                    '<p><a href="/diary">Go to the site diary →</a></p></body>',
                  { headers: { 'content-type': 'text/html; charset=utf-8' } }
                )
            )
          )
        )
    );
  }
});
