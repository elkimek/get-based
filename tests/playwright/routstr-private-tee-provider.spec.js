import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?routstrPrivateTee=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('Routstr Private TEE support appears after discovery and toggles through the live panel', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async ({ panelsUrl, renderersUrl, settlementUrl, walletRenderersUrl }) => {
    const panels = await import(panelsUrl);
    const renderers = await import(renderersUrl);
    const settlement = await import(settlementUrl);
    const walletRenderers = await import(walletRenderersUrl);
    const cryptoStore = await import('/js/crypto.js');
    const storageKeys = [
      'labcharts-routstr-key',
      'labcharts-routstr-node',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-routstr-private-models',
      'labcharts-routstr-model-regular',
      'labcharts-routstr-model-private',
      'labcharts-routstr-pricing',
      'labcharts-routstr-vision-models',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldFetch = window.fetch;
    const oldKey = cryptoStore.getCachedKey('labcharts-routstr-key') || '';

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      localStorage.setItem('labcharts-routstr-key', 'sk-routstr-private-test');
      localStorage.setItem('labcharts-routstr-node', 'https://routstr-private.example');
      cryptoStore.updateKeyCache('labcharts-routstr-key', 'sk-routstr-private-test');
      window.fetch = async function(input) {
        const href = typeof input === 'string' ? input : input?.url || '';
        if (href === 'https://routstr-private.example/v1/models') {
          return new Response(JSON.stringify({
            data: [
              { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', enabled: true },
              { id: 'tinfoil-gemma4-31b', name: 'Gemma 4 31B Private', enabled: true },
              { id: 'tinfoil-kimi-k2-6', name: 'Kimi K2.6 Private', enabled: true },
              { id: 'tinfoil-glm-5-2', name: 'GLM 5.2 Private', enabled: true },
            ],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (href === 'https://routstr-private.example/v1/balance/info') {
          return new Response(JSON.stringify({ balance: 104000 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return oldFetch.call(window, input);
      };

      document.getElementById('ai-provider-panel')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<section id="ai-provider-panel"></section>');
      const panel = document.getElementById('ai-provider-panel');
      panel.innerHTML = renderers.renderAIProviderPanel('routstr');
      const beforeHidden = document.getElementById('routstr-private-controls')?.style.display === 'none';

      panels.initSettingsModelFetch();
      for (let i = 0; i < 80 && document.getElementById('routstr-private-controls')?.style.display === 'none'; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const toggle = document.getElementById('routstr-private-toggle');
      toggle.click();
      await new Promise(resolve => setTimeout(resolve, 25));

      const badgeHost = document.createElement('div');
      badgeHost.innerHTML = walletRenderers.routstrNodePickerRowHtml({
        urls: ['https://routstr-private.example'],
        name: 'Privacy Maxi',
        modelCount: 3,
        models: [{ id: 'tinfoil-glm-5-2' }],
      });
      settlement.notifyRoutstrRequestSettled({ failed: true, modelId: 'tinfoil-glm-5-2' });
      const reservationText = document.getElementById('routstr-node-balance')?.textContent || '';
      await new Promise(resolve => setTimeout(resolve, 700));
      const settledBalanceText = document.getElementById('routstr-node-balance')?.textContent || '';
      settlement.clearRoutstrBalanceSettlementTimers();

      return {
        beforeHidden,
        controlsVisible: document.getElementById('routstr-private-controls')?.style.display === '',
        toggleChecked: toggle.checked,
        selectedModel: localStorage.getItem('labcharts-routstr-model'),
        privateModels: JSON.parse(localStorage.getItem('labcharts-routstr-private-models') || '[]').map(model => model.id),
        regularModels: JSON.parse(localStorage.getItem('labcharts-routstr-models') || '[]').map(model => model.id),
        modelOptions: Array.from(document.querySelectorAll('#routstr-model-select option')).map(option => option.value),
        recommendedOptions: Array.from(document.querySelectorAll('#routstr-model-select optgroup[label="Recommended"] option')).map(option => option.value),
        otherOptions: Array.from(document.querySelectorAll('#routstr-model-select optgroup[label="Other models"] option')).map(option => option.value),
        indicatorText: document.getElementById('routstr-private-indicator')?.textContent || '',
        balanceText: document.getElementById('routstr-node-balance')?.textContent || '',
        nodeBadgeText: badgeHost.textContent || '',
        reservationText,
        settledBalanceText,
      };
    } finally {
      window.fetch = oldFetch;
      cryptoStore.updateKeyCache('labcharts-routstr-key', oldKey || null);
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      document.getElementById('ai-provider-panel')?.remove();
    }
  }, {
    panelsUrl: moduleUrl('/js/provider-panels.js'),
    renderersUrl: moduleUrl('/js/provider-panel-renderers.js'),
    settlementUrl: moduleUrl('/js/routstr-balance-settlement.js'),
    walletRenderersUrl: moduleUrl('/js/provider-wallet-panel-renderers.js'),
  });

  expect(result.beforeHidden).toBe(true);
  expect(result.controlsVisible).toBe(true);
  expect(result.toggleChecked).toBe(true);
  expect(result.selectedModel).toBe('tinfoil-gemma4-31b');
  expect(result.privateModels).toEqual(['tinfoil-gemma4-31b', 'tinfoil-glm-5-2', 'tinfoil-kimi-k2-6']);
  expect(result.regularModels).toEqual(['claude-sonnet-4.6']);
  expect(result.modelOptions).toEqual(['tinfoil-gemma4-31b', 'tinfoil-kimi-k2-6', 'tinfoil-glm-5-2']);
  expect(result.recommendedOptions).toEqual(['tinfoil-gemma4-31b', 'tinfoil-kimi-k2-6']);
  expect(result.otherOptions).toEqual(['tinfoil-glm-5-2']);
  expect(result.indicatorText).toContain('decrypted only inside a verified Tinfoil TEE');
  expect(result.indicatorText).toContain('session, selected model, and billing metadata');
  expect(result.balanceText).toContain('104 sats');
  expect(result.nodeBadgeText).toContain('Private TEE');
  expect(result.reservationText).toContain('releasing temporary reservation');
  expect(result.settledBalanceText).toContain('104 sats');
});
