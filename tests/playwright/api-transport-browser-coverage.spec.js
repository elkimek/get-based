import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?apiTransportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/api-transport-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/api-transport-browser-coverage', { waitUntil: 'load' });
}

test('api transport browser coverage exercises proxy retry abort and stream timeout paths', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ apiTransportUrl }) => {
    const transport = await import(apiTransportUrl);
    const outcomes = {};

    const withImmediateTimers = async (fn) => {
      const originalSetTimeout = window.setTimeout;
      const originalClearTimeout = window.clearTimeout;
      window.setTimeout = (cb, _ms, ...args) => originalSetTimeout(() => cb(...args), 0);
      window.clearTimeout = (handle) => originalClearTimeout(handle);
      try {
        return await fn();
      } finally {
        window.setTimeout = originalSetTimeout;
        window.clearTimeout = originalClearTimeout;
      }
    };

    const originalFetch = window.fetch;
    try {
      const proxyCalls = [];
      window.fetch = async (url, options = {}) => {
        proxyCalls.push({ url: String(url), options });
        return new Response('proxied', { status: 201 });
      };
      const proxiedFetch = transport.createProxyFetch(() => true);
      const proxySignal = new AbortController().signal;
      const proxyResponse = await proxiedFetch('https://api.example.test/v1/chat', {
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
        body: '{"message":"hello"}',
        signal: proxySignal,
      });
      const proxyBody = JSON.parse(proxyCalls[0]?.options?.body || '{}');
      outcomes.createProxyFetchWrapsRequestsAndDropsContentType = proxyResponse.status === 201
        && proxyCalls[0].url === '/api/proxy'
        && proxyCalls[0].options.method === 'POST'
        && proxyCalls[0].options.headers['Content-Type'] === 'application/json'
        && proxyCalls[0].options.signal === proxySignal
        && proxyBody.url === 'https://api.example.test/v1/chat'
        && proxyBody.body === '{"message":"hello"}'
        && proxyBody.headers.Authorization === 'Bearer test-key'
        && !Object.prototype.hasOwnProperty.call(proxyBody.headers, 'Content-Type');

      const directCalls = [];
      window.fetch = async (url, options = {}) => {
        directCalls.push({ url: String(url), options });
        return new Response('direct', { status: 202 });
      };
      const directFetch = transport.createProxyFetch(() => false);
      const directResponse = await directFetch('https://direct.example.test/models', {
        headers: { Accept: 'application/json' },
        body: 'direct-body',
      });
      outcomes.createProxyFetchCanBypassProxy = directResponse.status === 202
        && directCalls.length === 1
        && directCalls[0].url === 'https://direct.example.test/models'
        && directCalls[0].options.body === 'direct-body';
    } finally {
      window.fetch = originalFetch;
    }

    let cancelCalled = false;
    const streamResult = await transport.readWithStallTimeout({
      read: () => Promise.resolve({ done: false, value: 'chunk' }),
      cancel: () => { cancelCalled = true; },
    }, 'coverage stream');
    let rejectedMessage = '';
    try {
      await transport.readWithStallTimeout({
        read: () => Promise.reject(new Error('reader failed')),
        cancel: () => {},
      }, 'coverage stream');
    } catch (err) {
      rejectedMessage = err?.message || '';
    }
    let stalledMessage = '';
    let stalledCancelCalled = false;
    await withImmediateTimers(async () => {
      try {
        await transport.readWithStallTimeout({
          read: () => new Promise(() => {}),
          cancel: () => { stalledCancelCalled = true; },
        }, 'coverage stream');
      } catch (err) {
        stalledMessage = err?.message || '';
      }
    });
    outcomes.readWithStallTimeoutCoversResolveRejectAndCancel = streamResult.value === 'chunk'
      && cancelCalled === false
      && rejectedMessage === 'reader failed'
      && stalledCancelCalled === true
      && stalledMessage.includes('coverage stream stalled');

    let rateLimitAttempts = 0;
    const rateLimitResponse = await withImmediateTimers(() => transport.fetchWithRetry(
      'https://api.example.test/rate-limit',
      { method: 'POST', headers: {}, body: '{}' },
      {
        retries: 1,
        useProxy: true,
        proxyFetch: async () => {
          rateLimitAttempts += 1;
          if (rateLimitAttempts === 1) {
            return new Response('limited', { status: 429, headers: { 'retry-after': '0' } });
          }
          return new Response('ok', { status: 200 });
        },
        debug: () => false,
      },
    ));
    outcomes.fetchWithRetryRetriesRateLimits = rateLimitAttempts === 2
      && rateLimitResponse.status === 200;

    let networkAttempts = 0;
    const networkResponse = await withImmediateTimers(() => transport.fetchWithRetry(
      'https://api.example.test/network',
      { method: 'GET', headers: {} },
      {
        retries: 1,
        useProxy: false,
        directFetch: async () => {
          networkAttempts += 1;
          if (networkAttempts === 1) throw new TypeError('Failed to fetch');
          return new Response('recovered', { status: 200 });
        },
        debug: () => false,
      },
    ));
    outcomes.fetchWithRetryRetriesTransientNetworkErrors = networkAttempts === 2
      && networkResponse.status === 200;

    const abortController = new AbortController();
    abortController.abort('user-stop');
    let abortAttempts = 0;
    let abortMessage = '';
    try {
      await transport.fetchWithRetry(
        'https://api.example.test/abort',
        { method: 'GET', headers: {}, signal: abortController.signal },
        {
          retries: 2,
          useProxy: false,
          directFetch: async () => {
            abortAttempts += 1;
            throw new Error('caller aborted');
          },
          debug: () => false,
        },
      );
    } catch (err) {
      abortMessage = err?.message || '';
    }
    outcomes.fetchWithRetryDoesNotRetryCallerAbort = abortAttempts === 1
      && abortMessage === 'caller aborted';

    let timeoutMessage = '';
    try {
      await transport.fetchWithRetry(
        'https://api.example.test/timeout',
        { method: 'GET', headers: {} },
        {
          retries: 0,
          requestTimeoutMs: 1200,
          useProxy: false,
          directFetch: async () => {
            throw new DOMException('The operation timed out.', 'AbortError');
          },
          debug: () => false,
        },
      );
    } catch (err) {
      timeoutMessage = err?.message || '';
    }
    outcomes.fetchWithRetryConvertsRequestTimeoutErrors = timeoutMessage.includes('request timed out after 1s');

    const originalAnyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    let polyfillSignalCombined = true;
    if (originalAnyDescriptor?.configurable) {
      let releaseFetch;
      let capturedSignal = null;
      const callerController = new AbortController();
      try {
        Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
        const pending = transport.fetchWithRetry(
          'https://api.example.test/polyfill',
          { method: 'GET', headers: {}, signal: callerController.signal },
          {
            retries: 0,
            requestTimeoutMs: 60000,
            useProxy: false,
            directFetch: async (_url, options) => {
              capturedSignal = options.signal;
              return new Promise(resolve => { releaseFetch = () => resolve(new Response('ok', { status: 200 })); });
            },
            debug: () => false,
          },
        );
        await Promise.resolve();
        callerController.abort('manual-stop');
        polyfillSignalCombined = capturedSignal?.aborted === true;
        releaseFetch();
        await pending;
      } finally {
        Object.defineProperty(AbortSignal, 'any', originalAnyDescriptor);
      }
    }
    outcomes.fetchWithRetryCombinesCallerSignalWithoutAbortSignalAny = polyfillSignalCombined;

    return outcomes;
  }, {
    apiTransportUrl: moduleUrl('/js/api-transport.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
