import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path:string) => `${path}?providerCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('provider panel renderers cover Venice and Local AI markup branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ renderersUrl }) => {
    const renderers = (await import(renderersUrl) as unknown) as Pick<typeof import('../../js/provider-panel-renderers.js'),"renderAIProviderPanel">;
    const crypto = await import('/js/crypto.js');
    const storageKeys = [
      'labcharts-venice-key',
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-e2ee',
      'labcharts-venice-e2ee-models',
      'labcharts-ollama',
    ];
    const oldStorage:Record<string,string|null|undefined> = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldCache = {
      veniceKey: crypto.getCachedKey('labcharts-venice-key'),
      ollama: crypto.getCachedKey('labcharts-ollama'),
    };
    const fixture = document.createElement('section');
    fixture.id = 'provider-renderer-fixture';

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      localStorage.setItem('labcharts-venice-key', 'venice-test-key');
      localStorage.setItem('labcharts-venice-model', 'e2ee-model');
      localStorage.setItem('labcharts-venice-e2ee', 'on');
      localStorage.setItem('labcharts-venice-models', JSON.stringify([
        { id: 'regular-model', name: 'Regular <Model>' },
      ]));
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([
        { id: 'e2ee-model', name: 'Secure <Model>' },
      ]));
      crypto.updateKeyCache('labcharts-venice-key', 'venice-test-key');

      fixture.innerHTML = renderers.renderAIProviderPanel('venice');
      document.body.appendChild(fixture);
      const veniceSelect = fixture.querySelector<HTMLSelectElement>('#venice-model-select');
      const veniceE2EERenders = fixture.querySelector<HTMLElement>('#venice-key-status')?.textContent.includes('Connected')
        && fixture.querySelector<HTMLInputElement>('#venice-key-input')?.value === 'venice-test-key'
        && veniceSelect?.value === 'e2ee-model'
        && fixture.querySelector<HTMLInputElement>('#venice-e2ee-toggle')?.checked === true
        && fixture.querySelector<HTMLElement>('#venice-e2ee-indicator')?.style.display === ''
        && fixture.querySelector<HTMLOptionElement>('#venice-model-select option[value="e2ee-model"]')?.textContent === 'Secure <Model>'
        && !!fixture.querySelector<HTMLElement>('[data-provider-panel-action="remove-venice-key"]');

      localStorage.setItem('labcharts-venice-e2ee', 'on');
      localStorage.setItem('labcharts-venice-model', 'regular-model');
      localStorage.setItem('labcharts-venice-e2ee-models', '[]');
      fixture.innerHTML = renderers.renderAIProviderPanel('venice');
      const veniceMissingE2EEDisables = !fixture.querySelector<HTMLInputElement>('#venice-e2ee-toggle')
        && fixture.querySelector<HTMLSelectElement>('#venice-model-select')?.value === 'regular-model';

      const ollamaConfig = JSON.stringify({
        url: 'https://local.example/v1',
        model: 'gemma3-local',
        mode: 'openai-compatible',
        apiKey: 'local-secret',
      });
      localStorage.setItem('labcharts-ollama', ollamaConfig);
      crypto.updateKeyCache('labcharts-ollama', ollamaConfig);
      // Local AI has no named provider case, so it is rendered through the default fallback.
      fixture.innerHTML = renderers.renderAIProviderPanel('unknown-provider');
      const localAIRenders = fixture.querySelector<HTMLInputElement>('#local-ai-url-input')?.value === 'https://local.example'
        && fixture.querySelector<HTMLInputElement>('#local-ai-apikey-input')?.value === 'local-secret'
        && fixture.querySelector<HTMLElement>('#local-ai-status-text')?.textContent === 'Checking connection...'
        && fixture.querySelector<HTMLElement>('[data-provider-panel-action="test-ollama-connection"]')?.textContent === 'Test'
        && fixture.querySelector<HTMLSelectElement>('#local-ai-model-select')?.dataset.providerPanelChange === 'local-ai-model'
        && fixture.textContent.includes('/v1/chat/completions');

      return {
        veniceE2EERenders,
        veniceMissingE2EEDisables,
        localAIRenders,
      };
    } finally {
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      if (oldCache.veniceKey == null) crypto.updateKeyCache('labcharts-venice-key', null);
      else crypto.updateKeyCache('labcharts-venice-key', oldCache.veniceKey);
      if (oldCache.ollama == null) crypto.updateKeyCache('labcharts-ollama', null);
      else crypto.updateKeyCache('labcharts-ollama', oldCache.ollama);
      fixture.remove();
    }
  }, { renderersUrl: moduleUrl('/js/provider-panel-renderers.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('provider model controls cover dropdowns custom models and delegates', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ controlsUrl }) => {
    const controls = (await import(controlsUrl) as unknown) as Pick<typeof import('../../js/provider-model-controls.js'),"renderOpenRouterModelDropdown"|"applyCustomOpenRouterModel"|"onOpenRouterDropdownChange"|"renderVeniceModelDropdown"|"toggleVeniceE2EE"|"renderRoutstrModelDropdown"|"renderPpqModelDropdown"|"updatePpqModelPricing"|"renderCustomApiModelDropdown"|"applyCustomApiManualModel">;
    const runtime = await import('/js/provider-model-controls-runtime.js');
    const chatRuntime = await import('/js/chat-runtime.js');
    const delegates = await import('/js/provider-panel-delegates.js');
    const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body:unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    const storageKeys = [
      'labcharts-openrouter-model',
      'labcharts-openrouter-pricing',
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-e2ee',
      'labcharts-venice-e2ee-models',
      'labcharts-venice-model-regular',
      'labcharts-venice-model-e2ee',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-routstr-pricing',
      'labcharts-ppq-model',
      'labcharts-ppq-models',
      'labcharts-ppq-pricing',
      'labcharts-custom-model',
      'labcharts-custom-models',
    ];
    const oldStorage:Record<string,string|null|undefined> = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      fetch: window.fetch,
      consoleWarn: console.warn,
    };
    let previousRuntimeDeps:ReturnType<typeof runtime.configureProviderModelControlsRuntimeDeps>|null = null;
    let previousChatRuntime:ReturnType<typeof chatRuntime.configureChatRuntimeCallbacks>|null = null;

    let clearCount = 0;
    let headerRefreshes = 0;
    let searchRefreshes = 0;
    const warnings:string[] = [];

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      document.body.insertAdjacentHTML('beforeend', `
        <section id="ai-provider-panel">
          <div id="openrouter-model-area"></div>
          <div id="venice-model-area"></div>
          <div id="venice-e2ee-indicator" style="display:none"></div>
          <div id="routstr-model-area"></div>
          <div id="ppq-model-area"></div>
          <div id="custom-model-area"></div>
        </section>
      `);

      previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
        updateChatHeaderModel: () => { headerRefreshes += 1; },
        refreshWebSearchToggle: () => { searchRefreshes += 1; },
      });
      console.warn = message => { warnings.push(String(message)); };

      localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
        'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      }));
      localStorage.setItem('labcharts-openrouter-model', 'anthropic/claude-sonnet-4.6');
      controls.renderOpenRouterModelDropdown([
        { id: 'anthropic/claude-fable-5.1', name: 'Claude Fable 5.1' },
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
        { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
        { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash' },
        { id: 'z-ai/glm-5.3', name: 'GLM 5.3' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
        { id: 'x-ai/grok-4', name: 'Grok 4' },
        { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B' },
      ]);
      const openRouterRecommendedGroup = document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Recommended"]');
      const openRouterRecommended = !!openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="anthropic/claude-fable-5.1"]')
        && !!openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="anthropic/claude-sonnet-5"]')
        && !!openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.8-flash"]')
        && !!openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.3-flash"]')
        && !!openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k3"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="anthropic/claude-sonnet-4.6"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.7-flash"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.1-pro"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.3"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.2"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.7-code"]')
        && !openRouterRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="anthropic/claude-sonnet-4.6"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="google/gemini-3.7-flash"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="google/gemini-3.1-pro"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.3"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.2"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector<HTMLElement>('#openrouter-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      const openRouterQwenAvailable = !!document.querySelector<HTMLElement>(
        '#openrouter-model-select optgroup[label="Other models"] option[value="qwen/qwen3.8-27b"]'
      );
      const openRouterPricing = ((document.getElementById('openrouter-model-pricing') as HTMLElement|null)?.textContent || '').includes('$3.00/M in');

      let fetchedPricing = false;
      previousRuntimeDeps = runtime.configureProviderModelControlsRuntimeDeps({
        callClaudeAPI: async () => ({ content: 'ok' }),
        clearE2EESession: () => { clearCount += 1; },
      });
      window.fetch = async function(url:Parameters<typeof fetch>[0]) {
        const href = typeof url === 'string' ? url : (url as {url?:string})?.url || '';
        if (href === 'https://openrouter.ai/api/v1/models') {
          fetchedPricing = true;
          return jsonResponse({
            data: [{
              id: 'custom/model',
              name: 'Custom Model',
              pricing: { prompt: '0.00000125', completion: '0.0000025' },
            }],
          });
        }
        return oldGlobals.fetch.call(window, url);
      };
      await controls.applyCustomOpenRouterModel('custom/model');
      const customOpt = document.querySelector<HTMLOptionElement>('#openrouter-model-select option[value="__custom"]');
      const openRouterCustomApplied = customOpt?.selected === true
        && localStorage.getItem('labcharts-openrouter-model') === 'custom/model'
        && (document.getElementById('openrouter-model-health') as HTMLElement|null)?.title === 'Model responding'
        && ((document.getElementById('openrouter-model-pricing') as HTMLElement|null)?.textContent || '').includes('$1.25/M in')
        && fetchedPricing;

      runtime.configureProviderModelControlsRuntimeDeps({
        callClaudeAPI: async () => { throw new Error('offline model'); },
      });
      await controls.applyCustomOpenRouterModel('bad/model');
      const openRouterCustomFailure = (document.getElementById('openrouter-model-health') as HTMLElement|null)?.title === 'offline model'
        && (document.getElementById('openrouter-custom-model') as HTMLInputElement|null)?.style.borderColor === 'var(--red)';

      controls.onOpenRouterDropdownChange('anthropic/claude-sonnet-4.6');
      const openRouterDropdownReset = !document.querySelector<HTMLOptionElement>('#openrouter-model-select option[value="__custom"]')
        && (document.getElementById('openrouter-custom-model') as HTMLInputElement|null)?.value === ''
        && (document.getElementById('openrouter-model-health') as HTMLElement|null)?.textContent === '';

      localStorage.setItem('labcharts-venice-model', 'regular-a');
      localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'regular-a', name: 'Regular A' }]));
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-secure', name: 'Secure E2EE' }]));
      controls.renderVeniceModelDropdown([
        { id: 'regular-a', name: 'Regular A' },
        { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' },
        { id: 'gemini-3-7-flash', name: 'Gemini 3.7 Flash' },
        { id: 'gemini-3-8-flash', name: 'Gemini 3.8 Flash' },
      ]);
      const veniceLatestGeminiRecommended = !!document.querySelector<HTMLElement>(
        '#venice-model-select optgroup[label="Recommended"] option[value="claude-fable-5-1"]'
      )
        && !!document.querySelector<HTMLElement>('#venice-model-select optgroup[label="Recommended"] option[value="gemini-3-8-flash"]')
        && !document.querySelector<HTMLElement>('#venice-model-select optgroup[label="Recommended"] option[value="gemini-3-7-flash"]')
        && !!document.querySelector<HTMLElement>('#venice-model-select optgroup[label="Other models"] option[value="gemini-3-7-flash"]');
      controls.toggleVeniceE2EE(true);
      const veniceE2EEEnabled = localStorage.getItem('labcharts-venice-e2ee') === 'on'
        && localStorage.getItem('labcharts-venice-model') === 'e2ee-secure'
        && (document.getElementById('venice-e2ee-indicator') as HTMLElement|null)?.style.display === ''
        && headerRefreshes >= 1
        && searchRefreshes >= 1;
      controls.toggleVeniceE2EE(false);
      const veniceE2EERestored = localStorage.getItem('labcharts-venice-e2ee') === 'off'
        && localStorage.getItem('labcharts-venice-model') === 'regular-a'
        && clearCount >= 1;

      localStorage.setItem('labcharts-routstr-model', 'missing-model');
      controls.renderRoutstrModelDropdown([
        { id: 'routstr-a', name: 'Routstr A' },
        { id: 'routstr-b', name: 'Routstr B' },
      ]);
      const routstrFallback = localStorage.getItem('labcharts-routstr-model') === 'routstr-a'
        && (document.getElementById('routstr-model-select') as HTMLSelectElement|null)?.value === 'routstr-a';
      controls.renderRoutstrModelDropdown([
        { id: 'anthropic/claude-fable-5.1', name: 'Claude Fable 5.1' },
        { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
        { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'grok-41-fast', name: 'Grok 4.1 Fast' },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3' },
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash' },
        { id: 'glm-5.3', name: 'GLM 5.3' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
      ]);
      const routstrRecommendedGroup = document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Recommended"]');
      const routstrLatestGrokRecommended = !!routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="anthropic/claude-fable-5.1"]')
        && !!routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.8-flash"]')
        && !!routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="x-ai/grok-4.3"]')
        && !!routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.3-flash"]')
        && !!routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k3"]')
        && !routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="grok-41-fast"]')
        && !routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.7-flash"]')
        && !routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.7-code"]')
        && !routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="glm-5.3"]')
        && !routstrRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.2"]')
        && !!document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Other models"] option[value="grok-41-fast"]')
        && !!document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Other models"] option[value="google/gemini-3.7-flash"]')
        && !!document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Other models"] option[value="glm-5.3"]')
        && !!document.querySelector<HTMLElement>('#routstr-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.2"]');

      localStorage.setItem('labcharts-ppq-model', 'ppq-b');
      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({ 'ppq-b': { input: 0.5, output: 1.5 } }));
      controls.renderPpqModelDropdown([
        { id: 'ppq-a', name: 'PPQ A' },
        { id: 'ppq-b', name: 'PPQ B' },
        { id: 'claude-fable-5.1', name: 'Claude Fable 5.1' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
        { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
        { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash' },
        { id: 'glm-5.3', name: 'GLM 5.3' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'grok-4.20', name: 'Grok 4.20' },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3' },
      ]);
      const ppqRecommendedGroup = document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Recommended"]');
      const ppqLatestGrokRecommended = !!ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="claude-fable-5.1"]')
        && !!ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="x-ai/grok-4.3"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="grok-4.20"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="grok-4.20"]');
      const ppqLatestGeminiRecommended = !!ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.8-flash"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="google/gemini-3.7-flash"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="gemini-3-flash-preview"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="google/gemini-3.7-flash"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="gemini-3-flash-preview"]');
      const ppqLatestGlmKimiRecommended = !!ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="glm-5.3-flash"]')
        && !!ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k3"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="glm-5.3"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.2"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.7-code"]')
        && !ppqRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="glm-5.3"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.2"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector<HTMLElement>('#ppq-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      controls.updatePpqModelPricing('ppq-b');
      const ppqModelPricing = (document.getElementById('ppq-model-select') as HTMLSelectElement|null)?.value === 'ppq-b'
        && ((document.getElementById('ppq-model-pricing') as HTMLElement|null)?.textContent || '').includes('$0.50/M in');

      localStorage.setItem('labcharts-custom-model', 'outside-model');
      controls.renderCustomApiModelDropdown([
        { id: 'model-a', name: 'Model A' },
        { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' },
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
        { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash' },
        { id: 'z-ai/glm-5.3', name: 'GLM 5.3' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
      ]);
      const customRecommendedGroup = document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Recommended"]');
      const customGlmKimiRecommended = !!customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="claude-fable-5-1"]')
        && !!customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="gemini-3.8-flash"]')
        && !!customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.3-flash"]')
        && !!customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k3"]')
        && !customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.3"]')
        && !customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="gemini-3.7-flash"]')
        && !customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="z-ai/glm-5.2"]')
        && !customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.7-code"]')
        && !customRecommendedGroup?.querySelector<HTMLOptionElement>('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.3"]')
        && !!document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Other models"] option[value="gemini-3.7-flash"]')
        && !!document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Other models"] option[value="z-ai/glm-5.2"]')
        && !!document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector<HTMLElement>('#custom-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      const customModelRenders = (document.getElementById('custom-model-select') as HTMLSelectElement|null)?.value === '__custom'
        && (document.getElementById('custom-manual-model') as HTMLInputElement|null)?.value === 'outside-model';
      (document.getElementById('custom-manual-model') as HTMLInputElement|null)!.value = 'manual-model';
      controls.applyCustomApiManualModel();
      const customManualApplied = localStorage.getItem('labcharts-custom-model') === 'manual-model';

      let delegatedClick = 0;
      let delegatedModel:unknown = '';
      let delegatedPricing:unknown = '';
      let delegatedLocalModel:unknown = '';
      let delegatedAdvisor = 0;
      let delegatedKeyModel = '';
      delegates.installProviderPanelDelegates({
        handleSaveOpenRouterKey: () => { delegatedClick += 1; },
        setPpqModel: (value:unknown) => { delegatedModel = value; },
        updatePpqModelPricing: (value:unknown) => { delegatedPricing = value; },
        setOllamaMainModel: (value:unknown) => { delegatedLocalModel = value; },
        refreshModelAdvisor: () => { delegatedAdvisor += 1; },
        applyCustomApiManualModel: () => { delegatedKeyModel = (document.getElementById('delegate-key') as HTMLInputElement|null)?.value || ''; },
      });

      const panel = (document.getElementById('ai-provider-panel') as HTMLElement|null);
      panel!.insertAdjacentHTML('beforeend', `
        <button id="delegate-save" data-provider-panel-action="save-openrouter-key">Save</button>
        <button id="delegate-unknown" data-provider-panel-action="missing-action">Unknown</button>
        <select id="delegate-ppq" data-provider-panel-change="ppq-model"><option value="delegate-ppq" selected>Delegate PPQ</option></select>
        <select id="delegate-local" data-provider-panel-change="local-ai-model"><option value="local-llm" selected>Local LLM</option></select>
        <input id="delegate-key" data-provider-panel-key="custom-manual-model" value="typed-model">
      `);
      (document.getElementById('delegate-save') as HTMLElement|null)!.click();
      (document.getElementById('delegate-unknown') as HTMLElement|null)!.click();
      (document.getElementById('delegate-ppq') as HTMLElement|null)!.dispatchEvent(new Event('change', { bubbles: true }));
      (document.getElementById('delegate-local') as HTMLElement|null)!.dispatchEvent(new Event('change', { bubbles: true }));
      (document.getElementById('delegate-key') as HTMLInputElement|null)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(0);
      const delegatesCovered = delegatedClick === 1
        && delegatedModel === 'delegate-ppq'
        && delegatedPricing === 'delegate-ppq'
        && delegatedLocalModel === 'local-llm'
        && delegatedAdvisor === 1
        && delegatedKeyModel === 'typed-model'
        && warnings.some(message => message.includes('Unknown provider panel click action'));

      return {
        openRouterRecommended,
        openRouterQwenAvailable,
        openRouterPricing,
        openRouterCustomApplied,
        openRouterCustomFailure,
        openRouterDropdownReset,
        veniceLatestGeminiRecommended,
        veniceE2EEEnabled,
        veniceE2EERestored,
        routstrFallback,
        routstrLatestGrokRecommended,
        ppqModelPricing,
        ppqLatestGrokRecommended,
        ppqLatestGeminiRecommended,
        ppqLatestGlmKimiRecommended,
        customModelRenders,
        customGlmKimiRecommended,
        customManualApplied,
        delegatesCovered,
      };
    } finally {
      window.fetch = oldGlobals.fetch;
      if (previousRuntimeDeps) runtime.configureProviderModelControlsRuntimeDeps(previousRuntimeDeps);
      if (previousChatRuntime) chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      console.warn = oldGlobals.consoleWarn;
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      (document.getElementById('ai-provider-panel') as HTMLElement|null)?.remove();
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
    }
  }, { controlsUrl: moduleUrl('/js/provider-model-controls.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('provider panels cover provider switching key saves balances custom API and dialogs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ panelsUrl }) => {
    const panels = (await import(panelsUrl) as unknown) as Pick<typeof import('../../js/provider-panels.js'),"configureProviderPanelDeps"|"handleRemoveOpenRouterKey"|"switchAIProvider"|"toggleAIPause"|"handleSaveOpenRouterKey"|"refreshOpenRouterBalance"|"handleSaveVeniceKey"|"refreshVeniceBalance"|"handleRemoveVeniceKey"|"handleSaveRoutstrKey"|"handleRemoveRoutstrKey"|"handleSavePpqKey"|"refreshPpqBalance"|"handleSaveCustomApi"|"handleRemoveCustomApi"|"showInsufficientBalanceDialog">;
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    const cryptoStore = await import('/js/crypto.js');
    const nodeSessions = await import('/js/routstr-session.js');
    const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body:unknown, status = 200, headers:Record<string,string> = {}) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    const textResponse = (body:BodyInit|null, status = 200, headers:HeadersInit = {}) => new Response(body, { status, headers });

    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-ai-paused',
      'labcharts-openrouter-key',
      'labcharts-openrouter-model',
      'labcharts-openrouter-models',
      'labcharts-openrouter-pricing',
      'labcharts-openrouter-vision-models',
      'labcharts-venice-key',
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-e2ee-models',
      'labcharts-venice-pricing',
      'labcharts-venice-vision-models',
      'labcharts-routstr-key',
      'labcharts-routstr-sessions',
      'labcharts-routstr-node',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-routstr-pricing',
      'labcharts-routstr-vision-models',
      'labcharts-ppq-key',
      'labcharts-ppq-credit-id',
      'labcharts-ppq-model',
      'labcharts-ppq-models',
      'labcharts-ppq-pricing',
      'labcharts-custom-url',
      'labcharts-custom-key',
      'labcharts-custom-model',
      'labcharts-custom-models',
      cloudConsent.CLOUD_AI_CONSENT_KEY,
    ];
    const oldStorage:Record<string,string|null|undefined> = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldSessionPrevious = sessionStorage.getItem('or_previous_ai_provider');
    const oldGlobals = {
      fetch: window.fetch,
    };

    let openedUrl = '';
    let settingsClosed = 0;
    let settingsOpened = 0;
    let chatOpened = 0;
    let focusLoads = 0;
    let e2eeClears = 0;
    const previousProviderPanelDeps = panels.configureProviderPanelDeps({
      clearE2EESession: () => { e2eeClears += 1; },
      closeSettingsModal: () => { settingsClosed += 1; },
      hadProviderBeforeSettings: () => false,
      loadFocusCard: () => { focusLoads += 1; },
      openChatPanel: () => { chatOpened += 1; },
      openExternal: (url:unknown) => { openedUrl = String(url); return null; },
      openSettingsModal: () => { settingsOpened += 1; },
    });

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', '');
      cryptoStore.updateKeyCache('labcharts-venice-key', '');
      cryptoStore.updateKeyCache('labcharts-routstr-key', '');
      cryptoStore.updateKeyCache('labcharts-routstr-sessions', '');
      cryptoStore.updateKeyCache('labcharts-ppq-key', '');
      cryptoStore.updateKeyCache('labcharts-custom-key', '');
      const routstrScope = cloudConsent.cloudAIConsentDetails('routstr', {
        endpoint: 'https://routstr.example',
      }).scope;
      const customScope = cloudConsent.cloudAIConsentDetails('custom', {
        endpoint: 'https://custom.example',
      }).scope;
      localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
        version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
        approvals: Object.fromEntries([
          'openrouter',
          'venice',
          'ppq',
          routstrScope,
          customScope,
        ].map(scope => [scope, { accepted: true }])),
      }));
      window.fetch = async function(url:Parameters<typeof fetch>[0], opts:RequestInit = {}) {
        const href = typeof url === 'string' ? url : (url as {url?:string})?.url || '';
        if (href === 'https://openrouter.ai/api/v1/models') {
          return jsonResponse({
            data: [
              { id: 'openai/gpt-6-astra', name: 'GPT 6 Astra', pricing: { prompt: '0.000005', completion: '0.000030' }, architecture: { modality: 'text->text' } },
              { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet', pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { modality: 'text+image->text' } },
              { id: 'audio/not-used', name: 'Audio', pricing: { prompt: '0', completion: '0' } },
            ],
          });
        }
        if (href === 'https://openrouter.ai/api/v1/credits') {
          return jsonResponse({ data: { total_credits: 2, total_usage: 1.25 } });
        }
        if (href === 'https://api.venice.ai/api/v1/models') {
          return jsonResponse({
            data: [
              { id: 'llama-3.3-70b', name: 'Llama 70B', type: 'text', model_spec: { pricing: { input: { usd: 0.2 }, output: { usd: 0.6 } }, capabilities: { supportsVision: true } } },
              { id: 'e2ee-secure', name: 'Secure', type: 'text', model_spec: { pricing: { input: { usd: 1 }, output: { usd: 2 } }, capabilities: { supportsE2EE: true } } },
            ],
          });
        }
        if (href === 'https://api.venice.ai/api/v1/chat/completions') {
          return textResponse('', 200, { 'x-venice-balance-diem': '0.42' });
        }
        if (href === 'https://api.ppq.ai/v1/models?type=chat') {
          return jsonResponse({
            data: [
              { id: 'z-ai/glm-5.2', name: 'GLM 5.2', pricing: { input_per_1M_tokens: '1', output_per_1M_tokens: '3.2' } },
              { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', pricing: { input_per_1M_tokens: '2', output_per_1M_tokens: '10' }, architecture: { input_modalities: ['text', 'image'] } },
              { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' }, architecture: { input_modalities: ['text', 'image'] } },
              { id: 'codex-not-used', name: 'Codex' },
            ],
          });
        }
        if (href === 'https://api.ppq.ai/credits/balance') {
          return jsonResponse({ balance: '0.08' });
        }
        if (href === 'https://routstr.example/v1/models') {
          return jsonResponse({
            data: [
              { id: 'z-ai/glm-5.2', name: 'GLM 5.2', enabled: true, pricing: { prompt: '0.000001', completion: '0.000003' } },
              { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: true, pricing: { prompt: '0.000002', completion: '0.000010' }, architecture: { modality: 'text+image->text' } },
              { id: 'claude-sonnet-4.6', name: 'Claude Sonnet', enabled: true, pricing: { prompt: '0.000002', completion: '0.000006' }, architecture: { modality: 'text+image->text' } },
              { id: 'mistral-large', name: 'Mistral Large', enabled: true, pricing: { prompt: '0.000001', completion: '0.000003' } },
              { id: 'codex-preview', name: 'Codex Preview', enabled: true },
            ],
          });
        }
        if (href === '/api/proxy') {
          const payload = (JSON.parse as (text:unknown)=>unknown)(String(opts.body || '{}'));
          if ((payload as {url?:unknown}).url === 'https://custom.example/v1/models') {
            return jsonResponse({ data: [{ id: 'z-model', name: 'Z Model' }, { id: 'z-ai/glm-5.2', name: 'GLM 5.2' }, { id: 'openai/gpt-5.5', name: 'GPT 5.5' }, { id: 'a-model', name: 'A Model' }] });
          }
          if ((payload as {url?:unknown}).url === 'https://custom.example/v1/chat/completions') {
            return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
          }
        }
        if (href === 'https://custom.example/v1/models') {
          return jsonResponse({ data: [{ id: 'z-model', name: 'Z Model' }, { id: 'z-ai/glm-5.2', name: 'GLM 5.2' }, { id: 'openai/gpt-5.5', name: 'GPT 5.5' }, { id: 'a-model', name: 'A Model' }] });
        }
        if (href === 'https://custom.example/v1/chat/completions') {
          return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
        }
        return oldGlobals.fetch.call(window, url, opts);
      };

      document.body.insertAdjacentHTML('beforeend', `
        <div id="settings-modal">
          <button class="ai-provider-btn" data-provider="openrouter"></button>
          <button class="ai-provider-btn" data-provider="ppq"></button>
          <button class="ai-provider-btn" data-provider="custom"></button>
        </div>
        <div id="ai-provider-panel"></div>
      `);

      panels.handleRemoveOpenRouterKey();
      localStorage.setItem('labcharts-ai-provider', 'venice');
      panels.switchAIProvider('openrouter');
      const switchStoresPrevious = localStorage.getItem('labcharts-ai-provider') === 'openrouter';
      sessionStorage.setItem('or_previous_ai_provider', 'venice');
      panels.switchAIProvider('ppq');
      const switchClearsOAuth = localStorage.getItem('labcharts-ai-provider') === 'ppq';

      panels.toggleAIPause(false);
      const pauseStoresDisabled = localStorage.getItem('labcharts-ai-paused') === 'true' && focusLoads >= 1;
      panels.toggleAIPause(true);
      const pauseStoresEnabled = localStorage.getItem('labcharts-ai-paused') === 'false' && focusLoads >= 2;

      const panel = (document.getElementById('ai-provider-panel') as HTMLElement|null);
      panel!.innerHTML = `
        <input id="openrouter-key-input" value="sk-or-good">
        <button id="save-openrouter-key-btn">Save</button>
        <div id="openrouter-key-status"></div>
        <div id="openrouter-model-area"></div>
        <span id="or-balance"></span>
      `;
      await panels.handleSaveOpenRouterKey();
      panels.refreshOpenRouterBalance();
      await wait(50);
      const openRouterSaveAndBalance = (document.getElementById('openrouter-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && (document.getElementById('openrouter-model-select') as HTMLSelectElement|null)?.value === 'openai/gpt-6-astra'
        && ((document.getElementById('or-balance') as HTMLElement|null)?.textContent || '').includes('$0.75');

      panel!.innerHTML = `
        <input id="venice-key-input" value="venice-good">
        <button id="save-venice-key-btn">Save</button>
        <div id="venice-key-status"></div>
        <div id="venice-model-area"></div>
        <span id="venice-balance"></span>
      `;
      await panels.handleSaveVeniceKey();
      panels.refreshVeniceBalance();
      await wait(50);
      const veniceSaveAndBalance = (document.getElementById('venice-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && (document.getElementById('venice-model-select') as HTMLSelectElement|null)?.value === 'llama-3.3-70b'
        && ((document.getElementById('venice-balance') as HTMLElement|null)?.textContent || '').includes('$0.42')
        && ((JSON.parse as (text:unknown)=>unknown)(localStorage.getItem('labcharts-venice-e2ee-models') || '[]') as {length:unknown}).length === 1;

      panels.handleRemoveVeniceKey();
      const veniceRemoveClearsKeyModelsAndE2EE =
        localStorage.getItem('labcharts-venice-key') === null
        && localStorage.getItem('labcharts-venice-models') === null
        && localStorage.getItem('labcharts-venice-e2ee-models') === null
        && localStorage.getItem('labcharts-venice-model') === null
        && e2eeClears >= 1;

      localStorage.setItem('labcharts-routstr-node', 'https://routstr.example');
      panel!.innerHTML = `
        <input id="routstr-key-input" value="sk-routstr-good">
        <button id="save-routstr-key-btn">Save</button>
        <div id="routstr-key-status"></div>
        <div id="routstr-model-area"></div>
      `;
      await panels.handleSaveRoutstrKey();
      await wait(0);
      const storedRoutstrKey = localStorage.getItem('labcharts-routstr-sessions');
      const routstrSaveRendersModels = (document.getElementById('routstr-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && storedRoutstrKey?.startsWith('d1:') === true
        && !storedRoutstrKey.includes('sk-routstr-good')
        && nodeSessions.getRoutstrSessionKey() === 'sk-routstr-good'
        && await cryptoStore.encryptedGetItem('labcharts-routstr-key') === ''
        && (document.getElementById('routstr-model-select') as HTMLSelectElement|null)?.value === 'claude-sonnet-5'
        && ((JSON.parse as (text:unknown)=>unknown)(localStorage.getItem('labcharts-routstr-vision-models') || '[]') as {includes(value:unknown):unknown}).includes('claude-sonnet-4.6');

      await nodeSessions.saveRoutstrSessionKey('sk-other-node', 'https://other-node.example');
      await panels.handleRemoveRoutstrKey();
      const routstrRemoveClearsKeyModelsAndPricing =
        nodeSessions.getRoutstrSessionKey() === ''
        && nodeSessions.getRoutstrSessionKey('https://other-node.example') === 'sk-other-node'
        && localStorage.getItem('labcharts-routstr-models') === null
        && localStorage.getItem('labcharts-routstr-model') === null
        && localStorage.getItem('labcharts-routstr-pricing') === null
        && localStorage.getItem('labcharts-routstr-vision-models') === null;

      panel!.innerHTML = `
        <input id="ppq-key-input" value="sk-ppq-good">
        <button id="save-ppq-key-btn">Save</button>
        <div id="ppq-key-status"></div>
        <div id="ppq-model-area"></div>
        <span id="ppq-balance"></span>
      `;
      await panels.handleSavePpqKey();
      await panels.refreshPpqBalance();
      await wait(0);
      const ppqSaveAndBalance = (document.getElementById('ppq-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && (document.getElementById('ppq-model-select') as HTMLSelectElement|null)?.value === 'claude-sonnet-5'
        && ((document.getElementById('ppq-balance') as HTMLElement|null)?.textContent || '').includes('$0.08');

      panel!.innerHTML = `
        <input id="custom-url-input" value="https://custom.example/v1/">
        <input id="custom-key-input" value="sk-custom">
      `;
      await panels.handleSaveCustomApi();
      await wait(0);
      const customSaveRendersConnected = localStorage.getItem('labcharts-custom-url') === 'https://custom.example/v1'
        && (document.getElementById('custom-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && (document.getElementById('custom-model-select') as HTMLSelectElement|null)?.value === 'openai/gpt-5.5';
      panels.handleRemoveCustomApi();
      await wait(0);
      const customRemoveRendersDisconnected = !localStorage.getItem('labcharts-custom-url')
        && (document.getElementById('custom-key-status') as HTMLElement|null)?.textContent.includes('Not connected');

      panels.showInsufficientBalanceDialog();
      (document.getElementById('or-add-credits') as HTMLElement|null)!.click();
      const addCreditsDialog = openedUrl === 'https://openrouter.ai/settings/credits'
        && !(document.getElementById('or-no-balance-overlay') as HTMLElement|null)?.classList.contains('show');
      panels.showInsufficientBalanceDialog();
      (document.getElementById('or-nb-cancel') as HTMLElement|null)!.click();
      const cancelBalanceDialog = !(document.getElementById('or-no-balance-overlay') as HTMLElement|null)?.classList.contains('show');
      await wait(325);
      const explicitProviderCallbacksRun = settingsClosed >= 1
        && settingsOpened >= 3
        && chatOpened >= 1
        && focusLoads >= 2
        && e2eeClears >= 1;

      return {
        switchStoresPrevious,
        switchClearsOAuth,
        pauseStoresDisabled,
        pauseStoresEnabled,
        openRouterSaveAndBalance,
        veniceSaveAndBalance,
        veniceRemoveClearsKeyModelsAndE2EE,
        routstrSaveRendersModels,
        routstrRemoveClearsKeyModelsAndPricing,
        ppqSaveAndBalance,
        customSaveRendersConnected,
        customRemoveRendersDisconnected,
        addCreditsDialog,
        cancelBalanceDialog,
        explicitProviderCallbacksRun,
      };
    } finally {
      window.fetch = oldGlobals.fetch;
      panels.configureProviderPanelDeps(previousProviderPanelDeps);
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      cryptoStore.updateKeyCache('labcharts-openrouter-key', oldStorage['labcharts-openrouter-key'] || '');
      cryptoStore.updateKeyCache('labcharts-venice-key', oldStorage['labcharts-venice-key'] || '');
      cryptoStore.updateKeyCache('labcharts-routstr-key', oldStorage['labcharts-routstr-key'] || '');
      cryptoStore.updateKeyCache('labcharts-routstr-sessions', null);
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      cryptoStore.updateKeyCache('labcharts-custom-key', oldStorage['labcharts-custom-key'] || '');
      if (oldSessionPrevious == null) sessionStorage.removeItem('or_previous_ai_provider');
      else sessionStorage.setItem('or_previous_ai_provider', oldSessionPrevious);
      (document.getElementById('settings-modal') as HTMLElement|null)?.remove();
      (document.getElementById('ai-provider-panel') as HTMLElement|null)?.remove();
      (document.getElementById('or-no-balance-overlay') as HTMLElement|null)?.remove();
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
    }
  }, { panelsUrl: moduleUrl('/js/provider-panels.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('ppq panels cover account reveal topup picker invoice states and cleanup', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ ppqUrl }) => {
    const ppq = (await import(ppqUrl) as unknown) as Pick<typeof import('../../js/provider-ppq-panels.js'),"copyPpqKeyReveal"|"dismissPpqKeyReveal"|"handleSelectPpqMethod"|"handlePpqTopupPreset"|"ppqShowCustomInput"|"copyPpqPayment"|"cancelPpqTopup"|"handleSavePpqKey"|"handleRemovePpqKey"|"configurePpqPanels"|"handleCreatePpqAccount"|"refreshPpqBalance"|"doPpqTopupCustom"|"doPpqTopup"|"clearPpqTopupTimers">;
    const delegates = await import('/js/provider-panel-delegates.js');
    const cryptoStore = await import('/js/crypto.js');
    const settingsBridge = await import('/js/settings-runtime-bridge.js');
    const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body:unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    const storageKeys = [
      'labcharts-ppq-key',
      'labcharts-ppq-credit-id',
      'labcharts-ppq-model',
      'labcharts-ppq-models',
      'labcharts-ppq-pricing',
      'labcharts-ppq-vision-models',
    ];
    const oldStorage:Record<string,string|null|undefined> = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      fetch: window.fetch,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    const intervals:{id:number;fn:()=>unknown;ms:number;cleared:boolean}[] = [];
    const copied:string[] = [];
    let nextIntervalId = 1;
    let returnToChatCount = 0;
    let settingsOpened = 0;
    let createMode = 'paid';
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: () => { settingsOpened += 1; },
    });

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-ppq-key', '');
      (window as unknown as {setInterval:unknown}).setInterval = (fn:()=>unknown, ms:number) => {
        const id = nextIntervalId++;
        intervals.push({ id, fn, ms, cleared: false });
        return id;
      };
      (window as unknown as {clearInterval:unknown}).clearInterval = (id:unknown) => {
        const interval = intervals.find(item => item.id === id);
        if (interval) interval.cleared = true;
      };
      window.fetch = async function(url:Parameters<typeof fetch>[0]) {
        const href = typeof url === 'string' ? url : (url as {url?:string})?.url || '';
        if (href === 'https://api.ppq.ai/accounts/create') {
          return jsonResponse({ success: true, api_key: 'sk-created', credit_id: 'credit-123' });
        }
        if (href === 'https://api.ppq.ai/v1/models?type=chat') {
          return jsonResponse({
            data: [{ id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' } }],
          });
        }
        if (href === 'https://api.ppq.ai/credits/balance') {
          return jsonResponse({ balance: '1.25' });
        }
        if (href.includes('/topup/create/')) {
          if (createMode === 'error') return jsonResponse({ error: 'bad topup' }, 500);
          const method = decodeURIComponent(href.split('/topup/create/')[1] || '');
          return jsonResponse({
            invoice_id: createMode === 'expired' ? 'invoice-expired' : 'invoice-paid',
            lightning_invoice: method === 'btc-lightning' ? 'lnbc1invoice' : '',
            payment_address: method === 'xmr' ? '44AFFq5kSiGBoZ' : 'bc1qaddress',
            crypto_amount_due: '0.0123',
            expires_at: Math.floor(Date.now() / 1000) + 120,
          });
        }
        if (href.includes('/topup/status/invoice-paid')) return jsonResponse({ status: 'paid' });
        if (href.includes('/topup/status/invoice-expired')) return jsonResponse({ status: 'expired' });
        return oldGlobals.fetch.call(window, url);
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text:unknown) => { copied.push(String(text || '')); } },
      });
      delegates.installProviderPanelDelegates({
        copyPpqKeyReveal: ppq.copyPpqKeyReveal,
        dismissPpqKeyReveal: ppq.dismissPpqKeyReveal,
        handleSelectPpqMethod: ppq.handleSelectPpqMethod,
        handlePpqTopupPreset: ppq.handlePpqTopupPreset,
        ppqShowCustomInput: ppq.ppqShowCustomInput,
        copyPpqPayment: ppq.copyPpqPayment,
        cancelPpqTopup: ppq.cancelPpqTopup,
      });

      document.body.insertAdjacentHTML('beforeend', `
        <div id="ai-provider-panel">
          <button data-provider-panel-action="create-ppq-account">Create Account (instant, no signup)</button>
          <div id="ppq-key-status"></div>
        </div>
      `);
      const panel = (document.getElementById('ai-provider-panel') as HTMLElement|null);
      panel!.innerHTML = `
        <input id="ppq-key-input" value="sk-ppq-default">
        <button id="save-ppq-key-btn">Save</button>
        <div id="ppq-key-status"></div>
        <div id="ppq-model-area"></div>
      `;
      await ppq.handleSavePpqKey();
      const defaultSaveUsesNoopReturnCallback = (document.getElementById('ppq-key-status') as HTMLElement|null)?.textContent.includes('Connected')
        && (document.getElementById('ppq-model-select') as HTMLSelectElement|null)?.value === 'claude-sonnet-4.6';

      localStorage.setItem('labcharts-ppq-key', 'sk-ppq-remove');
      localStorage.setItem('labcharts-ppq-credit-id', 'credit-remove');
      localStorage.setItem('labcharts-ppq-model', 'claude-sonnet-4.6');
      localStorage.setItem('labcharts-ppq-models', JSON.stringify([{ id: 'claude-sonnet-4.6', name: 'Claude' }]));
      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({ 'claude-sonnet-4.6': { input: 3, output: 15 } }));
      localStorage.setItem('labcharts-ppq-vision-models', JSON.stringify(['claude-sonnet-4.6']));
      const removePromise = ppq.handleRemovePpqKey();
      for (let i = 0; i < 50 && !(document.getElementById('confirm-dialog-overlay') as HTMLElement|null)?.classList.contains('show'); i += 1) {
        await wait(10);
      }
      const removeMessage = document.querySelector<HTMLElement>('#confirm-dialog-overlay .confirm-message')?.textContent || '';
      (document.getElementById('confirm-ok') as HTMLElement|null)?.click();
      await removePromise;
      const removePpqKeyClearsFundsWarningAndState = removeMessage.includes('$1.25 remaining')
        && localStorage.getItem('labcharts-ppq-key') === null
        && localStorage.getItem('labcharts-ppq-models') === null
        && localStorage.getItem('labcharts-ppq-model') === null
        && localStorage.getItem('labcharts-ppq-pricing') === null
        && localStorage.getItem('labcharts-ppq-vision-models') === null
        && localStorage.getItem('labcharts-ppq-credit-id') === null
        && settingsOpened === 1;

      ppq.configurePpqPanels({
        returnToChatIfOnboarding: () => { returnToChatCount += 1; },
      });

      panel!.innerHTML = `
        <button data-provider-panel-action="create-ppq-account">Create Account (instant, no signup)</button>
        <div id="ppq-key-status"></div>
      `;

      await ppq.handleCreatePpqAccount();
      const revealPanel = (document.getElementById('ai-provider-panel') as HTMLElement|null);
      const accountReveal = revealPanel?.textContent.includes('Save your account details')
        && revealPanel?.textContent.includes('credit-123')
        && !revealPanel.querySelector<HTMLElement>('[onclick],[onchange],[oninput],[onkeydown],[onblur],[onsubmit]')
        && !!revealPanel.querySelector<HTMLElement>('[data-provider-panel-action="copy-ppq-key-reveal"]')
        && !!revealPanel.querySelector<HTMLElement>('[data-provider-panel-action="dismiss-ppq-key-reveal"]');
      revealPanel!.querySelector<HTMLElement>('[data-provider-panel-action="copy-ppq-key-reveal"]')?.click();
      await wait(0);
      const accountRevealCopyDelegates = copied.some(text => text.includes('API Key: sk-created') && text.includes('Credit ID: credit-123'))
        && revealPanel!.querySelector<HTMLElement>('[data-provider-panel-action="copy-ppq-key-reveal"]')?.textContent.includes('Copied');
      revealPanel!.querySelector<HTMLElement>('[data-provider-panel-action="dismiss-ppq-key-reveal"]')?.click();
      await wait(0);
      await ppq.refreshPpqBalance();
      await wait(0);
      const dismissRerendersTopup = (document.getElementById('ppq-topup-area') as HTMLElement|null)?.style.display === 'block'
        && (document.getElementById('ppq-topup-toggle') as HTMLElement|null)?.textContent === 'Close'
        && (document.getElementById('ppq-balance') as HTMLElement|null)?.textContent.includes('$1.25');

      document.querySelector<HTMLElement>('[data-provider-panel-action="select-ppq-method"][data-ppq-method="xmr"]')?.click();
      await wait(0);
      const methodSelected = document.querySelector<HTMLElement>('.ppq-method-btn.active .ppq-method-label')?.textContent === 'Monero'
        && ((document.getElementById('ppq-topup-area') as HTMLElement|null)?.textContent || '').includes('min $5');
      document.querySelector<HTMLElement>('[data-provider-panel-action="show-ppq-custom-input"]')?.click();
      await wait(0);
      const customInputRenders = !!(document.getElementById('ppq-custom-amount') as HTMLInputElement|null);
      (document.getElementById('ppq-custom-amount') as HTMLInputElement|null)!.value = '4';
      ppq.doPpqTopupCustom();
      const rejectsLowCustom = [...document.querySelectorAll<HTMLElement>('.notification-toast')]
        .some(el => el.textContent.includes('Minimum amount is $5'));

      (document.getElementById('ppq-custom-amount') as HTMLInputElement|null)!.value = '6';
      ppq.doPpqTopupCustom();
      await wait(250);
      const invoiceRenders = ((document.getElementById('ppq-topup-area') as HTMLElement|null)?.textContent || '').includes('Monero')
        && document.querySelector<HTMLElement>('#ppq-topup-area a[href^="monero:"]') !== null
        && ((document.getElementById('ppq-topup-area') as HTMLElement|null)?.textContent || '').includes('Show address');
      const topupArea = (document.getElementById('ppq-topup-area') as HTMLElement|null);
      const invoiceUsesDelegatedActions = !topupArea!.querySelector<HTMLElement>('[onclick],[onchange],[oninput],[onkeydown],[onblur],[onsubmit]')
        && !!topupArea!.querySelector<HTMLElement>('[data-provider-panel-action="copy-ppq-payment"]')
        && !!topupArea!.querySelector<HTMLElement>('[data-provider-panel-action="cancel-ppq-topup"]');
      document.querySelector<HTMLElement>('#ppq-topup-area [data-provider-panel-action="copy-ppq-payment"]')?.click();
      await wait(0);
      const invoiceCopyDelegates = copied.includes('44AFFq5kSiGBoZ');
      const paidPoll = intervals.find(item => item.ms === 3000 && !item.cleared);
      const paidPollIntervalScheduled = !!paidPoll;
      if (paidPoll) await paidPoll.fn();
      const paidInvoiceUpdatesBalance = ((document.getElementById('ppq-topup-area') as HTMLElement|null)?.textContent || '').includes('Payment received')
        && (document.getElementById('ppq-balance') as HTMLElement|null)?.textContent.includes('$1.25');

      createMode = 'expired';
      await ppq.doPpqTopup(2);
      const expiredPoll = [...intervals].reverse().find(item => item.ms === 3000 && !item.cleared);
      const expiredPollIntervalScheduled = !!expiredPoll;
      if (expiredPoll) await expiredPoll.fn();
      const expiredInvoice = ((document.getElementById('ppq-topup-status') as HTMLElement|null)?.textContent || '').includes('Invoice expired');

      createMode = 'error';
      await ppq.doPpqTopup(2);
      const topupError = ((document.getElementById('ppq-topup-area') as HTMLElement|null)?.textContent || '').includes('bad topup');

      createMode = 'paid';
      await ppq.doPpqTopup(2);
      const cancelPoll = [...intervals].reverse().find(item => item.ms === 3000 && !item.cleared);
      const cancelPollIntervalScheduled = !!cancelPoll;
      document.querySelector<HTMLElement>('#ppq-topup-area [data-provider-panel-action="cancel-ppq-topup"]')?.click();
      await wait(0);
      const cancelHidesArea = (document.getElementById('ppq-topup-area') as HTMLElement|null)?.style.display === 'none'
        && !!cancelPoll
        && intervals.find(item => item.id === cancelPoll.id)?.cleared === true;

      return {
        defaultSaveUsesNoopReturnCallback,
        removePpqKeyClearsFundsWarningAndState,
        accountReveal,
        accountRevealCopyDelegates,
        dismissRerendersTopup,
        methodSelected,
        customInputRenders,
        rejectsLowCustom,
        invoiceRenders,
        invoiceUsesDelegatedActions,
        invoiceCopyDelegates,
        paidPollIntervalScheduled,
        paidInvoiceUpdatesBalance,
        expiredPollIntervalScheduled,
        expiredInvoice,
        topupError,
        cancelPollIntervalScheduled,
        cancelHidesArea,
        noUnexpectedReturn: returnToChatCount === 0,
      };
    } finally {
      ppq.clearPpqTopupTimers();
      window.fetch = oldGlobals.fetch;
      window.setInterval = oldGlobals.setInterval;
      window.clearInterval = oldGlobals.clearInterval;
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      if (oldGlobals.clipboard) Object.defineProperty(navigator, 'clipboard', oldGlobals.clipboard);
      else delete (navigator as unknown as {clipboard?:unknown}).clipboard;
      ppq.configurePpqPanels({ returnToChatIfOnboarding: () => {} });
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      (document.getElementById('ai-provider-panel') as HTMLElement|null)?.remove();
      (document.getElementById('ppq-topup-toggle') as HTMLElement|null)?.remove();
      (document.getElementById('ppq-topup-area') as HTMLElement|null)?.remove();
      (document.getElementById('ppq-balance') as HTMLElement|null)?.remove();
      (document.getElementById('confirm-dialog-overlay') as HTMLElement|null)?.remove();
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(el => el.remove());
    }
  }, { ppqUrl: moduleUrl('/js/provider-ppq-panels.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
