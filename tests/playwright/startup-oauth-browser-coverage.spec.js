import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?startupOAuthCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/startup-oauth-browser-coverage**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/startup-oauth-browser-coverage', { waitUntil: 'load' });
}

test('startup OAuth browser coverage handles OpenRouter and wearable callback routing', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ startupUrl }) => {
    const startup = await import(startupUrl);
    const wearables = await import('/js/wearables-connect.js');
    const chatRuntime = await import('/js/chat-runtime.js');
    const cloudConsent = await import('/js/cloud-ai-consent.js');
    const cryptoStore = await import('/js/crypto.js');
    const providerStorageRuntime = await import('/js/api-provider-storage-runtime.js');
    const outcomes = {};

    const snapshotStorage = storage => new Map(Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(key => key !== null)
      .map(key => [key, storage.getItem(key)]));
    const restoreStorage = (storage, snapshot) => {
      storage.clear();
      for (const [key, value] of snapshot) {
        if (value != null) storage.setItem(key, value);
      }
    };

    const savedLocal = snapshotStorage(localStorage);
    const savedSession = snapshotStorage(sessionStorage);
    const originalFetch = window.fetch;
    const originalSetTimeout = window.setTimeout;
    const originalReplaceState = history.replaceState;
    const originalPushState = history.pushState;
    const hadCoverageDispatch = Object.prototype.hasOwnProperty.call(wearables.OAUTH_DISPATCH, 'coverage');
    const savedCoverageDispatch = wearables.OAUTH_DISPATCH.coverage;
    const originalProviderStorageRuntime = providerStorageRuntime.configureApiProviderStorageRuntimeDeps({
      encryptedSetItem: cryptoStore.encryptedSetItem,
    });

    let notifications = [];
    let fetchCalls = [];
    let timers = [];
    let replaceCalls = [];
    let balanceDialogs = 0;
    let fakeWearableCompletes = 0;
    const originalStartupOAuthDeps = startup.configureStartupOAuthCallbackDeps({
      showNotification: (message, type, duration) => {
        notifications.push({ message: String(message), type, duration });
      },
      showInsufficientBalanceDialog: () => {
        balanceDialogs += 1;
      },
    });
    const originalChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      updateChatHeaderModel: () => {},
      refreshWebSearchToggle: () => {},
    });

    const resetCase = (query = '') => {
      localStorage.clear();
      localStorage.setItem(cloudConsent.AI_TRANSPARENCY_KEY, JSON.stringify({
        version: cloudConsent.AI_TRANSPARENCY_VERSION,
        acknowledged: true,
      }));
      localStorage.setItem(cloudConsent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
        version: cloudConsent.CLOUD_AI_CONSENT_VERSION,
        approvals: { openrouter: { accepted: true } },
      }));
      cryptoStore.updateKeyCache('labcharts-openrouter-key', null);
      sessionStorage.clear();
      notifications = [];
      fetchCalls = [];
      timers = [];
      replaceCalls = [];
      balanceDialogs = 0;
      fakeWearableCompletes = 0;
      delete window._openChatAfterInit;
      originalPushState.call(history, null, '', `/startup-oauth-browser-coverage${query}`);
    };

    try {
      history.replaceState = function replaceStateSpy(state, title, url) {
        replaceCalls.push({ title, url });
        return originalReplaceState.call(history, state, title, url);
      };
      window.setTimeout = (fn, delay, ...args) => {
        timers.push({ delay, source: String(fn) });
        if (delay === 1500 && typeof fn === 'function') {
          Promise.resolve().then(() => fn(...args));
        }
        return timers.length;
      };
      window.fetch = async (url, options = {}) => {
        const requestUrl = String(url);
        let body = null;
        try {
          body = options.body ? JSON.parse(String(options.body)) : null;
        } catch {}
        fetchCalls.push({ url: requestUrl, method: options.method || 'GET', body });

        if (requestUrl === 'https://openrouter.ai/api/v1/auth/keys') {
          if (body?.code === 'server-fail') {
            return new Response(JSON.stringify({ error: { message: 'exchange failed from coverage' } }), {
              status: 500,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ key: 'or-live-key' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (requestUrl === 'https://openrouter.ai/api/v1/models') {
          return new Response(JSON.stringify({
            data: [
              {
                id: 'anthropic/claude-sonnet-4.6',
                name: 'Claude Sonnet 4.6',
                pricing: { prompt: '0.000003', completion: '0.000015' },
                architecture: { modality: 'text->text' },
              },
              {
                id: 'openai/gpt-5.5-vision',
                name: 'GPT 5.5 Vision',
                pricing: { prompt: '0.000005', completion: '0.00002' },
                architecture: { modality: 'image->text' },
              },
              { id: 'openai/codex-skip', name: 'Excluded Codex' },
              { name: 'missing-id' },
            ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (requestUrl === 'https://openrouter.ai/api/v1/credits') {
          return new Response(JSON.stringify({ data: { total_credits: 2, total_usage: 2 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      };

      resetCase('?code=live-code&state=state-ok');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-ok');
      sessionStorage.setItem('or_oauth_state', 'state-ok');
      sessionStorage.setItem('or_previous_ai_provider', 'venice');
      localStorage.setItem('labcharts-ai-provider', 'venice');
      await startup.handleStartupOAuthCallbacks();
      await Promise.resolve();
      await Promise.resolve();
      const authRequest = fetchCalls.find(call => call.url.endsWith('/auth/keys'));
      const modelsRequest = fetchCalls.find(call => call.url.endsWith('/models'));
      const creditsRequest = fetchCalls.find(call => call.url.endsWith('/credits'));
      const cachedModels = JSON.parse(localStorage.getItem('labcharts-openrouter-models') || '[]');
      const pricingCache = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing') || '{}');
      outcomes.successExchangesCodeWithPkceAndState = authRequest?.method === 'POST'
        && authRequest.body?.code === 'live-code'
        && authRequest.body?.code_verifier === 'verifier-ok'
        && authRequest.body?.code_challenge_method === 'S256';
      const storedOpenRouterKey = localStorage.getItem('labcharts-openrouter-key');
      outcomes.successSavesKeyProviderAndClearsSession = storedOpenRouterKey?.startsWith('d1:') === true
        && !storedOpenRouterKey.includes('or-live-key')
        && await cryptoStore.encryptedGetItem('labcharts-openrouter-key') === 'or-live-key'
        && localStorage.getItem('labcharts-ai-provider') === 'openrouter'
        && sessionStorage.getItem('or_pkce_verifier') === null
        && sessionStorage.getItem('or_oauth_state') === null
        && sessionStorage.getItem('or_previous_ai_provider') === null
        && !!sessionStorage.getItem('or_oauth_local_settings_lock_until')
        && !!sessionStorage.getItem('labcharts-ai-settings-local-lock-until');
      outcomes.successFetchesModelsAndBalance = !!modelsRequest
        && modelsRequest.method === 'GET'
        && !!creditsRequest
        && cachedModels.some(model => model.id === 'anthropic/claude-sonnet-4.6')
        && pricingCache['anthropic/claude-sonnet-4.6']?.input === 3;
      outcomes.successNotifiesOpensChatAndSchedulesBalanceDialog = window._openChatAfterInit === true
        && notifications.some(note => note.type === 'success' && note.message.includes('Connected to OpenRouter'))
        && timers.some(timer => timer.delay === 1500 && timer.source.includes('showInsufficientBalanceDialog'))
        && balanceDialogs === 1
        && replaceCalls.length === 1
        && window.location.search === '';

      resetCase('?state=state-missing');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-missing');
      sessionStorage.setItem('or_oauth_state', 'state-missing');
      sessionStorage.setItem('or_previous_ai_provider', 'routstr');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      await startup.handleStartupOAuthCallbacks();
      outcomes.missingCodeRestoresPreviousProviderAndClearsSession = localStorage.getItem('labcharts-ai-provider') === 'routstr'
        && sessionStorage.getItem('or_pkce_verifier') === null
        && sessionStorage.getItem('or_oauth_state') === null
        && notifications.some(note => note.type === 'error' && note.duration === 6000 && note.message.includes('missing authorization code'))
        && fetchCalls.length === 0
        && replaceCalls.length === 1;

      resetCase('?error=access_denied&error_description=Nope');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-denied');
      sessionStorage.setItem('or_oauth_state', 'state-denied');
      sessionStorage.setItem('or_previous_ai_provider', 'ollama');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      await startup.handleStartupOAuthCallbacks();
      outcomes.accessDeniedUsesCancelledInfoNotification = localStorage.getItem('labcharts-ai-provider') === 'ollama'
        && notifications.some(note => note.type === 'info' && note.duration === 4000 && note.message.includes('authorization was cancelled'))
        && sessionStorage.getItem('or_pkce_verifier') === null
        && replaceCalls.length === 1;

      resetCase('?error=server_error&error_description=Provider%20offline');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-error');
      sessionStorage.setItem('or_oauth_state', 'state-error');
      await startup.handleStartupOAuthCallbacks();
      outcomes.oauthErrorDescriptionUsesErrorToast = notifications.some(note => (
        note.type === 'error'
        && note.duration === 6000
        && note.message.includes('Provider offline')
      ))
        && sessionStorage.getItem('or_pkce_verifier') === null
        && sessionStorage.getItem('or_oauth_state') === null
        && replaceCalls.length === 1
        && window.location.search === '';

      resetCase('?code=bad-state&state=returned-state');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-bad-state');
      sessionStorage.setItem('or_oauth_state', 'expected-state');
      sessionStorage.setItem('or_previous_ai_provider', 'custom');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      await startup.handleStartupOAuthCallbacks();
      outcomes.stateMismatchHitsCallbackCatchAndRestoresProvider = localStorage.getItem('labcharts-ai-provider') === 'custom'
        && notifications.some(note => note.type === 'error' && note.message.includes('OAuth state mismatch'))
        && fetchCalls.length === 0
        && sessionStorage.getItem('or_pkce_verifier') === null
        && sessionStorage.getItem('or_oauth_state') === null;

      resetCase('?code=server-fail&state=state-fail');
      sessionStorage.setItem('or_pkce_verifier', 'verifier-fail');
      sessionStorage.setItem('or_oauth_state', 'state-fail');
      sessionStorage.setItem('or_previous_ai_provider', 'ppq');
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      await startup.handleStartupOAuthCallbacks();
      outcomes.exchangeFailureShowsServerMessage = fetchCalls.some(call => call.url.endsWith('/auth/keys'))
        && notifications.some(note => note.type === 'error' && note.message.includes('exchange failed from coverage'))
        && localStorage.getItem('labcharts-ai-provider') === 'ppq'
        && sessionStorage.getItem('or_pkce_verifier') === null
        && sessionStorage.getItem('or_oauth_state') === null
        && sessionStorage.getItem('or_previous_ai_provider') === null
        && replaceCalls.length === 1
        && window.location.search === '';

      resetCase('?code=openrouter-code&state=wearable-state&coverageWearable=1');
      sessionStorage.setItem('coverage-oauth-pending', JSON.stringify({
        state: 'wearable-state',
      }));
      wearables.OAUTH_DISPATCH.coverage = {
        isCallback: params => params.get('coverageWearable') === '1',
        complete: async () => {
          fakeWearableCompletes += 1;
          return { ok: false, error: 'coverage wearable handled' };
        },
        displayName: 'Coverage wearable',
      };
      sessionStorage.setItem('or_pkce_verifier', 'verifier-skipped');
      sessionStorage.setItem('or_oauth_state', 'wearable-state');
      await startup.handleStartupOAuthCallbacks();
      outcomes.wearableCallbackSkipsOpenRouterProcessing = fakeWearableCompletes === 1
        && !fetchCalls.some(call => call.url.endsWith('/auth/keys'))
        && sessionStorage.getItem('or_pkce_verifier') === 'verifier-skipped'
        && window.location.search === '';

      resetCase('?code=ignored&state=none');
      await startup.handleStartupOAuthCallbacks();
      outcomes.noPendingOpenRouterSessionNoops = fetchCalls.length === 0
        && notifications.length === 0
        && replaceCalls.length === 0;
    } finally {
      window.fetch = originalFetch;
      startup.configureStartupOAuthCallbackDeps(originalStartupOAuthDeps);
      window.setTimeout = originalSetTimeout;
      history.replaceState = originalReplaceState;
      chatRuntime.configureChatRuntimeCallbacks(originalChatRuntime);
      providerStorageRuntime.configureApiProviderStorageRuntimeDeps(originalProviderStorageRuntime);
      if (hadCoverageDispatch) wearables.OAUTH_DISPATCH.coverage = savedCoverageDispatch;
      else delete wearables.OAUTH_DISPATCH.coverage;
      restoreStorage(localStorage, savedLocal);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', savedLocal.get('labcharts-openrouter-key'));
      restoreStorage(sessionStorage, savedSession);
      originalPushState.call(history, null, '', '/startup-oauth-browser-coverage');
    }

    return outcomes;
  }, {
    startupUrl: moduleUrl('/js/startup-oauth-callbacks.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
