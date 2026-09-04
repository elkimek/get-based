import { expect, test } from './coverage-fixture.js';

test('OpenRouter provider controls render from Settings AI', async ({ page }) => {
  await page.route('**/api/local-agents*', route => route.fulfill({
    status: 404, contentType: 'application/json', body: '{"error":"not_found"}',
  }));
  await page.route(/^http:\/\/127\.0\.0\.1:83(?:2[4-9]|3[01])\/v1\/discovery$/, route => route.fulfill({
    status: 404, contentType: 'application/json', body: '{"error":"not_found"}',
  }));
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
  await expect(providerButtons).toHaveCount(7);
  const providerSection = page.locator('#ai-provider-advanced-section');
  await expect(providerSection).toBeVisible();
  await expect(providerSection).toContainText('Choose how getbased runs AI');
  await expect(providerSection.locator('summary')).toHaveCount(0);
  expect(await providerSection.evaluate(section => section.tagName)).toBe('DIV');

  const providerValues = await providerButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.provider));
  expect(providerValues).toContain('ppq');
  expect(providerValues).toContain('routstr');
  expect(providerValues).toContain('venice');
  expect(providerValues).toContain('ollama');
  expect(providerValues).toContain('openrouter');
  expect(providerValues).toContain('cli');
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

  await page.locator('.ai-provider-btn[data-provider="cli"]').click();
  const installCard = page.locator('.local-agent-install-card');
  await expect(installCard).toBeVisible();
  await expect(installCard).toContainText('Connect your installed CLI agents');
  await expect(installCard).toContainText('Nothing is installed automatically');
  await expect(installCard.locator('[data-settings-action="copy-cli-companion-run"]')).toBeVisible();
});

test('CLI provider discovers branded agents and keeps model controls stable across settings refreshes', async ({ page }) => {
  const endpoint = 'http://127.0.0.1:8324';
  const token = 'playwright-companion-token-1234';
  const agents = [
    ['codex', 'Codex CLI', 'OpenAI official CLI'],
    ['claude', 'Claude Code', 'Anthropic official CLI'],
    ['opencode', 'OpenCode', 'Open-source multi-model agent CLI'],
    ['hermes', 'Hermes Agent', 'Nous Research agent CLI'],
    ['grok', 'Grok Build', 'xAI coding CLI'],
  ].map(([id, name, description]) => ({
    id, name, description, version: 'test', status: 'available', compatible: true,
    endpoint, token, runtimeMode: 'temporary', companionVersion: '1.1.0',
  }));
  const models = [
    ...Array.from({ length: 14 }, (_, index) => ({
      id: `openrouter/test/model-${index + 1}`,
      model: `openrouter/test/model-${index + 1}`,
      displayName: `OpenRouter / Model ${index + 1}`,
      isDefault: index === 0,
      defaultReasoningEffort: 'high',
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'Low' },
        { reasoningEffort: 'xhigh', description: 'Extra high' },
      ],
      inputModalities: ['text', 'image'],
    })),
    {
      id: 'opencode/big-pickle', model: 'opencode/big-pickle', displayName: 'OpenCode / Big Pickle',
      isDefault: false, defaultReasoningEffort: '', supportedReasoningEfforts: [], inputModalities: ['text'],
    },
  ];
  const codexModels = [{
    id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true,
    defaultReasoningEffort: 'low', inputModalities: ['text', 'image'],
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Low' },
      { reasoningEffort: 'medium', description: 'Medium' },
    ],
  }];

  await page.route('**/api/local-agents*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ agents }),
  }));
  await page.route(`${endpoint}/v1/status`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, service: 'getbased-agent-host', protocolVersion: 4,
      capabilities: ['chat-stream', 'dynamic-tools', 'structured-health-tools', 'model-catalog',
        'reasoning-catalog', 'image-upload', 'structured-output', 'companion-control'],
      state: 'running', paused: false, runtimeMode: 'temporary', companionVersion: '1.1.0',
    }),
  }));
  await page.route(`${endpoint}/v1/models**`, route => {
    const agent = new URL(route.request().url()).searchParams.get('agent');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: agent === 'codex' ? codexModels : models }),
    });
  });
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
    localStorage.setItem('labcharts-chat-backend', 'codex');
    localStorage.setItem('labcharts-agent-host-agent', 'opencode');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    await (await import('/js/settings-loader.js')).openSettingsModal('ai');
  });
  await page.locator('.ai-provider-btn[data-provider="cli"]').click();

  const rows = page.locator('.local-agent-row');
  await expect(rows).toHaveCount(5);
  await expect(rows).toContainText(['Codex CLI', 'Claude Code', 'OpenCode', 'Hermes Agent', 'Grok Build']);
  const iconsLoaded = await page.locator('.local-agent-icon img').evaluateAll(images => images.map(image => ({
    complete: image.complete, naturalWidth: image.naturalWidth,
  })));
  expect(iconsLoaded).toHaveLength(5);
  expect(iconsLoaded.every(icon => icon.complete && icon.naturalWidth > 0)).toBe(true);

  const options = page.locator('#cli-agent-options');
  await expect(options).toBeVisible();
  await expect(options.locator('#cli-agent-provider-summary')).toContainText('OpenRouter');
  await expect(options.locator('#cli-agent-model-summary')).toContainText('Model 1');

  await options.locator('#cli-agent-model-summary').click();
  const modelSearch = options.locator('[data-cli-agent-model-search]');
  await expect(modelSearch).toBeVisible();
  await modelSearch.fill('model 14');
  await expect(options.locator('#cli-agent-model-result-count')).toHaveText('1 model');
  await options.locator('[data-settings-action="set-cli-agent-model"][data-value="openrouter/test/model-14"]').click();
  await expect(options.locator('#cli-agent-model-summary')).toContainText('Model 14');
  const effortPicker = options.locator('#cli-agent-effort-summary').locator('..');
  await options.locator('#cli-agent-effort-summary').click();
  await expect(effortPicker).toHaveAttribute('open', '');
  await options.locator('[data-settings-action="set-cli-agent-effort"][data-value="xhigh"]').click();
  await expect(options.locator('#cli-agent-effort-summary')).toContainText('xhigh');

  await page.evaluate(async () => {
    const settings = await import('/js/settings-loader.js');
    settings.closeSettingsModal();
    await settings.openSettingsModal('ai');
  });
  await page.locator('.ai-provider-btn[data-provider="cli"]').click();
  await expect(page.locator('#cli-agent-model-summary')).toContainText('Model 14');
  await expect(page.locator('#cli-agent-effort-summary')).toContainText('xhigh');
  await expect(page.locator('.local-agent-companion-section')).toContainText('Connected for this terminal session');

  await page.locator('label.local-agent-toggle:has(input[data-agent="codex"])').click();
  await expect(page.locator('#cli-agent-model-summary')).toContainText('GPT-5.6-Sol');
  await page.locator('#cli-agent-model-summary').click();
  await page.locator('[data-settings-action="set-cli-agent-model"][data-value="gpt-5.6-sol"]').click();
  await page.locator('#cli-agent-effort-summary').click();
  await page.locator('[data-settings-action="set-cli-agent-effort"][data-value="medium"]').click();
  await expect(page.locator('#cli-agent-effort-summary')).toContainText('medium');

  await page.locator('label.local-agent-toggle:has(input[data-agent="opencode"])').click();
  await expect(page.locator('#cli-agent-model-summary')).toContainText('Model 14');
  await expect(page.locator('#cli-agent-effort-summary')).toContainText('xhigh');

  await page.locator('label.local-agent-toggle:has(input[data-agent="codex"])').click();
  await expect(page.locator('#cli-agent-model-summary')).toContainText('GPT-5.6-Sol');
  await expect(page.locator('#cli-agent-effort-summary')).toContainText('medium');
});
