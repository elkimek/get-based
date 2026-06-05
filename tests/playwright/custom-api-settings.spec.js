import { expect, test } from '@playwright/test';

test('custom API provider panel renders from Settings AI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(() => {
    if (typeof window.openSettingsModal !== 'function') throw new Error('window.openSettingsModal unavailable');
    window.openSettingsModal('ai');
  });

  const providerButtons = page.locator('.ai-provider-btn');
  await expect(providerButtons).toHaveCount(6);

  const providerValues = await providerButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.provider));
  expect(providerValues).toContain('custom');
  expect(providerValues.indexOf('custom')).toBeLessThan(providerValues.indexOf('ollama'));

  await page.evaluate(() => {
    if (typeof window.switchAIProvider !== 'function') throw new Error('window.switchAIProvider unavailable');
    window.switchAIProvider('custom');
  });

  await expect(page.locator('#custom-url-input')).toHaveCount(1);
  await expect(page.locator('#custom-key-input')).toHaveCount(1);
  await expect(page.locator('.ai-provider-panel .import-btn-primary')).toHaveCount(1);
  await expect(page.locator('.ai-provider-panel .ai-provider-desc')).toContainText('OpenAI-compatible');
});

test('custom API connected state renders model controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(() => {
    if (typeof window.setCustomApiUrl !== 'function') throw new Error('window.setCustomApiUrl unavailable');
    if (typeof window.setCustomApiModel !== 'function') throw new Error('window.setCustomApiModel unavailable');
    if (typeof window.setAIProvider !== 'function') throw new Error('window.setAIProvider unavailable');
    if (typeof window.openSettingsModal !== 'function') throw new Error('window.openSettingsModal unavailable');
    if (typeof window.switchAIProvider !== 'function') throw new Error('window.switchAIProvider unavailable');

    window.setCustomApiUrl('https://api.test.com/v1');
    window.updateKeyCache?.('labcharts-custom-key', 'sk-test');
    window.setCustomApiModel('test-model');
    localStorage.setItem('labcharts-custom-models', JSON.stringify([
      { id: 'test-model', name: 'Test Model' },
      { id: 'other-model', name: 'Other Model' },
    ]));
    window.setAIProvider('custom');
    window.openSettingsModal('ai');
    window.switchAIProvider('custom');
  });

  await expect(page.locator('#custom-key-status')).toContainText('Connected');
  await expect(page.locator('#custom-model-select')).toHaveCount(1);
  await expect(page.locator('#custom-model-select')).toHaveValue('test-model');
  expect(await page.locator('#custom-model-select').evaluate((select) => select.options.length)).toBe(2);
  await expect(page.locator('#custom-manual-model')).toHaveCount(1);
  await expect(page.locator('[data-provider-panel-action="remove-custom-api"]')).toHaveCount(1);
});
