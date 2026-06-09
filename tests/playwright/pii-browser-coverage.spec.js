import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?piiBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('PII browser coverage exercises config probes regex obfuscation and diff helpers', async ({ page }) => {
  await openBlankPage(page, '/pii-browser-coverage');

  const results = await page.evaluate(async ({ piiUrl, cryptoUrl, providerStorageUrl }) => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const streamResponse = (chunks) => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });

    const pii = await import(piiUrl);
    const cryptoStore = await import(cryptoUrl);
    const providerStorage = await import(providerStorageUrl);

    const storageKeys = [
      'labcharts-ollama',
      'labcharts-ollama-model',
      'labcharts-ollama-pii-url',
      'labcharts-ollama-pii-model',
      'labcharts-ollama-pii-enabled',
    ];
    const savedStorage = Object.fromEntries(storageKeys.map(key => [key, localStorage.getItem(key)]));
    const saved = {
      fetch: window.fetch,
      markAISettingsLocal: window.markAISettingsLocal,
      bodyOverflow: document.body.style.overflow,
      abortSignalAnyDescriptor: Object.getOwnPropertyDescriptor(AbortSignal, 'any'),
    };

    const fetchCalls = [];
    let mode = 'ok';
    let markCount = 0;
    let abortAnyPatched = false;

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      cryptoStore.updateKeyCache('labcharts-ollama', null);
      window.markAISettingsLocal = () => { markCount += 1; };
      providerStorage.setOllamaPIIUrl('http://localhost:11434');
      providerStorage.setOllamaPIIModel('privacy-qwen:7b');

      window.fetch = async (url, options = {}) => {
        const href = typeof url === 'string' ? url : url?.url || String(url);
        const headers = options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : (options.headers || {});
        fetchCalls.push({
          href,
          method: String(options.method || 'GET').toUpperCase(),
          auth: headers.Authorization || headers.authorization || '',
          body: String(options.body || ''),
        });

        if (href.endsWith('/api/version')) {
          if (mode === 'probe-abort') {
            return new Promise((resolve, reject) => {
              options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            });
          }
          if (mode === 'probe-fails') throw new Error('offline');
          return jsonResponse({ version: '0.5.0' });
        }
        if (href.endsWith('/api/tags')) {
          if (mode === 'tags-non-ok') return jsonResponse({ error: 'nope' }, 503);
          if (mode === 'tags-throws') throw new Error('network down');
          return jsonResponse({
            models: [
              { name: 'llama3.2:latest', size: 3200000000, details: { parameter_size: '3B', quantization_level: 'Q4_K_M', family: 'llama' } },
              { model: 'qwen2.5:7b', details: { family: 'qwen' } },
            ],
          });
        }
        if (href.endsWith('/v1/models')) {
          if (mode === 'models-non-ok') return jsonResponse({ error: 'locked' }, 401);
          if (mode === 'models-throws') throw new Error('models offline');
          return jsonResponse({
            data: [
              { id: 'qwen2.5:7b-instruct-q4_k_m', owned_by: 'local', size: 4700000000 },
              { id: 'llama-3.2-3b-fp16' },
            ],
          });
        }
        if (href.endsWith('/v1/chat/completions')) {
          if (mode === 'sanitize-timeout') {
            const error = new Error('timed out');
            error.name = 'TimeoutError';
            throw error;
          }
          if (mode === 'sanitize-short') {
            return jsonResponse({ choices: [{ message: { content: 'x' } }] });
          }
          if (mode === 'streaming') {
            return streamResponse([
              'data: {"choices":[{"delta":{"reasoning_content":"checking identifiers"}}]}\n\n',
              'data: {"not-json"\n\n',
              'data: {"choices":[{"delta":{"content":"Patient: "}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"<think>hidden chain</think>Jana Novak\\nDate: 2026-01-02\\nPhone: +420 711 222 333"}}]}\n\n',
              'data: [DONE]\n\n',
            ]);
          }
          return jsonResponse({
            choices: [{
              message: {
                content: 'Patient: Jana Novak\nDate: 2026-01-02\nPhone: +420 711 222 333',
              },
            }],
          });
        }
        if (href.endsWith('/api/generate')) {
          return jsonResponse({ done: true });
        }
        return jsonResponse({});
      };

      check('female sex detected from Czech label', pii.detectSexFromPDF('Pohlaví: žena\nName: Alice') === 'female');
      check('male sex detected from English label', pii.detectSexFromPDF('Gender: male') === 'male');
      check('female sex detected from birth number', pii.detectSexFromPDF('RC: 845101/1234') === 'female');
      check('missing sex returns null', pii.detectSexFromPDF('No demographics here') === null);
      check('fakeName branches by sex', pii.fakeName('female') !== pii.fakeName('male'));
      check('random generators shape fake values',
        pii.randomPick(['a', 'b']) &&
        /^\d{6}\/\d{4}$/.test(pii.fakeBirthNumber()) &&
        /^\+420 7\d{2} \d{3} \d{3}$/.test(pii.fakePhone()) &&
        /^user\d{4}@mail\.com$/.test(pii.fakeEmail()) &&
        /^\d{2}\.\d{2}\.\d{4}$/.test(pii.fakeDate()) &&
        /^\d{10}$/.test(pii.fakePatientId()));

      const defaultConfig = pii.getOllamaConfig();
      await pii.saveOllamaConfig({ url: 'http://local-ai.test/', model: 'privacy-model', mode: 'openai', apiKey: 'pii-key' });
      const savedConfig = pii.getOllamaConfig();
      check('Ollama config defaults and encrypted save cache work',
        defaultConfig.url === 'http://localhost:11434' &&
        savedConfig.model === 'privacy-model' &&
        savedConfig.apiKey === 'pii-key' &&
        markCount >= 1);

      mode = 'ok';
      const ollamaOk = await pii.checkOllama('http://localhost:11434');
      mode = 'tags-non-ok';
      const ollamaNonOk = await pii.checkOllama('http://localhost:11434');
      mode = 'tags-throws';
      const ollamaThrows = await pii.checkOllama('http://localhost:11434');
      check('checkOllama covers success non-ok and fetch errors',
        ollamaOk.available === true &&
        ollamaOk.models.includes('llama3.2:latest') &&
        ollamaOk.modelDetails[0].paramSize === '3B' &&
        ollamaNonOk.available === false &&
        ollamaThrows.available === false);

      mode = 'ok';
      const compatibleOk = await pii.checkOpenAICompatible('http://compat.local/', 'compat-key');
      mode = 'models-non-ok';
      const compatibleNonOk = await pii.checkOpenAICompatible('http://compat.local/', '');
      mode = 'models-throws';
      const compatibleThrows = await pii.checkOpenAICompatible('http://compat.local/', '');
      check('OpenAI-compatible probe covers model parsing and auth header',
        compatibleOk.available === true &&
        compatibleOk.models.includes('qwen2.5:7b-instruct-q4_k_m') &&
        compatibleOk.modelDetails.some(model => model.paramSize === '7B' && /Q4/i.test(model.quantLevel)) &&
        fetchCalls.some(call => call.href === 'http://compat.local/v1/models' && call.auth === 'Bearer compat-key') &&
        compatibleNonOk.available === false &&
        compatibleThrows.available === false);

      pii.setOllamaPIIEnabled(false);
      const disabledPII = await pii.checkOllamaPII();
      mode = 'ok';
      pii.setOllamaPIIEnabled(true);
      const enabledPII = await pii.checkOllamaPII();
      check('PII enabled flag gates local model probe',
        disabledPII.available === false &&
        enabledPII.available === true &&
        pii.isOllamaPIIEnabled() === true);

      const beforeUnloadCalls = fetchCalls.length;
      pii.unloadOllamaPIIModel();
      const unloadCall = fetchCalls.slice(beforeUnloadCalls).find(call => call.href.endsWith('/api/generate'));
      check('unloadOllamaPIIModel posts keep_alive zero to Ollama', unloadCall?.body.includes('"keep_alive":0') === true);

      const reportText = [
        'Pohlaví: žena',
        'Patient name: Alice Smith',
        'Address: 123 Real Street',
        'Date of birth: 01.02.1980',
        'Doctor: Dr. Real',
        'Birth number: 845101/1234',
        'Insurance number: 1234567890',
        'Patient ID: 9988776655',
        'Specimen ID: 112233445566',
        'Age: 52 years',
        'Email: alice@example.com',
        'Tel: +420 777 888 999',
        'Glucose 5.4 mmol/L',
        'Collection date: 2026-01-02',
      ].join('\n');
      const obfuscated = pii.obfuscatePDFText(reportText);
      check('regex obfuscator replaces labeled PII while preserving result and collection lines',
        obfuscated.replacements >= 9 &&
        !obfuscated.obfuscated.includes('Alice Smith') &&
        !obfuscated.obfuscated.includes('alice@example.com') &&
        obfuscated.obfuscated.includes('Glucose 5.4 mmol/L') &&
        obfuscated.obfuscated.includes('Collection date: 2026-01-02'));

      const diff = pii.buildPIIDiffHTML('\nName: Alice\nSame\n', '\nName: Jana\nSame\n');
      check('PII diff HTML highlights changed words and trims outer blank lines',
        diff.leftHtml.includes('pii-word-removed') &&
        diff.rightHtml.includes('pii-word-added') &&
        !diff.leftHtml.startsWith('<div>&nbsp;'));

      const longLine = `${'alpha '.repeat(210)}Alice`;
      const longDiff = pii.buildPIIDiffHTML(longLine, longLine.replace('Alice', 'Jana'));
      check('PII diff long-line fallback highlights whole changed lines',
        longDiff.leftHtml.includes('pii-word-removed') && longDiff.rightHtml.includes('pii-word-added'));

      pii.showPIIDiffViewer('Name: Alice', 'Name: Jana');
      await wait(25);
      const viewer = document.querySelector('.pii-warning-overlay');
      check('showPIIDiffViewer opens modal and locks body scroll',
        viewer?.classList.contains('show') === true &&
        document.body.style.overflow === 'hidden' &&
        viewer.querySelector('.pii-diff-left')?.innerHTML.includes('Alice'));
      viewer.querySelector('.modal-close')?.click();
      check('showPIIDiffViewer close button removes overlay', !document.querySelector('.pii-warning-overlay'));

      mode = 'ok';
      const sanitized = await pii.sanitizeWithOllama('Patient: Alice\nDate: 2026-01-02\nPhone: +420 777 888 999');
      mode = 'sanitize-short';
      let shortError = '';
      try {
        await pii.sanitizeWithOllama('Patient: Alice\nDate: 2026-01-02\nPhone: +420 777 888 999');
      } catch (error) {
        shortError = error.message;
      }
      mode = 'sanitize-timeout';
      let timeoutError = '';
      try {
        await pii.sanitizeWithOllama('Patient: Alice\nDate: 2026-01-02\nPhone: +420 777 888 999');
      } catch (error) {
        timeoutError = error.message;
      }
      check('sanitizeWithOllama covers success validation and timeout notification',
        sanitized.includes('Jana Novak') &&
        /too short/i.test(shortError) &&
        /timed out/i.test(timeoutError) &&
        document.getElementById('notification-container')?.textContent.includes('timed out'));

      const streamChunks = [];
      const thinkingChunks = [];
      mode = 'streaming';
      const streamed = await pii.sanitizeWithOllamaStreaming(
        'Patient: Alice\nDate: 2026-01-02\nPhone: +420 777 888 999',
        chunk => streamChunks.push(chunk),
        undefined,
        chunk => thinkingChunks.push(chunk)
      );
      mode = 'probe-abort';
      let probeError = '';
      try {
        if (saved.abortSignalAnyDescriptor?.configurable) {
          Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
          abortAnyPatched = true;
        }
        const abortController = new AbortController();
        const probeRun = pii.sanitizeWithOllamaStreaming('Patient: Alice\nDate: 2026-01-02', () => {}, abortController.signal);
        await wait();
        abortController.abort(new DOMException('Stopped', 'AbortError'));
        await probeRun;
      } catch (error) {
        probeError = error.message;
      }
      check('sanitizeWithOllamaStreaming handles stream chunks malformed JSON and thinking',
        streamed.includes('Jana Novak') &&
        streamChunks.join('').includes('Patient: Jana') &&
        thinkingChunks.join('').includes('checking identifiers') &&
        thinkingChunks.join('').includes('hidden chain'));
      check('sanitizeWithOllamaStreaming abort probe fallback reports unreachable server',
        /unreachable/i.test(probeError),
        probeError);
    } finally {
      window.fetch = saved.fetch;
      window.markAISettingsLocal = saved.markAISettingsLocal;
      document.body.style.overflow = saved.bodyOverflow;
      document.querySelectorAll('.pii-warning-overlay').forEach(el => el.remove());
      if (abortAnyPatched && saved.abortSignalAnyDescriptor) {
        Object.defineProperty(AbortSignal, 'any', saved.abortSignalAnyDescriptor);
      }
      for (const [key, value] of Object.entries(savedStorage)) {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      cryptoStore.updateKeyCache('labcharts-ollama', savedStorage['labcharts-ollama']);
    }

    return { failures };
  }, {
    piiUrl: moduleUrl('/js/pii.js'),
    cryptoUrl: moduleUrl('/js/crypto.js'),
    providerStorageUrl: moduleUrl('/js/api-provider-storage.js'),
  });

  expect(results.failures).toEqual([]);
});

test('PII browser coverage exercises review modal search edit streaming stop retry and cancel paths', async ({ page }) => {
  await openBlankPage(page, '/pii-browser-review-coverage');

  const results = await page.evaluate(async ({ piiUrl }) => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label, timeout = 2500) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (predicate()) return true;
        await wait(25);
      }
      failures.push(`Timed out waiting for ${label}`);
      return false;
    };
    const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    const pii = await import(piiUrl);

    const saved = {
      fetch: window.fetch,
      bodyOverflow: document.body.style.overflow,
    };
    const unloadCalls = [];

    try {
      window.fetch = async (url, options = {}) => {
        const href = typeof url === 'string' ? url : url?.url || String(url);
        if (href.endsWith('/api/generate')) {
          unloadCalls.push(String(options.body || ''));
          return jsonResponse({ done: true });
        }
        return jsonResponse({});
      };

      const original = 'Patient: Alice Smith\nPhone: +420 777 888 999\nDate: 2026-01-02';
      const obfuscated = 'Patient: Jana Novak\nPhone: +420 711 222 333\nDate: 2026-01-02';

      const cancelPromise = pii.reviewPIIBeforeSend(original, { obfuscatedText: obfuscated });
      await waitFor(() => !!document.querySelector('.pii-warning-overlay'), 'non-streaming review modal');
      let overlay = document.querySelector('.pii-warning-overlay');
      const search = overlay.querySelector('#pii-search-input');
      const textarea = overlay.querySelector('#pii-edit-textarea');
      const sendBtn = overlay.querySelector('#pii-review-send');
      const searchCount = overlay.querySelector('#pii-search-count');

      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait();
      const nudged = overlay.querySelector('.pii-diff-modal')?.classList.contains('modal-nudge') === true;
      search.value = 'A';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const shortSearchClears = searchCount.textContent === '';
      search.value = 'Jana';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const searchFinds = searchCount.textContent.includes('found') && searchCount.classList.contains('pii-search-warn');
      search.value = 'NotPresent';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const searchClears = searchCount.textContent === 'Not found' && searchCount.classList.contains('pii-search-clear');
      textarea.value += '\nReviewed';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const dirtyButton = sendBtn.textContent.includes('Save');
      textarea.focus();
      textarea.blur();
      await waitFor(() => !!overlay.querySelector('.pii-diff-preview'), 'diff preview after blur');
      overlay.querySelector('#pii-edit-btn').click();
      const editMode = textarea.style.display !== 'none';
      overlay.querySelector('#pii-review-regex').click();
      await waitFor(() => !!overlay.querySelector('.pii-diff-preview'), 'regex diff preview');
      const regexFallback = textarea.value.includes('Jana') || textarea.value.includes('Jan');
      overlay.querySelector('#pii-review-cancel').click();
      const cancelResult = await cancelPromise;

      check('non-streaming PII review modal covers nudge search edit regex and cancel',
        nudged && shortSearchClears && searchFinds && searchClears && dirtyButton && editMode && regexFallback && cancelResult === 'cancel');

      let streamAttempts = 0;
      const streamPromise = pii.reviewPIIBeforeSend(original, {
        streamFn: (onChunk, signal, onThinking) => {
          streamAttempts += 1;
          if (streamAttempts === 1) {
            onThinking('first-pass thinking');
            onChunk('Partial ');
            return new Promise((resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
            });
          }
          return new Promise(resolve => {
            onThinking('retry thinking');
            setTimeout(() => {
              onChunk('Patient: Jana Novak\nDate: 2026-01-02');
              resolve();
            }, 20);
          });
        },
      });
      await waitFor(() => !!document.querySelector('.pii-warning-overlay'), 'streaming review modal');
      overlay = document.querySelector('.pii-warning-overlay');
      await waitFor(() => overlay.querySelector('#pii-edit-textarea')?.value.includes('Partial'), 'initial streaming chunk');
      overlay.querySelector('#pii-stream-stop').click();
      await waitFor(() => overlay.querySelector('#pii-stream-status')?.textContent.includes('Stopped'), 'stream stop status');
      const stopState = overlay.querySelector('#pii-stream-retry')?.hidden === false
        && overlay.querySelector('#pii-stream-stop')?.hidden === true
        && overlay.querySelector('#pii-review-send')?.disabled === false;
      overlay.querySelector('#pii-stream-retry').click();
      await waitFor(() => overlay.querySelector('#pii-stream-status')?.textContent.includes('Complete'), 'stream retry completion');
      const retryState = overlay.querySelector('#pii-thinking-section')?.hidden === false
        && overlay.querySelector('#pii-thinking-section summary')?.textContent.includes('done')
        && overlay.querySelector('.pii-diff-preview')?.textContent.includes('Jana Novak');
      overlay.querySelector('#pii-edit-btn').click();
      const streamTextarea = overlay.querySelector('#pii-edit-textarea');
      streamTextarea.value += '\nReviewed after retry';
      streamTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      overlay.querySelector('#pii-review-send').click();
      const streamedResult = await streamPromise;

      check('streaming PII review modal covers stop retry thinking completion edit and send',
        stopState &&
        retryState &&
        streamedResult.includes('Reviewed after retry') &&
        unloadCalls.some(body => body.includes('"keep_alive":0')));
    } finally {
      window.fetch = saved.fetch;
      document.body.style.overflow = saved.bodyOverflow;
      document.querySelectorAll('.pii-warning-overlay').forEach(el => el.remove());
    }

    return { failures };
  }, { piiUrl: moduleUrl('/js/pii.js') });

  expect(results.failures).toEqual([]);
});
