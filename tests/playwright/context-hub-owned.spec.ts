import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-ai-paused', 'true');
  });
});
async function seed(page: Page) {
  await page.evaluate(async () => {
    const [{ state }, profile, data] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.interpretiveLens = 'Existing <lens> & framework'; state.importedData.diet = { breakfast: 'eggs' };
    if (!await data.saveImportedData()) throw new Error('Context fixture failed');
  });
}
async function open(page: Page) {
  await page.evaluate(async () => { await (await import('/js/context-card-dashboard-ai.js')).openContextModal(); });
  await expect(page.locator('[data-context-hub-view]')).toHaveAttribute('data-context-save-state', 'idle');
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
}
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('authored Context hub preserves source layout, all themes, keyboard settings and dialog navigation', async ({ page }) => {
    test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page);
    const hub = page.locator('[data-context-hub-view]');
    await expect(hub.getByRole('heading', { name: 'Context', exact: true })).toBeVisible(); await expect(hub.locator('[data-context-toggle]')).toHaveCount(9);
    await expect(hub.locator('[data-context-section]')).toHaveCount(5); await expect(hub.locator('script, lens, [onclick], [style]')).toHaveCount(0);
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
    const enabledSlider = hub.locator('label[for="context-source-insight-cards"] > span');
    const inactiveSlider = hub.locator('label[for="context-source-genome-summary"] > span');
    const thumbOffset = () => enabledSlider.evaluate(element => { const offset = getComputedStyle(element, '::after').translate; return offset === 'none' ? 0 : parseFloat(offset); });
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 });
      expect(await hub.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
      expect(await hub.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      expect(await enabledSlider.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(await inactiveSlider.evaluate(element => getComputedStyle(element).backgroundColor));
      await expect.poll(thumbOffset).toBe(16);
      for (const control of await hub.locator('button, input, select').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const toggle = hub.locator('[data-context-toggle="insight-cards"]'); await toggle.focus(); await expect(enabledSlider).toHaveCSS('outline-width', '2px'); await page.keyboard.press('Space');
    await expect(hub).toHaveAttribute('data-context-save-state', 'idle'); await expect(toggle).not.toBeChecked(); await expect(toggle).toBeFocused(); await expect.poll(thumbOffset).toBe(0); expect(await enabledSlider.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(await inactiveSlider.evaluate(element => getComputedStyle(element).backgroundColor)); expect((await stored(page)).contextSourceSettings['insight-cards']).toBe(false);
    await hub.locator('#nutrition-context-days').selectOption('90'); await expect(hub).toHaveAttribute('data-context-save-state', 'idle'); expect((await stored(page)).nutritionContextDays).toBe(90);
    await hub.locator('[data-pick="lens"]').click(); await expect(page.locator('#context-hub-overlay')).not.toHaveClass(/show/); await expect(page.locator('#interpretive-lens-textarea')).toHaveValue('Existing <lens> & framework');
    await page.locator('#detail-modal').getByRole('button', { name: 'Back to Context', exact: true }).click(); await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
    await page.keyboard.press('Escape'); await expect(page.locator('#context-hub-overlay')).not.toHaveClass(/show/); expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
});
test('authored Context hub retains a failed IndexedDB setting for retry without publishing it', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page); const before = await stored(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; let writes = 0; IDBObjectStore.prototype.put = function(value, key) { if (String(key).endsWith('-imported') && ++writes === 1) throw new DOMException('Simulated storage quota', 'QuotaExceededError'); return original.call(this, value, key); }; });
  const hub = page.locator('[data-context-hub-view]'); await hub.locator('[data-context-toggle="light-sun"]').uncheck(); await expect(hub).toHaveAttribute('data-context-save-state', 'failed');
  await expect(hub.getByRole('status')).toContainText('could not be saved'); expect(await stored(page)).toEqual(before);
  expect(await page.evaluate(async () => (await import('/js/lab-context-settings.js')).isLightSunContextEnabled())).toBe(true);
  await hub.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(hub).toHaveAttribute('data-context-save-state', 'idle'); expect((await stored(page)).contextSourceSettings['light-sun']).toBe(false);
});
test('authored Context hub refreshes peer conflicts and explicitly keeps their saved settings', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page);
  await page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    const key = profile.profileStorageKey(state.currentProfile, 'imported'), peer = JSON.parse((await crypto.encryptedGetItem(key))!); peer.contextSourceSettings = { 'supplements-meds': false }; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  });
  const hub = page.locator('[data-context-hub-view]'); await hub.locator('[data-context-toggle="light-sun"]').uncheck(); await expect(hub).toHaveAttribute('data-context-save-state', 'failed');
  await expect(hub.getByRole('status')).toContainText('changed in another tab'); await hub.getByRole('button', { name: 'Keep saved settings', exact: true }).click();
  await expect(hub).toHaveAttribute('data-context-save-state', 'idle'); await expect(hub.locator('[data-context-toggle="supplements-meds"]')).not.toBeChecked(); await expect(hub.locator('[data-context-toggle="light-sun"]')).toBeChecked();
  expect((await stored(page)).contextSourceSettings).toEqual({ 'supplements-meds': false });
});
test('authored Context hub retires old controls after replacement and profile changes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page);
  await page.evaluate(async () => {
    const old = document.querySelector<HTMLInputElement>('[data-context-toggle="light-sun"]')!; Reflect.set(window, 'oldContextToggle', old);
    await (await import('/js/context-card-dashboard-ai.js')).openContextModal(); old.checked = false; old.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const hub = page.locator('[data-context-hub-view]'); await expect(hub).toHaveAttribute('data-context-save-state', 'idle'); expect((await stored(page)).contextSourceSettings['light-sun']).toBeUndefined();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'other-hub-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); const old = Reflect.get(window, 'oldContextToggle') as HTMLInputElement; old.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#context-hub-overlay')).not.toHaveClass(/show/); expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextSourceSettings)).toEqual({});
});

test('authored Context hub stays with this tab profile after a peer changes the shared profile selection', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.evaluate(() => {
    localStorage.setItem('labcharts-default-ai-ctx-insight-cards', 'off');
    localStorage.setItem('labcharts-other-hub-tab-ai-ctx-insight-cards', 'on');
    localStorage.setItem('labcharts-active-profile', 'other-hub-tab');
  });
  await open(page); const hub = page.locator('[data-context-hub-view]');
  await expect(hub.locator('[data-context-toggle="insight-cards"]')).not.toBeChecked();
  expect((await stored(page)).contextSourceSettings['insight-cards']).toBe(false);
  await hub.locator('[data-context-toggle="light-sun"]').uncheck();
  await expect(hub).toHaveAttribute('data-context-save-state', 'idle');
  expect((await stored(page)).contextSourceSettings).toMatchObject({ 'insight-cards': false, 'light-sun': false });
  expect(await page.evaluate(() => localStorage.getItem('labcharts-other-hub-tab-ai-ctx-insight-cards'))).toBe('on');
  expect(await page.evaluate(() => localStorage.getItem('labcharts-active-profile'))).toBe('other-hub-tab');
});
