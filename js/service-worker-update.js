// @ts-check
// service-worker-update.js - explicit PWA update prompt and SW registration

const UPDATE_BANNER_ID = 'version-update-banner';
const UPDATE_ACTION_ATTR = 'data-version-update-action';
const DEV_SW_QUERY_RE = /(?:^|[?&])dev-sw=1(?:&|$)/;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_CHECK_URL = '/version.js?update-check=1';
const LAST_VERSION_CHECK_KEY = 'labcharts-version-update-last-check';
const APP_BUILD_RE = /\bAPP_BUILD_ID\s*=\s*(['"])([^'"]+)\1/;
const APP_VERSION_RE = /\bAPP_VERSION\s*=\s*(['"])([^'"]+)\1/;

let pendingRegistration = null;
let dismissedWaitingWorker = null;
let updateRequested = false;
let reloadAvailable = false;
let lastUpdateCheckAt = 0;

/**
 * @returns {(Window & { caches?: CacheStorage }) | null}
 */
function getDefaultServiceWorkerWindow() {
  return typeof window !== 'undefined'
    ? /** @type {Window & { caches?: CacheStorage }} */ (window)
    : null;
}

/**
 * @returns {ServiceWorkerContainer | null}
 */
function getDefaultServiceWorkerContainer() {
  return typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
}

/**
 * @returns {CacheStorage | null}
 */
function getDefaultCacheStorage() {
  return getDefaultServiceWorkerWindow()?.caches || null;
}

export function parseAppVersionScript(source) {
  return String(source || '').match(APP_BUILD_RE)?.[2]
    || String(source || '').match(APP_VERSION_RE)?.[2] || '';
}

export function isReloadNavigation(win = getDefaultServiceWorkerWindow()) {
  const navigation = /** @type {PerformanceNavigationTiming | undefined} */ (
    win?.performance?.getEntriesByType?.('navigation')?.[0]
  );
  if (navigation?.type === 'reload') return true;
  return win?.performance?.navigation?.type === 1;
}

function getCurrentAppVersion(win) {
  return String(win?.APP_BUILD_ID || win?.APP_VERSION || '').trim();
}

function getStoredLastCheckAt(win) {
  try {
    return Number(win?.localStorage?.getItem(LAST_VERSION_CHECK_KEY)) || 0;
  } catch {
    return 0;
  }
}

function storeLastCheckAt(win, checkedAt) {
  lastUpdateCheckAt = checkedAt;
  try {
    win?.localStorage?.setItem(LAST_VERSION_CHECK_KEY, String(checkedAt));
  } catch {}
}

let reloadPage = () => {
  getDefaultServiceWorkerWindow()?.location.reload();
};

export function isDevServiceWorkerHost(hostname) {
  if (!hostname) return false;
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local');
}

export function shouldRegisterServiceWorker(
  locationLike = getDefaultServiceWorkerWindow()?.location || null
) {
  if (!locationLike) return false;
  return !isDevServiceWorkerHost(locationLike.hostname)
    || DEV_SW_QUERY_RE.test(locationLike.search || '');
}

function getServiceWorker(registration) {
  if (registration?.waiting) return registration.waiting;
  const installingWorker = registration?.installing;
  return installingWorker?.state === 'installed' ? installingWorker : null;
}

function canPromptForUpdate(registration, serviceWorkerContainer) {
  return !!getServiceWorker(registration) && !!serviceWorkerContainer?.controller;
}

function removeBanner() {
  document.getElementById(UPDATE_BANNER_ID)?.remove();
  document.body?.classList.remove('version-update-visible');
}

export function hideVersionUpdateBanner() {
  reloadAvailable = false;
  removeBanner();
}

export function showVersionUpdateBanner(registration) {
  const waitingWorker = getServiceWorker(registration);
  const waitingUpdate = !!waitingWorker && waitingWorker !== dismissedWaitingWorker;
  if (!reloadAvailable && !waitingUpdate) return false;

  pendingRegistration = registration || pendingRegistration;

  let banner = document.getElementById(UPDATE_BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = UPDATE_BANNER_ID;
    banner.className = 'version-update-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'App update available');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = `
      <div class="version-update-body">
        <div class="version-update-copy-row">
          <span class="version-update-copy"><strong>Update ready.</strong> Reload when you are ready.</span>
        </div>
      </div>
      <div class="version-update-actions">
        <button type="button" class="version-update-btn version-update-btn-primary" ${UPDATE_ACTION_ATTR}="apply">Reload</button>
        <button type="button" class="version-update-btn" ${UPDATE_ACTION_ATTR}="dismiss">Later</button>
      </div>
    `;
    banner.addEventListener('click', handleVersionUpdateActionClick);
    document.body.appendChild(banner);
  }

  renderVersionUpdateBanner(banner);
  document.body.classList.add('version-update-visible');
  return true;
}

function renderVersionUpdateBanner(banner) {
  const copy = banner.querySelector('.version-update-copy');
  const primaryButton = banner.querySelector(`[${UPDATE_ACTION_ATTR}="apply"]`);
  const dismissButton = banner.querySelector(`[${UPDATE_ACTION_ATTR}="dismiss"]`);
  if (reloadAvailable) {
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-busy', 'false');
    if (copy) copy.innerHTML = '<strong>New version installed.</strong> Reload when you are ready.';
    if (primaryButton) primaryButton.textContent = 'Reload';
    if (primaryButton) primaryButton.disabled = false;
    if (dismissButton) dismissButton.disabled = false;
    banner.setAttribute('aria-label', 'App update ready to reload');
    return;
  }

  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-busy', 'false');
  if (copy) copy.innerHTML = '<strong>Update ready.</strong> Reload when you are ready.';
  if (primaryButton) primaryButton.textContent = 'Reload';
  if (primaryButton) primaryButton.disabled = false;
  if (dismissButton) dismissButton.disabled = false;
  banner.setAttribute('aria-label', 'App update available');
}

function handleVersionUpdateActionClick(event) {
  const target = event.target instanceof Element
    ? event.target.closest(`[${UPDATE_ACTION_ATTR}]`)
    : null;
  if (!target) return;
  event.preventDefault();

  const action = target.getAttribute(UPDATE_ACTION_ATTR);
  if (action === 'apply') {
    applyPendingServiceWorkerUpdate();
    return;
  }

  if (action === 'dismiss') {
    if (!reloadAvailable) dismissedWaitingWorker = getServiceWorker(pendingRegistration);
    hideVersionUpdateBanner();
  }
}

export function applyPendingServiceWorkerUpdate(registration = pendingRegistration) {
  if (reloadAvailable) {
    hideVersionUpdateBanner();
    reloadPage();
    return true;
  }

  const waitingWorker = getServiceWorker(registration);
  if (waitingWorker) {
    updateRequested = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    hideVersionUpdateBanner();
    return true;
  }

  return false;
}

export function watchServiceWorkerRegistration(
  registration,
  serviceWorkerContainer = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
) {
  if (!registration || !serviceWorkerContainer) return;

  if (registration.waiting && serviceWorkerContainer.controller) {
    showVersionUpdateBanner(registration);
  }

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;
    // WebKit can claim the first page before delivering the installed event.
    // Decide whether this replaces an existing worker when installation starts.
    const replacesController = !!serviceWorkerContainer.controller;

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed'
          && replacesController
          && canPromptForUpdate(registration, serviceWorkerContainer)) {
        dismissedWaitingWorker = null;
        reloadAvailable = false;
        showVersionUpdateBanner(registration);
      }
    });
  });
}

/**
 * @param {any} registration
 * @param {any} serviceWorkerContainer
 * @param {any} win
 * @param {{ force?: boolean, fetchImpl?: typeof fetch }} [options]
 */
export async function checkForAppVersionUpdate(
  registration,
  serviceWorkerContainer,
  win = getDefaultServiceWorkerWindow(),
  options = {}
) {
  const { force = false, fetchImpl } = options;
  if (!win) return false;
  const fetchVersion = fetchImpl || win.fetch?.bind?.(win);
  if (!fetchVersion) return false;
  const now = Date.now();
  const sharedLastCheckAt = Math.max(lastUpdateCheckAt, getStoredLastCheckAt(win));
  if (!force && now - sharedLastCheckAt < UPDATE_CHECK_INTERVAL_MS) return false;
  storeLastCheckAt(win, now);

  try {
    const response = await fetchVersion(VERSION_CHECK_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response?.ok) return false;
    const remoteVersion = parseAppVersionScript(await response.text());
    const currentVersion = getCurrentAppVersion(win);
    if (!remoteVersion || !currentVersion || remoteVersion === currentVersion) return false;

    pendingRegistration = registration || pendingRegistration;
    if (!registration?.update || registration.installing) return false;
    await registration.update();
    if (canPromptForUpdate(registration, serviceWorkerContainer)) showVersionUpdateBanner(registration);
    return true;
  } catch {
    return false;
  }
}

function requestServiceWorkerUpdateForReload(registration, serviceWorkerContainer) {
  if (!registration?.update) return;
  registration.update().then(() => {
    if (canPromptForUpdate(registration, serviceWorkerContainer)) {
      showVersionUpdateBanner(registration);
    }
  }).catch(() => {});
}

function scheduleServiceWorkerUpdateChecks(registration, serviceWorkerContainer, win) {
  if (!win) return;

  const check = (force = false) => {
    if (win.document?.visibilityState === 'hidden') return;
    checkForAppVersionUpdate(registration, serviceWorkerContainer, win, { force }).catch(() => {});
  };

  if (isReloadNavigation(win)) {
    // An explicit reload is user intent to get current code. Let the browser
    // perform a full worker update immediately. Routine checks also stage new
    // builds in the background, but never activate them in an open tab.
    requestServiceWorkerUpdateForReload(registration, serviceWorkerContainer);
  } else {
    check();
  }
  win.addEventListener?.('focus', () => check());
  win.document?.addEventListener?.('visibilitychange', () => {
    if (win.document?.visibilityState === 'visible') check();
  });
  win.setInterval?.(() => check(), UPDATE_CHECK_INTERVAL_MS);
}

async function unregisterDevServiceWorkers(serviceWorkerContainer, cacheStorage) {
  const registrations = await serviceWorkerContainer.getRegistrations();
  let changed = false;
  await Promise.all(registrations.map(async (registration) => {
    changed = true;
    await registration.unregister();
  }));

  if (changed && cacheStorage?.keys) {
    const keys = await cacheStorage.keys();
    await Promise.all(keys.map((key) => cacheStorage.delete(key)));
  }
}

export async function registerServiceWorkerUpdates({
  win = getDefaultServiceWorkerWindow(),
  serviceWorkerContainer = getDefaultServiceWorkerContainer(),
  cacheStorage = getDefaultCacheStorage(),
} = {}) {
  if (!win || !serviceWorkerContainer) return null;

  if (!shouldRegisterServiceWorker(win.location)) {
    if (isDevServiceWorkerHost(win.location.hostname)) {
      unregisterDevServiceWorkers(serviceWorkerContainer, cacheStorage).catch(() => {});
    }
    return null;
  }

  try {
    const registration = await serviceWorkerContainer.register('/service-worker.js', { updateViaCache: 'none' });
    reloadPage = () => win.location.reload();
    let refreshing = false;
    let controller = serviceWorkerContainer.controller;
    serviceWorkerContainer.addEventListener('controllerchange', () => {
      const nextController = serviceWorkerContainer.controller;
      if (refreshing || !nextController || nextController === controller) return;
      const previousController = controller;
      controller = nextController;
      // A first install claims an already current page. Only replacement of
      // an existing controller is evidence that this page needs a reload.
      if (!previousController && !updateRequested) return;
      if (!updateRequested) {
        reloadAvailable = true;
        showVersionUpdateBanner(registration);
        return;
      }
      refreshing = true;
      win.location.reload();
    });
    watchServiceWorkerRegistration(registration, serviceWorkerContainer);
    scheduleServiceWorkerUpdateChecks(registration, serviceWorkerContainer, win);
    return registration;
  } catch {
    return null;
  }
}

export function scheduleServiceWorkerRegistration({
  win = getDefaultServiceWorkerWindow(),
  serviceWorkerContainer = getDefaultServiceWorkerContainer(),
  cacheStorage = getDefaultCacheStorage(),
  register = registerServiceWorkerUpdates,
} = {}) {
  if (!win || !serviceWorkerContainer) return false;
  let registrationStarted = false;

  const registerWhenIdle = () => {
    if (registrationStarted) return;
    registrationStarted = true;
    const startRegistration = () => {
      register({ win, serviceWorkerContainer, cacheStorage }).catch(() => {});
    };
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(startRegistration, { timeout: 2000 });
    } else if (typeof win.setTimeout === 'function') {
      win.setTimeout(startRegistration, 0);
    } else {
      startRegistration();
    }
  };

  if (win.document?.readyState === 'complete') registerWhenIdle();
  else win.addEventListener?.('load', registerWhenIdle, { once: true });
  return true;
}

// Skip SW registration on dev hosts by default. WebKit's HTTP cache layer can
// otherwise keep serving stale module bytes in Tauri/webkit2gtk dev windows.
// Use ?dev-sw=1 for explicit local offline smoke testing.
if (getDefaultServiceWorkerWindow() && getDefaultServiceWorkerContainer()) {
  scheduleServiceWorkerRegistration();
}
