// Serialize short Sun writes; weather work stays outside the canonical queue.
import type { ProfileData } from '../types/app-state.js';
import { state } from './state.js';
import { profileDataBaseline, profileDataValuesEqual } from './profile-data-writes.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { commitSunDataWrite } from './sun-setup-store.js';
export const SUN_SESSION_PAYLOAD_FIELDS = ['sunSessions', '_deleted', '_deletedAt', '_deletedClearedAt'] as const;
export const SUN_SESSION_FIELDS = [...SUN_SESSION_PAYLOAD_FIELDS, 'sunDefaults', 'lightCircadian'] as const;
export function sameSunSessionSource(left: ProfileData, right: ProfileData) {
  const empty = (value: unknown) => value == null || Array.isArray(value) && value.length === 0 || typeof value === 'object' && value !== null && Object.keys(value).length === 0 ? null : value;
  return SUN_SESSION_FIELDS.every(key => profileDataValuesEqual(empty(left[key]), empty(right[key])));
}
const queues = new Map<string, Promise<unknown>>();
export function hasPendingSunSessionWrites(profile = state.currentProfile) { return queues.has(profile); }
export function queueSunSessionWrite<T>(profile: string, action: () => Promise<T>): Promise<T> {
  const pending = (queues.get(profile) || Promise.resolve()).then(action), settled = pending.catch(() => {});
  queues.set(profile, settled); void settled.then(() => { if (queues.get(profile) === settled) queues.delete(profile); }); return pending;
}
export function stageSunSessionChange<T>(mutate: (next: ProfileData, source: ProfileData) => { value: T; publish?: (() => void) | undefined; skip?: boolean }, canCommit = () => true, canPublish = canCommit, expectedSource?: ProfileData, onSaved?: () => void): Promise<T | null> {
  const profile = state.currentProfile, origin = state.importedData;
  const current = () => state.currentProfile === profile && state.importedData === origin && canCommit();
  return queueSunSessionWrite(profile, async () => {
    if (!origin || !current()) return null;
    const remembered = profileDataBaseline(origin), source = structuredClone(origin);
    let base = structuredClone(remembered || await readAgentProfileRecords(profile));
    if (!current()) return null;
    // A never-saved empty profile has no array/map values on disk yet. A fresh
    // unremembered root must still match any existing saved Sun data.
    if (!remembered || !remembered.sunSessions?.length) {
      const durable = remembered ? await readAgentProfileRecords(profile) : base;
      const expected = remembered || source;
      if (!sameSunSessionSource(expected, durable)) throw Object.assign(new Error('Sun session source changed. Reload this profile.'), { noChangeApplied: true });
      base = structuredClone(durable);
    }
    if (!current()) return null;
    if (expectedSource && (!sameSunSessionSource(expectedSource, source) || !sameSunSessionSource(expectedSource, base))) throw Object.assign(new Error('Sun session source changed. Read the timer again.'), { noChangeApplied: true });
    const next = structuredClone(base);
    for (const key of SUN_SESSION_PAYLOAD_FIELDS) {
      if (Object.hasOwn(source, key)) Object.assign(next, { [key]: structuredClone(source[key]) }); else delete next[key];
    }
    const result = mutate(next, source); if (result.skip) return result.value;
    const saved = await commitSunDataWrite(profile, origin, base, source, next, SUN_SESSION_FIELDS, SUN_SESSION_PAYLOAD_FIELDS, current);
    if (!saved.saved && !current()) return null;
    if (!saved.saved) throw Object.assign(new Error(saved.conflict ? 'Sun session source changed. Read it again.' : 'Sun session could not be saved'), { noChangeApplied: true });
    onSaved?.();
    if (state.currentProfile === profile && state.importedData === origin && canPublish()) result.publish?.();
    return state.currentProfile === profile && state.importedData === origin ? result.value : null;
  });
}
