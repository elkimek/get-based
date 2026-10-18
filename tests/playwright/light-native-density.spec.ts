import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';

const demo = fs.readFileSync(new URL('../../data/demo-male.json', import.meta.url), 'utf8');
const themes = ['dark', 'light', 'glass', 'synthwave', 'cyberterm', 'neuromancer'] as const;

async function openLight(page: import('@playwright/test').Page, theme: string) {
  await page.addInitScript(({ demo, theme }) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-theme', theme);
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    for (const tour of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${tour}`, 'completed');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1 }]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ ...JSON.parse(demo), profile: { firstName: 'Alex', age: 38 }, sunDefaults: { fitzpatrick: 'II', completedAt: 1 } }));
  }, { demo, theme });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
  });
  await page.route('**/density-font-primer', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/vendor/fonts/fonts.css">' }));
  await page.goto('/density-font-primer');
  await page.evaluate(async () => {
    for (const weight of [400, 500, 600, 700]) await document.fonts.load(`${weight} 14px Inter`);
    await document.fonts.ready;
  });
  await page.goto('/app');
  await page.locator('#sidebar-nav [data-nav-route="light"]').evaluate(element => (element as HTMLElement).click());
  await expect(page.locator('.light-setup-summary-edit')).toBeVisible();
}

async function metrics(locator: import('@playwright/test').Locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, fontSize: style.fontSize, fontWeight: style.fontWeight, padding: style.padding, lineHeight: style.lineHeight, fontFamily: style.fontFamily };
  });
}

for (const theme of themes) test(`Light retains native desktop control density in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLight(page, theme);
  const quick = page.locator('.light-log-action');
  await expect(quick).toHaveCount(3);
  for (const button of await quick.all()) expect(await metrics(button)).toMatchObject({ height: 38, fontSize: '12px', fontWeight: '600', padding: '8px 12px', lineHeight: '18px' });
  expect(await metrics(page.locator('.light-setup-summary-edit'))).toMatchObject({ height: theme === 'cyberterm' || theme === 'neuromancer' ? 26 : 25, fontSize: '12px', padding: '4px 12px' });
  expect(await metrics(page.locator('.light-sessions-show-more'))).toMatchObject({ height: 32, fontSize: '12.5px', padding: '8px 12px', fontFamily: 'Arial' });
  const summary = page.locator('.light-explainer > summary');
  expect(await metrics(summary)).toMatchObject({ height: 43.5, fontSize: '13px', padding: '12px 16px', fontWeight: '600' });
  expect(await metrics(page.locator('.light-data-source-details > summary'))).toMatchObject({ height: 43.5, padding: '12px 16px', fontWeight: '400' });
  await summary.click();
  await expect(page.locator('.light-explainer')).toHaveAttribute('open', '');
  await expect(page.locator('.light-explainer-body')).toBeVisible();
  expect(await page.locator('.light-explainer-body').evaluate(element => { const style = getComputedStyle(element); return [style.fontSize, style.lineHeight, style.padding, style.borderTopWidth]; })).toEqual(['12.5px', '19.375px', '0px 16px 14px', '1px']);
  await page.locator('.light-setup-summary-edit').click();
  await expect(page.locator('.light-setup-focus-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.light-setup-summary-edit')).toBeVisible();
});

test.describe('Light touch targets', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 900 } });
  test('keeps coarse narrow controls at least44px without overflow', async ({ page }) => {
    await openLight(page, 'dark');
    for (const selector of ['.light-log-action', '.light-setup-summary-edit', '.light-sessions-show-more', '.light-explainer > summary', '.light-data-source-details > summary']) {
      for (const element of await page.locator(selector).all()) expect((await metrics(element)).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const channel = page.locator('[data-light-channel-action="toggle-detail"]').first();
    await channel.click();
    await expect(channel).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-light-page-action="open-detailed-session"]').click();
    await expect(page.locator('.sun-detailed-modal')).toBeVisible();
    await expect(page.locator('#det-glass')).toHaveCount(1);
  });
});
