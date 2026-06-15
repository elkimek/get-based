// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let serviceWorkerUpdate;

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

  it('registers with fresh update checks for open tabs', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate;
    let intervalCallback = null;
    const registration = {
      waiting: null,
      addEventListener: vi.fn(),
      update: vi.fn(async () => {}),
    };
    const win = {
      location: { hostname: 'getbased.health', search: '', reload: vi.fn() },
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
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(win.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(win.document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(win.setInterval).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);
    expect(intervalCallback).toEqual(expect.any(Function));
  });

  it('shows a banner and activates only from the update action', () => {
    const { showVersionUpdateBanner } = serviceWorkerUpdate;
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting };

    expect(showVersionUpdateBanner(registration)).toBe(true);
    const banner = document.getElementById('version-update-banner');
    expect(banner).not.toBeNull();
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
