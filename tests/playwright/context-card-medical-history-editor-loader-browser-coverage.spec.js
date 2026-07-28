import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/context-card-medical-history-editor.js?loaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticMedicalHistoryEditor = `
  let deps = {};
  const record = (name, ...args) => {
    window.__medicalHistoryLoaderCalls ||= [];
    window.__medicalHistoryLoaderCalls.push([name, ...args]);
  };
  export function configureMedicalHistoryEditor(update = {}) {
    deps = { ...deps, ...update };
    record('configure', Object.keys(update).sort().join(','));
  }
  export function openDiagnosesEditor(value) {
    record('openDiagnosesEditor', value);
    deps.recordChange?.('diagnoses');
    deps.saveAndRefresh?.('Medical history saved', 'diagnoses');
    return 'opened:' + value;
  }
  export function closeDiagnoses() {
    record('closeDiagnoses');
    deps.close?.();
    return 'closed';
  }
  export function addCondition() {
    record('addCondition');
    return 'condition-added';
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/medical-history-editor-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main><div id="notification-container"></div></body></html>',
  }));
});

test('medical-history loader stays cold, shares its first load, and applies stored configuration', async ({ page }) => {
  await page.goto('/medical-history-editor-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-medical-history-editor-impl.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticMedicalHistoryEditor,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const callbackCalls = [];
    facade.configureMedicalHistoryEditor({
      close: () => callbackCalls.push(['close']),
      recordChange: field => callbackCalls.push(['record', field]),
      saveAndRefresh: (message, field) => callbackCalls.push(['save', message, field]),
    });
    const cold = !facade.isMedicalHistoryEditorLoaded();
    const coldClose = facade.closeDiagnoses();
    const first = facade.loadMedicalHistoryEditor();
    const second = facade.loadMedicalHistoryEditor();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const opened = facade.openDiagnosesEditor('configured');
    const closed = facade.closeDiagnoses();
    return {
      cold,
      coldClose,
      sharedPromise,
      loaded: facade.isMedicalHistoryEditorLoaded(),
      opened,
      closed,
      callbackCalls,
      implementationCalls: window.__medicalHistoryLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldClose: undefined,
    sharedPromise: true,
    loaded: true,
    opened: 'opened:configured',
    closed: 'closed',
    callbackCalls: [
      ['record', 'diagnoses'],
      ['save', 'Medical history saved', 'diagnoses'],
      ['close'],
    ],
    implementationCalls: [
      ['configure', 'close,recordChange,saveAndRefresh'],
      ['openDiagnosesEditor', 'configured'],
      ['closeDiagnoses'],
    ],
  });
});

test('outside-click closer keeps the exact context-cards re-export identity', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async () => {
    const [facade, cards] = await Promise.all([
      import('/js/context-card-medical-history-editor.js'),
      import('/js/context-cards.js'),
    ]);
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <div id="condition-input"></div>
      <div id="condition-suggestions"><span>condition</span></div>
      <div id="fh-condition"></div>
      <div id="fh-condition-suggestions"><span>family</span></div>
      <button id="outside-medical-history">Outside</button>`;
    document.body.append(fixture);
    const outside = fixture.querySelector('#outside-medical-history');
    try {
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const clearedWhileInstalled =
        fixture.querySelector('#condition-suggestions').children.length === 0
        && fixture.querySelector('#fh-condition-suggestions').children.length === 0;

      fixture.querySelector('#condition-suggestions').innerHTML = '<span>condition</span>';
      fixture.querySelector('#fh-condition-suggestions').innerHTML = '<span>family</span>';
      document.removeEventListener('click', cards.closeSuggestionsOnClickOutside);
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        sameBinding: cards.closeSuggestionsOnClickOutside === facade.closeSuggestionsOnClickOutside,
        clearedWhileInstalled,
        remainsAfterExactRemoval:
          fixture.querySelector('#condition-suggestions').children.length === 1
          && fixture.querySelector('#fh-condition-suggestions').children.length === 1,
        implementationStayedCold: !facade.isMedicalHistoryEditorLoaded(),
      };
    } finally {
      fixture.remove();
    }
  });

  expect(outcomes).toEqual({
    sameBinding: true,
    clearedWhileInstalled: true,
    remainsAfterExactRemoval: true,
    implementationStayedCold: true,
  });
});

test('first cold medical-history control click loads and runs its delegated action', async ({ page }) => {
  await page.goto('/medical-history-editor-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-medical-history-editor-impl.js*', route => {
    implementationRequests.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: syntheticMedicalHistoryEditor,
    });
  });

  const loadedBeforeClick = await page.evaluate(async url => {
    const facade = await import(url);
    const modal = document.createElement('div');
    modal.id = 'detail-modal';
    modal.innerHTML = '<button type="button" data-medical-history-action="add-condition">Add condition</button>';
    document.body.appendChild(modal);
    const loaded = facade.isMedicalHistoryEditorLoaded();
    modal.querySelector('[data-medical-history-action="add-condition"]').click();
    return loaded;
  }, facadeUrl());

  expect(loadedBeforeClick).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__medicalHistoryLoaderCalls || []))
    .toEqual([
      ['configure', ''],
      ['addCondition'],
    ]);
  expect(implementationRequests).toHaveLength(1);
});

test('medical-history action contains a failed load and retries with the fixed URL', async ({ page }) => {
  await page.goto('/medical-history-editor-loader-coverage');
  const implementationRequests = [];
  await page.route('**/js/context-card-medical-history-editor-impl.js*', async route => {
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
      body: syntheticMedicalHistoryEditor,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const first = await facade.openDiagnosesEditor('failed-first');
    const unloadedAfterFailure = !facade.isMedicalHistoryEditorLoaded();
    const second = await facade.openDiagnosesEditor('retry');
    return {
      first,
      unloadedAfterFailure,
      second,
      loadedAfterRetry: facade.isMedicalHistoryEditorLoaded(),
      implementationCalls: window.__medicalHistoryLoaderCalls || [],
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
    ['openDiagnosesEditor', 'retry'],
  ]);
  expect(outcomes.notification).toContain('Medical history editor could not be loaded. Try again.');
});
