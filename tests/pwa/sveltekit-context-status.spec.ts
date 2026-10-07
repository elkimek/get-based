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
test('static authored context assessments restore cached literal summaries across offline cold launches without new inference', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = [], csp: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  await installDiscussionFixture(context); await installDiscussionProvider(context);
  await context.exposeBinding('contextStatusCsp', (_, directive: string) => { csp.push(directive); });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { contextStatusCsp(value: string): Promise<void> }).contextStatusCsp(event.violatedDirective); });
    if (!localStorage.getItem('context-status-seeded')) {
      localStorage.setItem('context-status-seeded', '1');
      localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], diet: { breakfast: 'Reported eggs' } }));
    }
    Reflect.set(window, 'contextHealthRequests', 0);
    const original = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/^http:\/\/(?:127\.0\.0\.1|localhost):11434\//.test(url) && /\/(?:v1\/chat\/completions|api\/chat)$/.test(url)
        && String(options?.body || '').includes('Dot colors:')) {
        Reflect.set(window, 'contextHealthRequests', Number(Reflect.get(window, 'contextHealthRequests')) + 1);
        const content = JSON.stringify({ diet: { summary: 'Reported eggs', dot: 'yellow', tip: 'Literal <tip> & cached' } });
        if (url.endsWith('/api/chat')) return new Response(JSON.stringify({ message: { content }, done: true, prompt_eval_count: 7, eval_count: 3 }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
        return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
      }
      return original(input, options);
    };
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
    server.state.offline = true; await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold); await insight(cold);
      const restored = cold.locator('#main-content [data-context-card-key="diet"]');
      await expect(restored.locator('.context-card-body')).toHaveText('Reported eggs');
      await expect(restored.locator('.ctx-ai-summary')).toContainText('Literal <tip> & cached');
      await expect(restored.locator('.ctx-health-label')).toHaveText('Caution');
      expect(await restored.locator('tip, img, script').count()).toBe(0);
      expect(await cold.evaluate(() => Number(Reflect.get(window, 'contextHealthRequests')))).toBe(0);
      expect(await cold.evaluate(() => localStorage.getItem('labcharts-default-contextHealth'))).toBe(cache);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
