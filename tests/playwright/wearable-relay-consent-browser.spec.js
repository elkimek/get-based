import { expect, test } from './coverage-fixture.js';

test('hosted wearable consent matches the explicit cloud-consent interaction', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const consent = await import('/js/wearables-settings-groups.js');
    consent.withdrawHostedWearableRelayConsent('browser-profile', 'withings');
    globalThis.__wearableRelayConsentResult = null;
    consent.requestHostedWearableRelayConsent('browser-profile', 'withings', 'Withings')
      .then(result => { globalThis.__wearableRelayConsentResult = result; });
  });

  const overlay = page.locator('#wearable-relay-consent-overlay');
  const checkbox = page.locator('#wearable-relay-consent-checkbox');
  const approve = page.locator('[data-wearable-relay-consent-action="approve"]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Connect Withings');
  await expect(overlay).toContainText('getbased s.r.o.');
  await expect(overlay).toContainText('Encrypted sync and cloud AI are separate choices');
  await expect(checkbox).not.toBeChecked();
  await expect(approve).toBeDisabled();
  await expect(checkbox).toBeFocused();

  await checkbox.check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await page.waitForFunction(() => globalThis.__wearableRelayConsentResult !== null);
  expect(await page.evaluate(() => globalThis.__wearableRelayConsentResult)).toBe(true);
  await expect(overlay).toHaveCount(0);

  const record = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('labcharts-hosted-wearable-consent'));
    return stored.approvals['browser-profile:withings'];
  });
  expect(record).toMatchObject({
    accepted: true,
    profileId: 'browser-profile',
    provider: 'withings',
    recipient: 'Withings',
    controller: 'getbased s.r.o.',
  });
});
