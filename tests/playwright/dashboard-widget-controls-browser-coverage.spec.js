import { expect, test } from './coverage-fixture.js';

const moduleUrl = path => `${path}?dashboardWidgetControlsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/dashboard-widget-controls-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/dashboard-widget-controls-browser-coverage', { waitUntil: 'load' });
}

test('dashboard widget controls browser coverage exercises delegates picker filtering and drag prefs', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ controlsUrl }) => {
    const [controlsModule, contextCardsRuntime, dashboardWidgetRuntime] = await Promise.all([
      import(controlsUrl),
      import('/js/context-cards-runtime.js'),
      import('/js/dashboard-widget-runtime.js'),
    ]);
    const outcomes = {};
    const fixture = document.getElementById('fixture');
    const saved = {
      navigate: window.navigate,
      openSettingsModal: window.openSettingsModal,
      syncWearableNow: window.syncWearableNow,
      openWearableDetail: window.openWearableDetail,
      openManualLogForm: window.openManualLogForm,
      showDetailModal: window.showDetailModal,
    };
    const calls = [];
    const previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      triggerDNAFilePicker: () => calls.push(['dna']),
    });
    const previousDashboardNoteActions = dashboardWidgetRuntime.configureDashboardNoteActions({
      openNoteEditor: (...args) => calls.push(['noteEditor', args.length, ...args.map(arg => arg ?? 'null')]),
      deleteNote: index => calls.push(['deleteNote', index]),
    });
    const clone = value => JSON.parse(JSON.stringify(value));
    let prefs = {
      order: ['summary', 'wearables', 'notes', 'light'],
      hidden: ['light'],
    };
    let selectedBiometrics = ['bp_systolic'];
    const fixedWidgets = [
      { id: 'summary', title: 'Summary <main>', description: 'Overview', source: 'Core', size: 'full' },
      { id: 'wearables', title: 'Biometrics', description: 'Manual and wearable metrics', source: 'Body', size: 'wide' },
      { id: 'notes', title: 'Notes', description: 'Recent notes', source: 'Context', size: 'half' },
      { id: 'light', title: 'Light Tools', description: 'Environment', source: 'Tools', size: 'half' },
    ];
    const activeData = {
      categories: {
        lipids: {
          label: 'Lipids',
          markers: {
            apob: {
              name: 'ApoB',
              unit: 'mg/dL',
              values: [80, 91],
              refMin: 60,
              refMax: 100,
            },
            empty: {
              name: 'Empty',
              unit: '',
              values: [null, null],
            },
            hidden: {
              name: 'Hidden',
              unit: '',
              values: [1],
              hidden: true,
            },
            'bad"id': {
              name: 'Unsafe',
              unit: '',
              values: [1],
            },
          },
        },
      },
    };
    const dashboardMarkerWidgetId = markerId => markerId && /^[a-zA-Z0-9_-]+$/.test(markerId) ? `marker_${markerId}` : '';
    const deps = {
      state: { currentView: 'dashboard' },
      getActiveData: () => activeData,
      getAvailableDashboardFixedWidgets: () => fixedWidgets,
      getAvailableDashboardFixedWidgetIds: () => fixedWidgets.map(def => def.id),
      getDashboardWidgetPrefs: () => prefs,
      saveDashboardWidgetPrefs: nextPrefs => {
        prefs = clone(nextPrefs);
        calls.push(['savePrefs', prefs.order.join(','), prefs.hidden.join(',')]);
      },
      resetDashboardWidgetPrefs: () => {
        prefs = { order: ['summary', 'wearables', 'notes', 'light'], hidden: [] };
        calls.push(['resetPrefs']);
      },
      dashboardMarkerWidgetId,
      dashboardMarkerIdFromWidgetId: widgetId => String(widgetId || '').startsWith('marker_') ? String(widgetId).slice(7) : '',
      isDashboardMarkerWidgetId: widgetId => String(widgetId || '').startsWith('marker_'),
      getDashboardMarkerById: (data, markerId) => {
        const [catKey, markerKey] = String(markerId || '').split('_');
        const marker = data.categories?.[catKey]?.markers?.[markerKey];
        return marker ? { marker, category: data.categories[catKey] } : null;
      },
      markerHasData: marker => Array.isArray(marker?.values) && marker.values.some(value => value !== null && value !== undefined),
      getLatestValueIndex: values => {
        for (let index = values.length - 1; index >= 0; index -= 1) {
          if (values[index] !== null && values[index] !== undefined) return index;
        }
        return -1;
      },
      getEffectiveRangeForDate: marker => ({ min: marker.refMin ?? null, max: marker.refMax ?? null }),
      canonicalMetric: metricId => ({
        weight: { sub: 'manual' },
        bp_systolic: { sub: 'blood pressure' },
        bp_diastolic: { sub: 'blood pressure' },
        sleep: { sub: 'wearable' },
      })[metricId] || null,
      getDashboardBiometricSelection: () => selectedBiometrics.slice(),
      saveDashboardBiometricSelection: next => {
        selectedBiometrics = next.slice();
        calls.push(['saveBiometrics', selectedBiometrics.join(',')]);
      },
      getDashboardBiometricMetricOrder: () => ['weight', 'bp_systolic', 'bp_diastolic', 'sleep'],
      getDashboardBiometricTile: metricId => ({
        weight: { id: 'weight', label: 'Weight', value: '170', unit: 'lb', change: 'stable' },
        bp_systolic: { id: 'bp_systolic', label: 'Systolic BP', value: '118', unit: 'mmHg', change: 'latest' },
        bp_diastolic: { id: 'bp_diastolic', label: 'Diastolic BP', value: '72', unit: 'mmHg', change: 'latest' },
        sleep: { id: 'sleep', label: 'Sleep', value: '7.5', unit: 'h', change: '+0.5h' },
      })[metricId] || null,
      rerenderDashboardFromWidgetChange: () => calls.push(['rerender']),
    };
    const originalRemoveItem = Storage.prototype.removeItem;

    try {
      window.navigate = route => calls.push(['navigate', route]);
      window.openSettingsModal = section => calls.push(['settings', section]);
      window.syncWearableNow = el => calls.push(['sync', el?.dataset.dashboardWidgetAction || '']);
      window.openWearableDetail = id => calls.push(['wearableDetail', id]);
      window.openManualLogForm = (id, event) => calls.push(['manualLog', id, event.type]);
      window.showDetailModal = id => calls.push(['markerDetail', id]);
      Storage.prototype.removeItem = function removeItem(key) {
        calls.push(['removeStorage', key]);
        return originalRemoveItem.call(this, key);
      };

      const escapedAttrs = controlsModule.dashboardWidgetActionAttrs('bad"action', {
        id: 'lipids_apob',
        quote: '" onmouseover="alert(1)',
        blank: '',
        missing: null,
      });
      fixture.innerHTML = `<button id="attr-btn" ${escapedAttrs} ${controlsModule.dashboardWidgetInputAttrs('filter"input')} ${controlsModule.dashboardWidgetDragAttrs('drag"widget')}>Attr</button>`;
      const attrButton = document.getElementById('attr-btn');
      outcomes.helperAttrsEscapeAndFilterDatasetValues =
        attrButton.dataset.dashboardWidgetAction === 'bad"action'
        && attrButton.dataset.dashboardWidgetId === 'lipids_apob'
        && attrButton.dataset.dashboardWidgetQuote === '" onmouseover="alert(1)'
        && !attrButton.hasAttribute('data-dashboard-widget-blank')
        && !attrButton.hasAttribute('onmouseover')
        && attrButton.dataset.dashboardWidgetInput === 'filter"input'
        && attrButton.dataset.dashboardWidgetDragId === 'drag"widget'
        && attrButton.dataset.dashboardWidgetDropId === 'drag"widget';

      const controls = controlsModule.createDashboardWidgetControls(deps);
      fixture.innerHTML = controls.renderDashboardControlButtons({ includeReset: true });
      fixture.querySelector('[data-dashboard-widget-action="toggle-organize"]').click();
      outcomes.controlButtonsDelegateToggleOrganize =
        controls.isOrganizeMode()
        && calls.some(call => call[0] === 'rerender')
        && fixture.textContent.includes('Add widget')
        && !!fixture.querySelector('[data-dashboard-widget-action="reset-widgets"]');

      const widgetHtml = controls.renderDashboardWidget({
        def: fixedWidgets[0],
        body: '<div class="summary-body">Ready</div>',
      }, prefs, 0, fixedWidgets);
      fixture.innerHTML = widgetHtml;
      const widget = fixture.querySelector('.dashboard-widget');
      outcomes.renderDashboardWidgetOrganizeModeAddsSafeToolsAndDragAttrs =
        widget?.classList.contains('is-organizing')
        && widget.getAttribute('draggable') === 'true'
        && widget.dataset.dashboardWidgetDragId === 'summary'
        && widget.querySelector('.dashboard-widget-title')?.textContent === 'Summary <main>'
        && !widget.querySelector('main')
        && widget.querySelectorAll('[data-dashboard-widget-action="move-widget"]').length === 2
        && widget.querySelector('[data-dashboard-widget-action="hide-widget"]')?.getAttribute('aria-label') === 'Hide Summary <main>';

      controls.openDashboardWidgetPicker();
      const picker = document.getElementById('dashboard-widget-picker-overlay');
      const markerSearch = document.getElementById('dashboard-marker-widget-search');
      const biometricSearch = document.getElementById('dashboard-biometric-widget-search');
      markerSearch.value = 'apob';
      markerSearch.dispatchEvent(new Event('input', { bubbles: true }));
      biometricSearch.value = 'sleep';
      biometricSearch.dispatchEvent(new Event('input', { bubbles: true }));
      const markerOptions = [...document.querySelectorAll('.dashboard-marker-widget-option')];
      const biometricOptions = [...document.querySelectorAll('.dashboard-biometric-widget-option')];
      outcomes.openPickerRendersAndFiltersMarkerAndBiometricOptions =
        !!picker
        && markerOptions.length === 1
        && markerOptions[0].textContent.includes('ApoB')
        && !markerOptions[0].hidden
        && biometricOptions.some(option => option.textContent.includes('Sleep') && !option.hidden)
        && biometricOptions.every(option => option.textContent.includes('Sleep') || option.hidden)
        && document.getElementById('dashboard-marker-widget-empty').hidden === true
        && !picker.querySelector('button[onclick]');

      markerOptions[0].click();
      outcomes.addMarkerWidgetDelegateUpdatesPrefsAndClosesPicker =
        prefs.order.includes('marker_lipids_apob')
        && !document.getElementById('dashboard-widget-picker-overlay')
        && calls.some(call => call[0] === 'savePrefs' && call[1].includes('marker_lipids_apob'))
        && calls.some(call => call[0] === 'rerender');

      controls.openDashboardBiometricPicker();
      const weightOption = [...document.querySelectorAll('.dashboard-biometric-widget-option')]
        .find(option => option.textContent.includes('Weight'));
      weightOption?.click();
      outcomes.addBiometricMetricDelegateSelectsMetricAndShowsWearables =
        selectedBiometrics.includes('weight')
        && prefs.order.includes('wearables')
        && !prefs.hidden.includes('wearables')
        && !document.getElementById('dashboard-widget-picker-overlay')
        && calls.some(call => call[0] === 'saveBiometrics' && call[1].includes('weight'));

      fixture.innerHTML = `
        <div id="detail-action" tabindex="0" ${controlsModule.dashboardWidgetActionAttrs('open-marker-detail', { id: 'lipids_apob' })}></div>
        <div id="bad-detail" ${controlsModule.dashboardWidgetActionAttrs('open-marker-detail', { id: 'bad"id' })}></div>
        <div id="nav-action" ${controlsModule.dashboardWidgetActionAttrs('navigate', { route: 'dashboard' })}></div>
        <div id="bad-nav" ${controlsModule.dashboardWidgetActionAttrs('navigate', { route: '../bad' })}></div>
        <div id="note-action" ${controlsModule.dashboardWidgetActionAttrs('open-note-editor', { index: 2 })}></div>
        <div id="note-new" ${controlsModule.dashboardWidgetActionAttrs('open-note-editor')}></div>
        <div id="delete-note" ${controlsModule.dashboardWidgetActionAttrs('delete-note', { index: 1 })}></div>
        <div id="manual-log" ${controlsModule.dashboardWidgetActionAttrs('open-biometric-manual-log', { id: 'weight' })}></div>
        <div id="wearable-detail" ${controlsModule.dashboardWidgetActionAttrs('open-biometric-detail', { id: 'sleep' })}></div>
        <div id="sync-action" ${controlsModule.dashboardWidgetActionAttrs('sync-biometric-now')}></div>
        <div id="dna-action" ${controlsModule.dashboardWidgetActionAttrs('trigger-dna-picker')}></div>
      `;
      document.getElementById('detail-action').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      document.getElementById('bad-detail').click();
      document.getElementById('nav-action').click();
      document.getElementById('bad-nav').click();
      document.getElementById('note-action').click();
      document.getElementById('note-new').click();
      document.getElementById('delete-note').click();
      document.getElementById('manual-log').click();
      document.getElementById('wearable-detail').click();
      document.getElementById('sync-action').click();
      document.getElementById('dna-action').click();
      outcomes.delegatedActionsRouteAndValidateTargets =
        calls.some(call => call.join('|') === 'markerDetail|lipids_apob')
        && !calls.some(call => call.join('|') === 'markerDetail|bad"id')
        && calls.some(call => call.join('|') === 'navigate|dashboard')
        && !calls.some(call => call.join('|') === 'navigate|../bad')
        && calls.some(call => call.join('|') === 'noteEditor|2|null|2')
        && calls.some(call => call.join('|') === 'noteEditor|0')
        && calls.some(call => call.join('|') === 'deleteNote|1')
        && calls.some(call => call.join('|') === 'manualLog|weight|click')
        && calls.some(call => call.join('|') === 'wearableDetail|sleep')
        && calls.some(call => call.join('|') === 'sync|sync-biometric-now')
        && calls.some(call => call.join('|') === 'dna');

      controls.toggleDashboardOrganizeMode(true);
      fixture.innerHTML = `
        <section id="drag-summary" data-dashboard-widget-drag-id="summary" data-dashboard-widget-drop-id="summary"></section>
        <section id="drop-notes" data-dashboard-widget-drop-id="notes"></section>
      `;
      const delegateDragStore = new Map();
      const delegateDataTransfer = {
        setData: (type, value) => delegateDragStore.set(type, value),
        getData: type => delegateDragStore.get(type) || '',
        setDragImage: (el, x, y) => calls.push(['delegateSetDragImage', el?.id || '', x, y]),
      };
      const dragStartEvent = new DragEvent('dragstart', { bubbles: true });
      Object.defineProperty(dragStartEvent, 'dataTransfer', { value: delegateDataTransfer });
      document.getElementById('drag-summary').dispatchEvent(dragStartEvent);
      const dragOverEvent = new DragEvent('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(dragOverEvent, 'dataTransfer', { value: delegateDataTransfer });
      document.getElementById('drop-notes').dispatchEvent(dragOverEvent);
      const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', { value: delegateDataTransfer });
      document.getElementById('drop-notes').dispatchEvent(dropEvent);
      const notesIndex = prefs.order.indexOf('notes');
      outcomes.dragDelegatesReorderPrefsOnlyInOrganizeMode =
        delegateDragStore.get('text/plain') === 'summary'
        && calls.some(call => call.join('|') === 'delegateSetDragImage|drag-summary|20|20')
        && dragOverEvent.defaultPrevented
        && dropEvent.defaultPrevented
        && prefs.order[notesIndex + 1] === 'summary'
        && prefs.order.filter(id => id === 'summary').length === 1
        && calls.some(call => call[0] === 'savePrefs');

      controls.clearDashboardWidgets();
      const cleared = prefs.hidden.length === fixedWidgets.length;
      controls.resetDashboardWidgets();
      outcomes.clearAndResetWidgetsPersistExpectedPrefs =
        cleared
        && prefs.hidden.length === 0
        && selectedBiometrics.includes('weight')
        && calls.some(call => call[0] === 'removeStorage')
        && controls.isOrganizeMode() === false;
    } finally {
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      dashboardWidgetRuntime.configureDashboardNoteActions(previousDashboardNoteActions);
      Storage.prototype.removeItem = originalRemoveItem;
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete window[key];
        else window[key] = value;
      }
      document.getElementById('dashboard-widget-picker-overlay')?.remove();
    }

    return outcomes;
  }, {
    controlsUrl: moduleUrl('/js/dashboard-widget-controls.js'),
  });

  const expectedOutcomeKeys = [
    'helperAttrsEscapeAndFilterDatasetValues',
    'controlButtonsDelegateToggleOrganize',
    'renderDashboardWidgetOrganizeModeAddsSafeToolsAndDragAttrs',
    'openPickerRendersAndFiltersMarkerAndBiometricOptions',
    'addMarkerWidgetDelegateUpdatesPrefsAndClosesPicker',
    'addBiometricMetricDelegateSelectsMetricAndShowsWearables',
    'delegatedActionsRouteAndValidateTargets',
    'dragDelegatesReorderPrefsOnlyInOrganizeMode',
    'clearAndResetWidgetsPersistExpectedPrefs',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
