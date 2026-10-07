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
    state.importedData = profile.createDefaultProfileData();
    state.importedData.healthGoals = [{ text: 'Low original', severity: 'minor', extra: 'keep' }, { text: 'High <goal> & literal', severity: 'major' }, { text: 'Medium original', severity: 'mild' }, { text: 'Legacy', severity: '<custom>' }];
    if (!await data.saveImportedData()) throw new Error('Could not seed goals'); await editors.openHealthGoalsEditor();
  });
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
}
test('authored Goals preserve sorted storage indices, literal text and readable themed controls', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Add goal', exact: true });
  await expect(modal.locator('.goals-text')).toHaveText(['High <goal> & literal', 'Medium original', 'Low original', 'Legacy']); expect(await modal.locator('goal, custom, img, script').count()).toBe(0);
  const starters = modal.getByRole('group', { name: 'Common starting points', exact: true }).getByRole('button'); expect(await starters.count()).toBe(8);
  for (const starter of await starters.all()) { await starter.click(); await expect(input).toHaveValue((await starter.textContent())!); await expect(input).toBeFocused(); }
  await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 });
    expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
    expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
  }
  const priority = modal.getByRole('group', { name: 'Priority', exact: true }); await expect(priority.getByRole('button', { name: 'Medium', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await input.fill(' New <goal> & text '); await priority.getByRole('button', { name: 'High', exact: true }).click(); await input.focus(); await page.keyboard.press('Enter');
  await expect(modal.getByRole('status')).toHaveText('Saved'); await expect(input).toHaveValue(''); await expect(input).toBeFocused();
  await expect(priority.getByRole('button', { name: 'Medium', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const added = await stored(page); expect(added.healthGoals[4]).toMatchObject({ text: 'New <goal> & text', severity: 'major' });
  expect(added.changeHistory.find((item: { field: string }) => item.field === 'healthGoals').snapshot).toEqual(added.healthGoals);
  await modal.getByRole('button', { name: 'Remove goal: High <goal> & literal', exact: true }).click(); await expect(modal.locator('.goals-text')).not.toContainText(['High <goal> & literal']);
  const removed = await stored(page); expect(removed.healthGoals[0]).toMatchObject({ text: 'Low original', extra: 'keep' }); expect(removed.healthGoals).toHaveLength(4); expect(removed._deleted.healthGoals).toHaveLength(1);
  await modal.getByRole('button', { name: 'Done', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
});
test('authored Goals retain failed input and retry the actual IndexedDB write', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; let writes = 0; IDBObjectStore.prototype.put = function(value, key) { if (String(key).endsWith('-imported')) { Reflect.set(window, 'goalWriteAttempts', ++writes); if (writes === 1) throw new DOMException('Simulated storage quota', 'QuotaExceededError'); } return original.call(this, value, key); }; });
  const modal = page.locator('#detail-modal'), input = modal.getByRole('textbox', { name: 'Add goal', exact: true }); await input.fill('Retained draft'); await modal.getByRole('button', { name: 'Add goal', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Not saved — try again'); await expect(input).toHaveValue('Retained draft'); expect((await stored(page)).healthGoals).toHaveLength(4);
  await expect(page.locator('.notification-toast').filter({ hasText: 'Health goals saved' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Add goal', exact: true }).click(); await expect(modal.getByRole('status')).toHaveText('Saved'); expect((await stored(page)).healthGoals).toHaveLength(5); expect(await page.evaluate(() => Reflect.get(window, 'goalWriteAttempts'))).toBe(2);
});
test('authored Goals sync refresh keeps the same draft input and retires detached row actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const input = page.locator('#goal-text-input'); await input.fill('Unsubmitted draft');
  await page.locator('#goal-severity-select').getByRole('button', { name: 'High', exact: true }).click(); await input.focus();
  await page.evaluate(async () => {
    Reflect.set(window, 'goalInput', document.getElementById('goal-text-input')); Reflect.set(window, 'retiredGoalRemove', document.querySelector('[title="Remove goal"]'));
    const [{ state }, data] = await Promise.all([import('/js/state.js'), import('/js/data.js')]); state.importedData.healthGoals = [{ text: 'Synced peer', severity: 'minor' }]; if (!await data.saveImportedData()) throw new Error('Sync fixture failed'); window.dispatchEvent(new CustomEvent('labcharts-sync-applied'));
  });
  await expect(page.locator('.goals-text')).toHaveText(['Synced peer']); await expect(input).toHaveValue('Unsubmitted draft'); await expect(input).toBeFocused(); await expect(page.locator('#goal-severity-select [data-context-value="major"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.getElementById('goal-text-input') === Reflect.get(window, 'goalInput'))).toBe(true);
  await page.evaluate(() => { (Reflect.get(window, 'retiredGoalRemove') as HTMLButtonElement).click(); }); expect((await stored(page)).healthGoals).toEqual([{ text: 'Synced peer', severity: 'minor' }]);
});
test('authored Goals clear confirmation preserves newly synced goals and supports cancellation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal');
  await modal.getByRole('button', { name: 'Clear All', exact: true }).click(); await page.locator('#confirm-cancel').click(); expect((await stored(page)).healthGoals).toHaveLength(4);
  await modal.getByRole('button', { name: 'Clear All', exact: true }).click();
  await page.evaluate(async () => { const [{ state }, data] = await Promise.all([import('/js/state.js'), import('/js/data.js')]); state.importedData.healthGoals.push({ text: 'Arrived during confirmation', severity: 'major' }); if (!await data.saveImportedData()) throw new Error('Sync fixture failed'); window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); });
  await page.locator('#confirm-ok').click(); await expect(modal.getByRole('status')).toContainText('goals changed elsewhere'); expect((await stored(page)).healthGoals).toHaveLength(5);
  await modal.getByRole('button', { name: 'Clear All', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect((await stored(page)).healthGoals).toEqual([]);
});
test('authored Goals retire controls and confirmations after profile or dialog changes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  await page.locator('#detail-modal').getByRole('button', { name: 'Clear All', exact: true }).click();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'retired-goals-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); });
  await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await seed(page); await page.evaluate(async () => { Reflect.set(window, 'retiredGoalAdd', Array.from(document.querySelectorAll<HTMLButtonElement>('#detail-modal button')).find(button => button.textContent === 'Add goal')); await (await import('/js/context-card-lifestyle-editors.js')).openStressEditor(); (Reflect.get(window, 'retiredGoalAdd') as HTMLButtonElement).click(); await (await import('/js/context-card-lifestyle-editors.js')).addHealthGoal(); });
  await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'stress'); expect((await stored(page)).healthGoals).toHaveLength(4);
});
