import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-09-04T00:00:00.000Z',
      appVersion: 'chat-model-controls-test',
      location: 'chat-model-controls-test',
    }));
  });
});

test('direct-provider picker searches models and persists a dragged reasoning effort', async ({ page }) => {
  await page.addInitScript(() => {
    const models = Array.from({ length: 11 }, (_, index) => ({
      id: `openai/reasoner-${index + 1}`,
      name: `Reasoner ${index + 1}`,
      reasoning: { supported_efforts: ['low', 'medium', 'high'] },
    }));
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    localStorage.setItem('labcharts-openrouter-model', 'openai/reasoner-1');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());

  await expect(page.locator('#chat-model-menu-label')).toHaveText('Reasoner 1');
  await page.locator('#chat-model-menu-toggle').click();
  await expect(page.locator('#chat-model-search')).toBeVisible();
  await page.locator('#chat-model-search').fill('Reasoner 10');
  await expect(page.locator('.chat-model-option:not([hidden])')).toHaveCount(1);
  await page.locator('#chat-model-search').fill('');

  const slider = page.locator('#chat-model-effort');
  await slider.fill('3');
  await expect(page.locator('#chat-model-effort-value')).toHaveText('High');
  await expect.poll(() => page.evaluate(async () => {
    const prefs = await import('/js/chat-model-preferences.js');
    return prefs.getDirectChatReasoningEffort('openrouter', 'openai/reasoner-1');
  })).toBe('high');
  await expect(page.locator('#chat-model-menu-label')).toContainText('High');

  await page.locator('[data-chat-model-value="openai/reasoner-2"]').click();
  await expect(page.locator('#chat-model-menu')).not.toHaveAttribute('open', '');
  await expect(page.locator('#chat-model-menu-label')).toHaveText('Reasoner 2');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-openrouter-model'))).toBe('openai/reasoner-2');
});

test('CLI picker groups a large OpenCode catalog and shares its effort with Settings', async ({ page }) => {
  await page.addInitScript(() => {
    const models = [
      {
        id: 'openrouter/openai/gpt-5.6-sol', model: 'openrouter/openai/gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true,
        defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }, { reasoningEffort: 'high' }], inputModalities: ['text'],
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `anthropic/claude-model-${index + 1}`, model: `anthropic/claude-model-${index + 1}`, displayName: `Claude Model ${index + 1}`, isDefault: false,
        defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], inputModalities: ['text'],
      })),
    ];
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-agent-host-agent', 'opencode');
    localStorage.setItem('labcharts-agent-model-catalog-v1', JSON.stringify(models));
    localStorage.setItem('labcharts-agent-model-catalog-agent-v1', 'opencode');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-chat-backend', 'codex');
    const panelModule = await import('/js/chat-panel.js');
    await panelModule.loadChatPresentationStylesheets();
    const panel = document.getElementById('chat-panel');
    panel?.classList.add('open');
    panel?.removeAttribute('inert');
    const controls = await import('/js/chat-model-controls.js');
    controls.initChatModelControls();
  });

  await page.locator('#chat-model-menu-toggle').click();
  await expect(page.locator('.chat-model-option-group-label')).toContainText(['OpenRouter', 'Anthropic']);
  await expect(page.locator('#chat-model-search')).toBeVisible();
  await page.locator('#chat-model-effort').fill('3');
  await expect.poll(() => page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostEffort())).toBe('high');
  await expect(page.locator('#chat-model-menu-label')).toContainText('High');
});
