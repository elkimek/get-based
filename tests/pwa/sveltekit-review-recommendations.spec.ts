import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

interface DraftMarker {
  value: number; unit: string; refMin?: number; refMax?: number; mappedKey?: string | null;
}
interface ReviewDraft {
  parseResult: {date: string; sampleTime: string | null; fasting: boolean | null; markers: DraftMarker[]; _excludedImportIndices: number[]};
}
async function readDraft(page: Page): Promise<ReviewDraft> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('labcharts-import-review-draft-v1')!));
}
async function readPreferences(page: Page) {
  return page.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem('labcharts-default-recommendations-saved-v1') || '[]') as string[],
    dismissed: JSON.parse(localStorage.getItem('labcharts-default-recommendations-dismissed-v1') || '[]') as string[],
  }));
}

async function inspectReview(page: Page) {
  const overlay = page.locator('#import-modal-overlay');
  const review = overlay.locator('#import-modal[data-import-review-view]');
  await expect(overlay).toHaveClass(/\bshow\b/);
  await expect(review).toBeVisible();
  await expect(review.locator('.gb-modal-title')).toHaveText('Review & Edit Import');
  await expect(review.locator('.import-review-file-name')).toHaveText('Synthetic <review>.pdf');
  await expect(review.locator('img,script,[onclick]')).toHaveCount(0);
  await expect(review.locator('.import-count-matched')).toHaveText('1');
  await expect(review.locator('.import-count-new')).toHaveText('1');
  await expect(review.locator('.import-count-unmatched')).toHaveText('11');
  await expect(review.locator('.import-review-warning').first()).toContainText("A large portion of markers couldn't be mapped.");
  await expect(review.locator('.import-review-date-warning')).toBeVisible();
  await expect(review.locator('.privacy-notice')).toContainText('2 personal details replaced with fake data');
  await expect(review.locator('#import-adopt-ranges')).toBeChecked();
  await expect(review.locator('#import-visible-count')).toHaveText('13/13 shown');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  const matched = review.locator('tr[data-import-idx="0"]');
  const custom = review.locator('tr[data-import-idx="1"]');
  await expect(matched).toHaveAttribute('data-import-status', 'matched');
  await expect(matched).toContainText('Glucose <fasting>');
  await expect(custom).toHaveAttribute('data-import-status', 'new');
  // The startup draft restores excluded state through the real controller.
  await expect(custom).toHaveClass(/\bimport-excluded\b/);
  await expect(custom.locator('.import-exclude-btn')).toHaveClass(/\bis-restore\b/);
  await expect(custom.locator('.import-exclude-btn')).toHaveAccessibleName('Include in import');
  expect((await readDraft(page)).parseResult._excludedImportIndices).toEqual([1]);
  const confirm = review.locator('#import-confirm-btn');
  await expect(confirm).toHaveText('Import 1 Marker');
  await expect(confirm).toBeDisabled();

  // Use the date control's maintained label across browser role implementations.
  const dateInput = review.getByLabel('Collection date', {exact: true});
  await dateInput.fill('2026-07-15');
  await dateInput.press(nativeTabKey(page));
  await expect(confirm).toBeEnabled();
  await dateInput.fill('');
  await dateInput.press(nativeTabKey(page));
  await expect(confirm).toBeDisabled();
  await dateInput.fill('2026-07-15');
  await dateInput.press(nativeTabKey(page));
  await expect(confirm).toBeEnabled();
  const time = review.getByLabel('Blood collection time', {exact: true});
  await expect(time).toHaveValue('08:15');
  await time.fill('09:35');
  await time.press(nativeTabKey(page));
  const fasting = review.getByLabel('Fasting status', {exact: true});
  await expect(fasting).toHaveValue('unknown');
  await fasting.selectOption('fasting');
  expect((await readDraft(page)).parseResult.fasting).toBe(true);
  await fasting.selectOption('unknown');
  expect((await readDraft(page)).parseResult.fasting).toBeNull();
  await fasting.selectOption('not-fasting');
  expect((await readDraft(page)).parseResult).toMatchObject({date: '2026-07-15', sampleTime: '09:35', fasting: false});

  const search = review.getByRole('searchbox', {name: 'Search import rows', exact: true});
  const filter = (key: string) => review.locator(`.import-filter-btn[data-filter="${key}"]`);
  await filter('unmatched').click();
  await expect(review.locator('#import-visible-count')).toHaveText('11/13 shown');
  await search.fill('  MYSTERY marker 7  ');
  await expect(review.locator('#import-visible-count')).toHaveText('1/13 shown');
  await expect(review.locator('tr[data-import-idx]:visible')).toContainText('Mystery marker 7');
  await filter('matched').click();
  await expect(review.locator('#import-visible-count')).toHaveText('0/13 shown');
  await search.fill('no-such-review-marker-fixture');
  await filter('all').click();
  await expect(review.locator('tr[data-import-idx]:visible')).toHaveCount(0);
  await search.fill('');
  await filter('excluded').click();
  await expect(review.locator('#import-visible-count')).toHaveText('1/13 shown');
  await expect(custom).toBeVisible();
  await custom.locator('.import-exclude-btn').click();
  await expect(custom).not.toHaveClass(/\bimport-excluded\b/);
  await expect(custom.locator('.import-exclude-btn')).toHaveAttribute('aria-label', 'Exclude from import');
  await expect(review.locator('#import-visible-count')).toHaveText('0/13 shown');
  await expect(confirm).toHaveText('Import 2 Markers');
  expect((await readDraft(page)).parseResult._excludedImportIndices).toEqual([]);
  await filter('matched').click();
  await matched.locator('.import-exclude-btn').click();
  await expect(matched).toHaveClass(/\bimport-excluded\b/);
  await expect(review.locator('#import-visible-count')).toHaveText('0/13 shown');
  await expect(confirm).toHaveText('Import 1 Marker');
  expect((await readDraft(page)).parseResult._excludedImportIndices).toEqual([0]);
  await filter('excluded').click();
  await matched.locator('.import-exclude-btn').click();
  await expect(matched).not.toHaveClass(/\bimport-excluded\b/);
  await expect(confirm).toHaveText('Import 2 Markers');
  expect((await readDraft(page)).parseResult._excludedImportIndices).toEqual([]);

  await filter('new').click();
  await expect(custom.locator('.import-exclude-btn')).toHaveAccessibleName('Exclude from import');
  const customUnit = custom.locator('.import-unit-picker-btn');
  await customUnit.click();
  const menu = page.locator('.import-unit-menu[data-import-review-view]');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'listbox');
  await expect(menu).toHaveAttribute('aria-label', 'Unit for Synthetic <signal>');
  await expect(menu.locator('[data-import-unit-option="mg/l"]')).toHaveAttribute('aria-selected', 'true');
  await menu.locator('[data-import-unit-option="g/l"]').click();
  await expect(menu).toHaveCount(0);
  await expect(custom.locator('.import-unit-text')).toHaveValue('g/l');
  await expect(custom.locator('.import-value-input')).toHaveValue('1');
  await expect(custom.locator('.import-range-cell')).toHaveText('0.5–1.5');
  expect((await readDraft(page)).parseResult.markers[1]).toMatchObject({unit: 'g/l', value: 1, refMin: 0.5, refMax: 1.5});

  await filter('matched').click();
  const schemaUnit = matched.locator('.import-unit-button');
  await schemaUnit.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-import-unit-option="mg/dl"]')).toBeEnabled();
  await expect(schemaUnit).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(schemaUnit).toHaveAttribute('aria-expanded', 'false');
  await expect(schemaUnit).toBeFocused();
  await expect(overlay).toHaveClass(/\bshow\b/);
  expect((await readDraft(page)).parseResult.markers[0]).toMatchObject({unit: 'mmol/l', value: 5.8});

  await filter('new').click();
  const opener = custom.locator('.import-map-picker-btn');
  const beforeCancel = await readDraft(page);
  await opener.focus();
  await page.keyboard.press('Enter');
  const mapping = page.locator('[data-import-marker-map-view]');
  await expect(mapping).toBeVisible();
  const mapSearch = mapping.getByRole('searchbox');
  await expect(mapSearch).toBeFocused();
  await expect(mapping.locator('.import-map-context')).toContainText('Synthetic <signal>');
  await mapSearch.fill('no-such-review-map-fixture');
  await expect(mapping.locator('.import-map-empty')).toHaveText('No markers match this search.');
  await mapSearch.fill('ferritin');
  await expect(mapping.locator('[data-import-map-key="iron.ferritin"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mapping).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(overlay).toHaveClass(/\bshow\b/);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  expect(await readDraft(page)).toEqual(beforeCancel);
  await filter('all').click();
  await expect(review.locator('#import-visible-count')).toHaveText('13/13 shown');
  await review.getByRole('button', {name: 'Close import review', exact: true}).click();
  await expect(overlay).not.toHaveClass(/\bshow\b/);
  expect(await page.evaluate(() => sessionStorage.getItem('labcharts-import-review-draft-v1'))).toBeNull();
  expect(await page.locator('body').evaluate(node => getComputedStyle(node).overflow)).not.toBe('hidden');
}

async function openRecommendations(page: Page) {
  const chat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await chat.isVisible()) await chat.click();
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="recommendations"]').click();
  await expect(page.locator('#recommendations-page .lens-page-header h2')).toHaveText('Tips');
  await expect(page.locator('#recommendations-page article[data-recommendation-cards-view]').first()).toBeVisible();
}
async function inspectRecommendations(page: Page, existingId?: string): Promise<string> {
  await openRecommendations(page);
  const tips = page.locator('#recommendations-page');
  const bookmarks = tips.locator('section[data-widget-id="recommendations-bookmarks"]');
  const hidden = tips.locator('section[data-widget-id="recommendations-dismissed"]');
  const id = existingId || await tips.locator('section[data-widget-id="recommendations-top"] article[data-rec-id]').first().getAttribute('data-rec-id');
  expect(id).toBeTruthy();
  const card = (section: typeof tips) => section.locator(`article[data-rec-id="${id!}"][data-recommendation-cards-view]`);
  const active = tips.locator('.lens-page-widgets > section:not([data-widget-id="recommendations-bookmarks"]):not([data-widget-id="recommendations-dismissed"])');
  if (existingId) {
    expect(await readPreferences(page)).toEqual({saved: [id], dismissed: [id]});
    await expect(card(bookmarks)).toBeVisible();
    await expect(card(bookmarks).getByRole('button', {name: 'Bookmarked', exact: true})).toHaveAttribute('data-dashboard-rec-on', 'false');
    await expect(card(hidden).getByRole('button', {name: 'Show', exact: true})).toBeVisible();
    await expect(card(active)).toHaveCount(0);
    // The first action in a cold document awaits the real lazy action owner;
    // require its exact durable result before asserting the refreshed cards.
    await card(hidden).getByRole('button', {name: 'Show', exact: true}).click();
    await expect.poll(()=>readPreferences(page)).toEqual({saved: [id], dismissed: []});
    await expect(hidden).toHaveCount(0);
    await expect(card(active)).toBeVisible();
    await expect(card(bookmarks)).toBeVisible();
    await card(bookmarks).getByRole('button', {name: 'Bookmarked', exact: true}).click();
    await expect.poll(()=>readPreferences(page)).toEqual({saved: [], dismissed: []});
    await expect(bookmarks).toHaveCount(0);
  } else {
    expect(await readPreferences(page)).toEqual({saved: [], dismissed: []});
  }
  const bookmark = card(active).getByRole('button', {name: 'Bookmark', exact: true});
  await bookmark.focus();
  await page.keyboard.press('Enter');
  await expect.poll(()=>readPreferences(page)).toEqual({saved: [id], dismissed: []});
  await expect(card(bookmarks)).toBeVisible();
  await expect(card(active).getByRole('button', {name: 'Bookmarked', exact: true})).toBeVisible();
  const hide = card(active).getByRole('button', {name: 'Hide', exact: true});
  await hide.focus();
  await page.keyboard.press('Space');
  await expect.poll(()=>readPreferences(page)).toEqual({saved: [id], dismissed: [id]});
  await expect(card(active)).toHaveCount(0);
  await expect(card(hidden)).toBeVisible();
  await expect(card(bookmarks)).toBeVisible();
  await expect(card(hidden).getByRole('button', {name: 'Show', exact: true})).toHaveAttribute('data-dashboard-rec-on', 'false');
  await expect(card(hidden).locator('img,script,[onclick]')).toHaveCount(0);
  return id!;
}

test('static authored import review and recommendation delegates work offline and preserve records across two closed-client launches', async ({page, context}) => {
  test.setTimeout(180000);
  await installDiscussionFixture(context, {provider: 'openrouter', paused: true});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    // Every new client enters through actual startup draft restoration, without importing runtime modules.
    sessionStorage.setItem('labcharts-import-review-draft-v1', JSON.stringify({profileId: 'default', savedAt: Date.now(), parseResult: {
      date: '', sampleTime: '08:15:00', fasting: null, fileName: 'Synthetic <review>.pdf', privacyMethod: 'regex', privacyReplacements: 2,
      _excludedImportIndices: [1], markers: [
        {rawName: 'Glucose <fasting>', value: 5.8, unit: 'mmol/l', matched: true, mappedKey: 'biochemistry.glucose', refMin: 3.9, refMax: 5.5},
        {rawName: 'Synthetic <signal>', value: 1000, unit: 'mg/l', matched: false, mappedKey: null, suggestedKey: 'customLabs.syntheticSignal', suggestedName: 'Synthetic signal', refMin: 500, refMax: 1500},
        ...Array.from({length: 11}, (_, index) => ({rawName: `Mystery marker ${index + 1}`, value: index + 1, unit: 'U/l', matched: false, mappedKey: null})),
      ],
    }}));
    if (localStorage.getItem('review-recommendations-seeded')) return;
    localStorage.setItem('review-recommendations-seeded', '1');
    localStorage.setItem('labcharts-show-product-recs', 'true');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, entries: demo.entries, refOverrides: demo.refOverrides, profile: {firstName: 'Alex', age: 38}, contextNotes: 'Keep unrelated review context', markerNotes: {'thyroid.tsh': 'Keep unrelated marker note'}, notes: [{date: '2026-07-14', text: 'Keep unrelated review note'}]}));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('reviewRecommendationsCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {reviewRecommendationsCsp(value: string): Promise<void>}).reviewRecommendationsCsp(event.violatedDirective);
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
    await server.close();
    await inspectReview(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    const id = await inspectRecommendations(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.close();
    expect(context.pages()).toHaveLength(0);
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      expect(await readPreferences(cold)).toEqual({saved: [id], dismissed: [id]});
      await inspectReview(cold);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      expect(await inspectRecommendations(cold, id)).toBe(id);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      await cold.close();
      expect(context.pages()).toHaveLength(0);
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
    await fs.writeFile(test.info().outputPath('review-recommendations-loading.json'), JSON.stringify({loading, recommendationId: id, completedReviewWorkflows: 3, originStopped: true}, null, 2));
  } finally {
    for (const target of context.pages()) if (!target.isClosed()) await target.close();
    await server.close();
  }
});
