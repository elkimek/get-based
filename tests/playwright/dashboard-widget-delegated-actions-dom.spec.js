import { expect, test } from './coverage-fixture.js';

test('dashboard widget delegated actions cover organize, picker, biometrics, and body actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const [{ state }, dataModule, dashboardWidgetsModule, contextCardsRuntime, dashboardWidgetRuntime, wearablesRuntime, viewsModule, navModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/dashboard-widgets.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/dashboard-widget-runtime.js'),
      import('/js/wearables-runtime.js'),
      import('/js/views.js'),
      import('/js/nav.js'),
    ]);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, timeout = 5000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        if (predicate()) return true;
        await delay(25);
      }
      return false;
    };
    const originalView = state.currentView;
    const biometricSelectionKey = dashboardWidgetsModule.dashboardBiometricSelectionKey();
    const originalBiometricSelection = localStorage.getItem(biometricSelectionKey);
    let originalWearableSummary;
    let originalWearableConnections;
    let hadWearableSummary = false;
    let hadWearableConnections = false;
    let bodyActionHost;
    let previousContextCardsRuntime = null;
    let previousDashboardNoteActions = null;
    let previousDashboardWidgetRuntimeDeps = null;
    let previousWearablesBridge = null;

    try {
      if (!dataModule.getActiveData()?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        await dataModule.saveImportedData();
        navModule.buildSidebar();
      }

      viewsModule.closeDashboardWidgetPicker?.();
      viewsModule.toggleDashboardOrganizeMode?.(false);
      await viewsModule.navigate('dashboard');

      const customizeBtn = document.querySelector('.dashboard-sticky-actions [data-dashboard-widget-action="toggle-organize"]');
      customizeBtn?.click();
      await delay(100);

      const organizeWidgetChrome = document.querySelector('.dashboard-widget-chrome');
      const rendererInlineHandler = document.querySelector([
        '.dashboard-widget[data-widget-id="bio-age"] .db-hero-bio[onclick]',
        '.dashboard-widget[data-widget-id="spotlight"] .db-spotlight[onclick]',
        '.dashboard-widget[data-widget-id="quick-markers"] .db-quick-marker-tile[onclick]',
        '.dashboard-widget[data-widget-id="key-trends"] .db-key-trend-row[onclick]',
      ].join(', '));

      const addBtn = document.querySelector('.dashboard-sticky-actions [data-dashboard-widget-action="open-picker"]');
      addBtn?.click();
      await delay(100);
      let overlay = document.getElementById('dashboard-widget-picker-overlay');
      const pickerOpened = !!overlay;
      const pickerHasNoInlineHandlers = !!overlay && !overlay.querySelector('[onclick], [oninput], [ondragstart], [ondragover], [ondrop]');

      overlay?.querySelector('[data-dashboard-widget-action="close-picker"]')?.click();
      await delay(50);
      const pickerCloseRemovesOverlay = !document.getElementById('dashboard-widget-picker-overlay');

      viewsModule.openDashboardWidgetPicker?.();
      await delay(100);
      overlay = document.getElementById('dashboard-widget-picker-overlay');
      const markerSearch = document.getElementById('dashboard-marker-widget-search');
      const markerOptions = Array.from(document.querySelectorAll('.dashboard-marker-widget-option'));
      let markerSearchFiltersCards = !!markerSearch;
      if (markerSearch && markerOptions.length) {
        markerSearch.value = 'zzzz-no-marker-match';
        markerSearch.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(50);
        markerSearchFiltersCards = markerOptions.every(option => option.hidden)
          && document.getElementById('dashboard-marker-widget-empty')?.hidden === false;
      }

      overlay?.click();
      await delay(50);
      const backdropClosesPicker = !document.getElementById('dashboard-widget-picker-overlay');

      state.importedData = state.importedData || {};
      hadWearableSummary = Object.prototype.hasOwnProperty.call(state.importedData, 'wearableSummary');
      hadWearableConnections = Object.prototype.hasOwnProperty.call(state.importedData, 'wearableConnections');
      originalWearableSummary = state.importedData.wearableSummary;
      originalWearableConnections = state.importedData.wearableConnections;

      state.importedData.wearableConnections = {
        oura: {
          source: 'oura',
          connectedAt: '2026-01-01T00:00:00.000Z',
          lastSyncAt: Date.now() - (13 * 60 * 60 * 1000),
          coverageDays: 1,
          accessToken: 'test-token',
        },
      };
      state.importedData.wearableSummary = {
        summaryUpdatedAt: new Date().toISOString(),
        sources: {
          manual: { connectedSince: '2026-01-01T00:00:00.000Z', lastSyncAt: Date.now(), coverageDays: 1 },
          oura: { connectedSince: '2026-01-01T00:00:00.000Z', lastSyncAt: Date.now() - (13 * 60 * 60 * 1000), coverageDays: 1 },
        },
        metrics: {
          rhr: {
            primarySource: 'manual',
            latest: 62,
            latestDate: '2026-04-22',
            baseline: 60,
            baselineP25: 58,
            baselineP75: 62,
            rolling: { d7: 62, d30: 60, d90: 60 },
            trend30d: 'flat',
            weekly: [60, 61, 62],
          },
        },
      };
      localStorage.setItem(biometricSelectionKey, JSON.stringify(['bp_systolic', 'rhr']));
      viewsModule.addDashboardBiometricMetric?.('rhr');
      await viewsModule.navigate('dashboard');
      await delay(150);

      const biometricWidget = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
      const biometricWidgetRenders = !!biometricWidget;
      const biometricSurfaceHasNoInlineHandlers = !!biometricWidget
        && !biometricWidget.querySelector('.db-biometric-overview-actions [onclick], .db-biometric-overview-grid [onclick], .db-biometric-overview-grid [onkeydown]');
      let syncCalled = false;
      previousWearablesBridge = wearablesRuntime.configureWearablesModuleBridge({
        syncWearableNow: button => {
          syncCalled = button?.classList?.contains('db-biometric-sync-btn') === true;
        },
      });
      const syncBtn = biometricWidget?.querySelector('[data-dashboard-widget-action="sync-biometric-now"]');
      syncBtn?.click();
      await delay(50);

      biometricWidget?.querySelector('[data-dashboard-widget-action="open-biometric-picker"]')?.click();
      await delay(100);
      const biometricPickerOpens = !!document.querySelector('.dashboard-biometric-picker');
      viewsModule.closeDashboardWidgetPicker?.();
      await delay(50);

      const bpCard = document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]');
      bpCard?.click();
      const manualBpFormOpens = await waitFor(
        () => !!document.getElementById('wl-bp-sys') && !!document.getElementById('wl-bp-dia'),
      );
      document.querySelector('.db-biometric-overview-grid .wearable-log-cancel')?.click();
      const wearableCancelClosesBpForm = await waitFor(
        () => !document.getElementById('wl-bp-sys')
          && !!document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]'),
      );

      const removeRhr = document.querySelector('.db-biometric-overview-grid .db-biometric-remove[data-dashboard-widget-action="remove-biometric-metric"][data-dashboard-widget-id="rhr"]');
      removeRhr?.click();
      await delay(150);
      const selectedAfterRemove = JSON.parse(localStorage.getItem(biometricSelectionKey) || '[]');

      const bodyActionCalls = [];
      previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
        triggerDNAFilePicker: () => bodyActionCalls.push(['dna']),
      });
      previousDashboardNoteActions = dashboardWidgetRuntime.configureDashboardNoteActions({
        openNoteEditor: (scope, index) => bodyActionCalls.push(['note', index]),
        deleteNote: index => bodyActionCalls.push(['delete-note', index]),
      });
      previousDashboardWidgetRuntimeDeps = dashboardWidgetRuntime.configureDashboardWidgetRuntimeDeps({
        navigate: route => bodyActionCalls.push(['navigate', route]),
        showDetailModal: id => bodyActionCalls.push(['detail', id]),
      });
      bodyActionHost = document.createElement('div');
      bodyActionHost.innerHTML = `
        <button type="button" data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id="lipids_apoB">Marker</button>
        <button type="button" data-dashboard-widget-action="navigate" data-dashboard-widget-route="light">Light</button>
        <button type="button" data-dashboard-widget-action="trigger-dna-picker">DNA</button>
        <div role="button" tabindex="0" data-dashboard-widget-action="open-note-editor" data-dashboard-widget-index="2">
          Note
          <button type="button" data-dashboard-widget-action="delete-note" data-dashboard-widget-index="2">Delete</button>
        </div>
      `;
      document.body.appendChild(bodyActionHost);
      bodyActionHost.querySelector('[data-dashboard-widget-action="open-marker-detail"]')?.click();
      bodyActionHost.querySelector('[data-dashboard-widget-action="navigate"]')?.click();
      bodyActionHost.querySelector('[data-dashboard-widget-action="trigger-dna-picker"]')?.click();
      bodyActionHost.querySelector('[data-dashboard-widget-action="open-note-editor"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      bodyActionHost.querySelector('[data-dashboard-widget-action="delete-note"]')?.click();
      await delay(50);

      const organizingWidgets = document.querySelector('.dashboard-widgets.is-organizing');
      return {
        stickyControlsRender: !!customizeBtn,
        delegatedCustomizeEntersOrganizeMode: !!organizingWidgets,
        organizeModeUsesVisualOrder: !!organizingWidgets && getComputedStyle(organizingWidgets).gridAutoFlow === 'row',
        chromeHasNoInlineHandlers: !!organizeWidgetChrome
          && !document.querySelector('.dashboard-sticky-actions [onclick], .dashboard-organize-footer [onclick], .dashboard-widget-chrome [onclick], .dashboard-widget[ondragstart], .dashboard-widget[ondragover], .dashboard-widget[ondrop]'),
        moveAndHideActionsRender: !!document.querySelector('.dashboard-widget-tool[data-dashboard-widget-action="move-widget"][data-dashboard-widget-direction]')
          && !!document.querySelector('.dashboard-widget-tool[data-dashboard-widget-action="hide-widget"]'),
        markerBodiesHaveNoInlineHandlers: !rendererInlineHandler,
        markerBodiesRenderDelegatedDetailActions: !!document.querySelector('.dashboard-widget-body [data-dashboard-widget-action="open-marker-detail"][data-dashboard-widget-id]'),
        pickerOpened,
        pickerHasNoInlineHandlers,
        pickerCloseRemovesOverlay,
        markerSearchFiltersCards,
        backdropClosesPicker,
        biometricWidgetRenders,
        biometricSurfaceHasNoInlineHandlers,
        syncButtonRenders: !!syncBtn,
        syncClickCallsSyncWearableNow: syncCalled,
        biometricPickerOpens,
        emptyBpCardRenders: !!bpCard,
        manualBpFormOpens,
        wearableCancelClosesBpForm,
        removeMetricRenders: !!removeRhr,
        removeMetricUpdatesSelection: !selectedAfterRemove.includes('rhr'),
        bodyDelegateHandlesActions: bodyActionCalls.some(c => c[0] === 'detail' && c[1] === 'lipids_apoB')
          && bodyActionCalls.some(c => c[0] === 'navigate' && c[1] === 'light')
          && bodyActionCalls.some(c => c[0] === 'dna')
          && bodyActionCalls.some(c => c[0] === 'note' && c[1] === 2)
          && bodyActionCalls.some(c => c[0] === 'delete-note' && c[1] === 2),
      };
    } finally {
      if (previousContextCardsRuntime) contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      if (previousDashboardNoteActions) dashboardWidgetRuntime.configureDashboardNoteActions(previousDashboardNoteActions);
      if (previousDashboardWidgetRuntimeDeps) dashboardWidgetRuntime.configureDashboardWidgetRuntimeDeps(previousDashboardWidgetRuntimeDeps);
      if (previousWearablesBridge) wearablesRuntime.configureWearablesModuleBridge(previousWearablesBridge);
      bodyActionHost?.remove();
      if (typeof originalBiometricSelection === 'string') localStorage.setItem(biometricSelectionKey, originalBiometricSelection);
      else localStorage.removeItem(biometricSelectionKey);
      if (hadWearableSummary) state.importedData.wearableSummary = originalWearableSummary;
      else if (state.importedData) delete state.importedData.wearableSummary;
      if (hadWearableConnections) state.importedData.wearableConnections = originalWearableConnections;
      else if (state.importedData) delete state.importedData.wearableConnections;
      viewsModule.closeDashboardWidgetPicker?.();
      viewsModule.toggleDashboardOrganizeMode?.(false);
      if (originalView) viewsModule.navigate(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('dashboard widget state transitions cover layout, recommendations, and picker branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const { dashboardBiometricSelectionKey, dashboardWidgetStorageKey } = await import('/js/dashboard-widgets.js');
    const dashboardWidgetRuntime = await import('/js/dashboard-widget-runtime.js');
    const viewsModule = await import('/js/views.js');
    const recommendationRuntime = await import('/js/recommendations-runtime.js');
    const settingsRuntimeBridge = await import('/js/settings-runtime-bridge.js');
    const wearablesRuntime = await import('/js/wearables-runtime.js');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, timeout = 1500) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        if (predicate()) return true;
        await delay(25);
      }
      return false;
    };
    const calls = [];
    const demo = await (await fetch('/data/demo-male.json')).json();
    const profileId = `dashboard-ui-coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const catalog = {
      slots: {
        'body.sleepRecovery': {
          label: 'Sleep recovery support',
          freeActions: ['Shift training load earlier'],
        },
        'light.morningLight': {
          label: 'Morning light anchor',
          freeActions: ['Get outdoor light before screens'],
        },
        'lipids.apoB': {
          label: 'ApoB support',
          freeActions: ['Add soluble fiber at meals'],
        },
      },
    };
    const savedFns = {
      detectWearableTrendSlots: window.detectWearableTrendSlots,
      showDetailModal: window.showDetailModal,
    };
    const hadFns = {};
    for (const name of Object.keys(savedFns)) {
      hadFns[name] = Object.prototype.hasOwnProperty.call(window, name);
    }
    const originalState = {
      currentProfile: state.currentProfile,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      importedData: state.importedData,
      currentView: state.currentView,
    };
    const originalCachedCatalog = recommendationRuntime.getRecommendationsCatalogCache();
    let previousRecommendationBridge = null;
    let previousRecommendationRuntime = null;
    let previousSettingsBridge = null;
    let previousWearablesBridge = null;
    let previousDashboardWidgetRuntimeDeps = null;

    try {

    await (await import('/js/health-data-loader.js')).loadRecommendationsModule();
    state.currentProfile = profileId;
    state.profileSex = 'male';
    state.profileDob = '1988-03-14';
    state.importedData = demo;
    state.importedData.notes = [
      { date: '2026-05-03', text: 'Started dashboard coverage note with enough text to render preview state.' },
      { date: '2026-04-01', text: 'Earlier context note.' },
    ];
    state.importedData.healthGoals = [
      { text: 'Improve cholesterol, morning light, and recovery consistency', severity: 'high' },
    ];
    state.importedData.wearableConnections = {
      oura: {
        source: 'oura',
        connectedAt: '2026-01-01T00:00:00.000Z',
        accessToken: 'token',
        lastSyncAt: Date.now() - (18 * 60 * 60 * 1000),
        coverageDays: 20,
      },
    };
    state.importedData.wearableSummary = {
      summaryUpdatedAt: new Date().toISOString(),
      sources: {
        oura: { connectedSince: '2026-01-01T00:00:00.000Z', lastSyncAt: Date.now() - (18 * 60 * 60 * 1000), coverageDays: 20 },
      },
      metrics: {
        rhr: {
          primarySource: 'oura',
          latest: 68,
          latestDate: '2026-05-03',
          baseline: 60,
          baselineP25: 57,
          baselineP75: 63,
          rolling: { d7: 68, d30: 62, d90: 60 },
          trend30d: 'rising',
          weekly: [60, 62, 65, 68],
        },
        hrv: {
          primarySource: 'oura',
          latest: 42,
          latestDate: '2026-05-03',
          baseline: 55,
          rolling: { d7: 42, d30: 50, d90: 55 },
          trend30d: 'falling',
          weekly: [56, 52, 48, 42],
        },
      },
    };

    const widgetPrefsKey = dashboardWidgetStorageKey();
    const recSavedKey = profileStorageKey(profileId, 'recommendations-saved-v1');
    const recDismissedKey = profileStorageKey(profileId, 'recommendations-dismissed-v1');
    const biometricKey = dashboardBiometricSelectionKey();
    localStorage.removeItem(widgetPrefsKey);
    localStorage.removeItem(recSavedKey);
    localStorage.removeItem(recDismissedKey);
    localStorage.removeItem(biometricKey);

    previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
      isProductRecsEnabled: () => true,
      loadCatalog: async () => {
        await delay(10);
        return catalog;
      },
      renderRecommendationSection: async slotKey => `<div class="rec-detail-coverage">Options for ${slotKey}</div>`,
    });
    previousRecommendationRuntime = recommendationRuntime.configureRecommendationsRuntime({
      openChatPanel: prompt => calls.push(['chat', prompt]),
    });
    recommendationRuntime.setRecommendationsCatalogCache(null);
    window.detectWearableTrendSlots = () => [{
      slotKey: 'body.sleepRecovery',
      reason: 'Resting heart rate is elevated and HRV is below baseline.',
    }];
    window.showDetailModal = id => calls.push(['detail', id]);
    previousSettingsBridge = settingsRuntimeBridge.configureSettingsModuleBridge({
      openSettingsModal: panel => calls.push(['settings', panel]),
    });
    previousWearablesBridge = wearablesRuntime.configureWearablesModuleBridge({
      openWearableDetail: id => calls.push(['wearable-detail', id]),
      openManualLogForm: (id, event) => calls.push(['manual-log', id, event?.type || '']),
      syncWearableNow: button => calls.push(['sync', button?.classList?.contains('db-biometric-sync-btn') === true]),
    });

    const readPrefs = () => JSON.parse(localStorage.getItem(widgetPrefsKey) || '{"order":[],"hidden":[]}');
    const readJson = key => JSON.parse(localStorage.getItem(key) || '[]');
    const dashboardWidget = id => document.querySelector(`.dashboard-widget[data-widget-id="${id}"]`);

    viewsModule.navigate('dashboard');
    const recCardsHydrated = await waitFor(() =>
      document.querySelectorAll('.dashboard-widget[data-widget-id="recommendations"] .rec-next-card').length > 0
    );
    const firstRec = document.querySelector('.dashboard-widget[data-widget-id="recommendations"] .rec-next-card');
    const firstRecId = firstRec?.dataset.recId || '';
    firstRec?.querySelector('.dashboard-action-btn-primary')?.click();
    const recDetailModalOpens = await waitFor(() =>
      document.querySelector('#detail-modal.recommendation-detail-modal')?.textContent?.includes('Options for')
    );
    const firstRecButtons = Array.from(firstRec?.querySelectorAll('.dashboard-action-btn') || []);
    firstRecButtons.find(btn => btn.textContent?.trim() === 'Discuss')?.click();
    const discussPromptSent = calls.some(([kind, prompt]) =>
      kind === 'chat' && String(prompt).includes('general-information tip from getbased')
    );
    firstRecButtons.find(btn => btn.textContent?.trim() === 'Bookmark')?.click();
    await delay(100);
    const bookmarkStored = firstRecId && readJson(recSavedKey).includes(firstRecId);

    viewsModule.navigate('recommendations');
    const recommendationsPageRenders = await waitFor(() =>
      document.querySelectorAll('#recommendations-page .rec-next-card').length > 0
    );
    const dismissButton = Array.from(document.querySelectorAll('#recommendations-page .rec-next-card .dashboard-action-btn'))
      .find(btn => btn.textContent?.trim() === 'Hide');
    dismissButton?.click();
    await delay(100);
    const dismissStored = firstRecId && readJson(recDismissedKey).length > 0;
    viewsModule.dismissRecommendation?.(firstRecId, false);
    viewsModule.saveRecommendation?.(firstRecId, false);

    viewsModule.resetDashboardWidgets();
    viewsModule.navigate('dashboard');
    await waitFor(() => dashboardWidget('focus'));
    viewsModule.moveDashboardWidget('focus', 1);
    await delay(100);
    const movedOrder = readPrefs().order;
    const moveWidgetReordersPrefs = movedOrder.indexOf('spotlight') >= 0
      && movedOrder.indexOf('focus') > movedOrder.indexOf('spotlight');
    const beforeInvalidMove = JSON.stringify(readPrefs());
    viewsModule.moveDashboardWidget('missing-widget', 1);
    await delay(50);
    const invalidMoveNoops = JSON.stringify(readPrefs()) === beforeInvalidMove;

    viewsModule.hideDashboardWidget('focus');
    await delay(100);
    const hideWidgetUpdatesPrefs = readPrefs().hidden.includes('focus') && !dashboardWidget('focus');
    viewsModule.showDashboardWidget('focus');
    const showWidgetRestoresDom = await waitFor(() => !!dashboardWidget('focus') && !readPrefs().hidden.includes('focus'));

    viewsModule.clearDashboardWidgets();
    await delay(100);
    const clearWidgetsShowsEmptyState = !!document.querySelector('.dashboard-widget.is-empty .dashboard-widget-empty')
      && readPrefs().hidden.includes('focus')
      && readPrefs().hidden.includes('notes');
    viewsModule.showDashboardWidget('notes');
    const notesWidgetRenders = await waitFor(() =>
      dashboardWidget('notes')?.textContent?.includes('Started dashboard coverage note')
    );

    const beforeBadMarker = JSON.stringify(readPrefs());
    viewsModule.addDashboardMarkerWidget('not_real');
    await delay(50);
    const badMarkerNoops = JSON.stringify(readPrefs()) === beforeBadMarker;
    viewsModule.addDashboardMarkerWidget('lipids_apoB');
    const markerWidgetAdded = await waitFor(() => !!dashboardWidget('marker_lipids_apoB'));
    viewsModule.hideDashboardWidget('marker_lipids_apoB');
    await delay(100);
    const markerWidgetRemovedByHide = !readPrefs().order.includes('marker_lipids_apoB')
      && !readPrefs().hidden.includes('marker_lipids_apoB');

    const lensNavigateCalls = [];
    let addedFromLens = false;
    let removedFromLens = false;
    try {
      previousDashboardWidgetRuntimeDeps = dashboardWidgetRuntime.configureDashboardWidgetRuntimeDeps({
        navigate: route => {
          lensNavigateCalls.push(route);
          state.currentView = route;
        },
      });
      state.currentView = 'labs';
      viewsModule.addDashboardWidgetFromLens('alerts');
      addedFromLens = !readPrefs().hidden.includes('alerts')
        && lensNavigateCalls.includes('labs');
      viewsModule.removeDashboardWidgetFromLens('alerts');
      removedFromLens = readPrefs().hidden.includes('alerts')
        && lensNavigateCalls.filter(route => route === 'labs').length >= 2;
    } finally {
      if (previousDashboardWidgetRuntimeDeps) {
        dashboardWidgetRuntime.configureDashboardWidgetRuntimeDeps(previousDashboardWidgetRuntimeDeps);
        previousDashboardWidgetRuntimeDeps = null;
      }
    }
    state.currentView = 'dashboard';
    viewsModule.navigate('dashboard');
    await waitFor(() => dashboardWidget('focus') || document.querySelector('.dashboard-widget'));

    localStorage.setItem(biometricKey, JSON.stringify([]));
    viewsModule.addDashboardBiometricMetric('bp_systolic');
    await waitFor(() => readJson(biometricKey).includes('bp_systolic'));
    viewsModule.addDashboardBiometricWidget('rhr');
    await waitFor(() => readJson(biometricKey).includes('rhr'));
    const biometricSelectionAddsManualAndWearable = readJson(biometricKey).includes('bp_systolic')
      && readJson(biometricKey).includes('rhr');
    viewsModule.removeDashboardBiometricMetric('rhr');
    await delay(50);
    const biometricRemovePersists = !readJson(biometricKey).includes('rhr');
    viewsModule.openDashboardBiometricPicker();
    await waitFor(() => !!document.querySelector('.dashboard-biometric-picker'));
    const biometricSearch = document.getElementById('dashboard-biometric-widget-search');
    if (biometricSearch) {
      biometricSearch.value = 'zzzz-no-biometric';
      biometricSearch.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await delay(50);
    const biometricFilterShowsEmpty = document.getElementById('dashboard-biometric-widget-empty')?.hidden === false;
    document.querySelector('[data-dashboard-widget-action="connect-source"]')?.click();
    await delay(50);
    const connectSourceClosesPicker = calls.some(([kind, panel]) => kind === 'settings' && panel === 'wearables')
      && !document.getElementById('dashboard-widget-picker-overlay');

    viewsModule.resetDashboardWidgets();
    viewsModule.navigate('dashboard');
    await waitFor(() => dashboardWidget('focus') && dashboardWidget('spotlight'));
    viewsModule.toggleDashboardOrganizeMode(true);
    await waitFor(() => document.querySelector('.dashboard-widgets.is-organizing'));
    const dragEl = document.querySelector('[data-dashboard-widget-drag-id="focus"]');
    const dataTransfer = {
      value: '',
      setData(_type, value) { this.value = value; },
      getData() { return this.value; },
      setDragImage() { calls.push(['drag-image']); },
    };
    let preventCount = 0;
    viewsModule.startDashboardWidgetDrag({ dataTransfer, currentTarget: dragEl }, 'focus', dragEl);
    viewsModule.allowDashboardWidgetDrop({ preventDefault() { preventCount += 1; } });
    viewsModule.dropDashboardWidget({ dataTransfer, preventDefault() { preventCount += 1; } }, 'spotlight');
    await delay(100);
    const dragPrefs = readPrefs();
    const dragDropReordersPrefs = preventCount >= 2
      && dragPrefs.order.indexOf('focus') > dragPrefs.order.indexOf('spotlight');
    viewsModule.toggleDashboardOrganizeMode(false);

    return {
      recCardsHydrated,
      recDetailModalOpens,
      discussPromptSent,
      bookmarkStored,
      recommendationsPageRenders,
      dismissStored,
      moveWidgetReordersPrefs,
      invalidMoveNoops,
      hideWidgetUpdatesPrefs,
      showWidgetRestoresDom,
      clearWidgetsShowsEmptyState,
      notesWidgetRenders,
      badMarkerNoops,
      markerWidgetAdded,
      markerWidgetRemovedByHide,
      addedFromLens,
      removedFromLens,
      biometricSelectionAddsManualAndWearable,
      biometricRemovePersists,
      biometricFilterShowsEmpty,
      connectSourceClosesPicker,
      dragDropReordersPrefs,
    };
    } finally {
      if (previousDashboardWidgetRuntimeDeps) dashboardWidgetRuntime.configureDashboardWidgetRuntimeDeps(previousDashboardWidgetRuntimeDeps);
      viewsModule.closeDashboardWidgetPicker?.();
      viewsModule.toggleDashboardOrganizeMode?.(false);
      document.getElementById('dashboard-widget-picker-overlay')?.remove();
      state.currentProfile = originalState.currentProfile;
      state.profileSex = originalState.profileSex;
      state.profileDob = originalState.profileDob;
      state.importedData = originalState.importedData;
      state.currentView = originalState.currentView;
      if (previousRecommendationBridge) {
        recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      }
      if (previousRecommendationRuntime) {
        recommendationRuntime.configureRecommendationsRuntime(previousRecommendationRuntime);
      }
      if (previousSettingsBridge) {
        settingsRuntimeBridge.configureSettingsModuleBridge(previousSettingsBridge);
      }
      if (previousWearablesBridge) {
        wearablesRuntime.configureWearablesModuleBridge(previousWearablesBridge);
      }
      recommendationRuntime.setRecommendationsCatalogCache(originalCachedCatalog);
      for (const [name, original] of Object.entries(savedFns)) {
        if (hadFns[name]) window[name] = original;
        else delete window[name];
      }
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
