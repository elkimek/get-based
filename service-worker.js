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
  '/app',
  '/styles.css',
  '/css/app-shell.css',
  '/css/import.css',
  '/css/emf.css',
  '/css/modal-shared.css',
  '/css/dashboard-core.css',
  '/css/dashboard-widgets.css',
  '/css/dashboard-welcome.css',
  '/css/dashboard-data.css',
  '/css/category-views.css',
  '/css/context-profile.css',
  '/css/genetics.css',
  '/css/data-protection.css',
  '/css/settings.css',
  '/css/mobile-dashboard.css',
  '/css/cycle.css',
  '/css/marker-detail-modal.css',
  '/css/recommendations.css',
  '/css/client-list.css',
  '/css/wearables.css',
  '/css/light-sun.css',
  '/css/light-tools.css',
  '/css/light-env.css',
  '/css/chat-panel.css',
  '/css/chat-personality.css',
  '/css/chat-messages.css',
  '/css/chat-composer.css',
  '/css/chat-onboarding.css',
  '/css/chat-responsive.css',
  '/css/chat-actions.css',
  '/css/chat-mobile.css',
  '/css/redesign-shell.css',
  '/css/chat-redesign.css',
  '/themes-extra.css',
  '/js/main.js',
  '/js/app-feature-modules.js',
  '/js/app-foundation-modules.js',
  '/js/app-health-data-modules.js',
  '/js/app-light-sun-modules.js',
  '/js/app-data-io-modules.js',
  '/js/app-ai-interaction-modules.js',
  '/js/app-ui-shell-modules.js',
  '/js/app-event-listeners.js',
  '/js/startup-orchestrator.js',
  '/js/schema.js',
  '/js/constants.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/theme.js',
  '/js/api.js',
  '/js/startup-foundation.js',
  '/js/startup-profile.js',
  '/js/startup-oauth-callbacks.js',
  '/js/startup-maintenance.js',
  '/js/startup-ui.js',
  '/js/import-loader.js',
  '/js/import-file-input.js',
  '/js/import-drop-zone.js',
  '/js/ai-verdict-engine.js',
  '/js/profile.js',
  '/js/data.js',
  '/js/blob-storage.js',
  '/js/data-merge.js',
  '/js/pii.js',
  '/js/charts.js',
  '/js/notes.js',
  '/js/supplements.js',
  '/js/cycle.js',
  '/js/context-cards.js',
  '/js/focus-card.js',
  '/js/onboarding-view.js',
  '/js/emf-facade.js',
  '/js/emf.js',
  '/js/image-utils.js',
  '/js/pdf-import.js',
  '/js/export.js',
  '/js/chat.js',
  '/js/chat-window-bindings.js',
  '/js/chat-marker-prompts.js',
  '/js/chat-attestation.js',
  '/js/chat-actions.js',
  '/js/chat-nudge.js',
  '/js/chat-panel.js',
  '/js/chat-discussion.js',
  '/js/chat-discussion-callbacks.js',
  '/js/chat-discussion-flow.js',
  '/js/chat-discussion-lifecycle.js',
  '/js/chat-discussion-turns.js',
  '/js/chat-discussion-round-runner.js',
  '/js/chat-discussion-round-prompts.js',
  '/js/chat-discussion-round-request.js',
  '/js/chat-discussion-round-state.js',
  '/js/chat-discussion-round-view.js',
  '/js/chat-discussion-state.js',
  '/js/chat-discussion-picker.js',
  '/js/chat-discussion-ui.js',
  '/js/chat-onboarding.js',
  '/js/chat-empty-state.js',
  '/js/chat-render.js',
  '/js/chat-send.js',
  '/js/chat-icons.js',
  '/js/chat-personalities.js',
  '/js/chat-history.js',
  '/js/chat-continuation.js',
  '/js/chat-prompt-context.js',
  '/js/chat-summaries.js',
  '/js/settings.js',
  '/js/feedback.js',
  '/js/tour.js',
  '/js/changelog.js',
  '/js/client-list.js',
  '/js/nav.js',
  '/js/views-router.js',
  '/js/dashboard-view-composition.js',
  '/js/dashboard-page-view.js',
  '/js/lens-pages.js',
  '/js/lens-page-shell.js',
  '/js/dashboard-widgets.js',
  '/js/dashboard-widget-controls.js',
  '/js/dashboard-widget-renderers.js',
  '/js/recommendation-actions.js',
  '/js/chart-card-recs.js',
  '/js/category-glyphs.js',
  '/js/category-page-view.js',
  '/js/category-view-renderers.js',
  '/js/category-customization.js',
  '/js/commit-hash.js',
  '/js/marker-detail-modal.js',
  '/js/light-conditions-now.js',
  '/js/light-page-view.js',
  '/js/light-channel-view.js',
  '/js/light-sessions-view.js',
  '/js/compare-correlations.js',
  '/js/mobile-dashboard.js',
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
  '/js/sync-configure.js',
  '/js/sync-settings-state.js',
  '/js/sync-runtime.js',
  '/js/sync-init.js',
  '/js/sync-lifecycle.js',
  '/js/sync-disable-cleanup.js',
  '/js/sync-apply.js',
  '/js/sync-chat-apply.js',
  '/js/sync-schema.js',
  '/js/sync-delta.js',
  '/js/sync-delta-planners.js',
  '/js/sync-delta-planner-context.js',
  '/js/sync-delta-array-planner.js',
  '/js/sync-delta-map-planner.js',
  '/js/sync-delta-scalar-planner.js',
  '/js/sync-delta-snapshot.js',
  '/js/sync-delta-merge.js',
  '/js/sync-delta-merge-shapes.js',
  '/js/sync-delta-row-codec.js',
  '/js/sync-delta-array-merge.js',
  '/js/sync-delta-map-merge.js',
  '/js/sync-delta-scalar-merge.js',
  '/js/sync-delta-registry.js',
  '/js/sync-delta-surfaces.js',
  '/js/sync-delta-surface-config.js',
  '/js/sync-delta-id.js',
  '/js/sync-delta-observability.js',
  '/js/sync-delta-observability-context.js',
  '/js/sync-delta-pull-snapshot.js',
  '/js/sync-delta-telemetry.js',
  '/js/sync-delta-readiness.js',
  '/js/sync-tombstones.js',
  '/js/sync-messenger.js',
  '/js/sync-environment.js',
  '/js/sync-identity.js',
  '/js/sync-diagnostics.js',
  '/js/sync-diagnostics-context.js',
  '/js/sync-diagnostics-snapshot.js',
  '/js/sync-diagnostics-text.js',
  '/js/sync-diagnose-actions-context.js',
  '/js/sync-diagnose-relay-actions.js',
  '/js/sync-diagnose-identity-actions.js',
  '/js/sync-diagnose-cutover-actions.js',
  '/js/sync-diagnose-actions.js',
  '/js/sync-diagnose-ui.js',
  '/js/sync-diagnose-render.js',
  '/js/sync-actions.js',
  '/js/sync-save-hooks.js',
  '/js/sync-storage-cleanup.js',
  '/js/sync-push.js',
  '/js/sync-push-deltas.js',
  '/js/sync-recovery.js',
  '/js/sync-reconcile.js',
  '/js/sync-pull-merge.js',
  '/js/sync-pull-maintenance.js',
  '/js/sync-pull-active-refresh.js',
  '/js/sync-pull-rebroadcast.js',
  '/js/sync-pull.js',
  '/js/sync-subscriptions.js',
  '/js/sync-window-bindings.js',
  '/js/sync-cutover.js',
  '/js/sync-ui.js',
  '/js/sync-payload-collectors.js',
  '/js/sync-payload.js',
  '/js/sync-relay-health.js',
  '/js/sync-state.js',
  '/js/adapters.js',
  '/js/supplement-warnings.js',
  '/js/food-contaminants.js',
  '/js/cashu-wallet.js',
  '/js/nostr-discovery.js',
  '/js/touch-tooltip.js',
  '/js/url-safety.js',
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
  // Sun + light modules are statically reachable from the app shell.
  '/js/sun.js',
  '/js/sun-ai-analysis.js',
  '/js/sun-context.js',
  '/js/sun-correlations.js',
  '/js/sun-defaults.js',
  '/js/sun-onboarding-ai.js',
  '/js/sun-spectrum.js',
  '/js/sun-uvdata.js',
  '/js/light-audit-ai-analysis.js',
  '/js/light-burden-ai-analysis.js',
  '/js/light-channels-ai-analysis.js',
  '/js/light-device-ai-analysis.js',
  '/js/light-devices.js',
  '/js/light-env.js',
  '/js/light-env-ai-analysis.js',
  '/js/light-screen-ai-analysis.js',
  '/js/light-today-ai.js',
  '/js/light-tools.js',
  '/js/light-tools-ai-analysis.js',
  '/js/lighting-hardware-caveats.js',
  '/js/silhouette-paths.js',
  // Dynamically imported — must be precached so a first-launch-offline user
  // (or PWA install + go-offline) can still open chat / Knowledge Base.
  '/js/chat-images.js',
  '/js/chat-threads.js',
  '/js/chat-thread-search.js',
  '/js/lens.js',
  '/js/lens-local.js',
  '/js/lens-local-worker.js',
  '/js/lens-local-utils.js',
  '/js/lens-local-parsers.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/vendor/chart.min.js',
  '/vendor/chartjs-adapter-native.js',
  '/vendor/qrcode-generator.js',
  '/vendor/pdf.min.mjs',
  '/vendor/pdf.worker.min.mjs',
  '/js/pdfjs-loader.js',
  '/vendor/jszip.min.js',
  '/vendor/mammoth.browser.min.js',
  '/vendor/bip39-minimal.js',
  '/vendor/cashu-ts.js',
  '/vendor/venice-e2ee.js',
  '/vendor/evolu/evolu-bundle.js',
  '/vendor/evolu/Db.worker.js',
  '/vendor/evolu/sqlite3-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3-opfs-async-proxy.js',
  '/vendor/evolu/sqlite3-worker1-bundler-friendly.mjs',
  '/vendor/evolu/sqlite3.wasm',
  '/vendor/fonts/fonts.css',
  '/data/recommendations.json',
  '/data/light-device-presets.json',
  '/data/mito-compounds.json',
  '/data/snp-health.json',
  '/data/haplogroups.json',
  '/data/sun-action-spectra.json',
  '/data/demo-male.json',
  '/data/demo-female.json',
  '/data/emf-assessment-template.html',
];

function cacheResponse(request, response) {
  if (!response || response.status === 206 || !response.ok) return Promise.resolve();
  const clone = response.clone();
  return resolveCacheName()
    .then((name) => caches.open(name))
    .then((cache) => cache.put(request, clone))
    .catch(() => {});
}

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    cacheResponse(request, response);
    return response;
  });
}

function cachedAppShell() {
  return caches.match('/app').then((cachedApp) => cachedApp || caches.match('/index.html'));
}

const NETWORK_ONLY_HOSTS = new Set([
  'openrouter.ai',
  'api.venice.ai',
  'api.routstr.com',
  'api.ppq.ai',
  'api.github.com',
  'umami-iota-olive.vercel.app',
  'sync.getbased.health',
  'free.evoluhq.com',
]);

function isLocalOrPrivateHost(hostname) {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

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
  const sameOrigin = url.origin === self.location.origin;

  // Skip non-http(s) schemes (chrome-extension://, etc.) — Cache API only supports http/https
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Network-only: API calls (OpenRouter, Venice, Routstr, PPQ, Ollama) — do NOT
  // intercept so streaming ReadableStream goes directly to the page without SW IPC buffering
  // Also skip cross-origin private/LAN IPs (Local AI on another machine).
  // Same-origin localhost app files still need SW handling for local offline testing.
  const h = url.hostname;
  if (NETWORK_ONLY_HOSTS.has(h) || (!sameOrigin && isLocalOrPrivateHost(h))) {
    return;
  }

  // Network-first: version.js — must always fetch fresh so SW detects new versions
  if (url.pathname === '/version.js') {
    event.respondWith(
      fetchAndCache(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Skip non-GET requests — Cache API only supports GET
  if (event.request.method !== 'GET') return;

  // Skip cross-origin GETs (e.g. Custom API /models) — only cache same-origin app shell
  if (!sameOrigin) return;

  // Navigation fallback: installed PWAs launch at /app. When offline, serve the
  // cached app document for /app and any refreshed same-origin navigation.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetchAndCache(event.request).catch(() => cached || cachedAppShell());
        return cached || fetched;
      })
    );
    return;
  }

  // Stale-while-revalidate: local app shell files
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetchAndCache(event.request).catch(() => cached);
      return cached || fetched;
    })
  );
});
