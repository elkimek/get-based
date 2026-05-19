// dashboard-widgets.js - dashboard widget registry and persistence helpers

import { state } from './state.js';
import { safeMarkerId } from './utils.js';
import { profileStorageKey } from './profile.js';

// Views-owned renderers are injected; direct imports stay limited to lower-layer modules.
import { renderSupplementsSection } from './supplements.js';
import { renderMenstrualCycleSection } from './cycle.js';
import { renderProfileContextCards } from './context-cards.js';

const DASHBOARD_WIDGETS_VERSION = 10;

export const DASHBOARD_WIDGET_SOURCE_ORDER = ['Labs', 'Genome', 'Body', 'Light', 'Insight', 'Tools'];
export const DASHBOARD_WIDGET_DEFAULT_IDS = [
  'focus',
  'cycle',
  'spotlight',
  'quick-markers',
  'key-trends',
  'recommendations',
  'profile-context',
  'wearables',
  'bio-age',
];
export const DASHBOARD_MANUAL_BIOMETRIC_METRICS = ['weight', 'bp_systolic', 'rhr'];

function dashboardWidgetStorageKey() {
  return profileStorageKey(state.currentProfile || 'default', `dashboardWidgetsV${DASHBOARD_WIDGETS_VERSION}`);
}

export function dashboardBiometricSelectionKey() {
  return profileStorageKey(state.currentProfile || 'default', 'dashboardBiometricMetricsV1');
}

export function createDashboardWidgetRegistry(renderers, opts = {}) {
  const dashboardWidgets = [
    { id: 'bio-age', source: 'Labs', title: 'Biological Age', description: 'Age-derived biological readout', size: 'half', render: renderers.renderDashboardBioAgeWidget },
    { id: 'focus', source: 'Insight', title: 'Current Focus', description: 'One synthesized read on the latest data', size: 'half', render: () => renderers.renderFocusCard() },
    { id: 'recommendations', source: 'Insight', title: 'Recommended Next Steps', description: 'Top data-linked actions across lenses', size: 'half', render: renderers.renderDashboardRecommendationsWidget },
    { id: 'spotlight', source: 'Labs', title: 'Current Priority', description: 'Highest-priority marker with the reason it was selected', size: 'half', render: renderers.renderDashboardSpotlightWidget },
    { id: 'wearables', source: 'Body', title: 'Biometrics Overview', description: 'User-selected body signal tiles', size: 'full', render: renderers.renderDashboardWearableTilesWidget },
    { id: 'quick-markers', source: 'Labs', title: 'Quick Markers', description: 'Pinned and priority-ranked marker tiles', size: 'full', render: renderers.renderDashboardQuickMarkersWidget },
    { id: 'insights', source: 'Insight', title: 'AI Insights', description: 'Top trend and range reads', size: 'half', render: renderers.renderDashboardInsightsListWidget },
    { id: 'genome', source: 'Genome', title: 'Genetic Modifiers', description: 'Actionable SNP context relevant to labs and goals', size: 'half', render: renderers.renderDashboardGenomeWidget },
    { id: 'alerts', source: 'Labs', title: 'Needs Attention', description: 'Sudden changes and critical out-of-range markers', size: 'half', render: renderers.renderDashboardAlertsWidget },
    { id: 'correlation', source: 'Tools', title: 'Correlations', description: 'Highest linked marker pairs', size: 'half', render: renderers.renderDashboardCorrelationWidget },
    { id: 'light-today', source: 'Light', title: 'Light Today', description: "Today's light synthesis across sun, devices, and environment", render: renderers.renderDashboardLightTodayWidget },
    { id: 'light-conditions-now', source: 'Light', title: 'Conditions Now', description: 'Current outdoor UV, atmosphere, and air quality', size: 'full', render: renderers.renderDashboardLightConditionsWidget },
    { id: 'light-session-log', source: 'Light', title: 'Log Sessions', description: 'Start sun or therapy sessions quickly', size: 'third', render: renderers.renderDashboardLightSessionLogWidget },
    { id: 'light-channels', source: 'Light', title: 'Light Channels', description: 'Seven-day rhythm across light biology channels', size: 'half', render: renderers.renderDashboardLightChannelsWidget },
    { id: 'profile-context', source: 'Insight', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', render: () => renderProfileContextCards() },
    { id: 'cycle', source: 'Body', title: 'Cycle', description: 'Menstrual cycle context', size: 'half', isAvailable: () => state.profileSex === 'female', render: (ctx) => ctx ? renderMenstrualCycleSection(ctx.data, { variant: 'dashboard', showHeader: false }) : '' },
    { id: 'supplements', source: 'Body', title: 'Supplements & Meds', description: 'Supplements and medication timeline', render: () => renderSupplementsSection() },
    { id: 'key-trends', source: 'Labs', title: 'Key Trends', description: 'Auto-selected markers from your current range', render: renderers.renderDashboardKeyTrendsWidget },
    { id: 'notes', source: 'Labs', title: 'Notes', description: 'Timeline notes linked to your data', render: renderers.renderDashboardNotesWidget },
  ];

  const isOrganizeMode = opts.isOrganizeMode || (() => false);
  const getDashboardMarkerWidgetDefinition = opts.getDashboardMarkerWidgetDefinition || (() => null);

  function isDashboardFixedWidgetAvailable(def) {
    return !!def && (typeof def.isAvailable !== 'function' || def.isAvailable());
  }

  function getAvailableDashboardFixedWidgets() {
    return dashboardWidgets.filter(isDashboardFixedWidgetAvailable);
  }

  function getAvailableDashboardFixedWidgetIds() {
    return getAvailableDashboardFixedWidgets().map(w => w.id);
  }

  function dashboardMarkerWidgetId(markerId) {
    return safeMarkerId(markerId) ? `marker_${markerId}` : '';
  }

  function dashboardMarkerIdFromWidgetId(widgetId) {
    if (typeof widgetId !== 'string' || !widgetId.startsWith('marker_')) return '';
    const markerId = widgetId.slice('marker_'.length);
    return safeMarkerId(markerId) ? markerId : '';
  }

  function isDashboardMarkerWidgetId(widgetId) {
    return !!dashboardMarkerIdFromWidgetId(widgetId);
  }

  function isKnownDashboardWidgetId(id) {
    return getAvailableDashboardFixedWidgetIds().includes(id) || isDashboardMarkerWidgetId(id);
  }

  function getDashboardDefaultWidgetPrefs() {
    const fixedIds = getAvailableDashboardFixedWidgetIds();
    const order = [
      ...DASHBOARD_WIDGET_DEFAULT_IDS,
      ...fixedIds.filter(id => !DASHBOARD_WIDGET_DEFAULT_IDS.includes(id)),
    ].filter(id => fixedIds.includes(id));
    const hidden = fixedIds.filter(id => !DASHBOARD_WIDGET_DEFAULT_IDS.includes(id));
    return { order, hidden };
  }

  function getDashboardWidgetPrefs() {
    const fallback = getDashboardDefaultWidgetPrefs();
    try {
      const raw = JSON.parse(localStorage.getItem(dashboardWidgetStorageKey()));
      if (!raw || !Array.isArray(raw.order) || !Array.isArray(raw.hidden)) return fallback;
      const fixedIds = getAvailableDashboardFixedWidgetIds();
      const rawOrder = raw.order.filter(id => typeof id === 'string');
      const rawOrderSet = new Set(rawOrder);
      const order = rawOrder.filter(isKnownDashboardWidgetId);
      for (const id of fixedIds) if (!order.includes(id)) order.push(id);
      const hidden = raw.hidden.filter(id => fixedIds.includes(id) || isDashboardMarkerWidgetId(id));
      for (const id of fixedIds) {
        if (!DASHBOARD_WIDGET_DEFAULT_IDS.includes(id) && !rawOrderSet.has(id) && !hidden.includes(id)) hidden.push(id);
      }
      return {
        order,
        hidden,
      };
    } catch (e) {
      return fallback;
    }
  }

  function saveDashboardWidgetPrefs(prefs) {
    const fixedIds = getAvailableDashboardFixedWidgetIds();
    const order = (prefs.order || []).filter(isKnownDashboardWidgetId);
    for (const id of fixedIds) if (!order.includes(id)) order.push(id);
    const hidden = [...new Set(prefs.hidden || [])].filter(id => fixedIds.includes(id) || isDashboardMarkerWidgetId(id));
    localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({ order, hidden }));
  }

  function getDashboardWidgetDefinition(id, ctx = null) {
    const fixed = dashboardWidgets.find(w => w.id === id);
    if (fixed) return isDashboardFixedWidgetAvailable(fixed) ? fixed : null;
    return getDashboardMarkerWidgetDefinition(id, ctx);
  }

  function getOrderedDashboardWidgets(prefs = getDashboardWidgetPrefs(), ctx = null) {
    return prefs.order.map(id => getDashboardWidgetDefinition(id, ctx)).filter(Boolean);
  }

  function getVisibleDashboardWidgetEntries(ctx, prefs = getDashboardWidgetPrefs(), options = {}) {
    const includeEmpty = options.includeEmpty ?? isOrganizeMode();
    const excludeIds = options.excludeIds || new Set();
    return getOrderedDashboardWidgets(prefs, ctx)
      .map(def => ({ def, body: def.render(ctx) || '' }))
      .filter(entry => !excludeIds.has(entry.def.id))
      .filter(entry => !prefs.hidden.includes(entry.def.id) && (entry.body || includeEmpty));
  }

  return {
    dashboardWidgets,
    getAvailableDashboardFixedWidgets,
    getAvailableDashboardFixedWidgetIds,
    dashboardMarkerWidgetId,
    dashboardMarkerIdFromWidgetId,
    isDashboardMarkerWidgetId,
    getDashboardWidgetPrefs,
    saveDashboardWidgetPrefs,
    getDashboardWidgetDefinition,
    getOrderedDashboardWidgets,
    getVisibleDashboardWidgetEntries,
  };
}
