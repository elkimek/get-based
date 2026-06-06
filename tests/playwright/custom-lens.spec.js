import { expect, test } from './coverage-fixture.js';

test('chat lens indicator hides when no lens is configured', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#chat-lens-indicator')).toHaveCount(1);
  await expect(page.locator('#chat-lens-dot')).toHaveCount(1);

  const display = await page.evaluate(() => {
    const indicator = document.getElementById('chat-lens-indicator');
    localStorage.removeItem('labcharts-lens-config');
    window.updateKeyCache?.('labcharts-lens-key', '');
    if (typeof window.updateLensIndicator !== 'function') throw new Error('window.updateLensIndicator unavailable');
    window.updateLensIndicator();
    return indicator?.style.display || '';
  });

  expect(display).toBe('none');
});

test('knowledge base modal renders lens controls and settings AI does not', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(() => {
    if (typeof window.openKnowledgeBaseModal !== 'function') throw new Error('window.openKnowledgeBaseModal unavailable');
    localStorage.setItem('labcharts-lens-config', JSON.stringify({
      backend: 'external-server',
      url: 'https://kb.example.test',
      enabled: false,
      topK: 5,
      testProbe: 'vitamin D deficiency supplementation',
      multiQuery: true,
    }));
    window.openKnowledgeBaseModal();
  });

  const lensSection = page.locator('#custom-lens-section');
  await expect(lensSection).toHaveCount(1);
  await expect(page.locator('#lens-url-input')).toHaveCount(1);
  await expect(page.locator('#lens-key-input')).toHaveCount(1);
  await expect(page.locator('#lens-topk-input')).toHaveCount(1);
  await expect(page.locator('#lens-enabled-toggle')).toHaveCount(1);
  expect(await lensSection.evaluate((section) => section.innerHTML.includes('handleSaveLensConfig'))).toBe(true);

  await page.evaluate(() => {
    window.closeKnowledgeBaseModal?.();
    if (typeof window.openSettingsModal !== 'function') throw new Error('window.openSettingsModal unavailable');
    window.openSettingsModal('ai');
  });

  await expect(page.locator('.settings-tab-panel[data-tab-panel="ai"] #custom-lens-section')).toHaveCount(0);
});
