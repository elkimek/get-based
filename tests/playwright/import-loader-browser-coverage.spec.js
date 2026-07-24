import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?importLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta data-import-stylesheet-anchor></head><body><main id="fixture"></main></body></html>',
  }));
  await page.goto(path, { waitUntil: 'load' });
}

function pdfImportStubBody(counterName, marker) {
  return `
    globalThis.${counterName} = (globalThis.${counterName} || 0) + 1;
    export const marker = '${marker}';
    export async function classifyImportFiles() {
      return { jsonFiles: [], pdfFiles: [], imageFiles: [], dnaFiles: [], textFiles: [], unsupportedCount: 0 };
    }
    export async function handlePDFFile(file) {
      return file?.name || '${marker}';
    }
  `;
}

test('import loader browser coverage caches the successful pdf import module', async ({ page }) => {
  let pdfImportRequests = 0;
  await page.route('**/js/pdf-import.js', route => {
    pdfImportRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: pdfImportStubBody('__pdfImportSuccessEvalCount', 'success-stub'),
    });
  });
  await openBlankPage(page, '/import-loader-cache-coverage');

  const outcomes = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const [first, second] = await Promise.all([
      loader.loadPdfImport(),
      loader.loadPdfImport(),
    ]);
    const third = await loader.loadPdfImport();
    const uiModule = await loader.loadImportUI();
    const handledName = await first.handlePDFFile(new File(['pdf'], 'report.pdf', { type: 'application/pdf' }));

    const outcomes = {
      concurrentCallsShareTheSameModuleNamespace: first === second,
      laterCallsReuseTheResolvedModuleNamespace: first === third,
      sharedUiLoaderReturnsTheCachedModule: uiModule === first,
      sharedUiLoaderLoadsTheStylesheet:
        document.querySelectorAll('link[data-import-stylesheet]').length === 1,
      pdfImportModuleEvaluatesOnce: globalThis.__pdfImportSuccessEvalCount === 1,
      exportedPdfImportFunctionsRemainAvailable:
        first.marker === 'success-stub'
        && typeof first.classifyImportFiles === 'function'
        && handledName === 'report.pdf',
    };
    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    loaderUrl: moduleUrl('/js/import-loader.js'),
  });

  outcomes.pdfImportRequestedOnceForCachedLoad = pdfImportRequests === 1;

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});

test('import loader browser coverage rejects when the pdf import module fails to load', async ({ page }) => {
  let pdfImportRequests = 0;
  await page.route('**/js/pdf-import.js', route => {
    pdfImportRequests += 1;
    return route.abort('failed');
  });
  await openBlankPage(page, '/import-loader-failure-coverage');

  const failure = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const firstPromise = loader.loadPdfImport();
    let firstRejected = false;
    let firstMessage = '';
    try {
      await firstPromise;
    } catch (error) {
      firstRejected = true;
      firstMessage = String(error?.message || error);
    }

    const secondPromise = loader.loadPdfImport();
    let secondRejected = false;
    let secondMessage = '';
    try {
      await secondPromise;
    } catch (error) {
      secondRejected = true;
      secondMessage = String(error?.message || error);
    }

    return {
      firstRejected,
      firstMessage,
      secondRejected,
      secondMessage,
      secondCallCreatesFreshPromiseAfterFailure: firstPromise !== secondPromise,
      allOutcomesReached: true,
    };
  }, {
    loaderUrl: moduleUrl('/js/import-loader.js'),
  });

  const outcomes = {
    firstLazyImportRejectsWhenPdfImportFails:
      failure.firstRejected === true
      && failure.firstMessage.length > 0,
    failedImportPromiseIsClearedBeforeNextCall:
      failure.secondCallCreatesFreshPromiseAfterFailure === true
      && failure.secondRejected === true
      && failure.secondMessage.length > 0,
    failedPdfImportIsRequestedOnce: pdfImportRequests === 1,
    allOutcomesReached: failure.allOutcomesReached === true,
  };

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});

test('import loader browser coverage single-flights the ordered stylesheet', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/import.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.import-preview-modal { display: flex; }',
    });
  });
  await openBlankPage(page, '/import-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const [first, second] = await Promise.all([
      loader.loadImportStylesheet(),
      loader.loadImportStylesheet(),
    ]);
    const third = await loader.loadImportStylesheet();
    const anchor = document.querySelector('[data-import-stylesheet-anchor]');
    return {
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink: document.querySelectorAll('link[data-import-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
    };
  }, {
    loaderUrl: moduleUrl('/js/import-loader.js'),
  });

  expect(outcomes).toEqual({
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('import loader browser coverage removes a failed stylesheet and retries', async ({ page }) => {
  const stylesheetRequests = [];
  let failFirstRequest = true;
  await page.route('**/css/import.css*', route => {
    stylesheetRequests.push(route.request().url());
    if (failFirstRequest) {
      failFirstRequest = false;
      return route.abort('failed');
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.import-preview-modal { display: flex; }',
    });
  });
  await openBlankPage(page, '/import-stylesheet-retry-coverage');

  const outcomes = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    let firstRejected = false;
    try {
      await loader.loadImportStylesheet();
    } catch {
      firstRejected = true;
    }
    const failedLinkWasRemoved =
      document.querySelectorAll('link[data-import-stylesheet]').length === 0;
    const retryLink = await loader.loadImportStylesheet();
    return {
      firstRejected,
      failedLinkWasRemoved,
      retryLoaded: retryLink.sheet !== null,
      retryUsesCacheBuster:
        new URL(retryLink.href).searchParams.get('lazy-retry') === '1',
    };
  }, {
    loaderUrl: moduleUrl('/js/import-loader.js'),
  });

  expect(outcomes).toEqual({
    firstRejected: true,
    failedLinkWasRemoved: true,
    retryLoaded: true,
    retryUsesCacheBuster: true,
  });
  expect(stylesheetRequests).toHaveLength(2);
  expect(new URL(stylesheetRequests[1]).searchParams.get('lazy-retry')).toBe('1');
});
