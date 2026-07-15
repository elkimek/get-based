import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?pdfjsLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page, { workerSrc = '' } = {}) {
  await page.route('**/pdfjs-loader-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>PDF.js loader coverage</title></head><body></body></html>',
  }));
  await page.route('**/vendor/pdf.min.mjs', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      const calls = [];
      const pdfjs = {
        calls,
        GlobalWorkerOptions: ${JSON.stringify(workerSrc ? { workerSrc } : {})},
        getDocument(options) {
          calls.push(options);
          return { promise: Promise.resolve({ numPages: 3, options }) };
        },
      };
      export default pdfjs;
    `,
  }));
  await page.goto('/pdfjs-loader-browser-coverage', { waitUntil: 'load' });
}

test('pdfjs loader browser coverage caches module and pins safe document options', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const outcomes = {};

    const firstPdfjs = await loader.loadPdfJs();
    const secondPdfjs = await loader.loadPdfJs();
    outcomes.loadPdfJsCachesModuleSetsWorkerAndStaysModuleOnly =
      firstPdfjs === secondPdfjs
      && firstPdfjs.GlobalWorkerOptions.workerSrc === '/vendor/pdf.worker.min.mjs'
      && !('pdfjsLib' in window);

    const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
    const bytesDocument = await loader.getPdfDocument(bytes, {
      isEvalSupported: true,
      ownerPassword: 'secret',
    });
    const bytesOptions = firstPdfjs.calls.at(-1);
    outcomes.getPdfDocumentWrapsBinaryInputAndForcesEvalOff =
      bytesDocument.numPages === 3
      && bytesOptions.data === bytes
      && bytesOptions.ownerPassword === 'secret'
      && bytesOptions.isEvalSupported === false;

    const typedBytes = new Uint8Array([37, 80, 68, 70]);
    const typedBytesDocument = await loader.getPdfDocument(typedBytes, {
      password: 'typed-secret',
      isEvalSupported: true,
    });
    const typedBytesOptions = firstPdfjs.calls.at(-1);
    outcomes.getPdfDocumentWrapsTypedArrayInputAndForcesEvalOff =
      typedBytesDocument.numPages === 3
      && typedBytesOptions.data === typedBytes
      && typedBytesOptions.password === 'typed-secret'
      && typedBytesOptions.isEvalSupported === false;

    const objectDocument = await loader.getPdfDocument({
      url: '/sample.pdf',
      isEvalSupported: true,
      disableFontFace: true,
    }, {
      disableFontFace: false,
      verbosity: 0,
    });
    const objectOptions = firstPdfjs.calls.at(-1);
    outcomes.getPdfDocumentPreservesObjectInputAndExtraOptions =
      objectDocument.options === objectOptions
      && objectOptions.url === '/sample.pdf'
      && objectOptions.disableFontFace === false
      && objectOptions.verbosity === 0
      && objectOptions.isEvalSupported === false;

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    loaderUrl: moduleUrl('/js/pdfjs-loader.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('pdfjs loader browser coverage preserves preconfigured worker', async ({ page }) => {
  await openBlankPage(page, { workerSrc: '/custom/pdf.worker.mjs' });

  const results = await page.evaluate(async ({ loaderUrl }) => {
    const loader = await import(loaderUrl);
    const outcomes = {};

    const pdfjs = await loader.loadPdfJs();
    outcomes.loadPdfJsKeepsExistingWorkerSrc =
      pdfjs.GlobalWorkerOptions.workerSrc === '/custom/pdf.worker.mjs'
      && !('pdfjsLib' in window);

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    loaderUrl: moduleUrl('/js/pdfjs-loader.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
