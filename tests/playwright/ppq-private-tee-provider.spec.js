import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?ppqPrivateTee=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('PPQ Private TEE toggle appears after cold-cache model fetch without provider switching', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async ({ apiUrl, controlsUrl, panelsUrl, renderersUrl }) => {
    const api = await import(apiUrl);
    const controls = await import(controlsUrl);
    const panels = await import(panelsUrl);
    const renderers = await import(renderersUrl);
    const cryptoStore = await import('/js/crypto.js');

    const storageKeys = [
      'labcharts-ppq-key',
      'labcharts-ppq-credit-id',
      'labcharts-ppq-model',
      'labcharts-ppq-models',
      'labcharts-ppq-private-models',
      'labcharts-ppq-private-mode',
      'labcharts-ppq-pricing',
      'labcharts-ppq-vision-models',
      'labcharts-ppq-private-vision-models',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldFetch = window.fetch;
    const oldKey = cryptoStore.getCachedKey('labcharts-ppq-key') || '';

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-ppq-key', '');
      await api.savePpqKey('sk-ppq-cold-cache');

      let balanceCalls = 0;
      window.fetch = async function(url) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'https://api.ppq.ai/v1/models?type=chat') {
          await new Promise(resolve => setTimeout(resolve, 50));
          return new Response(JSON.stringify({
            data: [
              { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' } },
              { id: 'private/glm-5-2', name: 'GLM 5.2 Private', pricing: { input_per_1M_tokens: '1', output_per_1M_tokens: '8' } },
              { id: 'private/kimi-k3', name: 'Kimi K3 Private', pricing: { input_per_1M_tokens: '4.22', output_per_1M_tokens: '21.1' } },
              { id: 'codex-not-used', name: 'Codex' },
            ],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (href === 'https://api.ppq.ai/credits/balance') {
          balanceCalls += 1;
          return new Response(JSON.stringify({ balance: '1.23' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return oldFetch.call(window, url);
      };

      document.getElementById('ai-provider-panel')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<section id="ai-provider-panel"></section>');
      const panel = document.getElementById('ai-provider-panel');
      panel.innerHTML = renderers.renderAIProviderPanel('ppq');

      const before = {
        hasToggle: !!document.getElementById('ppq-private-toggle'),
        privateCount: JSON.parse(localStorage.getItem('labcharts-ppq-private-models') || '[]').length,
      };

      panels.initSettingsPpqPanel();
      for (let i = 0; i < 80 && !document.getElementById('ppq-private-toggle'); i += 1) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      controls.togglePpqPrivateMode(true);
      for (let i = 0; i < 80 && !(document.getElementById('ppq-balance')?.textContent || '').includes('$1.23'); i += 1) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      return {
        before,
        after: {
          hasToggle: !!document.getElementById('ppq-private-toggle'),
          privateCount: JSON.parse(localStorage.getItem('labcharts-ppq-private-models') || '[]').length,
          privateModels: JSON.parse(localStorage.getItem('labcharts-ppq-private-models') || '[]').map(model => model.id),
          regularCount: JSON.parse(localStorage.getItem('labcharts-ppq-models') || '[]').length,
          privateMode: localStorage.getItem('labcharts-ppq-private-mode'),
          modelSelectValue: document.getElementById('ppq-model-select')?.value || '',
          modelOptions: Array.from(document.querySelectorAll('#ppq-model-select option')).map(option => option.value),
          indicatorText: document.getElementById('ppq-private-indicator')?.textContent || '',
          balanceText: document.getElementById('ppq-balance')?.textContent || '',
          balanceCalls,
        },
      };
    } finally {
      window.fetch = oldFetch;
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldKey || null);
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      document.getElementById('ai-provider-panel')?.remove();
    }
  }, {
    apiUrl: moduleUrl('/js/api.js'),
    controlsUrl: moduleUrl('/js/provider-model-controls.js'),
    panelsUrl: moduleUrl('/js/provider-ppq-panels.js'),
    renderersUrl: moduleUrl('/js/provider-panel-renderers.js'),
  });

  expect(result.before.hasToggle).toBe(false);
  expect(result.before.privateCount).toBe(0);
  expect(result.after.hasToggle).toBe(true);
  expect(result.after.privateCount).toBe(2);
  expect(result.after.privateModels).toContain('private/kimi-k3');
  expect(result.after.regularCount).toBe(1);
  expect(result.after.privateMode).toBe('on');
  expect(result.after.modelSelectValue).toMatch(/^private\//);
  expect(result.after.modelOptions).toContain('private/kimi-k3');
  expect(result.after.indicatorText).toContain('Prompts are encrypted in your browser');
  expect(result.after.balanceText).toContain('$1.23');
  expect(result.after.balanceCalls).toBeGreaterThanOrEqual(2);
});

test('PPQ cold-cache model fetch does not overwrite another active provider panel', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async ({ apiUrl, panelsUrl, renderersUrl }) => {
    const api = await import(apiUrl);
    const panels = await import(panelsUrl);
    const renderers = await import(renderersUrl);
    const cryptoStore = await import('/js/crypto.js');

    const storageKeys = [
      'labcharts-ppq-key',
      'labcharts-ppq-models',
      'labcharts-ppq-private-models',
      'labcharts-ppq-private-mode',
      'labcharts-ppq-pricing',
      'labcharts-ppq-vision-models',
      'labcharts-ppq-private-vision-models',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldFetch = window.fetch;
    const oldKey = cryptoStore.getCachedKey('labcharts-ppq-key') || '';

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-ppq-key', '');
      await api.savePpqKey('***');

      let releaseModels;
      const modelGate = new Promise(resolve => { releaseModels = resolve; });
      window.fetch = async function(url) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'https://api.ppq.ai/v1/models?type=chat') {
          await modelGate;
          return new Response(JSON.stringify({
            data: [
              { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
              { id: 'private/glm-5-2', name: 'GLM 5.2 Private' },
            ],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (href === 'https://api.ppq.ai/credits/balance') {
          return new Response(JSON.stringify({ balance: '1.23' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return oldFetch.call(window, url);
      };

      document.getElementById('ai-provider-panel')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<section id="ai-provider-panel"></section>');
      const panel = document.getElementById('ai-provider-panel');
      panel.innerHTML = renderers.renderAIProviderPanel('ppq');

      panels.initSettingsPpqPanel();
      panel.innerHTML = '<div id="openrouter-model-area">OpenRouter settings stay here</div>';
      releaseModels();
      await new Promise(resolve => setTimeout(resolve, 150));

      return {
        stillOpenRouter: !!document.getElementById('openrouter-model-area'),
        ppqLeaked: !!document.getElementById('ppq-model-area') || !!document.getElementById('ppq-private-toggle'),
        html: panel.innerHTML,
      };
    } finally {
      window.fetch = oldFetch;
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldKey || null);
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      document.getElementById('ai-provider-panel')?.remove();
    }
  }, {
    apiUrl: moduleUrl('/js/api.js'),
    panelsUrl: moduleUrl('/js/provider-ppq-panels.js'),
    renderersUrl: moduleUrl('/js/provider-panel-renderers.js'),
  });

  expect(result.stillOpenRouter).toBe(true);
  expect(result.ppqLeaked).toBe(false);
  expect(result.html).toContain('OpenRouter settings stay here');
});
