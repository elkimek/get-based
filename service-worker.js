importScripts('/version.js');

// Cache key strategy:
//   Production (getbased.health) → labcharts-v${APP_VERSION}
//   Anywhere else (Vercel previews, local dev) → labcharts-v${APP_VERSION}-${sha8}
// This way feature-branch deploys auto-bust the SW cache on every commit
// without burning patch versions, while production stays clean.
const PROD_HOSTS = new Set(['getbased.health', 'www.getbased.health']);
const IS_PROD = PROD_HOSTS.has(self.location.hostname);

let _cacheNamePromise = null;
async function resolveCacheName() {
  const base = `labcharts-v${self.APP_VERSION}`;
  if (IS_PROD) return base;
  if (!_cacheNamePromise) {
    _cacheNamePromise = fetch('/api/commit', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.sha ? `${base}-${j.sha.slice(0, 8)}` : base))
      .catch(() => base);
  }
  return _cacheNamePromise;
}

// Local app shell — pre-cached on install
const APP_SHELL = [
  '/version.js',
  '/index.html',
  '/styles.css',
  '/js/main.js',
  '/js/schema.js',
  '/js/constants.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/theme.js',
  '/js/api.js',
  '/js/profile.js',
  '/js/data.js',
  '/js/pii.js',
  '/js/charts.js',
  '/js/notes.js',
  '/js/supplements.js',
  '/js/cycle.js',
  '/js/context-cards.js',
  '/js/emf.js',
  '/js/image-utils.js',
  '/js/pdf-import.js',
  '/js/export.js',
  '/js/chat.js',
  '/js/settings.js',
  '/js/feedback.js',
  '/js/tour.js',
  '/js/changelog.js',
  '/js/client-list.js',
  '/js/nav.js',
  '/js/views.js',
  '/js/recommendations.js',
  '/js/crypto.js',
  '/js/backup.js',
  '/js/lab-context.js',
  '/js/markdown.js',
  '/js/provider-panels.js',
  '/js/dna.js',
  '/js/hardware.js',
  '/js/sync.js',
  '/js/adapters.js',
  '/js/supplement-warnings.js',
  '/js/food-contaminants.js',
  '/js/cashu-wallet.js',
  '/js/nostr-discovery.js',
  // Wearables (added v1.22.0)
  '/js/wearable-adapters.js',
  '/js/wearables.js',
  '/js/wearables-store.js',
  '/js/wearables-summary.js',
  '/js/wearables-connect.js',
  '/js/wearables-oura.js',
  '/js/wearables-oura-auth.js',
  '/js/wearables-withings.js',
  '/js/wearables-withings-auth.js',
  '/js/wearables-ultrahuman.js',
  '/js/wearables-ultrahuman-auth.js',
  '/js/wearables-whoop.js',
  '/js/wearables-whoop-auth.js',
  '/js/wearables-fitbit.js',
  '/js/wearables-fitbit-auth.js',
  '/js/wearables-polar.js',
  '/js/wearables-polar-auth.js',
  '/js/wearables-apple-health.js',
  '/js/wearables-manual.js',
  '/js/brand-assets.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/vendor/chart.min.js',
  '/vendor/chartjs-adapter-native.js',
  '/vendor/pdf.min.js',
  '/vendor/pdf.worker.min.js',
  '/vendor/bip39-minimal.js',
  '/vendor/cashu-ts.js',
  '/vendor/fonts/fonts.css',
  '/data/recommendations.json',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    resolveCacheName().then((name) =>
      caches.open(name).then((cache) => cache.addAll(APP_SHELL))
    )
  );
  self.skipWaiting();
});

// Activate: delete old caches (any key that isn't this build's)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    resolveCacheName().then((name) =>
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== name).map((k) => caches.delete(k)))
      )
    )
  );
  self.clients.claim();
});

// Fetch: route-based caching strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-http(s) schemes (chrome-extension://, etc.) — Cache API only supports http/https
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Network-only: API calls (OpenRouter, Venice, Routstr, PPQ, Ollama) — do NOT
  // intercept so streaming ReadableStream goes directly to the page without SW IPC buffering
  // Also skip private/LAN IPs (Local AI on another machine)
  const h = url.hostname;
  if (h === 'openrouter.ai' || h === 'api.venice.ai' || h === 'api.routstr.com' || h === 'api.ppq.ai' || h === 'api.github.com' || h === 'umami-iota-olive.vercel.app' || h === 'sync.getbased.health' || h === 'free.evoluhq.com' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.startsWith('192.168.') || h.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return;
  }

  // Network-first: version.js — must always fetch fresh so SW detects new versions
  if (url.pathname === '/version.js') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        resolveCacheName().then((name) => caches.open(name)).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Skip non-GET requests — Cache API only supports GET
  if (event.request.method !== 'GET') return;

  // Skip cross-origin GETs (e.g. Custom API /models) — only cache same-origin app shell
  if (url.hostname !== self.location.hostname) return;

  // Stale-while-revalidate: local app shell files
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        const clone = response.clone();
        resolveCacheName().then((name) => caches.open(name)).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
