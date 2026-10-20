import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import {openStaticSettings} from './settings-entry.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function prepare(context: BrowserContext, page: Page) {
  const errors: string[] = [];
  const attach = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  attach(page); context.on('page', attach);
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-05T00:00:00.000Z',
      appVersion: 'kit-test', location: 'local-test' }));
    const target = window as Window & { kitCsp?: string[] }; const violations: string[] = []; target.kitCsp = violations;
    document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective));
  });
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}
async function display(page: Page) {
  await openStaticSettings(page);
  await page.locator('[data-settings-tab="display"]').click();
  await expect(page.locator('#settings-tab-display [data-unit="US"]')).toBeVisible();
}
async function identity(page: Page) {
  return page.evaluate(() => (window as Window & { APP_BUILD_ID?: string }).APP_BUILD_ID);
}
async function noCspErrors(page: Page, errors: string[]) {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { kitCsp?: string[] }).kitCsp)).toEqual([]);
}

test('static shell preserves aliases, manifest, CSP, lazy styles and delegated preferences', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    const startup = await page.evaluate(() => {
      const entries = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter(entry => new URL(entry.name).origin === location.origin && new URL(entry.name).pathname.endsWith('.js'));
      return { requests: entries.length, decodedBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0), urls: entries.map(entry => new URL(entry.name).pathname) };
    });
    await test.info().attach('cold-startup-js', { body: JSON.stringify(startup, null, 2), contentType: 'application/json' });
    const manifest = await page.evaluate(async () => await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href).then(response => response.json()) as { id: string; start_url: string; scope: string });
    expect(manifest).toMatchObject({ id: '/app', start_url: '/app', scope: '/app' });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => new URL(registration.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    await display(page);
    const us = page.locator('#settings-tab-display [data-unit="US"]');
    await us.click(); await expect(us).toHaveAttribute('aria-pressed', 'true');
    if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches)) await expect(us).toHaveCSS('min-height', '44px');
    else {
      await expect(us).toHaveCSS('font-size', '12px');
      await expect(us).toHaveCSS('padding', '4px 12px');
    }
    expect(await page.locator('link[data-settings-stylesheet]').getAttribute('href')).toBe(server.origin + '/css/settings.css');
    // Cocoa pointer activation does not focus buttons; establish the keyboard start explicitly.
    await us.focus();
    await page.keyboard.press(nativeTabKey(page)); await page.keyboard.press(nativeTabKey(page, true));
    await expect(us).toBeFocused(); await expect(us).toHaveCSS('outline-width', '2px');
    for (const alias of ['/index.html', '/', '/app/']) {
      await page.goto(server.origin + alias + '?dev-sw=1', { waitUntil: 'load' }); await ready(page); await display(page);
      await expect(page.locator('#settings-tab-display [data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
      await noCspErrors(page, errors);
    }
  } finally { await server.close(); }
});

test('first Display open and cold launch work offline while retaining local and IndexedDB data', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    await page.evaluate(async () => {
      localStorage.setItem('kit-retained-data', 'retained');
      const open = indexedDB.open('kit-migration-sentinel', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      const transaction = db.transaction('kv', 'readwrite'); transaction.objectStore('kv').put({ preserved: true }, 'sentinel');
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); db.close();
    });
    server.state.offline = true;
    await display(page); await page.locator('#settings-tab-display [data-unit="US"]').click();
    await page.locator('#settings-tab-display [data-alt-units="on"]').click();
    await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(cold); await display(cold);
    await expect(cold.locator('#settings-tab-display [data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(cold.locator('#settings-tab-display [data-alt-units="on"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await cold.evaluate(() => localStorage.getItem('kit-retained-data'))).toBe('retained');
    const value = await cold.evaluate(async () => {
      const open = indexedDB.open('kit-migration-sentinel', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      const request = db.transaction('kv', 'readonly').objectStore('kv').get('sentinel');
      const value: unknown = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close(); return value;
    });
    expect(value).toEqual({ preserved: true }); await noCspErrors(cold, errors);
  } finally { await server.close(); }
});

test('failed update retains the app and Later defers activation until explicit offline Reload', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page); await display(page);
    await page.locator('#settings-tab-display [data-unit="US"]').click();
    await page.locator('[data-settings-action="close"]').click();
    await page.evaluate(() => localStorage.setItem('kit-update-retained', 'retained'));
    expect(await page.evaluate(() => localStorage.getItem('kit-update-retained'))).toBe('retained');
    const other = await context.newPage();
    await other.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(other);
    await expect.poll(() => other.evaluate(() => localStorage.getItem('kit-update-retained'))).toBe('retained');
    server.state.buildId = 'kit-test-b'; server.state.failPath = '/css/settings.css';
    const failed = await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!;
      const failed = new Promise<string>(resolve => registration.addEventListener('updatefound', () => {
        const worker = registration.installing!; worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(worker.state); });
      }, { once: true })); await registration.update(); return failed;
    });
    expect(failed).toBe('redundant'); expect(await identity(page)).toBe('kit-test-a');
    await expect(page.locator('#version-update-banner')).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.installing?.state ?? 'none'), { timeout: 30_000 }).toBe('none');
    server.state.failPath = '';
    await page.evaluate(async () => {
      const updates = await import('/js/service-worker-update.js');
      await updates.checkForAppVersionUpdate(await navigator.serviceWorker.getRegistration(), navigator.serviceWorker, window, { force: true });
    });
    await expect(page.locator('#version-update-banner')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-version-update-action="dismiss"]').click(); expect(await identity(page)).toBe('kit-test-a');
    await page.reload({ waitUntil: 'load' }); await ready(page);
    expect(await page.evaluate(() => localStorage.getItem('kit-update-retained'))).toBe('retained');
    await expect(page.locator('#version-update-banner')).toBeVisible(); server.state.offline = true;
    await page.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => identity(page).catch(() => ''), { timeout: 30_000 }).toBe('kit-test-b'); await ready(page); await display(page);
    await expect(page.locator('#settings-tab-display [data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('kit-update-retained'))).toBe('retained');
    await expect(other.locator('#version-update-banner')).toContainText('Reload');
    expect(await identity(other)).toBe('kit-test-a');
    expect(await other.evaluate(async () => {
      const url = '/js/bundle-legacy-probe-AAA.js';
      const module: unknown = await import(url);
      return (module as { legacyProbe?: unknown }).legacyProbe;
    })).toBe('old-tab-code');
    expect(await page.evaluate(() => caches.keys())).toContain('labcharts-vbuild-kit-test-a');
    await other.locator('[data-version-update-action="apply"]').click();
    await expect.poll(() => identity(other).catch(() => ''), { timeout: 30_000 }).toBe('kit-test-b'); await ready(other); await display(other);
    await expect(other.locator('#settings-tab-display [data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(async () => { expect(await page.evaluate(() => caches.keys())).toEqual(['labcharts-vbuild-kit-test-b']); }).toPass({ timeout: 10_000 });
    await noCspErrors(page, errors); await noCspErrors(other, errors);
  } finally { await server.close(); }
});

test('Svelte Settings shell preserves all sections, responsive geometry and keyboard navigation', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page); await display(page);
    const modal = page.locator('#settings-modal');
    const tabs = modal.getByRole('tab');
    await expect(tabs).toHaveCount(7);
    await expect(modal).toHaveAttribute('aria-labelledby', 'settings-title');
    const mobile = page.viewportSize()!.width <= 720;
    await expect(modal.getByRole('tablist')).toHaveAttribute('aria-orientation', mobile ? 'horizontal' : 'vertical');
    await expect(modal.locator('.settings-layout')).toHaveCSS('display', mobile ? 'flex' : 'grid');
    for (const [id, label] of [['display', 'Display'], ['ai', 'AI'], ['voice', 'Voice'], ['privacy', 'Privacy'], ['data', 'Data'], ['wearables', 'Wearables'], ['agent', 'Agent Access']] as const) {
      const tab = tabs.filter({ hasText: label });
      await tab.click(); await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(tab).toHaveAttribute('tabindex', '0');
      await expect(modal.locator(`#settings-tab-${id}`)).toBeVisible();
      await expect(modal.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    }
    const first = modal.locator('#settings-nav-display');
    await first.click(); await first.focus();
    await first.press(mobile ? 'ArrowRight' : 'ArrowDown');
    await expect(modal.locator('#settings-nav-ai')).toBeFocused();
    await expect(modal.locator('#settings-nav-ai')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End'); await expect(modal.locator('#settings-nav-agent')).toBeFocused();
    await page.keyboard.press('Home'); await expect(first).toBeFocused();
    const input = modal.locator('#debug-mode-toggle');
    const before = await input.isChecked(); await input.locator('..').click();
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/show/);
    // The existing no-provider close workflow may reveal chat onboarding.
    const closeChat = page.locator('#chat-panel.open [data-chat-action="close-panel"]');
    if (await closeChat.isVisible()) await closeChat.click();
    await page.locator('[data-shell-action="open-settings"]').click();
    await expect(modal.locator('#debug-mode-toggle')).toBeChecked({ checked: !before });
    await expect(modal.locator('#settings-title')).toHaveCount(1);
    expect(await modal.locator('.settings-content [data-settings-tab]').evaluateAll(elements => elements.every(element => !element.hasAttribute('aria-selected') && !element.classList.contains('settings-tab-btn')))).toBe(true);
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const result = await axe.run({ include: [['.settings-modal-head'], ['.settings-tabs-bar']] }, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
    });
    expect(violations).toEqual([]);
    await expect.poll(() => modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await noCspErrors(page, errors);
  } finally { await server.close(); }
});


test('Privacy controls preserve consent separation, review confirmation, drafts and offline preferences', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!location.protocol.startsWith('http')) return;
    // Seed only once so withdrawal/reload checks exercise actual persistence.
    if (localStorage.getItem('privacy-test-seeded')) return;
    localStorage.setItem('privacy-test-seeded', '1');
    localStorage.setItem('labcharts-cloud-ai-consent', JSON.stringify({ version: '2026-08-31', approvals: { test: { accepted: true, recipient: '<remote.example>' } } }));
    localStorage.setItem('labcharts-ai-route-confirmations', JSON.stringify({ version: '2026-08-31', confirmations: { test: { confirmed: true, endpointOrigin: 'http://lan.example' } } }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version: '2026-08-31', acknowledged: true }));
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page); await display(page);
    await page.locator('#settings-nav-privacy').click();
    const panel = page.locator('#settings-tab-privacy');
    await expect(panel.locator('#privacy-status-title')).toHaveText('Basic protection');
    const configure = panel.locator('[data-settings-action="toggle-privacy-configure"]');
    await configure.focus(); await configure.press('Enter'); await expect(configure).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('#privacy-configure-body')).toHaveCSS('display', 'block');
    const url = panel.getByLabel('Server address', { exact: true }); await url.fill('http://unsaved.example');
    await panel.locator('[data-settings-action="withdraw-cloud-ai-consent"]').click();
    await expect(panel.locator('[data-settings-action="withdraw-cloud-ai-consent"]')).toBeDisabled();
    await expect(panel.locator('[data-settings-action="withdraw-ai-route-confirmations"]')).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-cloud-ai-consent'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-route-confirmations'))).not.toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-transparency-acknowledgement'))).not.toBeNull();
    await expect(url).toHaveValue('http://unsaved.example');
    await panel.locator('[data-settings-action="withdraw-ai-route-confirmations"]').click();
    await expect(panel.locator('[data-settings-action="withdraw-ai-route-confirmations"]')).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-route-confirmations'))).toBeNull();
    const review = panel.locator('#pii-review-toggle');
    await expect(review).toBeChecked(); await review.locator('..').click();
    await expect(page.locator('#confirm-dialog-overlay')).toHaveClass(/show/); await expect(review).toBeChecked();
    await page.locator('#confirm-cancel').click(); await expect(review).toBeChecked();
    await review.locator('..').click(); await page.locator('#confirm-ok').click(); await expect(review).not.toBeChecked();
    const analytics = panel.locator('#analytics-toggle'); const before = await analytics.isChecked();
    await analytics.locator('..').click(); await expect(analytics).toBeChecked({ checked: !before });
    // A consent refresh must leave the dialog-confirmed review state untouched.
    await expect(review).not.toBeChecked();
    const violations = await panel.evaluate(async element => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const result = await axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
    });
    expect(violations).toEqual([]);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    server.state.offline = true; await page.reload({ waitUntil: 'load' }); await ready(page); await display(page);
    await page.locator('#settings-nav-privacy').click();
    await expect(page.locator('#pii-review-toggle')).not.toBeChecked();
    await expect(page.locator('#analytics-toggle')).toBeChecked({ checked: !before });
    await expect(page.locator('[data-settings-action="withdraw-cloud-ai-consent"]')).toBeDisabled();
    await expect(page.locator('[data-settings-action="withdraw-ai-route-confirmations"]')).toBeDisabled();
    await noCspErrors(page, errors);
  } finally { await server.close(); }
});

test('Privacy provider discovery filters cloud models, persists configuration and recovers from invalid endpoints', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  await context.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!href.startsWith('http://localhost:11434/')) return original(input, options);
      if (options.method === 'HEAD') return new Response(null, { status: 204 });
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (href.endsWith('/api/v1/models')) return new Response(null, { status: 404 });
      const models = ['llama3.2', 'qwen2.5:14b', 'kimi-k2.5:cloud', 'nomic-embed-text'];
      if (href.endsWith('/api/tags')) return json({ models: models.map(name => ({ name })) });
      if (href.endsWith('/v1/models')) return json({ data: models.map(id => ({ id })) });
      if (href.endsWith('/api/ps')) return json({ models: [] });
      return new Response(null, { status: 404 });
    };
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page); await display(page);
    await page.locator('#settings-nav-privacy').click();
    const panel = page.locator('#settings-tab-privacy');
    await panel.locator('[data-settings-action="toggle-privacy-configure"]').click();
    await panel.getByLabel('Server address', { exact: true }).fill(' http://localhost:11434/ ');
    await panel.getByLabel('Privacy server API key', { exact: false }).fill('privacy-test-key');
    await panel.locator('[data-settings-action="test-pii-ollama"]').click();
    await expect(panel.locator('#pii-local-status-text')).toContainText('Connection verified');
    expect(await panel.locator('#pii-model-select option').allTextContents()).toEqual(['llama3.2', 'qwen2.5:14b']);
    await panel.locator('#pii-model-select').selectOption('qwen2.5:14b');
    await panel.locator('#pii-local-toggle').locator('..').click();
    await expect(panel.locator('#privacy-status-title')).toHaveText('Enhanced protection');
    await expect(panel.locator('#privacy-status-detail')).toContainText('qwen2.5:14b');
    await page.reload({ waitUntil: 'load' }); await ready(page); await display(page); await page.locator('#settings-nav-privacy').click();
    await expect(panel.locator('#pii-local-toggle')).toBeChecked();
    await expect(panel.locator('#privacy-status-title')).toHaveText('Enhanced protection');
    await panel.locator('[data-settings-action="toggle-privacy-configure"]').click();
    await expect(panel.getByLabel('Server address', { exact: true })).toHaveValue('http://localhost:11434');
    await expect(panel.getByLabel('Privacy server API key', { exact: false })).toHaveValue('privacy-test-key');
    // Verify invalid endpoints surface a recoverable error and clear old options.
    await panel.getByLabel('Server address', { exact: true }).fill('file:///invalid');
    await panel.locator('[data-settings-action="test-pii-ollama"]').click();
    await expect(panel.locator('#pii-local-status-text')).not.toContainText('Connection verified');
    await expect(panel.locator('#pii-model-dropdown')).toHaveCSS('display', 'none');
    await noCspErrors(page, errors);
  } finally { await server.close(); }
});

test('Voice first use, themes, keyboard controls and preferences survive an offline cold launch', async ({ page, context }) => {
  const server = await startKitServer(artifact);
  const errors = await prepare(context, page);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' });
    await ready(page);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    server.state.offline = true;
    await display(page);
    await page.locator('#settings-nav-voice').click();
    const panel = page.locator('#settings-tab-voice');
    const linked = panel.locator('#voice-providers-linked');
    await panel.locator('[data-voice-shared-provider]').selectOption('browser-local');
    // Enter keyboard modality through real navigation. Programmatic focus after
    // selectOption does not activate Firefox's :focus-visible heuristic.
    const sharedProvider = panel.locator('[data-voice-shared-provider]');
    await sharedProvider.focus();
    await sharedProvider.press(nativeTabKey(page));
    await expect(linked).toBeFocused();
    await linked.press('Space');
    await expect(linked.locator('..').locator('span')).toHaveCSS('outline-width', '2px');
    await expect(linked).toBeChecked();
    await expect(panel.locator('[data-voice-setting="inputProvider"]')).toBeVisible();
    await panel.locator('[data-voice-setting="localSttModel"]').selectOption('onnx-community/whisper-medium-ONNX');
    await panel.locator('[data-voice-setting="localSttBackend"]').selectOption('wasm');
    await panel.locator('[data-voice-setting="localVoice"]').selectOption('bm_george');
    await panel.locator('#voice-auto-read').focus();
    await panel.locator('#voice-auto-read').press('Space');
    await expect(panel.locator('#voice-auto-read')).toBeChecked();
    await panel.locator('.voice-advanced-connections > summary').click();
    await panel.locator('[data-voice-connection="local-server"] > summary').click();
    const key = panel.locator('[data-voice-key-input="local-server"]');
    await key.fill('unsaved-test-draft');
    const rate = panel.locator('[data-voice-setting="rate"]');
    await rate.focus();
    for (let step = 0; step < 7; step++) await rate.press('ArrowRight');
    await expect(panel.locator('#voice-rate-value')).toHaveText('1.35×');
    await expect(key).toHaveValue('unsaved-test-draft');
    const violations = await panel.evaluate(async element => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const result = await axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
    });
    expect(violations).toEqual([]);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await page.locator('[data-tweaks-action="close"]').click();
      const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
      if (await closeChat.isVisible()) await closeChat.click();
      await display(page); await page.locator('#settings-nav-voice').click();
      await panel.locator('.voice-advanced-connections > summary').click();
      await panel.locator('[data-voice-connection="local-server"] > summary').click();
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        expect(await panel.evaluate(element => {
          const control = element.querySelector<HTMLSelectElement>('[data-voice-setting="localSttBackend"]')!;
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--select-surface)'; probe.style.color = 'var(--text-primary)';
          probe.style.borderRadius = 'var(--radius-sm)'; element.append(probe);
          const actual = getComputedStyle(control); const expected = getComputedStyle(probe);
          const match = actual.backgroundColor === expected.backgroundColor && actual.color === expected.color && actual.borderRadius === expected.borderRadius;
          probe.remove();
          return match && element.scrollWidth <= element.clientWidth;
        })).toBe(true);
        const fieldBox = (await key.boundingBox())!; const panelBox = (await panel.boundingBox())!;
        expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
      }
    }
    await page.close();
    const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' });
    await ready(cold); await display(cold); await cold.locator('#settings-nav-voice').click();
    await expect(cold.locator('#voice-providers-linked')).toBeChecked();
    await expect(cold.locator('#voice-auto-read')).toBeChecked();
    await expect(cold.locator('[data-voice-setting="localSttModel"]')).toHaveValue('onnx-community/whisper-medium-ONNX');
    await expect(cold.locator('[data-voice-setting="localSttBackend"]')).toHaveValue('wasm');
    await expect(cold.locator('[data-voice-setting="localVoice"]')).toHaveValue('bm_george');
    await expect(cold.locator('[data-voice-setting="rate"]')).toHaveValue('1.35');
    await expect(cold.locator('[data-voice-key-input="local-server"]')).toHaveValue('');
    await expect(cold.locator('.voice-task-card')).toHaveCount(2);
    await noCspErrors(cold, errors);
  } finally { await server.close(); }
});

test('Agent Access hydrates offline with masked persisted credentials, keyboard controls and all setup targets', async ({ page, context }) => {
  const server = await startKitServer(artifact);
  const errors = await prepare(context, page);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!location.protocol.startsWith('http')) return;
    if (!localStorage.getItem('kit-agent-seeded')) {
      localStorage.setItem('kit-agent-seeded', '1');
      localStorage.setItem('labcharts-messenger-enabled', 'true');
      localStorage.setItem('labcharts-messenger-token', 'a'.repeat(64));
      localStorage.setItem('labcharts-agent-context-key', 'b'.repeat(48));
    }
    const target = window as Window & { kitAgentClipboard?: string[] };
    target.kitAgentClipboard = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { target.kitAgentClipboard!.push(value); },
    } });
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
    server.state.offline = true;
    await display(page); await page.locator('#settings-nav-agent').click();
    const panel = page.locator('#settings-tab-agent');
    const toggle = panel.locator('[data-sync-action="toggle-messenger"]');
    await expect(toggle).toBeChecked(); await expect(toggle).toBeEnabled();
    await expect(panel.locator('#messenger-token')).toHaveText('•'.repeat(64));
    await expect(panel.locator('#messenger-context-key')).toHaveText('•'.repeat(48));
    expect(await panel.innerHTML()).not.toContain('a'.repeat(64));
    expect(await panel.innerHTML()).not.toContain('b'.repeat(48));
    const clients = panel.locator('[name="agent-access-client"]');
    await expect(clients).toHaveCount(7);
    await expect(panel.locator('[name="agent-access-client"][value="hermes"]')).toBeChecked();
    for (const client of ['hermes', 'openclaw', 'claude-code', 'claude-desktop', 'cursor', 'cline', 'codex']) {
      await panel.locator(`[name="agent-access-client"][value="${client}"]`).check();
      await panel.locator('[data-sync-action="copy-agent-access-setup-command"]').click();
      const payload = await page.evaluate(() => {
        const command = (window as unknown as { kitAgentClipboard: string[] }).kitAgentClipboard.at(-1)!;
        const encoded = command.match(/gbsetup_v1_([^']+)/)![1]!;
        return JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))) as { client: string; token: string; contextKey: string };
      });
      expect(payload).toMatchObject({ client, token: 'a'.repeat(64), contextKey: 'b'.repeat(48) });
    }
    const setup = panel.locator('[data-sync-action="copy-agent-access-setup-command"]');
    await setup.focus(); await setup.press(nativeTabKey(page));
    const showToken = panel.locator('#messenger-token-toggle');
    await expect(showToken).toBeFocused(); await expect(showToken).toHaveCSS('outline-width', '2px');
    await showToken.press('Enter');
    await expect(panel.locator('#messenger-token')).toHaveText('a'.repeat(64));
    await expect(showToken).toHaveAttribute('aria-label', 'Hide token');
    await panel.locator('#messenger-context-key-toggle').click();
    await expect(panel.locator('#messenger-context-key')).toHaveText('b'.repeat(48));
    await page.evaluate(() => window.dispatchEvent(new Event('labcharts-sync-owner-changed')));
    await expect(panel.locator('#messenger-token')).toHaveAttribute('data-masked', 'true');
    await expect(panel.locator('#messenger-context-key')).toHaveAttribute('data-masked', 'true');
    await expect(panel.locator('[data-sync-action="regenerate-messenger-token"]')).toBeDisabled();
    await expect(panel.locator('[data-sync-action="regenerate-messenger-context-key"]')).toBeDisabled();
    await expect(panel.locator('#agent-wearable-series-select')).toBeDisabled();
    const violations = await panel.evaluate(async element => {
      const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
      const result = await axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
    });
    expect(violations).toEqual([]);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await page.locator('[data-tweaks-action="close"]').click();
      const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
      if (await closeChat.isVisible()) await closeChat.click();
      await display(page); await page.locator('#settings-nav-agent').click();
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => panel.evaluate(element => {
          const control = element.querySelector<HTMLSelectElement>('#agent-wearable-series-select')!;
          const button = element.querySelector<HTMLButtonElement>('[data-sync-action="copy-agent-access-setup-command"]')!;
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--select-surface)'; probe.style.color = 'var(--text-primary)';
          element.append(probe);
          const actual = getComputedStyle(control); const expected = getComputedStyle(probe);
          const match = actual.backgroundColor === expected.backgroundColor && actual.color === expected.color;
          probe.style.backgroundColor = 'var(--accent)'; probe.style.color = 'var(--on-accent)';
          const primary = getComputedStyle(button);
          const expectedButton = getComputedStyle(probe);
          const themedButton = primary.backgroundColor === expectedButton.backgroundColor && primary.color === expectedButton.color;
          probe.remove();
          return { match, themedButton, noOverflow: element.scrollWidth <= element.clientWidth };
        }), {message: `${theme} at ${viewport.width}px`}).toMatchObject({ match: true, themedButton: true, noOverflow: true });
        const box = (await panel.locator('#messenger-token').boundingBox())!; const bounds = (await panel.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      }
    }
    await page.close();
    const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' });
    await ready(cold);
    const coldChat = cold.getByRole('button', { name: 'Close chat', exact: true });
    if (await coldChat.isVisible()) await coldChat.click();
    await display(cold); await cold.locator('#settings-nav-agent').click();
    await expect(cold.locator('#messenger-token')).toHaveAttribute('data-masked', 'true');
    await expect(cold.locator('#messenger-context-key')).toHaveAttribute('data-masked', 'true');
    const coldToggle = cold.locator('[data-sync-action="toggle-messenger"]');
    await expect(coldToggle).toBeChecked(); await expect(coldToggle).toBeEnabled();
    await cold.locator('#settings-nav-agent').focus();
    await expect(cold.locator('#settings-nav-agent')).toBeFocused();
    await cold.keyboard.press(nativeTabKey(cold));
    // Firefox includes a scroll container in sequential keyboard navigation.
    if (await cold.locator('.settings-content').evaluate(element => element === document.activeElement)) await cold.keyboard.press(nativeTabKey(cold));
    await expect(coldToggle).toBeFocused();
    await expect(coldToggle.locator('..').locator('span')).toHaveCSS('outline-width', '2px');
    await coldToggle.press('Space');
    await expect(coldToggle).not.toBeChecked(); await expect(coldToggle).toBeDisabled();
    await expect(cold.locator('#messenger-token')).toHaveCount(0);
    await expect(cold.locator('[data-agent-access-view]')).toHaveAttribute('aria-busy', 'false');
    await cold.reload({ waitUntil: 'load' }); await ready(cold); await display(cold); await cold.locator('#settings-nav-agent').click();
    await expect(cold.locator('[data-sync-action="toggle-messenger"]')).not.toBeChecked();
    await expect(cold.locator('[data-sync-action="toggle-messenger"]')).toBeDisabled();
    await noCspErrors(cold, errors);
  } finally { await server.close(); }
});

test('imported records and usage hydrate offline with provenance, keyboard controls and profile-only reset', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!location.protocol.startsWith('http') || localStorage.getItem('kit-records-seeded')) return;
    localStorage.setItem('kit-records-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Synthetic records profile', createdAt: 1 }]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({
      entries: [
        { date: '2026-01-01', markers: { 'biochemistry.glucose': 5, 'biochemistry.alt': 0.5 }, markerSources: { 'biochemistry.glucose': { snapshotId: 'report-1', file: 'Synthetic <lab> & report.pdf' } } },
        { date: '2025-12-01', markers: { 'biochemistry.alp': 1 }, sourceFile: 'legacy <report>.json' },
        { date: '2025-11-01', markers: {}, deletedMarkers: { 'biochemistry.glucose': 1 } },
      ], manualValues: { 'biochemistry.alt:2026-01-01': 0.5 },
      importSnapshots: [
        { id: 'report-1', date: '2026-01-01', fileName: 'Synthetic <lab> & report.pdf', type: 'pdf', markerCount: 1, markers: [{ mappedKey: 'biochemistry.glucose', value: 5, unit: 'mmol/l' }], importedAt: 1767225600000, costInfo: { modelId: 'synthetic-model' } },
        { id: 'report-2', date: '2026-02-01', fileName: 'Another report with a long file name that must stay readable and truncate correctly.pdf', type: 'json', markerCount: 2, markers: [], importedAt: 1769904000000 },
      ],
    }));
    localStorage.setItem('labcharts-default-usage', JSON.stringify({ totalCost: 1.25, requestCount: 3, totalInputTokens: 1200, totalOutputTokens: 300 }));
    localStorage.setItem('labcharts-global-usage', JSON.stringify({ totalCost: 2.5, requestCount: 5, totalInputTokens: 2000000, totalOutputTokens: 300 }));
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    server.state.offline = true;
    await display(page); await page.locator('#settings-nav-data').click();
    const records = page.locator('#data-entries-section');
    await expect(records.locator('.imported-entry-snapshot')).toHaveCount(2);
    await expect(records.locator('.imported-entry')).toHaveCount(4);
    await expect(records.locator('.ie-file').first()).toHaveText(/Another report/);
    await expect(records).toContainText('Synthetic <lab> & report.pdf');
    await expect(records).toContainText('manual markers not tied to an import file');
    await expect(records).toContainText('legacy markers not tied to an import file · legacy <report>.json');
    await expect(records).toContainText('Date locked');
    await expect(records.locator('[data-settings-action="rename-imported-entry"]')).toHaveCount(1);
    await expect(records.locator('[data-settings-action="rename-imported-entry"]')).toHaveAttribute('data-entry-date', '2025-12-01');
    await expect(records.locator('[data-settings-action="remove-imported-entry"][data-entry-date="2025-11-01"]')).toHaveCount(0);
    await expect(records.locator('img, script')).toHaveCount(0);
    const review = records.locator('[data-settings-action="review-import"]').first();
    await review.focus(); await review.press(nativeTabKey(page));
    const remove = records.locator('[data-settings-action="remove-import-snapshot"]').first();
    await expect(remove).toBeFocused(); await expect(remove).toHaveCSS('outline-width', '2px');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      await page.locator('#settings-nav-display').click();
      await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
      await page.locator('[data-tweaks-action="close"]').click();
      const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
      if (await closeChat.isVisible()) await closeChat.click();
      await display(page); await page.locator('#settings-nav-data').click();
      for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        expect(await records.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const file = records.locator('.ie-file').first(); const bounds = (await records.boundingBox())!; const box = (await file.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      }
      await records.scrollIntoViewIfNeeded();
      const violations = await records.evaluate(async element => {
        const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
        const result = await axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
      });
      expect(violations, `${theme} imported records`).toEqual([]);
      await page.locator('#settings-nav-ai').click();
      const usage = page.locator('#ai-usage-section');
      await usage.scrollIntoViewIfNeeded();
      // The real active tab fades in for 200 ms; measure its settled ink.
      await expect(page.locator('#settings-tab-ai')).toHaveCSS('opacity', '1');
      const usageViolations = await usage.evaluate(async element => {
        const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
        const result = await axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
      });
      expect(usageViolations, `${theme} AI usage`).toEqual([]);
    }
    await page.locator('#settings-nav-ai').click();
    const usage = page.locator('#ai-usage-section');
    await expect(usage).toContainText('Synthetic records profile');
    await expect(usage).toContainText('$1.250 · 3 requests · 1.5k tokens');
    await expect(usage).toContainText('$2.500 · 5 requests · 2.0M tokens');
    await usage.locator('[data-settings-action="reset-profile-usage"]').click();
    await expect(usage).toContainText('Free · 0 requests · 0 tokens');
    await expect(usage).toContainText('$2.500 · 5 requests · 2.0M tokens');
    await expect(usage.locator('[data-settings-action="reset-profile-usage"]')).toHaveCount(0);
    await page.close();
    const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(cold);
    await display(cold); await cold.locator('#settings-nav-data').click();
    await expect(cold.locator('#data-entries-section .imported-entry')).toHaveCount(4);
    await expect(cold.locator('#data-entries-section')).toContainText('Date locked');
    await cold.locator('#settings-nav-ai').click();
    await expect(cold.locator('#ai-usage-section')).toContainText('Free · 0 requests · 0 tokens');
    await expect(cold.locator('#ai-usage-section')).toContainText('$2.500 · 5 requests · 2.0M tokens');
    await noCspErrors(cold, errors);
  } finally { await server.close(); }
});

test('Agent Access retries a failed IndexedDB migration after an offline cold launch without losing its legacy source', async ({ page, context }) => {
  const server = await startKitServer(artifact); const errors = await prepare(context, page);
  await context.addInitScript(() => {
    if (!location.protocol.startsWith('http') || localStorage.getItem('kit-recovery-seeded')) return;
    localStorage.setItem('kit-recovery-seeded', '1');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [{ date: '2026-01-01', text: 'Synthetic pre-migration note' }] }));
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(page);
    await page.evaluate(() => {
      localStorage.setItem('labcharts-messenger-enabled', 'true');
      localStorage.setItem('labcharts-messenger-token', 'a'.repeat(64));
      localStorage.setItem('labcharts-agent-context-key', 'gbctx_v1_' + 'B'.repeat(43));
      localStorage.setItem('labcharts-default-agent-wearable-series', '30');
      const key = 'labcharts-default-imported'; const put = IDBObjectStore.prototype.put;
      const target = window as Window & { kitMigrationFailures?: number };
      target.kitMigrationFailures = 0;
      IDBObjectStore.prototype.put = function (value, storageKey) {
        if (this.name === 'kv' && storageKey === key) {
          target.kitMigrationFailures! += 1;
          throw new DOMException('Synthetic profile quota failure', 'QuotaExceededError');
        }
        return put.call(this, value, storageKey);
      };
    });
    await display(page); await page.locator('#settings-nav-agent').click();
    await expect.poll(() => page.evaluate(() => (window as Window & { kitMigrationFailures?: number }).kitMigrationFailures)).toBeGreaterThan(0);
    await expect(page.locator('#messenger-token')).toHaveAttribute('data-masked', 'true');
    expect(await page.evaluate(() => ({ token: localStorage.getItem('labcharts-messenger-token'),
      key: localStorage.getItem('labcharts-agent-context-key'), binding: localStorage.getItem('labcharts-agent-access-migration-profile') })))
      .toEqual({ token: 'a'.repeat(64), key: 'gbctx_v1_' + 'B'.repeat(43), binding: 'default' });
    const baseline = await page.evaluate(async () => {
      const open = indexedDB.open('labcharts-blobs', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      const request = db.transaction('kv', 'readonly').objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => { request.onsuccess = () => resolve(request.result as string); request.onerror = () => reject(request.error); }); db.close();
      return JSON.parse(value) as { notes: unknown[]; agentAccess?: unknown };
    });
    expect(baseline.agentAccess ?? null).toBeNull();
    expect(baseline.notes).toEqual([{ date: '2026-01-01', text: 'Synthetic pre-migration note' }]);
    server.state.offline = true; await page.close(); const cold = await context.newPage();
    await cold.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(cold);
    await display(cold); await cold.locator('#settings-nav-agent').click();
    await expect(cold.locator('[data-sync-action="toggle-messenger"]')).toBeChecked();
    await expect(cold.locator('#messenger-token')).toHaveText('•'.repeat(64));
    await expect(cold.locator('[data-sync-action="set-agent-wearable-series-days"]')).toHaveValue('30');
    await expect.poll(() => cold.evaluate(() => localStorage.getItem('labcharts-agent-access-migration-profile'))).toBeNull();
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-messenger-token'))).toBeNull();
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-agent-context-key'))).toBeNull();
    const persisted = await cold.evaluate(async () => {
      const open = indexedDB.open('labcharts-blobs', 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
      const request = db.transaction('kv', 'readonly').objectStore('kv').get('labcharts-default-imported');
      const value = await new Promise<string>((resolve, reject) => { request.onsuccess = () => resolve(request.result as string); request.onerror = () => reject(request.error); }); db.close();
      return JSON.parse(value) as { notes: unknown[]; agentAccess: unknown; agentAccessWearableSeriesDays: number };
    });
    expect(persisted.agentAccess).toMatchObject({ enabled: true, token: 'a'.repeat(64), contextKey: 'gbctx_v1_' + 'B'.repeat(43) });
    expect(persisted.agentAccessWearableSeriesDays).toBe(30); expect(persisted.notes).toEqual(baseline.notes);
    expect(await cold.locator('#settings-tab-agent').innerHTML()).not.toContain('a'.repeat(64));
    expect(await cold.locator('#settings-tab-agent').innerHTML()).not.toContain('gbctx_v1_' + 'B'.repeat(43));
    await noCspErrors(cold, errors);
  } finally { await server.close(); }
});
