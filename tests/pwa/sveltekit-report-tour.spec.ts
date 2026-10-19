import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

async function keyboardActivate(page: Page, control: Locator) {
  await page.keyboard.press(nativeTabKey(page));
  await control.focus();
  await expect(control).toBeFocused();
  expect(await control.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Enter');
}

async function inspectReport(page: Page, phase: string) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav.mobile-open').count()) await menu.click();
  await page.locator('[data-nav-action="open-report-builder"]').click();
  const overlay = page.locator('#report-builder-overlay[data-report-builder-view]');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);
  await expect(page.locator('#sidebar-backdrop')).not.toHaveClass(/\bshow\b/);
  await expect(overlay.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'report-builder-title');
  await expect(overlay.locator('#report-builder-title')).toHaveText('Create a report');
  await expect(overlay.locator('#report-include-ai')).toBeDisabled();
  await expect(overlay.locator('#report-include-ai')).not.toBeChecked();
  await expect(overlay.locator('[data-report-action="export"]')).toHaveText('Preview PDF');
  await expect(overlay.locator('[data-report-action="generate-ai-summary"]')).toBeHidden();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await keyboardActivate(page, overlay.locator('[data-report-action="set-preset"][data-report-preset="full"]'));
  await expect(overlay).toHaveAttribute('data-report-preset', 'full');
  await expect(overlay.locator('[data-report-template-customized]')).toBeHidden();
  await overlay.locator('[name="report-detail"][value="appendix"]').check();
  await overlay.locator('#report-range-mode').selectOption('both');
  await overlay.locator('#report-purpose').fill('Review stored facts and literal <questions>.');
  await overlay.locator('[data-report-for="context"] summary').click();
  const context = overlay.locator('[data-report-context]').first();
  await expect(context).toBeChecked();
  await context.uncheck();
  await expect(context).not.toBeChecked();
  await overlay.locator('[data-report-section="nutrition"]').uncheck();
  await expect(overlay.locator('[data-report-template-customized]')).toBeVisible();
  await overlay.locator('[data-report-for="notes"] summary').click();
  await expect(overlay.locator('.report-note-review')).toContainText('Preserved <timeline> note');
  await expect(overlay.locator('.report-note-review img,.report-note-review script')).toHaveCount(0);
  await overlay.locator('[data-report-for="notes"] summary').click();
  await expect(overlay.locator('.report-note-review')).toBeHidden();

  await overlay.locator('[data-report-action="set-preset"][data-report-preset="lifestyle"]').click();
  await expect(overlay.locator('[data-report-for="categories"]')).toBeHidden();
  await expect(overlay.locator('#report-date-range')).toHaveValue('3m');
  await overlay.locator('[data-report-action="set-preset"][data-report-preset="full"]').click();
  await expect(overlay.locator('[data-report-for="categories"]')).toBeVisible();
  await expect(overlay.locator('#report-date-range')).toHaveValue('all');
  await expect(overlay.locator('#report-range-mode')).toHaveValue('both');
  await expect(overlay.locator('[name="report-detail"][value="appendix"]')).toBeChecked();
  await expect(overlay.locator('#report-purpose')).toHaveValue('Review stored facts and literal <questions>.');
  await expect(context).not.toBeChecked();
  await expect(overlay.locator('[data-report-template-customized]')).toBeHidden();

  await overlay.locator('[data-report-for="categories"] summary').click();
  await overlay.locator('[data-report-action="clear-categories"]').click();
  await expect(overlay.locator('input[data-report-category]:checked')).toHaveCount(0);
  await expect(overlay.locator('[data-report-template-customized]')).toBeVisible();
  await overlay.locator('[data-report-action="select-all-categories"]').click();
  const categories = await overlay.locator('input[data-report-category]').count();
  expect(categories).toBeGreaterThan(0);
  await expect(overlay.locator('input[data-report-category]:checked')).toHaveCount(categories);
  await expect(overlay.locator('[data-report-template-customized]')).toBeHidden();
  await expect(overlay.locator('[data-report-selection-summary]')).toContainText('Summary + detailed records');
  expect(await overlay.locator('.report-builder-modal').evaluate(node => node.getBoundingClientRect().width <= innerWidth)).toBe(true);

  const waiting = page.waitForEvent('popup');
  await keyboardActivate(page, overlay.locator('[data-report-action="export"]'));
  const preview = await waiting;
  try {
    await expect(preview.locator('.report-print-btn')).toBeVisible();
    await expect(preview.locator('body')).toContainText('Review stored facts and literal <questions>.');
    await expect(preview.locator('#report-appendix')).toContainText('Preserved <timeline> note');
    await expect(preview.locator('.report-ai-summary')).toHaveCount(0);
    await expect(preview.locator('body img[onerror],body script[src^="http"]')).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
    await preview.emulateMedia({media: 'print'});
    await expect(preview.locator('.report-print-btn')).toBeHidden();
    if (preview.context().browser()?.browserType().name() === 'chromium') {
      const pdf = await preview.pdf({format: 'A4', printBackground: true});
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
      const file = test.info().outputPath(`report-print-${phase}.pdf`);
      await fs.writeFile(file, pdf);
      await test.info().attach(`report-print-${phase}`, {path: file, contentType: 'application/pdf'});
    }
  } finally { await preview.close(); }
  await expect(page.locator('#sidebar-nav')).not.toHaveClass(/\bmobile-open\b/);
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).overflow)).not.toBe('hidden');
}

async function inspectTour(page: Page) {
  await page.locator('[data-shell-action="open-settings"]').click();
  await page.getByRole('tab', {name: 'Display', exact: true}).click();
  await page.locator('[data-settings-action="start-guided-tour"]').click();
  const tooltip = page.locator('#tour-tooltip');
  await expect(tooltip.locator('[data-tour-view]')).toBeVisible();
  await expect(tooltip).toHaveAttribute('role', 'dialog');
  await expect(tooltip.locator('#tour-tooltip-heading')).toHaveText('Welcome to getbased');
  const dots = await tooltip.locator('.tour-dot').count();
  expect(dots).toBeGreaterThan(1);
  await keyboardActivate(page, tooltip.getByRole('button', {name: 'Next', exact: true}));
  await expect(tooltip.locator('#tour-tooltip-heading')).not.toHaveText('Welcome to getbased');
  await expect(tooltip.locator('.tour-dot.active')).toHaveCount(1);
  expect(await tooltip.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  })).toBe(true);
  await keyboardActivate(page, tooltip.getByRole('button', {name: 'Back', exact: true}));
  await expect(tooltip.locator('#tour-tooltip-heading')).toHaveText('Welcome to getbased');
  await expect(page.locator('#tour-spotlight')).toBeHidden();
  await keyboardActivate(page, tooltip.getByRole('button', {name: 'Skip', exact: true}));
  await expect(page.locator('#tour-tooltip,#tour-overlay,#tour-spotlight')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('labcharts-default-tour'))).toBe('completed');
}

test('static report setup, local preview and guided tour work on first offline use and closed-client launches without changing saved records', async ({page, context}) => {
  test.setTimeout(180000);
  // A fresh OpenRouter selection without credentials represents no configured provider.
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (localStorage.getItem('report-tour-seeded')) return;
    localStorage.setItem('report-tour-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({
      ...defaults, entries: demo.entries, refOverrides: demo.refOverrides,
      profile: {firstName: 'Alex', age: 38},
      notes: [{date: '2026-07-14', text: 'Preserved <timeline> note'}],
      diagnoses: {conditions: [{name: 'Recorded fixture history'}]},
      contextNotes: 'Preserve unrelated context',
      markerNotes: {'thyroid.tsh': 'Preserve unrelated marker note'},
    }));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  const errors: string[] = [], csp: string[] = [], externalRequests: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page);
  context.on('page', observe);
  await context.exposeBinding('reportTourCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {reportTourCsp(value: string): Promise<void>}).reportTourCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {
      externalRequests.push(url.origin + url.pathname);
      await route.abort();
    } else await route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    const before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true;
    await inspectReport(page, 'initial-online');
    await inspectTour(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      await inspectReport(cold, `offline-cold-${launch + 1}`);
      await inspectTour(cold);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      await cold.close();
    }
    expect(errors).toEqual([]);
    expect(csp).toEqual([]);
    expect(externalRequests).toEqual([]);
    await fs.writeFile(test.info().outputPath('report-tour-loading.json'), JSON.stringify(loading, null, 2));
  } finally {
    for (const target of context.pages()) if (!target.isClosed()) await target.close();
    await server.close();
  }
});
