import fs from 'node:fs/promises';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
interface DensityRole { id: number; workflow: string; selector: string; expected: Record<string, string>; retainedCustomChrome: Record<string, string> }
const fixture = JSON.parse(await fs.readFile(new URL('../fixtures/nutrition-desktop-density-native.json', import.meta.url), 'utf8')) as { originalCommit: string; roles: DensityRole[] };
const workflows = ['nutrition-open-targets', 'nutrition-open', 'nutrition-open-history'] as const;
test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context, { paused: true });
  await context.addInitScript(() => {
    if (localStorage.getItem('nutrition-density-seeded')) return;
    localStorage.setItem('nutrition-density-seeded', '1'); localStorage.setItem('labcharts-theme', 'dark');
    const stamp = '2026-10-14T12:00:00Z';
    localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], nutritionMeals: [{ id: 'density-meal', name: 'Synthetic audit lunch', mealType: 'lunch', eatenAt: stamp, localDate: '2026-10-14', localTimeMinutes: 720, reviewed: true, createdAt: stamp, updatedAt: stamp, images: [], nutrients: { energyKcal: 640, proteinG: 38, carbohydrateG: 72, fatG: 18, fiberG: 8 }, source: { kind: 'manual' } }] }));
  });
  await context.route('**/*', async route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort(); else await route.continue(); });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
});
async function open(page: Page, workflow: string) {
  const mobileBody = page.locator('[data-mobile-dashboard-action="navigate-tab"][data-mobile-dashboard-route="body"]');
  if (await mobileBody.isVisible()) await mobileBody.click();
  else await page.locator('#sidebar-nav [data-nav-route="body"]').click();
  const action = workflow.replace('nutrition-', '');
  await page.locator('.nutrition-widget-actions [data-nutrition-action="' + action + '"]').click();
  await expect(page.locator('#modal-overlay')).toHaveClass(/show/);
  await page.evaluate(() => document.fonts.ready);
}
test('fine-pointer Nutrition keeps 41 original role metrics across dashboard, setup, entry and history', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1280, height: 900 });
  expect(fixture.originalCommit).toBe('f0d4eb8fec54748d978ed8dc0cc09c6ef377f280'); expect(fixture.roles).toHaveLength(41);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
  let checked = 0, acceptedDashboardTargets = 0;
  for (const workflow of workflows) {
    await open(page, workflow);
    for (const role of fixture.roles.filter(value => value.workflow === workflow)) {
      const scope = role.selector.startsWith('.nutrition-widget') ? page : page.locator('#detail-modal');
      const control = scope.locator(role.selector); await expect(control, 'Role' + role.id).toHaveCount(1);
      const actual = await control.evaluate((element, properties) => { const style = getComputedStyle(element); return Object.fromEntries(properties.map(name => [name, style[name as keyof CSSStyleDeclaration]])); }, Object.keys(role.expected));
      let expected = role.expected;
      if (role.id >= 1 && role.id <= 4) {
        expect(role.workflow).toBe('nutrition-open-targets');
        const selector = role.id === 4 ? '.nutrition-widget-starter-note button'
          : '.nutrition-widget-actions [data-nutrition-action="' + ['open-history', 'open-targets', 'open'][role.id - 1] + '"]';
        expect(role.selector).toBe(selector);
        // Accepted before this polish pass (3242f500): Dashboard actions keep
        // their original compact typography/padding with an exact 44px target.
        // Preserve the historical fixture and assert its original value too.
        expect(role.expected.minHeight).toBe('auto');
        expected = {...role.expected, minHeight: '44px'}; acceptedDashboardTargets++;
      }
      expect(actual, 'Native Nutrition role' + role.id + ':' + role.selector).toEqual(expected); checked++;
    }
    if (workflow === 'nutrition-open-history') {
      const selected = page.locator('#detail-modal [data-nutrition-action=\"set-history-range\"][aria-pressed=\"true\"]');
      expect(await selected.evaluate(element => getComputedStyle(element).backgroundImage)).toBe(await page.evaluate(() => (() => { const probe = document.createElement('span'); probe.style.background = 'var(--accent-gradient)'; document.body.append(probe); const expected = getComputedStyle(probe).backgroundImage; probe.remove(); return expected; })()));
    }
    await page.locator('#detail-modal .modal-close').click();
  }
  expect(checked).toBe(41); expect(acceptedDashboardTargets).toBe(4);
});
test.describe('coarse-pointer Nutrition contract', () => {
  test.use({ hasTouch: true });
  test('large touch targets remain available in setup, entry, history and drink logging', async ({ page }) => {
    test.setTimeout(180000);
    await page.addStyleTag({ url: '/themes-extra.css' });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const width of [320, 1280]) for (const theme of ['dark', 'light', 'glass', 'cyberterm', 'neuromancer', 'synth-sunrise']) for (const workflow of workflows) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await open(page, workflow);
      for (const control of await page.locator('#detail-modal button,#detail-modal summary,#detail-modal input:not([type="checkbox"]):not([type="file"]),#detail-modal textarea,#detail-modal select').all()) {
        if (!await control.isVisible()) continue; const box = await control.boundingBox(); if (!box) throw new Error('Visible control lacks a box');
        expect(box.height, await control.getAttribute('id') || await control.textContent() || 'touch target').toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.locator('#detail-modal').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.locator('#detail-modal .modal-close').click();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.nutrition-widget-actions [data-nutrition-action="open-targets"]').click();
    await page.locator('#nutrition-target-energy').fill('2350');
    await page.locator('[data-nutrition-widget-metric][value=\"fluidMl\"]').check();
    await page.locator('#nutrition-target-energy').press('Enter');
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    await page.locator('.nutrition-widget-actions [data-nutrition-action="open-targets"]').click(); await expect(page.locator('#nutrition-target-energy')).toHaveValue('2350');
    await page.locator('#detail-modal .modal-close').click();
    await expect(page.locator('.nutrition-inline-log')).toBeVisible(); await page.locator('.nutrition-inline-log').click(); await expect(page.locator('[data-nutrition-entry-view=\"fluid\"]')).toBeVisible();
    for (const preset of await page.locator('.nutrition-fluid-preset').all()) { const box = await preset.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
    await page.locator('#nutrition-fluid-amount').fill('275.5'); await expect(page.locator('#nutrition-fluid-preview')).toContainText('275.5');
  });
});
