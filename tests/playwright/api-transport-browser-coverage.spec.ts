import { createBlankPage } from '../helpers/browser-blank-page.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path: string) => `${path}?apiTransportCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const openBlankPage = createBlankPage({
  path: "/api-transport-browser-coverage", body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
});

test('api transport browser coverage exercises proxy retry abort and stream timeout paths', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ apiTransportUrl }) => {
    const transport = await ((import(apiTransportUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/api-transport.js"), "createProxyFetch" | "readWithStallTimeout" | "fetchWithRetry"> >);
    const outcomes: Record<string, unknown> = {};

    const withImmediateTimers = async <Result>(fn: () => Promise<Result>, observedDelays: (number | undefined)[] = []) => {
      const originalSetTimeout = window.setTimeout;
      const originalClearTimeout = window.clearTimeout;
      (window as unknown as {setTimeout: (cb: unknown, ms?: number, ...args: unknown[]) => number}).setTimeout = (cb, ms, ...args) => {
        observedDelays.push(ms);
        return originalSetTimeout(() => (cb as (...args: unknown[]) => unknown)(...args), 0);
      };
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
      const proxyCalls: {url: string; options: RequestInit}[] = [];
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
      const proxyBody = JSON.parse((proxyCalls[0]!?.options?.body || '{}') as string) as {url?: unknown;body?: unknown;headers:{Authorization?: unknown}};
      outcomes.createProxyFetchWrapsRequestsAndDropsContentType = proxyResponse.status === 201
        && proxyCalls[0]!.url === '/api/proxy'
        && proxyCalls[0]!.options.method === 'POST'
        && (proxyCalls[0]!.options.headers as Record<string,unknown>)['Content-Type'] === 'application/json'
        && proxyCalls[0]!.options.signal === proxySignal
        && proxyBody.url === 'https://api.example.test/v1/chat'
        && proxyBody.body === '{"message":"hello"}'
        && proxyBody.headers.Authorization === 'Bearer test-key'
        && !Object.prototype.hasOwnProperty.call(proxyBody.headers, 'Content-Type');

      const directCalls: {url: string; options: RequestInit}[] = [];
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
        && directCalls[0]!.url === 'https://direct.example.test/models'
        && directCalls[0]!.options.body === 'direct-body';
    } finally {
      window.fetch = originalFetch;
    }

    let cancelCalled = false;
    const streamResult = await transport.readWithStallTimeout({
      read: () => Promise.resolve({ done: false, value: 'chunk' }),
      cancel: () => { cancelCalled = true; },
    }, 'coverage stream');
    let rejectedMessage: unknown = '';
    try {
      await transport.readWithStallTimeout({
        read: () => Promise.reject(new Error('reader failed')),
        cancel: () => {},
      }, 'coverage stream');
    } catch (err) {
      rejectedMessage = (err as {message?: unknown} | null | undefined)?.message || '';
    }
    let stalledMessage: unknown = '';
    let stalledCancelCalled = false;
    await withImmediateTimers(async () => {
      try {
        await transport.readWithStallTimeout({
          read: () => new Promise<never>(() => {}),
          cancel: () => { stalledCancelCalled = true; },
        }, 'coverage stream');
      } catch (err) {
        stalledMessage = (err as {message?: unknown} | null | undefined)?.message || '';
      }
    });
    outcomes.readWithStallTimeoutCoversResolveRejectAndCancel = streamResult.value === 'chunk'
      && cancelCalled === false
      && rejectedMessage === 'reader failed'
      && (stalledCancelCalled as boolean) === true
      && (stalledMessage as string).includes('coverage stream stalled');

    let rateLimitAttempts = 0;
    const rateLimitDelays: (number | undefined)[] = [];
    const rateLimitResponse = await withImmediateTimers(() => transport.fetchWithRetry(
      'https://api.example.test/rate-limit',
      { method: 'POST', headers: {}, body: '{}' },
      {
        retries: 1,
        useProxy: true,
        proxyFetch: async () => {
          rateLimitAttempts += 1;
          if (rateLimitAttempts === 1) {
            return new Response('limited', { status: 429, headers: { 'retry-after': '7' } });
          }
          return new Response('ok', { status: 200 });
        },
        debug: () => false,
      },
    ), rateLimitDelays);
    outcomes.fetchWithRetryRetriesRateLimits = rateLimitAttempts === 2
      && rateLimitResponse.status === 200
      && rateLimitDelays.includes(7000);

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
    let abortMessage: unknown = '';
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
      abortMessage = (err as {message?: unknown} | null | undefined)?.message || '';
    }
    outcomes.fetchWithRetryDoesNotRetryCallerAbort = abortAttempts === 1
      && abortMessage === 'caller aborted';

    let timeoutMessage: unknown = '';
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
      timeoutMessage = (err as {message?: unknown} | null | undefined)?.message || '';
    }
    outcomes.fetchWithRetryConvertsRequestTimeoutErrors = (timeoutMessage as string).includes('request timed out after 1s');

    const originalAnyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    let polyfillSignalCombined = false;
    outcomes.fetchWithRetryCanPatchAbortSignalAnyForPolyfill = originalAnyDescriptor?.configurable === true;
    if (originalAnyDescriptor?.configurable) {
      let releaseFetch: (() => void) | undefined;
      let capturedSignal: AbortSignal | null = null;
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
        polyfillSignalCombined = (capturedSignal as AbortSignal | null)?.aborted === true;
        releaseFetch!();
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
