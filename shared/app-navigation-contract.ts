// Finite semantic destinations, shared by every chat transport.
import { chatNavigationAllowed, CHAT_NATIVE_UI_NOTICE } from './chat-control-policy.js';
import { validateComparisonNavigation } from './comparison-view-contract.js';
import { validateCorrelationNavigation } from './correlation-view-contract.js';
import { validateHistoryNavigation, HISTORY_NAVIGATION_VIEWS } from './history-view-contract.js';
import { validateDashboardNavigation } from './dashboard-control-contract.js';
import { validateMealRouteNavigation } from './meal-route-control-contract.js';
export const APP_NAVIGATION_VIEWS = ['dashboard', 'labs', 'biologyScores', 'genome', 'body', 'nutrition', 'supplements', 'light', 'insight', 'recommendations', 'correlations', 'compare',
  'aiSettings', 'displaySettings', 'voiceSettings', 'privacySettings', 'dataSettings', 'wearablesSettings', 'agentSettings',
  'category', 'contextEditor', 'nutritionHistory', 'wearableDetail', 'nutritionEditor', 'nutritionTargets', 'fluidLog', 'lightDevices', 'lightDevice', 'sunSession', 'deviceSession', 'lightAssessment', 'emfAssessment', 'knowledgeBase', 'healthImport', 'reportBuilder', 'profileShare', 'lightTools'] as const;
export type AppNavigationView = typeof APP_NAVIGATION_VIEWS[number];
export const REPORT_HANDOFF_PRESETS = ['clinician', 'full', 'lifestyle', 'personal'] as const;
export const LAB_VIEW_RANGES = ['all', '3m', '6m', '1y'] as const;
export const LAB_CATEGORY_LAYOUTS = ['charts', 'table', 'heatmap'] as const;
export interface AppNavigationRequest { view: string; marker: string; category?: string; card?: string; recordId?: string; subview?: string; range?: string; layout?: string; firstDate?: string; secondDate?: string; swapDates?: boolean; snapshotId?: string; correlation?: string; history?: string; dashboard?: string; mealRoute?: string; undoId?: string; personaDraft?: string }
/** Validate combinations too; ignored arguments must never open a different surface. */
export function validateAppNavigation(request: AppNavigationRequest): void {
  if (['personaEditor', 'personaDelete', 'chatPersona'].includes(request.view) || request.personaDraft !== undefined) throw new Error('Persona management is available only in the manual persona picker and editor.');
  if (!chatNavigationAllowed(request)) throw new Error(CHAT_NATIVE_UI_NOTICE);
  validateComparisonNavigation(request);
  if (request.view === 'correlations' || request.correlation !== undefined) validateCorrelationNavigation(request);
  validateHistoryNavigation(request);
  validateDashboardNavigation(request);
  validateMealRouteNavigation(request);
  if (request.snapshotId && !['compare', 'correlations', 'dashboard', 'aiSettings', 'wearablesSettings', ...HISTORY_NAVIGATION_VIEWS].includes(request.view)) throw new Error('snapshotId applies only to declared native view commands.');
  if (request.undoId && !['correlations', 'dashboard', 'aiSettings', 'wearablesSettings', ...HISTORY_NAVIGATION_VIEWS].includes(request.view)) throw new Error('undoId applies only to a declared native view command.');
  const { view, marker, category, card, recordId, subview, range, layout } = request;
  if (!view && !marker) throw new Error('view or marker is required.');
  if (view && !APP_NAVIGATION_VIEWS.includes(view as AppNavigationView)) throw new Error('view is not supported.');
  if (marker && view && view !== 'labs') throw new Error('A marker can only be opened in labs.');
  if (category && view !== 'category' || view === 'category' && !category) throw new Error('category requires the category destination and an exact category key.');
  if (card && view !== 'contextEditor' || view === 'contextEditor' && !card) throw new Error('card requires the contextEditor destination.');
  if (recordId && !['nutritionEditor', 'lightDevice', 'sunSession', 'deviceSession', 'emfAssessment', 'profileShare', 'wearablesSettings'].includes(view)
    || ['lightDevice', 'sunSession', 'deviceSession'].includes(view) && !recordId) throw new Error('Use an exact recordId for this destination.');
  if (view === 'wearablesSettings' && !!recordId !== !!request.snapshotId) throw new Error('A source refresh handoff requires exact recordId and fresh wearables.sources snapshotId together.');
  if (subview && !(view === 'nutritionHistory' && ['meals', 'trends'].includes(subview) || view === 'reportBuilder' && REPORT_HANDOFF_PRESETS.some(id => id === subview))) throw new Error('subview requires a declared nutritionHistory tab or reportBuilder template.');
  if (range && (!['labs', 'category', 'reportBuilder'].includes(view) || marker || !LAB_VIEW_RANGES.includes(range as typeof LAB_VIEW_RANGES[number]))) throw new Error('range is all, 3m, 6m or 1y in labs, an exact category or reportBuilder.');
  if (layout && (view !== 'category' || !LAB_CATEGORY_LAYOUTS.includes(layout as typeof LAB_CATEGORY_LAYOUTS[number]))) throw new Error('layout is charts, table or heatmap for an exact category.');
}
