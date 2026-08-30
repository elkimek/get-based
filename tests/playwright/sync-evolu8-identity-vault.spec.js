import { expect, test } from '@playwright/test';

const LEGACY_BUNDLE = '**/vendor/evolu/evolu-bundle.js';

test('v8 repeat startup skips v7 and v7 restore invalidates the handoff', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-sync-enabled', 'true');
    localStorage.setItem('labcharts-sync-relay', 'ws://127.0.0.1:9');
  });
  let blockLegacy = false;
  let legacyRequests = 0;
  await page.route(LEGACY_BUNDLE, route => {
    legacyRequests += 1;
    return blockLegacy ? route.abort() : route.continue();
  });

  const readOwner = () => page.evaluate(async () => {
    const runtime = await import('/js/sync-runtime.js');
    const owner = runtime.getSyncAppOwner();
    return owner ? { id: String(owner.id), mnemonic: String(owner.mnemonic) } : null;
  });

  await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
  await expect.poll(readOwner, { timeout: 30_000 }).not.toBeNull();
  const firstOwner = await readOwner();
  expect(firstOwner?.id).toBeTruthy();
  expect(legacyRequests).toBeGreaterThan(0);
  expect(await page.evaluate(mnemonic => Object.values(localStorage).includes(mnemonic), firstOwner.mnemonic))
    .toBe(false);

  blockLegacy = true;
  legacyRequests = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(readOwner, { timeout: 30_000 }).not.toBeNull();
  const secondOwner = await readOwner();

  expect(secondOwner?.id).toBe(firstOwner?.id);
  expect(legacyRequests).toBe(0);

  blockLegacy = false;
  legacyRequests = 0;
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect.poll(readOwner, { timeout: 30_000 }).not.toBeNull();
  expect((await readOwner())?.id).toBe(firstOwner?.id);
  expect(legacyRequests).toBeGreaterThan(0);

  await page.evaluate(async mnemonic => {
    const runtime = await import('/js/sync-runtime.js');
    await runtime.getSyncEvolu().restoreAppOwner(mnemonic, { reload: false });
  }, firstOwner.mnemonic);
  expect(await page.evaluate(() => localStorage.getItem('labcharts-sync-evolu8-identity-token')))
    .toBeNull();

  legacyRequests = 0;
  await page.goto('/app?evolu-client=v8', { waitUntil: 'domcontentloaded' });
  await expect.poll(readOwner, { timeout: 30_000 }).not.toBeNull();
  expect((await readOwner())?.id).toBe(firstOwner?.id);
  expect(legacyRequests).toBeGreaterThan(0);
});
