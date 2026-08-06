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
    settings.configureSettingsRuntime({
      navigate: view => { document.body.dataset.settingsNavigate = view; },
    });
    settings.openSettingsModal('display');
  });

  await expect(page.locator('#settings-modal-overlay')).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(page.locator('#settings-modal')).toHaveAttribute('data-delegated-actions', '1');
  await expect(page.locator('label[for="debug-mode-toggle"], label.settings-label').filter({ hasText: 'Debug Mode' })).toHaveCount(1);

  await page.locator('#settings-product-recs + .toggle-slider').click();
  await page.locator('#debug-mode-toggle + .toggle-slider').click();

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('labcharts-show-product-recs'))).toBe('false');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('labcharts-debug'))).toBe('true');
  await expect(page.locator('body')).toHaveAttribute('data-settings-navigate', 'dashboard');
});

test('Settings data sync exposes visible setup controls and a working toggle', async ({ page }) => {
  await preparePage(page);

  await page.evaluate(async () => {
    const settingsLoader = await import('/js/settings-loader.js');
    const syncState = await import('/js/sync-settings-state.js');
    syncState.setSyncEnabled(false);
    await settingsLoader.openSettingsModal('data');
  });

  const newSetup = page.locator('#sync-section [data-sync-action="setup-new-direct"]');
  const joinExisting = page.locator('#sync-section [data-sync-action="setup-restore-direct"]');
  const syncSlider = page.locator('#sync-section [data-sync-action="toggle-sync"] + .chat-toggle-slider');
  await expect(newSetup).toBeVisible();
  await expect(joinExisting).toBeVisible();
  await expect(syncSlider).toBeVisible();
  await expect(newSetup).toHaveText('Set up new sync');
  await expect(joinExisting).toHaveText('Join existing device');

  await joinExisting.click();
  const directRestoreOverlay = page.locator('#sync-setup-overlay');
  await expect(directRestoreOverlay).toHaveClass(SHOW_CLASS_TOKEN);
  await expect(directRestoreOverlay.locator('#sync-setup-restore')).toBeVisible();
  await directRestoreOverlay.locator('[data-sync-setup-action="setup-cancel"]').click();
  await expect(directRestoreOverlay).not.toHaveClass(SHOW_CLASS_TOKEN);

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
