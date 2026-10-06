import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { startKitServer } from './kit-server.js';

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
  await page.locator('[data-shell-action="open-settings"]').click();
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
    await us.click(); await expect(us).toHaveAttribute('aria-pressed', 'true'); await expect(us).toHaveCSS('min-height', '44px');
    expect(await page.locator('link[data-settings-stylesheet]').getAttribute('href')).toBe(server.origin + '/css/settings.css');
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
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
    const other = await context.newPage();
    await other.goto(server.origin + '/app?dev-sw=1', { waitUntil: 'load' }); await ready(other);
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
