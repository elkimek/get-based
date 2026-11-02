// Native display-preference owner shared by UI controls and reviewed app actions.
// Display preferences never rewrite canonical measurements or profile health data.
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { normalizeUnitProfile } from './unit-profiles.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';

export interface DisplayPreferenceValues {
  unitSystem: 'EU' | 'ANZ' | 'US';
  showAltUnits: boolean;
  rangeMode: 'reference' | 'optimal' | 'both';
  timeFormat: '12h' | '24h';
}
export type DisplayPreferencePatch = Partial<DisplayPreferenceValues>;
export type DisplayPreferenceKey = keyof DisplayPreferenceValues;
const fields: readonly DisplayPreferenceKey[] = ['unitSystem', 'showAltUnits', 'rangeMode', 'timeFormat'];
export class DisplayPreferenceConflict extends Error { readonly noChangeApplied = true; }
export class DisplayPreferenceUncertain extends Error { readonly outcomeUnknown = true; }

export function getTimeFormat(): '12h' | '24h' { return localStorage.getItem('labcharts-time-format') === '12h' ? '12h' : '24h'; }
function storageKey(profile: string, field: DisplayPreferenceKey) {
  return field === 'timeFormat' ? 'labcharts-time-format' : profileStorageKey(profile, { unitSystem: 'units', showAltUnits: 'showAltUnits', rangeMode: 'rangeMode' }[field]);
}
export function readDisplayPreferences(profile = state.currentProfile): DisplayPreferenceValues {
  if (!profile || profile !== state.currentProfile) throw new DisplayPreferenceConflict('Switch back to the originating profile before reading its display preferences.');
  const units = localStorage.getItem(storageKey(profile, 'unitSystem'));
  const alt = localStorage.getItem(storageKey(profile, 'showAltUnits'));
  const range = localStorage.getItem(storageKey(profile, 'rangeMode')) ?? state.rangeMode;
  return { unitSystem: normalizeUnitProfile(units ?? state.unitSystem), showAltUnits: alt === null ? !!state.showAltUnits : alt === 'on',
    rangeMode: range === 'reference' ? 'reference' : range === 'both' ? 'both' : 'optimal', timeFormat: getTimeFormat() };
}
function validatePatch(value: unknown): DisplayPreferencePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Supply supported display-preference fields.');
  const patch = value as Record<string, unknown>;
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !fields.includes(key as DisplayPreferenceKey))) throw new Error('Supply only supported display-preference fields.');
  if (Object.hasOwn(patch, 'unitSystem') && (typeof patch.unitSystem !== 'string' || !['EU', 'ANZ', 'US'].includes(patch.unitSystem))) throw new Error('Choose EU, ANZ or US units.');
  if (Object.hasOwn(patch, 'showAltUnits') && typeof patch.showAltUnits !== 'boolean') throw new Error('Alternate units must be true or false.');
  if (Object.hasOwn(patch, 'rangeMode') && (typeof patch.rangeMode !== 'string' || !['reference', 'optimal', 'both'].includes(patch.rangeMode))) throw new Error('Choose reference, optimal or both ranges.');
  if (Object.hasOwn(patch, 'timeFormat') && (typeof patch.timeFormat !== 'string' || !['12h', '24h'].includes(patch.timeFormat))) throw new Error('Choose 12h or 24h time.');
  return { ...patch } as DisplayPreferencePatch;
}
export interface DisplayPreferenceCommitOptions {
  profileId?: string;
  expected?: DisplayPreferencePatch;
  requireLocks?: boolean;
  canCommit?: () => boolean;
}
export interface DisplayPreferenceReceipt {
  profileId: string;
  before: DisplayPreferenceValues;
  after: DisplayPreferenceValues;
  changed: DisplayPreferenceKey[];
  refresh: DisplayPreferenceKey[];
  scopes: { field: DisplayPreferenceKey; scope: 'profile' | 'browser' }[];
}
export async function commitDisplayPreferences(value: unknown, options: DisplayPreferenceCommitOptions = {}): Promise<DisplayPreferenceReceipt> {
  // Resolver functions are trusted native UI commands (for atomic toggles),
  // never model-supplied JSON. Validate their result inside the same lock.
  const resolve = typeof value === 'function' ? value as (current: Readonly<DisplayPreferenceValues>) => unknown : () => value;
  if (typeof value !== 'function') validatePatch(value);
  const profile = options.profileId ?? state.currentProfile, origin = state.importedData;
  const expected = options.expected === undefined ? undefined : validatePatch(options.expected);
  const current = () => !!profile && state.currentProfile === profile && state.importedData === origin && (!options.canCommit || options.canCommit());
  if (!current()) throw new DisplayPreferenceConflict('The display-preference owner changed. No change was applied.');
  const write = () => {
    if (!current()) throw new DisplayPreferenceConflict('The display-preference owner changed. No change was applied.');
    const before = readDisplayPreferences(profile);
    const patch = validatePatch(resolve({ ...before }));
    if (expected && fields.some(field => Object.hasOwn(expected, field) && expected[field] !== before[field])) throw new DisplayPreferenceConflict('These preferences changed. Read them again before changing or undoing them.');
    const after = { ...before, ...patch };
    const changed = fields.filter(field => Object.hasOwn(patch, field) && after[field] !== before[field]);
    // A different tab may already have saved the requested value while this
    // tab still displays its old state. Reconcile presentation even for a no-op
    // durable write. Clock views have no single cached state owner to compare.
    const cached = { unitSystem: state.unitSystem, showAltUnits: !!state.showAltUnits, rangeMode: state.rangeMode, timeFormat: before.timeFormat };
    const refresh = fields.filter(field => Object.hasOwn(patch, field) && (field === 'timeFormat' || after[field] !== before[field] || cached[field] !== after[field]));
    const attempted: { key: string; prior: string | null; next: string }[] = [];
    try {
      for (const field of changed) {
        const key = storageKey(profile, field), next = field === 'showAltUnits' ? (after.showAltUnits ? 'on' : 'off') : String(after[field]);
        attempted.push({ key, prior: localStorage.getItem(key), next });
        localStorage.setItem(key, next);
      }
    } catch (error) {
      let uncertain = false;
      for (const item of attempted.reverse()) {
        try { if (localStorage.getItem(item.key) === item.next) { if (item.prior === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.prior); } }
        catch { uncertain = true; }
      }
      if (uncertain) throw new DisplayPreferenceUncertain('The display change could not be fully confirmed. Read the current settings before trying again.');
      throw Object.assign(new Error('The display preferences could not be saved. No change was applied.', { cause: error }), { noChangeApplied: true });
    }
    // Publish only the fields this command actually owns, after durable storage.
    if (Object.hasOwn(patch, 'unitSystem')) state.unitSystem = after.unitSystem;
    if (Object.hasOwn(patch, 'showAltUnits')) state.showAltUnits = after.showAltUnits;
    if (Object.hasOwn(patch, 'rangeMode')) state.rangeMode = after.rangeMode;
    return { profileId: profile, before, after, changed, refresh, scopes: changed.map(field => ({ field, scope: field === 'timeFormat' ? 'browser' as const : 'profile' as const })) };
  };
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) {
    if (options.requireLocks) throw new DisplayPreferenceConflict('This browser cannot safely coordinate chat preference changes. Use the native Display settings.');
    return write();
  }
  // Native controls and chat share these locks, including the browser-wide clock.
  return runNativeCommandWithLocks(locks, ['getbased-display-preferences:browser', `getbased-display-preferences:profile:${profile}`], write);
}

export async function setTimeFormat(format: string): Promise<void> {
  await commitDisplayPreferences({ timeFormat: format });
}
