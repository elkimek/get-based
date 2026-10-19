import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type ConsoleMessage } from '@playwright/test';
import { startKitServer } from './kit-server.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function openRoutstr(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/, {timeout: 30_000});
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]').click(); await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-routstr-model-settings-view]')).toBeVisible();
}
test('static Routstr models retain private and regular choices through unavailable-origin cold launch', async ({ page, context }) => {
  test.setTimeout(120_000);
  const serviceWorkerDiagnostic = process.env.GETBASED_PWA_DIAGNOSTIC === 'routstr-service-worker';
  let serviceWorkerObservation: { collect: (message: ConsoleMessage) => void; attach: () => Promise<void> } | undefined;
  if (serviceWorkerDiagnostic) {
    const swPrefix = '[routstr-test-service-worker]';
    const swRecords: unknown[] = [];
    let swDropped = 0;
    const collectServiceWorker = (message: ConsoleMessage) => {
      const text = message.text();
      if (!text.startsWith(swPrefix)) return;
      if (swRecords.length >= 256 || text.length > 2048) { ++swDropped; return; }
      try { swRecords.push(JSON.parse(text.slice(swPrefix.length))); }
      catch { ++swDropped; }
    };
    page.on('console', collectServiceWorker);
    await context.addInitScript(({ prefix }) => {
      if (!['http:', 'https:'].includes(location.protocol)) return;
      let emitted = 0;
      const emit = (kind: string, details: Record<string, unknown> = {}) => {
        try {
          if (emitted > 128) return;
          if (emitted++ === 128) { console.debug(prefix + JSON.stringify({ kind: 'record-limit', limit: 128 })); return; }
          console.debug(prefix + JSON.stringify({ kind, at: performance.now(), page: location.pathname.slice(0, 256), ...details }));
        } catch { /* Observing a state cannot replace the application's result. */ }
      };
      const errorView = (error: unknown) => {
        try { return { name: error instanceof Error ? error.name.slice(0, 80) : typeof error,
          message: error instanceof Error ? error.message.slice(0, 512) : String(error).slice(0, 512) }; }
        catch { return { name: 'unreadable-error', message: '' }; }
      };
      const container = navigator.serviceWorker;
      if (!container) { emit('container-unavailable'); return; }
      const workers = new WeakSet<ServiceWorker>(), registrations = new WeakSet<ServiceWorkerRegistration>();
      const workerView = (worker: ServiceWorker | null) => worker ? { state: worker.state, scriptURL: worker.scriptURL.slice(0, 256) } : null;
      const observeWorker = (worker: ServiceWorker | null) => {
        if (!worker || workers.has(worker)) return;
        workers.add(worker);
        emit('worker-observed', { worker: workerView(worker) });
        worker.addEventListener('statechange', () => {
          try { emit('worker-statechange', { worker: workerView(worker) }); }
          catch (error) { emit('observation-error', errorView(error)); }
        });
      };
      const observeRegistration = (registration: ServiceWorkerRegistration) => {
        const snapshot = () => {
          try {
            emit('registration-state', { scope: registration.scope.slice(0, 256), installing: workerView(registration.installing), waiting: workerView(registration.waiting), active: workerView(registration.active) });
            observeWorker(registration.installing); observeWorker(registration.waiting); observeWorker(registration.active);
          } catch (error) { emit('observation-error', errorView(error)); }
        };
        snapshot();
        if (registrations.has(registration)) return;
        registrations.add(registration);
        registration.addEventListener('updatefound', snapshot);
      };
      observeWorker(container.controller);
      emit('container-observed', { controller: workerView(container.controller) });
      container.addEventListener('controllerchange', () => {
        try { emit('controllerchange', { controller: workerView(container.controller) }); observeWorker(container.controller); }
        catch (error) { emit('observation-error', errorView(error)); }
      });
      container.addEventListener('message', event => {
        const data: unknown = event.data;
        if (!data || typeof data !== 'object' || !('type' in data) || data.type !== 'PRECACHE_PROGRESS') return;
        emit('precache-progress', { completed: 'completed' in data && Number.isSafeInteger(data.completed) ? data.completed : null, total: 'total' in data && Number.isSafeInteger(data.total) ? data.total : null });
      });
      const register = container.register;
      container.register = function (this: ServiceWorkerContainer, ...args: Parameters<ServiceWorkerContainer['register']>) {
        emit('register-call', { scriptURL: typeof args[0] === 'string' ? args[0].slice(0, 256) : '[URL object]', argumentCount: args.length });
        let promise: Promise<ServiceWorkerRegistration>;
        try { promise = Reflect.apply(register, this, args); }
        catch (error) { emit('register-threw', errorView(error)); throw error; }
        void promise.then(registration => {
          emit('register-resolved');
          try { observeRegistration(registration); } catch (error) { emit('observation-error', errorView(error)); }
        }, error => emit('register-rejected', errorView(error)));
        return promise;
      };
      try {
        void container.getRegistrations().then(values => {
          try { emit('existing-registrations', { count: values.length });
            for (const registration of values) observeRegistration(registration); }
          catch (error) { emit('observation-error', errorView(error)); }
        }, error => emit('registrations-read-rejected', errorView(error)));
      } catch (error) { emit('registrations-read-threw', errorView(error)); }
    }, { prefix: swPrefix });
    serviceWorkerObservation = {
      collect: collectServiceWorker,
      attach: async () => {
        const destination = test.info().outputPath('routstr-service-worker-state.json');
        await writeFile(destination, JSON.stringify({ records: swRecords, dropped: swDropped }, null, 2), { encoding: 'utf8', flag: 'wx' });
        await test.info().attach('routstr-service-worker-state', { path: destination, contentType: 'application/json' });
      },
    };
  }
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const original = window.fetch.bind(window);
    const transport = window as unknown as { offlineRoutstrModels: number }; transport.offlineRoutstrModels = 0;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin !== location.origin) {
        if (url.href === 'https://synthetic-routstr.test/v1/models') ++transport.offlineRoutstrModels;
        return Promise.reject(new TypeError('Synthetic external transport unavailable'));
      }
      return original(input, init);
    };
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    if (localStorage.getItem('routstr-model-fixture-seeded')) return;
    localStorage.setItem('routstr-model-fixture-seeded', '1'); localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-chat-backend', 'direct'); localStorage.setItem('labcharts-routstr-node', 'https://synthetic-routstr.test');
    localStorage.setItem('labcharts-routstr-key', 'sk-synthetic-nonfunctional'); localStorage.setItem('labcharts-routstr-model', 'claude-sonnet-4.6');
    localStorage.setItem('labcharts-routstr-models', JSON.stringify([{ id: 'claude-sonnet-4.6', name: 'Claude' }, { id: 'gpt-6-astra', name: 'GPT' }]));
    localStorage.setItem('labcharts-routstr-private-models', JSON.stringify([{ id: 'tinfoil-gemma4-31b', name: 'Gemma Private' }, { id: 'tinfoil-kimi-k2-6', name: 'Kimi Private' }]));
    localStorage.setItem('labcharts-routstr-model-private', 'tinfoil-kimi-k2-6');
    localStorage.setItem('labcharts-routstr-pricing', JSON.stringify({ 'tinfoil-gemma4-31b': { input: 1, output: 2 } }));
  });
  const server = await startKitServer(artifact), errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); server.state.offline = true; await openRoutstr(page);
    const panel = page.locator('[data-routstr-model-settings-view]'), select = panel.locator('#routstr-model-select'), toggle = panel.locator('#routstr-private-toggle');
    await expect(select).toHaveValue('claude-sonnet-4.6'); await select.selectOption('gpt-6-astra');
    await expect.poll(() => page.evaluate(() => (window as unknown as { offlineRoutstrModels: number }).offlineRoutstrModels)).toBeGreaterThan(0);
    await toggle.check(); await expect(select).toHaveValue('tinfoil-kimi-k2-6'); await select.selectOption('tinfoil-gemma4-31b');
    await toggle.uncheck(); await expect(select).toHaveValue('gpt-6-astra'); await toggle.check(); await expect(select).toHaveValue('tinfoil-gemma4-31b');
    await expect(panel.locator('#routstr-private-indicator')).toBeVisible(); await expect(panel).toContainText('session, selected model, and billing metadata');
    await expect(panel).toContainText('Web search and images are disabled'); await expect(panel.locator('#routstr-model-pricing')).toContainText('$1.00/M in');
    expect(await page.evaluate(() => ({ regular: localStorage.getItem('labcharts-routstr-model-regular'), private: localStorage.getItem('labcharts-routstr-model-private') }))).toEqual({ regular: 'gpt-6-astra', private: 'tinfoil-gemma4-31b' });
    await page.locator('#settings-modal [data-settings-action="close"]').click(); await page.close();
    const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message)); if (serviceWorkerObservation) cold.on('console', serviceWorkerObservation.collect);
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await openRoutstr(cold);
    await expect(cold.locator('#routstr-model-select')).toHaveValue('tinfoil-gemma4-31b'); await expect(cold.locator('#routstr-private-toggle')).toBeChecked();
    await expect(cold.locator('#routstr-model-pricing')).toContainText('$1.00/M in'); await expect(cold.locator('#routstr-private-indicator')).toBeVisible();
    await cold.locator('[data-routstr-model-settings-view]').scrollIntoViewIfNeeded();
    await cold.screenshot({ path: test.info().outputPath('routstr-model-cold.png'), fullPage: true });
    expect(await cold.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (serviceWorkerObservation) await serviceWorkerObservation.attach();
    } finally { await server.close(); }
  }
});
