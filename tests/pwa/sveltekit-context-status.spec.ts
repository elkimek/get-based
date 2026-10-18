import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function insight(page: Page) {
  const link = page.locator('.nav-item[data-category="insight"]');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await link.click(); await expect(page.locator('#main-content [data-context-cards-view]')).toBeVisible();
}
async function openCachedTips(page: Page) {
  const diet = page.locator('#main-content [data-context-card-key="diet"]');
  await diet.getByRole('button', { name: 'Lifestyle tips for Diet & Digestion' }).click();
  const modal = page.locator('#detail-modal');
  await expect(modal.locator('[data-context-tips-view] h2')).toHaveText(/Diet & Digestion — Tips/);
  await expect(modal).toContainText('Digestive enzyme support');
  await expect(modal).toContainText('not individualized medical advice or a care plan');
  await expect(modal.locator('.ctx-tip-slot-label').first()).toHaveCSS('font-size', '13px');
  await modal.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
}
test('static authored context assessments restore cached literal summaries across offline cold launches without new inference', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context); await installDiscussionProvider(context, {replyMode: 'context-health'});
  await context.exposeBinding('contextStatusCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextStatusCsp(value: string): Promise<void> }).contextStatusCsp(event.violatedDirective); });
    if (!localStorage.getItem('context-status-seeded')) {
      localStorage.setItem('context-status-seeded', '1');
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], diet: { breakfast: 'Reported eggs' } }));
    }
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page); await insight(page);
    const diet = page.locator('#main-content [data-context-card-key="diet"]');
    await expect(diet.locator('.context-card-body')).toHaveText('Reported eggs');
    await expect(diet.locator('.ctx-ai-summary')).toContainText('Literal <tip> & cached');
    await expect(diet.locator('.ctx-health-label')).toHaveText('Caution');
    const cache = await page.evaluate(() => localStorage.getItem('labcharts-default-contextHealth'));
    expect(JSON.parse(cache!)).toMatchObject({ dots: { diet: 'yellow' }, summaries: { diet: 'Literal <tip> & cached' }, cardSummaries: { diet: 'Reported eggs' }, fingerprints: { diet: expect.any(String) } });
    expect(await page.evaluate(() => Number(Reflect.get(window, 'contextHealthRequests')))).toBeGreaterThan(0);
    server.state.offline = true; await openCachedTips(page); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await insight(cold);
      const restored = cold.locator('#main-content [data-context-card-key="diet"]');
      await expect(restored.locator('.context-card-body')).toHaveText('Reported eggs');
      await expect(restored.locator('.ctx-ai-summary')).toContainText('Literal <tip> & cached');
      await expect(restored.locator('.ctx-health-label')).toHaveText('Caution');
      expect(await restored.locator('tip, img, script').count()).toBe(0);
      await openCachedTips(cold);
      expect(await cold.evaluate(() => Number(Reflect.get(window, 'contextHealthRequests')))).toBe(0);
      expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-contextHealth'))).toBe(cache);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
