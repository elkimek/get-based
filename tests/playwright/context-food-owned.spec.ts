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
    state.importedData = profile.createDefaultProfileData(); state.importedData.diet = { breakfast: 'strawberries and yogurt', lunch: 'canned tuna with avocado', note: 'Keep original' };
    if (!await data.saveImportedData()) throw new Error('Could not seed food signals');
  });
}
async function open(page: Page) { await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).showDietContaminantsModal(); }); await expect(page.locator('[data-food-contaminants-view]')).toBeVisible(); }
async function insight(page: Page) { const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await menu.click(); await page.locator('.nav-item[data-category="insight"]').click(); await expect(page.locator('[data-context-cards-view]')).toBeVisible(); }
test('authored food signals preserve source groups, accessible themes, keyboard controls and the cold badge', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' }); await seed(page); await insight(page);
  const badge = page.locator('[data-food-contaminant-badge]'); await expect(badge).toHaveJSProperty('tagName', 'BUTTON'); await expect(badge).toContainText('3 food contaminant signals detected');
  await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 });
    // Theme changes animate the catalog surface; audit its settled colors.
    await badge.evaluate(async root => {
      const animations: Animation[] = [];
      for (let element: Element | null = root; element; element = element.parentElement) {
        getComputedStyle(element).backgroundColor;
        animations.push(...element.getAnimations());
      }
      await Promise.all(animations.filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
    });
    expect((await badge.boundingBox())!.height, `${theme}/${width} badge target`).toBeGreaterThanOrEqual(44);
    expect(await badge.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} badge overflow`).toBe(true);
    expect(await badge.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} badge accessibility`).toEqual([]);
  }
  await badge.focus(); await page.keyboard.press('Space'); await expect(page.locator('[data-food-contaminants-view]')).toBeVisible();
  const modal = page.locator('#detail-modal'); await expect(modal).toHaveAttribute('aria-labelledby', 'context-food-contaminants-title');
  await expect(modal.getByRole('heading', { level: 3 })).toHaveText(['🥬 Pesticide Residues', '🧴 Plastic Chemicals', '✅ Low Contamination']);
  expect(await modal.locator('[onclick], [data-lifestyle-action]').count()).toBe(0);
  const expected = await page.evaluate(async () => { const [{ state }, food] = await Promise.all([import('/js/state.js'), import('/js/food-contaminants.js')]); return food.scanDietForContaminants(state.importedData.diet).map(item => ({ text: item.warning, source: item.source, url: item.url })); });
  for (const item of expected) { await expect(modal).toContainText(item.text); expect(await modal.getByRole('link', { name: item.source, exact: true }).all().then(async links => Promise.all(links.map(link => link.getAttribute('href'))))).toContain(item.url); }
  for (const link of await modal.getByRole('link').all()) { await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener'); }
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 });
    expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
    expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
    for (const control of await modal.locator('button, a').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await modal.getByRole('button', { name: 'Close', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.changeHistory)).toEqual([]);
});
test('authored food signals open actual Chat and dispatch their original prompt once', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await expect(page.locator('body')).not.toHaveClass(/\bchat-autostart-reserved\b/);
  await seed(page); await open(page);
  await page.evaluate(async () => { Reflect.set(window, 'foodPrompts', []); (await import('/js/context-card-lifestyle-runtime.js')).configureContextCardLifestyleRuntimeDeps({ useChatPrompt: text => { (Reflect.get(window, 'foodPrompts') as string[]).push(text); } }); });
  await page.locator('#detail-modal').getByRole('button', { name: 'Discuss with AI', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'foodPrompts'))).toEqual(['What food contaminants should I be concerned about based on my diet?']);
});
test('authored food signals reject old controls and pending Chat after dialog and profile retirement', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page);
  await page.evaluate(async () => {
    const retired = Array.from(document.querySelectorAll<HTMLButtonElement>('#detail-modal button')).find(button => button.textContent === 'Discuss with AI')!;
    Reflect.set(window, 'foodPrompts', []); (await import('/js/context-card-lifestyle-runtime.js')).configureContextCardLifestyleRuntimeDeps({ openChatPanel: () => new Promise(resolve => { Reflect.set(window, 'releaseFoodChat', resolve); }), useChatPrompt: text => { (Reflect.get(window, 'foodPrompts') as string[]).push(text); } });
    await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor(); retired.click();
  });
  await expect(page.locator('[data-context-goals-view]')).toBeVisible(); expect(await page.evaluate(() => Reflect.get(window, 'foodPrompts'))).toEqual([]);
  await open(page); await page.locator('#detail-modal').getByRole('button', { name: 'Discuss with AI', exact: true }).click();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'food-other'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); const release = Reflect.get(window, 'releaseFoodChat') as (value: boolean) => void; release(true); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(await page.evaluate(() => Reflect.get(window, 'foodPrompts'))).toEqual([]); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
});
test('authored food signals retire on synced diet changes without writing profile data', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await open(page);
  await page.evaluate(async () => { const [{ state }, data] = await Promise.all([import('/js/state.js'), import('/js/data.js')]); state.importedData.diet = { breakfast: 'pineapple' }; if (!await data.saveImportedData()) throw new Error('Could not save peer diet'); window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); });
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.changeHistory)).toEqual([]);
  await open(page); await expect(page.locator('#food-signals-clean')).toBeVisible(); await expect(page.locator('#food-signals-pesticide, #food-signals-plastic')).toHaveCount(0);
});
test('authored cold food badge load cannot replace a newer dialog', async ({ page }) => {
  let release!: () => void, requested!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/js/context-card-lifestyle-editors-impl.js*', async route => { requested(); await held; await route.continue(); });
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await insight(page); await page.locator('[data-food-contaminant-badge]').click(); await started;
  await page.evaluate(async () => { await (await import('/js/context-health-goals-view.js')).openHealthGoalsEditor(); }); release(); await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).loadLifestyleContextEditors(); });
  await expect(page.locator('[data-context-goals-view]')).toBeVisible(); await expect(page.locator('[data-food-contaminants-view]')).toHaveCount(0);
});
