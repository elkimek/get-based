import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData} from '../../js/profile.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

async function navigate(page: Page, route: string) {
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator(`[data-nav-action="navigate"][data-nav-route="${route}"]`).click();
}

async function inspect(page: Page) {
  await navigate(page, 'dashboard');
  const dashboard = page.locator('[data-widget-id="biology-score-biologicalCoherence"]');
  await expect(dashboard.locator('[data-biology-overview-view].db-bio-coherence-hero')).toBeVisible();
  const domains = dashboard.locator('button.bc-micro-domain-action');
  await expect(domains).toHaveCount(12);
  const first = domains.first();
  const scoreId = await first.getAttribute('data-biology-score-id');
  expect(scoreId).toBeTruthy();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`[id="biology-score-${scoreId}"]`)).toBeVisible();
  await expect(page.locator('.biology-score-compact')).toHaveCount(18);

  const overview = page.locator('#biology-score-biologicalCoherence[data-biology-overview-view]');
  await expect(overview.locator('.biology-coherence-domain-row')).toHaveCount(12);
  await expect(overview.locator('.biology-score-ai-teaser-text')).toHaveText('Stored overview insight.');
  const contributors = overview.locator('#biology-score-membership');
  await contributors.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(contributors).toHaveAttribute('open', '');
  await expect(contributors.locator('.biology-membership-count')).toHaveText(/\d+\/13 included/);
  await expect(contributors.locator('.biology-contributor-button')).toHaveCount(13);
  await expect(contributors.locator('.biology-contributor-shared')).toHaveCount(2);
  const contributor = contributors.locator('.biology-contributor-button').first();
  const contributorId = await contributor.getAttribute('data-biology-score-id');
  await contributor.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`[id="biology-score-${contributorId}"]`)).toBeVisible();

  const explanation = overview.locator('.biology-coherence-interpretation');
  await explanation.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(explanation.locator('.chat-h2')).toHaveText('Saved overview');
  await expect(explanation.locator('strong')).toHaveText('Keep all domains');
  await expect(explanation.locator('.biology-ai-provenance')).toContainText('fixture/model');
  await expect(explanation.locator('script,img,[onerror],a[href^="javascript:"]')).toHaveCount(0);
  const breakdown = overview.locator('.biology-coherence-breakdown');
  await breakdown.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(breakdown.locator('.biology-reading-fact')).toHaveCount(4);
  await expect(breakdown.locator('.biology-reading-fact-label')).toHaveText([
    'What is combined', 'What the colors mean', 'Coverage stays separate', 'Dates stay visible',
  ]);
  await expect(breakdown.locator('.lens-widget-dashboard-toggle')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('static Biology overview keyboard navigation and saved explanation survive offline first use and closed-client launches', async ({page, context}) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-ai-paused', 'true');
    if (localStorage.getItem('biology-overview-seeded')) return;
    localStorage.setItem('biology-overview-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-default-imported', JSON.stringify({
      ...defaults, entries: demo.entries, refOverrides: demo.refOverrides,
      profile: {firstName: 'Alex', age: 38}, markerNotes: {'thyroid.tsh': 'Preserve unrelated note'},
      sunDefaults: {fitzpatrick: 'II', completedAt: 1}, contextNotes: 'Preserve unrelated context',
      biologyScoreAI: {biologicalCoherence: {
        text: '## Saved overview\n\n**Keep all domains** and collection context visible.',
        summary: 'Stored overview insight.', updatedAt: 1786104000000,
        materialFingerprint: 'fixture-older-context', generation: {modelId: 'fixture/model'},
      }},
    }));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(await fs.readFile('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('biologyOverviewCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {biologyOverviewCsp(value: string): Promise<void>}).biologyOverviewCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    const before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true;
    await inspect(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    if (test.info().project.name === 'kit-mobile-webkit') await page.screenshot({path: test.info().outputPath('biology-overview-mobile.png')});
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      await inspect(cold);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('biology-overview-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
