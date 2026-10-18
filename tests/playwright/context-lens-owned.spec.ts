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
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.interpretiveLens = 'Existing <framework> & text\nSecond line';
    if (!await data.saveImportedData()) throw new Error('Could not seed lens'); await editors.openInterpretiveLensEditor();
  });
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

  test('authored Lens preserves literal multiline text, themes, keyboard save and confirmed clear', async ({ page }) => {
    test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' }); await seed(page);
    const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Interpretive lens', exact: true });
    await expect(input).toHaveValue('Existing <framework> & text\nSecond line'); await expect(input).toBeFocused(); expect(await modal.locator('framework, script, [data-lifestyle-action]').count()).toBe(0);
    await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 });
      expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
      expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
      for (const button of await modal.getByRole('button').all()) { const bounds = await button.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); }
    }
    await input.fill('  New <lens> & text\nLine two  '); await modal.getByRole('button', { name: 'Save', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const saved = await stored(page); expect(saved.interpretiveLens).toBe('New <lens> & text\nLine two'); expect(saved.changeHistory.find((item: { field: string }) => item.field === 'interpretiveLens').snapshot).toBe(saved.interpretiveLens);
    await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openInterpretiveLensEditor(); }); await expect(input).toHaveValue(saved.interpretiveLens);
    await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-cancel').click(); await expect(input).toHaveValue(saved.interpretiveLens);
    await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect((await stored(page)).interpretiveLens).toBe('');
  });
});
test('authored Lens retains failed draft and retries actual IndexedDB storage', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; let writes = 0; IDBObjectStore.prototype.put = function(value, key) { if (String(key).endsWith('-imported')) { Reflect.set(window, 'lensWriteAttempts', ++writes); if (writes === 1) throw new DOMException('Simulated storage quota', 'QuotaExceededError'); } return original.call(this, value, key); }; });
  const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Interpretive lens', exact: true }); await input.fill('Retry <lens>'); await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Not saved — try again'); await expect(input).toHaveValue('Retry <lens>'); expect((await stored(page)).interpretiveLens).toBe('Existing <framework> & text\nSecond line');
  await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect((await stored(page)).interpretiveLens).toBe('Retry <lens>'); expect(await page.evaluate(() => Reflect.get(window, 'lensWriteAttempts'))).toBe(2);
});
test('authored Lens preserves a peer edit while retaining the conflicted input', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Interpretive lens', exact: true }); await input.fill('Unsubmitted draft'); await input.focus();
  await page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]); const key = profile.profileStorageKey(state.currentProfile, 'imported');
    const peer = JSON.parse((await crypto.encryptedGetItem(key))!); peer.interpretiveLens = 'Peer framework'; await crypto.encryptedSetItem(key, JSON.stringify(peer)); window.dispatchEvent(new CustomEvent('labcharts-sync-applied'));
  });
  await expect(input).toHaveValue('Unsubmitted draft'); await expect(input).toBeFocused(); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('changed elsewhere'); await expect(input).toHaveValue('Unsubmitted draft'); expect((await stored(page)).interpretiveLens).toBe('Peer framework');
});
test('authored Lens back action returns to Context and rejects retired delayed returns and confirmations', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.locator('#detail-modal').getByRole('button', { name: 'Back to Context', exact: true }).click(); await expect(page.locator('#context-hub-overlay')).toHaveClass(/show/);
  await page.locator('#context-hub-overlay [data-pick="lens"]').click(); await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'interpretiveLens');
  // Re-enter through the real Context overview; the Lens editor is a new owner.
  expect((await stored(page)).interpretiveLens).toBe('Existing <framework> & text\nSecond line');
  await page.evaluate(() => { const original = window.setTimeout.bind(window); window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => { if (timeout === 0 && typeof handler === 'function' && handler.toString().includes('openContextModalRuntime')) { Reflect.set(window, 'heldLensBack', handler); return 0; } return original(handler, timeout, ...args); }) as typeof window.setTimeout; });
  await page.locator('#detail-modal').getByRole('button', { name: 'Back to Context', exact: true }).click();
  await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor(); const held = Reflect.get(window, 'heldLensBack'); if (typeof held !== 'function') throw new Error('Lens return was not held'); held(); });
  await expect(page.locator('[data-context-goals-view]')).toBeVisible();
  await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openInterpretiveLensEditor(); }); await page.locator('#detail-modal').getByRole('button', { name: 'Clear', exact: true }).click();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'retired-lens-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); state.importedData.interpretiveLens = 'Other'; window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); });
  await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.interpretiveLens)).toBe('Other');
});

test('authored Lens cold Back load cannot open Context over a newer dialog', async ({ page }) => {
  let release!: () => void, requested!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/js/context-card-dashboard-ai-impl.js*', async route => { requested(); await held; await route.continue(); });
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.locator('#detail-modal').getByRole('button', { name: 'Back to Context', exact: true }).click(); await started;
  await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor(); });
  release(); await page.evaluate(async () => { await (await import('/js/context-card-dashboard-ai.js')).loadDashboardAIModule(); });
  await expect(page.locator('[data-context-goals-view]')).toBeVisible(); await expect(page.locator('#context-hub-overlay')).toBeHidden();
});
