import { expect, test } from '@playwright/test';

test('mobile chat keeps its header and composer inside the keyboard viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-19',
      privacyVersion: '2026-08-19',
      acceptedAt: '2026-07-27T00:00:00.000Z',
      appVersion: 'mobile-chat-test',
      location: 'mobile-chat-test',
    }));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).openChatPanel();
    const panel = document.getElementById('chat-panel');
    panel?.style.setProperty('--chat-visual-viewport-top', '96px');
    panel?.style.setProperty('--chat-visual-viewport-bottom', '248px');
  });

  await expect(page.locator('#chat-input')).toBeFocused();
  const keyboardLayout = await page.evaluate(() => {
    const panel = document.getElementById('chat-panel');
    const header = document.querySelector('.chat-header');
    const messages = document.querySelector('.chat-messages');
    const composer = document.querySelector('.chat-input-area');
    const rect = element => element?.getBoundingClientRect();
    return {
      panel: rect(panel),
      header: rect(header),
      messages: rect(messages),
      composer: rect(composer),
    };
  });

  expect(keyboardLayout.panel?.top).toBe(96);
  expect(keyboardLayout.panel?.bottom).toBe(596);
  expect(keyboardLayout.panel?.height).toBe(500);
  expect(keyboardLayout.header?.top).toBeGreaterThanOrEqual(keyboardLayout.panel.top);
  expect(keyboardLayout.composer?.bottom).toBeLessThanOrEqual(keyboardLayout.panel.bottom);
  expect(keyboardLayout.messages?.top).toBeGreaterThanOrEqual(keyboardLayout.header.bottom);
  expect(keyboardLayout.messages?.bottom).toBeLessThanOrEqual(keyboardLayout.composer.top);

  await page.evaluate(() => {
    const panel = document.getElementById('chat-panel');
    panel?.style.setProperty('--chat-visual-viewport-top', '0px');
    panel?.style.setProperty('--chat-visual-viewport-bottom', '0px');
  });
  const restoredLayout = await page.locator('#chat-panel').boundingBox();
  expect(restoredLayout?.y).toBe(0);
  expect(restoredLayout?.height).toBe(844);
  await expect(page.locator('.chat-header')).toBeVisible();
  await expect(page.locator('.chat-input-area')).toBeVisible();
});
