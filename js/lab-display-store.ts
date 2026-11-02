// Durable display metadata commands shared by native editors and chat review.
import type { ProfileSaveOptions } from './data-core-types.js';
import type { LabDisplayResource, LabDisplaySnapshot, LabDisplayCommand } from './lab-display-core.js';
import { labDisplayRecord, labDisplayState, nativeLabDisplayChoices, applyNativeLabDisplay } from './lab-display-core.js';
import { customMarkerRevision } from './custom-marker-store.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { isActiveProfileDataOwner } from './profile.js';
import { state } from './state.js';

function conflict(message: string): never { throw Object.assign(new Error(message), { noChangeApplied: true }); }
function scope(profileId: string, allowed?: () => boolean) {
  const root = state.importedData, current = () => state.currentProfile === profileId && state.importedData === root && isActiveProfileDataOwner(profileId, root) && allowed?.() !== false;
  if (!current()) conflict('The originating profile or lab editor changed. Nothing was applied.');
  return { root, current, check: () => { if (!current()) conflict('The originating profile or lab editor changed. Nothing was applied.'); } };
}
export async function nativeLabDisplaySnapshot(data: Parameters<typeof labDisplayState>[0], resource: LabDisplayResource, id: string): Promise<LabDisplaySnapshot> {
  return { version: 1, resource, record: labDisplayRecord(data, resource, id), choices: nativeLabDisplayChoices(data, resource, id), revision: await customMarkerRevision(labDisplayState(data, resource, id)) };
}
export async function readNativeLabDisplay(profileId: string, resource: LabDisplayResource, id: string, allowed?: () => boolean) {
  const owner = scope(profileId, allowed), data = await readAgentProfileRecords(profileId), snapshot = await nativeLabDisplaySnapshot(data, resource, id); owner.check(); return snapshot;
}
export async function commitNativeLabDisplay(profileId: string, expected: LabDisplaySnapshot, command: LabDisplayCommand, allowed?: () => boolean) {
  const owner = scope(profileId, allowed), { resource, record: { id } } = expected, base = await readAgentProfileRecords(profileId);
  const current = await nativeLabDisplaySnapshot(base, resource, id); owner.check();
  if (current.revision !== expected.revision || !profileDataValuesEqual(current.record, expected.record)) conflict('This lab label, definition or placement changed. Read a new review.');
  const before = labDisplayState(base, resource, id), canCommit = () => owner.current() && profileDataValuesEqual(labDisplayState(owner.root, resource, id), before);
  if (!canCommit()) conflict('Save or resolve pending native lab edits first. Your input is kept.');
  const next = structuredClone(base), result = applyNativeLabDisplay(next, resource, id, command);
  let changed = false, revoked = false;
  const options: ProfileSaveOptions = { baseData: base, forceProfileScope: true, reason: 'lab-display',
    expectedContextFields: [{ key: 'customMarkers', value: base.customMarkers ?? null }, { key: 'categoryLabels', value: base.categoryLabels ?? null }, ...(resource === 'markerDisplay' ? [{ key: 'markerPlacements' as const, value: base.markerPlacements ?? null }] : [])],
    ...(resource === 'markerDisplay' ? { expectedProfileMapEntries: [{ key: 'markerLabels', id, value: base.markerLabels?.[id] ?? null }] } : {}),
    onContextFieldConflict: () => { changed = true; }, canCommit: () => { revoked ||= !canCommit(); return !revoked; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (changed || revoked) conflict('The selected lab metadata or editing context changed before saving. Nothing was applied.');
    throw new Error('The lab display change could not be saved. Check its native editor before retrying.');
  }
  try { notifyProfileDataContextChanged(profileId); } catch { /* Already durable. */ }
  return result;
}
