import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import {seedDeniedLightToolProfile} from '../helpers/light-tool-artifact-fixture.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

async function inspect(page: Page) {
  await openLight(page);
  const widget = page.locator('[data-widget-id="light-tools"]');
  const expand = widget.locator('[data-light-page-action="expand-light-tools"]');
  if (await expand.count()) await expand.click();
  const launcher = widget.locator('[data-light-tool-view].light-tools-section');
  await expect(launcher).toBeVisible();
  await expect(launcher.locator('.light-tools-status span')).toHaveText(['1 measurement', '1 in the last 7 days', '1 room mapped']);
  await expect(launcher.locator('.light-tool-action')).toHaveCount(8);
  const group = launcher.locator('details').filter({hasText: 'Walkthroughs & logs'});
  await group.locator('summary').click();
  await expect(group).toHaveAttribute('open', '');
  await launcher.locator('[data-light-tool-id="golden"]').click();
  const golden = page.getByRole('dialog', {name: 'Golden hour log', exact: true});
  await expect(golden).toHaveAttribute('data-light-tool-view', '');
  const duration = golden.getByRole('spinbutton', {name: 'Duration outside (minutes)', exact: true});
  await expect(duration).toHaveValue('15'); await expect(duration).toHaveAttribute('min', '1'); await expect(duration).toHaveAttribute('max', '120');
  await duration.fill('500'); await golden.getByRole('button', {name: 'Cancel', exact: true}).click(); await expect(golden).toHaveCount(0);
  await launcher.locator('[data-light-tool-id="audit"]').click();
  const audit = page.getByRole('dialog', {name: 'Home audit', exact: true});
  await expect(audit).toHaveAttribute('data-light-tool-view', '');
  await expect(audit.locator('#audit-status')).toHaveText('Press Start when ready.');
  await expect(audit.locator('.tool-aiming-guide')).toBeVisible();
  await audit.getByRole('button', {name: 'Start audit', exact: true}).click();
  await expect(audit.locator('#audit-status')).toContainText('Camera access denied — audit unavailable.');
  await expect(audit.locator('#audit-status')).toHaveAttribute('aria-live', 'polite');
  const retry = audit.getByRole('button', {name: 'Retry audit', exact: true});
  await retry.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as {lightToolCameraRequests: number}).lightToolCameraRequests)).toBe(2);
  await expect(retry).toBeVisible(); await page.keyboard.press('Escape'); await expect(audit).toHaveCount(0);
}
test('static tool launcher, golden logger and walkthrough retry preserve the full profile over offline cold launches', async ({page, context}) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seedDeniedLightToolProfile, {defaults: createDefaultProfileData(), now: Date.now()});
  const errors: string[] = [], csp: string[] = [];
  const observe = (page: Page) => page.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('lightToolCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {void (window as unknown as {lightToolCsp(value: string): Promise<void>}).lightToolCsp(event.violatedDirective);}));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}], before = await page.evaluate(readComparisonAcceptanceProfile);
    server.state.offline = true;
    await inspect(page); expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      await inspect(cold); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(before); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('light-tools-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
