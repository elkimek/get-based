import { expect, test } from './coverage-fixture.js';

test('OpenRouter provider controls render from Settings AI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(() => {
    if (typeof window.openSettingsModal !== 'function') throw new Error('window.openSettingsModal unavailable');
    window.openSettingsModal('ai');
  });

  const providerButtons = page.locator('.ai-provider-btn');
  await expect(providerButtons).toHaveCount(6);

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

  await page.evaluate(() => {
    if (typeof window.switchAIProvider !== 'function') throw new Error('window.switchAIProvider unavailable');
    window.switchAIProvider('openrouter');
  });

  await expect(page.locator('#openrouter-key-input')).toHaveCount(1);
  await expect(page.locator('#openrouter-key-status')).toHaveCount(1);
  await expect(page.locator('#openrouter-model-area')).toHaveCount(1);
  await expect(page.locator('#save-openrouter-key-btn')).toHaveCount(1);
});
