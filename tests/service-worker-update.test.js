// @vitest-environment jsdom

import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let serviceWorkerUpdate;
const serviceWorkerUpdateSrc = readFileSync('js/service-worker-update.js', 'utf8');

beforeEach(async () => {
  vi.resetModules();
  serviceWorkerUpdate = await import('../js/service-worker-update.js');
});

afterEach(() => {
  serviceWorkerUpdate?.hideVersionUpdateBanner();
  serviceWorkerUpdate = null;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('service worker update prompt', () => {
  it('delegates default browser globals through runtime helpers', () => {
    expect(serviceWorkerUpdateSrc).toContain('function getDefaultServiceWorkerWindow()');
    expect(serviceWorkerUpdateSrc).toContain('getDefaultServiceWorkerWindow()?.location || null');
    expect(serviceWorkerUpdateSrc).toContain('getDefaultCacheStorage()');
    expect(serviceWorkerUpdateSrc).not.toMatch(/\bwindow(?:\.|\s*\[)/);
  });

  it('keeps development service workers opt-in only', () => {
    const { shouldRegisterServiceWorker } = serviceWorkerUpdate;

    expect(shouldRegisterServiceWorker({ hostname: 'localhost', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: '127.0.0.1', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: 'preview.local', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: 'localhost', search: '?dev-sw=1' })).toBe(true);
    expect(shouldRegisterServiceWorker({ hostname: 'getbased.health', search: '' })).toBe(true);
    expect(shouldRegisterServiceWorker({ hostname: 'tauri.localhost', search: '' })).toBe(true);
  });

  it('turns a secondary-tab controllerchange into a reload prompt', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate;
    let onControllerChange = null;
    const reload = vi.fn();
    const registration = {
      waiting: null,
      addEventListener: vi.fn(),
    };
    const serviceWorkerContainer = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn((type, listener) => {
        if (type === 'controllerchange') onControllerChange = listener;
      }),
    };

    await registerServiceWorkerUpdates({
      win: { location: { hostname: 'getbased.health', search: '', reload } },
      serviceWorkerContainer,
      cacheStorage: null,
    });

    onControllerChange();
    const banner = document.getElementById('version-update-banner');
    expect(reload).not.toHaveBeenCalled();
    expect(banner.textContent).toContain('Reload');

    banner.querySelector('[data-version-update-action="apply"]').click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('registers with lightweight five-minute version checks for open tabs', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate;
    let intervalCallback = null;
    const fetchVersion = vi.fn(async () => new Response("self.APP_VERSION = '1.2.3';"));
    const registration = {
      waiting: null,
      addEventListener: vi.fn(),
      update: vi.fn(async () => {}),
    };
    const win = {
      APP_VERSION: '1.2.3',
      fetch: fetchVersion,
      location: { hostname: 'getbased.health', search: '', reload: vi.fn() },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
      performance: { getEntriesByType: vi.fn(() => [{ type: 'navigate' }]) },
      document: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      setInterval: vi.fn((callback) => {
        intervalCallback = callback;
        return 1;
      }),
    };
    const serviceWorkerContainer = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn(),
    };

    await registerServiceWorkerUpdates({
      win,
      serviceWorkerContainer,
      cacheStorage: null,
    });

    expect(serviceWorkerContainer.register).toHaveBeenCalledWith('/service-worker.js', { updateViaCache: 'none' });
    expect(fetchVersion).toHaveBeenCalledWith('/version.js?update-check=1', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(registration.update).not.toHaveBeenCalled();
    expect(win.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(win.document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    expect(intervalCallback).toEqual(expect.any(Function));
  });

  it('uses an explicit reload to request a full worker update immediately', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate;
    const registration = {
      waiting: null,
      addEventListener: vi.fn(),
      update: vi.fn(async () => {}),
    };
    const fetchVersion = vi.fn();
    const win = {
      APP_VERSION: '1.2.3',
      fetch: fetchVersion,
      location: { hostname: 'getbased.health', search: '', reload: vi.fn() },
      performance: { getEntriesByType: vi.fn(() => [{ type: 'reload' }]) },
      document: { visibilityState: 'visible', addEventListener: vi.fn() },
      addEventListener: vi.fn(),
      setInterval: vi.fn(),
    };
    const serviceWorkerContainer = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn(),
    };

    await registerServiceWorkerUpdates({ win, serviceWorkerContainer, cacheStorage: null });

    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(fetchVersion).not.toHaveBeenCalled();
  });

  it('detects a new version cheaply and installs only after the update action', async () => {
    const { checkForAppVersionUpdate } = serviceWorkerUpdate;
    const waiting = { postMessage: vi.fn() };
    const registration = {
      waiting: null,
      installing: null,
      update: vi.fn(async () => {
        registration.waiting = waiting;
      }),
    };
    const serviceWorkerContainer = { controller: {} };
    const win = {
      APP_VERSION: '1.2.3',
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
    };
    const fetchImpl = vi.fn(async () => new Response("self.APP_VERSION = '1.2.4';"));

    await expect(checkForAppVersionUpdate(
      registration,
      serviceWorkerContainer,
      win,
      { force: true, fetchImpl }
    )).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(registration.update).not.toHaveBeenCalled();
    const banner = document.getElementById('version-update-banner');
    expect(banner.textContent).toContain('New version available');

    banner.querySelector('[data-version-update-action="apply"]').click();
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    expect(document.getElementById('version-update-banner')).toBeNull();
  });

  it('shares the version-check throttle across tabs while allowing forced reload checks', async () => {
    const { checkForAppVersionUpdate } = serviceWorkerUpdate;
    const stored = new Map();
    const localStorage = {
      getItem: vi.fn((key) => stored.get(key) || null),
      setItem: vi.fn((key, value) => stored.set(key, value)),
    };
    const win = { APP_VERSION: '1.2.3', localStorage };
    const registration = { waiting: null };
    const serviceWorkerContainer = { controller: {} };
    const firstFetch = vi.fn(async () => new Response("self.APP_VERSION = '1.2.3';"));
    const secondFetch = vi.fn(async () => new Response("self.APP_VERSION = '1.2.3';"));

    await checkForAppVersionUpdate(registration, serviceWorkerContainer, win, { fetchImpl: firstFetch });
    await checkForAppVersionUpdate(registration, serviceWorkerContainer, win, { fetchImpl: secondFetch });
    expect(firstFetch).toHaveBeenCalledTimes(1);
    expect(secondFetch).not.toHaveBeenCalled();

    await checkForAppVersionUpdate(registration, serviceWorkerContainer, win, {
      force: true,
      fetchImpl: secondFetch,
    });
    expect(secondFetch).toHaveBeenCalledTimes(1);
  });

  it('recognizes explicit reload navigations and parses the deployed version script', () => {
    const { isReloadNavigation, parseAppVersionScript } = serviceWorkerUpdate;

    expect(isReloadNavigation({ performance: { getEntriesByType: () => [{ type: 'reload' }] } })).toBe(true);
    expect(isReloadNavigation({ performance: { getEntriesByType: () => [{ type: 'navigate' }] } })).toBe(false);
    expect(parseAppVersionScript("self.APP_VERSION = '1.10.182';")).toBe('1.10.182');
    expect(parseAppVersionScript('not a version script')).toBe('');
  });

  it('shows a banner and activates only from the update action', () => {
    const { showVersionUpdateBanner } = serviceWorkerUpdate;
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting };

    expect(showVersionUpdateBanner(registration)).toBe(true);
    const banner = document.getElementById('version-update-banner');
    expect(banner).not.toBeNull();
    expect(banner.querySelector('.version-update-copy-short')).toBeNull();
    expect(banner.textContent).toContain('New version available. Update when you are ready.');
    expect(document.body.classList.contains('version-update-visible')).toBe(true);
    expect(waiting.postMessage).not.toHaveBeenCalled();

    banner.querySelector('[data-version-update-action="apply"]').click();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(document.body.classList.contains('version-update-visible')).toBe(false);
  });

  it('dismisses the current waiting worker without activating it', () => {
    const { showVersionUpdateBanner } = serviceWorkerUpdate;
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting };

    showVersionUpdateBanner(registration);
    document.querySelector('[data-version-update-action="dismiss"]').click();

    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(showVersionUpdateBanner(registration)).toBe(false);
  });

  it('returns false when no waiting worker is available', () => {
    const { applyPendingServiceWorkerUpdate } = serviceWorkerUpdate;

    expect(applyPendingServiceWorkerUpdate({ waiting: null })).toBe(false);
  });
});
