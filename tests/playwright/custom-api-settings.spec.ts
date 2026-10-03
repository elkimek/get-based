import { expect, test } from './coverage-fixture.js';

test('custom API provider panel renders from Settings AI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    (await import('/js/settings.js')).openSettingsModal('ai');
  });

  const providerButtons = page.locator('.ai-provider-btn');
  await expect(providerButtons).toHaveCount(7);

  const providerValues = await providerButtons.evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.provider));
  expect(providerValues).toContain('custom');
  expect(providerValues).toContain('cli');
  expect(providerValues.indexOf('custom')).toBeLessThan(providerValues.indexOf('ollama'));

  await page.locator('.ai-provider-btn[data-provider="custom"]').dispatchEvent('click');

  await expect(page.locator('#custom-url-input')).toHaveCount(1);
  await expect(page.locator('#custom-key-input')).toHaveCount(1);
  await expect(page.locator('.ai-provider-panel .import-btn-primary')).toHaveCount(1);
  await expect(page.locator('.ai-provider-panel .ai-provider-desc')).toContainText('OpenAI-compatible');
});

test('lazy provider render follows a provider switch made while loading', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const bridge = await import('/js/settings-provider-bridge.js');
    api.setAIProvider('openrouter');
    const panel = document.createElement('div');
    panel!.id = 'ai-provider-panel';
    panel!.innerHTML = bridge.renderAIProviderPanelBridge();
    document.body.appendChild(panel);
    api.setAIProvider('custom');
  });

  await expect(page.locator('#custom-url-input')).toHaveCount(1);
  await expect(page.locator('#openrouter-key-input')).toHaveCount(0);
});

test('custom API connected state renders model controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const cryptoStore = await import('/js/crypto.js');
    const settings = await import('/js/settings.js');
    api.setCustomApiUrl('https://api.test.com/v1');
    cryptoStore.updateKeyCache('labcharts-custom-key', 'sk-test');
    api.setCustomApiModel('test-model');
    localStorage.setItem('labcharts-custom-models', JSON.stringify([
      { id: 'test-model', name: 'Test Model' },
      { id: 'other-model', name: 'Other Model' },
    ]));
    api.setAIProvider('custom');
    settings.openSettingsModal('ai');
  });
  await page.locator('.ai-provider-btn[data-provider="custom"]').dispatchEvent('click');

  await expect(page.locator('#custom-key-status')).toContainText('Connected');
  await expect(page.locator('#custom-model-select')).toHaveCount(1);
  await expect(page.locator('#custom-model-select')).toHaveValue('test-model');
  expect(await page.locator('#custom-model-select').evaluate((select) => (select as HTMLSelectElement).options.length)).toBe(2);
  await expect(page.locator('#custom-manual-model')).toHaveCount(1);
  await expect(page.locator('[data-provider-panel-action="remove-custom-api"]')).toHaveCount(1);
});

test('custom API provider delegates save model changes and removal', async ({ page }) => {
  const expectedOutcomeKeys = [
    'initialCustomPanelUsesDelegatedControls',
    'saveDelegatedActionPersistsAndLoadsModels',
    'modelDropdownChangePersistsSelection',
    'manualModelEnterPersistsAndNotifies',
    'removeDelegatedActionClearsConnectionAndRerenders',
  ];

  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const crypto = await import('/js/crypto.js');
    const providerPanels = await import('/js/provider-panels.js');
    const settings = await import('/js/settings.js');
    const outcomes: Record<string,unknown> = {};
    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-custom-url',
      'labcharts-custom-key',
      'labcharts-custom-model',
      'labcharts-custom-models',
    ];
    const savedStorage = Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)] as const));
    const savedSessionLock = sessionStorage.getItem('labcharts-ai-settings-local-lock-until');
    const savedFetch = window.fetch;
    const savedCustomKey = api.getCustomApiKey();
    const fetchCalls: {url:string;requestedUrl:unknown}[] = [];
    const baseUrl = 'http://127.0.0.1:9999/v1';
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate:()=>unknown, label:string) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const jsonResponse = (body:unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const restoreStorage = (key:string, value:string|null|undefined) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    const restoreCustomKey = async () => {
      if (savedCustomKey) {
        await crypto.encryptedSetItem('labcharts-custom-key', savedCustomKey);
        crypto.updateKeyCache('labcharts-custom-key', savedCustomKey);
      } else if (savedStorage['labcharts-custom-key'] != null) {
        localStorage.setItem('labcharts-custom-key', savedStorage['labcharts-custom-key']);
        crypto.updateKeyCache('labcharts-custom-key', '');
      } else {
        localStorage.removeItem('labcharts-custom-key');
        crypto.updateKeyCache('labcharts-custom-key', '');
      }
    };

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      crypto.updateKeyCache('labcharts-custom-key', '');
      window.fetch = async (url, options = {}) => {
        const urlText = String(url);
        let proxiedUrl: unknown = '';
        try {
          const body = typeof options.body === 'string' ? JSON.parse(options.body) as unknown as {url?:unknown}|null : null;
          proxiedUrl = body?.url || '';
        } catch {}
        const requestedUrl = proxiedUrl || urlText;
        fetchCalls.push({ url: urlText, requestedUrl });
        if (requestedUrl === `${baseUrl}/models`) {
          return jsonResponse({
            data: [
              { id: 'beta-model', name: 'Beta Model' },
              { id: 'alpha-model', name: 'Alpha Model' },
            ],
          });
        }
        if (requestedUrl === `${baseUrl}/chat/completions`) {
          return jsonResponse({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          });
        }
        return savedFetch.call(window, url, options);
      };

      settings.openSettingsModal('ai');
      await waitFor(() => document.getElementById('ai-provider-panel'), 'settings AI panel');
      providerPanels.switchAIProvider('custom');
      await waitFor(() =>
        (document.getElementById('custom-url-input') as HTMLInputElement | null) && (document.getElementById('custom-key-input') as HTMLInputElement | null),
        'custom API panel controls'
      );
      const panel = document.getElementById('ai-provider-panel');
      outcomes.initialCustomPanelUsesDelegatedControls =
        !!panel
        && panel!.querySelector<HTMLElement>('[data-provider-panel-action="save-custom-api"]') instanceof HTMLButtonElement
        && panel!.querySelector<HTMLElement>('[data-provider-panel-action="remove-custom-api"]') === null
        && (document.getElementById('custom-url-input') as HTMLInputElement | null) instanceof HTMLInputElement
        && (document.getElementById('custom-key-input') as HTMLInputElement | null) instanceof HTMLInputElement;

      (document.getElementById('custom-url-input') as HTMLInputElement | null)!.value = ` ${baseUrl}/ `;
      (document.getElementById('custom-key-input') as HTMLInputElement | null)!.value = ' sk-custom ';
      panel!.querySelector<HTMLElement>('[data-provider-panel-action="save-custom-api"]')!.click();
      await waitFor(() =>
        document.getElementById('custom-key-status')?.textContent.includes('Connected')
          && (document.getElementById('custom-model-select') as HTMLSelectElement | null),
        'custom API save and model dropdown'
      );
      const cachedModels = JSON.parse(localStorage.getItem('labcharts-custom-models') || '[]') as unknown as {id?:unknown}[];
      outcomes.saveDelegatedActionPersistsAndLoadsModels =
        localStorage.getItem('labcharts-custom-url') === baseUrl
        && api.getCustomApiKey() === 'sk-custom'
        && cachedModels.map(model => model.id).join('|') === 'alpha-model|beta-model'
        && localStorage.getItem('labcharts-custom-model') === 'alpha-model'
        && (document.getElementById('custom-model-select') as HTMLSelectElement | null)?.value === 'alpha-model'
        && fetchCalls.some(call => call.requestedUrl === `${baseUrl}/models`)
        && fetchCalls.some(call => call.requestedUrl === `${baseUrl}/chat/completions`);

      const modelSelect = (document.getElementById('custom-model-select') as HTMLSelectElement | null);
      modelSelect!.value = 'beta-model';
      modelSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() =>
        localStorage.getItem('labcharts-custom-model') === 'beta-model'
          && document.getElementById('custom-model-pricing')?.textContent.trim() === '',
        'custom API model dropdown change'
      );
      outcomes.modelDropdownChangePersistsSelection = true;

      const manualModel = (document.getElementById('custom-manual-model') as HTMLInputElement | null);
      manualModel!.value = 'gamma-model';
      manualModel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor(() =>
        localStorage.getItem('labcharts-custom-model') === 'gamma-model'
          && [...document.querySelectorAll('.notification-toast')]
            .some(toast => toast.textContent.includes('Model set to gamma-model')),
        'custom API manual model notification'
      );
      outcomes.manualModelEnterPersistsAndNotifies = true;

      document.querySelector<HTMLElement>('[data-provider-panel-action="remove-custom-api"]')!.click();
      await waitFor(() =>
        document.getElementById('custom-key-status')?.textContent.includes('Not connected')
          && !(document.getElementById('custom-model-select') as HTMLSelectElement | null),
        'custom API removal panel render'
      );
      await waitFor(() => api.getCustomApiKey() === '', 'custom API key cache clear');
      outcomes.removeDelegatedActionClearsConnectionAndRerenders =
        localStorage.getItem('labcharts-custom-url') === null
        && localStorage.getItem('labcharts-custom-model') === null
        && localStorage.getItem('labcharts-custom-models') === null
        && api.getCustomApiKey() === ''
        && document.getElementById('custom-key-status')?.textContent.includes('Not connected')
        && document.getElementById('custom-model-area') === null;
    } finally {
      window.fetch = savedFetch;
      for (const key of storageKeys) {
        if (key !== 'labcharts-custom-key') restoreStorage(key, savedStorage[key]);
      }
      await restoreCustomKey();
      if (savedSessionLock == null) sessionStorage.removeItem('labcharts-ai-settings-local-lock-until');
      else sessionStorage.setItem('labcharts-ai-settings-local-lock-until', savedSessionLock);
      settings.closeSettingsModal();
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
    }

    return outcomes;
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});
