import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/context-card-lifestyle-editors.js?loaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticLifestyleEditors = `
  let deps = {};
  const record = (name, ...args) => {
    window.__lifestyleEditorLoaderCalls ||= [];
    window.__lifestyleEditorLoaderCalls.push([name, ...args]);
  };
  export function configureLifestyleContextEditors(update = {}) {
    deps = { ...deps, ...update };
    record('configure', Object.keys(update).sort().join(','));
  }
  export function openDietEditor(value) {
    record('openDietEditor', value);
    deps.recordChange?.('diet');
    deps.saveAndRefresh?.('Diet saved', 'diet');
    return 'opened:' + value;
  }
  export function closeHealthGoals() { record('closeHealthGoals'); }
  export function showDietContaminantsModal() {
    record('showDietContaminantsModal');
    return 'shown';
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/lifestyle-editor-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/lifestyle-editor-loader-coverage');
});

test('lifestyle editor loader stays cold, shares its first load, and applies stored configuration', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/context-card-lifestyle-editors-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticLifestyleEditors,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const callbackCalls = [];
    facade.configureLifestyleContextEditors({
      recordChange: field => callbackCalls.push(['record', field]),
      saveAndRefresh: (message, field) => callbackCalls.push(['save', message, field]),
    });
    const cold = !facade.isLifestyleContextEditorsLoaded();
    const coldClose = facade.closeHealthGoals();
    const first = facade.loadLifestyleContextEditors();
    const second = facade.loadLifestyleContextEditors();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const opened = facade.openDietEditor('configured');
    return {
      cold,
      coldClose,
      sharedPromise,
      loaded: facade.isLifestyleContextEditorsLoaded(),
      opened,
      callbackCalls,
      implementationCalls: window.__lifestyleEditorLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldClose: undefined,
    sharedPromise: true,
    loaded: true,
    opened: 'opened:configured',
    callbackCalls: [
      ['record', 'diet'],
      ['save', 'Diet saved', 'diet'],
    ],
    implementationCalls: [
      ['configure', 'recordChange,saveAndRefresh'],
      ['openDietEditor', 'configured'],
    ],
  });
});

test('first cold contaminant badge click bypasses its parent and opens through the loader', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/context-card-lifestyle-editors-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticLifestyleEditors,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const [facade, { state }] = await Promise.all([
      import(url),
      import('/js/state.js'),
    ]);
    const previousDiet = state.importedData.diet;
    let parentClicks = 0;
    try {
      state.importedData.diet = {
        breakfast: 'Spinach',
        lunch: 'Canned soup',
        dinner: '',
        snacks: '',
      };
      const card = document.createElement('div');
      card.addEventListener('click', () => { parentClicks += 1; });
      card.innerHTML = facade.renderDietContaminantsBadge();
      document.getElementById('fixture').append(card);
      card.querySelector('.diet-contaminants').click();
      await facade.loadLifestyleContextEditors();
      await Promise.resolve();
      return {
        parentClicks,
        loaded: facade.isLifestyleContextEditorsLoaded(),
        implementationCalls: window.__lifestyleEditorLoaderCalls || [],
      };
    } finally {
      state.importedData.diet = previousDiet;
    }
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    parentClicks: 0,
    loaded: true,
    implementationCalls: [
      ['configure', ''],
      ['showDietContaminantsModal'],
    ],
  });
});

test('lifestyle editor action contains a failed load and retries with the fixed URL', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/context-card-lifestyle-editors-impl.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.fulfill({
        status: 503,
        contentType: 'text/javascript',
        body: 'export {};',
      });
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticLifestyleEditors,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const first = await facade.openDietEditor('failed-first');
    const unloadedAfterFailure = !facade.isLifestyleContextEditorsLoaded();
    const second = await facade.openDietEditor('retry');
    return {
      first,
      unloadedAfterFailure,
      second,
      loadedAfterRetry: facade.isLifestyleContextEditorsLoaded(),
      implementationCalls: window.__lifestyleEditorLoaderCalls || [],
      notification: document.body.textContent,
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).searchParams.get('lazy-retry')).toBe('1');
  expect(outcomes).toMatchObject({
    first: false,
    unloadedAfterFailure: true,
    second: 'opened:retry',
    loadedAfterRetry: true,
  });
  expect(outcomes.implementationCalls).toEqual([
    ['configure', ''],
    ['openDietEditor', 'retry'],
  ]);
  expect(outcomes.notification).toContain('Context editor could not be loaded. Try again.');
});
