// @ts-check
// service-worker-update.js - explicit PWA update prompt and SW registration

const UPDATE_BANNER_ID = 'version-update-banner';
const UPDATE_ACTION_ATTR = 'data-version-update-action';
const DEV_SW_QUERY_RE = /(?:^|[?&])dev-sw=1(?:&|$)/;
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;

let pendingRegistration = null;
let dismissedWaitingWorker = null;
let updateRequested = false;
let reloadAvailable = false;
let lastUpdateCheckAt = 0;
let reloadPage = () => {
  if (typeof window !== 'undefined') window.location.reload();
};

export function isDevServiceWorkerHost(hostname) {
  if (!hostname) return false;
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local');
}

export function shouldRegisterServiceWorker(
  locationLike = typeof window !== 'undefined' ? window.location : null
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
  if (!reloadAvailable && (!waitingWorker || waitingWorker === dismissedWaitingWorker)) return false;

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
        <span class="version-update-copy version-update-copy-long"><strong>New version available.</strong> Update when you are ready.</span>
        <span class="version-update-copy version-update-copy-short"><strong>Update available.</strong></span>
      </div>
      <div class="version-update-actions">
        <button type="button" class="version-update-btn version-update-btn-primary" ${UPDATE_ACTION_ATTR}="apply">Update</button>
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
  const longCopy = banner.querySelector('.version-update-copy-long');
  const shortCopy = banner.querySelector('.version-update-copy-short');
  const primaryButton = banner.querySelector(`[${UPDATE_ACTION_ATTR}="apply"]`);
  if (reloadAvailable) {
    if (longCopy) longCopy.innerHTML = '<strong>New version installed.</strong> Reload when you are ready.';
    if (shortCopy) shortCopy.innerHTML = '<strong>Reload available.</strong>';
    if (primaryButton) primaryButton.textContent = 'Reload';
    banner.setAttribute('aria-label', 'App update ready to reload');
    return;
  }

  if (longCopy) longCopy.innerHTML = '<strong>New version available.</strong> Update when you are ready.';
  if (shortCopy) shortCopy.innerHTML = '<strong>Update available.</strong>';
  if (primaryButton) primaryButton.textContent = 'Update';
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
  if (!waitingWorker) return false;

  updateRequested = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  hideVersionUpdateBanner();
  return true;
}

export function watchServiceWorkerRegistration(
  registration,
  serviceWorkerContainer = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
) {
  if (!registration || !serviceWorkerContainer) return;

  if (canPromptForUpdate(registration, serviceWorkerContainer)) {
    showVersionUpdateBanner(registration);
  }

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed'
          && canPromptForUpdate(registration, serviceWorkerContainer)) {
        dismissedWaitingWorker = null;
        reloadAvailable = false;
        showVersionUpdateBanner(registration);
      }
    });
  });
}

function requestServiceWorkerUpdate(registration, serviceWorkerContainer, { force = false } = {}) {
  if (!registration?.update) return;

  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
  lastUpdateCheckAt = now;

  registration.update().then(() => {
    if (canPromptForUpdate(registration, serviceWorkerContainer)) {
      showVersionUpdateBanner(registration);
    }
  }).catch(() => {});
}

function scheduleServiceWorkerUpdateChecks(registration, serviceWorkerContainer, win) {
  if (!registration?.update || !win) return;

  const check = (force = false) => {
    if (win.document?.visibilityState === 'hidden') return;
    requestServiceWorkerUpdate(registration, serviceWorkerContainer, { force });
  };

  check(true);
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
  win = typeof window !== 'undefined' ? window : null,
  serviceWorkerContainer = typeof navigator !== 'undefined' ? navigator.serviceWorker : null,
  cacheStorage = typeof window !== 'undefined' ? window.caches : null,
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
    serviceWorkerContainer.addEventListener('controllerchange', () => {
      if (refreshing) return;
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

// Skip SW registration on dev hosts by default. WebKit's HTTP cache layer can
// otherwise keep serving stale module bytes in Tauri/webkit2gtk dev windows.
// Use ?dev-sw=1 for explicit local offline smoke testing.
if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  registerServiceWorkerUpdates();
}
