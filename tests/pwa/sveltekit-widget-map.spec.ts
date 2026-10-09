import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

async function inspectMapping(page: Page) {
  const review = page.locator('#import-modal-overlay');
  await expect(review).toHaveClass(/\bshow\b/);
  const row = review.locator('tr[data-import-idx="0"]');
  await expect(row).toHaveAttribute('data-import-status', 'new');
  await row.locator('.import-map-picker-btn').click();
  const map = page.locator('[data-import-marker-map-view]');
  await expect(map).toBeVisible();
  await expect(map.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'import-map-modal-title');
  await expect(map.locator('.import-map-context')).toContainText('Synthetic <signal>');
  await expect(map.locator('img,script')).toHaveCount(0);
  const search = map.getByRole('searchbox');
  await expect(search).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await search.fill('no-such-marker-fixture');
  await expect(map.locator('.import-map-empty')).toHaveText('No markers match this search.');
  await search.fill('ferritin');
  const result = map.locator('[data-import-map-key="iron.ferritin"]');
  await expect(result).toBeVisible();
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(map).toHaveCount(0);
  await expect(review).toHaveClass(/\bshow\b/);
  await expect(row).toHaveAttribute('data-import-status', 'matched');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('labcharts-import-review-draft-v1')!).parseResult.markers[0].mappedKey)).toBe('iron.ferritin');
  await row.locator('.import-map-picker-btn').click();
  await search.fill('ferritin');
  await expect(map.locator('[data-import-map-key="iron.ferritin"]')).toHaveClass(/\bselected\b/);
  await map.locator('[data-import-map-action="clear"]').click();
  await expect(map).toHaveCount(0);
  await expect(review).toHaveClass(/\bshow\b/);
  await expect(row).toHaveAttribute('data-import-status', 'new');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('labcharts-import-review-draft-v1')!).parseResult.markers[0].mappedKey)).toBeNull();
  // This opener remains connected on cancellation; selection/clear rebuild its row control.
  const opener = row.locator('.import-map-picker-btn');
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(map).toBeVisible();
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);
  await expect(review).toHaveClass(/\bshow\b/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(opener).toBeFocused();
  await review.getByRole('button', {name: 'Close import review', exact: true}).click();
  await expect(review).not.toHaveClass(/\bshow\b/);
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).overflow)).not.toBe('hidden');
}

async function assertVisibleWidgets(page: Page, ids: readonly string[]) {
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-dashboardWidgetsV13')!) as {order: string[]; hidden: string[]});
  expect(prefs.order).toEqual(expect.arrayContaining([...ids]));
  for (const id of ids) {
    expect(prefs.hidden).not.toContain(id);
    await expect(page.locator(`.dashboard-widget[data-widget-id="${id}"]`)).toBeVisible();
  }
}

async function inspectPickers(page: Page, addWidgets = false): Promise<{biometric: string; widgets: string[]}> {
  const chat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await chat.isVisible()) await chat.click();
  const add = page.locator('[data-dashboard-widget-action="open-picker"]').first();
  await add.click();
  const picker = page.locator('#dashboard-widget-picker-overlay:has([data-dashboard-picker-view])');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dashboard-widget-picker-title');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const markerSearch = picker.locator('#dashboard-marker-widget-search');
  await markerSearch.fill('no-such-marker-fixture');
  await expect(picker.locator('.dashboard-marker-widget-option:visible')).toHaveCount(0);
  await expect(picker.locator('#dashboard-marker-widget-empty')).toBeVisible();
  await markerSearch.fill('');
  // Choose from currently available cards; the initially added marker is absent on cold launches.
  const markerCard = picker.locator('[data-dashboard-widget-action="add-marker-widget"]').first();
  await expect(markerCard).toBeVisible();
  const markerQuery = await markerCard.locator('.dashboard-widget-picker-title').textContent();
  expect(markerQuery).toBeTruthy();
  await markerSearch.fill(markerQuery!);
  await expect(picker.locator('.dashboard-marker-widget-option:visible')).not.toHaveCount(0);
  const widgets: string[] = [];
  if (addWidgets) {
    const markerId = await markerCard.getAttribute('data-dashboard-widget-id');
    expect(markerId).toBeTruthy();
    await markerCard.focus();
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    widgets.push(`marker_${markerId!}`);
    await assertVisibleWidgets(page, widgets);

    // Notes is hidden by the default layout and has the preserved fixture note to render.
    await expect(page.locator('.dashboard-widget[data-widget-id="notes"]')).toHaveCount(0);
    await add.click();
    await expect(picker).toBeVisible();
    const fixedCard = picker.locator('[data-dashboard-widget-action="show-widget"][data-dashboard-widget-id="notes"]');
    await expect(fixedCard).toBeVisible();
    const fixedId = await fixedCard.getAttribute('data-dashboard-widget-id');
    expect(fixedId).toBeTruthy();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-dashboardWidgetsV13')!) as {hidden: string[]});
    expect(before.hidden).toContain(fixedId);
    await fixedCard.focus();
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    widgets.push(fixedId!);
    await assertVisibleWidgets(page, widgets);
    await expect(page.locator('.dashboard-widget[data-widget-id="notes"]')).toContainText('Keep unrelated note');
  } else {
    await picker.getByRole('button', {name: 'Close', exact: true}).click();
    await expect(picker).toHaveCount(0);
  }
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).overflow)).not.toBe('hidden');
  // Public Biometrics Overview control opens the independently scrollable picker.
  await page.locator('[data-dashboard-widget-action="open-biometric-picker"]').first().click();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dashboard-biometric-picker-title');
  const search = picker.locator('#dashboard-biometric-widget-search');
  await expect(search).toBeFocused();
  await search.fill('no-such-biometric-fixture');
  await expect(picker.locator('.dashboard-biometric-widget-option:visible')).toHaveCount(0);
  await expect(picker.locator('#dashboard-biometric-widget-empty')).toBeVisible();
  await search.fill('');
  const card = picker.locator('[data-dashboard-widget-action="add-biometric-metric"]').first();
  await expect(card).toBeVisible();
  const id = await card.getAttribute('data-dashboard-widget-id');
  expect(id).toBeTruthy();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-dashboardBiometricMetricsV1')!))).toContain(id);
  return {biometric: id!, widgets};
}

test('static widget pickers and nested mapping work offline and preserve health records through closed-client launches', async ({page, context}) => {
  test.setTimeout(180000);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    // Session draft restoration is the real public startup entry to import review.
    sessionStorage.setItem('labcharts-import-review-draft-v1', JSON.stringify({profileId: 'default', savedAt: Date.now(), parseResult: {
      date: '2026-07-14', fileName: 'Synthetic mapping review.pdf', markers: [{rawName: 'Synthetic <signal>', value: 12, unit: 'ng/ml', matched: false, mappedKey: null, suggestedKey: 'customLabs.syntheticSignal', suggestedName: 'Synthetic signal', refMin: 1, refMax: 20}],
    }}));
    if (localStorage.getItem('widget-map-seeded')) return;
    localStorage.setItem('widget-map-seeded', '1');
    // Start with none selected so all three manual metrics can be added across launches.
    localStorage.setItem('labcharts-default-dashboardBiometricMetricsV1', '[]');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, entries: demo.entries, refOverrides: demo.refOverrides, profile: {firstName: 'Alex', age: 38}, contextNotes: 'Keep unrelated context', notes: [{date: '2026-07-14', text: 'Keep unrelated note'}]}));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('widgetMapCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {widgetMapCsp(value: string): Promise<void>}).widgetMapCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== server.origin) {external.push(url.origin + url.pathname); await route.abort();}
    else await route.continue();
  });
  try {
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    const before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true;
    await inspectMapping(page);
    const initial = await inspectPickers(page, true);
    const added = [initial.biometric];
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      expect(await cold.evaluate(() => JSON.parse(localStorage.getItem('labcharts-default-dashboardBiometricMetricsV1')!))).toEqual(expect.arrayContaining(added));
      await inspectMapping(cold);
      await assertVisibleWidgets(cold, initial.widgets);
      await expect(cold.locator('.dashboard-widget[data-widget-id="notes"]')).toContainText('Keep unrelated note');
      added.push((await inspectPickers(cold)).biometric);
      await assertVisibleWidgets(cold, initial.widgets);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('widget-map-loading.json'), JSON.stringify(loading, null, 2));
  } finally {
    for (const target of context.pages()) if (!target.isClosed()) await target.close();
    await server.close();
  }
});
