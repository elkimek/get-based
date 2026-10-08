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

test('static Light setup completes on offline first use and retains canonical values through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installOfflineStartupDiagnostics(context); await installDiscussionFixture(context);
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { fitzpatrick: null, completedAt: 0 } });
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('setupCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => {
    if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused', 'true');
    document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { setupCsp(value: string): Promise<void> }).setupCsp(event.violatedDirective); });
  });
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true; const firstUse = Date.now(); await openLight(page);
    await page.getByRole('button', { name: 'Personalize Light', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Personalize Light', exact: true }); await expect(modal).toBeVisible();
    loading.push({ phase: 'first-offline-setup', readyMs: Date.now() - firstUse });
    await modal.getByRole('button', { name: 'Next: Light patterns', exact: true }).click();
    await modal.getByRole('button', { name: 'Save setup', exact: true }).click();
    await expect(modal.locator('[data-setup-tab=core]')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await modal.getByRole('radio').nth(3).focus(); await page.keyboard.press('Enter');
    await modal.locator('[data-choice-group=setup-homelight][data-value=led-warm]').click();
    await modal.locator('[data-choice-group=setup-eyewear][data-value=sunglasses]').click();
    await modal.locator('[data-choice-group=setup-photosensitive][data-value=none]').click();
    await modal.locator('[data-setup-tab=score]').focus(); await page.keyboard.press('Enter');
    for (const key of ['morning-light-deficit','cool-led-evening','low-outdoor-time']) {
      const input = modal.locator(`[data-ott="${key}"]`); await input.focus(); await page.keyboard.press('Space'); await expect(input).toBeChecked();
    }
    await expect(modal.locator('#ott-running-aligned')).toHaveText('3/10');
    await modal.screenshot({ path: test.info().outputPath('actual-light-setup-offline.png') });
    await modal.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(modal).toHaveCount(0);
    await expect(page.locator('.light-setup-summary')).toContainText('Your light setup');
    const saved = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(saved.sunDefaults).toMatchObject({ fitzpatrick: 'IV', completedAt: expect.any(Number), homeLight: 'led-warm', eyewear: 'sunglasses', photosensitiveMeds: 'none', ottScore: 3, ott: { 'morning-light-deficit': true, 'cool-led-evening': true, 'low-outdoor-time': true, 'glass-mediated-daytime': false } });
    expect(saved.lightCircadian).toMatchObject({ skinType: 'IV — olive' });
    expect(saved).toEqual({ ...before, sunDefaults: saved.sunDefaults, lightCircadian: saved.lightCircadian });
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      const summary = cold.locator('.light-setup-summary'); await expect(summary).toContainText('IV — olive'); await expect(summary).toContainText('3/10 selected');
      await summary.getByRole('button', { name: 'Edit', exact: true }).click();
      const editor = cold.getByRole('dialog', { name: 'Personalize Light', exact: true });
      await expect(editor.locator('#setup-skin-range')).toHaveValue('3'); await expect(editor.locator('#setup-homelight')).toHaveValue('led-warm'); await expect(editor.locator('#setup-eyewear')).toHaveValue('sunglasses');
      await editor.locator('[data-setup-tab=score]').focus(); await cold.keyboard.press('Enter');
      await expect(editor.locator('[data-ott]:checked')).toHaveCount(3); await expect(editor.locator('#ott-running-label')).toHaveAttribute('data-tier', '1');
      await editor.getByRole('button', { name: 'Close light setup', exact: true }).click();
      expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(saved); await cold.close();
    }
    await fs.writeFile(test.info().outputPath('light-setup-loading.json'), JSON.stringify(loading, null, 2));
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
