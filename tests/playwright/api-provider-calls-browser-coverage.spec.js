import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?apiProviderCallsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/api-provider-calls-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/api-provider-calls-browser-coverage', { waitUntil: 'load' });
}

test('api provider browser coverage exercises OAuth and provider call wrappers', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ apiUrl }) => {
    const api = await import(apiUrl);
    const cryptoMod = await import('/js/crypto.js');
    const outcomes = {};
    const fetchCalls = [];
    const savedFetch = window.fetch;
    const savedGetOllamaConfig = window.getOllamaConfig;
    const savedKeys = {
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
      veniceKey: localStorage.getItem('labcharts-venice-key'),
      veniceModel: localStorage.getItem('labcharts-venice-model'),
      veniceModels: localStorage.getItem('labcharts-venice-models'),
      veniceE2EEModels: localStorage.getItem('labcharts-venice-e2ee-models'),
      veniceE2EE: localStorage.getItem('labcharts-venice-e2ee'),
      openrouterKey: localStorage.getItem('labcharts-openrouter-key'),
      openrouterModel: localStorage.getItem('labcharts-openrouter-model'),
      routstrKey: localStorage.getItem('labcharts-routstr-key'),
      routstrModel: localStorage.getItem('labcharts-routstr-model'),
      routstrNode: localStorage.getItem('labcharts-routstr-node'),
      ppqKey: localStorage.getItem('labcharts-ppq-key'),
      ppqModel: localStorage.getItem('labcharts-ppq-model'),
      customUrl: localStorage.getItem('labcharts-custom-url'),
      customKey: localStorage.getItem('labcharts-custom-key'),
      customModel: localStorage.getItem('labcharts-custom-model'),
      oauthVerifier: sessionStorage.getItem('or_pkce_verifier'),
      oauthState: sessionStorage.getItem('or_oauth_state'),
      oauthProvider: sessionStorage.getItem('or_previous_ai_provider'),
    };

    const jsonResponse = (body, init = {}) => new Response(JSON.stringify(body), {
      status: init.status || 200,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const setKey = (storageKey, value) => {
      localStorage.setItem(storageKey, value);
      cryptoMod.updateKeyCache(storageKey, value);
    };
    const restoreKey = (storageKey, value) => {
      if (value == null) {
        localStorage.removeItem(storageKey);
        cryptoMod.updateKeyCache(storageKey, '');
      } else {
        localStorage.setItem(storageKey, value);
        cryptoMod.updateKeyCache(storageKey, value);
      }
    };
    const restoreStorage = (key, value) => {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    };
    const waitFor = async predicate => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return false;
    };

    try {
      window.getOllamaConfig = () => ({ url: 'http://localhost:11434', model: 'ollama-fallback', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        const urlText = String(url);
        const bodyText = typeof options.body === 'string' ? options.body : '';
        fetchCalls.push({ url: urlText, options, body: bodyText ? JSON.parse(bodyText) : null });
        if (urlText.endsWith('/api/chat')) {
          return jsonResponse({ message: { content: 'ollama reply' }, prompt_eval_count: 3, eval_count: 5 });
        }
        if (urlText.includes('/v1/balance/create')) {
          return jsonResponse({ api_key: 'sk-created', balance: 1200 });
        }
        return jsonResponse({
          choices: [{ message: { content: `reply from ${urlText}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 7, completion_tokens: 9 },
        });
      };

      localStorage.setItem('labcharts-ai-provider', 'venice');
      const pkce = await api.generatePKCE();
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.contentWindow.getOllamaConfig = window.getOllamaConfig;
      const frameScript = iframe.contentDocument.createElement('script');
      frameScript.type = 'module';
      frameScript.textContent = `
        import(${JSON.stringify(apiUrl)})
          .then(mod => { window.__apiModule = mod; })
          .catch(err => { window.__apiError = err && err.message ? err.message : String(err); });
      `;
      iframe.contentDocument.body.appendChild(frameScript);
      await waitFor(() => iframe.contentWindow.__apiModule || iframe.contentWindow.__apiError);
      if (iframe.contentWindow.__apiError) throw new Error(iframe.contentWindow.__apiError);
      await iframe.contentWindow.__apiModule.startOpenRouterOAuth();
      const oauthVerifier = sessionStorage.getItem('or_pkce_verifier') || '';
      const oauthState = sessionStorage.getItem('or_oauth_state') || '';
      const oauthPreviousProvider = sessionStorage.getItem('or_previous_ai_provider') || '';
      iframe.remove();
      outcomes.pkceAndOAuthStoreVerifierStateAndPreviousProvider = pkce.codeVerifier.length >= 43
        && pkce.codeChallenge.length >= 43
        && oauthVerifier.length >= 43
        && oauthState.length >= 20
        && oauthPreviousProvider === 'venice';

      localStorage.setItem('labcharts-ollama-model', 'ollama-coverage');
      const ollamaResult = await api.callOllamaChat({
        system: 'system prompt',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', source: { data: 'image-a' } },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,image-b' } },
          ],
        }],
        maxTokens: 12,
      });
      const ollamaCall = fetchCalls.find(call => call.url.endsWith('/api/chat'));
      outcomes.callOllamaChatNormalizesVisionMessages = ollamaResult.text === 'ollama reply'
        && ollamaResult.usage.inputTokens === 3
        && ollamaResult.usage.outputTokens === 5
        && ollamaCall?.body?.model === 'ollama-coverage'
        && ollamaCall?.body?.messages?.[0]?.role === 'system'
        && ollamaCall?.body?.messages?.[1]?.images?.join('|') === 'image-a|image-b'
        && ollamaCall?.body?.options?.num_predict === 12;

      setKey('labcharts-venice-key', 'sk-venice');
      localStorage.setItem('labcharts-venice-model', 'llama-3.3-70b');
      localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'llama-3.3-70b', name: 'Llama' }]));
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([]));
      localStorage.setItem('labcharts-venice-e2ee', 'off');
      const veniceResult = await api.callVeniceAPI({
        messages: [{ role: 'user', content: 'venice' }],
        maxTokens: 20,
        webSearch: true,
        requestTimeoutMs: 50,
      });

      setKey('labcharts-openrouter-key', 'sk-openrouter');
      localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.5');
      const openRouterResult = await api.callOpenRouterAPI({
        system: 'or system',
        messages: [{ role: 'user', content: 'openrouter' }],
        maxTokens: 21,
        webSearch: true,
        requestTimeoutMs: 50,
      });

      setKey('labcharts-routstr-key', 'sk-routstr');
      localStorage.setItem('labcharts-routstr-model', 'claude-sonnet-4.6');
      localStorage.setItem('labcharts-routstr-node', 'https://routstr.example.test/');
      const validRoutstrCashu = await api.validateRoutstrKey('cashu:cashuA-token');
      const invalidRoutstr = await api.validateRoutstrKey('bad-token');
      const routstrResult = await api.callRoutstrAPI({
        messages: [{ role: 'user', content: 'routstr' }],
        maxTokens: 22,
        requestTimeoutMs: 50,
      });
      const routstrAccount = await api.createRoutstrAccount('cashu-token-value');

      setKey('labcharts-ppq-key', 'sk-ppq');
      localStorage.setItem('labcharts-ppq-model', 'claude-sonnet-4.6');
      const ppqResult = await api.callPpqAPI({
        messages: [{ role: 'user', content: 'ppq' }],
        maxTokens: 23,
        webSearch: true,
        requestTimeoutMs: 50,
      });

      setKey('labcharts-custom-key', 'sk-custom');
      localStorage.setItem('labcharts-custom-url', 'http://localhost:9999/v1/');
      localStorage.setItem('labcharts-custom-model', 'custom-model');
      const customResult = await api.callCustomAPI({
        messages: [{ role: 'user', content: 'custom' }],
        maxTokens: 24,
        requestTimeoutMs: 50,
      });

      const callFor = fragment => fetchCalls.find(call => call.url.includes(fragment));
      outcomes.providerWrappersCallExpectedEndpointsAndReturnUsage = veniceResult.text.includes('venice.ai/api/v1/chat/completions')
        && openRouterResult.text.includes('openrouter.ai/api/v1/chat/completions')
        && routstrResult.text.includes('routstr.example.test/v1/chat/completions')
        && ppqResult.text.includes('api.ppq.ai/chat/completions')
        && customResult.text.includes('localhost:9999/v1/chat/completions')
        && veniceResult.usage.inputTokens === 7
        && customResult.usage.outputTokens === 9
        && callFor('venice.ai/api/v1/chat/completions')?.body?.venice_parameters?.enable_web_search === 'on'
        && callFor('openrouter.ai/api/v1/chat/completions')?.body?.plugins?.[0]?.id === 'web'
        && callFor('openrouter.ai/api/v1/chat/completions')?.body?.max_completion_tokens === 21
        && callFor('api.ppq.ai/chat/completions')?.body?.plugins?.[0]?.id === 'web'
        && callFor('localhost:9999/v1/chat/completions')?.body?.model === 'custom-model';
      outcomes.routstrValidationAndAccountCreationUseNodeState = validRoutstrCashu.valid === true
        && invalidRoutstr.valid === false
        && routstrAccount.api_key === 'sk-created'
        && callFor('/v1/balance/create')?.url.includes(encodeURIComponent('cashu-token-value'));
    } finally {
      window.fetch = savedFetch;
      if (savedGetOllamaConfig) window.getOllamaConfig = savedGetOllamaConfig;
      else delete window.getOllamaConfig;
      restoreStorage('labcharts-ai-provider', savedKeys.aiProvider);
      restoreStorage('labcharts-ollama-model', savedKeys.ollamaModel);
      restoreStorage('labcharts-venice-model', savedKeys.veniceModel);
      restoreStorage('labcharts-venice-models', savedKeys.veniceModels);
      restoreStorage('labcharts-venice-e2ee-models', savedKeys.veniceE2EEModels);
      restoreStorage('labcharts-venice-e2ee', savedKeys.veniceE2EE);
      restoreStorage('labcharts-openrouter-model', savedKeys.openrouterModel);
      restoreStorage('labcharts-routstr-model', savedKeys.routstrModel);
      restoreStorage('labcharts-routstr-node', savedKeys.routstrNode);
      restoreStorage('labcharts-ppq-model', savedKeys.ppqModel);
      restoreStorage('labcharts-custom-url', savedKeys.customUrl);
      restoreStorage('labcharts-custom-model', savedKeys.customModel);
      restoreKey('labcharts-venice-key', savedKeys.veniceKey);
      restoreKey('labcharts-openrouter-key', savedKeys.openrouterKey);
      restoreKey('labcharts-routstr-key', savedKeys.routstrKey);
      restoreKey('labcharts-ppq-key', savedKeys.ppqKey);
      restoreKey('labcharts-custom-key', savedKeys.customKey);
      if (savedKeys.oauthVerifier == null) sessionStorage.removeItem('or_pkce_verifier');
      else sessionStorage.setItem('or_pkce_verifier', savedKeys.oauthVerifier);
      if (savedKeys.oauthState == null) sessionStorage.removeItem('or_oauth_state');
      else sessionStorage.setItem('or_oauth_state', savedKeys.oauthState);
      if (savedKeys.oauthProvider == null) sessionStorage.removeItem('or_previous_ai_provider');
      else sessionStorage.setItem('or_previous_ai_provider', savedKeys.oauthProvider);
    }

    return outcomes;
  }, { apiUrl: moduleUrl('/js/api.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
