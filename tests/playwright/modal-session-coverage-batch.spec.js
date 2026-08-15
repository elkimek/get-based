import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?modalSessionCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('marker detail modal covers custom marker create delete and focus restore paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ markerUrl }) => {
    const [{ state }, data, markerModal, markerRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import(markerUrl),
      import('/js/marker-detail-runtime.js'),
    ]);
    const outcomes = {};
    const calls = [];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const saved = {
      importedData: clone(state.importedData),
      currentView: state.currentView,
      activeDetailMarkerId: state._activeDetailMarkerId,
      navigate: window.navigate,
    };
    const previousMarkerRuntime = markerRuntime.configureMarkerDetailRuntime({
      buildSidebar: () => calls.push(['sidebar']),
    });

    const ensureShell = () => {
      if (!document.getElementById('modal-overlay')) {
        document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-overlay' }));
      }
      if (!document.getElementById('detail-modal')) {
        document.body.appendChild(Object.assign(document.createElement('div'), { id: 'detail-modal', className: 'modal' }));
      }
    };

    try {
      ensureShell();
      state.currentView = 'dashboard';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        markerLabels: {},
        refOverrides: {},
      };
      data.invalidateActiveDataCache();
      window.navigate = route => calls.push(['navigate', route]);
      markerModal.configureMarkerDetailModal({
        navigate: route => calls.push(['dep-navigate', route]),
        isDashboardQuickMarkerPinned: id => id === 'custom7ToxicMetals_leadBurden',
        showEmojiPicker: (el, callback) => {
          calls.push(['emoji-picker', el?.id || '']);
          callback('X');
        },
      });

      const trigger = document.createElement('button');
      trigger.id = 'marker-trigger';
      trigger.textContent = 'Trigger';
      document.body.appendChild(trigger);
      trigger.focus();
      markerModal.rememberModalTrigger();
      markerModal.closeModal();
      outcomes.closeRestoresRememberedFocus = document.activeElement === trigger;

      await markerModal.openCreateMarkerModal();
      const catSelect = document.getElementById('cm-category');
      if (catSelect) {
        catSelect.value = '__new__';
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      outcomes.newCategoryRowAppears = document.getElementById('cm-new-cat-row')?.style.display === 'flex';
      const iconEl = document.getElementById('cm-new-cat-icon');
      markerModal.pickNewCatIcon(iconEl);
      outcomes.pickNewCatIconStoresCustomGlyph = iconEl?.textContent?.trim() === 'X'
        && iconEl?.dataset.custom === '1'
        && calls.some(call => call[0] === 'emoji-picker' && call[1] === 'cm-new-cat-icon');

      markerModal.saveCustomMarker();
      outcomes.emptyMarkerNameIsRejected = !Object.keys(state.importedData.customMarkers || {}).length
        && Array.from(document.querySelectorAll('.notification-toast')).some(el => el.textContent.includes('Please enter a marker name'));

      document.getElementById('cm-new-cat').value = '7 Toxic Metals!';
      document.getElementById('cm-name').value = 'Lead Burden';
      document.getElementById('cm-unit').value = 'ug/L';
      document.getElementById('cm-ref-min').value = '0';
      document.getElementById('cm-ref-max').value = '5';
      document.getElementById('cm-opt-min').value = '0';
      document.getElementById('cm-opt-max').value = '2';
      markerModal.saveCustomMarker();
      await delay(180);
      data.invalidateActiveDataCache();

      const createdKey = 'custom7ToxicMetals.leadBurden';
      const created = state.importedData.customMarkers?.[createdKey];
      outcomes.createStoresCustomMarkerDefinition = created?.name === 'Lead Burden'
        && /^custom:[A-Za-z0-9_-]+$/.test(created?.markerId || '')
        && created?.unit === 'ug/L'
        && created?.refMax === 5
        && created?.categoryLabel === '7 Toxic Metals!'
        && created?.icon === 'X';
      outcomes.createStoresOptimalOverride = state.importedData.refOverrides?.[createdKey]?.optimalMax === 2;
      outcomes.createCallsSidebarAndOpensManualEntry = calls.some(call => call[0] === 'sidebar')
        && !!document.getElementById('me-value')
        && !!document.getElementById('me-date');

      state.importedData.customMarkers['custom7ToxicMetals.mercuryBurden'] = {
        name: 'Mercury Burden',
        unit: 'ug/L',
        categoryLabel: '7 Toxic Metals!',
      };
      state.importedData.entries = [{
        date: '2026-06-07',
        markers: {
          custom7ToxicMetals: { leadBurden: 4, mercuryBurden: 1 },
        },
      }];
      state.importedData.markerNotes = {
        [createdKey]: 'track retest',
        'custom7ToxicMetals.mercuryBurden': 'keep',
      };
      state.importedData.markerLabels = {
        [createdKey]: 'Lead renamed',
      };
      state.importedData.refOverrides[createdKey] = { refMin: 0, refMax: 4 };
      data.invalidateActiveDataCache();

      const deleteLead = markerModal.deleteCustomMarker('custom7ToxicMetals_leadBurden');
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      await deleteLead;
      outcomes.deleteOneCustomMarkerLeavesSibling = !state.importedData.customMarkers?.[createdKey]
        && !!state.importedData.customMarkers?.['custom7ToxicMetals.mercuryBurden']
        && !state.importedData.markerNotes?.[createdKey]
        && !state.importedData.markerLabels?.[createdKey]
        && !state.importedData.refOverrides?.[createdKey]
        && calls.some(call => call[0] === 'dep-navigate' && call[1] === 'dashboard');

      const deleteMercury = markerModal.deleteCustomMarker('custom7ToxicMetals_mercuryBurden');
      await Promise.resolve();
      document.getElementById('confirm-ok')?.click();
      await deleteMercury;
      outcomes.deleteLastCustomMarkerClearsCategory = !Object.keys(state.importedData.customMarkers || {})
        .some(key => key.startsWith('custom7ToxicMetals.'));
    } finally {
      state.importedData = saved.importedData;
      state.currentView = saved.currentView;
      state._activeDetailMarkerId = saved.activeDetailMarkerId;
      markerRuntime.configureMarkerDetailRuntime(previousMarkerRuntime);
      if (saved.navigate) window.navigate = saved.navigate;
      else delete window.navigate;
      data.invalidateActiveDataCache();
      markerModal.configureMarkerDetailModal({
        navigate: (...args) => window.navigate?.(...args),
        isDashboardQuickMarkerPinned: () => false,
        toggleDashboardQuickMarkerPin: id => globalThis.toggleDashboardQuickMarkerPin?.(id),
        renameMarker: id => globalThis.renameMarker?.(id),
        revertMarkerName: id => globalThis.revertMarkerName?.(id),
        askAIAboutMarker: id => globalThis.askAIAboutMarker?.(id),
        showEmojiPicker: () => {},
      });
      document.querySelectorAll('.notification-container,.confirm-overlay').forEach(el => el.remove());
      document.getElementById('marker-trigger')?.remove();
    }

    return outcomes;
  }, { markerUrl: moduleUrl('/js/marker-detail-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sun session UI covers chip units and detailed dialog validation paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(sunSessionUrl),
    ]);
    const outcomes = {};
    const calls = [];
    const saved = {
      currentView: state.currentView,
      importedData: JSON.parse(JSON.stringify(state.importedData)),
      navigate: window.navigate,
    };

    try {
      state.currentView = 'light';
      state.importedData = {
        ...state.importedData,
        genetics: { snps: [] },
        sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'II', completedAt: Date.now() },
      };
      const vitaminDIU = () => 900;
      const vitaminDIUPerSession = () => 1550;
      const pbmJoulesPerCm2 = () => 12.4;
      const circadianMelanopicLux = () => 12600;
      window.navigate = route => calls.push(['navigate', route]);

      sunUI.configureSunSessionUI({
        getSessions: () => [],
        deleteSession: async id => calls.push(['delete', id]),
        updateSession: async (id, patch) => calls.push(['update', id, patch]),
        logCompletedSession: async opts => {
          calls.push(['log', opts]);
          return 'logged-session';
        },
        hydrateSession: async id => calls.push(['hydrate', id]),
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'test' }),
        refreshSurfaces: () => calls.push(['refresh']),
        wireBackdropClose: () => calls.push(['wire']),
        trapModalFocus: () => calls.push(['trap']),
        summarizeBodyExposure: sess => `${sess.bodyExposure?.regions?.length || 0} regions`,
        formatElapsed: () => '0:10',
        exposurePresets: [{ key: 'face_hands', label: 'Face + hands' }],
        eyeModes: [{ key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' }],
        lensTints: [{ key: 'clear', label: 'Clear' }],
        postureOptions: [{ key: 'standing', label: 'Standing' }],
        surfaceOptions: [{ key: 'grass', label: 'Grass' }],
        channelDisplay: {
          vitamin_d: { icon: 'D', label: 'Vitamin D', dailyTarget: 300, what: 'Vitamin D' },
          circadian: { icon: 'C', label: 'Circadian', dailyTarget: 100, what: 'Circadian' },
          nir_solar: { icon: 'N', label: 'NIR', dailyTarget: 100, what: 'NIR' },
          no_cv: { icon: 'NO', label: 'NO', dailyTarget: 100, what: 'NO' },
          pomc: { icon: 'P', label: 'POMC', dailyTarget: 100, what: 'POMC' },
          violet_eye: { icon: 'V', label: 'Violet', dailyTarget: 100, what: 'Violet' },
        },
        channelTier: value => value >= 100 ? 3 : value > 0 ? 2 : 0,
        tierLabel: tier => ['none', 'low', 'moderate', 'high'][tier] || 'none',
        formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
        tooShortForChannelVerdictMin: 2,
        vitaminDIU,
        vitaminDIUPerSession,
        pbmJoulesPerCm2,
        circadianMelanopicLux,
      });

      const chipHost = document.createElement('div');
      chipHost.innerHTML = sunUI.renderChannelChips({
        vitamin_d: 80,
        circadian: 70,
        nir_solar: 60,
        no_cv: 240,
        pomc: 60,
        violet_eye: 30,
      }, {
        durationMin: 25,
        safety: { fitzpatrick: 'II' },
        atmosphere: { uvIndex: 7 },
        bodyExposure: { fraction: 0.22, rotatedSides: true },
      });
      outcomes.channelChipsRenderRealUnitValues = chipHost.textContent.includes('~1.6k IU')
        && chipHost.textContent.includes('~13k est. mel lx')
        && !chipHost.querySelector('[data-channel="no_cv"] .sun-chip-value')
        && !chipHost.textContent.includes('%')
        && !!chipHost.querySelector('.sun-chip-more');

      const shortHost = document.createElement('div');
      shortHost.innerHTML = sunUI.renderChannelChips({ vitamin_d: 80, circadian: 70 }, { durationMin: 1 });
      outcomes.shortSessionSuppressesChipValues = shortHost.querySelectorAll('.sun-chip-value').length === 0;

      sunUI.openDetailedSessionDialog();
      const overlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      const start = overlay?.querySelector('#det-started-at');
      const end = overlay?.querySelector('#det-ended-at');
      if (start && end) {
        start.value = '2026-06-07T10:00';
        end.value = '2026-06-07T09:00';
        end.dispatchEvent(new Event('input', { bubbles: true }));
      }
      outcomes.invalidDurationHintUpdatesInline = overlay?.querySelector('#det-duration-hint')?.textContent
        .includes('Ended must be after Started') === true;
      overlay?.querySelector('#det-save')?.click();
      await Promise.resolve();
      outcomes.invalidDetailedSessionDoesNotLog = !calls.some(call => call[0] === 'log')
        && Array.from(document.querySelectorAll('.notification-toast')).some(el => el.textContent.includes('Ended at must be after Started'));
      overlay?.remove();
    } finally {
      state.currentView = saved.currentView;
      state.importedData = saved.importedData;
      if (saved.navigate) window.navigate = saved.navigate;
      else delete window.navigate;
      sunUI.configureSunSessionUI({
        getSessions: () => [],
        deleteSession: async () => false,
        updateSession: async () => null,
        logCompletedSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
        refreshSurfaces: () => {},
        wireBackdropClose: () => {},
        trapModalFocus: () => {},
        summarizeBodyExposure: () => 'Body unset',
        formatElapsed: () => '0:00',
        exposurePresets: [],
        eyeModes: [],
        lensTints: [],
        postureOptions: [],
        surfaceOptions: [],
        channelDisplay: {},
        channelTier: () => 0,
        tierLabel: () => 'none',
        formatChannelUnit: () => '',
        tooShortForChannelVerdictMin: 2,
        vitaminDIU: null,
        vitaminDIUPerSession: null,
        pbmJoulesPerCm2: null,
        circadianMelanopicLux: null,
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('device session dialog covers validation unit mode start and save paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ deviceSessionUrl }) => {
    const [{ state }, deviceSessionModal] = await Promise.all([
      import('/js/state.js'),
      import(deviceSessionUrl),
    ]);
    const outcomes = {};
    const calls = [];
    const saved = {
      unitSystem: state.unitSystem,
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
    };
    let activeSession = null;
    const devices = [{
      id: 'panel-coverage',
      brand: 'CoverageLight',
      model: 'Dual 900',
      recommendedDistanceCm: 30,
      lastSession: {
        durationMin: 18,
        distanceCm: 30,
        bodyArea: 'legs',
        eyesProtected: false,
        mode: 'red',
      },
      modes: [
        { id: 'combo', label: 'Combo', default: true },
        { id: 'red', label: 'Red only' },
        { id: 'nir', label: 'NIR only' },
        { id: 'blocked', label: 'Blocked' },
      ],
    }];
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 80) => {
      for (let i = 0; i < attempts; i++) {
        if (predicate()) return true;
        await delay(5);
      }
      return false;
    };
    const waitForCall = async kind => {
      await waitFor(() => calls.some(call => call[0] === kind));
      return calls.find(call => call[0] === kind)?.[1] || null;
    };

    try {
      state.unitSystem = 'US';
      state.importedData = {
        ...state.importedData,
        sunDefaults: {},
      };
      const validateModeCoupling = (_device, mode) => ({ ok: mode !== 'blocked' });
      const renderBodySilhouette = selected => `
        <button type="button" class="body-region-test" data-region="legs-front" aria-pressed="${selected.has('legs-front')}">Legs front</button>
        <button type="button" class="body-region-test" data-region="arms-front" aria-pressed="${selected.has('arms-front')}">Arms front</button>
      `;
      const bindBodySilhouette = (slot, selected, callback) => {
        slot.querySelectorAll('[data-region]').forEach(btn => {
          btn.addEventListener('click', () => {
            const region = btn.dataset.region;
            if (!region) return;
            if (selected.has(region)) selected.delete(region);
            else selected.add(region);
            callback(selected);
          });
        });
      };

      const deps = {
        hydrateDevicesFromPresets: async () => calls.push(['hydrate-devices']),
        getDevices: () => devices,
        logDeviceSession: async payload => {
          await delay(0);
          calls.push(['log', payload]);
          return { id: 'saved-device-session' };
        },
        getActiveDeviceSession: () => activeSession,
        startDeviceSession: async payload => {
          await delay(0);
          calls.push(['start', payload]);
          activeSession = { id: 'active-device' };
          return 'active-device';
        },
        ensureActiveDeviceTicker: () => calls.push(['ticker']),
        validateModeCoupling,
        renderBodySilhouette,
        bindBodySilhouette,
        navigate: route => calls.push(['navigate', route]),
        openLightSetup: () => calls.push(['open-light-setup']),
      };

      const blockedDeviceDialog = await deviceSessionModal.openDeviceSessionDialog('panel-coverage', deps);
      outcomes.unconfirmedFitzpatrickBlocksDeviceSession = blockedDeviceDialog === false
        && calls.some(call => call[0] === 'open-light-setup')
        && !calls.some(call => call[0] === 'hydrate-devices')
        && !document.querySelector('[aria-label="Log device session"]');
      state.importedData.sunDefaults = { fitzpatrick: 'III', completedAt: Date.now() };

      await deviceSessionModal.openDeviceSessionDialog('panel-coverage', deps);
      let overlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
      const modeButtons = overlay?.querySelectorAll('.dev-mode-btn') || [];
      const distance = overlay?.querySelector('#dev-session-distance');
      outcomes.dialogUsesLastSessionAndFiltersModes = !!overlay
        && overlay.querySelector('#dev-session-duration')?.value === '18'
        && overlay.querySelector('#dev-session-mode')?.value === 'red'
        && modeButtons.length === 3
        && !overlay.textContent.includes('Blocked')
        && !!overlay.querySelector('.body-region-test')
        && overlay.querySelector('#dev-session-eyes')?.checked === false
        && overlay.querySelector('#dev-session-area-hint')?.textContent.includes('Legs');

      overlay?.querySelector('.dev-mode-btn[data-mode="nir"]')?.click();
      outcomes.modeClickUpdatesHiddenInputAndAria = overlay?.querySelector('#dev-session-mode')?.value === 'nir'
        && overlay.querySelector('.dev-mode-btn[data-mode="nir"]')?.getAttribute('aria-checked') === 'true';

      if (distance) {
        const initialInches = Number(distance.value);
        overlay.querySelector('.dev-unit-btn[data-unit="cm"]')?.click();
        const convertedCm = Number(distance.value);
        overlay.querySelector('.dev-unit-btn[data-unit="in"]')?.click();
        outcomes.unitToggleConvertsBothDirections = distance.dataset.unit === 'in'
          && Math.abs(initialInches - 11.8) < 0.05
          && Math.abs(convertedCm - 30) < 0.05
          && overlay.querySelector('.dev-unit-btn[data-unit="in"]')?.getAttribute('aria-selected') === 'true';
      } else {
        outcomes.unitToggleConvertsBothDirections = false;
      }

      overlay?.querySelector('#dev-session-clear')?.click();
      overlay?.querySelector('#dev-session-save')?.click();
      outcomes.emptyRegionBlocksSave = !calls.some(call => call[0] === 'log')
        && overlay?.querySelector('#dev-session-area-hint')?.textContent.includes('Pick at least one region');
      overlay?.remove();

      activeSession = { id: 'already-running' };
      await deviceSessionModal.openDeviceSessionDialog('panel-coverage', deps);
      overlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
      overlay?.querySelector('#dev-session-start')?.click();
      await delay(20);
      outcomes.activeSessionBlocksNewTimer = !!overlay
        && document.body.contains(overlay)
        && !calls.some(call => call[0] === 'start');
      activeSession = null;
      overlay?.querySelector('#dev-session-start')?.click();
      const startPayload = await waitForCall('start');
      outcomes.startTimerUsesDefaultsAndNavigates = !!startPayload
        && startPayload.deviceId === 'panel-coverage'
        && startPayload.mode === 'red'
        && startPayload.bodyArea === 'legs'
        && startPayload.bodyAreas.includes('legs-front')
        && calls.some(call => call[0] === 'ticker')
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      await deviceSessionModal.openDeviceSessionDialog('panel-coverage', deps);
      overlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
      overlay.querySelector('#dev-session-duration').value = '7';
      overlay.querySelector('.dev-mode-btn[data-mode="combo"]')?.click();
      overlay.querySelector('#dev-session-save')?.click();
      const logPayload = await waitForCall('log');
      outcomes.saveSessionUsesModeDurationAndRegions = !!logPayload
        && logPayload.durationMin === 7
        && logPayload.mode === 'combo'
        && logPayload.bodyArea === 'legs'
        && Math.abs(logPayload.distanceCm - 30) < 0.1
        && logPayload.eyesProtected === false;
      outcomes.hydratesDevicesOnEachOpen = calls.filter(call => call[0] === 'hydrate-devices').length === 3;
    } finally {
      state.unitSystem = saved.unitSystem;
      state.importedData = saved.importedData;
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { deviceSessionUrl: moduleUrl('/js/light-device-session-modal.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light sessions view covers all-sessions modal refresh scroll and row events', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sessionsUrl }) => {
    const sessionsView = await import(sessionsUrl);
    const outcomes = {};
    const calls = [];
    const base = Date.UTC(2026, 5, 7, 12, 0);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const resetDeps = () => sessionsView.configureLightSessionsView({
      getSessions: () => [],
      getDeviceSessions: () => [],
      getDevices: () => [],
      renderSunSessionRow: () => '',
      openDeviceSessionDetail: () => {},
      deleteDeviceSession: () => {},
      renderDeviceSessionAIInline: () => '',
      channelDisplay: {},
      channelTier: () => 0,
      formatChannelUnit: () => '',
    });

    let sunSessions = [
      { id: 'sun-a', startedAt: base - 60000, endedAt: base, durationMin: 15, doses: { vitamin_d: 2 } },
      { id: 'sun-b', startedAt: base - 3600000, endedAt: base - 3000000, durationMin: 10, doses: { circadian: 2 } },
      { id: 'sun-active', startedAt: base + 1000, endedAt: null, durationMin: 0 },
    ];
    let deviceSessions = [
      { id: 'dev-a', deviceId: 'panel-a', startedAt: base - 120000, endedAt: base - 60000, durationMin: 12, distanceCm: 20, bodyArea: 'face', eyesProtected: true, doses: { pbm_red: 5 }, mode: 'red' },
      { id: 'dev-b', deviceId: 'missing-device', startedAt: base - 7200000, endedAt: base - 6900000, durationMin: 8, distanceCm: 30, bodyArea: 'torso', eyesProtected: false, doses: { pbm_nir: 3 } },
      { id: 'dev-active', deviceId: 'panel-a', startedAt: base + 2000, endedAt: null, durationMin: 0 },
    ];

    try {
      sessionsView.configureLightSessionsView({
        getSessions: () => sunSessions,
        getDeviceSessions: () => deviceSessions,
        getDevices: () => [{
          id: 'panel-a',
          brand: 'PanelCo',
          model: 'Red 900',
          modes: [{ id: 'red', label: 'Red only', default: true }, { id: 'nir', label: 'NIR' }],
        }],
        channelDisplay: {
          pbm_red: { icon: 'R', label: 'Red', what: 'Red light' },
          pbm_nir: { icon: 'N', label: 'NIR', what: 'Near infrared' },
        },
        channelTier: value => value > 0 ? 2 : 0,
        formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
        renderSunSessionRow: sess => `<div class="sun-session light-session-row light-session-sun" data-id="${sess.id}" role="button" tabindex="0" aria-label="Sun ${sess.id}">
          <div class="sun-session-head"><span class="sun-session-date">${sess.id}</span></div>
        </div>`,
        openDeviceSessionDetail: id => calls.push(['detail', id]),
        deleteDeviceSession: id => calls.push(['delete', id]),
        renderDeviceSessionAIInline: sess => `<span class="ai-inline">AI ${sess.id}</span>`,
      });

      const inlineHost = document.createElement('div');
      inlineHost.innerHTML = sessionsView.renderUnifiedSessionsList();
      sessionsView.installLightSessionsActionDelegates(inlineHost);
      // Active sessions are pinned elsewhere, so history sees four completed
      // rows (2 sun + 2 device) and caps the inline list to the first three.
      const inlineRows = inlineHost.querySelectorAll('.sun-session');
      outcomes.inlineListCapsAndShowsMore = inlineRows.length === 3
        && inlineHost.textContent.includes('View all 4 sessions')
        && !!inlineHost.querySelector('.light-sessions-list-unified');
      outcomes.inlineListUsesDelegatedActions = !!inlineHost.querySelector('[data-light-sessions-action="show-all"]')
        && !inlineHost.innerHTML.includes('onclick=')
        && !inlineHost.innerHTML.includes('onkeydown=');

      sessionsView._openAllSessionsModal();
      let overlay = document.querySelector('.light-sessions-modal-overlay');
      if (overlay) sessionsView.installLightSessionsActionDelegates(overlay);
      outcomes.modalSummaryCountsBothKinds = overlay?.textContent.includes('All sessions (4)') === true
        && overlay?.textContent.includes('2 outdoor · 2 device') === true
        && overlay?.querySelectorAll('.sun-session').length === 4;

      const devADelete = overlay?.querySelector('.light-session-device[data-id="dev-a"] .sun-session-delete');
      devADelete?.click();
      outcomes.historyRowsLeaveDeletionToDetail = !devADelete
        && document.body.contains(overlay)
        && !calls.some(call => call[0] === 'delete');

      deviceSessions = [
        ...deviceSessions,
        { id: 'dev-c', deviceId: 'panel-a', startedAt: base + 3000, endedAt: base + 6000, durationMin: 5, distanceCm: 18, bodyArea: 'hands', eyesProtected: true, doses: { pbm_red: 9 }, mode: 'nir' },
      ];
      window.dispatchEvent(new Event('labcharts-ai-verdict-updated'));
      await delay(0);
      overlay = document.querySelector('.light-sessions-modal-overlay');
      outcomes.aiVerdictEventRefreshesOpenModal = overlay?.textContent.includes('All sessions (5)') === true
        && overlay?.textContent.includes('NIR') === true;

      const body = overlay?.querySelector('.light-sessions-modal-body');
      outcomes.modalWheelBodyExists = !!body;
      const wheelPrevented = body
        ? body.dispatchEvent(new WheelEvent('wheel', {
            deltaY: 120,
            cancelable: true,
            bubbles: true,
          })) === false
        : false;
      outcomes.modalWheelIsHandled = outcomes.modalWheelBodyExists && wheelPrevented;

      overlay?.querySelector('.light-session-device[role="button"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await delay(0);
      outcomes.deviceRowClickClosesModal = !document.body.contains(overlay)
        && calls.some(call => call[0] === 'detail');

      sessionsView._openAllSessionsModal();
      overlay = document.querySelector('.light-sessions-modal-overlay');
      if (overlay) sessionsView.installLightSessionsActionDelegates(overlay);
      const keyRow = overlay?.querySelector('.light-session-device[role="button"]');
      keyRow?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await delay(0);
      outcomes.deviceRowKeyboardClosesModal = !document.body.contains(overlay);
    } finally {
      resetDeps();
      document.querySelectorAll('.light-sessions-modal-overlay').forEach(el => el.remove());
    }

    return outcomes;
  }, { sessionsUrl: moduleUrl('/js/light-sessions-view.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('glass transmission modal covers denied measurement fallback and close cleanup', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ modalsUrl }) => {
    const modals = await import(modalsUrl);
    const outcomes = {};
    const savedMediaDevices = navigator.mediaDevices;
    const saved = [];
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } },
      });
      await modals.openGlassTransmission({ roomId: 'window' }, {
        saveMeasurement: async (kind, value, meta) => saved.push({ kind, value, meta }),
      });
      const overlay = document.querySelector('[aria-label="Glass transmission test"]')?.closest('.modal-overlay');
      outcomes.glassModalStartsDisabled = !!overlay
        && overlay.querySelector('#glass-save')?.disabled === true
        && overlay.querySelector('#glass-result')?.textContent === '';
      overlay?.querySelector('#glass-measure-inside')?.click();
      overlay?.querySelector('#glass-measure-outside')?.click();
      await delay(20);
      outcomes.deniedReadingsMarkBothSteps = overlay?.querySelector('#glass-reading-inside')?.textContent === 'denied'
        && overlay?.querySelector('#glass-reading-outside')?.textContent === 'denied';
      outcomes.deniedReadingsDoNotEnableSave = overlay?.querySelector('#glass-save')?.disabled === true
        && saved.length === 0;
      modals.closeGlassTransmission();
      outcomes.closeGlassRemovesOverlay = !document.body.contains(overlay);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      try { modals.closeGlassTransmission(); } catch (_) {}
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, { modalsUrl: moduleUrl('/js/light-tool-camera-modals.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
