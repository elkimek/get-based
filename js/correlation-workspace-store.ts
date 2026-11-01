import { state } from './state.js';
import { encryptedGetItem, encryptedSetItem, encryptedRemoveItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { showNotification } from './utils.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';

interface CorrelationWorkspaceInput { markers?: unknown; therapies?: unknown; view?: unknown }
interface CorrelationWorkspaceView extends Record<string, unknown> {
  rangePreset?: string; grouping?: string; layout?: string; tab?: string;
  start?: string; end?: string; inspectDate?: string; pairKey?: string;
  analysisOpen?: boolean; hidden?: string[]; ingredients?: Record<string, string>;
}

const writes = new Map<string, Promise<void>>();
const revisions = new Map<string, number>();
const advanceRevision = (profile: string) => revisions.set(profile, (revisions.get(profile) || 0) + 1);
let restoreVersion = 0;
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && v.length > 0 && v.length <= 256))] : [];
export interface NativeCorrelationWorkspace { markers: string[]; therapies: string[]; view: typeof state.correlationView }
export const currentCorrelationWorkspace = (): NativeCorrelationWorkspace => ({ markers: [...state.selectedCorrelationMarkers], therapies: [...state.selectedCorrelationSupplements], view: structuredClone(state.correlationView) });
const signature = () => JSON.stringify(currentCorrelationWorkspace());
const noChange = (message: string) => Object.assign(new Error(message), { noChangeApplied: true });
function enqueue<T>(profile: string, command: () => T | Promise<T>): Promise<T> {
  const pending = (writes.get(profile) || Promise.resolve()).then(() => {
    const locks = globalThis.navigator?.locks;
    return typeof locks?.request === 'function' ? runNativeCommandWithLocks(locks, [profileStorageKey(profile, 'correlation-workspace-lock')], command) : command();
  });
  const settled = pending.then(() => undefined, () => undefined); writes.set(profile, settled);
  void settled.finally(() => { if (writes.get(profile) === settled) writes.delete(profile); });
  return pending;
}
/** Capture both the exact durable footprint and current native selection after prior saves. */
export function readCorrelationWorkspaceSnapshot(profile: string) {
  return enqueue(profile, async () => ({ raw: await encryptedGetItem(profileStorageKey(profile, 'correlation-workspace'), { throwOnDecryptError: true }), state: signature(), workspace: currentCorrelationWorkspace() }));
}
/** Block tools before a native normalizer could discard an unfamiliar saved field. */
export function correlationWorkspaceIsSupported(raw: string | null, workspace: NativeCorrelationWorkspace): boolean {
  const viewKeys = ['rangePreset', 'grouping', 'layout', 'tab', 'start', 'end', 'inspectDate', 'pairKey', 'analysisOpen', 'hidden', 'ingredients', 'pair'];
  if (Object.keys(workspace.view).some(key => !viewKeys.includes(key))) return false;
  const stable = (value: unknown): string => JSON.stringify(value, function (_key, row: unknown) { return row && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row; });
  const view = { ...workspace.view, hidden: workspace.view.hidden ?? [], ingredients: workspace.view.ingredients ?? {} };
  if (view.pair !== undefined && !/^\d+$/.test(view.pair)) return false;
  delete view.pair;
  for (const key of ['start', 'end'] as const) if (view[key] === '') delete view[key];
  if (stable({ version: 1, ...workspace, view }) !== stable(normalizeCorrelationWorkspace(workspace))) return false;
  if (raw === null) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const saved = parsed as Record<string, unknown>;
    if (saved.version !== 1 || Object.keys(saved).some(key => !['version', 'markers', 'therapies', 'view'].includes(key))) return false;
    const normalized = normalizeCorrelationWorkspace(saved);
    return stable(saved) === stable(normalized);
  } catch { return false; }
}
/** Native UI and tool writes serialize together. Tools publish only after durable success. */
export function commitCorrelationWorkspace(profile: string, expected: { raw: string | null; state: string }, workspace: NativeCorrelationWorkspace, isCurrent: () => boolean, restore?: { raw: string | null }) {
  if (typeof globalThis.navigator?.locks?.request !== 'function') return Promise.reject(noChange('This browser cannot safely serialize correlation workspace edits. Use the native controls.'));
  advanceRevision(profile);
  return enqueue(profile, async () => {
    const current = () => state.currentProfile === profile && isCurrent() && signature() === expected.state;
    if (!current()) throw noChange('The native correlation workspace changed. Read it again.');
    const key = profileStorageKey(profile, 'correlation-workspace'), raw = await encryptedGetItem(key, { throwOnDecryptError: true });
    if (raw !== expected.raw || !current() || !correlationWorkspaceIsSupported(raw, currentCorrelationWorkspace())) throw noChange('The saved correlation workspace changed or is unsupported. Read it again.');
    const before = currentCorrelationWorkspace(), after = structuredClone(workspace), afterRaw = restore ? restore.raw : JSON.stringify(normalizeCorrelationWorkspace(after));
    const settingsSaved = raw !== afterRaw, stateChanged = JSON.stringify(before) !== JSON.stringify(after);
    if (settingsSaved) try { if (afterRaw === null) await encryptedRemoveItem(key); else await encryptedSetItem(key, afterRaw); if (await encryptedGetItem(key, { throwOnDecryptError: true }) !== afterRaw) throw new Error('Correlation preference write was not confirmed.'); }
    catch {
      try { if (raw === null) await encryptedRemoveItem(key); else await encryptedSetItem(key, raw); if (await encryptedGetItem(key, { throwOnDecryptError: true }) !== raw) throw new Error('Correlation rollback was not confirmed.'); }
      catch { throw Object.assign(new Error('Correlation preference storage could not be confirmed or restored. Check the native workspace before trying again.'), { persistenceUncertain: true }); }
      throw noChange('Correlation preferences could not be saved. The previous preferences were restored.');
    }
    const published = current();
    if (published) { state.selectedCorrelationMarkers = [...after.markers]; state.selectedCorrelationSupplements = [...after.therapies]; state.correlationView = structuredClone(after.view); }
    return { before, after, beforeRaw: raw, afterRaw, settingsSaved, stateChanged: published && stateChanged, published };
  });
}

/** Keep a small versioned preference record, never chart objects or lab values. */
export function normalizeCorrelationWorkspace(input: unknown) {
  const markers = strings((input as CorrelationWorkspaceInput | null | undefined)?.markers).slice(0, 8);
  const therapies = strings((input as CorrelationWorkspaceInput | null | undefined)?.therapies).slice(0, 8 - markers.length);
  const raw = ((input as CorrelationWorkspaceInput | null | undefined)?.view || {}) as Record<string, unknown>;
  const view: CorrelationWorkspaceView = {};
  for (const [key, allowed] of Object.entries({ rangePreset: ['3m', '6m', '1y', 'all', 'custom'], grouping: ['combined', 'separate'], layout: ['overlay', 'lanes'], tab: ['timeline', 'scatter', 'data'] })) {
    if (allowed.includes(raw[key] as string)) view[key] = raw[key];
  }
  for (const key of ['start', 'end', 'inspectDate']) if (typeof raw[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw[key])) view[key] = raw[key];
  if (typeof raw.pairKey === 'string' && raw.pairKey.length <= 1024) view.pairKey = raw.pairKey;
  if (typeof raw.analysisOpen === 'boolean') view.analysisOpen = raw.analysisOpen;
  view.hidden = strings(raw.hidden).filter(id => markers.includes(id) || therapies.includes(id));
  view.ingredients = Object.fromEntries(therapies.flatMap(id => typeof (raw.ingredients as Record<string, unknown> | null | undefined)?.[id] === 'string' && (raw.ingredients as Record<string, string>)[id]!.length <= 256 ? [[id, (raw.ingredients as Record<string, string>)[id]!]] : []));
  return { version: 1, markers, therapies, view };
}

export function saveCorrelationWorkspace() {
  const profile = state.currentProfile;
  if (!profile) return Promise.resolve();
  advanceRevision(profile);
  const workspace = currentCorrelationWorkspace(), value = JSON.stringify(normalizeCorrelationWorkspace(workspace));
  // Serialize encryption/writes so a slower earlier edit cannot overwrite a later one.
  return enqueue(profile, async () => {
    const key = profileStorageKey(profile, 'correlation-workspace'), raw = await encryptedGetItem(key, { throwOnDecryptError: true });
    if (!correlationWorkspaceIsSupported(raw, workspace)) throw noChange('These correlation preferences contain an unsupported value.');
    if (raw !== value) await encryptedSetItem(key, value);
  }).catch(() => {
    if (state.currentProfile === profile) showNotification('Could not save the correlation workspace. Your current view is still available.', 'error');
  });
}

export async function restoreCorrelationWorkspace(profile: string) {
  const version = ++restoreVersion, revision = revisions.get(profile) || 0;
  try {
    const raw = await enqueue(profile, () => encryptedGetItem(profileStorageKey(profile, 'correlation-workspace')));
    if (state.currentProfile !== profile || version !== restoreVersion || revision !== (revisions.get(profile) || 0)) return;
    const saved = raw ? JSON.parse(raw) : null;
    const workspace = normalizeCorrelationWorkspace(saved?.version === 1 ? saved : null);
    state.selectedCorrelationMarkers = workspace.markers;
    state.selectedCorrelationSupplements = workspace.therapies;
    state.correlationView = workspace.view;
  } catch {
    if (state.currentProfile === profile && version === restoreVersion && revision === (revisions.get(profile) || 0)) showNotification('Could not restore the saved correlation workspace. Select your items again.', 'error');
  }
}
