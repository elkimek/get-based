// @vitest-environment jsdom

import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateWorkerView, UpdateRegistrationView, UpdateContainerView } from '../js/service-worker-update.js';

let serviceWorkerUpdate: typeof import('../js/service-worker-update.js') | null;
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
  it('does not offer the first install when its controller claim arrives before installed', () => {
    let onUpdateFound: (() => void) | undefined;
    let onStateChange: (() => void) | undefined;
    const container: UpdateContainerView = { controller: null };
    const registration: UpdateRegistrationView = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn((type: unknown, listener: unknown) => { if (type === 'updatefound') onUpdateFound = listener as () => void; }),
    };
    serviceWorkerUpdate!.watchServiceWorkerRegistration(registration, container);
    const firstWorker: UpdateWorkerView = { state: 'installing', addEventListener: vi.fn((_: unknown, listener: unknown) => { onStateChange = listener as () => void; }) };
    registration.installing = firstWorker;
    onUpdateFound!();
    container.controller = firstWorker;
    firstWorker.state = 'installed';
    onStateChange!();
    expect(document.getElementById('version-update-banner')).toBeNull();

    const replacement: UpdateWorkerView = { state: 'installing', addEventListener: vi.fn((_: unknown, listener: unknown) => { onStateChange = listener as () => void; }) };
    registration.installing = replacement;
    onUpdateFound!();
    replacement.state = 'installed';
    onStateChange!();
    expect(document.getElementById('version-update-banner')!.textContent).toContain('Update ready');
  });

  it('delegates default browser globals through runtime helpers', () => {
    expect(serviceWorkerUpdateSrc).toContain('function getDefaultServiceWorkerWindow()');
    expect(serviceWorkerUpdateSrc).toContain('getDefaultServiceWorkerWindow()?.location || null');
    expect(serviceWorkerUpdateSrc).toContain('getDefaultCacheStorage()');
    expect(serviceWorkerUpdateSrc).not.toMatch(/\bwindow(?:\.|\s*\[)/);
  });

  it('keeps development service workers opt-in only', () => {
    const { shouldRegisterServiceWorker } = serviceWorkerUpdate!;

    expect(shouldRegisterServiceWorker({ hostname: 'localhost', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: '127.0.0.1', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: 'preview.local', search: '' })).toBe(false);
    expect(shouldRegisterServiceWorker({ hostname: 'localhost', search: '?dev-sw=1' })).toBe(true);
    expect(shouldRegisterServiceWorker({ hostname: 'getbased.health', search: '' })).toBe(true);
    expect(shouldRegisterServiceWorker({ hostname: 'tauri.localhost', search: '' })).toBe(true);
  });

  it('waits for page load and browser idle time before registration', async () => {
    const { scheduleServiceWorkerRegistration } = serviceWorkerUpdate!;
    let onLoad: (() => void) | null = null;
    let onIdle: (() => void) | null = null;
    const register = vi.fn(async () => null);
    const win = {
      document: { readyState: 'loading' as const },
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'load') onLoad = listener as () => void;
      }),
      requestIdleCallback: vi.fn((callback: unknown) => {
        onIdle = callback as () => void;
        return 1;
      }),
    };
    const serviceWorkerContainer = {};

    expect(scheduleServiceWorkerRegistration({
      win,
      serviceWorkerContainer,
      cacheStorage: null,
      register,
    })).toBe(true);
    expect(register).not.toHaveBeenCalled();
    expect(win.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });

    onLoad!();
    expect(register).not.toHaveBeenCalled();
    expect(win.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });

    onIdle!();
    expect(register).toHaveBeenCalledWith({ win, serviceWorkerContainer, cacheStorage: null });
  });

  it('turns a secondary-tab controllerchange into a reload prompt', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate!;
    let onControllerChange: (() => void) | null = null;
    const reload = vi.fn();
    const registration = {
      waiting: null,
      addEventListener: vi.fn(),
    };
    const serviceWorkerContainer: UpdateContainerView = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'controllerchange') onControllerChange = listener as () => void;
      }),
    };

    await registerServiceWorkerUpdates({
      win: { location: { hostname: 'getbased.health', search: '', reload } },
      serviceWorkerContainer,
      cacheStorage: null,
    });

    serviceWorkerContainer.controller = {};
    onControllerChange!();
    const banner = document.getElementById('version-update-banner');
    expect(reload).not.toHaveBeenCalled();
    expect(banner!.textContent).toContain('Reload');

    banner!.querySelector<HTMLElement>('[data-version-update-action="apply"]')!.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores initial claims and repeated controller notifications but prompts for a later replacement', async () => {
    let onControllerChange: (() => void) | undefined;
    const reload = vi.fn();
    const registration = { waiting: null, addEventListener: vi.fn() };
    const serviceWorkerContainer: UpdateContainerView = {
      controller: null,
      register: vi.fn(async () => registration),
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'controllerchange') onControllerChange = listener as () => void;
      }),
    };
    await serviceWorkerUpdate!.registerServiceWorkerUpdates({
      win: { location: { hostname: 'getbased.health', search: '', reload } },
      serviceWorkerContainer,
      cacheStorage: null,
    });
    onControllerChange!();
    serviceWorkerContainer.controller = {};
    onControllerChange!();
    onControllerChange!();
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(reload).not.toHaveBeenCalled();

    serviceWorkerContainer.controller = {};
    onControllerChange!();
    expect(document.getElementById('version-update-banner')!.textContent)
      .toContain('New version installed');
  });

  it('does not prompt after reload when the existing controller is reported again', async () => {
    let onControllerChange: (() => void) | undefined;
    const serviceWorkerContainer: UpdateContainerView = {
      controller: {},
      register: vi.fn(async () => ({ waiting: null, addEventListener: vi.fn() })),
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'controllerchange') onControllerChange = listener as () => void;
      }),
    };
    await serviceWorkerUpdate!.registerServiceWorkerUpdates({
      win: {
        location: { hostname: 'getbased.health', search: '', reload: vi.fn() },
        performance: { getEntriesByType: () => [{ type: 'reload' }] },
      },
      serviceWorkerContainer,
      cacheStorage: null,
    });
    onControllerChange!();
    expect(document.getElementById('version-update-banner')).toBeNull();
  });

  it.each([false, true])('preserves the previous controller across null notifications (requested=%s)', async requested => {
    let onControllerChange: (() => void) | undefined;
    const reload = vi.fn();
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting: requested ? waiting : null, addEventListener: vi.fn() };
    const original = {};
    const container: UpdateContainerView = {
      controller: original,
      register: vi.fn(async () => registration),
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'controllerchange') onControllerChange = listener as () => void;
      }),
    };
    await serviceWorkerUpdate!.registerServiceWorkerUpdates({
      win: { location: { hostname: 'getbased.health', search: '', reload } },
      serviceWorkerContainer: container, cacheStorage: null,
    });
    if (requested) {
      document.querySelector<HTMLElement>('[data-version-update-action="apply"]')!.click();
      await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
    }
    container.controller = null;
    onControllerChange!();
    container.controller = original;
    onControllerChange!();
    expect(reload).not.toHaveBeenCalled();
    if (!requested) expect(document.getElementById('version-update-banner')).toBeNull();
    container.controller = null;
    onControllerChange!();
    container.controller = {};
    onControllerChange!();
    if (requested) {
      expect(reload).toHaveBeenCalledTimes(1);
      onControllerChange!();
      container.controller = {};
      onControllerChange!();
      expect(reload).toHaveBeenCalledTimes(1);
    } else {
      expect(reload).not.toHaveBeenCalled();
      expect(document.getElementById('version-update-banner')!.textContent).toContain('New version installed');
    }
  });

  it('registers with lightweight five-minute version checks for open tabs', async () => {
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate!;
    let intervalCallback: (() => void) | null = null;
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
        visibilityState: 'visible' as const,
        addEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      setInterval: vi.fn((callback: unknown) => {
        intervalCallback = callback as () => void;
        return 1;
      }),
    };
    const serviceWorkerContainer: UpdateContainerView = {
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
    const { registerServiceWorkerUpdates } = serviceWorkerUpdate!;
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
      document: { visibilityState: 'visible' as const, addEventListener: vi.fn() },
      addEventListener: vi.fn(),
      setInterval: vi.fn(),
    };
    const serviceWorkerContainer: UpdateContainerView = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn(),
    };

    await registerServiceWorkerUpdates({ win, serviceWorkerContainer, cacheStorage: null });

    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(fetchVersion).not.toHaveBeenCalled();
  });

  it('stages a same-version build silently and offers reload only when ready', async () => {
    let installed: (() => void) | undefined;
    const worker = { state: 'installing' as ServiceWorkerState, postMessage: vi.fn(), addEventListener: vi.fn((_: unknown, cb: unknown) => { installed = cb as () => void; }) };
    let found: (() => void) | undefined;
    const registration = {
      waiting: null as UpdateWorkerView | null, installing: null as UpdateWorkerView | null,
      addEventListener: vi.fn((_: unknown, cb: unknown) => { found = cb as () => void; }),
      update: vi.fn(async () => { registration.installing = worker; found!(); }),
    };
    const container: UpdateContainerView = { controller: {} };
    serviceWorkerUpdate!.watchServiceWorkerRegistration(registration, container);
    const win = { APP_VERSION: '1.2.3', APP_BUILD_ID: 'build-a' };
    const fetchImpl = vi.fn(async () => new Response("self.APP_VERSION = '1.2.3'; self.APP_BUILD_ID = 'build-b';"));
    await expect(serviceWorkerUpdate!.checkForAppVersionUpdate(registration, container, win,
      { force: true, fetchImpl })).resolves.toBe(true);
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.state = 'installed'; registration.waiting = worker; installed!();
    expect(document.getElementById('version-update-banner')!.textContent).toContain('Update ready');
    document.querySelector<HTMLElement>('[data-version-update-action="apply"]')!.click();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('ignores unchanged builds and silently retries failed background updates', async () => {
    const registration = { waiting: null, update: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined) };
    const container: UpdateContainerView = { controller: {} };
    const win = { APP_VERSION: '1.2.3', APP_BUILD_ID: 'build-b' };
    const same = { force: true, fetchImpl: async () => new Response("self.APP_BUILD_ID = 'build-b';") };
    expect(await serviceWorkerUpdate!.checkForAppVersionUpdate(registration, container, win, same)).toBe(false);
    expect(registration.update).not.toHaveBeenCalled();
    // A rollback is also a different deployed build, not a semver comparison.
    const previous = { force: true, fetchImpl: async () => new Response("self.APP_BUILD_ID = 'build-a';") };
    expect(await serviceWorkerUpdate!.checkForAppVersionUpdate(registration, container, win, previous)).toBe(false);
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(await serviceWorkerUpdate!.checkForAppVersionUpdate(registration, container, win, previous)).toBe(true);
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(document.getElementById('version-update-banner')).toBeNull();
  });

  it('silently treats offline probe 503 as unavailable without parsing metadata or requesting an update', async () => {
    const response = new Response(null, {status: 503, headers: {'Cache-Control': 'no-store'}});
    const readMetadata = vi.spyOn(response, 'text');
    const fetchImpl = vi.fn(async () => response);
    const waiting = {postMessage: vi.fn()};
    const registration = {waiting, update: vi.fn(async () => {})};
    const container: UpdateContainerView = {controller: {}};
    const win = {APP_VERSION: '1.2.3', APP_BUILD_ID: 'build-a'};
    await expect(serviceWorkerUpdate!.checkForAppVersionUpdate(registration, container, win,
      {force: true, fetchImpl})).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('/version.js?update-check=1', {
      cache: 'no-store', credentials: 'same-origin',
    });
    expect(readMetadata).not.toHaveBeenCalled(); expect(response.bodyUsed).toBe(false);
    expect(registration.update).not.toHaveBeenCalled(); expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(document.body.classList.contains('version-update-visible')).toBe(false);
  });

  it('shares the version-check throttle across tabs while allowing forced reload checks', async () => {
    const { checkForAppVersionUpdate } = serviceWorkerUpdate!;
    const stored = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((key: string) => stored.get(key) || null),
      setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
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
    const { isReloadNavigation, parseAppVersionScript } = serviceWorkerUpdate!;

    expect(isReloadNavigation({ performance: { getEntriesByType: () => [{ type: 'reload' }] } })).toBe(true);
    expect(isReloadNavigation({ performance: { getEntriesByType: () => [{ type: 'navigate' }] } })).toBe(false);
    expect(parseAppVersionScript("self.APP_VERSION = '1.10.182';")).toBe('1.10.182');
    expect(parseAppVersionScript('not a version script')).toBe('');
  });

  it('shows a banner and activates only from the update action', () => {
    const { showVersionUpdateBanner } = serviceWorkerUpdate!;
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting };

    expect(showVersionUpdateBanner(registration)).toBe(true);
    const banner = document.getElementById('version-update-banner');
    expect(banner).not.toBeNull();
    expect(banner!.querySelector('.version-update-copy-short')).toBeNull();
    expect(banner!.textContent).toContain('Update ready. Reload when you are ready.');
    expect(document.body.classList.contains('version-update-visible')).toBe(true);
    expect(waiting.postMessage).not.toHaveBeenCalled();

    banner!.querySelector<HTMLElement>('[data-version-update-action="apply"]')!.click();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(document.body.classList.contains('version-update-visible')).toBe(false);
  });

  it('dismisses the current waiting worker without activating it', () => {
    const { showVersionUpdateBanner } = serviceWorkerUpdate!;
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting };

    showVersionUpdateBanner(registration);
    document.querySelector<HTMLElement>('[data-version-update-action="dismiss"]')!.click();

    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(showVersionUpdateBanner(registration)).toBe(false);
  });

  it('returns false when no waiting worker is available', () => {
    const { applyPendingServiceWorkerUpdate } = serviceWorkerUpdate!;

    expect(applyPendingServiceWorkerUpdate({ waiting: null })).toBe(false);
  });
});


it('reports the document build to a replacement controller without confusing it with the new worker build', async () => {
  const oldWorker = { postMessage: vi.fn() }, nextWorker = { postMessage: vi.fn() };
  let changed: (() => void) | undefined;
  let requested: ((event: MessageEvent<unknown>) => void) | undefined;
  const container: UpdateContainerView = { controller: oldWorker,
    register: vi.fn(async () => ({ waiting: null, addEventListener: vi.fn() })),
    addEventListener: vi.fn((type: unknown, listener: unknown) => {
      if (type === 'controllerchange') changed = listener as () => void;
      if (type === 'message') requested = listener as (event: MessageEvent<unknown>) => void;
    }) };
  await serviceWorkerUpdate!.registerServiceWorkerUpdates({
    win: { APP_BUILD_ID: 'old-document', location: { hostname: 'getbased.health', search: '', reload: vi.fn() } },
    serviceWorkerContainer: container, cacheStorage: null,
  });
  expect(oldWorker.postMessage).toHaveBeenCalledWith({ type: 'CLIENT_BUILD_ID', buildId: 'old-document' });
  container.controller = nextWorker; changed!();
  expect(nextWorker.postMessage).toHaveBeenCalledWith({ type: 'CLIENT_BUILD_ID', buildId: 'old-document' });
  requested!(new MessageEvent('message', { data: { type: 'REQUEST_CLIENT_BUILD_ID' } }));
  expect(nextWorker.postMessage).toHaveBeenCalledTimes(2);
});

async function directWaitingFixture(buildId = 'original-document') {
  const active = { postMessage: vi.fn() };
  const waiting = { state: 'installed' as const, postMessage: vi.fn() };
  const reload = vi.fn();
  let message: ((event: MessageEvent<unknown>) => void) | undefined;
  let changed: (() => void) | undefined;
  const registration: UpdateRegistrationView = { waiting, addEventListener: vi.fn() };
  const container: UpdateContainerView = {
    controller: active,
    register: vi.fn(async () => registration),
    addEventListener: vi.fn((type: unknown, listener: unknown) => {
      if (type === 'message') message = listener as (event: MessageEvent<unknown>) => void;
      if (type === 'controllerchange') changed = listener as () => void;
    }),
  };
  await serviceWorkerUpdate!.registerServiceWorkerUpdates({
    win: { APP_BUILD_ID: buildId, location: { hostname: 'getbased.health', search: '', reload } },
    serviceWorkerContainer: container,
    cacheStorage: null,
  });
  active.postMessage.mockClear();
  const receive = (type: string, source: UpdateWorkerView | null = waiting, extra: Record<string, unknown> = {}) => {
    const event = new MessageEvent<unknown>('message', { data: { type, ...extra } });
    // JSDOM has no ServiceWorker constructor; retain real MessageEvent behavior
    // with the exact configured worker object as its browser-owned source.
    Object.defineProperty(event, 'source', { value: source });
    message!(event);
  };
  return { active, waiting, reload, registration, container, receive, changed: () => changed!() };
}

describe('direct waiting-worker identity and deferred update notice', () => {
  it('replies directly to the waiting source and the current controller with the document build', async () => {
    const fixture = await directWaitingFixture();
    fixture.receive('REQUEST_CLIENT_BUILD_ID');
    const expected = { type: 'CLIENT_BUILD_ID', buildId: 'original-document' };
    expect(fixture.active.postMessage).toHaveBeenCalledExactlyOnceWith(expected);
    expect(fixture.waiting.postMessage).toHaveBeenCalledExactlyOnceWith(expected);
    expect(fixture.reload).not.toHaveBeenCalled();
  });

  it('does not duplicate an active-source reply and preserves missing-source active reports', async () => {
    const fixture = await directWaitingFixture();
    fixture.receive('REQUEST_CLIENT_BUILD_ID', fixture.active);
    expect(fixture.active.postMessage).toHaveBeenCalledTimes(1);
    expect(fixture.waiting.postMessage).not.toHaveBeenCalled();
    fixture.receive('REQUEST_CLIENT_BUILD_ID', null);
    expect(fixture.active.postMessage).toHaveBeenCalledTimes(2);
    expect(fixture.waiting.postMessage).not.toHaveBeenCalled();
  });

  it('does not send an identity to an unrelated message source', async () => {
    const fixture = await directWaitingFixture();
    const foreign = { postMessage: vi.fn() };
    fixture.receive('REQUEST_CLIENT_BUILD_ID', foreign);
    expect(foreign.postMessage).not.toHaveBeenCalled();
    expect(fixture.active.postMessage).not.toHaveBeenCalled();
    expect(fixture.waiting.postMessage).not.toHaveBeenCalled();
  });

  it('does not trust an installed worker that is not the registration waiting worker', async () => {
    const fixture = await directWaitingFixture();
    const installing = { state: 'installed' as const, postMessage: vi.fn() };
    fixture.registration.waiting = null;
    fixture.registration.installing = installing;
    fixture.receive('REQUEST_CLIENT_BUILD_ID', installing);
    expect(installing.postMessage).not.toHaveBeenCalled();
    expect(fixture.active.postMessage).not.toHaveBeenCalled();
  });

  it('still directly replies when the previous controller has become unavailable', async () => {
    const fixture = await directWaitingFixture();
    fixture.active.postMessage.mockImplementation(() => { throw new Error('Previous worker closed'); });
    fixture.receive('REQUEST_CLIENT_BUILD_ID');
    expect(fixture.waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'CLIENT_BUILD_ID', buildId: 'original-document' });
    expect(fixture.reload).not.toHaveBeenCalled();
  });

  it.each(['', '../invalid-build', 'a'.repeat(129)])('never directly reports an invalid document build: %s', async build => {
    const fixture = await directWaitingFixture(build);
    fixture.receive('REQUEST_CLIENT_BUILD_ID');
    expect(fixture.active.postMessage).not.toHaveBeenCalled();
    expect(fixture.waiting.postMessage).not.toHaveBeenCalled();
  });

  it('shows the existing accessible banner after a genuine pending activation is deferred', async () => {
    const fixture = await directWaitingFixture();
    expect(serviceWorkerUpdate!.applyPendingServiceWorkerUpdate(fixture.registration)).toBe(true);
    expect(fixture.waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
    expect(document.getElementById('version-update-banner')).toBeNull();
    fixture.receive('UPDATE_ACTIVATION_DEFERRED', fixture.waiting, { reason: '<img src=x onerror=alert(1)>' });
    const banner = document.getElementById('version-update-banner')!;
    expect(banner.textContent).toContain('Update paused to protect open tabs. Close all getbased tabs and app windows, then reopen getbased to finish updating.');
    expect(banner.getAttribute('role')).toBe('region');
    expect(banner.getAttribute('aria-label')).toBe('App update paused');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.getAttribute('aria-busy')).toBe('false');
    expect(banner.querySelector('img')).toBeNull();
    expect(banner.querySelector<HTMLButtonElement>('[data-version-update-action="apply"]')!.disabled).toBe(false);
    expect(banner.querySelector<HTMLButtonElement>('[data-version-update-action="dismiss"]')!.disabled).toBe(false);
    expect(document.body.classList.contains('version-update-visible')).toBe(true);
    expect(fixture.reload).not.toHaveBeenCalled();
  });

  it('ignores unsolicited or unrelated deferral messages and keeps the pending request intact', async () => {
    const fixture = await directWaitingFixture();
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    expect(document.getElementById('version-update-banner')!.textContent).not.toContain('Update paused');
    serviceWorkerUpdate!.applyPendingServiceWorkerUpdate(fixture.registration);
    fixture.receive('UPDATE_ACTIVATION_DEFERRED', fixture.active);
    expect(document.getElementById('version-update-banner')).toBeNull();
    fixture.receive('UPDATE_ACTIVATION_DEFERRED', { postMessage: vi.fn() });
    expect(document.getElementById('version-update-banner')).toBeNull();
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    expect(document.getElementById('version-update-banner')!.textContent).toContain('Update paused');
  });

  it('clears pending reload intent after deferral so a later replacement cannot force a reload', async () => {
    const fixture = await directWaitingFixture();
    serviceWorkerUpdate!.applyPendingServiceWorkerUpdate(fixture.registration);
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    fixture.container.controller = { postMessage: vi.fn() };
    fixture.changed();
    expect(fixture.reload).not.toHaveBeenCalled();
    expect(document.getElementById('version-update-banner')!.textContent).toContain('New version installed');
  });

  it('retains the existing retry action and reloads only after that requested replacement activates', async () => {
    const fixture = await directWaitingFixture();
    serviceWorkerUpdate!.applyPendingServiceWorkerUpdate(fixture.registration);
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    document.querySelector<HTMLButtonElement>('[data-version-update-action="apply"]')!.click();
    expect(fixture.waiting.postMessage).toHaveBeenCalledTimes(2);
    expect(fixture.waiting.postMessage.mock.calls[1]).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(fixture.reload).not.toHaveBeenCalled();
    fixture.container.controller = { postMessage: vi.fn() };
    fixture.changed();
    expect(fixture.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps Later dismissal effective against duplicate deferred notices', async () => {
    const fixture = await directWaitingFixture();
    serviceWorkerUpdate!.applyPendingServiceWorkerUpdate(fixture.registration);
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    document.querySelector<HTMLButtonElement>('[data-version-update-action="dismiss"]')!.click();
    fixture.receive('UPDATE_ACTIVATION_DEFERRED');
    expect(document.getElementById('version-update-banner')).toBeNull();
    expect(serviceWorkerUpdate!.showVersionUpdateBanner(fixture.registration)).toBe(false);
    expect(fixture.reload).not.toHaveBeenCalled();
  });
});
