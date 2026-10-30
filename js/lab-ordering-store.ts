// Durable profile-scoped ordering owner. Reviewed chat and native forms share this boundary.
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { saveImportedDataForProfile } from './data.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { customMarkerRevision } from './custom-marker-store.js';
import { nativeLabOrderState, nativeLabOrderRecord, applyNativeLabOrder } from './lab-ordering-native.js';
import type { NativeLabOrderCommand } from './lab-ordering-native.js';
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from './data-core-types.js';
export interface NativeLabOrderSnapshot { version: 1; scopeId: string; record: ReturnType<typeof nativeLabOrderRecord>; revision: string }
function conflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
function owner(profileId: string, allowed?: () => boolean) {
  const root = state.importedData, current = () => state.currentProfile === profileId && state.importedData === root && isActiveProfileDataOwner(profileId, root) && allowed?.() !== false;
  const check = () => { if (!current()) conflict('The originating profile or ordering editor changed. Nothing was applied.'); }; check(); return { root, current, check };
}
export async function nativeLabOrderSnapshot(data: Partial<ProfileData>, scopeId: string): Promise<NativeLabOrderSnapshot> {
  return { version: 1, scopeId, record: nativeLabOrderRecord(data, scopeId), revision: await customMarkerRevision(nativeLabOrderState(data, scopeId)) };
}
export async function readNativeLabOrder(profileId: string, scopeId: string, allowed?: () => boolean) {
  const scope = owner(profileId, allowed), data = await readAgentProfileRecords(profileId), snapshot = await nativeLabOrderSnapshot(data, scopeId); scope.check(); return snapshot;
}
export async function commitNativeLabOrder(profileId: string, expected: NativeLabOrderSnapshot, command: NativeLabOrderCommand, allowed?: () => boolean) {
  const scope = owner(profileId, allowed), base = await readAgentProfileRecords(profileId), current = await nativeLabOrderSnapshot(base, expected.scopeId); scope.check();
  if (current.revision !== expected.revision || !profileDataValuesEqual(current.record, expected.record)) conflict('The lab order, label, definition or placement changed. Read a new review.');
  const before = nativeLabOrderState(base, expected.scopeId), canCommit = () => scope.current() && profileDataValuesEqual(nativeLabOrderState(scope.root, expected.scopeId), before);
  if (!canCommit()) conflict('Save or resolve pending native lab edits first. Your input is kept.');
  const next = structuredClone(base), result = applyNativeLabOrder(next, expected.scopeId, command);
  const snapshot = await nativeLabOrderSnapshot(next, expected.scopeId);
  let changed = false, revoked = false;
  const options: ProfileSaveOptions = { baseData: base, forceProfileScope: true, reason: 'lab-ordering',
    expectedContextFields: ['customMarkers', 'markerPlacements', 'categoryLabels', 'markerLabels'].map(key => ({ key: key as 'customMarkers' | 'markerPlacements' | 'categoryLabels' | 'markerLabels', value: base[key] ?? null })),
    expectedProfileMapEntries: [{ key: 'labOrdering', id: expected.scopeId, value: base.labOrdering?.[expected.scopeId] ?? null }],
    onContextFieldConflict: () => { changed = true; }, canCommit: () => { revoked ||= !canCommit(); return !revoked; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (changed || revoked) conflict('The selected lab order or editing context changed before saving. Nothing was applied.');
    throw new Error('The lab ordering change could not be saved. Your input is kept for retry.');
  }
  // The scoped save schedules sync and invalidates presentation data. Ordering
  // does not change clinical context or request a context/gateway republish.
  return { ...result, snapshot };
}
