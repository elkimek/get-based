export const NUTRITION_VIEW_RANGES = ['30d', '3m', '6m', '1y', 'all'] as const;
export const WEARABLE_VIEW_RANGES = ['90d', '6m', '1y', 'all'] as const;
export interface HistoryViewPreferences { nutritionRange: typeof NUTRITION_VIEW_RANGES[number]; nutritionView: 'meals' | 'trends'; wearableRange: typeof WEARABLE_VIEW_RANGES[number]; stripHidden: boolean; stripCollapsed: boolean }
export type HistoryViewPatch = Partial<HistoryViewPreferences>;
export const HISTORY_VIEW_KEYS = ['nutritionRange', 'nutritionView', 'wearableRange', 'stripHidden', 'stripCollapsed'] as const;
export const HISTORY_NAVIGATION_VIEWS = ['nutritionHistory', 'wearableDetail'] as const;
export function parseHistoryNavigationPatch(view: string, raw: string) {
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error('history must contain a valid JSON preference object.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('history must contain a declared JSON preference object.');
  const { metricId, ...fields } = parsed as Record<string, unknown>;
  const allowed = view === 'nutritionHistory' ? ['nutritionRange', 'nutritionView'] : view === 'wearableDetail' ? ['wearableRange'] : [];
  if (!allowed.length || Object.keys(fields).some(field => !allowed.includes(field))) throw new Error(view === 'wearableDetail' ? 'history must use only metricId (required) and wearableRange (optional) for wearableDetail. Read history.views and use those exact field names.' : 'history must use only nutritionRange and nutritionView for nutritionHistory. Read history.views and use those exact field names.');
  const patch = Object.keys(fields).length ? parseHistoryViewPatch(fields) : {};
  if (view === 'wearableDetail') { if (typeof metricId !== 'string' || !metricId || metricId.length > 160) throw new Error('metricId is required and must be an exact permitted wearable ID from history.views.'); }
  else if (metricId !== undefined || !Object.keys(patch).length) throw new Error('history must contain at least one preference for this destination, without metricId.');
  return { patch, metricId: typeof metricId === 'string' ? metricId : null };
}
export function validateHistoryNavigation(request: { view: string; snapshotId?: string; history?: string; undoId?: string; subview?: string }) {
  const supplied = request.history !== undefined || HISTORY_NAVIGATION_VIEWS.includes(request.view as typeof HISTORY_NAVIGATION_VIEWS[number]) && (request.snapshotId !== undefined || request.undoId !== undefined);
  if (!supplied) { if (request.view === 'wearableDetail') throw new Error('snapshotId is required from a fresh history.views read for this destination.'); return; }
  if (!HISTORY_NAVIGATION_VIEWS.includes(request.view as typeof HISTORY_NAVIGATION_VIEWS[number]) || !request.snapshotId || !/^[A-Za-z0-9_-]{1,128}$/.test(request.snapshotId)) throw new Error('snapshotId must come from a fresh history.views read with the declared destination.');
  if (request.subview !== undefined || (request.history !== undefined) === (request.undoId !== undefined)) throw new Error('history must supply JSON or a current undoId, without subview.');
  if (request.history !== undefined) { if (typeof request.history !== 'string' || request.history.length > 9000) throw new Error('history must be a bounded JSON preference object.'); parseHistoryNavigationPatch(request.view, request.history); }
  if (request.undoId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(request.undoId)) throw new Error('undoId must be a returned current history Undo ID.');
}
export function parseHistoryViewPatch(value: unknown): HistoryViewPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Use only declared history preference fields.');
  const row = value as Record<string, unknown>, keys = Object.keys(row);
  if (!keys.length || keys.some(key => !HISTORY_VIEW_KEYS.includes(key as keyof HistoryViewPreferences))) throw new Error('Use only declared history preference fields.');
  if (Object.hasOwn(row, 'nutritionRange') && !NUTRITION_VIEW_RANGES.includes(row.nutritionRange as HistoryViewPreferences['nutritionRange'])) throw new Error('Use a returned nutrition history range.');
  if (Object.hasOwn(row, 'nutritionView') && !['meals', 'trends'].includes(row.nutritionView as string)) throw new Error('Nutrition history view is meals or trends.');
  if (Object.hasOwn(row, 'wearableRange') && !WEARABLE_VIEW_RANGES.includes(row.wearableRange as HistoryViewPreferences['wearableRange'])) throw new Error('Use a returned wearable history range.');
  for (const key of ['stripHidden', 'stripCollapsed']) if (Object.hasOwn(row, key) && typeof row[key] !== 'boolean') throw new Error('Strip visibility fields must be booleans.');
  return { ...row } as HistoryViewPatch;
}
