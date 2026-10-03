// dashboard-widgets.js - dashboard widget registry and persistence helpers

import { state } from './state.js';
import { safeMarkerId } from './utils.js';
import { profileStorageKey } from './profile.js';

// Views-owned renderers are injected; direct imports stay limited to lower-layer modules.
import {
  renderMenstrualCycleSection,
  renderProfileContextCards,
  renderSupplementsSection,
} from './health-data-loader.js';
import { getBiologyScoreWidgetDefinitions } from './biology-scores.js';

import type {DashboardRendererOperations, DashboardWidgetContext, DashboardWidgetOptionsReader, DashboardWidgetOperationReader, DashboardPreferenceReader, DashboardVisibleOptionsReader, DashboardWidgetFilterOperations} from '../types/dashboard-widgets.js';

const DASHBOARD_WIDGETS_VERSION = 13;

export const DASHBOARD_WIDGET_SOURCE_ORDER = ['Labs', 'Biology Scores', 'Genome', 'Body', 'Light', 'Insight', 'Tools'];
export const DASHBOARD_WIDGET_DEFAULT_IDS = [
  'biology-score-biologicalCoherence',
  'focus',
  'spotlight',
  'quick-markers',
  'key-trends',
  'recommendations',
  'profile-context',
  'wearables',
  'nutrition',
  'bio-age',
  'biology-score-metabolicFlexibility',
  'cycle',
];
export const DASHBOARD_MANUAL_BIOMETRIC_METRICS = ['weight', 'bp_systolic', 'rhr'];

export function dashboardWidgetStorageKey() {
  return profileStorageKey(state.currentProfile || 'default', `dashboardWidgetsV${DASHBOARD_WIDGETS_VERSION}`);
}

export function dashboardBiometricSelectionKey() {
  return profileStorageKey(state.currentProfile || 'default', 'dashboardBiometricMetricsV1');
}

export function createDashboardWidgetRegistry(renderers: unknown, opts: unknown = {}) {
  const biologyScoreWidgets = getBiologyScoreWidgetDefinitions().map(def => ({
    ...def,
    render: (ctx: unknown) => {
      if (def.scoreId === 'biologicalCoherence') {
        const renderer = (renderers as DashboardRendererOperations).renderDashboardBiologicalCoherenceWidget;
        if (!renderer) throw new Error('Missing renderDashboardBiologicalCoherenceWidget renderer');
        return (renderer as (ctx: unknown) => unknown)(ctx);
      }
      return ((renderers as DashboardRendererOperations).renderDashboardBiologyScoreWidget as (ctx: unknown, id: string) => unknown)(ctx, def.scoreId);
    },
  }));
  const dashboardWidgets = [
    { id: 'bio-age', source: 'Labs', title: 'Biological Age', description: 'Age-derived biological readout', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardBioAgeWidget },
    ...biologyScoreWidgets,
    { id: 'focus', source: 'Insight', title: 'Current Focus', description: 'One synthesized read on the latest data', size: 'half', render: () => ((renderers as DashboardRendererOperations).renderFocusCard as () => unknown)() },
    { id: 'recommendations', source: 'Insight', title: 'Tips to Explore', description: 'General-information ideas connected to your data', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardRecommendationsWidget },
    { id: 'spotlight', source: 'Labs', title: 'Current Priority', description: 'Highest-priority marker with the reason it was selected', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardSpotlightWidget },
    { id: 'wearables', source: 'Body', title: 'Biometrics Overview', description: 'User-selected body signal tiles', size: 'full', render: (renderers as DashboardRendererOperations).renderDashboardWearableTilesWidget },
    { id: 'nutrition', source: 'Body', title: 'Daily Nutrition', description: 'Seven-day intake coverage and nutrition guides', size: 'full', render: (renderers as DashboardRendererOperations).renderDashboardNutritionWidget },
    { id: 'nutrition-fuel-mix', source: 'Body', title: 'Fuel Mix Context', description: 'Seven-day carbohydrate and fat mix', render: (renderers as DashboardRendererOperations).renderFuelWidget },
    { id: 'quick-markers', source: 'Labs', title: 'Quick Markers', description: 'Pinned and priority-ranked marker tiles', size: 'full', render: (renderers as DashboardRendererOperations).renderDashboardQuickMarkersWidget },
    { id: 'insights', source: 'Insight', title: 'AI Insights', description: 'Top trend and range reads', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardInsightsListWidget },
    { id: 'genome', source: 'Genome', title: 'Genetic Modifiers', description: 'Curated SNP context relevant to labs and goals', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardGenomeWidget },
    { id: 'alerts', source: 'Labs', title: 'Needs Attention', description: 'Sudden changes and critical out-of-range markers', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardAlertsWidget },
    { id: 'correlation', source: 'Tools', title: 'Correlations', description: 'Highest linked marker pairs', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardCorrelationWidget },
    { id: 'light-today', source: 'Light', title: 'Light Today', description: "Today's light synthesis across sun, devices, and environment", render: (renderers as DashboardRendererOperations).renderDashboardLightTodayWidget },
    { id: 'light-conditions-now', source: 'Light', title: 'Conditions Now', description: 'Current outdoor UV, atmosphere, and air quality', size: 'full', render: (renderers as DashboardRendererOperations).renderDashboardLightConditionsWidget },
    { id: 'light-live-session', source: 'Light', title: 'Live Light Session', description: 'Running sun or therapy session with live estimates and controls', size: 'full', render: (renderers as DashboardRendererOperations).renderDashboardLightLiveSessionWidget },
    { id: 'light-session-log', source: 'Light', title: 'Log Sessions', description: 'Start sun or therapy sessions quickly', size: 'third', render: (renderers as DashboardRendererOperations).renderDashboardLightSessionLogWidget },
    { id: 'light-channels', source: 'Light', title: 'Light Channels', description: 'Seven-day rhythm across light biology channels', size: 'half', render: (renderers as DashboardRendererOperations).renderDashboardLightChannelsWidget },
    { id: 'profile-context', source: 'Insight', title: 'Profile Context', description: 'Goals, history, lifestyle, and context cards', render: () => renderProfileContextCards({ embedded: true }) },
    { id: 'cycle', source: 'Body', title: 'Cycle', description: 'Menstrual cycle context', size: 'half', isAvailable: () => state.profileSex === 'female', render: (ctx: unknown) => ctx ? renderMenstrualCycleSection((ctx as DashboardWidgetContext).data, { variant: 'dashboard', showHeader: false }) : '' },
    { id: 'supplements', source: 'Body', title: 'Supplements & Meds', description: 'Supplements and medication timeline', render: () => renderSupplementsSection() },
    { id: 'key-trends', source: 'Labs', title: 'Key Trends', description: 'Auto-selected markers from your current range', render: (renderers as DashboardRendererOperations).renderDashboardKeyTrendsWidget },
    { id: 'notes', source: 'Labs', title: 'Notes', description: 'Timeline notes linked to your data', render: (renderers as DashboardRendererOperations).renderDashboardNotesWidget },
  ];

  const isOrganizeMode = (opts as DashboardWidgetOptionsReader).isOrganizeMode || (() => false);
  const getDashboardMarkerWidgetDefinition = (opts as DashboardWidgetOptionsReader).getDashboardMarkerWidgetDefinition || (() => null);

  function isDashboardFixedWidgetAvailable(def: unknown) {
    return !!def && (typeof (def as DashboardWidgetOperationReader).isAvailable !== 'function' || ((def as DashboardWidgetOperationReader).isAvailable as () => unknown)());
  }

  function getAvailableDashboardFixedWidgets() {
    return dashboardWidgets.filter(isDashboardFixedWidgetAvailable);
  }

  function getAvailableDashboardFixedWidgetIds() {
    return getAvailableDashboardFixedWidgets().map(w => w.id);
  }

  function dashboardMarkerWidgetId(markerId: unknown) {
    return safeMarkerId(markerId) ? `marker_${markerId}` : '';
  }

  function dashboardMarkerIdFromWidgetId(widgetId: unknown) {
    if (typeof widgetId !== 'string' || !widgetId.startsWith('marker_')) return '';
    const markerId = widgetId.slice('marker_'.length);
    return safeMarkerId(markerId) ? markerId : '';
  }

  function isDashboardMarkerWidgetId(widgetId: unknown) {
    return !!dashboardMarkerIdFromWidgetId(widgetId);
  }

  function isKnownDashboardWidgetId(id: unknown) {
    return (getAvailableDashboardFixedWidgetIds() as readonly unknown[]).includes(id) || isDashboardMarkerWidgetId(id);
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
      const stored = localStorage.getItem(dashboardWidgetStorageKey());
      if (!stored) return fallback;
      const raw = JSON.parse(stored) as {order?: unknown; hidden?: unknown} | null;
      if (!raw || !Array.isArray(raw.order) || !Array.isArray(raw.hidden)) return fallback;
      const fixedIds = getAvailableDashboardFixedWidgetIds();
      const rawOrder = raw.order.filter(id => typeof id === 'string');
      const rawOrderSet = new Set(rawOrder);
      const order = rawOrder.filter(isKnownDashboardWidgetId);
      for (const id of fixedIds) if (!order.includes(id)) order.push(id);
      const hidden = raw.hidden.filter(id => (fixedIds as readonly unknown[]).includes(id) || isDashboardMarkerWidgetId(id));
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

  function saveDashboardWidgetPrefs(prefs: unknown) {
    const fixedIds = getAvailableDashboardFixedWidgetIds();
    const order = (((prefs as DashboardPreferenceReader).order || []) as {filter(callback:(id:unknown)=>unknown):unknown[]}).filter(isKnownDashboardWidgetId);
    for (const id of fixedIds) if (!order.includes(id)) order.push(id);
    const hidden = [...new Set(((prefs as DashboardPreferenceReader).hidden || []) as Iterable<unknown>)].filter(id => (fixedIds as readonly unknown[]).includes(id) || isDashboardMarkerWidgetId(id));
    localStorage.setItem(dashboardWidgetStorageKey(), JSON.stringify({ order, hidden }));
  }

  function resetDashboardWidgetPrefs() {
    localStorage.removeItem(dashboardWidgetStorageKey());
  }

  function getDashboardWidgetDefinition(id: unknown, ctx: unknown = null) {
    const fixed = dashboardWidgets.find(w => w.id === id);
    if (fixed) return isDashboardFixedWidgetAvailable(fixed) ? fixed : null;
    return (getDashboardMarkerWidgetDefinition as (id: unknown, ctx: unknown) => unknown)(id, ctx);
  }

  function getOrderedDashboardWidgets(prefs: unknown = getDashboardWidgetPrefs(), ctx: unknown = null) {
    return ((prefs as DashboardPreferenceReader).order as {map(callback:(id:unknown)=>unknown):{filter(callback:typeof Boolean):unknown}}).map(id => getDashboardWidgetDefinition(id, ctx)).filter(Boolean);
  }

  function getVisibleDashboardWidgetEntries(ctx: unknown, prefs: unknown = getDashboardWidgetPrefs(), options: unknown = {}) {
    const includeEmpty = (options as DashboardVisibleOptionsReader).includeEmpty ?? (isOrganizeMode as () => unknown)();
    const excludeIds = (options as DashboardVisibleOptionsReader).excludeIds || new Set();
    return (getOrderedDashboardWidgets(prefs, ctx) as DashboardWidgetFilterOperations)
      .filter(def => !(excludeIds as {has(id:unknown):unknown}).has((def as DashboardWidgetOperationReader).id))
      .filter(def => !((prefs as DashboardPreferenceReader).hidden as {includes(id:unknown):unknown}).includes((def as DashboardWidgetOperationReader).id))
      .map(def => ({ def, body: (def as {render(ctx:unknown):unknown}).render(ctx) || '' }))
      .filter(entry => entry.body || includeEmpty);
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
    resetDashboardWidgetPrefs,
    getDashboardWidgetDefinition,
    getOrderedDashboardWidgets,
    getVisibleDashboardWidgetEntries,
  };
}
