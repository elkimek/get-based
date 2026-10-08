import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { startLightAIProfileOwnership, finishLightAIProfileOwnership, lightAIProfileRequestCount, readLightAIProfileSnapshot } from '../helpers/light-ai-ownership-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

test('static offline Light AI requests retain profile ownership and canonical results through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(() => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true'); });
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('lightOwnerCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { lightOwnerCsp(value: string): Promise<void> }).lightOwnerCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    server.state.offline = true; const first = Date.now(); await openLight(page);
    await page.evaluate(startLightAIProfileOwnership); await expect.poll(() => page.evaluate(lightAIProfileRequestCount)).toBe(1);
    const outcome = await page.evaluate(finishLightAIProfileOwnership);
    expect(outcome.initial).toBe('idle'); expect(outcome.retired).toBeNull(); expect(outcome.aUnchanged).toBe(true);
    expect(outcome.current).toMatchObject({ status: 'ok', tip: 'Current B response' });
    expect(outcome.profile).toBe(outcome.bId); expect(outcome.live).toEqual(outcome.b);
    expect(outcome.b).toEqual({ ...outcome.beforeB, sunDefaults: outcome.b.sunDefaults });
    loading.push({ phase: 'first-offline-profile-ownership', readyMs: Date.now() - first }); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      await expect(cold.locator('[data-light-onboarding-ai]')).toHaveAttribute('data-ai-state', 'ok');
      await expect(cold.locator('[data-light-onboarding-ai] .sun-detail-ai-tip')).toContainText('Current B response');
      expect(await cold.evaluate(readLightAIProfileSnapshot)).toEqual({ profile: outcome.bId, data: outcome.b });
      expect(await cold.evaluate(async a => {
        const [crypto, profile] = await Promise.all([import('/js/crypto.js'), import('/js/profile.js')]);
        return await crypto.encryptedGetItem(profile.profileStorageKey(a, 'imported'));
      }, outcome.aId)).toBe(outcome.aSnapshot);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('light-ai-ownership-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
