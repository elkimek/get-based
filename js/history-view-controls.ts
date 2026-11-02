// Permission-filtered native view discovery and scoped presentation preferences, never clinical edits.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { isContextSourceEnabled } from './context-source-registry.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { canonicalMetric } from './wearable-adapters.js';
import { captureReadonlyHistorySurface, ownsReadonlyHistorySurface } from './readonly-history-surfaces.js';
import { readHistoryViewPreferences, commitHistoryViewPreferences, historyPreferenceConflict } from './history-view-preferences.js';
import { NUTRITION_VIEW_RANGES, WEARABLE_VIEW_RANGES, parseHistoryNavigationPatch, validateHistoryNavigation } from '../shared/history-view-contract.js';
import type { HistoryViewPatch, HistoryViewPreferences } from '../shared/history-view-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
type Key = keyof HistoryViewPreferences;
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory }
type Snapshot = ReturnType<typeof readHistoryViewPreferences>;
interface Lease extends Owner { snapshot: Snapshot; disclosure: string; used?: boolean }
interface Undo extends Owner { view: string; metricId: string | null; before: Snapshot; after: Snapshot; fields: Key[]; disclosure: string; used?: boolean }
const leases = new Map<string, Lease>(), undos = new Map<string, Undo>();
const owned = (owner: Owner) => state.currentProfile === owner.profile && state.currentThreadId === owner.thread && state.importedData === owner.root && state.chatHistory === owner.history && isActiveProfileDataOwner(owner.profile, owner.root);
function add<T>(map: Map<string, T>, value: T) { const id = crypto.randomUUID(); if (map.size >= 100) map.delete(map.keys().next().value!); map.set(id, value); return id; }
function metrics() {
  if (!isContextSourceEnabled('wearables')) return [];
  const summary = state.importedData.wearableSummary?.metrics || {};
  return Object.entries(summary).flatMap(([id, metric]) => { const canon = canonicalMetric(id); if (!canon || canon.id !== id || !metric || typeof metric !== 'object' || !('primarySource' in metric) || typeof metric.primarySource !== 'string' || !metric.primarySource || id === 'bp_diastolic' && summary.bp_systolic) return []; return [{ id, label: canon.label, ...(id === 'bp_systolic' && summary.bp_diastolic ? { aliases: ['bp_diastolic'] } : {}) }]; });
}
export function readHistoryViews(profile: string, options: { query?: string; offset?: number; limit?: number } = {}) {
  const origin = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  if (!origin.thread || !owned(origin)) historyPreferenceConflict('The originating history profile or chat changed.');
  const snapshot = readHistoryViewPreferences(profile), disclosure = getContextDisclosureFingerprint(), snapshotId = add(leases, { ...origin, snapshot, disclosure });
  const items = metrics().filter(item => !options.query || JSON.stringify(item).toLowerCase().includes(options.query.toLowerCase())), offset = options.offset ?? 0, limit = options.limit ?? 25;
  const availableUndo = [...undos].filter(([, proof]) => !proof.used && owned(proof) && proof.disclosure === disclosure && proof.fields.every(field => snapshot.footprint[field] === proof.after.footprint[field]));
  const detail = captureReadonlyHistorySurface('wearableDetail'), fields = ['nutritionRange', 'nutritionView', 'wearableRange'] as const;
  return { action: 'history.views', status: 'read_only', snapshotId, values: Object.fromEntries(fields.map(field => [field, snapshot.values[field]])), storedRecognized: Object.fromEntries(fields.map(field => [field, snapshot.recognized[field]])),
    scopes: { nutritionRange: 'browser', nutritionView: 'browser', wearableRange: 'browser' },
    dashboardVisibility: { available: true, action: 'dashboard.presentation', widgetId: 'wearables', notice: 'Read dashboard.presentation for actual Biometrics Overview widget visibility; history commands do not change legacy strip settings.' },
    nutritionRanges: NUTRITION_VIEW_RANGES, nutritionViews: ['meals', 'trends'], wearableRanges: WEARABLE_VIEW_RANGES,
    historyFields: { nutritionHistory: { optional: { nutritionRange: NUTRITION_VIEW_RANGES, nutritionView: ['meals', 'trends'] }, minimumFields: 1 }, wearableDetail: { required: ['metricId'], metricId: 'Exact permitted wearableMetrics.id; the JSON key is metricId.', optional: { wearableRange: WEARABLE_VIEW_RANGES } } },
    wearableMetrics: items.slice(offset, offset + limit), totalMetrics: items.length, nextOffset: offset + limit < items.length ? offset + limit : null,
    currentWearableMetric: detail && metrics().some(item => item.id === detail.metricId) ? detail.metricId : null,
    undoChoices: availableUndo.map(([id, proof]) => ({ id, view: proof.view, ...(proof.metricId ? { metricId: proof.metricId } : {}) })), dataSaved: false, settingsSaved: false,
    notice: 'Use getbased_navigate with snapshotId and history:JSON. nutritionHistory accepts nutritionRange/nutritionView; wearableDetail needs a permitted metricId and optionally wearableRange. For Dashboard widget visibility, read dashboard.presentation and use its fresh snapshot and declared widget IDs. History commands do not change legacy strip preferences. These explicit native view commands save scoped presentation preferences directly, without an Apply card. They never alter meals, readings, sources or account connections. No measurements, dates, source identities or notes are returned. Defaults apply when storedRecognized is false; only stated keys change. Undo uses a fresh snapshot, exact undoId and its declared view; it restores only the saved fields and expires on reload, changed fields or context. Other dialogs/data-entry forms block navigation; an owned read-only history can update in place.' };
}
export async function openHistoryView(request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  validateHistoryNavigation(request); const lease = request.snapshotId && leases.get(request.snapshotId);
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, settingsSaved: false, dataSaved: false, reason });
  const ready = () => { try { return !!lease && !lease.used && canOpen() && owned(lease) && getContextDisclosureFingerprint() === lease.disclosure; } catch { return false; } };
  if (!lease || !ready()) return rejected('This history snapshot expired. Read history.views again.');
  const proof = request.undoId ? undos.get(request.undoId) : undefined;
  if (request.undoId && (!proof || proof.used || proof.view !== request.view || !owned(proof) || proof.disclosure !== lease.disclosure)) return rejected('This native history Undo expired.');
  const parsed = proof ? { patch: Object.fromEntries(proof.fields.map(field => [field, proof.before.values[field]])) as HistoryViewPatch, metricId: proof.metricId } : parseHistoryNavigationPatch(request.view, request.history!);
  if (request.view === 'wearableDetail' && !metrics().some(item => item.id === parsed.metricId)) return rejected('This metric is not currently available to chat. Use the native details or read history.views again.');
  try {
    if (request.view === 'nutritionHistory') { await (await import('./nutrition-context.js')).loadNutritionFeature(); const presentation = await import('./nutrition-render.js'); if ((await presentation.ensureNutritionStylesheet())?.type === 'error') return rejected('Nutrition presentation could not be loaded. Nothing was saved.'); }
    else { const runtime = await import('./wearables-runtime.js'); await runtime.loadWearablesModule(); if (!await runtime.loadWearablesStylesheetForAction(ready)) return rejected('Wearable presentation could not be loaded. Nothing was saved.'); }
  } catch { return rejected('The native history view could not be loaded. Nothing was saved.'); }
  if (!ready()) return rejected('The history context or editor changed while loading.');
  lease.used = true; if (proof) proof.used = true;
  const fields = Object.keys(parsed.patch) as Key[];
  let result: Awaited<ReturnType<typeof commitHistoryViewPreferences>>;
  try { result = fields.length ? await commitHistoryViewPreferences(parsed.patch, { profileId: lease.profile, expected: proof ? proof.after.footprint : lease.snapshot.footprint, requireLocks: true, canCommit: () => canOpen() && owned(lease) && getContextDisclosureFingerprint() === lease.disclosure, ...(proof ? { restore: proof.before.footprint } : {}) }) : { profileId: lease.profile, before: readHistoryViewPreferences(lease.profile), after: readHistoryViewPreferences(lease.profile), changed: [], scope: [] }; }
  catch (error) { return { ...rejected(error instanceof Error ? error.message : 'History preferences could not be confirmed.'), ...((error as { persistenceUncertain?: boolean })?.persistenceUncertain ? { persistenceUncertain: true } : {}) }; }
  const current = () => { try { return isOwnerCurrent() && owned(lease) && getContextDisclosureFingerprint() === lease.disclosure; } catch { return false; } };
  const beforeOpen = () => current() && canOpen();
  let opened = false;
  try {
    if (beforeOpen()) {
      if (request.view === 'nutritionHistory') { const history = await import('./nutrition-history.js'); if (beforeOpen()) opened = await history.openNutritionHistory(result.after.values.nutritionRange, { view: result.after.values.nutritionView, persistPreferences: false }, beforeOpen); }
      else if (request.view === 'wearableDetail') { const detail = await import('./wearables-detail-modal.js'); if (beforeOpen()) { await detail.openWearableDetail(parsed.metricId!, { isCurrent: beforeOpen, range: result.after.values.wearableRange }); opened = ownsReadonlyHistorySurface('wearableDetail') && captureReadonlyHistorySurface('wearableDetail')?.metricId === parsed.metricId; } }
    }
  } catch { /* A confirmed preference save remains authoritative when optional presentation fails. */ }
  const saved = result.changed.length > 0;
  if (!current()) return { changed: saved, opened: null, settingsSaved: saved, dataSaved: false, reason: 'The preference operation completed before the originating view changed. Check native history; no health records were saved.' };
  let latest: Snapshot | null = null; try { latest = readHistoryViewPreferences(lease.profile); } catch { /* A failed optional proof read cannot erase a confirmed save. */ }
  const undoId = !proof && saved && latest && result.changed.every(field => latest!.footprint[field] === result.after.footprint[field]) ? add(undos, { profile: lease.profile, thread: lease.thread, root: lease.root, history: lease.history, view: request.view, metricId: parsed.metricId, before: result.before, after: result.after, fields: result.changed, disclosure: lease.disclosure }) : null;
  return { changed: saved || opened, opened: opened ? request.view : null, settingsSaved: saved, dataSaved: false, ...(undoId ? { undoId } : {}), ...(proof ? { undone: true } : {}), scope: 'native history presentation preferences only', ...(!opened ? { reason: 'Preferences were processed, but the native view could not be confirmed. Open it manually.' } : {}) };
}
