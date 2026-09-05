import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-08-17T00:00:00.000Z',
      appVersion: 'chat-provider-live-refresh-test',
      location: 'chat-provider-live-refresh-test',
    }));
  });
});

test('provider changes refresh attachments and composer controls without a reload', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
  });

  const input = page.locator('#chat-input');
  const voice = page.locator('#chat-voice-btn');
  const attach = page.locator('#chat-attach-btn');
  const addPhoto = page.locator('#chat-add-photo-action');

  await expect(input).toBeDisabled();
  await expect(voice).toBeDisabled();
  await expect(attach).toHaveCSS('display', 'flex');
  await expect(addPhoto).toHaveAttribute('hidden', '');

  await page.evaluate(async () => {
    const storage = await import('/js/api-provider-storage.js');
    const cache = await import('/js/crypto-key-cache.js');
    cache.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-4o');
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-4o']));
    storage.setAIProvider('openrouter');
  });

  await expect(input).toBeEnabled();
  await expect(voice).toBeEnabled();
  await expect(attach).toHaveCSS('display', 'flex');
  await expect(addPhoto).not.toHaveAttribute('hidden', '');

  await page.evaluate(async () => {
    const storage = await import('/js/api-provider-storage.js');
    const cache = await import('/js/crypto-key-cache.js');
    cache.updateKeyCache('labcharts-openrouter-key', '');
    storage.setAIProvider('openrouter');
  });

  await expect(input).toBeDisabled();
  await expect(voice).toBeDisabled();
  await expect(attach).toHaveCSS('display', 'flex');
  await expect(addPhoto).toHaveAttribute('hidden', '');
});
