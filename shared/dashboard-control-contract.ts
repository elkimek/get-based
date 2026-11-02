export interface DashboardSelectionPatch { add?: string[]; remove?: string[]; order?: string[] }
export interface DashboardPresentationPatch {
  show?: string[]; hide?: string[]; order?: string[];
  markerWidgets?: Pick<DashboardSelectionPatch, 'add' | 'remove'>;
  biometrics?: DashboardSelectionPatch; pins?: DashboardSelectionPatch; resetLayout?: true;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) || new Set(value).size !== value.length) throw new Error('dashboard must use bounded nonempty lists of unique exact returned IDs.');
  return [...value] as string[];
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dashboard must contain a declared JSON preference object.'); return value as Record<string, unknown>;
}
function selection(value: unknown, allowOrder: boolean): DashboardSelectionPatch {
  const input = row(value), keys = Object.keys(input); if (!keys.length || keys.some(key => !['add', 'remove', ...(allowOrder ? ['order'] : [])].includes(key))) throw new Error(allowOrder ? 'dashboard must use only add, remove and order for biometrics or pins.' : 'dashboard must use only add and remove for markerWidgets.');
  const result = Object.fromEntries(keys.map(key => [key, ids(input[key])])) as DashboardSelectionPatch;
  if (result.add?.some(id => result.remove?.includes(id))) throw new Error('dashboard must not add and remove the same item.'); return result;
}
export function parseDashboardPresentationPatch(raw: string): DashboardPresentationPatch {
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error('dashboard must contain valid JSON.'); }
  const input = row(parsed), keys = Object.keys(input), allowed = ['show', 'hide', 'order', 'markerWidgets', 'biometrics', 'pins', 'resetLayout'];
  if (!keys.length || keys.some(key => !allowed.includes(key))) throw new Error('dashboard must use only show, hide, order, markerWidgets, biometrics, pins or resetLayout.');
  if (Object.hasOwn(input, 'resetLayout')) { if (input.resetLayout !== true || keys.length !== 1) throw new Error('resetLayout must be true and separate from other dashboard changes.'); return { resetLayout: true }; }
  const result: DashboardPresentationPatch = {};
  for (const field of ['show', 'hide', 'order'] as const) if (Object.hasOwn(input, field)) result[field] = ids(input[field]);
  for (const field of ['markerWidgets', 'biometrics', 'pins'] as const) if (Object.hasOwn(input, field)) result[field] = selection(input[field], field !== 'markerWidgets');
  if (result.show?.some(id => result.hide?.includes(id))) throw new Error('dashboard must not show and hide the same widget.');
  return result;
}
export function validateDashboardNavigation(request: { view: string; dashboard?: string; snapshotId?: string; undoId?: string; subview?: string }) {
  const supplied = request.dashboard !== undefined || request.view === 'dashboard' && (request.snapshotId !== undefined || request.undoId !== undefined);
  if (!supplied) return;
  if (request.view !== 'dashboard' || !request.snapshotId || !/^[A-Za-z0-9_-]{1,128}$/.test(request.snapshotId)) throw new Error('snapshotId must come from a fresh dashboard.presentation read for the dashboard destination.');
  if (request.subview !== undefined || (request.dashboard !== undefined) === (request.undoId !== undefined)) throw new Error('dashboard must supply a JSON preference command or a current undoId, without subview.');
  if (request.dashboard !== undefined) { if (typeof request.dashboard !== 'string' || request.dashboard.length > 9000) throw new Error('dashboard must be bounded JSON.'); parseDashboardPresentationPatch(request.dashboard); }
  if (request.undoId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(request.undoId)) throw new Error('undoId must be a returned current Dashboard Undo ID.');
}
