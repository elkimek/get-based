import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightDevicesBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function seedCompletedTour() {
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
  localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  localStorage.setItem('labcharts-ai-provider', 'ollama');
  localStorage.setItem('labcharts-ollama-model', 'llama3.2');
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('light devices browser coverage handles store mutations UI wrappers and picker flows', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => import('/js/light-devices.js'));
  await page.evaluate(() => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    document.getElementById('sync-setup-overlay')?.remove();
  });

  const outcomes = await page.evaluate(async () => {
    const [{ state }, data, store, ai, lightDevices, lightDevicesRuntime, recommendationRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-devices-store.js'),
      import('/js/light-device-ai-analysis.js'),
      import('/js/light-devices.js'),
      import('/js/light-devices-runtime.js'),
      import('/js/recommendations-runtime.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return true;
        await wait(20);
      }
      throw new Error(`Timed out waiting for ${label}`);
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
      currentView: state.currentView,
      unitSystem: state.unitSystem,
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      showConfirmDialog: window.showConfirmDialog,
      maybeAnalyzeDeviceSessionAfterFinish: ai.maybeAnalyzeDeviceSessionAfterFinish,
      scrollIntoView: Element.prototype.scrollIntoView,
    };
    let previousLightDevicesRuntimeDeps = null;
    let previousRecommendationBridge = null;
    const outcomes = {};
    const calls = [];
    const preset = {
      id: 'coverage-panel',
      brand: 'CoverageLight',
      model: 'Panel Pro',
      type: 'combined',
      peakWavelengths: [630, 660, 850, 940],
      mwPerCm2At15cm: 75,
      recommendedDistanceCm: 20,
      channels: ['pbm_red', 'pbm_nir'],
      channelGroups: [
        { id: 'red', label: 'Red', peaks: [630, 660] },
        { id: 'nir', label: 'NIR', peaks: [850, 940] },
      ],
      modes: [
        { id: 'all', label: 'All on', groups: ['red', 'nir'], default: true },
        { id: 'red-only', label: 'Red only', groups: ['red'] },
      ],
      coupling: [{ if: 'nir', requires: ['red'], reason: 'shared power rail' }],
      catalogSlug: 'coverage-panel',
    };
    const presetJson = {
      _types: { combined: { icon: 'R', label: 'Red + NIR panels' }, sad: { icon: 'S', label: 'SAD lamps' } },
      presets: [preset],
    };

    try {
      Element.prototype.scrollIntoView = function() {};
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama3.2');
      localStorage.removeItem('labcharts-ai-paused');
      window.getOllamaConfig = () => ({ url: 'http://localhost:11434', model: 'llama3.2', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        const urlText = String(url);
        if (urlText === 'data/light-device-presets.json') {
          return new Response(JSON.stringify(presetJson), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return saved.fetch(url, options);
      };
      previousLightDevicesRuntimeDeps = lightDevicesRuntime.configureLightDevicesRuntimeDeps({
        navigate: route => {
          calls.push(['navigate', route]);
          state.currentView = route;
        },
      });
      window.showConfirmDialog = async message => {
        calls.push(['confirm', message]);
        return true;
      };
      store.configureLightDevicesStore({
        maybeAnalyzeDeviceSessionAfterFinish: session => calls.push(['analyze', session.id]),
      });
      previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
        loadCatalog: async () => ({ products: [] }),
        renderLightDeviceAffiliateRow: (_catalog, slug) => `<a class="affiliate-test">${slug}</a>`,
      });

      state.currentProfile = 'light-devices-browser-coverage';
      state.currentView = 'light';
      state.unitSystem = 'EU';
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
        sunDefaults: { fitzpatrick: 'III', completedAt: Date.now() },
        lightDevices: [],
        deviceSessions: [],
      };
      data.invalidateActiveDataCache();

      const presetDevice = await store.addDeviceFromPresetRecord(preset, { notes: 'desk panel' }, { now: 1000 });
      const customDevice = await store.addCustomDevice({
        brand: 'ManualLight',
        model: 'Desk SAD',
        type: 'sad',
        peakWavelengths: [480, 650],
        lux: 10000,
        recommendedDistanceCm: 45,
        channelGroups: [
          { id: 'white', label: 'White', peaks: [480, 650] },
          { id: 10, label: 'invalid', peaks: [] },
        ],
        modes: [
          { id: 'therapy', label: 'Therapy', groups: ['white'], default: true },
          { id: 'bad', label: 'Bad', groups: ['missing'] },
        ],
        coupling: [
          { if: 'white', requires: ['white'], reason: 'self' },
          { if: 'missing', requires: ['white'], reason: 'invalid' },
        ],
      });
      outcomes.storeAddsPresetAndCustomDevicesWithModeSchema =
        presetDevice?.brand === 'CoverageLight'
        && presetDevice?.channelGroups?.length === 2
        && presetDevice?.modes?.length === 2
        && customDevice?.channels?.includes('circadian')
        && customDevice?.channelGroups?.length === 1
        && customDevice?.modes?.length === 1
        && customDevice?.coupling?.length === 1
        && store.getDevices().length === 2;

      const activeId = await store.startDeviceSession({
        deviceId: presetDevice.id,
        distanceCm: 18,
        bodyAreas: ['breast-chest', 'abdomen'],
        bodyArea: 'torso',
        eyesProtected: false,
        mode: 'all',
      });
      const secondActive = await store.startDeviceSession({ deviceId: presetDevice.id });
      const activeSession = store.getActiveDeviceSession();
      activeSession.startedAt = Date.now() - 125000;
      const activeHost = document.createElement('div');
      activeHost.innerHTML = lightDevices.renderActiveDeviceSessionCard();
      document.body.appendChild(activeHost);
      lightDevices.ensureActiveDeviceTicker();
      const elapsedText = activeHost.querySelector('[data-live-elapsed-for]')?.textContent || '';
      outcomes.startDeviceSessionRejectsSecondAndTickerUpdatesCard =
        !!activeId
        && secondActive === null
        && elapsedText.startsWith('2:')
        && activeHost.textContent.includes('CoverageLight Panel Pro');

      await lightDevices.stopDeviceSessionAndNotify(activeId);
      const stoppedSession = store.getDeviceSessions().find(s => s.id === activeId);
      outcomes.stopDeviceSessionWrapperSavesDosesNotifiesAndNavigates =
        !!stoppedSession?.endedAt
        && stoppedSession.durationMin > 0
        && !!stoppedSession.doses?.pbm_red
        && calls.some(call => call[0] === 'analyze' && call[1] === activeId)
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light')
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Saved'));

      const logged = await store.logDeviceSession({
        deviceId: customDevice.id,
        durationMin: 12,
        distanceCm: 35,
        bodyAreas: ['face'],
        bodyArea: 'face',
        eyesProtected: true,
        notes: 'desk work',
        mode: 'therapy',
      });
      const deleteSessionPromise = lightDevices.deleteDeviceSessionWithConfirm(logged.id);
      await waitUntil(() => !!document.getElementById('confirm-ok'), 'delete session confirm open');
      document.getElementById('confirm-ok')?.click();
      await deleteSessionPromise;
      outcomes.deleteDeviceSessionWrapperConfirmsDeletesAndNavigates =
        !store.getDeviceSessions().some(s => s.id === logged.id)
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length >= 2;

      const deleteDevicePromise = lightDevices.deleteLightDeviceAndRefresh(customDevice.id);
      await waitUntil(() => !!document.getElementById('confirm-ok'), 'delete device confirm open');
      document.getElementById('confirm-ok')?.click();
      await deleteDevicePromise;
      outcomes.deleteLightDeviceWrapperRemovesDeviceAndRefreshes =
        !store.getDevices().some(d => d.id === customDevice.id)
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length >= 3;

      state.importedData.lightDevices = [];
      state.importedData.deviceSessions = [];
      const navBeforePresetAdd = calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length;
      const devicesHost = document.createElement('div');
      devicesHost.innerHTML = await lightDevices.renderDevicesSection();
      document.body.appendChild(devicesHost);
      devicesHost.querySelector('[data-light-devices-action="add-device"]')?.click();
      await waitUntil(() => !!document.querySelector('[aria-label="Add light device"]'), 'delegated add device action');
      const addOverlay = document.querySelector('[aria-label="Add light device"]')?.closest('.modal-overlay');
      const firstPreset = addOverlay?.querySelector('.light-device-preset-row');
      const addButton = addOverlay?.querySelector('#add-device-confirm');
      firstPreset?.click();
      addButton?.click();
      await waitUntil(() => store.getDevices().length === 1 && !document.body.contains(addOverlay), 'preset device added from UI');
      outcomes.productionPresetDialogUsesLoadedPresetsAddWrapperAndRefresh =
        !!store.getDevices()[0]?.presetId
        && calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length > navBeforePresetAdd;
      devicesHost.remove();

      await store.addCustomDevice({
        brand: 'SecondLight',
        model: 'Mini',
        type: 'combined',
        peakWavelengths: [660, 850],
        mwPerCm2At15cm: 45,
        recommendedDistanceCm: 15,
      });
      lightDevices.quickLogDeviceSession();
      await waitUntil(() => !!document.querySelector('[aria-label="Pick a device to log a session"]'), 'device picker open');
      const pickerOverlay = document.querySelector('[aria-label="Pick a device to log a session"]')?.closest('.modal-overlay');
      const pickerRows = Array.from(pickerOverlay?.querySelectorAll('.light-device-picker-row') || []);
      pickerRows[0]?.click();
      await waitUntil(() => !!document.querySelector('[aria-label="Log device session"]'), 'session dialog from picker open');
      const sessionOverlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
      outcomes.quickLogDeviceSessionOpensPickerAndChosenSessionDialog =
        pickerRows.length === 2
        && !document.body.contains(pickerOverlay)
        && !!sessionOverlay
        && sessionOverlay.textContent.includes('Log session');
      sessionOverlay?.remove();

      await lightDevices.openCustomDeviceDialog();
      const customOverlay = document.querySelector('[aria-label="Add custom light device"]')?.closest('.modal-overlay');
      const badInput = customOverlay?.querySelector('#custom-dev-image');
      Object.defineProperty(badInput, 'files', {
        configurable: true,
        value: [new File(['not an image'], 'device.txt', { type: 'text/plain' })],
      });
      badInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(0);
      outcomes.customDeviceScanRejectsInvalidFile =
        Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Please select an image'));
    } finally {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      state.unitSystem = saved.unitSystem;
      data.invalidateActiveDataCache();
      window.fetch = saved.fetch;
      if (saved.getOllamaConfig) window.getOllamaConfig = saved.getOllamaConfig;
      else delete window.getOllamaConfig;
      if (saved.showConfirmDialog) window.showConfirmDialog = saved.showConfirmDialog;
      else delete window.showConfirmDialog;
      if (previousLightDevicesRuntimeDeps) {
        lightDevicesRuntime.configureLightDevicesRuntimeDeps(previousLightDevicesRuntimeDeps);
      }
      store.configureLightDevicesStore({
        maybeAnalyzeDeviceSessionAfterFinish: saved.maybeAnalyzeDeviceSessionAfterFinish || (() => {}),
      });
      if (previousRecommendationBridge) {
        recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      }
      Element.prototype.scrollIntoView = saved.scrollIntoView;
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

  expectAll(outcomes);
});

test('light device setup browser coverage exercises default dependency fallbacks', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ setupUrl }) => {
    const setup = await import(setupUrl);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return true;
        await wait(20);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const outcomes = {};

    try {
      await setup.openAddDeviceDialog();
      const emptyPresetOverlay = document.querySelector('[aria-label="Add light device"]')?.closest('.modal-overlay');
      outcomes.defaultLoadPresetsAndWireModalRenderEmptyPicker =
        !!emptyPresetOverlay
        && emptyPresetOverlay.textContent.includes('Add a light device')
        && emptyPresetOverlay.querySelectorAll('.light-device-preset-row').length === 0;

      emptyPresetOverlay?.querySelector('#add-device-custom')?.click();
      await waitUntil(() => !!document.querySelector('[aria-label="Add custom light device"]'), 'custom device fallback overlay');
      const customOverlay = document.querySelector('[aria-label="Add custom light device"]')?.closest('.modal-overlay');
      if (!customOverlay) throw new Error('Custom device fallback overlay missing');
      customOverlay.querySelector('#custom-dev-brand').value = 'Fallback';
      customOverlay.querySelector('#custom-dev-model').value = 'Manual';
      customOverlay.querySelector('#custom-dev-save')?.click();
      await wait(0);
      outcomes.defaultAddCustomDeviceAndRefreshFallbacksAreCallable =
        document.body.contains(customOverlay)
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('could not be added'));
      customOverlay.remove();

      setup.configureLightDeviceSetup({
        loadPresets: async () => ({
          types: { combined: { icon: 'R', label: 'Red panels' } },
          presets: [{
            id: 'fallback-preset',
            type: 'combined',
            brand: 'Fallback',
            model: 'Preset',
            peakWavelengths: [660, 850],
            recommendedDistanceCm: 15,
          }],
        }),
      });
      await setup.openAddDeviceDialog();
      const presetOverlay = document.querySelector('[aria-label="Add light device"]')?.closest('.modal-overlay');
      const row = presetOverlay?.querySelector('.light-device-preset-row');
      const confirm = presetOverlay?.querySelector('#add-device-confirm');
      row?.click();
      confirm?.click();
      await wait(0);
      outcomes.defaultAddDeviceFromPresetFallbackIsCallable =
        document.body.contains(presetOverlay)
        && Array.from(document.querySelectorAll('.notification-toast'))
          .filter(el => (el.textContent || '').includes('could not be added')).length >= 2;
    } finally {
      document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { setupUrl: moduleUrl('/js/light-device-setup-modal.js') });

  expectAll(outcomes);
});
