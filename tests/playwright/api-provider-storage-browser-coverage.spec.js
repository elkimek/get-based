import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?apiProviderStorageCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/api-provider-storage-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/api-provider-storage-browser-coverage', { waitUntil: 'load' });
}

test('api provider storage browser coverage handles provider gates and model caches', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ providerStorageUrl }) => {
    const storage = await import(providerStorageUrl);
    const cryptoStore = await import('/js/crypto.js');
    const chatRuntime = await import('/js/chat-runtime.js');
    const outcomes = {};

    const storageKeys = [
      'labcharts-ai-provider',
      'labcharts-ai-paused',
      'labcharts-ollama',
      'labcharts-ollama-model',
      'labcharts-ollama-pii-url',
      'labcharts-ollama-pii-model',
      'labcharts-venice-key',
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-e2ee-models',
      'labcharts-venice-models-fetched-at',
      'labcharts-venice-e2ee',
      'labcharts-venice-model-e2ee',
      'labcharts-venice-model-regular',
      'labcharts-openrouter-key',
      'labcharts-openrouter-model',
      'labcharts-openrouter-models',
      'labcharts-openrouter-pricing',
      'labcharts-routstr-key',
      'labcharts-routstr-model',
      'labcharts-routstr-models',
      'labcharts-ppq-key',
      'labcharts-ppq-model',
      'labcharts-ppq-models',
      'labcharts-ppq-credit-id',
      'labcharts-custom-key',
      'labcharts-custom-url',
      'labcharts-custom-model',
      'labcharts-custom-models',
      'labcharts-api-provider-storage-array',
      'labcharts-api-provider-storage-bad-array',
    ];
    const cachedKeyNames = [
      'labcharts-ollama',
      'labcharts-venice-key',
      'labcharts-openrouter-key',
      'labcharts-routstr-key',
      'labcharts-ppq-key',
      'labcharts-custom-key',
    ];
    const sessionKeys = ['labcharts-ai-settings-local-lock-until'];
    const saved = {
      localStorage: Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)])),
      sessionStorage: Object.fromEntries(sessionKeys.map(key => [key, sessionStorage.getItem(key)])),
      keyCache: Object.fromEntries(cachedKeyNames.map(key => [key, cryptoStore.getCachedKey(key)])),
    };

    const restoreStoredValue = (store, key, value) => {
      if (value == null) store.removeItem(key);
      else store.setItem(key, value);
    };
    const changedEvents = [];
    const onLocalSettingsChanged = () => { changedEvents.push(Date.now()); };

    let headerUpdates = 0;
    let searchRefreshes = 0;
    let previousChatRuntime = null;

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      for (const key of sessionKeys) sessionStorage.removeItem(key);
      for (const key of cachedKeyNames) cryptoStore.updateKeyCache(key, null);
      previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
        updateChatHeaderModel: () => { headerUpdates += 1; },
        refreshWebSearchToggle: () => { searchRefreshes += 1; },
      });
      window.addEventListener('labcharts-ai-settings-local-changed', onLocalSettingsChanged);

      const defaultProvider = storage.getAIProvider();
      storage.setAIProvider('venice');
      const localLockUntil = Number(sessionStorage.getItem('labcharts-ai-settings-local-lock-until') || 0);
      outcomes.providerSetterMarksLocalAndNotifies =
        defaultProvider === 'openrouter'
        && storage.getAIProvider() === 'venice'
        && localLockUntil > Date.now()
        && headerUpdates >= 1
        && searchRefreshes >= 1
        && changedEvents.length >= 1;

      storage.setAIPaused(true);
      const pausedBlocksProvider = storage.isAIPaused() === true && storage.hasAIProvider() === false;
      storage.setAIPaused(false);
      await storage.saveVeniceKey('venice-secret');
      const veniceAvailable = storage.hasAIProvider() === true && storage.hasVeniceKey() === true;
      storage.setAIProvider('openrouter');
      const openrouterMissingKey = storage.hasAIProvider() === false;
      await storage.saveOpenRouterKey('openrouter-secret');
      const openrouterAvailable = storage.hasAIProvider() === true && storage.hasOpenRouterKey() === true;
      storage.setAIProvider('routstr');
      const routstrMissingKey = storage.hasAIProvider() === false;
      await storage.saveRoutstrKey('routstr-secret');
      const routstrAvailable = storage.hasAIProvider() === true && storage.hasRoutstrKey() === true;
      storage.setAIProvider('ppq');
      const ppqMissingKey = storage.hasAIProvider() === false;
      await storage.savePpqKey('ppq-secret');
      const ppqAvailable = storage.hasAIProvider() === true && storage.hasPpqKey() === true;
      storage.setAIProvider('custom');
      await storage.saveCustomApiKey('custom-secret');
      const customNeedsUrl = storage.hasAIProvider() === false;
      storage.setCustomApiUrl('https://api.example.test/v1');
      const customAvailable = storage.hasAIProvider() === true && storage.hasCustomApiKey() === true;
      storage.setAIProvider('ollama');
      const optimisticLocalProvider = storage.hasAIProvider() === true;
      outcomes.providerAvailabilityCoversPauseAndProviderKeys =
        pausedBlocksProvider
        && veniceAvailable
        && openrouterMissingKey
        && openrouterAvailable
        && routstrMissingKey
        && routstrAvailable
        && ppqMissingKey
        && ppqAvailable
        && customNeedsUrl
        && customAvailable
        && optimisticLocalProvider;

      await storage.saveOllamaConfig({ url: 'http://localhost:11434', model: 'llama-default', mode: 'ollama', apiKey: '' });
      const defaultOllamaModel = storage.getOllamaMainModel();
      const defaultPiiUrl = storage.getOllamaPIIUrl();
      const defaultPiiModelFromWindowConfig = storage.getOllamaPIIModel();
      storage.setOllamaMainModel('qwen2.5:7b');
      const savedOllamaModel = storage.getOllamaMainModel();
      const defaultPiiModelFromMainModel = storage.getOllamaPIIModel();
      storage.setOllamaPIIUrl('http://pii.local:11434');
      storage.setOllamaPIIModel('privacy-qwen:7b');
      outcomes.ollamaSettingsUseStoredConfigAndPersistOverrides =
        defaultOllamaModel === 'llama-default'
        && savedOllamaModel === 'qwen2.5:7b'
        && defaultPiiUrl === 'http://localhost:11434'
        && defaultPiiModelFromWindowConfig === 'llama-default'
        && defaultPiiModelFromMainModel === 'qwen2.5:7b'
        && storage.getOllamaPIIUrl() === 'http://pii.local:11434'
        && storage.getOllamaPIIModel() === 'privacy-qwen:7b';

      localStorage.setItem('labcharts-api-provider-storage-array', JSON.stringify([{ id: 'one' }]));
      localStorage.setItem('labcharts-api-provider-storage-bad-array', '{"id":"not-array"}');
      const parsedArray = storage.readStoredArray('labcharts-api-provider-storage-array');
      const objectArrayFallback = storage.readStoredArray('labcharts-api-provider-storage-bad-array');
      localStorage.setItem('labcharts-api-provider-storage-bad-array', '{');
      const invalidJsonFallback = storage.readStoredArray('labcharts-api-provider-storage-bad-array');
      outcomes.arrayCacheParsingHandlesValidNonArrayAndInvalidJson =
        parsedArray.length === 1
        && parsedArray[0].id === 'one'
        && objectArrayFallback.length === 0
        && invalidJsonFallback.length === 0
        && storage.modelListHasId([{ id: 'one' }, null], 'one') === true
        && storage.modelListHasId([{ id: 'one' }], 'two') === false;

      localStorage.setItem('labcharts-openrouter-model', 'anthropic/claude-sonnet-4-6');
      const migratedOpenRouterModel = storage.getOpenRouterModel();
      const migratedOpenRouterStored = localStorage.getItem('labcharts-openrouter-model');
      localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
        { id: 'openai/gpt-4o' },
      ]));
      const openRouterDisplay = storage.getOpenRouterModelDisplay();
      localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
        'anthropic/claude-sonnet-4.6': { input: 3, output: 15 },
      }));
      const openRouterPricing = storage.getOpenRouterPricing('anthropic/claude-sonnet-4.6');
      storage.setOpenRouterModel('openai/gpt-4o');
      const savedOpenRouterModel = storage.getOpenRouterModel();
      localStorage.setItem('labcharts-openrouter-pricing', '{');
      outcomes.openRouterModelMigrationDisplayAndPricingCache =
        migratedOpenRouterModel === 'anthropic/claude-sonnet-4.6'
        && migratedOpenRouterStored === 'anthropic/claude-sonnet-4.6'
        && openRouterDisplay === 'Claude Sonnet 4.6'
        && openRouterPricing?.input === 3
        && savedOpenRouterModel === 'openai/gpt-4o'
        && localStorage.getItem('labcharts-openrouter-model') === 'openai/gpt-4o'
        && storage.getOpenRouterPricing('anthropic/claude-sonnet-4.6') === null;

      storage.setCustomApiModel('');
      const noCustomModel = storage.getCustomApiModelDisplay();
      storage.setCustomApiModel('custom-small');
      localStorage.setItem('labcharts-custom-models', JSON.stringify([
        { id: 'custom-small', name: 'Custom Small' },
      ]));
      const namedCustomModel = storage.getCustomApiModelDisplay();
      storage.setCustomApiModel('custom-missing');
      const missingCustomModel = storage.getCustomApiModelDisplay();
      storage.setRoutstrModel('routstr-large');
      localStorage.setItem('labcharts-routstr-models', JSON.stringify([
        { id: 'routstr-large', name: 'Routstr Large' },
      ]));
      storage.setPpqModel('ppq-large');
      localStorage.setItem('labcharts-ppq-models', JSON.stringify([
        { id: 'ppq-large', name: 'PPQ Large' },
      ]));
      storage.savePpqCreditId('credit-123');
      outcomes.providerSpecificModelDisplaysUseNamesAndFallbacks =
        noCustomModel === '(no model selected)'
        && namedCustomModel === 'Custom Small'
        && missingCustomModel === 'custom-missing'
        && storage.getRoutstrModelDisplay() === 'Routstr Large'
        && storage.getPpqModelDisplay() === 'PPQ Large'
        && storage.getPpqCreditId() === 'credit-123';

      localStorage.removeItem('labcharts-venice-e2ee-models');
      const fallbackE2eePrefix = storage.isE2EEModel('e2ee-anything') === true;
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([
        { id: 'e2ee-secure', name: 'Secure E2EE' },
      ]));
      localStorage.setItem('labcharts-venice-models', JSON.stringify([
        { id: 'llama-3.3-70b-fast', name: 'Llama 70B' },
        { id: 'venice-small', name: 'Venice Small' },
      ]));
      storage.setVeniceModel('e2ee-secure');
      const veniceDisplay = storage.getVeniceModelDisplay();
      const explicitE2ee = storage.isE2EEModel('e2ee-secure') === true
        && storage.isE2EEModel('e2ee-anything') === false;
      const supportFlags = storage.modelSupportsVeniceE2EE({ id: 'plain', model_spec: { capabilities: { supportsE2EE: true } } }) === true
        && storage.modelSupportsVeniceE2EE({ id: 'plain', model_spec: { capabilities: { supportsE2EE: false } } }) === false
        && storage.modelSupportsVeniceE2EE({ id: 'e2ee-prefix' }) === true;
      storage.setVeniceE2EE(true);
      const e2eeToggle = storage.getVeniceE2EE() === true && storage.isVeniceE2EEActive() === true;
      storage.setVeniceModel('missing-e2ee');
      localStorage.setItem('labcharts-venice-model-e2ee', 'e2ee-secure');
      storage.syncVeniceModelSelection([{ id: 'regular' }], [{ id: 'fallback-e2ee' }, { id: 'e2ee-secure' }]);
      const pickedSavedE2ee = storage.getVeniceModel() === 'e2ee-secure'
        && localStorage.getItem('labcharts-venice-model-e2ee') === 'e2ee-secure';
      storage.setVeniceModel('keep-without-e2ee-list');
      storage.syncVeniceModelSelection([{ id: 'regular' }], []);
      const keepsWhenNoE2eeModels = storage.getVeniceModel() === 'keep-without-e2ee-list';
      storage.setVeniceE2EE(false);
      storage.setVeniceModel('missing-regular');
      localStorage.removeItem('labcharts-venice-model-regular');
      storage.syncVeniceModelSelection([{ id: 'venice-small' }, { id: 'llama-3.3-70b-fast' }], []);
      outcomes.veniceE2eeAndModelSelectionBranches =
        fallbackE2eePrefix
        && explicitE2ee
        && supportFlags
        && veniceDisplay === 'Secure E2EE'
        && e2eeToggle
        && pickedSavedE2ee
        && keepsWhenNoE2eeModels
        && storage.getVeniceModel() === 'llama-3.3-70b-fast';

      localStorage.removeItem('labcharts-venice-models-fetched-at');
      const missingCacheStale = storage.veniceModelsCacheStale() === true;
      localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
      const recentCacheFresh = storage.veniceModelsCacheStale() === false;
      localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now() - 2 * 60 * 60 * 1000));
      outcomes.veniceCacheStalenessUsesTimestamp =
        missingCacheStale
        && recentCacheFresh
        && storage.veniceModelsCacheStale() === true;

      outcomes.allOutcomesReached = true;
      return outcomes;
    } finally {
      window.removeEventListener('labcharts-ai-settings-local-changed', onLocalSettingsChanged);
      if (previousChatRuntime) chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      for (const [key, value] of Object.entries(saved.localStorage)) {
        restoreStoredValue(localStorage, key, value);
      }
      for (const [key, value] of Object.entries(saved.sessionStorage)) {
        restoreStoredValue(sessionStorage, key, value);
      }
      for (const [key, value] of Object.entries(saved.keyCache)) {
        cryptoStore.updateKeyCache(key, value);
      }
    }
  }, {
    providerStorageUrl: moduleUrl('/js/api-provider-storage.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
