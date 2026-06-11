import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?importLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
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
    const handledName = await first.handlePDFFile(new File(['pdf'], 'report.pdf', { type: 'application/pdf' }));

    const outcomes = {
      concurrentCallsShareTheSameModuleNamespace: first === second,
      laterCallsReuseTheResolvedModuleNamespace: first === third,
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
