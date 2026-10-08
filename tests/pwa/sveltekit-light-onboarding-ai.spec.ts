import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

test('static authored onboarding AI first loads offline and preserves literal cached results through setup saves and two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installOfflineStartupDiagnostics(context); await installDiscussionFixture(context);
  const analysis = { status: 'ok' as const, dot: 'yellow', tip: 'Keep daylight <literal>', detail: 'Context & timing', actions: ['Open curtains', '<img src=x onerror="danger()">', 'Dim lamps'], fingerprint: 'saved-setup-context', generatedAt: 1 };
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { fitzpatrick: 'II', completedAt: 1, homeLight: 'led-warm', aiAnalysis: analysis } });
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('onboardingCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true');
    document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { onboardingCsp(value: string): Promise<void> }).onboardingCsp(event.violatedDirective); });
  });
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true; const firstUse = Date.now(); await openLight(page);
    const panel = page.locator('.light-setup-summary [data-light-onboarding-ai]');
    await expect(panel).toHaveAttribute('data-ai-state', 'ok'); await expect(panel.locator('.sun-detail-ai-tip')).toContainText(analysis.tip);
    expect(await panel.locator('li').allTextContents()).toEqual(analysis.actions);
    await expect(panel.locator('img, script, [onerror]')).toHaveCount(0);
    loading.push({ phase: 'first-offline-cached-analysis', readyMs: Date.now() - firstUse });
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await page.locator('.light-setup-summary').getByRole('button', { name: 'Edit', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Personalize Light', exact: true });
    await modal.locator('[data-choice-group=setup-homelight][data-value=incandescent]').click();
    await modal.getByRole('button', { name: 'Next: Light patterns', exact: true }).click();
    await modal.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(modal).toHaveCount(0);
    await expect(panel.locator('.sun-detail-ai-tip')).toContainText(analysis.tip);
    const saved = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(saved.sunDefaults).toMatchObject({ fitzpatrick: 'II', homeLight: 'incandescent', completedAt: expect.any(Number), aiAnalysis: analysis });
    expect(saved.lightCircadian).toMatchObject({ skinType: 'II — fair' });
    expect(saved).toEqual({ ...before, sunDefaults: saved.sunDefaults, lightCircadian: saved.lightCircadian });
    await panel.screenshot({ path: test.info().outputPath('actual-onboarding-ai-offline.png') }); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      const result = cold.locator('.light-setup-summary [data-light-onboarding-ai]');
      await expect(result.locator('.sun-detail-ai-tip')).toContainText(analysis.tip); expect(await result.locator('li').allTextContents()).toEqual(analysis.actions);
      await expect(result.locator('img, script, [onerror]')).toHaveCount(0); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved);
      await cold.locator('.light-setup-summary').getByRole('button', { name: 'Edit', exact: true }).click();
      await cold.getByRole('dialog', { name: 'Personalize Light', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('onboarding-ai-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
