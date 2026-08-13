import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lensHardwareCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('hardware browser contract detects GPUs and ranks model options', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ hardwareUrl }) => {
    const hardware = await import(hardwareUrl);
    const outcomes = {};
    const originalCreateElement = document.createElement.bind(document);
    const navigatorProto = Object.getPrototypeOf(navigator);
    const originalDeviceMemory = Object.getOwnPropertyDescriptor(navigatorProto, 'deviceMemory');
    const originalHardwareConcurrency = Object.getOwnPropertyDescriptor(navigatorProto, 'hardwareConcurrency');
    const savedOverride = localStorage.getItem('labcharts-hw-vram-override');

    const restoreNavigatorProp = (name, descriptor) => {
      try {
        if (descriptor) Object.defineProperty(navigatorProto, name, descriptor);
        else delete navigatorProto[name];
      } catch {}
    };

    const setNavigatorProp = (name, value) => {
      try {
        Object.defineProperty(navigatorProto, name, {
          configurable: true,
          get: () => value,
        });
      } catch {}
    };

    const stubRenderer = (renderer, opts = {}) => {
      document.createElement = (tagName, ...args) => {
        if (String(tagName).toLowerCase() !== 'canvas') return originalCreateElement(tagName, ...args);
        return {
          getContext() {
            if (opts.noContext) return null;
            return {
              getExtension() {
                return opts.blocked ? null : { UNMASKED_RENDERER_WEBGL: 'UNMASKED_RENDERER_WEBGL' };
              },
              getParameter() {
                return renderer;
              },
            };
          },
        };
      };
    };

    try {
      localStorage.removeItem('labcharts-hw-vram-override');
      setNavigatorProp('deviceMemory', 16);
      setNavigatorProp('hardwareConcurrency', 12);

      stubRenderer('ANGLE (NVIDIA GeForce RTX 4070 Ti SUPER Direct3D11)');
      const detected = await hardware.detectHardware();
      outcomes.detectsSpecificGpuBeforeGenericMatch = detected.gpu.name === 'RTX 4070 Ti SUPER'
        && detected.gpu.vram === 16
        && detected.gpu.source === 'webgl'
        && detected.ram.gb === 16
        && detected.cpuThreads === 12;

      hardware.saveHardwareOverride(6);
      const manual = await hardware.detectHardware();
      outcomes.manualVramOverrideWins = manual.gpu.vram === 6
        && manual.gpu.source === 'manual'
        && hardware.getHardwareOverride() === 6;

      hardware.saveHardwareOverride(null);
      outcomes.clearOverrideRemovesStorage = hardware.getHardwareOverride() === null
        && localStorage.getItem('labcharts-hw-vram-override') === null;

      stubRenderer('ANGLE (Mystery GPU 9000)');
      const unmatched = await hardware.detectHardware();
      outcomes.unmatchedRendererKeepsRawName = unmatched.gpu.name === 'ANGLE (Mystery GPU 9000)'
        && unmatched.gpu.vram === null
        && unmatched.gpu.source === 'webgl-unmatched';

      stubRenderer('', { blocked: true });
      const blocked = await hardware.detectHardware();
      outcomes.blockedDebugInfoIsReported = blocked.gpu.source === 'blocked'
        && blocked.gpu.name === null;

      stubRenderer('', { noContext: true });
      const unavailable = await hardware.detectHardware();
      outcomes.unavailableWebglIsReported = unavailable.gpu.source === 'unavailable';

      document.createElement = () => {
        throw new Error('canvas failed');
      };
      const errored = await hardware.detectHardware();
      outcomes.canvasErrorsAreContained = errored.gpu.source === 'error';

      const desktop = { gpu: { vram: 16, unified: false } };
      const apple = { gpu: { vram: 16, unified: true } };
      outcomes.assessModelClassifiesCloudFitsTightTooLargeUnknown =
        hardware.assessModel({ name: 'deepseek-v3.2:cloud', size: 99e9 }, desktop).tier === 'cloud'
        && hardware.assessModel({ name: 'qwen3.5:14b', size: 9e9 }, desktop).tier === 'fits'
        && hardware.assessModel({ name: 'gemma3:20b', size: 13e9 }, desktop).tier === 'tight'
        && hardware.assessModel({ name: 'llama3.3:70b', size: 43e9 }, apple).tier === 'toobig'
        && hardware.assessModel({ name: 'unknown', size: 0 }, desktop).tier === 'unknown';

      outcomes.assessFitnessHandlesSpecificFamilyLatestParamsAndBadFamilies =
        hardware.assessFitness('qwen3.5:14b')?.tier === 'recommended'
        && hardware.assessFitness('qwen3.5:latest')?.tier === 'capable'
        && hardware.assessFitness('local/model:33b')?.tier === 'recommended'
        && hardware.assessFitness('codellama:13b')?.tier === 'inadequate'
        && hardware.assessFitness('unlisted-model') === null;

      const best = hardware.getBestModel([
        { name: 'tinyllama:1b', size: 1e9 },
        { name: 'qwen3.5:14b', size: 9e9 },
        { name: 'llama3.3:70b', size: 43e9 },
      ], desktop);
      const suggestion16 = hardware.getUpgradeSuggestion([], desktop);
      const suggestion32 = hardware.getUpgradeSuggestion([], { gpu: { vram: 32, unified: false } });
      const suggestion8 = hardware.getUpgradeSuggestion([], { gpu: { vram: 8, unified: false } });
      outcomes.bestAndUpgradeSuggestionsPreferFittingQuality =
        best?.name === 'qwen3.5:14b'
        && suggestion16?.model === 'qwen3.5:14b'
        && suggestion32?.model === 'qwen3.6:27b'
        && suggestion32?.note.includes('~20 GB')
        && suggestion8?.model === 'qwen3.5:9b'
        && hardware.getModelSuggestions({ gpu: { vram: 8, unified: false } })[0]?.model === 'qwen3.5:9b'
        && hardware.getUpgradeSuggestion([{ name: 'qwen3.5:14b', size: 9e9 }], desktop) === null;
    } finally {
      document.createElement = originalCreateElement;
      restoreNavigatorProp('deviceMemory', originalDeviceMemory);
      restoreNavigatorProp('hardwareConcurrency', originalHardwareConcurrency);
      if (savedOverride === null) localStorage.removeItem('labcharts-hw-vram-override');
      else localStorage.setItem('labcharts-hw-vram-override', savedOverride);
    }

    return outcomes;
  }, { hardwareUrl: moduleUrl('/js/hardware.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('external lens browser contract covers validation fetch cache save and remove flows', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lensUrl }) => {
    const lens = await import(lensUrl);
    const cryptoStore = await import('/js/crypto.js');
    const outcomes = {};
    const originalFetch = window.fetch;
    const saved = {
      config: localStorage.getItem('labcharts-lens-config'),
      key: localStorage.getItem('labcharts-lens-key'),
      encryption: localStorage.getItem('labcharts-encryption-enabled'),
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      ollamaModel: localStorage.getItem('labcharts-ollama-model'),
    };
    const calls = [];

    const setConfig = (partial) => {
      localStorage.setItem('labcharts-lens-config', JSON.stringify({
        name: 'Research KB',
        url: 'http://127.0.0.1:8322/query',
        enabled: true,
        topK: 4,
        testProbe: 'omega 3 index',
        backend: 'external-server',
        multiQuery: true,
        ...partial,
      }));
    };

    const makeJsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-ollama-model', 'lens-rewrite-test-model');
      setConfig({});
      await lens.saveLensKey('secret-token');

      window.fetch = async (url, opts) => {
        const href = String(url);
        if (!opts?.body) {
          if (href.endsWith('/v1/models')) return makeJsonResponse({ data: [{ id: 'lens-rewrite-test-model' }] });
          return makeJsonResponse({ error: 'unsupported' }, 404);
        }
        const body = JSON.parse(String(opts?.body || '{}'));
        if (Array.isArray(body.messages)) {
          calls.push({ kind: 'rewrite', url: String(url), body });
          return makeJsonResponse({
            choices: [{
              message: {
                content: [
                  'cholecalciferol immune function',
                  'calcitriol inflammation response',
                  'vitamin d deficiency cytokines',
                ].join('\n'),
              },
            }],
            usage: { prompt_tokens: 12, completion_tokens: 18 },
          });
        }
        calls.push({
          kind: 'rag',
          url: String(url),
          auth: opts?.headers?.Authorization,
          body,
          credentials: opts?.credentials,
          redirect: opts?.redirect,
          referrerPolicy: opts?.referrerPolicy,
        });
        const chunks = [
          { text: 'Omega-3 index supports membrane health.', source: 'lipids.md' },
          { text: 'Vitamin D pairs with K2 in this protocol.', source: 'd3.md' },
        ];
        const topK = Number.isFinite(body.top_k) ? Math.max(0, body.top_k) : chunks.length;
        return makeJsonResponse({
          chunks: chunks.slice(0, topK),
        });
      };

      const connection = await lens.testLensConnection();
      outcomes.connectionUsesSavedProbeAndBearer = connection.ok === true
        && connection.chunkCount === 2
        && connection.firstSource === 'lipids.md'
        && calls[0].url === 'http://127.0.0.1:8322/query'
        && calls[0].auth === 'Bearer secret-token'
        && calls[0].body.query === 'omega 3 index'
        && calls[0].body.top_k === 4
        && calls[0].credentials === 'omit'
        && calls[0].redirect === 'error'
        && calls[0].referrerPolicy === 'no-referrer';

      const statuses = [];
      const unsubscribe = lens.subscribeLensStatus(status => statuses.push({ ...status }));
      const first = await lens.queryLens('vitamin d protocol', { topK: 2 });
      const second = await lens.queryLens('vitamin d protocol', { topK: 2 });
      const multi = await lens.queryLensMulti('vitamin d inflammation protocol', { topK: 1 });
      unsubscribe();
      const rewriteCalls = calls.filter(call => call.kind === 'rewrite');
      const ragCalls = calls.filter(call => call.kind === 'rag');
      const multiRagCalls = ragCalls.slice(-4);
      const multiQueries = multiRagCalls.map(call => call.body.query);
      outcomes.queryCachesResultsAndReportsStatus = first?.chunks.length === 2
        && second?.chunks.length === 2
        && multi?.chunks.length === 1
        && rewriteCalls.length === 1
        && rewriteCalls[0].body.messages.some(msg => msg.role === 'user' && msg.content === 'vitamin d inflammation protocol')
        && ragCalls.length === 6
        && ragCalls[1].body.top_k === 2
        && multiRagCalls.every(call => call.body.top_k === 1)
        && multiQueries.length === 4
        && multiQueries.includes('vitamin d inflammation protocol')
        && multiQueries.includes('cholecalciferol immune function')
        && multiQueries.includes('calcitriol inflammation response')
        && multiQueries.includes('vitamin d deficiency cytokines')
        && statuses.some(status => status.state === 'active' && status.lastChunkCount === 2 && status.sourceName === 'Research KB');

      const snippet = lens.buildLensSnippet(first);
      outcomes.snippetCitesSources = snippet.includes('Retrieved from your knowledge source (Research KB)')
        && snippet.includes('Omega-3 index supports membrane health. -- lipids.md') === false
        && snippet.includes('Omega-3 index supports membrane health.')
        && snippet.includes('lipids.md');

      window.fetch = async () => new Response('x'.repeat(33 * 1024), { status: 200 });
      lens.clearLensCache();
      const oversized = await lens.queryLens('oversized response', { topK: 2 });
      outcomes.oversizedResponseSetsErrorStatus = oversized === null
        && lens.getLensStatus().state === 'error'
        && String(lens.getLensStatus().lastError).includes('Response exceeds');

      outcomes.urlValidationAndLegacyMigration =
        lens.isValidLensUrl('https://example.com/query') === true
        && lens.isValidLensUrl('http://localhost:8322/query') === true
        && lens.isValidLensUrl('http://192.168.1.10/query') === true
        && lens.isValidLensUrl('http://example.com/query') === false
        && lens.isValidLensUrl('ftp://example.com/query') === false;

      localStorage.setItem('labcharts-lens-config', JSON.stringify({ url: 'https://legacy.example/query', enabled: true }));
      const legacyExternal = lens.getLensConfig();
      localStorage.setItem('labcharts-lens-config', JSON.stringify({ backend: 'desktop-engine', url: '', enabled: true }));
      const legacyDesktop = lens.getLensConfig();
      outcomes.urlValidationAndLegacyMigration = outcomes.urlValidationAndLegacyMigration
        && legacyExternal.backend === 'external-server'
        && legacyDesktop.backend === 'in-browser';

      setConfig({ name: 'Before Save', url: 'https://kb.example.test/query', enabled: false, topK: 5 });
      await lens.saveLensKey('old-token');
      window.fetch = async (url, opts) => {
        calls.push({
          url: String(url),
          auth: opts?.headers?.Authorization,
          body: JSON.parse(String(opts?.body || '{}')),
        });
        return makeJsonResponse({ chunks: [] });
      };

      await lens.openKnowledgeBaseModal();
      document.getElementById('lens-name-input').value = 'Saved KB';
      document.getElementById('lens-url-input').value = 'https://kb.example.test/query///';
      document.getElementById('lens-key-input').value = 'new-token';
      document.getElementById('lens-test-probe-input').value = 'berberine glucose';
      document.getElementById('lens-topk-input').value = '99';
      document.getElementById('lens-enabled-toggle').checked = true;
      document.getElementById('lens-multi-query-checkbox').checked = false;
      const beforeSaveCalls = calls.length;
      await lens.handleSaveLensConfig();
      const savedCfg = lens.getLensConfig();
      outcomes.modalSavePersistsClampedConfigAndRetests = savedCfg.name === 'Saved KB'
        && savedCfg.url === 'https://kb.example.test/query'
        && savedCfg.enabled === true
        && savedCfg.topK === 10
        && savedCfg.testProbe === 'berberine glucose'
        && savedCfg.multiQuery === false
        && lens.getLensKey() === 'new-token'
        && calls.length === beforeSaveCalls + 1
        && calls[calls.length - 1].body.query === 'berberine glucose'
        && calls[calls.length - 1].body.top_k === 10
        && document.getElementById('custom-lens-section')?.textContent.includes('Active · Saved KB');

      const removePromise = lens.handleRemoveLens();
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      await removePromise;
      outcomes.removeLensClearsExternalConfigAndKey = lens.getLensConfig().enabled === false
        && lens.getLensKey() === ''
        && lens.hasLens() === false
        && localStorage.getItem('labcharts-lens-config') === null
        && (localStorage.getItem('labcharts-lens-key') || '') === ''
        && document.getElementById('custom-lens-section')?.textContent.includes('Ready, currently off');
    } finally {
      window.fetch = originalFetch;
      lens.closeKnowledgeBaseModal?.();
      document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
      if (saved.config === null) localStorage.removeItem('labcharts-lens-config');
      else localStorage.setItem('labcharts-lens-config', saved.config);
      if (saved.key === null) localStorage.removeItem('labcharts-lens-key');
      else localStorage.setItem('labcharts-lens-key', saved.key);
      if (saved.encryption === null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', saved.encryption);
      if (saved.aiProvider === null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.aiProvider);
      if (saved.aiPaused === null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.aiPaused);
      if (saved.ollamaModel === null) localStorage.removeItem('labcharts-ollama-model');
      else localStorage.setItem('labcharts-ollama-model', saved.ollamaModel);
      cryptoStore.updateKeyCache('labcharts-lens-key', saved.key || '');
    }

    return outcomes;
  }, { lensUrl: moduleUrl('/js/lens.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('in-browser lens render covers local panel status and backend switching without booting worker', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lensUrl }) => {
    const lens = await import(lensUrl);
    const cryptoStore = await import('/js/crypto.js');
    const outcomes = {};
    const originalRAF = window.requestAnimationFrame;
    const saved = {
      config: localStorage.getItem('labcharts-lens-config'),
      key: localStorage.getItem('labcharts-lens-key'),
      count: localStorage.getItem('labcharts-lens-local-count'),
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      openRouterKey: localStorage.getItem('labcharts-openrouter-key'),
    };
    const navigatorProto = Object.getPrototypeOf(navigator);
    const originalStorage = Object.getOwnPropertyDescriptor(navigatorProto, 'storage');
    const section = document.createElement('section');
    section.id = 'custom-lens-section';

    try {
      window.requestAnimationFrame = () => 0;
      try {
        Object.defineProperty(navigatorProto, 'storage', {
          configurable: true,
          get: () => ({ persisted: async () => true }),
        });
      } catch {}
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.removeItem('labcharts-openrouter-key');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', '');
      localStorage.setItem('labcharts-lens-local-count', '12');
      localStorage.setItem('labcharts-lens-config', JSON.stringify({
        name: 'Local Papers',
        enabled: true,
        topK: 7,
        backend: 'in-browser',
        multiQuery: true,
      }));
      cryptoStore.updateKeyCache('labcharts-lens-key', '');

      await lens.loadLensKnowledgeBaseUi();
      section.innerHTML = lens.renderCustomLensSection();
      document.body.appendChild(section);
      const remoteFields = /** @type {HTMLElement | null} */ (section.querySelector('#lens-remote-fields'));
      const localFields = /** @type {HTMLElement | null} */ (section.querySelector('#lens-local-fields'));
      const summary = lens.getLensSummary();
      outcomes.localRenderShowsLibraryDropAndNoRemoteFields = section.querySelector('#lens-local-fields') !== null
        && section.querySelector('#lens-local-drop') !== null
        && section.querySelector('#lens-library-select') !== null
        && section.querySelector('#lens-url-input') === null
        && remoteFields === null
        && localFields
        && getComputedStyle(localFields).display !== 'none'
        && section.textContent.includes('Files, embeddings, and searches stay on this device')
        && section.textContent.includes('matching excerpts are included in the request to your configured AI provider')
        && lens.hasLens() === true
        && summary.configured === true
        && summary.backend === 'in-browser'
        && summary.displayName === 'Local Papers'
        && summary.aiAvailable === false
        && summary.multiQueryOn === false;
      outcomes.customLensSettingsUseDelegatedActions = !section.querySelector('[onclick], [onchange], [oninput]')
        && !!section.querySelector('[data-lens-action="set-backend"][data-lens-backend="external-server"]')
        && !!section.querySelector('#lens-enabled-toggle[data-lens-action="toggle-enabled"]')
        && !!section.querySelector('[data-lens-action="save-config"]');

      const enabledToggle = /** @type {HTMLInputElement | null} */ (section.querySelector('#lens-enabled-toggle'));
      if (enabledToggle) {
        enabledToggle.checked = false;
        enabledToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      outcomes.toggleUpdatesConfigAndStatusChipWithoutRerender = lens.getLensConfig().enabled === false
        && document.getElementById('lens-status-chip')?.textContent.includes('Ready, currently off');

      section.querySelector('[data-lens-action="clear-cache"]')?.click();
      outcomes.clearCacheKeepsStatusCallable = typeof lens.getLensStatus().state === 'string';

      section.querySelector('[data-lens-action="set-backend"][data-lens-backend="external-server"]')?.click();
      const remoteFieldsAfterSwitch = /** @type {HTMLElement | null} */ (section.querySelector('#lens-remote-fields'));
      const localFieldsAfterSwitch = /** @type {HTMLElement | null} */ (section.querySelector('#lens-local-fields'));
      outcomes.backendSwitchRerendersRemoteFieldsAndRemovesLegacyIndicator = lens.getLensConfig().backend === 'external-server'
        && section.querySelector('#lens-remote-fields') !== null
        && section.querySelector('#lens-url-input') !== null
        && section.querySelector('#lens-local-drop') === null
        && remoteFieldsAfterSwitch
        && getComputedStyle(remoteFieldsAfterSwitch).display !== 'none'
        && localFieldsAfterSwitch === null
        && document.getElementById('chat-lens-indicator') === null;
    } finally {
      window.requestAnimationFrame = originalRAF;
      section.remove();
      if (originalStorage) {
        try { Object.defineProperty(navigatorProto, 'storage', originalStorage); } catch {}
      }
      if (saved.config === null) localStorage.removeItem('labcharts-lens-config');
      else localStorage.setItem('labcharts-lens-config', saved.config);
      if (saved.key === null) localStorage.removeItem('labcharts-lens-key');
      else localStorage.setItem('labcharts-lens-key', saved.key);
      if (saved.count === null) localStorage.removeItem('labcharts-lens-local-count');
      else localStorage.setItem('labcharts-lens-local-count', saved.count);
      if (saved.aiProvider === null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.aiProvider);
      if (saved.aiPaused === null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.aiPaused);
      if (saved.openRouterKey === null) localStorage.removeItem('labcharts-openrouter-key');
      else localStorage.setItem('labcharts-openrouter-key', saved.openRouterKey);
      cryptoStore.updateKeyCache('labcharts-lens-key', saved.key || '');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', saved.openRouterKey || '');
    }

    return outcomes;
  }, { lensUrl: moduleUrl('/js/lens.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
