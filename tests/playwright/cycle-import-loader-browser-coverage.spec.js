import { expect, test } from './coverage-fixture.js';

const loaderUrl = () => `/js/cycle-import-loader.js?cycleImportLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticCycleImport = `
  const record = (name, value) => {
    window.__cycleImportLoaderCalls ||= [];
    window.__cycleImportLoaderCalls.push([name, value]);
    return name + ':' + String(value ?? '');
  };
  export function parseAppleHealthCycleBlob(_blob, fileName) {
    return record('parse', fileName);
  }
  export function showCycleImportPreview(parsed) {
    return record('preview', parsed.id);
  }
  export function clearCycleProfileData() {
    return record('clear');
  }
  export async function handleCycleImportAction(event) {
    const target = event.target instanceof Element
      ? event.target.closest('[data-cycle-import-action]')
      : null;
    return record('event', target ? target.id + ':' + event.type : 'missing');
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/cycle-import-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body>
      <div id="notification-container"></div>
      <button id="cycle-import-button" data-cycle-import-action="pick-file">Import</button>
      <input id="cycle-import-file" data-cycle-import-action="select-file">
    </body></html>`,
  }));
  await page.goto('/cycle-import-loader-coverage');
});

test('Cycle import facade stays cold, single-flights, and delegates its public actions', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/cycle-import.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticCycleImport,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const cold = !loader.isCycleImportModuleLoaded();
    const parse = loader.parseAppleHealthCycleBlob(new Blob(['health']), 'export.xml');
    const preview = loader.showCycleImportPreview({ id: 'review' });
    const first = loader.loadCycleImportModule();
    const second = loader.loadCycleImportModule();
    const sharedPromise = first === second;
    const [parsed, previewed] = await Promise.all([parse, preview, first, second]);
    const cleared = await loader.clearCycleProfileData();
    return {
      cold,
      sharedPromise,
      loaded: loader.isCycleImportModuleLoaded(),
      parsed,
      previewed,
      cleared,
      calls: window.__cycleImportLoaderCalls || [],
    };
  }, loaderUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    sharedPromise: true,
    loaded: true,
    parsed: 'parse:export.xml',
    previewed: 'preview:review',
    cleared: 'clear:',
    calls: [
      ['parse', 'export.xml'],
      ['preview', 'review'],
      ['clear', undefined],
    ],
  });
});

test('first delegated click and change are replayed after the implementation loads', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/cycle-import.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticCycleImport,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    document.getElementById('cycle-import-button').click();
    document.getElementById('cycle-import-file').dispatchEvent(new Event('change', { bubbles: true }));
    const deadline = Date.now() + 2000;
    while ((window.__cycleImportLoaderCalls || []).length < 2 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return {
      loaded: loader.isCycleImportModuleLoaded(),
      calls: window.__cycleImportLoaderCalls || [],
    };
  }, loaderUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    loaded: true,
    calls: [
      ['event', 'cycle-import-button:click'],
      ['event', 'cycle-import-file:change'],
    ],
  });
});

test('a failed delegated load remains retryable through the fixed implementation URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/cycle-import.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticCycleImport,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const loader = await import(url);
    const button = document.getElementById('cycle-import-button');
    button.click();
    const deadline = Date.now() + 2000;
    while (!document.body.textContent.includes('Cycle import tools could not be loaded') && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const unloadedAfterFailure = !loader.isCycleImportModuleLoaded();
    const notification = document.body.textContent;
    button.click();
    while (!loader.isCycleImportModuleLoaded() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return {
      unloadedAfterFailure,
      loadedAfterRetry: loader.isCycleImportModuleLoaded(),
      notification,
      calls: window.__cycleImportLoaderCalls || [],
    };
  }, loaderUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toMatchObject({
    unloadedAfterFailure: true,
    loadedAfterRetry: true,
    calls: [['event', 'cycle-import-button:click']],
  });
  expect(outcomes.notification).toContain('Cycle import tools could not be loaded. Try again.');
});
