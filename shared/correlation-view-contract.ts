import { validComparisonDate } from './comparison-view-contract.js';
export interface CorrelationViewPatch {
  rangePreset?: '3m' | '6m' | '1y' | 'all' | 'custom'; start?: string; end?: string;
  grouping?: 'combined' | 'separate'; layout?: 'overlay' | 'lanes'; tab?: 'timeline' | 'scatter' | 'data';
  pairKey?: string; analysisOpen?: boolean; hidden?: string[]; ingredients?: Record<string, string>; inspectDate?: string | null;
}
export interface CorrelationWorkspacePatch { markers?: string[]; therapies?: string[]; preset?: string; view?: CorrelationViewPatch }
export function validateCorrelationNavigation(request: { view: string; snapshotId?: string; correlation?: string; undoId?: string }) {
  const supplied = request.correlation !== undefined || request.undoId !== undefined || request.view === 'correlations' && request.snapshotId !== undefined;
  if (!supplied) return;
  if (request.view !== 'correlations' || !request.snapshotId || !/^[A-Za-z0-9_-]{1,128}$/.test(request.snapshotId)) fail('Correlation commands require view:correlations and a fresh labs.correlations snapshot.');
  if ((request.correlation !== undefined) === (request.undoId !== undefined)) fail('Choose either an exact correlation patch or a current undoId.');
  if (request.correlation !== undefined) { if (typeof request.correlation !== 'string' || request.correlation.length > 9000) fail('correlation must contain a bounded JSON workspace patch.'); parseCorrelationWorkspacePatch(request.correlation); }
  if (request.undoId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(request.undoId)) fail('Use only an exact current undoId from labs.correlations.');
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function fail(message: string): never { throw new Error(message); }
function ids(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 8 || value.some(id => typeof id !== 'string' || !id || id.length > 256) || new Set(value).size !== value.length) fail(`${field} requires up to8 unique exact IDs from labs.correlations.`);
  return value as string[];
}
export function parseCorrelationWorkspacePatch(raw: string): CorrelationWorkspacePatch {
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { fail('correlation must be a JSON object with declared workspace fields.'); }
  if (!object(parsed) || !Object.keys(parsed).length || Object.keys(parsed).some(key => !['markers', 'therapies', 'preset', 'view'].includes(key))) fail('Use only markers, therapies, preset and/or view.');
  const patch: CorrelationWorkspacePatch = {};
  if (Object.hasOwn(parsed, 'markers')) patch.markers = ids(parsed.markers, 'markers');
  if (Object.hasOwn(parsed, 'therapies')) patch.therapies = ids(parsed.therapies, 'therapies');
  if (Object.hasOwn(parsed, 'preset')) {
    if (typeof parsed.preset !== 'string' || !/^native:\d{1,2}$/.test(parsed.preset) || patch.markers) fail('preset must be an exact native preset ID, separate from markers.'); patch.preset = parsed.preset;
  }
  if ((patch.markers?.length || 0) + (patch.therapies?.length || 0) > 8) fail('The native workspace supports at most8 selected items.');
  if (Object.hasOwn(parsed, 'view')) {
    const view = parsed.view;
    if (!object(view) || !Object.keys(view).length || Object.keys(view).some(key => !['rangePreset', 'start', 'end', 'grouping', 'layout', 'tab', 'pairKey', 'analysisOpen', 'hidden', 'ingredients', 'inspectDate'].includes(key))) fail('Use only declared correlation view controls.');
    const result: CorrelationViewPatch = {};
    for (const [key, allowed] of Object.entries({ rangePreset: ['3m', '6m', '1y', 'all', 'custom'], grouping: ['combined', 'separate'], layout: ['overlay', 'lanes'], tab: ['timeline', 'scatter', 'data'] })) {
      if (Object.hasOwn(view, key) && (typeof view[key] !== 'string' || !allowed.includes(view[key]))) fail(`Unsupported correlation ${key}.`);
    }
    if (view.rangePreset !== undefined) result.rangePreset = view.rangePreset as CorrelationViewPatch['rangePreset'] & string;
    if (view.grouping !== undefined) result.grouping = view.grouping as 'combined' | 'separate';
    if (view.layout !== undefined) result.layout = view.layout as 'overlay' | 'lanes';
    if (view.tab !== undefined) result.tab = view.tab as 'timeline' | 'scatter' | 'data';
    if (Object.hasOwn(view, 'start') || Object.hasOwn(view, 'end')) {
      if (view.rangePreset !== 'custom' || !validComparisonDate(view.start) || !validComparisonDate(view.end) || view.start > view.end) fail('A custom correlation range needs valid start/end dates in order and rangePreset:custom.'); result.start = view.start; result.end = view.end;
    }
    if (Object.hasOwn(view, 'pairKey')) { if (typeof view.pairKey !== 'string' || !view.pairKey || view.pairKey.length > 1024) fail('Use an exact pairKey from labs.correlations.'); result.pairKey = view.pairKey; }
    if (Object.hasOwn(view, 'analysisOpen')) { if (typeof view.analysisOpen !== 'boolean') fail('analysisOpen must be a boolean.'); result.analysisOpen = view.analysisOpen; }
    if (Object.hasOwn(view, 'hidden')) result.hidden = ids(view.hidden, 'hidden');
    if (Object.hasOwn(view, 'ingredients')) {
      if (!object(view.ingredients) || Object.keys(view.ingredients).length > 8 || Object.entries(view.ingredients).some(([id, value]) => !id || id.length > 256 || typeof value !== 'string' || !value || value.length > 256)) fail('ingredients must map exact selected therapy IDs to returned ingredient names.');
      result.ingredients = view.ingredients as Record<string, string>;
    }
    if (Object.hasOwn(view, 'inspectDate')) { if (view.inspectDate !== null && !validComparisonDate(view.inspectDate)) fail('inspectDate must be a valid date in the native timeline bounds, or null to unpin.'); result.inspectDate = view.inspectDate; }
    patch.view = result;
  }
  return patch;
}
