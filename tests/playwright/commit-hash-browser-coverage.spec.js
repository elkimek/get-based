import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?commitHashBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/commit-hash-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/commit-hash-browser-coverage', { waitUntil: 'load' });
}

test('commit hash browser coverage hydrates footer version commit fetch fallback and cache', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ commitHashUrl }) => {
    const outcomes = {};
    const originalFetch = window.fetch;
    const originalVersion = window.APP_VERSION;
    const waitFor = async (predicate) => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return false;
    };
    const resetFooter = (commitText = '') => {
      document.body.innerHTML = `
        <span id="app-version-text"></span>
        <span id="app-commit-hash">${commitText}</span>
      `;
    };
    const importCommitHash = (scenario) => import(`${commitHashUrl}&scenario=${scenario}`);

    try {
      window.APP_VERSION = 'v-browser-commit';
      resetFooter();
      const apiCalls = [];
      window.fetch = async (url) => {
        apiCalls.push(String(url));
        if (String(url).endsWith('/api/commit')) {
          return new Response(JSON.stringify({ sha: 'abcdef1"><img src=x onerror=alert(1)>' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('', { status: 404 });
      };
      const apiModule = await importCommitHash('api-success');
      apiModule.loadCommitHash();
      const apiRendered = await waitFor(() => !!document.querySelector('#app-commit-hash a'));
      const apiCommitEl = document.getElementById('app-commit-hash');
      const apiAnchor = apiCommitEl?.querySelector('a');
      outcomes.apiCommitHydratesVersionAndEscapesSha =
        apiRendered
        && document.getElementById('app-version-text')?.textContent === 'v-browser-commit'
        && apiCalls.length === 1
        && apiCalls[0].endsWith('/api/commit')
        && apiCommitEl?.children.length === 1
        && apiCommitEl?.querySelectorAll('a').length === 1
        && !apiCommitEl.querySelector('img')
        && apiAnchor?.textContent === 'abcdef1'
        && apiAnchor?.getAttribute('target') === '_blank'
        && apiAnchor?.getAttribute('rel') === 'noopener';

      resetFooter();
      let cachedFetchCalls = 0;
      window.fetch = async () => {
        cachedFetchCalls += 1;
        return new Response('', { status: 500 });
      };
      apiModule.loadCommitHash();
      const cachedAnchor = document.querySelector('#app-commit-hash a');
      outcomes.cachedCommitRerendersWithoutRefetch =
        cachedFetchCalls === 0
        && cachedAnchor?.textContent === 'abcdef1'
        && document.getElementById('app-version-text')?.textContent === 'v-browser-commit';

      resetFooter();
      const fallbackCalls = [];
      window.fetch = async (url, options = {}) => {
        const headers = options.headers || {};
        fallbackCalls.push({
          url: String(url),
          accept: headers.Accept || (typeof headers.get === 'function' ? headers.get('Accept') : undefined) || '',
        });
        if (String(url).endsWith('/api/commit')) return new Response('', { status: 503 });
        if (String(url).includes('api.github.com/repos/elkimek/get-based/commits/main')) {
          return new Response('feedfacecafebeef', { status: 200, headers: { 'content-type': 'text/plain' } });
        }
        return new Response('', { status: 404 });
      };
      const fallbackModule = await importCommitHash('github-fallback');
      fallbackModule.loadCommitHash();
      const fallbackRendered = await waitFor(() => document.querySelector('#app-commit-hash a')?.textContent === 'feedfac');
      const fallbackAnchor = document.querySelector('#app-commit-hash a');
      outcomes.githubFallbackUsesShaEndpointAndRendersShortCommit =
        fallbackRendered
        && fallbackCalls.length === 2
        && fallbackCalls[0].url.endsWith('/api/commit')
        && fallbackCalls[1].url === 'https://api.github.com/repos/elkimek/get-based/commits/main'
        && fallbackCalls[1].accept === 'application/vnd.github.sha'
        && fallbackAnchor?.getAttribute('href') === 'https://github.com/elkimek/get-based/commit/feedfacecafebeef';

      document.body.innerHTML = '<span id="app-version-text"></span>';
      let missingCommitFetchCalls = 0;
      window.fetch = async () => {
        missingCommitFetchCalls += 1;
        return new Response('', { status: 500 });
      };
      const missingModule = await importCommitHash('missing-commit-element');
      missingModule.loadCommitHash();
      await Promise.resolve();
      outcomes.missingCommitElementSetsVersionAndSkipsFetch =
        document.getElementById('app-version-text')?.textContent === 'v-browser-commit'
        && missingCommitFetchCalls === 0;

      resetFooter('pending');
      const failureCalls = [];
      window.fetch = async (url) => {
        failureCalls.push(String(url));
        return new Response('', { status: 500 });
      };
      const failureModule = await importCommitHash('fetch-failure');
      failureModule.loadCommitHash();
      await waitFor(() => failureCalls.length === 2);
      outcomes.fetchFailuresLeaveExistingCommitTextUnchanged =
        failureCalls.length === 2
        && failureCalls[0].endsWith('/api/commit')
        && failureCalls[1] === 'https://api.github.com/repos/elkimek/get-based/commits/main'
        && document.getElementById('app-commit-hash')?.textContent === 'pending';
    } finally {
      window.fetch = originalFetch;
      if (originalVersion === undefined) delete window.APP_VERSION;
      else window.APP_VERSION = originalVersion;
    }

    return outcomes;
  }, {
    commitHashUrl: moduleUrl('/js/commit-hash.js'),
  });

  const expectedOutcomeKeys = [
    'apiCommitHydratesVersionAndEscapesSha',
    'cachedCommitRerendersWithoutRefetch',
    'githubFallbackUsesShaEndpointAndRendersShortCommit',
    'missingCommitElementSetsVersionAndSkipsFetch',
    'fetchFailuresLeaveExistingCommitTextUnchanged',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
