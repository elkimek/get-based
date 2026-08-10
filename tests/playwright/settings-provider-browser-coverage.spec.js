import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?settingsProviderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('local AI settings controls cover connection, advisor, privacy, and hardware override branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ controlsUrl, piiUrl, providerStorageUrl }) => {
    const controls = await import(controlsUrl);
    const pii = await import(piiUrl);
    const providerStorage = await import(providerStorageUrl);
    const cryptoStore = await import('/js/crypto.js');
    const settingsBridge = await import('/js/settings-runtime-bridge.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    const storageKeys = [
      'labcharts-ollama',
      'labcharts-ollama-model',
      'labcharts-ollama-pii-url',
      'labcharts-ollama-pii-model',
      'labcharts-ollama-pii-key',
      'labcharts-ollama-pii-enabled',
      'labcharts-hw-vram-override',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      fetch: window.fetch,
      clipboard: navigator.clipboard,
    };
    const writes = [];
    let privacyUpdates = 0;
    let chatReturns = 0;
    let corsProbe = false;
    let localFetchCount = 0;
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      updatePrivacyStatusCard: () => { privacyUpdates += 1; },
    });

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-ollama', '');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async value => { writes.push(String(value)); },
        },
      });

      document.body.insertAdjacentHTML('beforeend', `
        <section id="local-ai-fixture">
          <input id="local-ai-url-input">
          <input id="local-ai-apikey-input" value="sk-local">
          <span id="local-ai-dot" class="local-ai-status-dot"></span>
          <span id="local-ai-status-text"></span>
          <div id="local-ai-model-section" style="display:none">
            <select id="local-ai-model-select"></select>
          </div>
          <div id="local-ai-advisor"></div>
          <input id="pii-local-url-input">
          <input id="pii-local-apikey-input" value="sk-pii-local">
          <span id="pii-local-dot" class="local-ai-status-dot"></span>
          <span id="pii-local-status-text"></span>
          <input id="pii-local-toggle" type="checkbox">
          <div id="pii-model-dropdown" style="display:none">
            <select id="pii-model-select"></select>
          </div>
        </section>
      `);

      const urlInput = document.getElementById('local-ai-url-input');
      const statusText = document.getElementById('local-ai-status-text');
      const dot = document.getElementById('local-ai-dot');

      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'http://localhost:11434/v1/models' && opts.method === 'HEAD') {
          return new Response('', { status: 204 });
        }
        if (href === 'http://localhost:11434/v1/models') {
          return jsonResponse({
            data: [{ id: 'llama3.2', name: 'Llama 3.2', size: 3200000000 }],
          });
        }
        if (href === 'http://localhost:11434/api/v1/models') {
          return jsonResponse({ error: 'unsupported' }, 404);
        }
        if (href === 'http://localhost:11434/api/tags') {
          return jsonResponse({
            models: [{ name: 'llama3.2', size: 3200000000, details: { parameter_size: '3B', quantization_level: 'Q4_K_M', family: 'llama' } }],
          });
        }
        if (href === 'http://localhost:11434/api/ps') {
          return jsonResponse({ models: [{ name: 'llama3.2', size_vram: 2800000000, context_length: 8192 }] });
        }
        return oldGlobals.fetch.call(window, url, opts);
      };
      urlInput.value = 'http://localhost:11434';
      await controls.testOllamaConnection();
      await wait(0);
      const defaultReturnCallbackAllowsConnection = statusText.textContent.includes('Connected')
        && dot.classList.contains('connected')
        && chatReturns === 0;

      controls.configureLocalAiControls({
        returnToChatIfOnboarding: () => { chatReturns += 1; },
      });

      urlInput.value = 'not a url';
      await controls.testOllamaConnection();
      const invalidUrlBranch = statusText.textContent.includes('valid Local AI URL')
        && dot.classList.contains('disconnected');

      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'http://localhost:11434/v1/models' && opts.method === 'HEAD' && opts.mode === 'no-cors') {
          corsProbe = true;
          return new Response('', { status: 200 });
        }
        if (href === 'http://localhost:11434/v1/models' && opts.method === 'HEAD') {
          throw new TypeError('Failed to fetch');
        }
        return oldGlobals.fetch.call(window, url, opts);
      };
      urlInput.value = 'http://localhost:11434';
      await controls.testOllamaConnection();
      const corsHelp = corsProbe
        && statusText.textContent.includes('Blocked by CORS')
        && dot.classList.contains('disconnected');

      window.fetch = async function(url, opts = {}) {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href === 'http://localhost:11434/v1/models' && opts.method === 'HEAD') {
          return new Response('', { status: 204 });
        }
        if (href === 'http://localhost:11434/v1/models') {
          localFetchCount += 1;
          return jsonResponse({
            data: [
              { id: 'llama3.2', name: 'Llama 3.2', size: 3200000000 },
              { id: 'qwen2.5:14b', name: 'Qwen 14B', size: 9200000000 },
            ],
          });
        }
        if (href === 'http://localhost:11434/api/v1/models') {
          return jsonResponse({ error: 'unsupported' }, 404);
        }
        if (href === 'http://localhost:11434/api/tags') {
          return jsonResponse({
            models: [
              { name: 'llama3.2', size: 3200000000, details: { parameter_size: '3B', quantization_level: 'Q4_K_M', family: 'llama' } },
              { name: 'qwen2.5:14b', size: 9200000000, details: { parameter_size: '14B', quantization_level: 'Q4_K_M', family: 'qwen' } },
            ],
          });
        }
        if (href === 'http://localhost:11434/api/ps') {
          return jsonResponse({
            models: [{ name: 'qwen2.5:14b', size_vram: 8700000000, context_length: 16384 }],
          });
        }
        return oldGlobals.fetch.call(window, url, opts);
      };
      urlInput.value = ' http://localhost:11434/ ';
      providerStorage.setOllamaMainModel('kimi-k2.5:cloud');
      await controls.testOllamaConnection();
      await wait(0);
      const localConnectSuccess = statusText.textContent.includes('Connected')
        && dot.classList.contains('connected')
        && document.getElementById('local-ai-model-section')?.style.display === 'block'
        && document.getElementById('local-ai-model-select')?.options.length === 2
        && document.getElementById('local-ai-advisor')?.textContent.includes('llama3.2')
        && localFetchCount >= 1
        && privacyUpdates >= 1
        && chatReturns === 1;
      const staleLocalModelReconciled = providerStorage.getOllamaMainModel() === 'llama3.2'
        && statusText.textContent.includes('llama3.2')
        && !statusText.textContent.includes('kimi-k2.5:cloud');
      const ollamaAllocationDisplayed = document.getElementById('local-ai-advisor')?.textContent.includes('currently allocated')
        && document.getElementById('local-ai-advisor')?.textContent.includes('8.7 GB VRAM')
        && document.getElementById('local-ai-advisor')?.textContent.includes('loaded now')
        && document.getElementById('local-ai-advisor')?.textContent.includes('available \u2014 loads on first request')
        && !document.getElementById('local-ai-advisor')?.textContent.includes('not loaded');
      document.getElementById('local-ai-advisor').innerHTML = '';
      controls.refreshModelAdvisor();
      for (let i = 0; i < 20 && !document.getElementById('local-ai-advisor')?.textContent.includes('qwen2.5:14b'); i += 1) {
        await wait(10);
      }
      const refreshModelAdvisorRerendersCachedDetails =
        document.getElementById('local-ai-advisor')?.textContent.includes('qwen2.5:14b');

      controls.copyOllamaPullCmd('ollama pull qwen2.5:14b');
      await wait(0);
      const copyPullCommand = writes.includes('ollama pull qwen2.5:14b');

      const overrideToggle = document.querySelector('[data-local-ai-action="toggle-override"]');
      overrideToggle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const hardwareOverrideKeyboardToggle = document.querySelector('.model-advisor-override-body')?.style.display === 'flex'
        && overrideToggle?.getAttribute('aria-expanded') === 'true';
      document.getElementById('hw-vram-override-input').value = '16';
      document.querySelector('[data-local-ai-action="apply-hardware-override"]')?.click();
      for (let i = 0; i < 20 && !document.getElementById('local-ai-advisor')?.textContent.includes('16 GB'); i += 1) {
        await wait(10);
      }
      const hardwareOverrideApplied = localStorage.getItem('labcharts-hw-vram-override') === '16'
        && document.getElementById('local-ai-advisor')?.textContent.includes('16 GB');
      controls.applyHardwareOverride('0');
      await wait(0);
      const invalidHardwareOverride = [...document.querySelectorAll('.notification-toast')]
        .some(el => el.textContent.includes('valid VRAM'));
      document.querySelector('[data-local-ai-action="clear-hardware-override"]')?.click();
      for (let i = 0; i < 20 && localStorage.getItem('labcharts-hw-vram-override'); i += 1) {
        await wait(10);
      }
      const hardwareOverrideCleared = !localStorage.getItem('labcharts-hw-vram-override');

      document.getElementById('pii-local-url-input').value = 'http://localhost:11434';
      await controls.testPIIOllamaConnection();
      const piiConnectSuccess = document.getElementById('pii-local-status-text')?.textContent.includes('Connection verified')
        && document.getElementById('pii-local-dot')?.classList.contains('connected')
        && document.getElementById('pii-local-toggle')?.checked === false
        && document.getElementById('pii-model-dropdown')?.style.display === 'block'
        && document.getElementById('pii-model-select')?.options.length === 2
        && localStorage.getItem('labcharts-ollama-pii-enabled') !== 'true'
        && providerStorage.getOllamaPIIApiKey() === 'sk-pii-local';

      await providerStorage.saveOllamaConfig({ url: 'https://remote.example/v1', model: 'remote-model', mode: 'openai-compatible', apiKey: '' });
      document.getElementById('local-ai-model-select').innerHTML = '<option value="remote-small">remote-small</option><option value="remote-huge">remote-huge</option>';
      await controls.renderModelAdvisor([
        { name: 'remote-small', size: 2000000000, quantLevel: 'Q4', paramSize: '2B' },
        { name: 'remote-huge', size: 30000000000, quantLevel: 'Q4', paramSize: '30B' },
      ], document.getElementById('local-ai-model-select'), false);
      const remoteAdvisorPromptsVram = document.getElementById('local-ai-advisor')?.textContent.includes('Remote server')
        && document.querySelector('.model-advisor-override-body')?.style.display === 'flex';

      return {
        defaultReturnCallbackAllowsConnection,
        invalidUrlBranch,
        corsHelp,
        localConnectSuccess,
        staleLocalModelReconciled,
        ollamaAllocationDisplayed,
        refreshModelAdvisorRerendersCachedDetails,
        copyPullCommand,
        hardwareOverrideKeyboardToggle,
        hardwareOverrideApplied,
        invalidHardwareOverride,
        hardwareOverrideCleared,
        piiConnectSuccess,
        remoteAdvisorPromptsVram,
      };
    } finally {
      window.fetch = oldGlobals.fetch;
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      if (oldGlobals.clipboard) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: oldGlobals.clipboard });
      }
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      cryptoStore.updateKeyCache('labcharts-ollama', oldStorage['labcharts-ollama'] || '');
      document.getElementById('local-ai-fixture')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, {
    controlsUrl: moduleUrl('/js/provider-local-ai-controls.js'),
    piiUrl: moduleUrl('/js/pii.js'),
    providerStorageUrl: moduleUrl('/js/api-provider-storage.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('switching local backends automatically releases the previous server VRAM first', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const result = await page.evaluate(async ({ controlsUrl, providerStorageUrl }) => {
    const controls = await import(controlsUrl);
    const providerStorage = await import(providerStorageUrl);
    const discovery = await import('/js/local-ai-discovery.js');
    const cryptoStore = await import('/js/crypto.js');
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const oldFetch = window.fetch;
    const oldConfig = cryptoStore.getCachedKey('labcharts-ollama');
    const oldModel = localStorage.getItem('labcharts-ollama-model');
    const unloadBodies = [];
    try {
      document.body.insertAdjacentHTML('beforeend', `
        <section id="local-ai-switch-fixture">
          <input id="local-ai-url-input" value="http://10.222.88.195:11434">
          <input id="local-ai-apikey-input" value="">
          <span id="local-ai-dot" class="local-ai-status-dot"></span>
          <span id="local-ai-status-text"></span>
          <div id="local-ai-model-section" style="display:none"><select id="local-ai-model-select"></select></div>
          <div id="local-ai-advisor"></div>
        </section>
      `);
      await providerStorage.saveOllamaConfig({
        url: 'http://10.222.88.195:1234',
        model: 'qwen/qwen3.6-27b',
        mode: 'openai-compatible',
        apiKey: '',
      });
      providerStorage.setOllamaMainModel('qwen/qwen3.6-27b');
      discovery.clearLocalAiDiscovery();

      window.fetch = async (url, options = {}) => {
        const href = String(url);
        if (options.method === 'HEAD' && href.endsWith('/v1/models')) return new Response('', { status: 204 });
        if (href === 'http://10.222.88.195:1234/api/v1/models') {
          return jsonResponse({ models: [{
            type: 'llm',
            key: 'qwen/qwen3.6-27b',
            size_bytes: 17_478_734_335,
            loaded_instances: [{ id: 'qwen-lm-instance', config: { context_length: 32768 } }],
          }] });
        }
        if (href === 'http://10.222.88.195:1234/v1/models') {
          return jsonResponse({ data: [{ id: 'qwen/qwen3.6-27b' }] });
        }
        if (href === 'http://10.222.88.195:1234/api/v1/models/unload' && options.method === 'POST') {
          unloadBodies.push(JSON.parse(options.body));
          return jsonResponse({ ok: true });
        }
        if (href === 'http://10.222.88.195:11434/api/v1/models') return jsonResponse({}, 404);
        if (href === 'http://10.222.88.195:11434/v1/models') return jsonResponse({ data: [{ id: 'qwen3.6:27b' }] });
        if (href === 'http://10.222.88.195:11434/api/tags') {
          return jsonResponse({ models: [{ name: 'qwen3.6:27b', details: { context_length: 262144 } }] });
        }
        if (href === 'http://10.222.88.195:11434/api/ps') return jsonResponse({ models: [] });
        throw new Error(`Unexpected URL: ${href}`);
      };

      await controls.testOllamaConnection();

      return {
        noConfirmationRequired: !document.getElementById('confirm-dialog-overlay'),
        unloadUsesLoadedInstance: unloadBodies.length === 1
          && unloadBodies[0].instance_id === 'qwen-lm-instance',
        switchSavedAfterRelease: providerStorage.getOllamaConfig().url === 'http://10.222.88.195:11434'
          && providerStorage.getOllamaConfig().mode === 'ollama'
          && providerStorage.getOllamaMainModel() === 'qwen3.6:27b',
        statusShowsNewServer: document.getElementById('local-ai-status-text')?.textContent.includes('qwen3.6:27b'),
      };
    } finally {
      window.fetch = oldFetch;
      discovery.clearLocalAiDiscovery();
      cryptoStore.updateKeyCache('labcharts-ollama', oldConfig || '');
      if (oldModel == null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', oldModel);
      document.getElementById('local-ai-switch-fixture')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, {
    controlsUrl: moduleUrl('/js/provider-local-ai-controls.js'),
    providerStorageUrl: moduleUrl('/js/api-provider-storage.js'),
  });

  for (const [name, passed] of Object.entries(result)) expect(passed, name).toBe(true);
});

test('settings sync and agent access delegates cover setup, restore, relay, tombstone, and token paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });

  const results = await page.evaluate(async ({ syncPanelUrl, syncStateUrl, syncRuntimeUrl, syncMessengerUrl }) => {
    const syncPanel = await import(syncPanelUrl);
    await syncPanel.loadSettingsSyncPanelModule();
    const syncState = await import(syncStateUrl);
    const syncRuntime = await import(syncRuntimeUrl);
    const syncMessenger = await import(syncMessengerUrl);
    const settingsBridge = await import('/js/settings-runtime-bridge.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const words = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
    const mnemonic = words.join(' ');

    const storageKeys = [
      'labcharts-sync-enabled',
      'labcharts-sync-paused',
      'labcharts-sync-relay',
      'labcharts-messenger-enabled',
      'labcharts-messenger-token',
      'labcharts-agent-context-key',
      'labcharts-agent-wearable-series-days',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      clipboard: navigator.clipboard,
      fetch: window.fetch,
      WebSocket: window.WebSocket,
    };
    const writes = [];
    const applied = [];
    const rejected = [];
    const openedTabs = [];
    let syncIndicatorUpdates = 0;
    let pushedContexts = 0;
    const previousSettingsBridge = settingsBridge.configureSettingsModuleBridge({
      openSettingsModal: tab => { openedTabs.push(tab); },
    });
    const previousSyncPanelDeps = syncPanel.configureSettingsSyncPanelDeps({
      applyPendingTombstone: async id => { applied.push(id); },
      rejectPendingTombstone: async id => { rejected.push(id); },
      listPendingTombstones: () => [{ id: 'profile-old', name: 'Old Profile', at: '2026-06-07T12:00:00Z' }],
      updateSyncIndicator: () => { syncIndicatorUpdates += 1; },
      pushContextToGateway: () => { pushedContexts += 1; },
    });

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      syncState.setSyncEnabled(false);
      window.fetch = async () => new Response('', { status: 200 });
      window.WebSocket = class {
        constructor(url) {
          this.url = url;
          Promise.resolve().then(() => this.onopen?.());
        }
        close() {}
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async value => { writes.push(String(value)); },
        },
      });

      document.body.insertAdjacentHTML('beforeend', `
        <section id="sync-section"></section>
        <section id="messenger-section"></section>
      `);
      const syncSection = document.getElementById('sync-section');
      const messengerSection = document.getElementById('messenger-section');

      syncSection.innerHTML = syncPanel.renderSyncSection();
      const tombstoneBanner = syncSection.textContent.includes('Old Profile');
      syncSection.querySelector('[data-sync-action="apply-tombstone"]').click();
      syncSection.querySelector('[data-sync-action="reject-tombstone"]').click();
      const tombstoneDelegates = await waitFor(() => applied.includes('profile-old')
        && rejected.includes('profile-old')
        && openedTabs.filter(tab => tab === 'data').length >= 2, 'tombstone delegates');

      syncSection.querySelector('[data-sync-action="toggle-sync"]').checked = true;
      syncSection.querySelector('[data-sync-action="toggle-sync"]').dispatchEvent(new Event('change', { bubbles: true }));
      await wait(0);
      const setupOverlay = document.getElementById('sync-setup-overlay');
      const setupModalOpened = setupOverlay?.classList.contains('show')
        && syncSection.querySelector('[data-sync-action="toggle-sync"]')?.checked === true;
      setupOverlay.click();
      const setupNudgesOnBackdrop = setupOverlay.querySelector('.confirm-dialog')?.classList.contains('modal-nudge');
      setupOverlay.querySelector('[data-sync-setup-action="setup-restore"]').click();
      const setupRestoreShown = setupOverlay.querySelector('#sync-setup-restore')?.style.display === 'block';
      setupOverlay.querySelector('[data-sync-setup-action="setup-back"]').click();
      const setupBackRestoresChoices = setupOverlay.querySelector('#sync-setup-choices')?.style.display === '';

      const setupDoneButton = document.createElement('button');
      setupDoneButton.dataset.syncSetupAction = 'setup-done';
      setupOverlay.querySelector('.confirm-dialog')?.appendChild(setupDoneButton);
      setupDoneButton.click();
      const setupDoneCloses = !setupOverlay.classList.contains('show');

      syncState.setSyncEnabled(true);
      localStorage.setItem('labcharts-sync-enabled', 'true');
      messengerSection.innerHTML = syncPanel.renderMessengerSection();
      const ownerPendingToggle = messengerSection.querySelector('[data-sync-action="toggle-messenger"]');
      const ownerPendingDisabled = ownerPendingToggle?.disabled === true;
      syncRuntime.setSyncAppOwner({
        id: 'abcdefghijklmnopqrstuv',
        writeKey: new Uint8Array(32).fill(7),
      });
      await wait(0);
      const ownerReadyRerenderEnables = messengerSection.querySelector('[data-sync-action="toggle-messenger"]')?.disabled === false;
      localStorage.setItem('labcharts-sync-relay', 'wss://relay.example');
      syncSection.innerHTML = syncPanel.renderSyncSection();
      const enabledRender = syncSection.textContent.includes('Your mnemonic')
        && syncSection.querySelector('#sync-relay-input')?.value === 'wss://relay.example';
      syncState.setSyncPaused(true);
      syncSection.innerHTML = syncPanel.renderSyncSection();
      const pausedRender = syncSection.textContent.includes('Paused')
        && syncSection.textContent.includes('identity and sync history are retained')
        && !!syncSection.querySelector('[data-sync-action="resume-sync"]')
        && !!syncSection.querySelector('[data-sync-action="disconnect-sync"]')
        && !syncSection.querySelector('[data-sync-action="setup-restore-direct"]');
      syncState.setSyncPaused(false);
      syncSection.innerHTML = syncPanel.renderSyncSection();
      syncSection.querySelector('[data-sync-action="open-restore-dialog"]').click();
      await wait(0);
      const restoreOverlay = document.getElementById('sync-restore-overlay');
      const restoreDialogOpens = restoreOverlay?.classList.contains('show')
        && restoreOverlay.querySelector('#sync-restore-dialog-go')?.disabled === true;
      const restoreInput = restoreOverlay.querySelector('#sync-restore-dialog-input');
      restoreInput.value = words.slice(0, 3).join(' ');
      restoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      const restoreCountsWords = restoreOverlay.querySelector('#sync-restore-dialog-msg')?.textContent.includes('3 words');
      restoreInput.value = mnemonic;
      restoreInput.dispatchEvent(new Event('input', { bubbles: true }));
      const restoreEnablesSubmit = restoreOverlay.querySelector('#sync-restore-dialog-msg')?.textContent.includes('24 words')
        && restoreOverlay.querySelector('#sync-restore-dialog-go')?.disabled === false;
      restoreOverlay.click();
      const restoreBackdropCloses = !restoreOverlay.classList.contains('show');

      const relayInput = syncSection.querySelector('#sync-relay-input');
      relayInput.value = 'https://bad-relay.example';
      syncSection.querySelector('[data-sync-action="save-relay"]').click();
      await wait(0);
      const invalidRelayToast = [...document.querySelectorAll('.notification-toast')]
        .some(el => el.textContent.includes('Relay URL must start'));
      relayInput.value = 'wss://new-relay.example';
      syncSection.querySelector('[data-sync-action="save-relay"]').click();
      const relaySaved = await waitFor(() => localStorage.getItem('labcharts-sync-relay') === 'wss://new-relay.example'
        && syncIndicatorUpdates >= 1
        && document.getElementById('sync-status-text')?.textContent.includes('Connected'), 'relay connected status');

      messengerSection.innerHTML = syncPanel.renderMessengerSection();
      messengerSection.querySelector('[data-sync-action="toggle-messenger"]').checked = true;
      messengerSection.querySelector('[data-sync-action="toggle-messenger"]').dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => syncMessenger.isMessengerEnabled()
        && messengerSection.textContent.includes('Read-only token')
        && messengerSection.textContent.includes('GETBASED_AGENT_CONTEXT_KEY'), 'Agent Access enable render');
      const token = syncMessenger.getMessengerToken();
      const contextKey = syncMessenger.getMessengerContextKey();
      const messengerEnabled = localStorage.getItem('labcharts-messenger-enabled') === 'true'
        && !localStorage.getItem('labcharts-messenger-token')
        && !localStorage.getItem('labcharts-agent-context-key')
        && !!token
        && !!contextKey
        && messengerSection.textContent.includes('Read-only token')
        && messengerSection.textContent.includes('Context encryption key')
        && messengerSection.textContent.includes('GETBASED_AGENT_CONTEXT_KEY');
      messengerSection.querySelector('[data-sync-action="toggle-messenger-token"]').click();
      const tokenShown = document.getElementById('messenger-token')?.dataset.masked === 'false'
        && document.getElementById('messenger-token')?.textContent !== '•'.repeat(64)
        && document.getElementById('messenger-token-toggle')?.textContent === 'Hide';
      messengerSection.querySelector('[data-sync-action="toggle-messenger-context-key"]').click();
      const contextKeyShown = document.getElementById('messenger-context-key')?.dataset.masked === 'false'
        && document.getElementById('messenger-context-key')?.textContent === contextKey
        && document.getElementById('messenger-context-key-toggle')?.textContent === 'Hide';
      messengerSection.querySelector('[data-sync-action="copy-messenger-token"]').click();
      messengerSection.querySelector('[data-sync-action="copy-messenger-context-key"]').click();
      await wait(0);
      const tokenCopied = writes.includes(token);
      const contextKeyCopied = writes.includes(contextKey);
      messengerSection.querySelector('[data-sync-action="set-agent-wearable-series-days"]').value = '30';
      messengerSection.querySelector('[data-sync-action="set-agent-wearable-series-days"]').dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => pushedContexts >= 1, 'series save then context push');
      const seriesProfileId = localStorage.getItem('labcharts-active-profile') || 'default';
      const seriesDelegated = syncMessenger.getAgentAccessState().wearableSeriesDays === 30
        && localStorage.getItem(`labcharts-${seriesProfileId}-agent-wearable-series`) === '30'
        && !('getAgentWearableSeriesDays' in window)
        && !('setAgentWearableSeriesDays' in window)
        && pushedContexts >= 1;
      messengerSection.querySelector('[data-sync-action="regenerate-messenger-token"]').click();
      await waitFor(() => syncMessenger.getMessengerToken() !== token
        && messengerSection.textContent.includes('Read-only token'), 'token regenerated');
      const regenerated = !localStorage.getItem('labcharts-messenger-token')
        && syncMessenger.getMessengerToken() !== token
        && messengerSection.textContent.includes('Read-only token');
      const contextKeyBeforeRegen = syncMessenger.getMessengerContextKey();
      messengerSection.querySelector('[data-sync-action="regenerate-messenger-context-key"]').click();
      await waitFor(() => syncMessenger.getMessengerContextKey() !== contextKeyBeforeRegen
        && messengerSection.textContent.includes('Context encryption key'), 'context key regenerated');
      const contextKeyRegenerated = !localStorage.getItem('labcharts-agent-context-key')
        && syncMessenger.getMessengerContextKey() !== contextKeyBeforeRegen
        && messengerSection.textContent.includes('Context encryption key');
      syncRuntime.setSyncAppOwner(null);
      messengerSection.innerHTML = syncPanel.renderMessengerSection();
      const ownerLostToggle = messengerSection.querySelector('[data-sync-action="toggle-messenger"]');
      const ownerLostCanDisable = ownerLostToggle?.checked === true
        && ownerLostToggle?.disabled === false
        && messengerSection.querySelector('[data-sync-action="regenerate-messenger-token"]')?.disabled === true
        && messengerSection.querySelector('[data-sync-action="regenerate-messenger-context-key"]')?.disabled === true
        && messengerSection.querySelector('[data-sync-action="set-agent-wearable-series-days"]')?.disabled === true;
      ownerLostToggle.checked = false;
      ownerLostToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(0);
      const messengerDisabled = localStorage.getItem('labcharts-messenger-enabled') === 'false'
        && !localStorage.getItem('labcharts-messenger-token')
        && !localStorage.getItem('labcharts-agent-context-key')
        && messengerSection.textContent.includes('Let AI agents query your labs');

      return {
        tombstoneBanner,
        tombstoneDelegates,
        setupModalOpened,
        setupNudgesOnBackdrop,
        setupRestoreShown,
        setupBackRestoresChoices,
        setupDoneCloses,
        ownerPendingDisabled,
        ownerReadyRerenderEnables,
        enabledRender,
        pausedRender,
        restoreDialogOpens,
        restoreCountsWords,
        restoreEnablesSubmit,
        restoreBackdropCloses,
        invalidRelayToast,
        relaySaved,
        messengerEnabled,
        tokenShown,
        contextKeyShown,
        tokenCopied,
        contextKeyCopied,
        seriesDelegated,
        regenerated,
        contextKeyRegenerated,
        ownerLostCanDisable,
        messengerDisabled,
      };
    } finally {
      settingsBridge.configureSettingsModuleBridge(previousSettingsBridge);
      syncPanel.configureSettingsSyncPanelDeps(previousSyncPanelDeps);
      window.fetch = oldGlobals.fetch;
      window.WebSocket = oldGlobals.WebSocket;
      if (oldGlobals.clipboard) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: oldGlobals.clipboard });
      }
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      syncRuntime.setSyncAppOwner(null);
      syncState.setSyncEnabled(oldStorage['labcharts-sync-enabled'] === 'true');
      document.getElementById('sync-section')?.remove();
      document.getElementById('messenger-section')?.remove();
      document.getElementById('sync-setup-overlay')?.remove();
      document.getElementById('sync-restore-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, {
    syncPanelUrl: '/js/settings-sync-panel.js',
    syncStateUrl: '/js/sync-settings-state.js',
    syncRuntimeUrl: '/js/sync-runtime.js',
    syncMessengerUrl: '/js/sync-messenger.js',
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
