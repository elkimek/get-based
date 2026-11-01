// Native controls and chat stage the same profile-scoped presentation keys.
import { state } from './state.js';
import { profileStorageKey } from './profile.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
export const DASHBOARD_PREFERENCE_KINDS = ['widgets', 'biometrics', 'pins'] as const;
export type DashboardPreferenceKind = typeof DASHBOARD_PREFERENCE_KINDS[number];
export type DashboardPreferenceFootprint = Record<DashboardPreferenceKind, string | null>;
const suffixes = { widgets: 'dashboardWidgetsV13', biometrics: 'dashboardBiometricMetricsV1', pins: 'dashboardQuickMarkerPinsV1' } as const;
export const dashboardPreferenceKey = (kind: DashboardPreferenceKind, profile = state.currentProfile || 'default') => profileStorageKey(profile, suffixes[kind]);
interface Transaction { profile: string; before: DashboardPreferenceFootprint; pending: Partial<DashboardPreferenceFootprint>; effects: Array<() => unknown> }
let transaction: Transaction | null = null;
const conflict = (message: string): never => { throw Object.assign(new Error(message), { noChangeApplied: true }); };
export function readDashboardPreferenceRaw(kind: DashboardPreferenceKind, profile = state.currentProfile || 'default') {
  if (transaction && transaction.profile === profile) return Object.hasOwn(transaction.pending, kind) ? transaction.pending[kind]! : transaction.before[kind];
  return localStorage.getItem(dashboardPreferenceKey(kind, profile));
}
export function readDashboardPreferenceFootprint(profile = state.currentProfile || 'default'): DashboardPreferenceFootprint {
  return Object.fromEntries(DASHBOARD_PREFERENCE_KINDS.map(kind => [kind, readDashboardPreferenceRaw(kind, profile)])) as DashboardPreferenceFootprint;
}
/** Legacy synchronous setters keep their contract. Native events use the guarded batch below. */
export function writeDashboardPreferenceRaw(kind: DashboardPreferenceKind, raw: string | null, profile = state.currentProfile || 'default') {
  if (!DASHBOARD_PREFERENCE_KINDS.includes(kind) || raw !== null && typeof raw !== 'string') throw new Error('Invalid native dashboard preference.');
  if (transaction) { if (transaction.profile !== profile) conflict('The dashboard preference belongs to another profile.'); transaction.pending[kind] = raw; return; }
  const key = dashboardPreferenceKey(kind, profile); if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
}
export function afterDashboardPreferenceCommit(effect: () => unknown) { if (transaction) transaction.effects.push(effect); else effect(); }
interface Options { profileId?: string; expected?: Partial<DashboardPreferenceFootprint>; canCommit?: () => boolean; canPublish?: () => boolean; requireLocks?: boolean }
export async function runDashboardPreferenceCommand<T>(command: () => T, options: Options = {}) {
  if (transaction || command.constructor.name === 'AsyncFunction') throw new Error('Native dashboard staging must be a synchronous, non-nested command.');
  const profile = options.profileId ?? (state.currentProfile || 'default'), root = state.importedData;
  const current = () => { try { return (state.currentProfile || 'default') === profile && state.importedData === root && options.canCommit?.() !== false; } catch { return false; } };
  const run = () => {
    if (!current()) conflict('The originating dashboard view changed. Nothing was saved.');
    if (transaction) throw new Error('Dashboard preference transactions cannot be nested.');
    const owned: Transaction = { profile, before: readDashboardPreferenceFootprint(profile), pending: {}, effects: [] };
    let value: T;
    transaction = owned;
    try { value = command(); if (value && typeof (value as { then?: unknown }).then === 'function') throw new Error('Native dashboard staging must be synchronous.'); }
    finally { transaction = null; }
    const fields = Object.keys(owned.pending) as DashboardPreferenceKind[];
    if (!current()) conflict('The originating dashboard view changed before its preference commit.');
    if (options.expected && fields.some(kind => !Object.hasOwn(options.expected!, kind) || options.expected![kind] !== owned.before[kind])) conflict('These dashboard preferences changed. Read a fresh snapshot.');
    const attempted: Array<{ kind: DashboardPreferenceKind; key: string; before: string | null; after: string | null }> = [];
    try {
      for (const kind of fields) {
        if (!current()) conflict('The dashboard request ended before its preference commit completed.');
        const prior = owned.before[kind], next = owned.pending[kind]!, key = dashboardPreferenceKey(kind, profile);
        if (localStorage.getItem(key) !== prior) conflict('These dashboard preferences changed before saving.');
        if (prior === next) continue;
        attempted.push({ kind, key, before: prior, after: next }); if (next === null) localStorage.removeItem(key); else localStorage.setItem(key, next);
      }
      if (attempted.some(item => localStorage.getItem(item.key) !== item.after)) throw new Error('Dashboard preference persistence was not confirmed.');
    } catch {
      let uncertain = false;
      for (const item of attempted.reverse()) try { if (localStorage.getItem(item.key) === item.after) { if (item.before === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.before); } if (localStorage.getItem(item.key) !== item.before) uncertain = true; } catch { uncertain = true; }
      if (uncertain) throw Object.assign(new Error('The dashboard preference outcome is unconfirmed. Check Customize before trying again.'), { persistenceUncertain: true });
      conflict('Dashboard preferences could not be saved. Previous values were restored.');
    }
    const changed = attempted.map(item => item.kind), after = { ...owned.before, ...owned.pending };
    let presentationFailed = false, effectsApplied = false;
    const canPublish = () => { try { return (state.currentProfile || 'default') === profile && state.importedData === root && (options.canPublish || options.canCommit)?.() !== false; } catch { return false; } };
    if (canPublish()) { effectsApplied = true; for (const effect of owned.effects) { if (!canPublish()) { effectsApplied = false; break; } try { effect(); } catch { presentationFailed = true; } } }
    return { value, profileId: profile, before: owned.before, after, changed, settingsSaved: changed.length > 0, dataSaved: false as const, effectsApplied, presentationFailed };
  };
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== 'function') { if (options.requireLocks) conflict('Safe chat dashboard changes need Web Locks. Use the native controls.'); return run(); }
  return runNativeCommandWithLocks(locks, [profileStorageKey(profile, 'dashboard-presentation-lock')], run);
}
