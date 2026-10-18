import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
async function openDisplay(page: Page) {
  const closeChat = page.getByRole('button', {name: 'Close chat', exact: true});
  if (await closeChat.isVisible()) await closeChat.click();
  await page.locator('[data-shell-action="open-settings"]:visible').first().click();
  await page.locator('#settings-nav-display').click();
  await expect(page.locator('#settings-nav-display')).toHaveAttribute('aria-selected', 'true');
}
async function prepare(page: Page) {
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({
      'labcharts-theme': 'dark', 'labcharts-ai-provider': 'custom', 'labcharts-ai-paused': 'true',
      'labcharts-default-emptyTour': 'completed', 'labcharts-default-tour': 'completed',
      'labcharts-default-onboarded': 'profile-set', 'labcharts-encryption-nudge-dismissed': 'true',
      'labcharts-analytics-consent-seen': '1',
    })) localStorage.setItem(key, value);
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-15T00:00:00Z' }));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await openDisplay(page);
}
async function settleStylesheet(page: Page) {
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .some(link => new URL(link.href).pathname.endsWith('/css/wearables.css') && !!link.sheet));
  // Publication follows the actual link load event; drain the rendering turn.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const mode of ['newer-tab', 'closed', 'reopened', 'keyboard-newer-focus', 'public-open-close', 'public-open-new-request'] as const) {
  test(`cold Wearables stylesheet cannot publish into retired Settings: ${mode}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    let release!: () => void, requests = 0;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/css/wearables.css*', async route => { requests++; await held; await route.continue(); });
    try {
      await prepare(page);
      if (mode.startsWith('public-open')) {
        await page.evaluate(async () => {
          const settings = await import('/js/settings.js');
          const result = settings.openSettingsModal('wearables');
          (window as unknown as { settingsPending: Promise<void | false> }).settingsPending = Promise.resolve(result);
        });
      } else if (mode === 'keyboard-newer-focus') {
        await page.locator('#settings-nav-data').click();
        await page.locator('#settings-nav-data').focus(); await page.keyboard.press('ArrowDown');
      } else await page.locator('#settings-nav-wearables').click();
      await expect.poll(() => requests).toBe(1);
      if (mode === 'closed' || mode === 'reopened' || mode === 'public-open-close') {
        await page.locator('#settings-modal [data-settings-action="close"]').click();
        await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
        if (mode === 'reopened') await openDisplay(page);
      } else if (mode === 'newer-tab') await page.locator('#settings-nav-ai').click();
      else if (mode === 'public-open-new-request') {
        await page.evaluate(async () => (await import('/js/settings.js')).openSettingsModal('display'));
      } else {
        await page.locator('#settings-nav-display').click(); await page.locator('#settings-nav-display').focus();
      }
      const current = await page.locator('.settings-tabs-bar [aria-selected="true"]').getAttribute('id');
      release(); await settleStylesheet(page);
      await expect(page.locator('.settings-tabs-bar [aria-selected="true"]')).toHaveCount(1);
      await expect(page.locator(`#${current}`)).toHaveAttribute('aria-selected', 'true');
      if (mode === 'closed' || mode === 'public-open-close') await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/\bshow\b/);
      else await expect(page.locator('#settings-modal-overlay')).toHaveClass(/\bshow\b/);
      if (mode === 'keyboard-newer-focus') await expect(page.locator('#settings-nav-display')).toBeFocused();
      if (mode.startsWith('public-open')) expect(await page.evaluate(() => (window as unknown as { settingsPending: Promise<void | false> }).settingsPending)).toBe(false);
      expect(requests).toBe(1); expect(errors).toEqual([]);
    } finally { release(); }
  });
}

test('cold stylesheet failure retries normally and loaded aliases remain synchronous', async ({ page }) => {
  const requests: string[] = [], errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/css/wearables.css*', route => {
    requests.push(route.request().url()); return requests.length === 1 ? route.abort('failed') : route.continue();
  });
  await prepare(page); await page.locator('#settings-nav-wearables').click();
  await expect(page.locator('#notification-container')).toContainText('Wearables could not be loaded. Try again.');
  await expect(page.locator('#settings-nav-display')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#settings-nav-wearables').click();
  await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
  expect(requests).toHaveLength(2); expect(new URL(requests[1]!).searchParams.get('lazy-retry')).toBe('1');
  expect(await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    const switched = settings.switchSettingsTab('display');
    const switchedSameTurn = document.getElementById('settings-nav-display')?.getAttribute('aria-selected') === 'true';
    const alias = settings.switchSettingsTab('integrations');
    const aliasSameTurn = document.getElementById('settings-nav-wearables')?.getAttribute('aria-selected') === 'true';
    const opened = settings.openSettingsModal('integrations');
    return { switchedVoid: switched === undefined, switchedSameTurn, aliasVoid: alias === undefined, aliasSameTurn, openedVoid: opened === undefined };
  })).toEqual({ switchedVoid: true, switchedSameTurn: true, aliasVoid: true, aliasSameTurn: true, openedVoid: true });
  expect(errors).toEqual([]);
});

test('two cold selections share the stylesheet and only the last request publishes', async ({ page }) => {
  let release!: () => void, requests = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/wearables.css*', async route => { requests++; await held; await route.continue(); });
  try {
    await prepare(page);
    await page.evaluate(async () => {
      const settings = await import('/js/settings.js');
      (window as unknown as { settingsRequests: Promise<(void | false)[]> }).settingsRequests = Promise.all([settings.switchSettingsTab('wearables'), settings.switchSettingsTab('integrations')]);
    });
    await expect.poll(() => requests).toBe(1); release();
    expect(await page.evaluate(() => (window as unknown as { settingsRequests: Promise<(void | false)[]> }).settingsRequests)).toEqual([false, undefined]);
    await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
    expect(requests).toBe(1);
  } finally { release(); }
});

test('retired CSS failure leaves current AI quiet and a later current action retries', async ({ page }) => {
  const requests: string[] = [], errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/wearables.css*', async route => {
    requests.push(route.request().url());
    if (requests.length === 1) { await held; await route.abort('failed'); }
    else await route.continue();
  });
  try {
    await prepare(page);
    await page.evaluate(async () => {
      const settings = await import('/js/settings.js');
      (window as unknown as { settingsPending: Promise<void | false> }).settingsPending = Promise.resolve(settings.switchSettingsTab('wearables'));
    });
    await expect.poll(() => requests.length).toBe(1);
    await page.locator('#settings-nav-ai').click(); await expect(page.locator('#settings-nav-ai')).toBeFocused();
    release();
    expect(await page.evaluate(() => (window as unknown as { settingsPending: Promise<void | false> }).settingsPending)).toBe(false);
    await expect(page.locator('#settings-nav-ai')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#settings-nav-ai')).toBeFocused();
    await expect(page.locator('#notification-container')).not.toContainText('Wearables could not be loaded. Try again.');
    await page.locator('#settings-nav-wearables').click();
    await expect(page.locator('#settings-tab-wearables [data-wearables-view]')).toBeVisible();
    expect(requests).toHaveLength(2); expect(new URL(requests[1]!).searchParams.get('lazy-retry')).toBe('1');
    expect(errors).toEqual([]);
  } finally { release(); }
});
