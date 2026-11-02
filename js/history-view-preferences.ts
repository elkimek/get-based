// Native UI controllers and chat share these exact display-preference keys and writes.
import { HISTORY_VIEW_KEYS, NUTRITION_VIEW_RANGES, WEARABLE_VIEW_RANGES, parseHistoryViewPatch } from '../shared/history-view-contract.js';
import type { HistoryViewPatch, HistoryViewPreferences } from '../shared/history-view-contract.js';
import { state } from './state.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
type Key = keyof HistoryViewPreferences;
export type HistoryViewFootprint = Record<Key, string | null>;
const keyFor = (field: Key, profile: string) => ({ nutritionRange: 'nutrition-history-range', nutritionView: 'nutrition-history-view', wearableRange: 'wearable-detail-range', stripHidden: `wearables-strip-hidden-${profile || 'default'}`, stripCollapsed: 'wearables-strip-collapsed' })[field];
const nextRaw = (field: Key, value: HistoryViewPreferences[Key]) => field === 'stripHidden' ? value ? '1' : null : field === 'stripCollapsed' ? value ? '1' : '0' : String(value);
export function readHistoryViewPreferences(profile = state.currentProfile) {
  const footprint = Object.fromEntries(HISTORY_VIEW_KEYS.map(field => [field, localStorage.getItem(keyFor(field, profile))])) as HistoryViewFootprint;
  const values: HistoryViewPreferences = {
    nutritionRange: NUTRITION_VIEW_RANGES.includes(footprint.nutritionRange as HistoryViewPreferences['nutritionRange']) ? footprint.nutritionRange as HistoryViewPreferences['nutritionRange'] : '30d',
    nutritionView: footprint.nutritionView === 'trends' ? 'trends' : 'meals',
    wearableRange: WEARABLE_VIEW_RANGES.includes(footprint.wearableRange as HistoryViewPreferences['wearableRange']) ? footprint.wearableRange as HistoryViewPreferences['wearableRange'] : '90d',
    stripHidden: footprint.stripHidden === '1', stripCollapsed: footprint.stripCollapsed === '1',
  };
  const recognized = Object.fromEntries(HISTORY_VIEW_KEYS.map(field => [field, footprint[field] === null || (['stripHidden', 'stripCollapsed'].includes(field) ? ['0', '1'].includes(footprint[field]!) : nextRaw(field, values[field]) === footprint[field])])) as Record<Key, boolean>;
  return { values, footprint, recognized };
}
export function historyPreferenceConflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
interface Options { profileId?: string; expected?: Partial<HistoryViewFootprint>; canCommit?: () => boolean; requireLocks?: boolean; restore?: Partial<HistoryViewFootprint> }
/** Synchronous compatibility primitive; actual native UI controllers call the locked async owner. */
export function writeHistoryViewPreferencesNow(input: HistoryViewPatch, options: Options = {}) {
  const patch = parseHistoryViewPatch(input), profile = options.profileId ?? state.currentProfile, fields = Object.keys(patch) as Key[];
  if (options.canCommit?.() === false) historyPreferenceConflict('The originating history view changed. Nothing was saved.');
  const before = readHistoryViewPreferences(profile);
  if (options.expected && fields.some(field => !Object.hasOwn(options.expected!, field) || options.expected![field] !== before.footprint[field])) historyPreferenceConflict('These history preferences changed. Read a fresh snapshot.');
  if (options.restore && fields.some(field => !Object.hasOwn(options.restore!, field) || options.restore![field] !== null && typeof options.restore![field] !== 'string')) throw new Error('Incomplete native history restoration footprint.');
  const attempted: Array<{ field: Key; key: string; prior: string | null; next: string | null }> = [];
  try {
    for (const field of fields) {
      if (options.canCommit?.() === false) historyPreferenceConflict('The history request ended before its preference commit completed.');
      const prior = before.footprint[field], next = options.restore ? options.restore[field]! : nextRaw(field, patch[field]!);
      if (prior === next) continue;
      const key = keyFor(field, profile); attempted.push({ field, key, prior, next }); if (next === null) localStorage.removeItem(key); else localStorage.setItem(key, next);
    }
    if (attempted.some(item => localStorage.getItem(item.key) !== item.next)) throw new Error('History preference persistence was not confirmed.');
  } catch {
    let uncertain = false;
    for (const item of attempted.reverse()) try { if (localStorage.getItem(item.key) === item.next) { if (item.prior === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.prior); } if (localStorage.getItem(item.key) !== item.prior) uncertain = true; } catch { uncertain = true; }
    if (uncertain) throw Object.assign(new Error('The history preference outcome is unconfirmed. Check native settings before trying again.'), { persistenceUncertain: true });
    historyPreferenceConflict('History preferences could not be saved. The previous values were restored.');
  }
  let after: ReturnType<typeof readHistoryViewPreferences>;
  try { after = readHistoryViewPreferences(profile); }
  catch { throw Object.assign(new Error('The history preference outcome could not be read back. Check native settings.'), { persistenceUncertain: attempted.length > 0 }); }
  return { profileId: profile, before, after, changed: attempted.map(item => item.field), scope: fields.map(field => ({ field, scope: field === 'stripHidden' ? 'profile' : 'browser' })) };
}
export async function commitHistoryViewPreferences(input: HistoryViewPatch | ((current: HistoryViewPreferences) => HistoryViewPatch), options: Options = {}) {
  const profile = options.profileId ?? state.currentProfile, root = state.importedData;
  const current = () => state.currentProfile === profile && state.importedData === root && options.canCommit?.() !== false;
  const write = () => { if (!current()) historyPreferenceConflict('The originating history profile changed. Nothing was saved.'); const patch = typeof input === 'function' ? input(readHistoryViewPreferences(profile).values) : input; return writeHistoryViewPreferencesNow(patch, { ...options, profileId: profile, canCommit: current }); };
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== 'function') { if (options.requireLocks) historyPreferenceConflict('Safe chat history changes need Web Locks. Use the native controls.'); return write(); }
  return runNativeCommandWithLocks(locks, ['getbased-history-preferences:browser', `getbased-history-preferences:profile:${profile}`], write);
}
