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
    const models = [
      {
        id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol',
        reasoning: { supported_efforts: ['low', 'medium', 'high'] },
      },
      {
        id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5',
        reasoning: { supported_efforts: ['low', 'medium', 'high'] },
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        id: `openai/reasoner-${index + 1}`,
        name: `Reasoner ${index + 1}`,
        reasoning: { supported_efforts: ['low', 'medium', 'high'] },
      })),
    ];
    localStorage.setItem('labcharts-ai-provider', 'openrouter');
    localStorage.setItem('labcharts-openrouter-model', 'openai/reasoner-1');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());

  await expect(page.locator('#chat-model-menu-label')).toHaveText('Reasoner 1');
  await page.locator('#chat-model-menu-toggle').click();
  await expect(page.locator('#chat-model-search')).toBeVisible();
  await expect(page.locator('.chat-model-option-group-label')).toHaveText(['Recommended', 'Other models']);
  await expect(page.locator('.chat-model-option').nth(0)).toContainText('GPT-5.6 Sol');
  await expect(page.locator('.chat-model-option').nth(1)).toContainText('Claude Sonnet 5');
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
  await expect(page.locator('.chat-model-option-group-label')).toHaveText(['Recommended', 'Anthropic']);
  await expect(page.locator('#chat-model-search')).toBeVisible();
  await page.locator('#chat-model-effort').fill('3');
  await expect.poll(() => page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostEffort())).toBe('high');
  await expect(page.locator('#chat-model-menu-label')).toContainText('High');
});

test('personal Hermes gateway highlights only its current profile model', async ({ page }) => {
  await page.addInitScript(() => {
    const models = [
      {
        id: 'openai-codex:gpt-5.6-sol', model: 'openai-codex:gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true,
        defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text'],
      },
      {
        id: 'openai-codex:gpt-5.6-terra', model: 'openai-codex:gpt-5.6-terra', displayName: 'GPT-5.6 Terra', isDefault: false,
        defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text'],
      },
      {
        id: 'ollama-cloud:qwen3', model: 'ollama-cloud:qwen3', displayName: 'Qwen 3', isDefault: false,
        defaultReasoningEffort: '', supportedReasoningEfforts: [], inputModalities: ['text'],
      },
    ];
    localStorage.setItem('labcharts-agent-host-agent', 'hermes');
    localStorage.setItem('labcharts-agent-host-target:hermes', 'gateway-home');
    localStorage.setItem('labcharts-agent-model-catalog-v1', JSON.stringify(models));
    localStorage.setItem('labcharts-agent-model-catalog-agent-v1', 'hermes');
    localStorage.setItem('labcharts-agent-model-catalog-target-v1', 'gateway-home');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-chat-backend', 'codex');
    await (await import('/js/chat-panel.js')).openChatPanel();
  });

  await page.locator('#chat-model-menu-toggle').click();
  await expect(page.locator('.chat-model-option-group-label')).toHaveText([
    'Current personal profile', 'OpenAI Codex', 'Ollama Cloud',
  ]);
  await expect(page.locator('.chat-model-option-group-label', { hasText: 'Recommended' })).toHaveCount(0);
  await expect(page.locator('[data-chat-model-value="openai-codex:gpt-5.6-sol"]')).toBeVisible();
  await expect(page.locator('[data-chat-model-value="openai-codex:gpt-5.6-terra"]')).toBeVisible();
});

test('CLI chat keeps dictation enabled through the independent voice service', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const crypto = await import('/js/crypto.js');
    crypto.updateKeyCache('labcharts-agent-host-token', 'test-token');
    const catalog = await import('/js/agent-model-catalog.js');
    catalog.cacheAgentModelCatalog([{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true,
      defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text', 'image'],
    }], 'codex');
    const settings = await import('/js/agent-chat-settings.js');
    await settings.saveAgentChatSettings({ agent: 'codex', model: '' });
    settings.setChatBackend('codex');
    await (await import('/js/chat-panel.js')).openChatPanel();
  });

  await expect(page.locator('#chat-voice-btn')).toBeEnabled();
  await page.locator('#chat-voice-btn').click();
  await expect(page.locator('[data-tab-panel="voice"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('[data-voice-model-kind="stt"]')).toContainText('Not downloaded yet');
});

test('an existing chat immediately shows the newly selected CLI default model', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const stateModule = await import('/js/state.js');
    stateModule.state.currentThreadId = 'existing-thread';
    stateModule.state.chatThreads = [{ id: 'existing-thread', agentModel: 'openrouter/muse-1.3' }];
    const crypto = await import('/js/crypto.js');
    crypto.updateKeyCache('labcharts-agent-host-token', 'test-token');
    const settings = await import('/js/agent-chat-settings.js');
    const catalog = await import('/js/agent-model-catalog.js');
    catalog.cacheAgentModelCatalog([{
      id: 'openrouter/muse-1.3', model: 'openrouter/muse-1.3', displayName: 'Muse 1.3', isDefault: true,
      defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text'],
    }], 'opencode');
    await settings.saveAgentChatSettings({ agent: 'opencode', model: '' });
    settings.setChatBackend('codex');
    await (await import('/js/chat-panel.js')).openChatPanel();
  });
  await expect(page.locator('.chat-header-model')).toHaveText('Muse 1.3');

  await page.evaluate(async () => {
    const catalog = await import('/js/agent-model-catalog.js');
    catalog.cacheAgentModelCatalog([{
      id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', isDefault: true,
      defaultReasoningEffort: 'medium', supportedReasoningEfforts: [], inputModalities: ['text'],
    }], 'codex');
    const settings = await import('/js/agent-chat-settings.js');
    await settings.saveAgentChatSettings({ agent: 'codex', model: '' });
  });
  await expect(page.locator('.chat-header-model')).toHaveText('GPT-5.6 Sol');
  await expect(page.locator('#chat-model-menu-label')).toHaveText('GPT-5.6 Sol');
});

test('direct provider and Local AI catalogs expose their reported reasoning controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'venice');
    localStorage.setItem('labcharts-venice-model', 'qwen-thinking');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{
      id: 'qwen-thinking', name: 'Qwen Thinking',
      model_spec: { capabilities: { supportsReasoning: true, supportsReasoningEffort: true } },
    }]));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
  await page.locator('#chat-model-menu-toggle').click();
  await expect(page.locator('#chat-model-effort')).toBeVisible();
  await expect(page.locator('#chat-model-effort')).toHaveAttribute('max', '3');
  await expect(page.locator('#chat-model-effort-value')).toHaveText('Default');
});
