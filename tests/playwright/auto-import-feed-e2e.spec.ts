import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { startAutoImportSourceFixture } from '../helpers/auto-import-source-fixture.js';
import { sandboxLauncherHtml } from '../../scripts/auto-import-sandbox.mjs';

async function openSandbox(page: Page, source: string) {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-theme', 'light');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-analytics-disabled', 'true');
  });
  const appOrigin = new URL(test.info().project.use.baseURL!).origin;
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return [appOrigin, source].includes(origin) ? route.continue() : route.abort();
  });
  await page.goto('/app');
  await page.evaluate(async origin => {
    const api = await import('/js/api-provider-storage.js');
    await api.saveCustomApiConnection(origin + '/v1', 'synthetic-fixture-only');
    api.setCustomApiModel('synthetic-lab-fixture');
    api.setAIProvider('custom');
    await (await import('/js/settings-loader.js')).openSettingsModal('data');
  }, source);
  await page.locator('#auto-import-feed-section').scrollIntoViewIfNeeded();
}

async function configureSource(page: Page, url: string) {
  const section = page.locator('#auto-import-feed-section');
  await section.getByLabel('Report feed address').fill(url);
  await section.getByRole('button', { name: /Save source|Save changes/ }).click();
}
async function checkSource(page: Page) {
  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('data'); });
  const section = page.locator('#auto-import-feed-section');
  await section.scrollIntoViewIfNeeded();
  await section.getByRole('button', { name: 'Check for reports', exact: true }).click();
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const config = (await import('/js/auto-import-feed.js')).readAutoImportFeedConfig(state.currentProfile);
    return { done: config.doneIds, failed: config.failedIds, entries: state.importedData.entries || [],
      snapshots: state.importedData.importSnapshots || [] };
  });
}
async function reviewReport(page: Page) {
  await page.getByRole('button', { name: 'Review now', exact: true }).click();
  // Exercise the real privacy review as well as the real PDF parser. Never
  // disable privacy protection to make a synthetic document import pass.
  await page.getByRole('button', { name: 'Send to AI', exact: true }).click();
  await expect(page.locator('#import-confirm-btn')).toHaveText('Import 2 Markers');
}

test('real feed and PDF: Later, privacy review, explicit save, reload, and no re-import', async ({ page }) => {
  test.setTimeout(60_000);
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
  try {
    await openSandbox(page, source.origin);
    await configureSource(page, source.origin + '/feed.json');
    await checkSource(page);
    await page.getByRole('button', { name: 'Later', exact: true }).click();
    expect(source.requests.pdfs).toBe(0);
    expect((await snapshot(page)).done).toEqual([]);
    expect((await snapshot(page)).entries).toEqual([]);
    await checkSource(page);
    await reviewReport(page);
    expect((await snapshot(page)).entries).toEqual([]);
    expect((await snapshot(page)).done).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('synthetic-import-review.png') });
    await page.locator('#import-confirm-btn').click();
    await expect.poll(async () => (await snapshot(page)).done).toEqual(['january']);
    const saved = await snapshot(page);
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0]).toMatchObject({ date: '2026-01-12', markers: { 'biochemistry.glucose': 5.2, 'iron.ferritin': 65 } });
    expect(saved.snapshots).toHaveLength(1);
    expect(source.requests.extraction).toBe(1);
    await page.reload();
    await expect.poll(async () => (await snapshot(page)).entries).toEqual(saved.entries);
    await checkSource(page);
    await expect(page.locator('#auto-import-feed-section [role="status"]')).toContainText('No new reports');
    expect(source.requests.pdfs).toBe(1);
    expect(source.requests.extraction).toBe(1);
  } finally { await source.close(); }
});

test('failed download is retried; explicit Skip handles the report without saving health data', async ({ page }) => {
  test.setTimeout(60_000);
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
  try {
    await openSandbox(page, source.origin);
    await configureSource(page, source.origin + '/feed.json?scenario=retry');
    await checkSource(page);
    await page.getByRole('button', { name: 'Review now', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).failed).toEqual(['retry']);
    expect((await snapshot(page)).done).toEqual([]);
    expect(source.requests.ai).toBe(0);
    await checkSource(page);
    await reviewReport(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).done).toEqual(['retry']);
    expect((await snapshot(page)).entries).toEqual([]);
    expect(source.requests.pdfs).toBe(2);
    await checkSource(page);
    await expect(page.locator('#auto-import-feed-section [role="status"]')).toContainText('No new reports');
    expect(source.requests.pdfs).toBe(2);
  } finally { await source.close(); }
});

test('invalid PDF stays retryable and never reaches AI or saved data', async ({ page }) => {
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
  try {
    await openSandbox(page, source.origin);
    await configureSource(page, source.origin + '/feed.json?scenario=invalid');
    for (let attempt = 1; attempt <= 2; attempt++) {
      await checkSource(page);
      await page.getByRole('button', { name: 'Review now', exact: true }).click();
      await expect.poll(async () => (await snapshot(page)).failed).toEqual(['invalid']);
      expect((await snapshot(page)).done).toEqual([]);
      expect((await snapshot(page)).entries).toEqual([]);
      expect(source.requests.pdfs).toBe(attempt);
      expect(source.requests.ai).toBe(0);
    }
  } finally { await source.close(); }
});

test('two-report batch tracks Skip and Save separately and retains the correct report date', async ({ page }) => {
  test.setTimeout(60_000);
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
  try {
    await openSandbox(page, source.origin);
    await configureSource(page, source.origin + '/feed.json?scenario=two');
    await checkSource(page);
    await reviewReport(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Send to AI', exact: true }).click();
    await expect(page.locator('#import-confirm-btn')).toHaveText('Import 2 Markers');
    await expect(page.getByLabel('Collection date', { exact: true })).toHaveValue('2026-02-12');
    expect((await snapshot(page)).entries).toEqual([]);
    expect((await snapshot(page)).done).toEqual(['january']);
    await page.locator('#import-confirm-btn').click();
    await expect.poll(async () => (await snapshot(page)).done).toEqual(['january', 'february']);
    const saved = await snapshot(page);
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0]).toMatchObject({ date: '2026-02-12', markers: { 'biochemistry.glucose': 5.2, 'iron.ferritin': 65 } });
    expect(source.requests.pdfs).toBe(2);
    expect(source.requests.extraction).toBe(2);
  } finally { await source.close(); }
});


test('manual sandbox launcher configures protected credentials and offers a report on cold startup', async ({ page }) => {
  const appOrigin = new URL(test.info().project.use.baseURL!).origin;
  const source = await startAutoImportSourceFixture({ allowedOrigins: [appOrigin] });
  try {
    await page.route('**/*', route => [appOrigin, source.origin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    await page.route('**/__synthetic-sandbox', route => route.fulfill({ contentType: 'text/html', body: sandboxLauncherHtml(appOrigin, source.origin) }));
    await page.goto('/__synthetic-sandbox');
    // Clear only the consent fixtures in this disposable launcher document,
    // after all init scripts have run. The returning-user fixtures will run
    // again on /app, without relying on their script registration order.
    await page.evaluate(() => {
      for (const key of ['labcharts-legal-acceptance', 'labcharts-ai-transparency-acknowledgement', 'labcharts-ai-route-confirmations']) localStorage.removeItem(key);
    });
    await page.getByRole('button', { name: 'Prepare sandbox and open getbased' }).click();
    await page.waitForURL('**/app?dev=synthetic-feed-sandbox');
    await page.locator('html[data-app-ready]').waitFor();
    const settings = await page.evaluate(async () => {
      const api = await import('/js/api-provider-storage.js');
      return { provider: api.getAIProvider(), endpoint: api.getCustomApiUrl(), hasKey: api.hasCustomApiKey(),
        rawCredential: localStorage.getItem('labcharts-custom-key') };
    });
    expect(settings).toMatchObject({ provider: 'custom', endpoint: source.origin + '/v1', hasKey: true });
    expect(settings.rawCredential).toBeTruthy();
    expect(settings.rawCredential).not.toContain('synthetic-fixture-only');
    await reviewReport(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).done).toEqual(['january']);
    expect((await snapshot(page)).entries).toEqual([]);
  } finally { await source.close(); }
});


test('a profile switch during AI analysis stops the original source batch without saving or handling it', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin], beforeExtraction: () => gate });
  try {
    await openSandbox(page, source.origin);
    const other = await page.evaluate(async () => (await import('/js/profile.js')).createProfile('Other synthetic profile'));
    await configureSource(page, source.origin + '/feed.json?scenario=two');
    await checkSource(page);
    await page.getByRole('button', { name: 'Review now', exact: true }).click();
    await page.getByRole('button', { name: 'Send to AI', exact: true }).click();
    await expect.poll(() => source.requests.extraction).toBe(1);
    await page.evaluate(async id => { await (await import('/js/profile.js')).switchProfile(id); }, other);
    release();
    await expect.poll(() => page.evaluate(async () => (await import('/js/pdf-import-progress.js')).importDispatch.busy)).toBe(false);
    await expect(page.locator('#import-confirm-btn')).not.toBeVisible();
    expect(source.requests.extraction).toBe(1);
    expect((await snapshot(page)).entries).toEqual([]);
    await page.evaluate(async () => { await (await import('/js/profile.js')).switchProfile('default'); });
    expect((await snapshot(page)).entries).toEqual([]);
    expect((await snapshot(page)).done).toEqual([]);
    expect((await snapshot(page)).failed).toEqual([]);
  } finally { release(); await source.close(); }
});


test('a profile switch closes an open batch review and leaves the remaining files pending', async ({ page }) => {
  const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
  try {
    await openSandbox(page, source.origin);
    const other = await page.evaluate(async () => (await import('/js/profile.js')).createProfile('Other synthetic profile'));
    await configureSource(page, source.origin + '/feed.json?scenario=two');
    await checkSource(page);
    await reviewReport(page);
    await page.evaluate(async id => { await (await import('/js/profile.js')).switchProfile(id); }, other);
    await expect.poll(() => page.evaluate(async () => (await import('/js/pdf-import-progress.js')).importDispatch.busy)).toBe(false);
    await expect(page.locator('#import-confirm-btn')).not.toBeVisible();
    expect(source.requests.extraction).toBe(1);
    expect((await snapshot(page)).entries).toEqual([]);
    await page.evaluate(async () => { await (await import('/js/profile.js')).switchProfile('default'); });
    expect((await snapshot(page)).done).toEqual([]);
    expect((await snapshot(page)).failed).toEqual([]);
    expect((await snapshot(page)).entries).toEqual([]);
  } finally { await source.close(); }
});

for (const first of ['history', 'feed'] as const) {
  test(`overlapping ${first}-first confirmations settle and later feed checks remain usable`, async ({ page }) => {
    const source = await startAutoImportSourceFixture({ allowedOrigins: [new URL(test.info().project.use.baseURL!).origin] });
    try {
      await openSandbox(page, source.origin);
      await configureSource(page, source.origin + '/feed.json');
      await page.evaluate(async () => {
        const feed = await import('/js/auto-import-feed.js');
        feed.markAutoImportItemsDone('default', ['previous-report']);
      });
      await page.evaluate(async order => {
        const runtime = await import('/js/auto-import-feed-runtime.js');
        const settings = await import('/js/settings-data.js');
        void runtime.checkAutoImportFeed();
        if (order === 'history') void settings.clearAutoImportHistoryFromSettings();
      }, first);
      if (first === 'history') {
        await expect.poll(() => page.evaluate(async () => (await import('/js/auto-import-feed.js')).readAutoImportFeedConfig('default').lastStatus)).toBe('1 new report(s) found');
        await expect(page.getByRole('button', { name: 'Reset report history', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Reset report history', exact: true }).click();
        await page.getByRole('button', { name: 'Later', exact: true }).click();
      } else {
        await expect(page.getByRole('button', { name: 'Review now', exact: true })).toBeVisible();
        await page.evaluate(async () => { void (await import('/js/settings-data.js')).clearAutoImportHistoryFromSettings(); });
        await expect(page.getByRole('button', { name: 'Review now', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Later', exact: true }).click();
        await page.getByRole('button', { name: 'Reset report history', exact: true }).click();
      }
      await checkSource(page);
      await page.getByRole('button', { name: 'Later', exact: true }).click();
      expect(source.requests.feeds).toBe(2);
      expect(source.requests.pdfs).toBe(0);
      expect((await snapshot(page)).entries).toEqual([]);
      expect((await snapshot(page)).done).toEqual([]);
    } finally { await source.close(); }
  });
}
