import { expect, test } from './coverage-fixture.js';

const CURRENT_ACCEPTANCE = {
  accepted: true,
  termsVersion: '2026-08-22',
  privacyVersion: '2026-08-22',
  acceptedAt: '2026-07-26T00:00:00.000Z',
  appVersion: 'playwright',
  location: 'playwright',
};

test.use({
  viewport: { width: 375, height: 667 },
  seedLegalAcceptance: false,
});

async function holdMainModule(page) {
  let release;
  const released = new Promise(resolve => {
    release = resolve;
  });
  await page.route('**/js/main.js', async route => {
    await released;
    await route.continue();
  });
  return () => release();
}

test('fresh visitor can accept the prerendered legal gate before the main module loads', async ({ page }) => {
  const releaseMain = await holdMainModule(page);
  const navigation = page.goto('/app', { waitUntil: 'domcontentloaded' });

  const overlay = page.locator('#legal-consent-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute('data-legal-consent-bootstrap-bound', 'true');
  await expect(page.locator('#legal-consent-title')).toHaveText('Accept Terms & Privacy');
  await expect(page.locator('[data-legal-path="/terms"]')).toHaveAttribute('href', '/terms');
  await expect(page.locator('[data-legal-path="/privacy"]')).toHaveAttribute('href', '/privacy');

  const mobileLayout = await page.locator('.legal-consent-modal').evaluate(modal => {
    const bounds = modal.getBoundingClientRect();
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      viewportHeight: window.innerHeight,
      scrollable: modal.scrollHeight > modal.clientHeight,
      overflowY: getComputedStyle(modal).overflowY,
    };
  });
  expect(mobileLayout.top).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.bottom).toBeLessThanOrEqual(mobileLayout.viewportHeight);
  expect(mobileLayout.scrollable).toBe(true);
  expect(mobileLayout.overflowY).toBe('auto');

  const acceptButton = page.locator('[data-legal-consent-action="accept"]');
  await expect(acceptButton).toBeDisabled();
  await page.locator('#legal-consent-checkbox').check();
  await expect(acceptButton).toBeEnabled();
  await acceptButton.click();
  await expect(overlay).toHaveCount(0);

  const acceptance = await page.evaluate(() => {
    const raw = localStorage.getItem('labcharts-legal-acceptance');
    return raw ? JSON.parse(raw) : null;
  });
  expect(acceptance).toMatchObject({
    accepted: true,
    termsVersion: CURRENT_ACCEPTANCE.termsVersion,
    privacyVersion: CURRENT_ACCEPTANCE.privacyVersion,
  });

  releaseMain();
  await navigation;
  await expect(page.locator('#main-content')).toContainText('Welcome to getbased');
  await expect(page.locator('#legal-consent-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('labcharts-legal-acceptance');
    return raw ? JSON.parse(raw).appVersion : null;
  })).toMatch(/^\d+\.\d+\.\d+$/);
});

test('returning visitor never sees the prerendered gate while the main module is delayed', async ({ page }) => {
  await page.addInitScript(acceptance => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify(acceptance));
  }, CURRENT_ACCEPTANCE);
  const releaseMain = await holdMainModule(page);
  const navigation = page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.header')).toBeVisible();
  await expect(page.locator('#legal-consent-overlay')).toHaveCount(0);

  releaseMain();
  await navigation;
  await expect(page.locator('#main-content')).toContainText('Welcome to getbased');
});

test('stale acceptance shows the updated-document copy before the main module loads', async ({ page }) => {
  await page.addInitScript(acceptance => {
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify(acceptance));
  }, {
    ...CURRENT_ACCEPTANCE,
    termsVersion: '2026-01-01',
    privacyVersion: '2026-01-01',
  });
  const releaseMain = await holdMainModule(page);
  const navigation = page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#legal-consent-overlay')).toBeVisible();
  await expect(page.locator('#legal-consent-title')).toHaveText('Review updated Terms & Privacy');
  await expect(page.locator('#legal-consent-desc')).toContainText('changed since this browser last accepted');
  await expect(page.locator('.legal-consent-check a').first()).toHaveCSS('text-decoration-line', 'underline');

  releaseMain();
  await navigation;
  await expect(page.locator('#legal-consent-overlay')).toBeVisible();
});

test('blocked acceptance storage closes the gate for the current session without deadlock', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'labcharts-legal-acceptance') {
        throw new DOMException('blocked for test', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  const releaseMain = await holdMainModule(page);
  const navigation = page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#legal-consent-overlay')).toBeVisible();
  await page.locator('#legal-consent-checkbox').check();
  await page.locator('[data-legal-consent-action="accept"]').click();
  await expect(page.locator('#legal-consent-overlay')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-legal-consent-bootstrap-result', 'session');

  releaseMain();
  await navigation;
  await expect(page.locator('#main-content')).toContainText('Welcome to getbased');
  await expect(page.locator('#legal-consent-overlay')).toHaveCount(0);
});
