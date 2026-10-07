import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { routeHtml } from '../helpers/browser-static-routes.js';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const open = (page: Page) => page.evaluate(async () => { return await (await import('/js/context-card-dashboard-ai.js')).openDataProtectionPicker(); });
async function configure(page: Page) {
  await page.evaluate(async () => {
    const facade = await import('/js/context-card-dashboard-ai.js'); const calls: string[] = []; Reflect.set(window, 'protectionCalls', calls);
    facade.configureDashboardAISyncSetup(() => calls.push('sync'));
    facade.configureDashboardAIDataProtectionDeps({ showEnableEncryptionModal: () => calls.push('encryption'), pickFolderForBackup: () => calls.push('backup') });
  });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-ai-paused', 'true');
    Reflect.set(window, 'showDirectoryPicker', async () => ({ name: 'Test folder' }));
  });
});
test('authored protection picker preserves all themes, accessible keyboard navigation and existing actions', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' }); await configure(page);
  await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
  // Use a real connected launcher to verify restoration rather than body focus.
  await page.evaluate(() => { const button = document.createElement('button'); button.id = 'protection-test-launcher'; button.textContent = 'Protection test launcher'; document.body.prepend(button); button.focus(); });
  const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData)); await open(page);
  const picker = page.locator('[data-data-protection-view]'); await expect(picker.getByRole('heading', { name: 'Protect your data' })).toBeVisible(); await expect(picker.locator('[data-pick]')).toHaveCount(3);
  await expect(picker.locator('script, [style], [onclick]')).toHaveCount(0);
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
    await page.setViewportSize({ width, height: 850 }); await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await expect(picker.locator('#data-protection-picker-cancel')).toHaveCSS('transition-property', 'none');
    expect(await picker.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run(selector: string, options: unknown): Promise<{ violations: { id: string; nodes: { target: unknown; failureSummary: unknown }[] }[] }> } }).axe.run('[data-data-protection-view]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
    expect(violations, `${theme}/${width} accessibility`).toEqual([]);
    for (const button of await picker.locator('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await picker.locator('#data-protection-picker-cancel').focus(); await page.keyboard.press('Tab'); await expect(picker.locator('[data-pick="encryption"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(picker.locator('#data-protection-picker-cancel')).toBeFocused(); await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0); await expect(page.locator('#protection-test-launcher')).toBeFocused(); expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  for (const action of ['encryption', 'sync', 'backup']) { await open(page); await picker.locator(`[data-pick="${action}"]`).click(); await expect(picker).toHaveCount(0); }
  expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual(['encryption', 'sync', 'backup']);
  await open(page); await page.evaluate(async () => { (await import('/js/context-card-dashboard-ai.js')).configureDashboardAIDataProtectionDeps({ showEnableEncryptionModal: () => (Reflect.get(window, 'protectionCalls') as string[]).push('updated-encryption') }); });
  await picker.locator('[data-pick="encryption"]').click(); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual(['encryption', 'sync', 'backup', 'updated-encryption']);
  expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
  await open(page); await page.locator('#data-protection-picker-overlay').click({ position: { x: 2, y: 2 } }); await expect(picker).toHaveCount(0); expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
test('authored protection picker configured and unsupported choices preserve all status combinations', async ({ page }) => {
  await routeHtml(page, '**/protection-picker-matrix', '<!doctype html><html><body><main id="main-content"></main></body></html>');
  await page.route('**/js/data-protection-status.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const getDataProtectionStatus = () => window.protectionStatus;' }));
  await page.goto('/protection-picker-matrix'); await configure(page);
  for (let bits = 0; bits < 16; bits++) {
    const status = { encryption: !!(bits & 1), sync: !!(bits & 2), backup: !!(bits & 4), backupSupported: !!(bits & 8) };
    await page.evaluate(status => { Reflect.set(window, 'protectionStatus', status); Reflect.set(window, 'protectionCalls', []); }, status);
    // Each configure call captures the current callback log.
    await configure(page); const expected: string[] = [];
    for (const action of status.backupSupported ? ['encryption', 'sync', 'backup'] as const : ['encryption', 'sync'] as const) {
      await open(page); const picker = page.locator('[data-data-protection-view]');
      await expect(picker.locator('[data-pick]')).toHaveCount(status.backupSupported ? 3 : 2);
      const button = picker.locator(`[data-pick="${action}"]`); await expect(button).toContainText(status[action] ? 'Configured' : 'Set up'); await button.click(); await expect(picker).toHaveCount(0);
      if (!status[action]) expected.push(action);
    }
    expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls')), `status ${bits}`).toEqual(expected);
  }
});
test('authored protection picker retires replaced, detached, profile and navigation controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await configure(page); await open(page);
  await page.evaluate(async () => { Reflect.set(window, 'retiredProtectionButton', document.querySelector('[data-data-protection-view] [data-pick="encryption"]')); await (await import('/js/context-card-dashboard-ai.js')).openDataProtectionPicker(); (Reflect.get(window, 'retiredProtectionButton') as HTMLButtonElement).click(); });
  await expect(page.locator('[data-data-protection-view]')).toHaveCount(1); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual([]);
  await page.evaluate(async () => { const button = document.querySelector<HTMLButtonElement>('[data-data-protection-view] [data-pick="sync"]')!; (await import('/js/state.js')).state.currentView = 'insight'; document.getElementById('main-content')!.replaceChildren(document.createElement('section')); button.click(); });
  await expect(page.locator('[data-data-protection-view]')).toHaveCount(0); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual([]);
  await open(page); await page.evaluate(async () => { const button = document.querySelector<HTMLButtonElement>('[data-data-protection-view] [data-pick="backup"]')!; const { state } = await import('/js/state.js'); state.currentProfile = 'protection-other'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); button.click(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); });
  await expect(page.locator('[data-data-protection-view]')).toHaveCount(0); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual([]); expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await open(page); await page.evaluate(() => { const overlay = document.getElementById('data-protection-picker-overlay')!; const button = overlay.querySelector<HTMLButtonElement>('[data-pick="encryption"]')!; overlay.remove(); button.click(); });
  await expect(page.locator('[data-data-protection-view]')).toHaveCount(0); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual([]); expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
test('authored protection picker rejects a cold stylesheet completion after profile or modal replacement', async ({ page }) => {
  await routeHtml(page, '**/protection-picker-cold', '<!doctype html><html><body><main id="main-content"></main><div id="detail-modal"><p>Original</p></div></body></html>');
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let started!: () => void; const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/css/context-editor.css', async route => { started(); await held; await route.continue(); });
  await page.goto('/protection-picker-cold'); await configure(page);
  await page.evaluate(() => { Reflect.set(window, 'protectionPending', import('/js/context-card-dashboard-ai.js').then(facade => facade.openDataProtectionPicker())); });
  await requested; await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'new-protection-profile'; document.getElementById('detail-modal')!.replaceChildren(document.createTextNode('New dialog')); }); release();
  await page.evaluate(async () => { await Reflect.get(window, 'protectionPending'); }); await expect(page.locator('[data-data-protection-view]')).toHaveCount(0);
  expect(await page.locator('#detail-modal').textContent()).toBe('New dialog'); expect(await page.evaluate(() => Reflect.get(window, 'protectionCalls'))).toEqual([]);
  await open(page); await expect(page.locator('[data-data-protection-view]')).toHaveCount(1);
});
test('authored protection picker reports a failed stylesheet and retries the fixed lazy URL', async ({ page }) => {
  await routeHtml(page, '**/protection-picker-retry', '<!doctype html><html><body><div id="notification-container"></div></body></html>');
  const requests: string[] = [];
  await page.route('**/css/context-editor.css*', route => { const url = route.request().url(); requests.push(url); return url.includes('lazy-retry=1') ? route.continue() : route.abort('failed'); });
  await page.goto('/protection-picker-retry'); await configure(page); expect(await open(page)).toBe(false);
  await expect(page.locator('[data-data-protection-view]')).toHaveCount(0); await expect(page.locator('#notification-container')).toContainText('Data protection tools could not be loaded');
  await open(page); await expect(page.locator('[data-data-protection-view]')).toHaveCount(1); expect(requests.map(url => new URL(url).search)).toEqual(['', '?lazy-retry=1']);
});
