import { createBlankPage } from '../helpers/browser-blank-page.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path:string) => `${path}?dashboardWidgetsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

const openBlankPage = createBlankPage({
  path: "/dashboard-widgets-browser-coverage", status: 200, body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
});

test('dashboard widgets browser coverage exercises registry persistence and visibility', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ widgetsUrl, profileUrl, stateUrl }) => {
    const [widgetsModule, profileModule, stateModule] = await Promise.all([
      ((import(widgetsUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/dashboard-widgets.js"), "createDashboardWidgetRegistry" | "dashboardBiometricSelectionKey" | "DASHBOARD_WIDGET_SOURCE_ORDER" | "DASHBOARD_MANUAL_BIOMETRIC_METRICS"> >),
      ((import(profileUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/profile.js"), "profileStorageKey"> >),
      ((import(stateUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/state.js"), "state"> >),
    ]);
    const outcomes:Record<string,unknown> = {};
    const { state } = stateModule;
    const originalProfile = state.currentProfile;
    const originalSex = state.profileSex;
    const calls:unknown[][] = [];
    const renderers = new Proxy({
      renderFocusCard: () => {
        calls.push(['render', 'focus']);
        return '<section data-widget-body="focus">Focus ready</section>';
      },
      renderDashboardWearableTilesWidget: (ctx:unknown) => {
        calls.push(['render', 'wearables', (ctx as {label?:unknown}|null|undefined)?.label || '']);
        return '<section data-widget-body="wearables">Wearables ready</section>';
      },
      renderDashboardBioAgeWidget: () => {
        calls.push(['render', 'bio-age']);
        return '';
      },
    }, {
      get(target, prop) {
        if (prop in target) return (target as unknown as Record<PropertyKey,unknown>)[prop];
        return (ctx:unknown) => {
          calls.push(['render', String(prop), (ctx as {label?:unknown}|null|undefined)?.label || '']);
          return `<section data-widget-body="${String(prop)}">${String(prop)}</section>`;
        };
      },
    });
    let organizeMode = false;
    const markerDefinitions:unknown[][] = [];
    const registry = widgetsModule.createDashboardWidgetRegistry(renderers, {
      isOrganizeMode: () => organizeMode,
      getDashboardMarkerWidgetDefinition: (id:unknown, ctx:unknown) => {
        markerDefinitions.push([id, (ctx as {label?:unknown}|null|undefined)?.label || '']);
        if (id !== 'marker_lipids.apob') return null;
        return {
          id,
          source: 'Labs',
          title: 'ApoB',
          description: 'Single marker',
          size: 'half',
          customMarkerWidget: true,
          render: (nextCtx:unknown) => {
            calls.push(['render', id, (nextCtx as {label?:unknown}|null|undefined)?.label || '']);
            return (nextCtx as {markerBody?:unknown}|null|undefined)?.markerBody || '';
          },
        };
      },
    });

    state.currentProfile = 'coverageProfile';
    state.profileSex = 'male';
    const widgetKeyPrefix = profileModule.profileStorageKey(state.currentProfile, 'dashboardWidgetsV');
    const biometricKey = profileModule.profileStorageKey(state.currentProfile, 'dashboardBiometricMetricsV1');
    const findWidgetKey = () => Object.keys(localStorage).find(key => key.startsWith(widgetKeyPrefix)) || '';
    const removeWidgetKeys = () => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(widgetKeyPrefix)) localStorage.removeItem(key);
      }
    };
    removeWidgetKeys();
    localStorage.removeItem(biometricKey);

    try {
      outcomes.biometricSelectionKeyIsProfileScoped =
        widgetsModule.dashboardBiometricSelectionKey() === biometricKey;

      const maleFixedIds = registry.getAvailableDashboardFixedWidgetIds();
      state.profileSex = 'female';
      const femaleFixedIds = registry.getAvailableDashboardFixedWidgetIds();
      state.profileSex = 'male';
      outcomes.fixedWidgetAvailabilityRespectsProfileSex =
        !maleFixedIds.includes('cycle')
        && femaleFixedIds.includes('cycle')
        && maleFixedIds.includes('focus')
        && maleFixedIds.includes('wearables')
        && maleFixedIds.includes('nutrition')
        && maleFixedIds.includes('nutrition-fuel-mix')
        && maleFixedIds.includes('light-live-session');

      const defaultPrefs = registry.getDashboardWidgetPrefs();
      outcomes.defaultPrefsPrioritizeDefaultsAndHideNonDefaults =
        defaultPrefs.order[0]! === 'biology-score-biologicalCoherence'
        && defaultPrefs.order[1]! === 'focus'
        && defaultPrefs.order.includes('bio-age')
        && !defaultPrefs.order.includes('cycle')
        && defaultPrefs.hidden.includes('insights')
        && defaultPrefs.hidden.includes('genome')
        && defaultPrefs.hidden.includes('light-live-session')
        && defaultPrefs.hidden.includes('nutrition-fuel-mix')
        && !defaultPrefs.hidden.includes('nutrition')
        && !defaultPrefs.hidden.includes('focus')
        && !defaultPrefs.hidden.includes('biology-score-biologicalCoherence');

      outcomes.markerWidgetIdsRoundTripOnlySafeMarkerIds =
        registry.dashboardMarkerWidgetId('lipids.apob') === 'marker_lipids.apob'
        && registry.dashboardMarkerWidgetId('bad-id') === ''
        && registry.dashboardMarkerWidgetId('__proto__') === ''
        && registry.dashboardMarkerIdFromWidgetId('marker_lipids.apob') === 'lipids.apob'
        && registry.dashboardMarkerIdFromWidgetId('marker_bad-id') === ''
        && registry.isDashboardMarkerWidgetId('marker_lipids.apob')
        && !registry.isDashboardMarkerWidgetId('wearables');

      registry.saveDashboardWidgetPrefs({
        order: ['wearables', 'marker_lipids.apob', 'unknown', 'focus', 'marker_bad-id'],
        hidden: ['focus', 'focus', 'unknown', 'marker_lipids.apob', 'marker_bad-id'],
      });
      const widgetKey = findWidgetKey();
      const savedPrefs = JSON.parse(localStorage.getItem(widgetKey) || '{}') as {order?:unknown;hidden?:unknown};
      const restoredPrefs = registry.getDashboardWidgetPrefs();
      outcomes.savePrefsDropsUnknownsDedupesHiddenAndAppendsFixedIds =
        widgetKey.startsWith(widgetKeyPrefix)
        && Array.isArray(savedPrefs.order)
        && Array.isArray(savedPrefs.hidden)
        && savedPrefs.order[0]! === 'wearables'
        && savedPrefs.order[1]! === 'marker_lipids.apob'
        && savedPrefs.order[2]! === 'focus'
        && savedPrefs.order.includes('bio-age')
        && !savedPrefs.order.includes('unknown')
        && !savedPrefs.order.includes('marker_bad-id')
        && savedPrefs.hidden.join('|') === 'focus|marker_lipids.apob'
        && restoredPrefs.order.join('|') === savedPrefs.order.join('|')
        && restoredPrefs.hidden.includes('marker_lipids.apob');

      localStorage.setItem(widgetKey, '{bad json');
      const fallbackAfterBadJson = registry.getDashboardWidgetPrefs();
      outcomes.malformedPrefsFallBackToDefaultPrefs =
        fallbackAfterBadJson.order[0]! === 'biology-score-biologicalCoherence'
        && fallbackAfterBadJson.order[1]! === 'focus'
        && fallbackAfterBadJson.hidden.includes('insights');

      localStorage.setItem(widgetKey, JSON.stringify({
        order: ['marker_lipids.apob', 'wearables', 17, 'bad-id'],
        hidden: ['marker_lipids.apob', 'unknown', 'supplements'],
      }));
      const migratedPrefs = registry.getDashboardWidgetPrefs();
      outcomes.loadedPrefsKeepValidMarkersAppendMissingFixedAndHideNewNonDefaults =
        migratedPrefs.order[0]! === 'marker_lipids.apob'
        && migratedPrefs.order[1]! === 'wearables'
        && migratedPrefs.order.includes('focus')
        && !migratedPrefs.order.includes('bad-id')
        && migratedPrefs.hidden.includes('marker_lipids.apob')
        && migratedPrefs.hidden.includes('supplements')
        && migratedPrefs.hidden.includes('insights')
        && !migratedPrefs.hidden.includes('unknown');

      const focusDef = registry.getDashboardWidgetDefinition('focus', { label: 'definition' });
      const markerDef = registry.getDashboardWidgetDefinition('marker_lipids.apob', { label: 'definition' });
      state.profileSex = 'male';
      const unavailableCycle = registry.getDashboardWidgetDefinition('cycle');
      state.profileSex = 'female';
      const availableCycle = registry.getDashboardWidgetDefinition('cycle');
      state.profileSex = 'male';
      outcomes.definitionsCoverFixedUnavailableAndCustomMarkerWidgets =
        (focusDef as {title?:unknown}|null|undefined)?.title === 'Current Focus'
        && (markerDef as {customMarkerWidget?:unknown}|null|undefined)?.customMarkerWidget === true
        && markerDefinitions.some(call => call.join('|') === 'marker_lipids.apob|definition')
        && unavailableCycle === null
        && (availableCycle as {id?:unknown}|null|undefined)?.id === 'cycle'
        && registry.getDashboardWidgetDefinition('marker_bad-id') === null;

      const orderedDefs = registry.getOrderedDashboardWidgets({
        order: ['marker_lipids.apob', 'focus', 'missing'],
        hidden: [],
      }, { label: 'ordered' });
      outcomes.orderedWidgetsFilterMissingDefinitionsAndKeepMarkers =
        (orderedDefs as {id?:unknown}[]).map(def => def.id).join('|') === 'marker_lipids.apob|focus';

      const hiddenPrefs = {
        order: ['focus', 'wearables', 'marker_lipids.apob', 'bio-age'],
        hidden: ['wearables'],
      };
      organizeMode = false;
      const visibleWithoutEmpty = registry.getVisibleDashboardWidgetEntries({
        label: 'visible',
        markerBody: '',
      }, hiddenPrefs);
      organizeMode = true;
      const visibleInOrganize = registry.getVisibleDashboardWidgetEntries({
        label: 'organize',
        markerBody: '',
      }, hiddenPrefs);
      const visibleWithExclude = registry.getVisibleDashboardWidgetEntries({
        label: 'exclude',
        markerBody: '<section data-widget-body="marker">Marker ready</section>',
      }, hiddenPrefs, { includeEmpty: true, excludeIds: new Set(['focus']) });
      outcomes.visibleEntriesHonorHiddenEmptyOrganizeAndExcludeOptions =
        (visibleWithoutEmpty as {def:{id?:unknown}}[]).map(entry => entry.def.id).join('|') === 'focus'
        && (visibleInOrganize as {def:{id?:unknown}}[]).map(entry => entry.def.id).join('|') === 'focus|marker_lipids.apob|bio-age'
        && (visibleWithExclude as {def:{id?:unknown}}[]).map(entry => entry.def.id).join('|') === 'marker_lipids.apob|bio-age'
        && !calls.some(call => call[0]! === 'render' && call[1]! === 'wearables')
        && calls.some(call => call.join('|') === 'render|marker_lipids.apob|exclude');

      registry.resetDashboardWidgetPrefs();
      outcomes.resetPrefsRemovesProfileScopedStorage =
        localStorage.getItem(widgetKey) === null
        && widgetsModule.DASHBOARD_WIDGET_SOURCE_ORDER.join('|') === 'Labs|Biology Scores|Genome|Body|Light|Insight|Tools'
        && widgetsModule.DASHBOARD_MANUAL_BIOMETRIC_METRICS.join('|') === 'weight|bp_systolic|rhr';
    } finally {
      removeWidgetKeys();
      localStorage.removeItem(biometricKey);
      state.currentProfile = originalProfile;
      state.profileSex = originalSex;
    }

    return outcomes;
  }, {
    widgetsUrl: moduleUrl('/js/dashboard-widgets.js'),
    profileUrl: '/js/profile.js',
    stateUrl: '/js/state.js',
  });

  const expectedOutcomeKeys = [
    'biometricSelectionKeyIsProfileScoped',
    'fixedWidgetAvailabilityRespectsProfileSex',
    'defaultPrefsPrioritizeDefaultsAndHideNonDefaults',
    'markerWidgetIdsRoundTripOnlySafeMarkerIds',
    'savePrefsDropsUnknownsDedupesHiddenAndAppendsFixedIds',
    'malformedPrefsFallBackToDefaultPrefs',
    'loadedPrefsKeepValidMarkersAppendMissingFixedAndHideNewNonDefaults',
    'definitionsCoverFixedUnavailableAndCustomMarkerWidgets',
    'orderedWidgetsFilterMissingDefinitionsAndKeepMarkers',
    'visibleEntriesHonorHiddenEmptyOrganizeAndExcludeOptions',
    'resetPrefsRemovesProfileScopedStorage',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});

test('dashboard Light widgets share lazy initialization before rendering', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ renderersUrl }) => {
    const { createDashboardWidgetRenderers } = await ((import(renderersUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/dashboard-widget-renderers.js"), "createDashboardWidgetRenderers"> >);
    let loaded = false;
    let loadCalls = 0;
    let rerenderCalls = 0;
    let heroCalls = 0;
    let resolveLoad:(()=>void)|undefined;
    const pendingLoad = new Promise<void>(resolve => { resolveLoad = resolve; });
    const renderers = createDashboardWidgetRenderers({
      markerHasData: () => false,
      renderDashboardLightChannelPills: () => '<div>channels</div>',
      renderLightConditionsWidgetBody: () => '<div>conditions</div>',
      renderLightLiveSession: () => '<div>live session</div>',
      renderLightSessionLogActions: () => '<div>sessions</div>',
      getMobileDashboardMarkers: () => [],
      getMobileDashboardInsights: () => [],
      getMobileWearableTiles: () => [],
      formatMobileWearableValue: () => '',
      formatMobileWearableDelta: () => '',
      isLightSunUILoaded: () => loaded,
      loadLightSunUI: () => {
        loadCalls += 1;
        return pendingLoad.then(() => { loaded = true; });
      },
      rerenderDashboardFromWidgetChange: () => { rerenderCalls += 1; },
      renderLightTodayHero: () => {
        heroCalls += 1;
        return '<div>today</div>';
      },
      showRecommendations: () => {},
    });

    const todayBeforeLoad = renderers.renderDashboardLightTodayWidget();
    const first = renderers.renderDashboardLightConditionsWidget();
    const second = renderers.renderDashboardLightChannelsWidget();
    const third = renderers.renderDashboardLightSessionLogWidget();
    const fourth = renderers.renderDashboardLightLiveSessionWidget();
    const loadingStateIsShared =
      loadCalls === 1
      && [first, second, third, fourth].every(html => (html as string).includes('Loading Light &amp; Sun'))
      && (todayBeforeLoad as string).includes('Loading Light &amp; Sun')
      && heroCalls === 0;

    resolveLoad!();
    await pendingLoad;
    await Promise.resolve();
    await Promise.resolve();

    const readyToday = renderers.renderDashboardLightTodayWidget();
    const readyConditions = renderers.renderDashboardLightConditionsWidget();
    const readyLiveSession = renderers.renderDashboardLightLiveSessionWidget();
    return {
      visibleLightWidgetsShareOneLazyLoad: loadingStateIsShared && loadCalls === 1,
      successfulLazyLoadRerendersDashboardOnce: rerenderCalls === 1,
      initializedLightWidgetsRenderTheirRealBodies:
        (readyToday as string).includes('today')
        && (readyConditions as string).includes('conditions')
        && (readyLiveSession as string).includes('live session')
        && (heroCalls as number) === 1,
    };
  }, {
    renderersUrl: moduleUrl('/js/dashboard-widget-renderers.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('dashboard widget renderers browser coverage uses default wearable priority fallback', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ renderersUrl, mobileUrl, profileUrl, stateUrl }) => {
    const [renderersModule, mobileModule, profileModule, stateModule] = await Promise.all([
      ((import(renderersUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/dashboard-widget-renderers.js"), "createDashboardWidgetRenderers"> >),
      ((import(mobileUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/mobile-dashboard.js"), "formatMobileWearableValue" | "formatMobileWearableDelta"> >),
      ((import(profileUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/profile.js"), "profileStorageKey"> >),
      ((import(stateUrl) as Promise<unknown>) as Promise<Pick<typeof import("../../js/state.js"), "state"> >),
    ]);
    const { state } = stateModule;
    const outcomes:Record<string,unknown> = {};
    const originalProfile = state.currentProfile;
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    const originalUnitSystem = state.unitSystem;
    const profileId = 'dashboardRendererPriorityCoverage';
    const selectionKey = profileModule.profileStorageKey(profileId, 'dashboardBiometricMetricsV1');

    try {
      state.currentProfile = profileId;
      state.unitSystem = 'US';
      (state as {importedData:unknown}).importedData = {
        wearableSummary: {
          sources: { oura: { source: 'oura' } },
          metrics: {
            hrv_rmssd: { latest: 54, baseline: 48 },
            steps: { latest: 9200, baseline: 7000 },
            weight: { latest: 180 / 2.2046226218, baseline: 180 / 2.2046226218 },
          },
        },
        wearableConnections: {},
      };
      localStorage.removeItem(selectionKey);

      const renderers = renderersModule.createDashboardWidgetRenderers({
        markerHasData: () => true,
        renderDashboardLightChannelPills: () => '',
        renderLightConditionsWidgetBody: () => '',
        renderLightSessionLogActions: () => '',
        getMobileDashboardMarkers: () => [],
        getMobileDashboardInsights: () => [],
        getMobileWearableTiles: () => [],
        formatMobileWearableValue: mobileModule.formatMobileWearableValue,
        formatMobileWearableDelta: mobileModule.formatMobileWearableDelta,
        rerenderDashboardFromWidgetChange: () => {},
        showRecommendations: () => {},
      });

      const order = renderers.getDashboardBiometricMetricOrder();
      outcomes.defaultPriorityFallsBackToRegistryAndCanonicalMetrics =
        order[0]! === 'hrv_rmssd'
        && order.includes('steps')
        && order.includes('bp_systolic')
        && order.indexOf('steps') < order.indexOf('bp_systolic');

      outcomes.emptyMobileTilesFallBackToManualDefaultSelection =
        renderers.getDashboardBiometricSelection().join('|') === 'weight|bp_systolic|rhr';

      renderers.saveDashboardBiometricSelection(['weight']);
      const weightHtml = renderers.renderDashboardWearableTilesWidget();
      outcomes.usWeightTileDisplaysPounds =
        weightHtml.includes('<strong>180</strong>')
        && weightHtml.includes('<small>lb</small>')
        && !weightHtml.includes('<small>kg</small>');

      renderers.saveDashboardBiometricSelection(['hrv_rmssd', 'steps', 'bp_systolic']);
      const html = renderers.renderDashboardWearableTilesWidget();
      outcomes.savedSelectionRendersDataAndEmptyManualTiles =
        (html as string).includes('HRV')
        && (html as string).includes('Steps')
        && (html as string).includes('Blood pressure')
        && (html as string).includes('3 metrics selected');
    } finally {
      localStorage.removeItem(selectionKey);
      state.currentProfile = originalProfile;
      (state as {importedData:unknown}).importedData = originalImported;
      state.unitSystem = originalUnitSystem;
    }

    return outcomes;
  }, {
    renderersUrl: moduleUrl('/js/dashboard-widget-renderers.js'),
    mobileUrl: moduleUrl('/js/mobile-dashboard.js'),
    profileUrl: '/js/profile.js',
    stateUrl: '/js/state.js',
  });

  const expectedOutcomeKeys = [
    'defaultPriorityFallsBackToRegistryAndCanonicalMetrics',
    'emptyMobileTilesFallBackToManualDefaultSelection',
    'usWeightTileDisplaysPounds',
    'savedSelectionRendersDataAndEmptyManualTiles',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
