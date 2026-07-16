import { expect, test } from './coverage-fixture.js';

const SHOW_CLASS_TOKEN = /(^|\s)show(\s|$)/;

async function preparePage(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => {
    return import('/js/state.js').then(({ state }) => {
      const profileId = state.currentProfile || localStorage.getItem('labcharts-active-profile') || 'default';
      localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
      localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    });
  });
  await page.evaluate(() => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    document.getElementById('sync-setup-overlay')?.remove();
  });
}

test('Settings display toggles persist through delegated slider actions', async ({ page }) => {
  await preparePage(page);

  await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    localStorage.removeItem('labcharts-show-product-recs');
    localStorage.removeItem('labcharts-debug');
    (await import('/js/theme.js')).setTheme('cyberterm');
    settings.openSettingsModal('display');
  });

  await expect(page.locator('#settings-modal-overlay')).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(page.locator('#settings-modal')).toHaveAttribute('data-delegated-actions', '1');

  await page.locator('#settings-product-recs + .toggle-slider').click();
  await page.locator('#debug-mode-toggle + .toggle-slider').click();

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('labcharts-show-product-recs'))).toBe('false');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('labcharts-debug'))).toBe('true');
});

test('Settings data sync toggle opens and cancels setup modal', async ({ page }) => {
  await preparePage(page);

  await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    const syncState = await import('/js/sync-settings-state.js');
    syncState.setSyncEnabled(false);
    settings.openSettingsModal('data');
  });

  await page.locator('#sync-section [data-sync-action="toggle-sync"] + .chat-toggle-slider').click();

  const setupOverlay = page.locator('#sync-setup-overlay');
  await expect(setupOverlay).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(page.locator('#sync-section [data-sync-action="toggle-sync"]')).toBeChecked();

  await setupOverlay.locator('[data-sync-setup-action="setup-cancel"]').click();
  await expect(setupOverlay).not.toHaveClass(SHOW_CLASS_TOKEN);
});

test('Tweaks panel toggles sunset and CRT effects with theme gating', async ({ page }) => {
  await preparePage(page);

  await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    localStorage.removeItem('labcharts-sunset-mode');
    localStorage.removeItem('labcharts-crt-effects');
    (await import('/js/theme.js')).setTheme('cyberterm');
    settings.openTweaksPanel();
  });

  const tweaksOverlay = page.locator('#tweaks-panel-overlay');
  await expect(tweaksOverlay).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(tweaksOverlay).toHaveAttribute('data-delegated-actions', '1');

  await page.locator('#tweaks-sunset-mode + .toggle-slider').click();
  await page.locator('#tweaks-crt-effects + .toggle-slider').click();

  await expect.poll(async () => page.evaluate(() => ({
    sunsetStorage: localStorage.getItem('labcharts-sunset-mode'),
    sunsetDataset: document.documentElement.dataset.sunsetMode,
    crtStorage: localStorage.getItem('labcharts-crt-effects'),
    crtDataset: document.documentElement.dataset.crtEffects,
  }))).toEqual({
    sunsetStorage: 'true',
    sunsetDataset: 'on',
    crtStorage: 'true',
    crtDataset: 'on',
  });

  await page.evaluate(async () => {
    const themeModule = await import('/js/theme.js');
    const settings = await import('/js/settings.js');
    themeModule.setTheme('dark');
    themeModule.setCrtEffectsEnabled(false);
    settings.openTweaksPanel();
  });

  const crtInput = page.locator('#tweaks-crt-effects');
  await expect(crtInput).toBeDisabled();
  await page.evaluate(() => {
    document.querySelector('#tweaks-crt-effects + .toggle-slider')?.click();
  });

  await expect.poll(async () => page.evaluate(() => ({
    crtStorage: localStorage.getItem('labcharts-crt-effects'),
    crtDataset: document.documentElement.dataset.crtEffects || '',
  }))).toEqual({
    crtStorage: null,
    crtDataset: '',
  });
  await expect(crtInput).not.toBeChecked();
});

test('Tweaks panel uses lifecycle scroll lock on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparePage(page);

  await page.evaluate(async () => {
    const settings = await import('/js/settings.js');
    document.body.style.overflow = 'auto';
    settings.openTweaksPanel();
  });

  const tweaksOverlay = page.locator('#tweaks-panel-overlay');
  await expect(tweaksOverlay).toHaveClass(SHOW_CLASS_TOKEN);
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await page.evaluate(async () => (await import('/js/settings.js')).closeTweaksPanel());
  await expect(tweaksOverlay).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.body.style.overflow)).toBe('auto');
});
