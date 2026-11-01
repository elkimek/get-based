// Native UI and chat share durable overlay switches; no health records are read or written.
import { parseLabOverlayPatch } from '../shared/lab-overlay-contract.js';
import type { LabOverlayKey, LabOverlayPatch } from '../shared/lab-overlay-contract.js';
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
const fields: LabOverlayKey[] = ['notes', 'supplements', 'cycle'];
const storage = { notes: 'noteOverlay', supplements: 'suppOverlay', cycle: 'phaseOverlay' };
const cached = { notes: 'noteOverlayMode', supplements: 'suppOverlayMode', cycle: 'phaseOverlayMode' } as const;
export function overlayConflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
export function readLabOverlayPreferences(profile = state.currentProfile): Record<LabOverlayKey, boolean> {
  if (!profile || profile !== state.currentProfile) overlayConflict('The originating overlay profile changed. Nothing was applied.');
  return Object.fromEntries(fields.map(field => [field, localStorage.getItem(profileStorageKey(profile, storage[field])) === 'on'])) as Record<LabOverlayKey, boolean>;
}
export async function commitLabOverlayPreferences(raw: unknown, options: { profileId?: string; expected?: LabOverlayPatch; requireLocks?: boolean; canCommit?: () => boolean } = {}) {
  const patch = parseLabOverlayPatch(raw), expected = options.expected === undefined ? undefined : parseLabOverlayPatch(options.expected);
  if (!patch || expected === null) throw new Error('Choose only the declared overlay switches and boolean values.');
  const profile = options.profileId ?? state.currentProfile, root = state.importedData;
  const current = () => state.currentProfile === profile && state.importedData === root && options.canCommit?.() !== false;
  const write = () => {
    if (!current()) overlayConflict('The originating overlay profile or editor changed. Nothing was applied.');
    const before = readLabOverlayPreferences(profile);
    if (expected && Object.entries(expected).some(([key, value]) => before[key as LabOverlayKey] !== value)) overlayConflict('These overlay switches changed. Read a fresh review before applying or undoing.');
    const after = { ...before, ...patch }, changed = fields.filter(field => Object.hasOwn(patch, field) && before[field] !== after[field]);
    const attempted: Array<{ key: string; prior: string | null; next: string }> = [];
    try {
      for (const field of changed) { const key = profileStorageKey(profile, storage[field]), next = after[field] ? 'on' : 'off'; attempted.push({ key, prior: localStorage.getItem(key), next }); localStorage.setItem(key, next); }
    } catch (cause) {
      let uncertain = false;
      for (const item of attempted.reverse()) try { if (localStorage.getItem(item.key) === item.next) { if (item.prior === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.prior); } } catch { uncertain = true; }
      if (uncertain) throw new Error('The overlay preference outcome is unconfirmed. Check the native Layers menu before trying again.', { cause });
      overlayConflict('The overlay switches could not be saved. Nothing was applied.');
    }
    for (const field of fields) if (Object.hasOwn(patch, field)) state[cached[field]] = after[field] ? 'on' : 'off';
    return { before, after, changed };
  };
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) { if (options.requireLocks) overlayConflict('Safe chat overlay changes require Web Locks. Use the native Layers menu.'); return write(); }
  return runNativeCommandWithLocks(locks, [`getbased-lab-overlays:${profile}`], write);
}
