// service-worker-update.js - explicit PWA update prompt and SW registration

import { renderVersionUpdateBody, renderVersionUpdateCopy } from './version-update-rendering.js';

export interface UpdateWorkerView {
  state?: ServiceWorker['state'];
  postMessage?: ServiceWorker['postMessage'];
  addEventListener?: ServiceWorker['addEventListener'];
}
export interface UpdateRegistrationView {
  waiting?: UpdateWorkerView | null;
  installing?: UpdateWorkerView | null;
  update?: () => Promise<unknown>;
  addEventListener?: ServiceWorkerRegistration['addEventListener'];
}
export interface UpdateContainerView {
  controller?: unknown;
  register?: (scriptURL: string | URL, options?: RegistrationOptions) => Promise<UpdateRegistrationView>;
  getRegistrations?: () => Promise<ReadonlyArray<Pick<ServiceWorkerRegistration, 'unregister'>>>;
  addEventListener?: ServiceWorkerContainer['addEventListener'];
}
export interface VersionResponseView { ok?: unknown; text?: () => unknown }
export type VersionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<VersionResponseView | null | undefined>;
export interface UpdateWindowView {
  APP_BUILD_ID?: unknown;
  APP_VERSION?: unknown;
  location?: Pick<Location, 'hostname' | 'search' | 'reload'>;
  performance?: {
    getEntriesByType?: (type: string) => unknown[];
    navigation?: { type?: unknown };
  };
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  fetch?: VersionFetch;
  document?: Partial<Pick<Document, 'readyState' | 'visibilityState' | 'addEventListener'>>;
  addEventListener?: Window['addEventListener'];
  requestIdleCallback?: Window['requestIdleCallback'];
  setTimeout?: Window['setTimeout'];
  setInterval?: Window['setInterval'];
  caches?: CacheStorage;
}
export interface UpdateRuntimeOptions {
  win?: UpdateWindowView | null;
  serviceWorkerContainer?: UpdateContainerView | null;
  cacheStorage?: CacheStorage | null;
}
interface VersionCheckOptions { force?: boolean; fetchImpl?: VersionFetch }
interface RegistrationScheduleOptions extends UpdateRuntimeOptions {
  register?: (options: UpdateRuntimeOptions) => Promise<unknown>;
}

const UPDATE_BANNER_ID = 'version-update-banner';
const UPDATE_ACTION_ATTR = 'data-version-update-action';
const DEV_SW_QUERY_RE = /(?:^|[?&])dev-sw=1(?:&|$)/;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_ACTIVATION_TIMEOUT_MS = 30 * 1000;
const VERSION_CHECK_URL = '/version.js?update-check=1';
const LAST_VERSION_CHECK_KEY = 'labcharts-version-update-last-check';
const APP_BUILD_RE = /\bAPP_BUILD_ID\s*=\s*(['"])([^'"]+)\1/;
const APP_VERSION_RE = /\bAPP_VERSION\s*=\s*(['"])([^'"]+)\1/;

let pendingRegistration: UpdateRegistrationView | null = null;
let dismissedWaitingWorker: UpdateWorkerView | null = null;
let requestedWorker: UpdateWorkerView | null = null;
let registeredContainer: UpdateContainerView | null = null;
let pendingUpdateCheck: object | null = null;
let activationTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let activationError: 'failed' | 'timeout' | 'unavailable' | null = null;
let activationDeferred = false;
let reloadAvailable = false;
let lastUpdateCheckAt = 0;

function getDefaultServiceWorkerWindow(): UpdateWindowView | null {
  return typeof window !== 'undefined'
    ? (window)
    : null;
}

function getDefaultServiceWorkerContainer(): UpdateContainerView | null | undefined {
  return typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
}

function getDefaultCacheStorage() {
  return getDefaultServiceWorkerWindow()?.caches || null;
}

export function parseAppVersionScript(source: unknown) {
  return String(source || '').match(APP_BUILD_RE)?.[2]
    || String(source || '').match(APP_VERSION_RE)?.[2] || '';
}

export function isReloadNavigation(win: UpdateWindowView | null = getDefaultServiceWorkerWindow()) {
  const navigation = (
    win?.performance?.getEntriesByType?.('navigation')?.[0]
  ) as { type?: unknown } | null | undefined;
  if (navigation?.type === 'reload') return true;
  return win?.performance?.navigation?.type === 1;
}

function getCurrentAppVersion(win: UpdateWindowView | null) {
  return String(win?.APP_BUILD_ID || win?.APP_VERSION || '').trim();
}

function getStoredLastCheckAt(win: UpdateWindowView | null) {
  try {
    return Number(win?.localStorage?.getItem(LAST_VERSION_CHECK_KEY)) || 0;
  } catch {
    return 0;
  }
}

function storeLastCheckAt(win: UpdateWindowView | null, checkedAt: number) {
  lastUpdateCheckAt = checkedAt;
  try {
    win?.localStorage?.setItem(LAST_VERSION_CHECK_KEY, String(checkedAt));
  } catch {}
}

let reloadPage = () => {
  getDefaultServiceWorkerWindow()?.location!.reload();
};

export function isDevServiceWorkerHost(hostname: string | null | undefined) {
  if (!hostname) return false;
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.local');
}

export function shouldRegisterServiceWorker(
  locationLike: Pick<Location, 'hostname' | 'search'> | null = getDefaultServiceWorkerWindow()?.location || null
) {
  if (!locationLike) return false;
  return !isDevServiceWorkerHost(locationLike.hostname)
    || DEV_SW_QUERY_RE.test(locationLike.search || '');
}

function getServiceWorker(registration: UpdateRegistrationView | null | undefined) {
  if (registration?.waiting) return registration.waiting;
  const installingWorker = registration?.installing;
  return installingWorker?.state === 'installed' ? installingWorker : null;
}

function canPromptForUpdate(registration: UpdateRegistrationView | null | undefined, serviceWorkerContainer: UpdateContainerView | null | undefined) {
  return !!getServiceWorker(registration) && !!serviceWorkerContainer?.controller;
}

function removeBanner() {
  document.getElementById(UPDATE_BANNER_ID)?.remove();
  document.body?.classList.remove('version-update-visible');
}

function clearPendingActivation() {
  requestedWorker = null;
  pendingUpdateCheck = null;
  if (activationTimer !== null) globalThis.clearTimeout(activationTimer);
  activationTimer = null;
}

function suspendVersionUpdateBanner() {
  clearPendingActivation();
  activationError = null;
  activationDeferred = false;
  removeBanner();
}

export function hideVersionUpdateBanner() {
  reloadAvailable = false;
  suspendVersionUpdateBanner();
}

export function showVersionUpdateBanner(registration?: UpdateRegistrationView | null) {
  const waitingWorker = getServiceWorker(registration);
  const waitingUpdate = !!waitingWorker && waitingWorker !== dismissedWaitingWorker;
  if (!reloadAvailable && !waitingUpdate && !requestedWorker && !pendingUpdateCheck && !activationError) return false;
  if (requestedWorker && waitingWorker && waitingWorker !== requestedWorker) {
    clearPendingActivation();
    activationDeferred = false;
    activationError = null;
  }

  pendingRegistration = registration || pendingRegistration;

  let banner = document.getElementById(UPDATE_BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = UPDATE_BANNER_ID;
    banner.className = 'version-update-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'App update available');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = renderVersionUpdateBody();
    banner.addEventListener('click', handleVersionUpdateActionClick);
    document.body.appendChild(banner);
  }

  renderVersionUpdateBanner(banner);
  document.body.classList.add('version-update-visible');
  return true;
}

function renderVersionUpdateBanner(banner: HTMLElement) {
  const copy = banner.querySelector('.version-update-copy');
  const primaryButton = banner.querySelector<HTMLButtonElement>(`[${UPDATE_ACTION_ATTR}="apply"]`);
  const dismissButton = banner.querySelector<HTMLButtonElement>(`[${UPDATE_ACTION_ATTR}="dismiss"]`);
  if (requestedWorker || pendingUpdateCheck) {
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-busy', 'true');
    banner.setAttribute('aria-label', 'App update in progress');
    if (copy) copy.textContent = pendingUpdateCheck
      ? 'Checking for the update. You can choose to apply it when it is ready.'
      : 'Updating getbased. This page will reload when the update is ready.';
    if (primaryButton) primaryButton.textContent = 'Updating…';
    if (primaryButton) primaryButton.disabled = true;
    if (dismissButton) dismissButton.disabled = true;
    return;
  }

  if (reloadAvailable) {
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-busy', 'false');
    if (copy) copy.innerHTML = renderVersionUpdateCopy(true);
    if (primaryButton) primaryButton.textContent = 'Reload';
    if (primaryButton) primaryButton.disabled = false;
    if (dismissButton) dismissButton.disabled = false;
    banner.setAttribute('aria-label', 'App update ready to reload');
    return;
  }

  if (activationDeferred) {
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-busy', 'false');
    if (copy) copy.textContent = 'Update paused to protect open tabs. Close all getbased tabs and app windows, then reopen getbased to finish updating.';
    if (primaryButton) primaryButton.textContent = !getServiceWorker(pendingRegistration) && !pendingRegistration?.update
      ? 'Reload' : 'Retry update';
    if (primaryButton) primaryButton.disabled = false;
    if (dismissButton) dismissButton.disabled = false;
    banner.setAttribute('aria-label', 'App update paused');
    return;
  }

  if (activationError) {
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-busy', 'false');
    banner.setAttribute('aria-label', 'App update needs attention');
    const needsReload = !getServiceWorker(pendingRegistration) && !pendingRegistration?.update;
    if (copy) copy.textContent = needsReload
      ? 'No waiting update is available. Reload getbased to check again.'
      : activationError === 'unavailable'
      ? 'No waiting update is available yet. Retry the update check, or close all getbased tabs and app windows, then reopen getbased.'
      : activationError === 'timeout'
      ? 'The update is taking longer than expected. Retry the update, or close all getbased tabs and app windows, then reopen getbased.'
      : 'The update could not start. Retry the update, or close all getbased tabs and app windows, then reopen getbased.';
    if (primaryButton) primaryButton.textContent = needsReload ? 'Reload' : 'Retry update';
    if (primaryButton) primaryButton.disabled = false;
    if (dismissButton) dismissButton.disabled = false;
    return;
  }

  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-busy', 'false');
  if (copy) copy.innerHTML = renderVersionUpdateCopy(false);
  if (primaryButton) primaryButton.textContent = 'Reload';
  if (primaryButton) primaryButton.disabled = false;
  if (dismissButton) dismissButton.disabled = false;
  banner.setAttribute('aria-label', 'App update available');
}

function handleVersionUpdateActionClick(event: MouseEvent) {
  const target = event.target instanceof Element
    ? event.target.closest(`[${UPDATE_ACTION_ATTR}]`)
    : null;
  if (!target || requestedWorker || pendingUpdateCheck) return;
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

function retryMissingWaitingWorker(registration: UpdateRegistrationView) {
  if (!registration.update) {
    hideVersionUpdateBanner();
    reloadPage();
    return true;
  }
  const check = {};
  pendingUpdateCheck = check;
  activationDeferred = false;
  activationError = null;
  showVersionUpdateBanner(registration);
  activationTimer = globalThis.setTimeout(() => {
    if (pendingUpdateCheck !== check) return;
    clearPendingActivation();
    activationError = 'timeout';
    showVersionUpdateBanner(registration);
  }, UPDATE_ACTIVATION_TIMEOUT_MS);
  Promise.resolve().then(() => pendingUpdateCheck === check ? registration.update!() : undefined).then(() => {
    if (pendingUpdateCheck !== check) return;
    clearPendingActivation();
    activationError = getServiceWorker(registration) ? null : 'unavailable';
    showVersionUpdateBanner(registration);
  }).catch(() => {
    if (pendingUpdateCheck !== check) return;
    clearPendingActivation();
    activationError = 'failed';
    showVersionUpdateBanner(registration);
  });
  return true;
}

export function applyPendingServiceWorkerUpdate(registration: UpdateRegistrationView | null = pendingRegistration) {
  if (requestedWorker || pendingUpdateCheck) return false;
  if (reloadAvailable) {
    hideVersionUpdateBanner();
    reloadPage();
    return true;
  }

  const waitingWorker = getServiceWorker(registration);
  if (!waitingWorker) {
    const offeredHere = registration === pendingRegistration && !!document.getElementById(UPDATE_BANNER_ID);
    return !!registration && !!(activationError || activationDeferred || offeredHere) && retryMissingWaitingWorker(registration);
  }
  pendingRegistration = registration;
  requestedWorker = waitingWorker;
  activationDeferred = false;
  activationError = null;
  showVersionUpdateBanner(registration);
  const requestedContainer = registeredContainer;
  activationTimer = globalThis.setTimeout(() => {
    if (requestedWorker !== waitingWorker) return;
    clearPendingActivation();
    reloadAvailable = requestedContainer?.controller === waitingWorker;
    activationError = reloadAvailable ? null : 'timeout';
    showVersionUpdateBanner(registration);
  }, UPDATE_ACTIVATION_TIMEOUT_MS);
  try {
    if (!waitingWorker.postMessage) throw new Error('Update worker is unavailable');
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
  } catch {
    clearPendingActivation();
    activationError = 'failed';
    showVersionUpdateBanner(registration);
    return false;
  }
}

export function watchServiceWorkerRegistration(
  registration: UpdateRegistrationView | null | undefined,
  serviceWorkerContainer: UpdateContainerView | null | undefined = typeof navigator !== 'undefined' ? navigator.serviceWorker : null
) {
  if (!registration || !serviceWorkerContainer) return;

  if (registration.waiting && serviceWorkerContainer.controller) {
    showVersionUpdateBanner(registration);
  }

  registration.addEventListener!('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;
    // WebKit can claim the first page before delivering the installed event.
    // Decide whether this replaces an existing worker when installation starts.
    const replacesController = !!serviceWorkerContainer.controller;

    installingWorker.addEventListener!('statechange', () => {
      if (installingWorker.state === 'installed'
          && replacesController
          && canPromptForUpdate(registration, serviceWorkerContainer)) {
        dismissedWaitingWorker = null;
        if (requestedWorker !== installingWorker) {
          clearPendingActivation();
          activationDeferred = false;
          activationError = null;
        }
        reloadAvailable = false;
        showVersionUpdateBanner(registration);
      }
    });
  });
}

export async function checkForAppVersionUpdate(
  registration: UpdateRegistrationView | null | undefined,
  serviceWorkerContainer: UpdateContainerView | null | undefined,
  win: UpdateWindowView | null = getDefaultServiceWorkerWindow(),
  options: VersionCheckOptions = {}
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
    const remoteVersion = parseAppVersionScript(await response.text!());
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

function requestServiceWorkerUpdateForReload(registration: UpdateRegistrationView | null | undefined, serviceWorkerContainer: UpdateContainerView | null | undefined) {
  if (!registration?.update) return;
  registration.update().then(() => {
    if (canPromptForUpdate(registration, serviceWorkerContainer)) {
      showVersionUpdateBanner(registration);
    }
  }).catch(() => {});
}

function scheduleServiceWorkerUpdateChecks(registration: UpdateRegistrationView | null | undefined, serviceWorkerContainer: UpdateContainerView | null | undefined, win: UpdateWindowView | null) {
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

async function unregisterDevServiceWorkers(serviceWorkerContainer: UpdateContainerView, cacheStorage: CacheStorage | null) {
  const registrations = await serviceWorkerContainer.getRegistrations!();
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
} : UpdateRuntimeOptions = {}) {
  if (!win || !serviceWorkerContainer) return null;

  if (!shouldRegisterServiceWorker(win.location)) {
    if (isDevServiceWorkerHost(win.location!.hostname)) {
      unregisterDevServiceWorkers(serviceWorkerContainer, cacheStorage).catch(() => {});
    }
    return null;
  }

  try {
    const registration = await serviceWorkerContainer.register!('/service-worker.js', { updateViaCache: 'none' });
    registeredContainer = serviceWorkerContainer;
    reloadPage = () => win.location!.reload();
    win.addEventListener?.('pagehide', suspendVersionUpdateBanner);
    const reportClientBuildTo = (...workers: Array<UpdateWorkerView | null | undefined>) => {
      const id = typeof win.APP_BUILD_ID === 'string' ? win.APP_BUILD_ID.trim() : '';
      if (!/^[a-z\d._-]{1,128}$/i.test(id)) return;
      for (const worker of new Set(workers)) {
        try {
          worker?.postMessage?.({ type: 'CLIENT_BUILD_ID', buildId: id });
        } catch { /* A closed recipient cannot prevent another worker's reply. */ }
      }
    };
    const reportClientBuild = () => {
      reportClientBuildTo(serviceWorkerContainer.controller as UpdateWorkerView | null | undefined);
    };
    serviceWorkerContainer.addEventListener?.('message', (event: MessageEvent<unknown>) => {
      const type = (event.data as { type?: unknown } | null | undefined)?.type;
      const active = serviceWorkerContainer.controller as UpdateWorkerView | null | undefined;
      const waiting = registration.waiting;
      if (type === 'REQUEST_CLIENT_BUILD_ID') {
        // A waiting worker needs a direct reply; reporting only to the active
        // controller cannot establish that the open document is safe to update.
        if (event.source && event.source !== active && event.source !== waiting) return;
        reportClientBuildTo(active, event.source === waiting ? waiting : null);
      } else if (type === 'UPDATE_ACTIVATION_DEFERRED' && requestedWorker
        && waiting === requestedWorker && event.source === requestedWorker) {
        clearPendingActivation();
        activationError = null;
        activationDeferred = true;
        dismissedWaitingWorker = null;
        showVersionUpdateBanner(registration);
      }
    });
    win.addEventListener?.('focus', reportClientBuild);
    win.addEventListener?.('pageshow', event => {
      if (!event.persisted) return;
      // BFCache restores the same document after pagehide cleared its intent.
      // Reoffer waiting updates or an installed version's manual Reload action,
      // without a throttled check or automatic consent from before page exit.
      reportClientBuild();
      if (reloadAvailable || canPromptForUpdate(registration, serviceWorkerContainer)) showVersionUpdateBanner(registration);
    });
    reportClientBuild();
    let refreshing = false;
    let controller = serviceWorkerContainer.controller;
    serviceWorkerContainer.addEventListener!('controllerchange', () => {
      const nextController = serviceWorkerContainer.controller;
      if (refreshing || !nextController || nextController === controller) return;
      const previousController = controller;
      controller = nextController;
      const requestedReplacement = nextController === requestedWorker;
      clearPendingActivation();
      activationDeferred = false;
      activationError = null;
      reportClientBuild();
      // A first install claims an already current page. Only replacement of
      // an existing controller is evidence that this page needs a reload.
      if (!previousController && !requestedReplacement) return;
      if (!requestedReplacement) {
        reloadAvailable = true;
        showVersionUpdateBanner(registration);
        return;
      }
      refreshing = true;
      hideVersionUpdateBanner();
      win.location!.reload();
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
} : RegistrationScheduleOptions = {}) {
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
