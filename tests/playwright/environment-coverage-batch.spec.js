import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?emfRuntimeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openEMFLoaderPage(page, path) {
  await page.route(`**${path}`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta data-emf-stylesheet-anchor></head><body>
      <div id="notification-container"></div>
    </body></html>`,
  }));
  await page.goto(path, { waitUntil: 'load' });
}

test('EMF stylesheet loader single-flights and preserves cascade order', async ({ page }) => {
  let stylesheetRequests = 0;
  await page.route('**/css/emf.css*', route => {
    stylesheetRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.emf-editor-actions { display: flex; }',
    });
  });
  await openEMFLoaderPage(page, '/emf-stylesheet-cache-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    const [first, second] = await Promise.all([
      runtime.loadEMFStylesheet(),
      runtime.loadEMFStylesheet(),
    ]);
    const third = await runtime.loadEMFStylesheet();
    const anchor = document.querySelector('[data-emf-stylesheet-anchor]');
    return {
      concurrentCallsShareTheSameLink: first === second,
      laterCallsReuseTheResolvedLink: first === third,
      oneStylesheetLink: document.querySelectorAll('link[data-emf-stylesheet]').length === 1,
      linkPrecedesAnchor: first.nextElementSibling === anchor,
    };
  }, { runtimeUrl: moduleUrl('/js/emf-runtime.js') });

  expect(outcomes).toEqual({
    concurrentCallsShareTheSameLink: true,
    laterCallsReuseTheResolvedLink: true,
    oneStylesheetLink: true,
    linkPrecedesAnchor: true,
  });
  expect(stylesheetRequests).toBe(1);
});

test('EMF stylesheet loader removes a failure and retries', async ({ page }) => {
  const stylesheetRequests = [];
  let failFirstRequest = true;
  await page.route('**/css/emf.css*', route => {
    stylesheetRequests.push(route.request().url());
    if (failFirstRequest) {
      failFirstRequest = false;
      return route.abort('failed');
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: '.emf-editor-actions { display: flex; }',
    });
  });
  await openEMFLoaderPage(page, '/emf-stylesheet-retry-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    let firstRejected = false;
    try {
      await runtime.loadEMFStylesheet();
    } catch {
      firstRejected = true;
    }
    const failedLinkWasRemoved =
      document.querySelectorAll('link[data-emf-stylesheet]').length === 0;
    const retryLink = await runtime.loadEMFStylesheet();
    return {
      firstRejected,
      failedLinkWasRemoved,
      retryLoaded: retryLink.sheet !== null,
      retryUsesCacheBuster:
        new URL(retryLink.href).searchParams.get('lazy-retry') === '1',
    };
  }, { runtimeUrl: moduleUrl('/js/emf-runtime.js') });

  expect(outcomes).toEqual({
    firstRejected: true,
    failedLinkWasRemoved: true,
    retryLoaded: true,
    retryUsesCacheBuster: true,
  });
  expect(stylesheetRequests).toHaveLength(2);
  expect(new URL(stylesheetRequests[1]).searchParams.get('lazy-retry')).toBe('1');
});

test('EMF entry contains a stylesheet load failure', async ({ page }) => {
  await page.route('**/css/emf.css*', route => route.abort('failed'));
  await openEMFLoaderPage(page, '/emf-stylesheet-entry-failure-coverage');

  const outcomes = await page.evaluate(async ({ runtimeUrl }) => {
    const runtime = await import(runtimeUrl);
    let opened = 0;
    runtime.configureEMFRuntimeDeps({
      loadModule: async () => ({
        configureEMFRuntimeDeps() {},
        openEMFAssessmentEditor() {
          opened += 1;
        },
        closeEMFInterpretation() {},
      }),
    });
    const result = await runtime.openEMFAssessmentEditor();
    return {
      returnsFalse: result === false,
      editorStayedClosed: opened === 0,
      failedLinkWasRemoved:
        document.querySelectorAll('link[data-emf-stylesheet]').length === 0,
      errorWasExplained:
        document.getElementById('notification-container')?.textContent
          ?.includes('Could not open the EMF assessment') === true,
    };
  }, { runtimeUrl: moduleUrl('/js/emf-runtime.js') });

  expect(outcomes).toEqual({
    returnsFalse: true,
    editorStayedClosed: true,
    failedLinkWasRemoved: true,
    errorWasExplained: true,
  });
});

function seedCompletedTour() {
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
  localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
}

test('EMF assessment editor covers room measurements tags compare delete and chat handoff', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [{ state }, data, editorUi, emfRuntime, emfInterpretation] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/context-card-editor-ui.js'),
      import('/js/emf-runtime.js'),
      import('/js/emf-interpretation.js'),
    ]);
    const calls = [];
    const previousRuntimeDeps = emfRuntime.configureEMFRuntimeDeps({
      closeModal: () => calls.push(['close-editor-modal']),
    });
    const emf = await emfRuntime.loadEMFModule();
    if (typeof window.toggleCtxTag !== 'function') window.toggleCtxTag = editorUi.toggleCtxTag;

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const waitFor = async (selector, label = selector) => {
      let found = null;
      await waitUntil(() => {
        found = document.querySelector(selector);
        return !!found;
      }, label);
      return found;
    };
    const setAndChange = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing control ${selector}`);
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el;
    };
    const assessments = () => state.importedData.emfAssessment?.assessments || [];
    const activeAssessment = () => assessments()[assessments().length - 1];
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const outcomes = {};
    const previousInterpretationDeps = emfInterpretation.configureEMFInterpretationRuntimeDeps({
      closeModal: () => calls.push(['close-modal']),
      openChatPanel: prompt => calls.push(['chat', prompt]),
    });

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      state.currentProfile = 'emf-coverage';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        emfAssessment: { assessments: [] },
      };
      data.invalidateActiveDataCache();
      document.querySelectorAll('.emf-lightbox,.notification-container').forEach(el => el.remove());
      document.getElementById('confirm-dialog-overlay')?.remove();

      await emfRuntime.openEMFAssessmentEditor();
      await waitFor('#detail-modal .emf-editor-actions', 'EMF editor actions');
      document.querySelector('.emf-editor-actions .import-btn-primary')?.click();
      await waitUntil(() => assessments().length === 1, 'new EMF assessment');
      const id = activeAssessment().id;
      outcomes.newAssessmentExpandsWithDefaultBedroom =
        activeAssessment().rooms[0].name === 'Bedroom'
        && document.querySelector('.emf-assessment-card.expanded')?.textContent.includes('Sleeping area') === true;

      setAndChange('[data-emf-field="date"]', '2026-06-01');
      setAndChange('[data-emf-field="label"]', 'Before shielding');
      setAndChange('[data-emf-field="consultant"]', 'Building Bio Lab');
      setAndChange('[data-emf-room-field="location"]', 'Pillow side');
      setAndChange('[data-emf-measurement-type="acElectric"]', '28');
      await waitUntil(() => !!activeAssessment().rooms[0].measurements.acElectric, 'AC electric measurement');
      setAndChange('[data-emf-meter-type="acElectric"]', 'NFA1000');

      document.querySelector(`#emf-sources-${id}-0 .ctx-tag:not(.active)`)?.click();
      document.querySelector(`#emf-mits-${id}-0 .ctx-tag:not(.active)`)?.click();
      emf.saveEMFExplicit();
      await waitUntil(
        () => activeAssessment().rooms[0].sources.length > 0 && activeAssessment().rooms[0].mitigations.length > 0,
        'EMF tags saved'
      );
      outcomes.measurementAndTagsPersist =
        activeAssessment().date === '2026-06-01'
        && activeAssessment().label === 'Before shielding'
        && activeAssessment().rooms[0].location === 'Pillow side'
        && activeAssessment().rooms[0].measurements.acElectric.meter === 'NFA1000'
        && activeAssessment().rooms[0].sources.length > 0
        && activeAssessment().rooms[0].mitigations.length > 0
        && document.querySelector('.emf-severity-dot') !== null;

      const roomSelect = document.querySelector('.emf-room-select');
      roomSelect.value = '_custom';
      roomSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor('#prompt-dialog-input', 'custom room prompt');
      document.getElementById('prompt-dialog-input').value = 'Office nook';
      document.getElementById('prompt-ok').click();
      await waitUntil(() => activeAssessment().rooms.length === 2, 'custom room added');
      outcomes.customRoomPromptAddsAndSelects =
        activeAssessment().rooms[1].name === 'Office nook'
        && document.querySelector('.emf-room-tab.active')?.textContent.includes('Office nook') === true;

      document.querySelector('.emf-remove-room')?.click();
      await waitUntil(() => activeAssessment().rooms.length === 1, 'custom room removed');
      outcomes.removeRoomKeepsAssessmentUsable =
        activeAssessment().rooms.length === 1
        && document.querySelector('.emf-room-tab.active')?.textContent.includes('Bedroom') === true;

      emf.selectEMFRoom('stale-assessment-id', 99);
      outcomes.staleRoomSelectionCannotChangeActiveAssessment =
        document.querySelector('.emf-room-tab.active')?.textContent.includes('Bedroom') === true
        && document.querySelector('[data-emf-room-idx="99"]') === null;

      activeAssessment().rooms[0].photos = [{
        name: 'meter.png',
        mediaType: 'image/svg+xml',
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      }];
      emf.selectEMFRoom(id, 0);
      await waitFor('.emf-photo-thumb img', 'EMF photo thumbnail');
      document.querySelector('.emf-photo-thumb img')?.click();
      await waitFor('.emf-lightbox img', 'EMF photo lightbox');
      const safeMediaFallback = document.querySelector('.emf-lightbox img')?.getAttribute('src')?.startsWith('data:image/png;base64,') === true;
      document.querySelector('.emf-lightbox')?.click();
      await waitUntil(() => !document.querySelector('.emf-lightbox'), 'EMF lightbox closed');
      document.querySelector('.emf-photo-remove')?.click();
      await waitUntil(() => activeAssessment().rooms[0].photos.length === 0, 'EMF photo removed');
      outcomes.photoLightboxUsesSafeType = safeMediaFallback;
      outcomes.photoRemoveWorks = activeAssessment().rooms[0].photos.length === 0;

      const afterAssessment = {
        id: 'emf_after',
        date: '2026-06-15',
        label: 'After mitigation',
        consultant: 'Building Bio Lab',
        rooms: [{
          name: 'Bedroom',
          location: 'Pillow side',
          sleeping: true,
          measurements: {
            acElectric: { value: 4, unit: 'V/m', meter: 'NFA1000' },
            rfMicrowave: { value: 2, unit: 'uW/m2', meter: 'Safe Living' },
          },
          sources: ['WiFi router'],
          mitigations: ['WiFi timer'],
          note: '',
          interpretation: null,
        }],
        note: 'Retested after changes',
      };
      activeAssessment().rooms[0].measurements.rfMicrowave = { value: 14, unit: 'uW/m2', meter: 'Safe Living' };
      state.importedData.emfAssessment.assessments.push(afterAssessment);
      state.importedData.emfAssessment.comparisonInterpretation = {
        text: 'RF improved after shutting down the router overnight.',
        model: 'Local model',
        provider: 'ollama',
        modelId: 'llama3.2',
        inputTokens: 12,
        outputTokens: 18,
        date: '2026-06-16T00:00:00.000Z',
      };
      await emf.openEMFAssessmentEditor();
      await waitFor('.emf-editor-actions button[data-emf-action="toggle-compare"]', 'EMF compare button');
      document.querySelector('.emf-editor-actions button[data-emf-action="toggle-compare"]')?.click();
      await waitFor('.emf-compare-table', 'EMF compare table');
      outcomes.compareShowsBeforeAfterDeltas =
        document.querySelector('.emf-compare-header')?.textContent.includes('Before: Jun 1, 2026') === true
        && document.querySelector('.emf-compare-header')?.textContent.includes('After: Jun 15, 2026') === true
        && document.querySelector('.emf-compare-table')?.textContent.includes('Bedroom') === true
        && document.querySelector('.emf-compare-table')?.textContent.includes('28') === true
        && document.querySelector('.emf-compare-table')?.textContent.includes('4') === true;

      emf.interpretEMFComparison();
      await waitFor('#emf-interp-overlay.show .emf-interp-modal', 'EMF existing interpretation modal');
      document.querySelector('#emf-interp-overlay [data-emf-interp-action="discuss"]')?.click();
      await waitUntil(() => calls.some(call => call[0] === 'chat'), 'EMF discuss chat handoff');
      outcomes.existingComparisonInterpretationDiscussesInChat =
        calls.some(call => call[0] === 'close-modal')
        && calls.some(call => call[0] === 'chat' && call[1].includes('RF improved'));

      emf.toggleEMFCompare();
      await waitFor(`.emf-assessment-header[data-emf-action="toggle-assessment"][data-emf-assessment-id="${id}"]`, 'old assessment header');
      document.querySelector(`.emf-assessment-header[data-emf-action="toggle-assessment"][data-emf-assessment-id="${id}"]`)?.click();
      await waitFor('.emf-assessment-card.expanded button[data-emf-action="delete-assessment"]', 'delete EMF assessment button');
      document.querySelector('.emf-assessment-card.expanded button[data-emf-action="delete-assessment"]')?.click();
      await waitFor('#confirm-ok', 'EMF delete confirm');
      document.getElementById('confirm-ok').click();
      await waitUntil(() => !assessments().some(a => a.id === id), 'EMF assessment deleted');
      outcomes.deleteConfirmsRemovesAndKeepsListUsable =
        !assessments().some(a => a.id === id)
        && document.querySelector('.emf-assessment-card')?.textContent.includes('After mitigation') === true;

      document.querySelector('#detail-modal .modal-close')?.click();
      await waitUntil(() => calls.some(call => call[0] === 'close-editor-modal'), 'lazy EMF editor close callback');
      outcomes.lazyRuntimeInjectsEditorCloseCallback =
        calls.filter(call => call[0] === 'close-editor-modal').length === 1;
    } finally {
      document.querySelectorAll('.emf-lightbox,.notification-container').forEach(el => el.remove());
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      document.getElementById('emf-interp-overlay')?.remove();
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      data.invalidateActiveDataCache();
      emfRuntime.configureEMFRuntimeDeps(previousRuntimeDeps);
      emfInterpretation.configureEMFInterpretationRuntimeDeps(previousInterpretationDeps);
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light audit defaults cover fallback dependency accessors', async ({ page }) => {
  await page.goto('/js/light-env-audits.js', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [{ state }, data, audits] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-env-audits.js'),
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const calls = [];
    const outcomes = {};
    const baseTime = Date.parse('2026-06-08T12:00:00Z');
    const room = { id: 'bedroom', name: 'Bedroom', primarySource: 'led-cool', hoursOccupiedPerDay: 8 };

    try {
      state.currentProfile = 'light-audit-default-deps-coverage';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        lightEnvironment: { rooms: [room], screens: [] },
        lightMeasurements: [
          { roomId: 'bedroom', tool: 'lux', value: 44, capturedAt: baseTime + 500 },
        ],
        lightAudits: [{
          id: 'default_dep_audit',
          date: '2026-06-01',
          label: 'Default dependencies',
          rooms: [room],
          screens: [],
          measurements: [],
          createdAt: baseTime - 500,
        }],
      };
      data.invalidateActiveDataCache();

      audits.configureLightEnvAudits({
        maybeAnalyzeAuditAfterSave: audit => calls.push(['default-auto-audit', audit.id]),
      });
      const defaultSavedAudit = await audits.saveLightAudit('Default deps snapshot');
      const host = document.createElement('div');
      host.innerHTML = audits.renderLightAuditsBlock();
      document.body.appendChild(host);
      try {
        audits.lightEnvAuditActionHandlers.toggleLightAudit('default_dep_audit');
        audits.lightEnvAuditActionHandlers.toggleLightAudit('default_dep_audit');

      outcomes.defaultAuditDepsRenderFallbackSeverity =
          host.querySelector('.light-env-sev-incomplete') !== null
          && host.textContent.includes('Needs details');
        outcomes.defaultAuditDepsSaveSnapshotsEnvironment =
          defaultSavedAudit?.label === 'Default deps snapshot'
          && defaultSavedAudit?.rooms?.[0]?.id === 'bedroom'
          && defaultSavedAudit?.measurements?.length === 1;
        outcomes.defaultAuditDepsAutoAnalyzeHook =
          calls.some(call => call[0] === 'default-auto-audit' && call[1] === defaultSavedAudit?.id);
      } finally {
        host.remove();
      }
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      data.invalidateActiveDataCache();
      audits.configureLightEnvAudits({ maybeAnalyzeAuditAfterSave: () => {} });
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('Light audit history covers save expand update compare interpret and delete controls', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const [{ state }, data, audits, { installLightEnvActionDelegates }] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-env-audits.js'),
      import('/js/light-env-actions.js'),
    ]);

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const waitFor = async (selector, label = selector) => {
      let found = null;
      await waitUntil(() => {
        found = document.querySelector(selector);
        return !!found;
      }, label);
      return found;
    };
    const setAndChange = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`Missing control ${selector}`);
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el;
    };
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    const outcomes = {};
    const calls = [];
    const baseTime = Date.parse('2026-06-08T12:00:00Z');
    const room = { id: 'bedroom', name: 'Bedroom', primarySource: 'led-cool', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: 3 };
    const oldAudit = {
      id: 'audit_old',
      date: '2026-05-15',
      label: 'Baseline',
      rooms: [room],
      screens: [],
      measurements: [
        { roomId: 'bedroom', tool: 'lux', value: 620, capturedAt: baseTime - 90000 },
        { roomId: 'bedroom', tool: 'darkness', value: 1.2, capturedAt: baseTime - 80000 },
        { roomId: 'bedroom', tool: 'flicker', value: 3, capturedAt: baseTime - 70000 },
        { roomId: 'bedroom', tool: 'cct', value: 6100, capturedAt: baseTime - 60000 },
        { roomId: 'bedroom', tool: 'spectrum', value: 1, extra: { melanopic: 0.72 }, capturedAt: baseTime - 50000 },
      ],
      createdAt: baseTime - 3000,
    };
    const midAudit = {
      id: 'audit_mid',
      date: '2026-05-30',
      label: 'Lamp swap',
      rooms: [room],
      screens: [],
      measurements: [
        { roomId: 'bedroom', tool: 'lux', value: 320, capturedAt: baseTime - 40000 },
        { roomId: 'bedroom', tool: 'darkness', value: 0.4, capturedAt: baseTime - 30000 },
      ],
      createdAt: baseTime - 2000,
    };
    const newAudit = {
      id: 'audit_new',
      date: '2026-06-05',
      label: 'Blackout curtains',
      rooms: [room],
      screens: [{ id: 'phone', roomId: 'bedroom', device: 'phone', hoursPerDay: 2 }],
      measurements: [
        { roomId: 'bedroom', tool: 'lux', value: 80, capturedAt: baseTime - 20000 },
        { roomId: 'bedroom', tool: 'darkness', value: 0.03, capturedAt: baseTime - 10000 },
        { roomId: 'bedroom', tool: 'flicker', value: 1, capturedAt: baseTime - 9000 },
        { roomId: 'bedroom', tool: 'cct', value: 2700, capturedAt: baseTime - 8000 },
        { roomId: 'bedroom', tool: 'spectrum', value: 1, extra: { melanopic: 0.18 }, capturedAt: baseTime - 7000 },
      ],
      createdAt: baseTime - 1000,
    };

    function renderHost() {
      let host = document.getElementById('light-audit-test-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'light-audit-test-host';
        document.body.appendChild(host);
      }
      host.innerHTML = audits.renderLightAuditsBlock();
      return host;
    }

    try {
      state.currentProfile = 'light-audit-coverage';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
        lightEnvironment: { rooms: [room], screens: [{ id: 'phone', roomId: 'bedroom', device: 'phone', hoursPerDay: 2 }] },
        lightMeasurements: [
          { roomId: 'bedroom', tool: 'lux', value: 72, capturedAt: baseTime + 1000 },
          { roomId: 'bedroom', tool: 'darkness', value: 0.01, capturedAt: baseTime + 2000 },
          { roomId: 'bedroom', tool: 'spectrum', value: 1, extra: { melanopic: 0.12 }, capturedAt: baseTime + 3000 },
        ],
        lightAudits: [oldAudit, midAudit, newAudit],
      };
      data.invalidateActiveDataCache();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();

      audits.configureLightEnvAudits({
        getEnvironment: () => state.importedData.lightEnvironment,
        computeRoomSeverity: (r, measurements) => {
          const dark = measurements.find(m => m.tool === 'darkness')?.value;
          const lux = measurements.find(m => m.tool === 'lux')?.value;
          const tier = dark > 0.5 || lux > 500 ? 3 : dark > 0.1 || lux > 250 ? 2 : 1;
          return {
            tier,
            color: tier >= 3 ? 'red' : tier === 2 ? 'orange' : 'green',
            label: tier >= 3 ? 'Concerning' : tier === 2 ? 'Moderate' : 'Good',
          };
        },
        refreshLightEnvironmentUI: options => {
          calls.push(['refresh', options?.scrollAnchor || null, options?.fallbackScrollAnchor || null]);
          renderHost();
        },
        hasAIProvider: () => true,
        maybeAnalyzeAuditAfterSave: audit => calls.push(['auto-audit', audit.id]),
        renderAuditAIDot: audit => `<span class="light-audit-ai-dot" data-audit="${audit.id}"></span>`,
        renderAuditAIBlock: audit => `<div class="light-audit-ai-block">AI note for ${audit.label}</div>`,
        openChatPanel: prompt => calls.push(['chat', prompt]),
      });

      const host = renderHost();
      installLightEnvActionDelegates(audits.lightEnvAuditActionHandlers, host);
      outcomes.auditRenderUsesDelegatedActions =
        host.querySelector('[onclick],[onchange],[oninput],[onkeydown],[onblur],[onsubmit],[ontoggle]') === null
        && host.querySelector('[data-light-env-action="save-audit"]') !== null
        && host.querySelector('[data-light-env-action="toggle-audit-history"]') !== null;
      outcomes.initialHistoryCapsAtTwoAndShowsMore =
        host.querySelectorAll('.light-audit-card').length === 2
        && host.querySelector('.light-audit-show-more')?.textContent.includes('Show 1 older audit') === true;

      host.querySelector('.light-audit-show-more')?.click();
      await waitUntil(() => document.querySelectorAll('#light-audit-test-host .light-audit-card').length === 3, 'show all audits');
      outcomes.showAllHistoryRevealsOlderAudit =
        document.querySelector('#light-audit-test-host')?.textContent.includes('Baseline') === true;

      audits.lightEnvAuditActionHandlers.toggleLightAudit('audit_old');
      await waitFor('.light-audit-card[data-id="audit_old"].expanded', 'expanded older audit');
      outcomes.expandedAuditRendersChannelsAndAI =
        document.querySelector('.light-audit-card[data-id="audit_old"]')?.textContent.includes('Camera blue proxy') === true
        && document.querySelector('.light-audit-card[data-id="audit_old"]')?.textContent.includes('High signal') === true
        && document.querySelector('.light-audit-card[data-id="audit_old"] .light-audit-ai-block')?.textContent.includes('Baseline') === true;

      setAndChange('.light-audit-card[data-id="audit_old"] input[aria-label="Audit label"]', 'Baseline renamed');
      await waitUntil(() => state.importedData.lightAudits.find(a => a.id === 'audit_old')?.label === 'Baseline renamed', 'audit label update');
      outcomes.updateKeepsOlderExpandedAndVisible =
        state.importedData.lightAudits.find(a => a.id === 'audit_old')?.updatedAt != null
        && document.querySelector('.light-audit-card[data-id="audit_old"].expanded') !== null
        && calls.some(call => call[0] === 'refresh' && String(call[1]).includes('audit_old'));

      document.querySelector('#light-audit-test-host .light-audit-actions [data-light-env-action="save-audit"]')?.click();
      await waitFor('#prompt-dialog-input', 'audit save prompt');
      document.getElementById('prompt-dialog-input').value = 'Post cleanup';
      document.getElementById('prompt-ok').click();
      await waitUntil(() => state.importedData.lightAudits.some(a => a.label === 'Post cleanup'), 'saved audit from UI');
      await waitUntil(
        () => document.querySelector('.notification-toast')?.textContent.includes('Saved audit: Post cleanup') === true,
        'saved audit notification'
      );
      const savedAudit = state.importedData.lightAudits.find(a => a.label === 'Post cleanup');
      outcomes.saveAuditFromUIPromptsSnapshotsAndNotifies =
        savedAudit?.rooms?.length === 1
        && savedAudit?.measurements?.length === 3
        && document.querySelector('.notification-toast')?.textContent.includes('Saved audit: Post cleanup') === true;

      audits.lightEnvAuditActionHandlers.toggleLightAuditCompare();
      await waitFor('.light-audit-compare-rooms', 'audit compare rooms');
      outcomes.compareModeShowsDeltasAndInterpretAction =
        document.querySelector('.light-audit-compare-head')?.textContent.includes('After:') === true
        && Array.from(document.querySelectorAll('.light-audit-compare-channel')).some(el => el.textContent.includes('Sleep light'))
        && document.querySelector('.light-audit-interpret-btn') !== null;

      document.querySelector('.light-audit-interpret-btn')?.click();
      await waitUntil(() => calls.some(call => call[0] === 'chat'), 'audit compare chat handoff');
      outcomes.interpretComparePrefillsChat =
        calls.some(call => call[0] === 'chat' && String(call[1] || '').includes('Light Environment audit comparison'));

      const deletePromise = audits.lightEnvAuditActionHandlers.deleteLightAuditConfirm('audit_mid');
      await waitFor('#confirm-ok', 'delete audit confirm');
      document.getElementById('confirm-ok').click();
      await deletePromise;
      await waitUntil(() => !state.importedData.lightAudits.some(a => a.id === 'audit_mid'), 'deleted audit');
      outcomes.deleteAuditConfirmRemovesAndRefreshes =
        !state.importedData.lightAudits.some(a => a.id === 'audit_mid')
        && calls.some(call => call[0] === 'refresh');
    } finally {
      document.getElementById('light-audit-test-host')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      data.invalidateActiveDataCache();
      audits.configureLightEnvAudits({
        hasAIProvider: () => false,
        maybeAnalyzeAuditAfterSave: () => {},
        renderAuditAIDot: () => '',
        renderAuditAIBlock: () => '',
      });
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
