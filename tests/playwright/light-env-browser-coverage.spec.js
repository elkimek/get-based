import { expect, test } from './coverage-fixture.js';

function seedCompletedTour() {
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
  localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('light environment browser coverage handles summary modal prompt and source helpers', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderEnvironmentSection === 'function');

  const outcomes = await page.evaluate(async () => {
    const [{ state }, data, lightEnv] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-env.js'),
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
      navigate: window.navigate,
    };
    const outcomes = {};
    const calls = [];
    const env = () => state.importedData.lightEnvironment;

    try {
      state.currentProfile = 'light-env-browser-coverage';
      state.currentView = 'light';
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
        sunDefaults: { homeLight: 'unknown' },
        lightEnvironment: { rooms: [], screens: [] },
        lightMeasurements: [],
        lightAudits: [],
      };
      data.invalidateActiveDataCache();
      localStorage.removeItem('labcharts-light-env-active-room');
      window.navigate = (route, meta) => calls.push(['navigate', route, meta || null]);
      document.getElementById('light-env-assessment-overlay')?.remove();

      const emptyFull = window.renderEnvironmentSection();
      const emptyEmbedded = window.renderEnvironmentSection({ embedded: true });
      const emptySummary = window.renderEnvironmentAssessmentSummary();
      outcomes.windowExportsAndEmptyRenderStates =
        window.computeIndoorBurden === lightEnv.computeIndoorBurden
        && window.computeDeficitAxes === lightEnv.computeDeficitAxes
        && window.computeLightDeficitAxes === lightEnv.computeDeficitAxes
        && window.renderEnvironmentSection === lightEnv.renderEnvironmentSection
        && window.openLightEnvironmentAssessment === lightEnv.openLightEnvironmentAssessment
        && emptyFull.includes('Light environment')
        && emptyFull.includes('Map your bedroom first')
        && !emptyEmbedded.includes('light-env-head')
        && emptySummary.includes('Start assessment');

      window.openLightEnvironmentAssessment();
      await waitUntil(() => !!document.querySelector('#light-env-assessment-overlay .light-env-assessment-modal'), 'assessment modal open');
      const openTitle = document.getElementById('light-env-assessment-title')?.textContent || '';
      window.refreshLightEnvironmentAssessment();
      await waitUntil(() => !!document.querySelector('#light-env-assessment-overlay .light-env-assessment-modal'), 'assessment modal refresh');
      window.closeLightEnvironmentAssessment();
      await waitUntil(() => !document.getElementById('light-env-assessment-overlay'), 'assessment modal close');
      outcomes.modalOpenRefreshAndClose =
        openTitle.trim() === 'Indoor Light Assessment'
        && !document.getElementById('light-env-assessment-overlay');

      outcomes.nextDefaultRoomNameStartsWithBedroom =
        lightEnv.nextDefaultRoomName() === 'Bedroom';

      const customPromise = window.addLightEnvRoomCustom();
      await waitUntil(() => !!document.getElementById('prompt-dialog-input'), 'custom room prompt');
      document.getElementById('prompt-dialog-input').value = 'Studio';
      document.getElementById('prompt-dialog-input').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('prompt-ok').click();
      await customPromise;
      const customRoomId = env().rooms[0].id;
      outcomes.customPromptAddsAndExpandsRoom =
        env().rooms[0].name === 'Studio'
        && localStorage.getItem('labcharts-light-env-active-room') === customRoomId
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      await window.addLightEnvRoom();
      await waitUntil(() => env().rooms.length === 2, 'default room added');
      const bedroom = env().rooms[1];
      outcomes.defaultRoomUsesNextAvailableName =
        bedroom.name === 'Bedroom'
        && lightEnv.nextDefaultRoomName() === 'Living room'
        && localStorage.getItem('labcharts-light-env-active-room') === bedroom.id;

      await window.suggestRoomSourceFromSpectrum(bedroom.id, 'Cool LED (4000K+)');
      await waitUntil(() => bedroom.primarySource === 'led-cool', 'spectrum source applied');
      await window.suggestRoomSourceFromSpectrum(bedroom.id, 'Fluorescent / CFL');
      await window.suggestRoomSourceFromSpectrum('missing-room', 'Warm LED (2700-3000K)');
      await window.suggestRoomSourceFromSpectrum(bedroom.id, 'Unknown spectrum label');
      outcomes.spectrumSuggestionMapsOnceAndDoesNotOverwrite =
        bedroom.primarySource === 'led-cool'
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Auto-set Bedroom'));

      env().burdenAI = { status: 'ok', dot: 'yellow', text: 'AI says moderate' };
      const mappedSummary = window.renderEnvironmentAssessmentSummary();
      const mappedSection = window.renderEnvironmentSection({ embedded: true });
      outcomes.summaryUsesAIVerdictWhenMapped =
        mappedSection.includes('Moderate load')
        && mappedSummary.includes('Open assessment')
        && mappedSummary.includes('2 active today');

      localStorage.removeItem('labcharts-light-env-active-room');
      env().rooms[0].updatedAt = 100;
      bedroom.updatedAt = 200;
      const defaultHost = document.createElement('div');
      defaultHost.innerHTML = window.renderEnvironmentSection({ embedded: true });
      outcomes.defaultActiveRoomUsesMostRecentlyUpdatedRoom =
        defaultHost.querySelector(`.light-env-room-disclosure[data-id="${bedroom.id}"]`)?.classList.contains('expanded') === true;

      await window.updateLightEnvRoomAndRender(bedroom.id, { name: 'Bedroom Prime' });
      outcomes.updateRoomAndRenderRefreshesLightUI =
        env().rooms.find(r => r.id === bedroom.id)?.name === 'Bedroom Prime'
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      window.openLightEnvironmentAssessment();
      await waitUntil(() => !!document.querySelector('#light-env-assessment-overlay.show .light-env-assessment-modal'), 'assessment modal reopened');
      await wait(70);
      const focusedRoomName = document.querySelector('#light-env-assessment-overlay .light-env-room-name-input');
      focusedRoomName?.focus();
      env().rooms.find(r => r.id === bedroom.id).name = 'Synced Bedroom';
      window.dispatchEvent(new Event('labcharts-sync-applied'));
      await waitUntil(() => (document.querySelector('#light-env-assessment-overlay .light-env-assessment-modal')?.textContent || '').includes('Synced Bedroom'), 'sync refresh render');
      await wait(90);
      const closeButtonAfterSyncRefresh = document.querySelector('#light-env-assessment-overlay .modal-close');
      outcomes.syncRefreshRebuildsOpenAssessment =
        !!document.querySelector('#light-env-assessment-overlay.show .light-env-assessment-modal')
        && (document.querySelector('#light-env-assessment-overlay .light-env-assessment-modal')?.textContent || '').includes('Synced Bedroom');
      outcomes.syncRefreshDoesNotMoveFocusToClose =
        !!focusedRoomName
        && document.activeElement !== closeButtonAfterSyncRefresh;
    } finally {
      document.getElementById('light-env-assessment-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      data.invalidateActiveDataCache();
      window.navigate = saved.navigate;
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

test('light environment browser coverage handles screens tools and confirm deletes', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.addLightEnvScreen === 'function');

  const outcomes = await page.evaluate(async () => {
    const [{ state }, data, lightEnv] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-env.js'),
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
      navigate: window.navigate,
      openSpectrumClassifier: window.openSpectrumClassifier,
      openLuxMeter: window.openLuxMeter,
      openFlickerDetector: window.openFlickerDetector,
      openCCTMeter: window.openCCTMeter,
      openDarknessMeter: window.openDarknessMeter,
    };
    const outcomes = {};
    const calls = [];
    const env = () => state.importedData.lightEnvironment;
    const latestScreen = () => env().screens[env().screens.length - 1];

    try {
      state.currentProfile = 'light-env-screen-coverage';
      state.currentView = 'light';
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
        sunDefaults: { homeLight: 'unknown' },
        lightEnvironment: { rooms: [], screens: [] },
        lightMeasurements: [],
        lightAudits: [],
      };
      data.invalidateActiveDataCache();
      window.navigate = (route, meta) => calls.push(['navigate', route, meta || null]);
      window.openSpectrumClassifier = opts => calls.push(['spectrum', opts?.roomId || null]);
      window.openLuxMeter = opts => calls.push(['lux', opts?.roomId || null]);
      window.openFlickerDetector = opts => calls.push(['flicker', opts?.roomId || null]);
      window.openCCTMeter = opts => calls.push(['cct', opts?.roomId || null]);
      window.openDarknessMeter = opts => calls.push(['darkness', opts?.roomId || null]);

      const officeId = await lightEnv.addRoom('Office');
      const livingId = await lightEnv.addRoom('Living room');
      const bedroomId = await lightEnv.addRoom('Bedroom');

      await window.addLightEnvScreen(officeId);
      await waitUntil(() => env().screens.length === 1, 'office screen added');
      const officeScreen = latestScreen();
      await window.addLightEnvScreen(livingId);
      await waitUntil(() => env().screens.length === 2, 'living screen added');
      const livingScreen = latestScreen();
      await window.addLightEnvScreen(bedroomId);
      await waitUntil(() => env().screens.length === 3, 'bedroom screen added');
      const bedroomScreen = latestScreen();
      await window.addLightEnvScreenWithDevice(null, 'projector');
      await waitUntil(() => env().screens.length === 4, 'invalid-device screen added');
      const fallbackScreen = latestScreen();
      outcomes.screenDefaultsInferRoomAndInvalidDeviceFallbacks =
        officeScreen.device === 'laptop'
        && livingScreen.device === 'tv'
        && bedroomScreen.device === 'phone'
        && fallbackScreen.device === 'phone'
        && fallbackScreen.roomId === null;

      await window.updateLightEnvScreen(fallbackScreen.id, { hoursPerDay: 2 });
      await window.updateLightEnvScreenAndRender(fallbackScreen.id, { eveningUseAfterSunset: 0.5 });
      await window.setLightEnvScreenHoursBucket(fallbackScreen.id, 'most');
      await window.setLightEnvScreenEveningBucket(fallbackScreen.id, 'gt3');
      await window.setLightEnvTodayActive('screen', fallbackScreen.id, false);
      localStorage.setItem('labcharts-light-env-active-room', bedroomId);
      state.importedData.lightMeasurements = [
        { id: 'lux-reading', roomId: bedroomId, tool: 'lux', value: 1234, capturedAt: Date.now() },
        { id: 'flicker-reading', roomId: bedroomId, tool: 'flicker', value: 2, capturedAt: Date.now() - 86400000 },
        { id: 'cct-reading', roomId: bedroomId, tool: 'cct', value: 3000, capturedAt: Date.now() - 8 * 86400000 },
        { id: 'darkness-reading', roomId: bedroomId, tool: 'darkness', value: 0.5, capturedAt: Date.now() - 35 * 86400000 },
        { id: 'spectrum-reading', roomId: bedroomId, tool: 'spectrum', value: 'Warm spectrum', capturedAt: Date.now() },
        { id: 'glass-reading', roomId: bedroomId, tool: 'glass-transmission', value: 0.42, capturedAt: Date.now() },
        { id: 'audit-reading', roomId: bedroomId, tool: 'audit', value: 2, capturedAt: Date.now() },
      ];
      const host = document.createElement('div');
      host.id = 'light-env-browser-host';
      host.innerHTML = window.renderEnvironmentSection({ embedded: true });
      document.body.appendChild(host);
      const fallbackCard = host.querySelector(`.light-env-screen-card[data-id="${fallbackScreen.id}"]`);
      outcomes.screenMutationGlobalsUpdateAndRender =
        fallbackScreen.hoursPerDay === 8
        && fallbackScreen.eveningUseAfterSunset === 4
        && fallbackScreen.todayOverride?.active === false
        && fallbackCard?.classList.contains('light-env-card-skipped')
        && fallbackCard?.querySelector('[data-light-env-action="set-screen-hours-bucket"][data-light-env-key="most"]')?.getAttribute('aria-pressed') === 'true'
        && fallbackCard?.querySelector('[data-light-env-action="set-screen-evening-bucket"][data-light-env-key="gt3"]')?.getAttribute('aria-pressed') === 'true';
      const bedroomCardText = host.querySelector(`.light-env-room-disclosure[data-id="${bedroomId}"]`)?.textContent || '';
      outcomes.measurementReadingsRenderAllToolFormats =
        bedroomCardText.includes('1,234 lux')
        && bedroomCardText.includes('moderate flicker')
        && bedroomCardText.includes('3,000 K')
        && bedroomCardText.includes('0.50 lux (sleep)')
        && bedroomCardText.includes('Warm spectrum')
        && bedroomCardText.includes('42% transmits')
        && bedroomCardText.includes('2 room snapshots');
      const wasScreenExpanded = fallbackCard?.classList.contains('expanded') === true;
      window.toggleLightEnvScreenExpanded(fallbackScreen.id);
      const expandedHost = document.createElement('div');
      expandedHost.innerHTML = window.renderEnvironmentSection({ embedded: true });
      outcomes.screenExpandToggleChangesPortableCardState =
        expandedHost.querySelector(`.light-env-screen-card[data-id="${fallbackScreen.id}"]`)?.classList.contains('expanded') !== wasScreenExpanded;
      for (const tool of ['spectrum', 'lux', 'flicker', 'cct', 'darkness']) {
        host.querySelector(`[data-light-env-action="open-tool"][data-light-env-tool="${tool}"]`)?.click();
      }
      outcomes.delegatedToolButtonsDispatchRoomAwareOpeners =
        ['spectrum', 'lux', 'flicker', 'cct', 'darkness']
          .every(tool => calls.some(call => call[0] === tool && call[1] === bedroomId));

      const cancelScreenDelete = window.deleteLightEnvScreenConfirm(fallbackScreen.id);
      await waitUntil(() => !!document.getElementById('confirm-cancel'), 'screen delete cancel dialog');
      document.getElementById('confirm-cancel').click();
      await cancelScreenDelete;
      const screenStillExists = env().screens.some(s => s.id === fallbackScreen.id);
      const confirmScreenDelete = window.deleteLightEnvScreenConfirm(fallbackScreen.id);
      await waitUntil(() => !!document.getElementById('confirm-ok'), 'screen delete confirm dialog');
      document.getElementById('confirm-ok').click();
      await confirmScreenDelete;
      outcomes.screenDeleteConfirmHonorsCancelAndConfirm =
        screenStillExists
        && !env().screens.some(s => s.id === fallbackScreen.id);

      const cancelRoomDelete = window.deleteLightEnvRoomConfirm(officeId);
      await waitUntil(() => !!document.getElementById('confirm-cancel'), 'room delete cancel dialog');
      document.getElementById('confirm-cancel').click();
      await cancelRoomDelete;
      const roomStillExists = env().rooms.some(r => r.id === officeId);
      const linkedScreenBeforeRoomDelete = env().screens.find(s => s.id === officeScreen.id);
      const confirmRoomDelete = window.deleteLightEnvRoomConfirm(officeId);
      await waitUntil(() => !!document.getElementById('confirm-ok'), 'room delete confirm dialog');
      document.getElementById('confirm-ok').click();
      await confirmRoomDelete;
      outcomes.roomDeleteConfirmRemovesRoomAndUnlinksScreens =
        roomStillExists
        && linkedScreenBeforeRoomDelete?.roomId === null
        && !env().rooms.some(r => r.id === officeId)
        && env().screens.some(s => s.id === officeScreen.id && s.roomId === null);

      window.setActiveLightEnvRoom(livingId);
      outcomes.setActiveRoomAndBurdenGlobalsRemainUsable =
        localStorage.getItem('labcharts-light-env-active-room') === livingId
        && window.isLightEnvActiveToday(env().rooms.find(r => r.id === livingId)) === true
        && typeof window.computeRoomSeverity(env().rooms.find(r => r.id === livingId)).tier === 'number'
        && typeof window.computeIndoorBurden().d2 === 'number'
        && typeof window.computeDeficitAxes().d3 === 'number'
        && window.getScreensForRoom(null).some(s => s.id === officeScreen.id)
        && window.getRooms().some(r => r.id === livingId);

      const directRoomId = await lightEnv.addRoom('Garage');
      await window.addLightEnvScreenWithDevice(null, 'tablet');
      await waitUntil(() => env().screens.some(s => s.device === 'tablet'), 'tablet screen added');
      const directScreenId = latestScreen().id;
      const directScreenBeforeDelete = document.createElement('div');
      directScreenBeforeDelete.innerHTML = window.renderEnvironmentSection({ embedded: true });
      await window.deleteLightEnvScreen(directScreenId);
      const directScreenAfterDelete = document.createElement('div');
      directScreenAfterDelete.innerHTML = window.renderEnvironmentSection({ embedded: true });
      await window.addLightEnvScreenWithDevice(null, 'monitor');
      await waitUntil(() => env().screens.some(s => s.device === 'monitor'), 'monitor screen added');
      const replacementScreenId = latestScreen().id;
      const directScreenAfterReplacement = document.createElement('div');
      directScreenAfterReplacement.innerHTML = window.renderEnvironmentSection({ embedded: true });
      await window.deleteLightEnvRoom(directRoomId);
      outcomes.directDeleteHelpersRemoveRecords =
        directScreenBeforeDelete.querySelector(`.light-env-screen-card[data-id="${directScreenId}"]`)?.classList.contains('expanded') === true
        && directScreenAfterDelete.querySelector(`.light-env-screen-card[data-id="${directScreenId}"]`) === null
        && directScreenAfterReplacement.querySelector(`.light-env-screen-card[data-id="${replacementScreenId}"]`)?.classList.contains('expanded') === true
        && !env().screens.some(s => s.id === directScreenId)
        && !env().rooms.some(r => r.id === directRoomId);
    } finally {
      document.getElementById('light-env-browser-host')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      data.invalidateActiveDataCache();
      window.navigate = saved.navigate;
      window.openSpectrumClassifier = saved.openSpectrumClassifier;
      window.openLuxMeter = saved.openLuxMeter;
      window.openFlickerDetector = saved.openFlickerDetector;
      window.openCCTMeter = saved.openCCTMeter;
      window.openDarknessMeter = saved.openDarknessMeter;
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
