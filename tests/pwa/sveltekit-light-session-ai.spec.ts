import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { DEVICE_ENGINE_VERSION } from '../../js/light-device-session-engine.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';

function seed({ defaults, now, version }: { defaults: ProfileData; now: number; version: number }) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  if (localStorage.getItem('session-ai-seeded')) return;
  localStorage.setItem('session-ai-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([
    { id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1 },
  ]));
  localStorage.setItem('labcharts-active-profile', 'default');
  for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  const device = {
    id: 'cached-panel', brand: 'Saved <Panel>', model: 'Red & NIR', type: 'pbm',
    channels: ['pbm_red'], peakWavelengths: [660], mwPerCm2At15cm: 20,
  };
  localStorage.setItem('labcharts-default-imported', JSON.stringify({
    ...defaults,
    contextNotes: 'Keep unrelated session AI context',
    sunDefaults: { fitzpatrick: 'II', completedAt: 1 },
    lightDevices: [device], lightMeasurements: [], lightAudits: [],
    lightEnvironment: { rooms: [], screens: [] }, lightDailyVerdicts: {},
    sunSessions: [{
      id: 'cached-sun', startedAt: now - 3600000, endedAt: now - 2700000, durationMin: 15,
      bodyExposure: { preset: 'shorts_top_off', fraction: 0.45 }, eyeExposure: { mode: 'direct' },
      doses: { vitamin_d: 100, circadian: 2000 }, safety: { medFraction: 0.1, fitzpatrick: 'II' },
      calculationStatus: 'computed',
      aiAnalysis: { status: 'ok', dot: 'green', tip: 'Saved Sun <context>', detail: 'Sun detail & retained.' },
    }],
    deviceSessions: [{
      id: 'cached-device', deviceId: device.id, deviceSnapshot: device,
      startedAt: now - 1800000, endedAt: now - 1380000, durationMin: 7, distanceCm: 25,
      bodyArea: 'torso', eyesProtected: true, doses: { pbm_red: 5 },
      safety: { hasUV: false, unsafeEyeExposure: false }, engineVersion: version,
      aiAnalysis: { status: 'ok', dot: 'yellow', tip: 'Saved Device <context>', detail: 'Device detail & retained.' },
    }],
  }));
}

async function inspect(page: Page) {
  await openLight(page);
  for (const kind of ['sun', 'device']) {
    await page.locator(`[data-light-history-row][data-id="cached-${kind}"]`).click();
    const name = kind === 'sun' ? 'Sun session details' : 'Device session details';
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog.locator('[data-light-session-ai]')).toHaveAttribute('data-ai-state', 'ok');
    await expect(dialog.locator('.sun-detail-ai-tip')).toHaveText(
      kind === 'sun' ? 'Saved Sun <context>' : 'Saved Device <context>',
    );
    await expect(dialog.locator('.sun-detail-ai-body')).toHaveText(
      kind === 'sun' ? 'Sun detail & retained.' : 'Device detail & retained.',
    );
    await expect(dialog.locator('[data-light-session-ai] img, [data-light-session-ai] script')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Re-run AI analysis', exact: true }))
      .toHaveAttribute('data-ai-owner', /^verdict-\d+:control$/);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
}

test('static cached Sun and device verdicts first load offline through actual details and retain the full profile over two cold launches', async ({ page, context }) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seed, { defaults: createDefaultProfileData(), now: Date.now(), version: DEVICE_ENGINE_VERSION });
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', error => errors.push(error.message));
  observe(page);
  context.on('page', observe);
  await context.exposeBinding('sessionAICsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { sessionAICsp(value: string): Promise<void> }).sessionAICsp(event.violatedDirective);
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
    expect(errors).toEqual([]);
    expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('session-ai-loading.json'), JSON.stringify(loading, null, 2));
  } finally {
    await server.close();
  }
});
