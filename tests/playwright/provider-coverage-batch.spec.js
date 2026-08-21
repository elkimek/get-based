import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?providerCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('provider panel renderers cover Venice and Local AI markup branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ renderersUrl }) => {
    const renderers = await import(renderersUrl);
    const crypto = await import('/js/crypto.js');
    const storageKeys = [
      'labcharts-venice-key',
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-e2ee',
      'labcharts-venice-e2ee-models',
      'labcharts-ollama',
    ];
    const oldStorage = {};
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
      const veniceSelect = fixture.querySelector('#venice-model-select');
      const veniceE2EERenders = fixture.querySelector('#venice-key-status')?.textContent.includes('Connected')
        && fixture.querySelector('#venice-key-input')?.value === 'venice-test-key'
        && veniceSelect?.value === 'e2ee-model'
        && fixture.querySelector('#venice-e2ee-toggle')?.checked === true
        && fixture.querySelector('#venice-e2ee-indicator')?.style.display === ''
        && fixture.querySelector('#venice-model-select option[value="e2ee-model"]')?.textContent === 'Secure <Model>'
        && !!fixture.querySelector('[data-provider-panel-action="remove-venice-key"]');

      localStorage.setItem('labcharts-venice-e2ee', 'on');
      localStorage.setItem('labcharts-venice-model', 'regular-model');
      localStorage.setItem('labcharts-venice-e2ee-models', '[]');
      fixture.innerHTML = renderers.renderAIProviderPanel('venice');
      const veniceMissingE2EEDisables = !fixture.querySelector('#venice-e2ee-toggle')
        && fixture.querySelector('#venice-model-select')?.value === 'regular-model';

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
      const localAIRenders = fixture.querySelector('#local-ai-url-input')?.value === 'https://local.example'
        && fixture.querySelector('#local-ai-apikey-input')?.value === 'local-secret'
        && fixture.querySelector('#local-ai-status-text')?.textContent === 'Checking connection...'
        && fixture.querySelector('[data-provider-panel-action="test-ollama-connection"]')?.textContent === 'Test'
        && fixture.querySelector('#local-ai-model-select')?.dataset.providerPanelChange === 'local-ai-model'
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
    const controls = await import(controlsUrl);
    const runtime = await import('/js/provider-model-controls-runtime.js');
    const chatRuntime = await import('/js/chat-runtime.js');
    const delegates = await import('/js/provider-panel-delegates.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
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
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      fetch: window.fetch,
      consoleWarn: console.warn,
    };
    let previousRuntimeDeps = null;
    let previousChatRuntime = null;

    let clearCount = 0;
    let headerRefreshes = 0;
    let searchRefreshes = 0;
    const warnings = [];

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
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
        { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
        { id: 'x-ai/grok-4', name: 'Grok 4' },
      ]);
      const openRouterRecommendedGroup = document.querySelector('#openrouter-model-select optgroup[label="Recommended"]');
      const openRouterRecommended = !!openRouterRecommendedGroup?.querySelector('option[value="anthropic/claude-sonnet-5"]')
        && !!openRouterRecommendedGroup?.querySelector('option[value="google/gemini-3.5-flash"]')
        && !!openRouterRecommendedGroup?.querySelector('option[value="z-ai/glm-5.2"]')
        && !!openRouterRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k3"]')
        && !openRouterRecommendedGroup?.querySelector('option[value="anthropic/claude-sonnet-4.6"]')
        && !openRouterRecommendedGroup?.querySelector('option[value="google/gemini-3.1-pro"]')
        && !openRouterRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.7-code"]')
        && !openRouterRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector('#openrouter-model-select optgroup[label="Other models"] option[value="anthropic/claude-sonnet-4.6"]')
        && !!document.querySelector('#openrouter-model-select optgroup[label="Other models"] option[value="google/gemini-3.1-pro"]')
        && !!document.querySelector('#openrouter-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector('#openrouter-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      const openRouterPricing = (document.getElementById('openrouter-model-pricing')?.textContent || '').includes('$3.00/M in');

      let fetchedPricing = false;
      previousRuntimeDeps = runtime.configureProviderModelControlsRuntimeDeps({
        callClaudeAPI: async () => ({ content: 'ok' }),
        clearE2EESession: () => { clearCount += 1; },
      });
      window.fetch = async function(url) {
        const href = typeof url === 'string' ? url : url?.url || '';
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
      const customOpt = document.querySelector('#openrouter-model-select option[value="__custom"]');
      const openRouterCustomApplied = customOpt?.selected === true
        && localStorage.getItem('labcharts-openrouter-model') === 'custom/model'
        && document.getElementById('openrouter-model-health')?.title === 'Model responding'
        && (document.getElementById('openrouter-model-pricing')?.textContent || '').includes('$1.25/M in')
        && fetchedPricing;

      runtime.configureProviderModelControlsRuntimeDeps({
        callClaudeAPI: async () => { throw new Error('offline model'); },
      });
      await controls.applyCustomOpenRouterModel('bad/model');
      const openRouterCustomFailure = document.getElementById('openrouter-model-health')?.title === 'offline model'
        && document.getElementById('openrouter-custom-model')?.style.borderColor === 'var(--red)';

      controls.onOpenRouterDropdownChange('anthropic/claude-sonnet-4.6');
      const openRouterDropdownReset = !document.querySelector('#openrouter-model-select option[value="__custom"]')
        && document.getElementById('openrouter-custom-model')?.value === ''
        && document.getElementById('openrouter-model-health')?.textContent === '';

      localStorage.setItem('labcharts-venice-model', 'regular-a');
      localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'regular-a', name: 'Regular A' }]));
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([{ id: 'e2ee-secure', name: 'Secure E2EE' }]));
      controls.renderVeniceModelDropdown([{ id: 'regular-a', name: 'Regular A' }]);
      controls.toggleVeniceE2EE(true);
      const veniceE2EEEnabled = localStorage.getItem('labcharts-venice-e2ee') === 'on'
        && localStorage.getItem('labcharts-venice-model') === 'e2ee-secure'
        && document.getElementById('venice-e2ee-indicator')?.style.display === ''
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
        && document.getElementById('routstr-model-select')?.value === 'routstr-a';
      controls.renderRoutstrModelDropdown([
        { id: 'grok-41-fast', name: 'Grok 4.1 Fast' },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
      ]);
      const routstrRecommendedGroup = document.querySelector('#routstr-model-select optgroup[label="Recommended"]');
      const routstrLatestGrokRecommended = !!routstrRecommendedGroup?.querySelector('option[value="x-ai/grok-4.3"]')
        && !!routstrRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k3"]')
        && !routstrRecommendedGroup?.querySelector('option[value="grok-41-fast"]')
        && !routstrRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector('#routstr-model-select optgroup[label="Other models"] option[value="grok-41-fast"]')
        && !!document.querySelector('#routstr-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]');

      localStorage.setItem('labcharts-ppq-model', 'ppq-b');
      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({ 'ppq-b': { input: 0.5, output: 1.5 } }));
      controls.renderPpqModelDropdown([
        { id: 'ppq-a', name: 'PPQ A' },
        { id: 'ppq-b', name: 'PPQ B' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'google/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'grok-4.20', name: 'Grok 4.20' },
        { id: 'x-ai/grok-4.3', name: 'Grok 4.3' },
      ]);
      const ppqRecommendedGroup = document.querySelector('#ppq-model-select optgroup[label="Recommended"]');
      const ppqLatestGrokRecommended = !!ppqRecommendedGroup?.querySelector('option[value="x-ai/grok-4.3"]')
        && !ppqRecommendedGroup?.querySelector('option[value="grok-4.20"]')
        && !!document.querySelector('#ppq-model-select optgroup[label="Other models"] option[value="grok-4.20"]');
      const ppqLatestGeminiRecommended = !!ppqRecommendedGroup?.querySelector('option[value="google/gemini-3.5-flash"]')
        && !ppqRecommendedGroup?.querySelector('option[value="gemini-3-flash-preview"]')
        && !!document.querySelector('#ppq-model-select optgroup[label="Other models"] option[value="gemini-3-flash-preview"]');
      const ppqLatestGlmKimiRecommended = !!ppqRecommendedGroup?.querySelector('option[value="z-ai/glm-5.2"]')
        && !!ppqRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k3"]')
        && !ppqRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.7-code"]')
        && !ppqRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector('#ppq-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector('#ppq-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      controls.updatePpqModelPricing('ppq-b');
      const ppqModelPricing = document.getElementById('ppq-model-select')?.value === 'ppq-b'
        && (document.getElementById('ppq-model-pricing')?.textContent || '').includes('$0.50/M in');

      localStorage.setItem('labcharts-custom-model', 'outside-model');
      controls.renderCustomApiModelDropdown([
        { id: 'model-a', name: 'Model A' },
        { id: 'z-ai/glm-5.2', name: 'GLM 5.2' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
        { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code' },
        { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6' },
      ]);
      const customRecommendedGroup = document.querySelector('#custom-model-select optgroup[label="Recommended"]');
      const customGlmKimiRecommended = !!customRecommendedGroup?.querySelector('option[value="z-ai/glm-5.2"]')
        && !!customRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k3"]')
        && !customRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.7-code"]')
        && !customRecommendedGroup?.querySelector('option[value="moonshotai/kimi-k2.6"]')
        && !!document.querySelector('#custom-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.7-code"]')
        && !!document.querySelector('#custom-model-select optgroup[label="Other models"] option[value="moonshotai/kimi-k2.6"]');
      const customModelRenders = document.getElementById('custom-model-select')?.value === '__custom'
        && document.getElementById('custom-manual-model')?.value === 'outside-model';
      document.getElementById('custom-manual-model').value = 'manual-model';
      controls.applyCustomApiManualModel();
      const customManualApplied = localStorage.getItem('labcharts-custom-model') === 'manual-model';

      let delegatedClick = 0;
      let delegatedModel = '';
      let delegatedPricing = '';
      let delegatedLocalModel = '';
      let delegatedAdvisor = 0;
      let delegatedKeyModel = '';
      delegates.installProviderPanelDelegates({
        handleSaveOpenRouterKey: () => { delegatedClick += 1; },
        setPpqModel: value => { delegatedModel = value; },
        updatePpqModelPricing: value => { delegatedPricing = value; },
        setOllamaMainModel: value => { delegatedLocalModel = value; },
        refreshModelAdvisor: () => { delegatedAdvisor += 1; },
        applyCustomApiManualModel: () => { delegatedKeyModel = document.getElementById('delegate-key')?.value || ''; },
      });

      const panel = document.getElementById('ai-provider-panel');
      panel.insertAdjacentHTML('beforeend', `
        <button id="delegate-save" data-provider-panel-action="save-openrouter-key">Save</button>
        <button id="delegate-unknown" data-provider-panel-action="missing-action">Unknown</button>
        <select id="delegate-ppq" data-provider-panel-change="ppq-model"><option value="delegate-ppq" selected>Delegate PPQ</option></select>
        <select id="delegate-local" data-provider-panel-change="local-ai-model"><option value="local-llm" selected>Local LLM</option></select>
        <input id="delegate-key" data-provider-panel-key="custom-manual-model" value="typed-model">
      `);
      document.getElementById('delegate-save').click();
      document.getElementById('delegate-unknown').click();
      document.getElementById('delegate-ppq').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('delegate-local').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('delegate-key').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
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
        openRouterPricing,
        openRouterCustomApplied,
        openRouterCustomFailure,
        openRouterDropdownReset,
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
      document.getElementById('ai-provider-panel')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, { controlsUrl: moduleUrl('/js/provider-model-controls.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('provider panels cover provider switching key saves balances custom API and dialogs', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ panelsUrl }) => {
    const panels = await import(panelsUrl);
    const cryptoStore = await import('/js/crypto.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    const textResponse = (body, status = 200, headers = {}) => new Response(body, { status, headers });

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
    ];
    const oldStorage = {};
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
      openExternal: url => { openedUrl = String(url); return null; },
      openSettingsModal: () => { settingsOpened += 1; },
    });

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', '');
      cryptoStore.updateKeyCache('labcharts-venice-key', '');
      cryptoStore.updateKeyCache('labcharts-routstr-key', '');
      cryptoStore.updateKeyCache('labcharts-ppq-key', '');
      cryptoStore.updateKeyCache('labcharts-custom-key', '');
      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'https://openrouter.ai/api/v1/models') {
          return jsonResponse({
            data: [
              { id: 'openai/gpt-5.6-sol', name: 'GPT 5.6 Sol', pricing: { prompt: '0.000005', completion: '0.000030' }, architecture: { modality: 'text->text' } },
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
          const payload = JSON.parse(String(opts.body || '{}'));
          if (payload.url === 'https://custom.example/v1/models') {
            return jsonResponse({ data: [{ id: 'z-model', name: 'Z Model' }, { id: 'z-ai/glm-5.2', name: 'GLM 5.2' }, { id: 'openai/gpt-5.5', name: 'GPT 5.5' }, { id: 'a-model', name: 'A Model' }] });
          }
          if (payload.url === 'https://custom.example/v1/chat/completions') {
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

      const panel = document.getElementById('ai-provider-panel');
      panel.innerHTML = `
        <input id="openrouter-key-input" value="sk-or-good">
        <button id="save-openrouter-key-btn">Save</button>
        <div id="openrouter-key-status"></div>
        <div id="openrouter-model-area"></div>
        <span id="or-balance"></span>
      `;
      await panels.handleSaveOpenRouterKey();
      panels.refreshOpenRouterBalance();
      await wait(50);
      const openRouterSaveAndBalance = document.getElementById('openrouter-key-status')?.textContent.includes('Connected')
        && document.getElementById('openrouter-model-select')?.value === 'openai/gpt-5.6-sol'
        && (document.getElementById('or-balance')?.textContent || '').includes('$0.75');

      panel.innerHTML = `
        <input id="venice-key-input" value="venice-good">
        <button id="save-venice-key-btn">Save</button>
        <div id="venice-key-status"></div>
        <div id="venice-model-area"></div>
        <span id="venice-balance"></span>
      `;
      await panels.handleSaveVeniceKey();
      panels.refreshVeniceBalance();
      await wait(50);
      const veniceSaveAndBalance = document.getElementById('venice-key-status')?.textContent.includes('Connected')
        && document.getElementById('venice-model-select')?.value === 'llama-3.3-70b'
        && (document.getElementById('venice-balance')?.textContent || '').includes('$0.42')
        && JSON.parse(localStorage.getItem('labcharts-venice-e2ee-models') || '[]').length === 1;

      panels.handleRemoveVeniceKey();
      const veniceRemoveClearsKeyModelsAndE2EE =
        localStorage.getItem('labcharts-venice-key') === null
        && localStorage.getItem('labcharts-venice-models') === null
        && localStorage.getItem('labcharts-venice-e2ee-models') === null
        && localStorage.getItem('labcharts-venice-model') === null
        && e2eeClears >= 1;

      localStorage.setItem('labcharts-routstr-node', 'https://routstr.example');
      panel.innerHTML = `
        <input id="routstr-key-input" value="sk-routstr-good">
        <button id="save-routstr-key-btn">Save</button>
        <div id="routstr-key-status"></div>
        <div id="routstr-model-area"></div>
      `;
      await panels.handleSaveRoutstrKey();
      await wait(0);
      const storedRoutstrKey = localStorage.getItem('labcharts-routstr-key');
      const routstrSaveRendersModels = document.getElementById('routstr-key-status')?.textContent.includes('Connected')
        && storedRoutstrKey?.startsWith('d1:') === true
        && !storedRoutstrKey.includes('sk-routstr-good')
        && await cryptoStore.encryptedGetItem('labcharts-routstr-key') === 'sk-routstr-good'
        && document.getElementById('routstr-model-select')?.value === 'claude-sonnet-5'
        && JSON.parse(localStorage.getItem('labcharts-routstr-vision-models') || '[]').includes('claude-sonnet-4.6');

      panels.handleRemoveRoutstrKey();
      const routstrRemoveClearsKeyModelsAndPricing =
        localStorage.getItem('labcharts-routstr-key') === null
        && localStorage.getItem('labcharts-routstr-models') === null
        && localStorage.getItem('labcharts-routstr-model') === null
        && localStorage.getItem('labcharts-routstr-pricing') === null
        && localStorage.getItem('labcharts-routstr-vision-models') === null;

      panel.innerHTML = `
        <input id="ppq-key-input" value="sk-ppq-good">
        <button id="save-ppq-key-btn">Save</button>
        <div id="ppq-key-status"></div>
        <div id="ppq-model-area"></div>
        <span id="ppq-balance"></span>
      `;
      await panels.handleSavePpqKey();
      await panels.refreshPpqBalance();
      await wait(0);
      const ppqSaveAndBalance = document.getElementById('ppq-key-status')?.textContent.includes('Connected')
        && document.getElementById('ppq-model-select')?.value === 'claude-sonnet-5'
        && (document.getElementById('ppq-balance')?.textContent || '').includes('$0.08');

      panel.innerHTML = `
        <input id="custom-url-input" value="https://custom.example/v1/">
        <input id="custom-key-input" value="sk-custom">
      `;
      await panels.handleSaveCustomApi();
      await wait(0);
      const customSaveRendersConnected = localStorage.getItem('labcharts-custom-url') === 'https://custom.example/v1'
        && document.getElementById('custom-key-status')?.textContent.includes('Connected')
        && document.getElementById('custom-model-select')?.value === 'openai/gpt-5.5';
      panels.handleRemoveCustomApi();
      await wait(0);
      const customRemoveRendersDisconnected = !localStorage.getItem('labcharts-custom-url')
        && document.getElementById('custom-key-status')?.textContent.includes('Not connected');

      panels.showInsufficientBalanceDialog();
      document.getElementById('or-add-credits').click();
      const addCreditsDialog = openedUrl === 'https://openrouter.ai/settings/credits'
        && !document.getElementById('or-no-balance-overlay')?.classList.contains('show');
      panels.showInsufficientBalanceDialog();
      document.getElementById('or-nb-cancel').click();
      const cancelBalanceDialog = !document.getElementById('or-no-balance-overlay')?.classList.contains('show');
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
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      cryptoStore.updateKeyCache('labcharts-custom-key', oldStorage['labcharts-custom-key'] || '');
      if (oldSessionPrevious == null) sessionStorage.removeItem('or_previous_ai_provider');
      else sessionStorage.setItem('or_previous_ai_provider', oldSessionPrevious);
      document.getElementById('settings-modal')?.remove();
      document.getElementById('ai-provider-panel')?.remove();
      document.getElementById('or-no-balance-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, { panelsUrl: moduleUrl('/js/provider-panels.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('ppq panels cover account reveal topup picker invoice states and cleanup', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ ppqUrl }) => {
    const ppq = await import(ppqUrl);
    const delegates = await import('/js/provider-panel-delegates.js');
    const cryptoStore = await import('/js/crypto.js');
    const settingsBridge = await import('/js/settings-runtime-bridge.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
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
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      fetch: window.fetch,
      setInterval: window.setInterval,
      clearInterval: window.clearInterval,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    const intervals = [];
    const copied = [];
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
      window.setInterval = (fn, ms) => {
        const id = nextIntervalId++;
        intervals.push({ id, fn, ms, cleared: false });
        return id;
      };
      window.clearInterval = id => {
        const interval = intervals.find(item => item.id === id);
        if (interval) interval.cleared = true;
      };
      window.fetch = async function(url) {
        const href = typeof url === 'string' ? url : url?.url || '';
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
        value: { writeText: async text => { copied.push(String(text || '')); } },
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
      const panel = document.getElementById('ai-provider-panel');
      panel.innerHTML = `
        <input id="ppq-key-input" value="sk-ppq-default">
        <button id="save-ppq-key-btn">Save</button>
        <div id="ppq-key-status"></div>
        <div id="ppq-model-area"></div>
      `;
      await ppq.handleSavePpqKey();
      const defaultSaveUsesNoopReturnCallback = document.getElementById('ppq-key-status')?.textContent.includes('Connected')
        && document.getElementById('ppq-model-select')?.value === 'claude-sonnet-4.6';

      localStorage.setItem('labcharts-ppq-key', 'sk-ppq-remove');
      localStorage.setItem('labcharts-ppq-credit-id', 'credit-remove');
      localStorage.setItem('labcharts-ppq-model', 'claude-sonnet-4.6');
      localStorage.setItem('labcharts-ppq-models', JSON.stringify([{ id: 'claude-sonnet-4.6', name: 'Claude' }]));
      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({ 'claude-sonnet-4.6': { input: 3, output: 15 } }));
      localStorage.setItem('labcharts-ppq-vision-models', JSON.stringify(['claude-sonnet-4.6']));
      const removePromise = ppq.handleRemovePpqKey();
      for (let i = 0; i < 50 && !document.getElementById('confirm-dialog-overlay')?.classList.contains('show'); i += 1) {
        await wait(10);
      }
      const removeMessage = document.querySelector('#confirm-dialog-overlay .confirm-message')?.textContent || '';
      document.getElementById('confirm-ok')?.click();
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

      panel.innerHTML = `
        <button data-provider-panel-action="create-ppq-account">Create Account (instant, no signup)</button>
        <div id="ppq-key-status"></div>
      `;

      await ppq.handleCreatePpqAccount();
      const revealPanel = document.getElementById('ai-provider-panel');
      const accountReveal = revealPanel?.textContent.includes('Save your account details')
        && revealPanel?.textContent.includes('credit-123')
        && !revealPanel.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onblur],[onsubmit]')
        && !!revealPanel.querySelector('[data-provider-panel-action="copy-ppq-key-reveal"]')
        && !!revealPanel.querySelector('[data-provider-panel-action="dismiss-ppq-key-reveal"]');
      revealPanel.querySelector('[data-provider-panel-action="copy-ppq-key-reveal"]')?.click();
      await wait(0);
      const accountRevealCopyDelegates = copied.some(text => text.includes('API Key: sk-created') && text.includes('Credit ID: credit-123'))
        && revealPanel.querySelector('[data-provider-panel-action="copy-ppq-key-reveal"]')?.textContent.includes('Copied');
      revealPanel.querySelector('[data-provider-panel-action="dismiss-ppq-key-reveal"]')?.click();
      await wait(0);
      await ppq.refreshPpqBalance();
      await wait(0);
      const dismissRerendersTopup = document.getElementById('ppq-topup-area')?.style.display === 'block'
        && document.getElementById('ppq-topup-toggle')?.textContent === 'Close'
        && document.getElementById('ppq-balance')?.textContent.includes('$1.25');

      document.querySelector('[data-provider-panel-action="select-ppq-method"][data-ppq-method="xmr"]')?.click();
      await wait(0);
      const methodSelected = document.querySelector('.ppq-method-btn.active .ppq-method-label')?.textContent === 'Monero'
        && (document.getElementById('ppq-topup-area')?.textContent || '').includes('min $5');
      document.querySelector('[data-provider-panel-action="show-ppq-custom-input"]')?.click();
      await wait(0);
      const customInputRenders = !!document.getElementById('ppq-custom-amount');
      document.getElementById('ppq-custom-amount').value = '4';
      ppq.doPpqTopupCustom();
      const rejectsLowCustom = [...document.querySelectorAll('.notification-toast')]
        .some(el => el.textContent.includes('Minimum amount is $5'));

      document.getElementById('ppq-custom-amount').value = '6';
      ppq.doPpqTopupCustom();
      await wait(250);
      const invoiceRenders = (document.getElementById('ppq-topup-area')?.textContent || '').includes('Monero')
        && document.querySelector('#ppq-topup-area a[href^="monero:"]') !== null
        && (document.getElementById('ppq-topup-area')?.textContent || '').includes('Show address');
      const topupArea = document.getElementById('ppq-topup-area');
      const invoiceUsesDelegatedActions = !topupArea.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onblur],[onsubmit]')
        && !!topupArea.querySelector('[data-provider-panel-action="copy-ppq-payment"]')
        && !!topupArea.querySelector('[data-provider-panel-action="cancel-ppq-topup"]');
      document.querySelector('#ppq-topup-area [data-provider-panel-action="copy-ppq-payment"]')?.click();
      await wait(0);
      const invoiceCopyDelegates = copied.includes('44AFFq5kSiGBoZ');
      const paidPoll = intervals.find(item => item.ms === 3000 && !item.cleared);
      const paidPollIntervalScheduled = !!paidPoll;
      if (paidPoll) await paidPoll.fn();
      const paidInvoiceUpdatesBalance = (document.getElementById('ppq-topup-area')?.textContent || '').includes('Payment received')
        && document.getElementById('ppq-balance')?.textContent.includes('$1.25');

      createMode = 'expired';
      await ppq.doPpqTopup(2);
      const expiredPoll = [...intervals].reverse().find(item => item.ms === 3000 && !item.cleared);
      const expiredPollIntervalScheduled = !!expiredPoll;
      if (expiredPoll) await expiredPoll.fn();
      const expiredInvoice = (document.getElementById('ppq-topup-status')?.textContent || '').includes('Invoice expired');

      createMode = 'error';
      await ppq.doPpqTopup(2);
      const topupError = (document.getElementById('ppq-topup-area')?.textContent || '').includes('bad topup');

      createMode = 'paid';
      await ppq.doPpqTopup(2);
      const cancelPoll = [...intervals].reverse().find(item => item.ms === 3000 && !item.cleared);
      const cancelPollIntervalScheduled = !!cancelPoll;
      document.querySelector('#ppq-topup-area [data-provider-panel-action="cancel-ppq-topup"]')?.click();
      await wait(0);
      const cancelHidesArea = document.getElementById('ppq-topup-area')?.style.display === 'none'
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
      else delete navigator.clipboard;
      ppq.configurePpqPanels({ returnToChatIfOnboarding: () => {} });
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      cryptoStore.updateKeyCache('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      document.getElementById('ai-provider-panel')?.remove();
      document.getElementById('ppq-topup-toggle')?.remove();
      document.getElementById('ppq-topup-area')?.remove();
      document.getElementById('ppq-balance')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, { ppqUrl: moduleUrl('/js/provider-ppq-panels.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
