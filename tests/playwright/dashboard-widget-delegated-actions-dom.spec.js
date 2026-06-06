import { expect, test } from './coverage-fixture.js';

test('dashboard widget delegated actions cover organize, picker, biometrics, and body actions', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.navigate === 'function'
      && typeof window.toggleDashboardOrganizeMode === 'function'
      && typeof window.openDashboardWidgetPicker === 'function'
  );

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const dashboardWidgetsModule = await import('/js/dashboard-widgets.js');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const originalView = state.currentView;
    const biometricSelectionKey = dashboardWidgetsModule.dashboardBiometricSelectionKey();
    const savedFns = {
      showDetailModal: window.showDetailModal,
      navigate: window.navigate,
      triggerDNAFilePicker: window.triggerDNAFilePicker,
      openNoteEditor: window.openNoteEditor,
      deleteNote: window.deleteNote,
      syncWearableNow: window.syncWearableNow,
    };
    const hadFns = {};
    for (const name of Object.keys(savedFns)) {
      hadFns[name] = Object.prototype.hasOwnProperty.call(window, name);
    }
    const originalBiometricSelection = localStorage.getItem(biometricSelectionKey);
    let originalWearableSummary;
    let originalWearableConnections;
    let hadWearableSummary = false;
    let hadWearableConnections = false;
    let bodyActionHost;

    try {
      if (!window.getActiveData?.()?.dates?.length) {
        const resp = await fetch('data/demo-male.json');
        state.importedData = await resp.json();
        state.profileSex = 'male';
        state.profileDob = '1987-11-22';
        window.saveImportedData?.();
        window.buildSidebar?.();
      }

      window.closeDashboardWidgetPicker?.();
      window.toggleDashboardOrganizeMode?.(false);
      window.navigate?.('dashboard');
      await delay(100);

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

      window.openDashboardWidgetPicker?.();
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
      window.addDashboardBiometricMetric?.('rhr');
      window.navigate?.('dashboard');
      await delay(250);

      const biometricWidget = document.querySelector('.dashboard-widget[data-widget-id="wearables"]');
      const biometricWidgetRenders = !!biometricWidget;
      const biometricSurfaceHasNoInlineHandlers = !!biometricWidget
        && !biometricWidget.querySelector('.db-biometric-overview-actions [onclick], .db-biometric-overview-grid [onclick], .db-biometric-overview-grid [onkeydown]');
      let syncCalled = false;
      window.syncWearableNow = button => {
        syncCalled = button?.classList?.contains('db-biometric-sync-btn') === true;
      };
      const syncBtn = biometricWidget?.querySelector('[data-dashboard-widget-action="sync-biometric-now"]');
      syncBtn?.click();
      await delay(50);

      biometricWidget?.querySelector('[data-dashboard-widget-action="open-biometric-picker"]')?.click();
      await delay(100);
      const biometricPickerOpens = !!document.querySelector('.dashboard-biometric-picker');
      window.closeDashboardWidgetPicker?.();
      await delay(50);

      const bpCard = document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]');
      bpCard?.click();
      await delay(150);
      const manualBpFormOpens = !!document.getElementById('wl-bp-sys') && !!document.getElementById('wl-bp-dia');
      document.querySelector('.db-biometric-overview-grid .wearable-log-cancel')?.click();
      await delay(200);
      const wearableCancelClosesBpForm = !document.getElementById('wl-bp-sys')
        && !!document.querySelector('.db-biometric-overview-grid [data-dashboard-widget-action="open-biometric-manual-log"][data-dashboard-widget-id="bp_systolic"]');

      const removeRhr = document.querySelector('.db-biometric-overview-grid .db-biometric-remove[data-dashboard-widget-action="remove-biometric-metric"][data-dashboard-widget-id="rhr"]');
      removeRhr?.click();
      await delay(150);
      const selectedAfterRemove = JSON.parse(localStorage.getItem(biometricSelectionKey) || '[]');

      const bodyActionCalls = [];
      window.showDetailModal = id => bodyActionCalls.push(['detail', id]);
      window.navigate = route => bodyActionCalls.push(['navigate', route]);
      window.triggerDNAFilePicker = () => bodyActionCalls.push(['dna']);
      window.openNoteEditor = (scope, index) => bodyActionCalls.push(['note', index]);
      window.deleteNote = index => bodyActionCalls.push(['delete-note', index]);
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
      bodyActionHost?.remove();
      for (const [name, original] of Object.entries(savedFns)) {
        if (hadFns[name]) window[name] = original;
        else delete window[name];
      }
      if (typeof originalBiometricSelection === 'string') localStorage.setItem(biometricSelectionKey, originalBiometricSelection);
      else localStorage.removeItem(biometricSelectionKey);
      if (hadWearableSummary) state.importedData.wearableSummary = originalWearableSummary;
      else if (state.importedData) delete state.importedData.wearableSummary;
      if (hadWearableConnections) state.importedData.wearableConnections = originalWearableConnections;
      else if (state.importedData) delete state.importedData.wearableConnections;
      window.closeDashboardWidgetPicker?.();
      window.toggleDashboardOrganizeMode?.(false);
      if (originalView) window.navigate?.(originalView);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
