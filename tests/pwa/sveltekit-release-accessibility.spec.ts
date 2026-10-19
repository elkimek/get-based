import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type BrowserContext, type CDPSession, type Locator, type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {launchTabZoom} from './browser-tab-zoom.js';
import {nutritionEditorArtifactPaths} from '../helpers/nutrition-loading-feedback-fixture.js';
import {seedNutritionMealDetail} from '../helpers/nutrition-meal-detail-fixture.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
// Explicit request interception must not be bypassed by precache/worker warming.
test.use({serviceWorkers: 'block'});

/** Reach controls exclusively through real Tab presses; never calls focus/click. */
async function tabTo(page: Page, target: Locator, backwards = false): Promise<void> {
  await expect(target).toBeVisible(); await expect(target).toBeEnabled();
  for (let step = 0; step < 160; step++) {
    if (await target.evaluate(element => document.activeElement === element)) {
      await expect(target).toBeFocused(); await expect(target).toBeInViewport(); return;
    }
    await page.keyboard.press(nativeTabKey(page, backwards));
  }
  throw new Error(`Keyboard could not reach ${await target.getAttribute('id') || await target.getAttribute('data-nutrition-action') || 'expected control'}`);
}
async function keyboardActivate(page: Page, target: Locator, key: 'Enter' | 'Space' = 'Enter', backwards = false) {
  await tabTo(page, target, backwards); await page.keyboard.press(key);
}
async function ready(page: Page, origin: string) {
  await page.goto(origin + '/app?dev-sw=1', {waitUntil: 'domcontentloaded'});
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout: 30000});
  await page.addScriptTag({url: origin + '/__release-test__/axe.js'});
}
async function profileReceipt(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
    try {
      const transaction = db.transaction('kv', 'readonly'), row = transaction.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<string>((resolve, reject) => {
        transaction.oncomplete = () => typeof row.result === 'string' ? resolve(row.result) : reject(new Error('Missing actual stored synthetic profile'));
        transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } finally {db.close();}
  });
}
async function prepare(context: BrowserContext, origin: string) {
  await context.addInitScript(seedNutritionMealDetail, {nutritionTargets: {configured: false, widgetNutrients: ['proteinG', 'fluidMl']}});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-ai-provider', 'ollama'); localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-ollama', JSON.stringify({url: location.origin + '/__release-test__/unavailable-ollama', model: 'synthetic-unavailable', mode: 'ollama', apiKey: ''}));
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-16T00:00:00Z'}));
    localStorage.setItem('labcharts-default-onboarded', 'profile-set');
    localStorage.setItem('labcharts-theme', 'dark');
  });
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (page: Page) => page.on('pageerror', error => errors.push(error.message));
  context.pages().forEach(observe); context.on('page', observe);
  await context.exposeBinding('releaseAccessibilityCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    document.addEventListener('securitypolicyviolation', event => void (window as unknown as {releaseAccessibilityCsp(value: string): Promise<void>}).releaseAccessibilityCsp(event.violatedDirective));
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {external.push(url.href); return route.abort();}
    return route.continue();
  });
  const axe = await fs.readFile('node_modules/axe-core/axe.min.js');
  await context.route(origin + '/__release-test__/axe.js', route => route.fulfill({contentType: 'text/javascript', body: axe}));
  return {errors, csp, external};
}
async function openSettingsWithKeyboard(page: Page) {
  let launcher = page.locator('[data-shell-action="open-settings"]:visible').first();
  if (!await launcher.isVisible()) {
    await keyboardActivate(page, page.getByRole('button', {name: 'Menu', exact: true}));
    launcher = page.locator('[data-shell-action="open-settings"]:visible').first();
  }
  await keyboardActivate(page, launcher);
  await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
  return launcher;
}
async function assertNoHorizontalClipping(page: Page) {
  const result = await page.locator('#settings-modal').evaluate(dialog => ({
    documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
    overflow: [dialog, ...dialog.querySelectorAll('.settings-content, [data-ai-settings-view], [data-custom-settings-view], p, [role="status"], .ai-provider-btn')]
      .filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)
      .map(element => ({tag: element.tagName, id: element.id, scroll: element.scrollWidth, client: element.clientWidth})),
  }));
  expect(result.overflow).toEqual([]); expect(result.documentWidth).toBeLessThanOrEqual(result.viewport + 1);
}

// Do not inherit the project's emulated DPR into the real browser window.
test.describe('browser window zoom', () => {
test.use({deviceScaleFactor: async ({}, use) => {await use(undefined);}});
// This is genuine automatic Chrome tab zoom, not CSS zoom, DPR emulation or pinch.
test('true headless browser zoom retains keyboard Settings/provider journeys and private draft disposal', async ({}, info) => {
  test.skip(info.project.name !== 'kit-chromium', 'The genuine chrome.tabs zoom proof uses bundled Chromium; keyboard Nutrition runs cross-engine separately.');
  test.setTimeout(120000);
  const server = await startKitServer(artifact), receipts: unknown[] = [];
  let zoom: Awaited<ReturnType<typeof launchTabZoom>> | undefined;
  try {
    zoom = await launchTabZoom(info.outputPath('browser-zoom'));
    const {page, context} = zoom;
    const issues = await prepare(context, server.origin); await ready(page, server.origin);
    const stored = await profileReceipt(page), initial = (await zoom.setZoom(1)).metrics;
    for (const factor of [1, 2, 4] as const) {
      const accepted = await zoom.setZoom(factor), metrics = accepted.metrics;
      expect(metrics.outerWidth).toBe(initial.outerWidth); expect(metrics.outerHeight).toBe(initial.outerHeight);
      expect(metrics.dpr / initial.dpr).toBeCloseTo(factor, 2);
      expect(Math.abs(metrics.innerWidth - initial.innerWidth / factor)).toBeLessThanOrEqual(2);
      const launcher = await openSettingsWithKeyboard(page), display = page.locator('#settings-nav-display');
      await tabTo(page, page.locator('.settings-tabs-bar [aria-selected="true"]'));
      await page.keyboard.press('Home'); await expect(display).toBeFocused();
      const direction = await page.getByRole('tablist', {name: 'Settings sections'}).getAttribute('aria-orientation');
      await page.keyboard.press(direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown');
      await expect(page.locator('#settings-nav-ai')).toBeFocused(); await expect(page.locator('#settings-nav-ai')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#ai-provider-panel')).toHaveAttribute('aria-busy', 'false');
      await keyboardActivate(page, page.locator('[data-provider="custom"]'), 'Space');
      await expect(page.locator('[data-provider="custom"]')).toHaveAttribute('aria-pressed', 'true');
      const url = page.locator('#custom-url-input'), key = page.locator('#custom-key-input');
      await tabTo(page, url); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('https://synthetic.invalid/v1');
      await page.keyboard.press(nativeTabKey(page)); await expect(key).toBeFocused();
      await page.keyboard.type('SYNTHETIC UNSAVED ACCESSIBILITY DRAFT');
      const retained = await key.elementHandle();
      await page.keyboard.press(nativeTabKey(page, true)); await expect(url).toBeFocused();
      await page.keyboard.press(nativeTabKey(page)); await expect(key).toBeFocused();
      expect(await page.locator('#settings-modal').innerHTML()).not.toContain('SYNTHETIC UNSAVED ACCESSIBILITY DRAFT');
      await expect(page.locator('#custom-key-status')).toHaveAttribute('role', 'status');
      await expect(page.locator('#custom-key-status')).toHaveAttribute('aria-live', 'polite');
      await assertNoHorizontalClipping(page);
      const violations = await page.locator('#settings-modal').evaluate(async element =>
        (await (window as unknown as {axe: typeof import('axe-core')}).axe.run(element, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations.map(item => ({id: item.id, nodes: item.nodes.map(node => node.target)})));
      expect(violations).toEqual([]);
      await keyboardActivate(page, page.locator('[data-provider="ollama"]'));
      await expect(page.locator('[data-provider="ollama"]')).toHaveAttribute('aria-pressed', 'true');
      expect(await retained!.evaluate((element: HTMLInputElement) => ({connected: element.isConnected, value: element.value}))).toEqual({connected: false, value: ''});
      await retained!.dispose();
      const close = page.locator('#settings-modal [data-settings-action="close"]');
      await tabTo(page, close); await page.keyboard.press(nativeTabKey(page, true));
      expect(await page.locator('#settings-modal').evaluate(modal => modal.contains(document.activeElement))).toBe(true);
      await page.keyboard.press(nativeTabKey(page)); await expect(close).toBeFocused();
      await page.keyboard.press('Escape'); await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
      await expect(launcher).toBeFocused();
      receipts.push({factor, browserZoom: accepted.factor, settings: accepted.settings, metrics, orientation: direction, keyboardOnly: true, privateDraftScrubbed: true, axeViolations: violations});
    }
    const reset = await zoom.setZoom(1); expect(reset.metrics.innerWidth).toBe(initial.innerWidth); expect(reset.metrics.dpr).toBe(initial.dpr);
    expect(await profileReceipt(page)).toBe(stored); expect(issues.errors).toEqual([]); expect(issues.csp).toEqual([]); expect(issues.external).toEqual([]);
    await info.attach('true-browser-zoom-keyboard', {contentType: 'application/json', body: JSON.stringify({receipts, reset, limitations: 'Real automatic headless Chromium tab zoom; no CSSzoom/pinch/device emulation. Scoped automation and axe checks do not establish whole-app WCAG or screen-reader speech.'}, null, 2)});
  } finally {try {await zoom?.close();} finally {await server.close();}}
});

});

async function axReceipt(session: CDPSession, selector: string) {
  const {root} = await session.send('DOM.getDocument');
  const {nodeId} = await session.send('DOM.querySelector', {nodeId: root.nodeId, selector});
  expect(nodeId).toBeGreaterThan(0);
  const {node} = await session.send('DOM.describeNode', {nodeId});
  const {nodes} = await session.send('Accessibility.getPartialAXTree', {nodeId, fetchRelatives: true});
  const target = nodes.find(item => item.backendDOMNodeId === node.backendNodeId);
  expect(target).toBeDefined();
  return {ignored: target!.ignored, role: target!.role?.value, name: target!.name?.value,
    properties: Object.fromEntries((target!.properties || []).map(property => [property.name, property.value.value])),
    propertyTypes: Object.fromEntries((target!.properties || []).map(property => [property.name, property.value.type])),
    relatedNames: nodes.map(item => item.name?.value).filter(Boolean)};
}

test('keyboard-only Nutrition cold and warm actions expose owned loading statuses and retain modal focus', async ({page, context, browserName}, info) => {
  test.setTimeout(90000);
  const server = await startKitServer(artifact), requests: string[] = [], receipts: unknown[] = [];
  let release = () => {};
  let session: CDPSession | undefined;
  try {
    const editorPaths = await nutritionEditorArtifactPaths(artifact), issues = await prepare(context, server.origin);
    const held = new Promise<void>(resolve => {release = resolve;});
    await context.route(url => url.origin === server.origin && editorPaths.has(url.pathname), async route => {
      requests.push(route.request().url()); await held; await route.continue();
    });
    await ready(page, server.origin); const stored = await profileReceipt(page);
    const menu = page.getByRole('button', {name: 'Menu', exact: true});
    if (await menu.isVisible()) await keyboardActivate(page, menu);
    await keyboardActivate(page, page.locator('.nav-item[data-category="body"]'));
    const root = page.locator('[data-nutrition-dashboard-view="intake"]'), status = root.locator('[data-nutrition-loading-status]');
    await expect(root).toBeVisible(); await expect(status).toHaveText('');
    expect(requests).toEqual([]);
    if (browserName === 'chromium') {session = await context.newCDPSession(page); await session.send('Accessibility.enable');}
    for (const [action, name, message, key] of [
      ['open', 'Log meal', 'Opening the meal editor…', 'Space'],
      ['open-history', 'History', 'Opening meal history…', 'Enter'],
      ['open-targets', 'Customize', 'Opening Nutrition setup…', 'Space'],
      ['open-fluid-log', '+ Log drink', 'Opening the drink logger…', 'Enter'],
    ] as const) {
      const control = root.locator(`[data-nutrition-action="${action}"]`).first();
      await tabTo(page, control, action === 'open-history'); expect(requests.length).toBe(action === 'open' ? 0 : 1);
      await page.keyboard.press(key); await expect(control).toHaveAttribute('aria-busy', 'true');
      await expect(control).toHaveAccessibleName(name); await expect(control).toBeFocused(); await expect(control).toBeEnabled();
      await expect(status).toHaveText(message); await expect(status).toHaveAttribute('role', 'status'); await expect(status).toHaveAttribute('aria-live', 'polite'); await expect(status).toHaveAttribute('aria-atomic', 'true');
      expect(await status.evaluate(element => element.closest('[aria-busy="true"]') === null)).toBe(true);
      const snapshot = await root.ariaSnapshot(); expect(snapshot).toContain(message);
      let accessibility: unknown = null;
      if (session) {
        const live = await axReceipt(session, '[data-nutrition-loading-status]');
        expect(live).toMatchObject({ignored: false, role: 'status', properties: {live: 'polite', atomic: true}}); expect(live.relatedNames).toContain(message);
        const button = await axReceipt(session, `[data-nutrition-dashboard-view="intake"] [data-nutrition-action="${action}"]`);
        expect(button).toMatchObject({ignored: false, role: 'button', name, propertyTypes: {busy: 'boolean'}});
        // Chromium AX encodes this boolean as numeric1 on this bundled engine.
        expect([true, 1]).toContain(button.properties['busy']);
        accessibility = {live, button};
      }
      await page.keyboard.press('Escape'); await expect(control).not.toHaveAttribute('aria-busy'); await expect(status).toHaveText(''); await expect(control).toBeFocused();
      await expect(page.locator('#modal-overlay')).not.toHaveClass(/\bshow\b/);
      receipts.push({action, keyboard: key, message, snapshot, accessibility});
    }
    const meal = root.locator('[data-nutrition-action="open"]');
    await keyboardActivate(page, meal, 'Space', true); await expect(status).toHaveText('Opening the meal editor…');
    await expect.poll(() => requests.length).toBe(1); release();
    await expect(page.locator('[data-nutrition-editor-view]')).toBeVisible(); await expect(status).toHaveText(''); await expect(meal).not.toHaveAttribute('aria-busy');
    await expect.poll(() => page.locator('#detail-modal').evaluate(modal => modal.contains(document.activeElement))).toBe(true);
    await keyboardActivate(page, page.getByRole('tab', {name: 'Manual', exact: true}));
    await tabTo(page, page.locator('#nutrition-meal-name')); await expect(page.locator('#nutrition-meal-name')).toHaveAccessibleName(/Meal name/);
    await page.keyboard.press('Escape'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/\bshow\b/); await expect(meal).toBeFocused();
    for (const [action, view] of [['open-history', '[data-nutrition-history-view]'], ['open-targets', '[data-nutrition-entry-view="targets"]'], ['open-fluid-log', '[data-nutrition-entry-view="fluid"]']] as const) {
      const control = root.locator(`[data-nutrition-action="${action}"]`).first();
      await keyboardActivate(page, control, 'Enter', action === 'open-history'); await expect(page.locator(view)).toBeVisible();
      await expect.poll(() => page.locator('#detail-modal').evaluate(modal => modal.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/\bshow\b/); await expect(control).toBeFocused(); await expect(status).toHaveText('');
    }
    expect(requests).toHaveLength(1); expect(await profileReceipt(page)).toBe(stored);
    expect(issues.errors).toEqual([]); expect(issues.csp).toEqual([]); expect(issues.external).toEqual([]);
    await info.attach('keyboard-loading-accessibility', {contentType: 'application/json', body: JSON.stringify({browserName, receipts, keyboardOnly: true, profileUnchanged: true,
      limitation: 'DOM roles/live attributes and actual browser AX exposure; this does not prove human screen-reader speech, timing or pronunciation.'}, null, 2)});
  } finally {release(); try {await context.unrouteAll({behavior: 'wait'}); await session?.detach();} finally {await server.close();}}
});
