// Explicit native workspace commands, durable preference receipts and process-private Undo.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { inspectCorrelationChoices, resolveCorrelationWorkspace, correlationConflict } from './correlation-view-state.js';
import { correlationTimelineBounds } from './correlation-timeline-bounds.js';
import { readCorrelationWorkspaceSnapshot, commitCorrelationWorkspace, correlationWorkspaceIsSupported, currentCorrelationWorkspace } from './correlation-workspace-store.js';
import { parseCorrelationWorkspacePatch, validateCorrelationNavigation } from '../shared/correlation-view-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
interface Owner { profile: string; thread: string; root: typeof state.importedData; history: typeof state.chatHistory }
type Snapshot = Awaited<ReturnType<typeof readCorrelationWorkspaceSnapshot>>;
interface Lease extends Owner { snapshot: Snapshot; signature: string; disclosure: string; used?: boolean }
interface Undo extends Owner { before: Snapshot; after: Snapshot; signature: string; disclosure: string; used?: boolean }
const leases = new Map<string, Lease>(), undos = new Map<string, Undo>();
const owned = (origin: Owner) => state.currentProfile === origin.profile && state.currentThreadId === origin.thread && state.importedData === origin.root && state.chatHistory === origin.history && isActiveProfileDataOwner(origin.profile, origin.root);
function add<T>(map: Map<string, T>, value: T) { const id = crypto.randomUUID(); if (map.size >= 100) map.delete(map.keys().next().value!); map.set(id, value); return id; }
const same = (a: Snapshot, b: Snapshot) => a.raw === b.raw && a.state === b.state;
export async function readLabCorrelations(profile: string, options: { query?: string; offset?: number; limit?: number } = {}) {
  const origin = { profile, thread: state.currentThreadId || '', root: state.importedData, history: state.chatHistory };
  if (!origin.thread || !owned(origin)) correlationConflict('The originating correlation profile or chat changed.');
  const snapshot = await readCorrelationWorkspaceSnapshot(profile); if (!owned(origin)) correlationConflict('The originating correlation context changed while reading.');
  const choices = inspectCorrelationChoices(), editable = choices.selectedAllowed && correlationWorkspaceIsSupported(snapshot.raw, snapshot.workspace) && snapshot.state === JSON.stringify(choices.workspace);
  const all = [...choices.markers, ...choices.therapies].filter(item => !options.query || JSON.stringify(item).toLowerCase().includes(options.query.toLowerCase())), offset = options.offset ?? 0, limit = options.limit ?? 25;
  const snapshotId = editable ? add(leases, { ...origin, snapshot, signature: choices.signature, disclosure: choices.disclosure }) : null;
  const availableUndo = editable ? [...undos].filter(([, proof]) => !proof.used && owned(proof) && proof.signature === choices.signature && proof.disclosure === choices.disclosure && same(proof.after, snapshot)).map(([id]) => id) : [];
  const selection = editable ? choices.selection : null;
  const visibleWorkspace = editable ? structuredClone(snapshot.workspace) : null;
  if (visibleWorkspace) { if (selection?.activePairKey) visibleWorkspace.view.pairKey = selection.activePairKey; else delete visibleWorkspace.view.pairKey; }
  return { action: 'labs.correlations', status: 'read_only', snapshotId, items: all.slice(offset, offset + limit), totalItems: all.length, nextOffset: offset + limit < all.length ? offset + limit : null,
    presets: choices.presets, current: visibleWorkspace,
    pairs: selection?.pairs.map(pair => ({ id: pair.pairKey, markerId: pair.markerKey, otherId: ('therapyId' in pair ? pair.therapyId : pair.xMarkerKey) })) || [],
    inspectorBounds: selection ? correlationTimelineBounds(selection) : null, undoIds: availableUndo,
    parameters: { markers: 'up to8 exact item IDs; replaces markers and preserves treatments', therapies: 'up to8 exact item IDs; replaces treatments and preserves markers', preset: 'exact native preset ID; replaces markers, keeps treatments and native8item limit', view: 'rangePreset/custom start/end, grouping, layout, tab, pairKey, analysisOpen, hidden selected IDs, ingredient names, inspectDate or null to unpin' },
    scope: 'saved native correlation workspace preferences; no health records', settingsSaved: false, dataSaved: false,
    notice: 'Use getbased_navigate(view:correlations,snapshotId,correlation:JSON patch) only for an explicit workspace command. This saves native view preferences without a review card. Undo requires a fresh read and a returned undoId; it expires on reload or any newer workspace/data/permission change. Numeric results, measurements, sources and dose schedules are not returned; the native view shows the existing app calculation and available data. A null snapshot needs the native controls; do not enable sources or guess private selections.' };
}
export async function openLabCorrelations(request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  validateCorrelationNavigation(request); const lease = request.snapshotId && leases.get(request.snapshotId);
  const rejected = (reason: string): AppNavigationReceipt => ({ changed: false, opened: null, settingsSaved: false, dataSaved: false, reason });
  const ready = () => { try { return !!lease && !lease.used && canOpen() && owned(lease) && JSON.stringify(currentCorrelationWorkspace()) === lease.snapshot.state && inspectCorrelationChoices().signature === lease.signature; } catch { return false; } };
  if (!lease || !ready()) return rejected('This correlation snapshot expired. Read labs.correlations again.');
  const choices = inspectCorrelationChoices(), proof = request.undoId ? undos.get(request.undoId) : undefined;
  if (request.undoId && (!proof || proof.used || !owned(proof) || proof.signature !== lease.signature || proof.disclosure !== lease.disclosure || !same(proof.after, lease.snapshot))) return rejected('This native Undo expired or a newer workspace change intervened.');
  const after = proof ? proof.before.workspace : resolveCorrelationWorkspace(choices, parseCorrelationWorkspacePatch(request.correlation!));
  if (after.markers.some(id => !choices.markers.some(row => row.id === id)) || after.therapies.some(id => !choices.therapies.some(row => row.id === id))) return rejected('The previous workspace is no longer available with the current permissions.');
  await import('./compare-correlations.js'); if (!ready()) return rejected('The native workspace or editor changed while loading. Read again.');
  lease.used = true; if (proof) proof.used = true;
  let committed: Awaited<ReturnType<typeof commitCorrelationWorkspace>>;
  try { committed = await commitCorrelationWorkspace(lease.profile, lease.snapshot, after, () => canOpen() && owned(lease) && inspectCorrelationChoices().signature === lease.signature, proof ? { raw: proof.before.raw } : undefined); }
  catch (error) { return { ...rejected(error instanceof Error ? error.message : 'The correlation preferences could not be confirmed.'), ...((error as { persistenceUncertain?: boolean })?.persistenceUncertain ? { persistenceUncertain: true } : {}) }; }
  const changed = committed.settingsSaved || committed.stateChanged;
  let rendered = false;
  try { if (committed.published && isOwnerCurrent()) rendered = await (await import('./data-view-controls.js')).navigateDataViewOutcomeRuntime('correlations'); } catch { /* A successful preference save is independent of optional rendering. */ }
  let completed: Snapshot | null = null;
  try { if (owned(lease) && isOwnerCurrent() && inspectCorrelationChoices().signature === lease.signature) completed = await readCorrelationWorkspaceSnapshot(lease.profile); } catch { /* Withhold proof and date/selection details for an unconfirmed owner. */ }
  let current = false;
  try { current = !!completed && owned(lease) && isOwnerCurrent() && inspectCorrelationChoices().signature === lease.signature && completed.raw === committed.afterRaw && completed.state === JSON.stringify(committed.after); } catch { /* A revoked source cannot turn a committed write into a false failure. */ }
  if (!current || !completed) return { changed, opened: null, settingsSaved: committed.settingsSaved, dataSaved: false, reason: 'The workspace preferences were processed, but the originating view changed. Check native Correlations; no health records were saved.' };
  const opened = rendered && state.currentView === 'correlations' && !!document.querySelector('#corr-search') && !!document.querySelector('#corr-chips');
  const undoId = !proof && changed ? add(undos, { profile: lease.profile, thread: lease.thread, root: lease.root, history: lease.history, before: lease.snapshot, after: completed, signature: lease.signature, disclosure: lease.disclosure }) : undefined;
  return { changed: changed || opened, opened: opened ? 'correlations' : null, settingsSaved: committed.settingsSaved, dataSaved: false,
    scope: 'saved native correlation workspace preferences only', ...(undoId ? { undoId } : {}), ...(proof ? { undone: true } : {}),
    ...(!opened ? { reason: 'The preference outcome was confirmed, but the native view could not be confirmed. Open Correlations manually.' } : {}) };
}
