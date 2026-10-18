import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('static onboarding first-use provider setup works after offline cold launch without changing profile data', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors: string[] = []; context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  await installDiscussionFixture(context, {provider: 'custom'});
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (!localStorage.getItem('onboarding-provider-seeded')) {
      localStorage.setItem('onboarding-provider-seeded', '1');
      localStorage.removeItem('labcharts-custom-url'); localStorage.removeItem('labcharts-custom-key');
    }
  });
  const server = await startKitServer(artifact);
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await ready(page);
    expect(await page.evaluate(() => localStorage.getItem('labcharts-ai-provider'))).toBe('custom');
    await page.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await page.locator('#chat-onboard-dob').fill('1990-01-01');
    await page.locator('#chat-onboard-name').fill('Ada <literal>');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const profile = JSON.parse(localStorage.getItem('labcharts-profiles') || '[]')[0];
      return [profile?.name, profile?.sex, profile?.dob];
    })).toEqual(['Ada <literal>', 'female', '1990-01-01']);
    await expect(page.locator('[data-chat-provider-view]')).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem('labcharts-profiles'));
    server.state.offline = true; await page.close();
    const cold = await context.newPage(); await cold.emulateMedia({ reducedMotion: 'reduce' });
    await cold.goto(server.origin + '/app?dev-sw=1'); await ready(cold);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-ai-provider'))).toBe('custom');
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-profiles'))).toBe(stored);
    await cold.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await expect(cold.getByRole('group', { name: 'Onboarding step 3 of 4: Add-ons' })).toBeVisible();
    await cold.getByRole('button', { name: 'Back to previous onboarding step' }).click();
    await expect(cold.locator('[data-chat-provider-view]')).toContainText('Welcome, Ada <literal>!');
    await expect(cold.locator('[data-chat-provider-view] literal')).toHaveCount(0);
    await cold.locator('[data-chat-provider-branch="bitcoin"]').focus(); await cold.keyboard.press('Enter');
    await expect(cold.getByRole('button', { name: 'Back to provider options' })).toBeFocused();
    await expect(cold.locator('[data-chat-provider-view] [data-chat-provider]')).toHaveCount(2);
    await cold.keyboard.press('Enter');
    await cold.locator('[data-chat-provider-branch="local"]').click(); await cold.locator('[data-chat-provider-view] [data-chat-provider="ollama"]').click();
    await expect(cold.locator('#settings-modal')).toBeVisible();
    await expect.poll(() => cold.evaluate(() => localStorage.getItem('labcharts-ai-provider'))).toBe('ollama');
    await cold.locator('#settings-modal [data-settings-action="close"]').click();
    await cold.getByRole('button', { name: 'Start guided chat', exact: true }).click();
    await expect(cold.getByRole('group', { name: 'Onboarding step 2 of 3: Add-ons' })).toBeVisible();
    await cold.getByRole('button', { name: 'Back to previous onboarding step' }).click();
    await expect(cold.getByRole('group', { name: 'Onboarding step 1 of 3: Basics' })).toBeVisible();
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-profiles'))).toBe(stored);
    expect(errors).toEqual([]);
    await cold.screenshot({ path: test.info().outputPath('onboarding-provider-offline.png') });
  } finally { await server.close(); }
});
