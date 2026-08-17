import { expect, test } from './coverage-fixture.js';

test('OpenRouter provider controls render from Settings AI', async ({ page }) => {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
  });

  const providerButtons = page.locator('.ai-provider-btn');
  await expect(providerButtons).toHaveCount(6);
  const providerSection = page.locator('#ai-provider-advanced-section');
  await expect(providerSection).toBeVisible();
  await expect(providerSection).toContainText('Bring your own key / local AI');
  await expect(providerSection.locator('summary')).toHaveCount(0);
  expect(await providerSection.evaluate(section => section.tagName)).toBe('DIV');

  const providerValues = await providerButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.provider));
  expect(providerValues).toContain('ppq');
  expect(providerValues).toContain('routstr');
  expect(providerValues).toContain('venice');
  expect(providerValues).toContain('ollama');
  expect(providerValues).toContain('openrouter');
  expect(providerValues.indexOf('openrouter')).toBeLessThan(providerValues.indexOf('venice'));

  const rowCount = await providerButtons.evaluateAll((buttons) => {
    const rows = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
    return new Set(rows).size;
  });
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(viewportWidth <= 720 || rowCount === 1).toBe(true);

  const overflowingProvider = await providerButtons.evaluateAll((buttons) => {
    const overflowing = buttons.find((button) => button.scrollWidth > button.clientWidth + 1);
    return overflowing?.dataset.provider || null;
  });
  expect(viewportWidth <= 720 || overflowingProvider === null).toBe(true);

  await page.locator('.ai-provider-btn[data-provider="openrouter"]').click();

  await expect(page.locator('#openrouter-key-input')).toHaveCount(1);
  await expect(page.locator('#openrouter-key-status')).toHaveCount(1);
  await expect(page.locator('#openrouter-model-area')).toHaveCount(1);
  await expect(page.locator('#save-openrouter-key-btn')).toHaveCount(1);
});
