import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?providerCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('provider model controls cover dropdowns custom models and delegates', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ controlsUrl }) => {
    const controls = await import(controlsUrl);
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
      callClaudeAPI: window.callClaudeAPI,
      clearE2EESession: window.clearE2EESession,
      updateChatHeaderModel: window.updateChatHeaderModel,
      refreshWebSearchToggle: window.refreshWebSearchToggle,
      consoleWarn: console.warn,
    };

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

      window.clearE2EESession = () => { clearCount += 1; };
      window.updateChatHeaderModel = () => { headerRefreshes += 1; };
      window.refreshWebSearchToggle = () => { searchRefreshes += 1; };
      console.warn = message => { warnings.push(String(message)); };

      localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
        'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      }));
      localStorage.setItem('labcharts-openrouter-model', 'anthropic/claude-sonnet-4.6');
      controls.renderOpenRouterModelDropdown([
        { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
        { id: 'x-ai/grok-4', name: 'Grok 4' },
      ]);
      const openRouterRecommended = !!document.querySelector('#openrouter-model-select optgroup[label*="Recommended"] option[value="anthropic/claude-sonnet-4.6"]');
      const openRouterPricing = (document.getElementById('openrouter-model-pricing')?.textContent || '').includes('$3.00/M in');

      let fetchedPricing = false;
      window.callClaudeAPI = async () => ({ content: 'ok' });
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

      window.callClaudeAPI = async () => { throw new Error('offline model'); };
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

      localStorage.setItem('labcharts-ppq-model', 'ppq-b');
      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({ 'ppq-b': { input: 0.5, output: 1.5 } }));
      controls.renderPpqModelDropdown([
        { id: 'ppq-a', name: 'PPQ A' },
        { id: 'ppq-b', name: 'PPQ B' },
      ]);
      controls.updatePpqModelPricing('ppq-b');
      const ppqModelPricing = document.getElementById('ppq-model-select')?.value === 'ppq-b'
        && (document.getElementById('ppq-model-pricing')?.textContent || '').includes('$0.50/M in');

      localStorage.setItem('labcharts-custom-model', 'outside-model');
      controls.renderCustomApiModelDropdown([{ id: 'model-a', name: 'Model A' }]);
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
        ppqModelPricing,
        customModelRenders,
        customManualApplied,
        delegatesCovered,
      };
    } finally {
      window.fetch = oldGlobals.fetch;
      window.callClaudeAPI = oldGlobals.callClaudeAPI;
      window.clearE2EESession = oldGlobals.clearE2EESession;
      window.updateChatHeaderModel = oldGlobals.updateChatHeaderModel;
      window.refreshWebSearchToggle = oldGlobals.refreshWebSearchToggle;
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
      open: window.open,
      openSettingsModal: window.openSettingsModal,
      closeSettingsModal: window.closeSettingsModal,
      openChatPanel: window.openChatPanel,
      loadFocusCard: window.loadFocusCard,
    };

    let openedUrl = '';
    let settingsClosed = 0;
    let chatOpened = 0;
    let focusLoads = 0;

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      window.updateKeyCache?.('labcharts-openrouter-key', '');
      window.updateKeyCache?.('labcharts-venice-key', '');
      window.updateKeyCache?.('labcharts-ppq-key', '');
      window.updateKeyCache?.('labcharts-custom-key', '');
      window.open = url => { openedUrl = String(url); return null; };
      window.openSettingsModal = () => {};
      window.closeSettingsModal = () => { settingsClosed += 1; };
      window.openChatPanel = () => { chatOpened += 1; };
      window.loadFocusCard = () => { focusLoads += 1; };

      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'https://openrouter.ai/api/v1/models') {
          return jsonResponse({
            data: [
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
              { id: 'claude-sonnet-4.6', name: 'Claude', pricing: { input_per_1M_tokens: '3', output_per_1M_tokens: '15' }, architecture: { input_modalities: ['text', 'image'] } },
              { id: 'codex-not-used', name: 'Codex' },
            ],
          });
        }
        if (href === 'https://api.ppq.ai/credits/balance') {
          return jsonResponse({ balance: '0.08' });
        }
        if (href === 'https://custom.example/v1/models') {
          return jsonResponse({ data: [{ id: 'z-model', name: 'Z Model' }, { id: 'a-model', name: 'A Model' }] });
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
        && document.getElementById('openrouter-model-select')?.value === 'anthropic/claude-sonnet-4.6'
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
        && document.getElementById('ppq-model-select')?.value === 'claude-sonnet-4.6'
        && (document.getElementById('ppq-balance')?.textContent || '').includes('$0.08');

      panel.innerHTML = `
        <input id="custom-url-input" value="https://custom.example/v1/">
        <input id="custom-key-input" value="sk-custom">
      `;
      await window.handleSaveCustomApi();
      await wait(0);
      const customSaveRendersConnected = localStorage.getItem('labcharts-custom-url') === 'https://custom.example/v1'
        && document.getElementById('custom-key-status')?.textContent.includes('Connected')
        && document.getElementById('custom-model-select')?.value === 'a-model';
      window.handleRemoveCustomApi();
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

      return {
        switchStoresPrevious,
        switchClearsOAuth,
        pauseStoresDisabled,
        pauseStoresEnabled,
        openRouterSaveAndBalance,
        veniceSaveAndBalance,
        ppqSaveAndBalance,
        customSaveRendersConnected,
        customRemoveRendersDisconnected,
        addCreditsDialog,
        cancelBalanceDialog,
      };
    } finally {
      window.fetch = oldGlobals.fetch;
      window.open = oldGlobals.open;
      window.openSettingsModal = oldGlobals.openSettingsModal;
      window.closeSettingsModal = oldGlobals.closeSettingsModal;
      window.openChatPanel = oldGlobals.openChatPanel;
      window.loadFocusCard = oldGlobals.loadFocusCard;
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      window.updateKeyCache?.('labcharts-openrouter-key', oldStorage['labcharts-openrouter-key'] || '');
      window.updateKeyCache?.('labcharts-venice-key', oldStorage['labcharts-venice-key'] || '');
      window.updateKeyCache?.('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      window.updateKeyCache?.('labcharts-custom-key', oldStorage['labcharts-custom-key'] || '');
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
    };
    const intervals = [];
    let nextIntervalId = 1;
    let returnToChatCount = 0;
    let createMode = 'paid';

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      window.updateKeyCache?.('labcharts-ppq-key', '');
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

      ppq.configurePpqPanels({
        returnToChatIfOnboarding: () => { returnToChatCount += 1; },
      });

      document.body.insertAdjacentHTML('beforeend', `
        <div id="ai-provider-panel">
          <button onclick="handleCreatePpqAccount()">Create Account (instant, no signup)</button>
          <div id="ppq-key-status"></div>
        </div>
      `);

      await ppq.handleCreatePpqAccount();
      const accountReveal = document.getElementById('ai-provider-panel')?.textContent.includes('Save your account details')
        && document.getElementById('ai-provider-panel')?.textContent.includes('credit-123');
      ppq.dismissPpqKeyReveal();
      await ppq.refreshPpqBalance();
      await wait(0);
      const dismissRerendersTopup = document.getElementById('ppq-topup-area')?.style.display === 'block'
        && document.getElementById('ppq-topup-toggle')?.textContent === 'Close'
        && document.getElementById('ppq-balance')?.textContent.includes('$1.25');

      ppq.selectPpqMethod('xmr');
      const methodSelected = document.querySelector('.ppq-method-btn.active .ppq-method-label')?.textContent === 'Monero'
        && (document.getElementById('ppq-topup-area')?.textContent || '').includes('min $5');
      ppq.ppqShowCustomInput();
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
      const paidPoll = intervals.find(item => item.ms === 3000 && !item.cleared);
      if (paidPoll) await paidPoll.fn();
      const paidInvoiceUpdatesBalance = (document.getElementById('ppq-topup-area')?.textContent || '').includes('Payment received')
        && document.getElementById('ppq-balance')?.textContent.includes('$1.25');

      createMode = 'expired';
      await ppq.doPpqTopup(2);
      const expiredPoll = [...intervals].reverse().find(item => item.ms === 3000 && !item.cleared);
      if (expiredPoll) await expiredPoll.fn();
      const expiredInvoice = (document.getElementById('ppq-topup-status')?.textContent || '').includes('Invoice expired');

      createMode = 'error';
      await ppq.doPpqTopup(2);
      const topupError = (document.getElementById('ppq-topup-area')?.textContent || '').includes('bad topup');

      ppq.cancelPpqTopup();
      const cancelHidesArea = document.getElementById('ppq-topup-area')?.style.display === 'none'
        && intervals.some(item => item.cleared);

      return {
        accountReveal,
        dismissRerendersTopup,
        methodSelected,
        customInputRenders,
        rejectsLowCustom,
        invoiceRenders,
        paidInvoiceUpdatesBalance,
        expiredInvoice,
        topupError,
        cancelHidesArea,
        noUnexpectedReturn: returnToChatCount === 0,
      };
    } finally {
      ppq.clearPpqTopupTimers();
      window.fetch = oldGlobals.fetch;
      window.setInterval = oldGlobals.setInterval;
      window.clearInterval = oldGlobals.clearInterval;
      ppq.configurePpqPanels({ returnToChatIfOnboarding: () => {} });
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      window.updateKeyCache?.('labcharts-ppq-key', oldStorage['labcharts-ppq-key'] || '');
      document.getElementById('ai-provider-panel')?.remove();
      document.getElementById('ppq-topup-toggle')?.remove();
      document.getElementById('ppq-topup-area')?.remove();
      document.getElementById('ppq-balance')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, { ppqUrl: moduleUrl('/js/provider-ppq-panels.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
