import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { state } from '../../js/state.js';
import { getDayFingerprint } from '../../js/light-today-ai.js';
import { getChannelMixFingerprint } from '../../js/light-channels-ai-analysis.js';
import { getBurdenFingerprint } from '../../js/light-burden-ai-analysis.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';

// Use the actual services to prepare valid caches; no provider or renderer mocks
// enter the assembled artifact. Restore Node-side state after fixture preparation.
function cachedProfile(now: Date) {
  const data = createDefaultProfileData();
  data.contextNotes = 'Keep unrelated review context';
  data.sunDefaults = { fitzpatrick: 'II', completedAt: 1 };
  data.sunSessions = [{
    id: 'review-sun', startedAt: +now - 3600000, endedAt: +now - 2700000, durationMin: 15,
    bodyExposure: { preset: 'shorts_top_off', fraction: 0.45 }, eyeExposure: { mode: 'direct' },
    doses: { vitamin_d: 100, circadian: 2000 }, safety: { medFraction: 0.1, fitzpatrick: 'II' },
    calculationStatus: 'computed',
  }];
  data.lightEnvironment = { rooms: [{
    id: 'review-room', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8,
    daylightLevel: 'moderate', eveningHoursAfterSunset: 2,
  }], screens: [] };
  data.lightMeasurements = [];
  const previous = state.importedData;
  state.importedData = data;
  try {
    const verdict = (name: string, fingerprint: string) => ({
      status: 'ok' as const, dot: 'yellow', tip: `${name} <literal>`, detail: `${name} detail & retained.`, fingerprint,
    });
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    data.lightDailyVerdicts = { [key]: verdict('Today', getDayFingerprint({ date: now })) };
    data.channelMixAI = verdict('Weekly', getChannelMixFingerprint());
    data.lightEnvironment.burdenAI = verdict('Indoor', getBurdenFingerprint());
    return data;
  } finally { state.importedData = previous; }
}
function seed(data: ProfileData) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  if (localStorage.getItem('review-ai-seeded')) return;
  localStorage.setItem('review-ai-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1 }]));
  localStorage.setItem('labcharts-active-profile', 'default');
  for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  localStorage.setItem('labcharts-default-imported', JSON.stringify(data));
}
async function inspect(page: Page) {
  await openLight(page);
  const hero = page.locator('.light-page .light-today-hero[data-light-review-ai]');
  await expect(hero).toHaveAttribute('data-ai-state', 'ok');
  await expect(hero.locator('.sun-detail-ai-tip')).toHaveText('⚠ Today <literal>');
  await expect(hero.locator('.sun-detail-ai-body')).toHaveText('Today detail & retained.');
  const weekly = page.locator('.light-page .light-channel-mix-ai[data-light-review-ai]');
  await expect(weekly.locator('.light-weekly-ai-tip')).toHaveText('Weekly <literal>');
  await expect(weekly.locator('.light-weekly-ai-detail')).toHaveText('Weekly detail & retained.');
  await expect(weekly.locator('button')).toHaveCount(0);
  await page.locator('[data-light-env-action="open-assessment"]').click();
  const dialog = page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true });
  const indoor = dialog.locator('.light-env-summary-top .light-env-summary-ai[data-light-review-ai]');
  await expect(indoor.locator('.sun-detail-ai-tip')).toHaveText('⚠ Indoor <literal>');
  await expect(indoor.locator('.sun-detail-ai-body')).toHaveText('Indoor detail & retained.');
  await expect(page.locator('[data-light-review-ai] img,[data-light-review-ai] script')).toHaveCount(0);
  for (const button of await page.locator('[data-light-review-ai] [data-ai-action]').all()) {
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button).toHaveAttribute('data-ai-owner', /^verdict-\d+:control$/);
    await expect(button).not.toHaveAttribute('data-ai-target');
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('static cached daily, Weekly and indoor reviews first open offline and preserve the full profile over two cold launches', async ({ page, context }) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seed, cachedProfile(new Date()));
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('reviewAICsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { reviewAICsp(value: string): Promise<void> }).reviewAICsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true;
    await inspect(page);
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) });
      await inspect(cold);
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('review-ai-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
