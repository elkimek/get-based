import { expect, test } from './coverage-fixture.js';

async function waitForInitialView(page) {
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return typeof state.currentView === 'string' && state.currentView.length > 0;
  });
}

test('Light environment assessment drives delegated room and screen controls', async ({ page }) => {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await waitForInitialView(page);

  const results = await page.evaluate(async () => {
    const [{ state }, data, lightEnv] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/light-env.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 100; i += 1) {
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
    };
    const outcomes = {};
    const calls = [];
    const savedLightEnvDeps = lightEnv.configureLightEnv({
      navigate: (route, meta) => calls.push(['navigate', route, meta || null]),
      openLuxMeter: opts => calls.push(['open-lux', opts?.roomId || null]),
    });

    const selectorFor = (action, attrs = {}) => [
      `[data-light-env-action="${action}"]`,
      ...Object.entries(attrs).map(([name, value]) => `[data-light-env-${name}="${value}"]`),
    ].join('');
    const clickAction = async (action, attrs = {}, label = action) => {
      const el = await waitFor(selectorFor(action, attrs), label);
      el.click();
      await wait(0);
      return el;
    };
    const room = () => state.importedData.lightEnvironment.rooms[0];
    const screen = () => state.importedData.lightEnvironment.screens[0];

    try {
      state.currentProfile = 'light-env-coverage';
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
      document.getElementById('light-env-assessment-overlay')?.remove();
      window.endTour?.();
      document.getElementById('tour-overlay')?.remove();
      document.getElementById('tour-spotlight')?.remove();
      document.getElementById('tour-tooltip')?.remove();
      const summaryHost = document.createElement('div');
      summaryHost.id = 'light-env-summary-host';
      summaryHost.innerHTML = lightEnv.renderEnvironmentAssessmentSummary();
      document.body.appendChild(summaryHost);
      summaryHost.querySelector(selectorFor('open-assessment'))?.click();
      await waitFor('#light-env-assessment-overlay .light-env-assessment-modal', 'assessment modal');
      outcomes.summaryActionOpensModal =
        document.getElementById('light-env-assessment-title')?.textContent.trim() === 'Indoor Light Assessment'
        && document.querySelector('.light-env-assessment-modal-copy')?.textContent.includes('Save snapshots');

      await clickAction('add-room-named', { name: 'Bedroom' }, 'bedroom quick pick');
      await waitUntil(() => state.importedData.lightEnvironment.rooms.length === 1, 'bedroom persisted');
      const roomId = room().id;
      await waitUntil(
        () => localStorage.getItem('labcharts-light-env-active-room') === roomId
          && document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"]`)?.classList.contains('expanded'),
        'bedroom active render'
      );
      outcomes.roomQuickPickAddsAndExpands =
        room().name === 'Bedroom'
        && localStorage.getItem('labcharts-light-env-active-room') === roomId
        && document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"]`)?.classList.contains('expanded');

      const nameInput = await waitFor(
        `.light-env-room-disclosure[data-id="${roomId}"] [data-light-env-action="update-room-name"]`,
        'room name input'
      );
      nameInput.value = 'Sleep room';
      nameInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'm' }));
      await waitUntil(() => room().name === 'Sleep room', 'room name update');
      outcomes.roomInputPersistsViaDataAction =
        room().name === 'Sleep room'
        && !!document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"] [data-light-env-action="update-room-name"]`);

      await clickAction('set-room-source-archetype', { id: roomId, key: 'cool' }, 'cool source chip');
      await waitUntil(() => room().primarySource === 'led-cool', 'room source update');
      await clickAction('set-room-daylight-level', { id: roomId, key: 'some' }, 'daylight level chip');
      await waitUntil(() => room().daylightLevel === 'some', 'room daylight update');
      await clickAction('set-room-hours-bucket', { id: roomId, key: 'lots' }, 'room hours chip');
      await waitUntil(() => room().hoursOccupiedPerDay === 4.5, 'room hours update');
      await clickAction('set-room-evening-bucket', { id: roomId, key: 'gt3' }, 'room evening chip');
      await waitUntil(() => room().eveningHoursAfterSunset === 4, 'room evening update');
      await waitUntil(
        () => document.querySelector(selectorFor('set-room-source-archetype', { id: roomId, key: 'cool' }))?.getAttribute('aria-pressed') === 'true'
          && document.querySelector(selectorFor('set-room-daylight-level', { id: roomId, key: 'some' }))?.getAttribute('aria-pressed') === 'true'
          && document.querySelector(selectorFor('set-room-hours-bucket', { id: roomId, key: 'lots' }))?.getAttribute('aria-pressed') === 'true'
          && document.querySelector(selectorFor('set-room-evening-bucket', { id: roomId, key: 'gt3' }))?.getAttribute('aria-pressed') === 'true',
        'room active chips render'
      );
      outcomes.roomChipsPersistAndRenderActive =
        document.querySelector(selectorFor('set-room-source-archetype', { id: roomId, key: 'cool' }))?.getAttribute('aria-pressed') === 'true'
        && document.querySelector(selectorFor('set-room-daylight-level', { id: roomId, key: 'some' }))?.getAttribute('aria-pressed') === 'true'
        && document.querySelector(selectorFor('set-room-hours-bucket', { id: roomId, key: 'lots' }))?.getAttribute('aria-pressed') === 'true'
        && document.querySelector(selectorFor('set-room-evening-bucket', { id: roomId, key: 'gt3' }))?.getAttribute('aria-pressed') === 'true';

      document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"] .light-env-room-disclosure-head`)
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await waitUntil(
        () => document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"] .light-env-room-disclosure-head`)?.getAttribute('aria-expanded') === 'false',
        'room collapsed by keyboard'
      );
      outcomes.roomKeyboardCollapseShowsSummary =
        document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"]`)?.textContent.includes('Cool LED')
        && document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"]`)?.textContent.includes('evening');
      document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"] .light-env-room-disclosure-head`)
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await waitUntil(
        () => document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"] .light-env-room-disclosure-head`)?.getAttribute('aria-expanded') === 'true',
        'room expanded by keyboard'
      );

      document.querySelector(
        `.light-env-room-disclosure[data-id="${roomId}"] ${selectorFor('set-today-active', { kind: 'room', id: roomId })}`
      )?.click();
      await waitUntil(() => room().todayOverride?.active === false, 'room today skipped');
      await waitUntil(
        () => document.querySelector(
          `.light-env-room-disclosure[data-id="${roomId}"] ${selectorFor('set-today-active', { kind: 'room', id: roomId })}`
        )?.dataset.lightEnvActive === 'true',
        'room today restore target'
      );
      const roomSkippedClass = document.querySelector(`.light-env-room-disclosure[data-id="${roomId}"]`)?.classList.contains('light-env-card-skipped') === true;
      document.querySelector(
        `.light-env-room-disclosure[data-id="${roomId}"] ${selectorFor('set-today-active', { kind: 'room', id: roomId })}`
      )?.click();
      await waitUntil(() => room().todayOverride?.active === true, 'room today restored');
      outcomes.roomTodayToggleRoundTrips = roomSkippedClass && room().todayOverride.active === true;

      await clickAction('add-screen-with-device', { 'room-id': roomId, device: 'phone' }, 'phone screen quick pick');
      await waitUntil(() => state.importedData.lightEnvironment.screens.length === 1, 'screen persisted');
      const screenId = screen().id;
      await waitUntil(
        () => document.querySelector(`.light-env-screen-card[data-id="${screenId}"]`)?.classList.contains('expanded'),
        'screen expanded render'
      );
      outcomes.roomScreenQuickPickAddsExpandedCard =
        screen().device === 'phone'
        && screen().roomId === roomId
        && document.querySelector(`.light-env-screen-card[data-id="${screenId}"]`)?.classList.contains('expanded');

      await clickAction('set-screen-hours-bucket', { id: screenId, key: 'lots' }, 'screen hours chip');
      await waitUntil(() => screen().hoursPerDay === 4.5, 'screen hours update');
      await clickAction('set-screen-evening-bucket', { id: screenId, key: 'mid' }, 'screen evening chip');
      await waitUntil(() => screen().eveningUseAfterSunset === 2, 'screen evening update');
      const deviceSelect = await waitFor(selectorFor('update-screen-device', { id: screenId }), 'screen device select');
      deviceSelect.value = 'tablet';
      deviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitUntil(() => screen().device === 'tablet', 'screen device update');
      const blocker = await waitFor(selectorFor('update-screen-blue-blocker', { id: screenId }), 'blue blocker toggle');
      blocker.click();
      await waitUntil(() => screen().blueBlockerEnabled === true, 'blue blocker update');
      await waitUntil(
        () => document.querySelector(selectorFor('set-screen-hours-bucket', { id: screenId, key: 'lots' }))?.getAttribute('aria-pressed') === 'true'
          && document.querySelector(selectorFor('set-screen-evening-bucket', { id: screenId, key: 'mid' }))?.getAttribute('aria-pressed') === 'true'
          && document.querySelector(selectorFor('update-screen-blue-blocker', { id: screenId }))?.checked === true,
        'screen controls render'
      );
      outcomes.screenControlsPersistAndRender =
        document.querySelector(selectorFor('set-screen-hours-bucket', { id: screenId, key: 'lots' }))?.getAttribute('aria-pressed') === 'true'
        && document.querySelector(selectorFor('set-screen-evening-bucket', { id: screenId, key: 'mid' }))?.getAttribute('aria-pressed') === 'true'
        && document.querySelector(selectorFor('update-screen-blue-blocker', { id: screenId }))?.checked === true;

      document.querySelector(
        `.light-env-screen-card[data-id="${screenId}"] ${selectorFor('set-today-active', { kind: 'screen', id: screenId })}`
      )?.click();
      await waitUntil(() => screen().todayOverride?.active === false, 'screen today skipped');
      await waitUntil(
        () => document.querySelector(
          `.light-env-screen-card[data-id="${screenId}"] ${selectorFor('set-today-active', { kind: 'screen', id: screenId })}`
        )?.dataset.lightEnvActive === 'true',
        'screen today restore target'
      );
      const screenSkippedClass = document.querySelector(`.light-env-screen-card[data-id="${screenId}"]`)?.classList.contains('light-env-card-skipped') === true;
      document.querySelector(
        `.light-env-screen-card[data-id="${screenId}"] ${selectorFor('set-today-active', { kind: 'screen', id: screenId })}`
      )?.click();
      await waitUntil(() => screen().todayOverride?.active === true, 'screen today restored');
      outcomes.screenTodayToggleRoundTrips = screenSkippedClass && screen().todayOverride.active === true;

      const roomSelect = await waitFor(selectorFor('update-screen-room', { id: screenId }), 'screen room select');
      roomSelect.value = '';
      roomSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitUntil(() => screen().roomId === null, 'screen moved to portable');
      await waitUntil(
        () => !!document.querySelector(`.light-env-screen-cards .light-env-screen-card[data-id="${screenId}"]`)
          && !document.querySelector(`.light-env-room-screens-list .light-env-screen-card[data-id="${screenId}"]`),
        'portable screen render'
      );
      outcomes.screenRoomSelectMovesCard =
        !!document.querySelector(`.light-env-screen-cards .light-env-screen-card[data-id="${screenId}"]`)
        && !document.querySelector(`.light-env-room-screens-list .light-env-screen-card[data-id="${screenId}"]`);
      outcomes.refreshNavigatesDuringSetup = calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      await clickAction('open-tool', { id: roomId, tool: 'lux' }, 'lux tool button');
      outcomes.roomToolButtonPassesRoomId = calls.some(call => call[0] === 'open-lux' && call[1] === roomId);

      await clickAction('close-assessment', {}, 'close assessment');
      await waitUntil(() => !document.getElementById('light-env-assessment-overlay'), 'assessment closed');
      outcomes.closeActionRemovesModal = !document.getElementById('light-env-assessment-overlay');
    } finally {
      document.getElementById('light-env-assessment-overlay')?.remove();
      document.getElementById('light-env-summary-host')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      data.invalidateActiveDataCache();
      lightEnv.configureLightEnv(savedLightEnvDeps);
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
