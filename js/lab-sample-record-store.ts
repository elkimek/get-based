// Sample moves guard both dates and global identity before publishing any values.
import type { ProfileData } from '../types/app-state.js';
import type { ProfileSaveOptions } from './data-core-types.js';
import type { LabSampleCommand } from './lab-sample-mutations.js';
import { applyLabSampleCommand, activeLabSampleData, labSampleIdentityRows, selectLabSample } from './lab-sample-mutations.js';
import { labDateDeletionState, labPanelTombstoneKey } from './lab-panel-deletions.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataBaseline, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { state } from './state.js';

export async function commitLabSampleCommand(profileId: string, observed: ProfileData, command: LabSampleCommand, authorized: () => boolean,
  expectations: Pick<ProfileSaveOptions, 'expectedContextField' | 'expectedProfileMapEntries'> = {}) {
  const denied = (): never => { throw Object.assign(new Error('This sample change is no longer authorized. No change was applied.'), { noChangeApplied: true }); };
  if (!authorized()) denied();
  const base = structuredClone(profileDataBaseline(observed) || observed), next = structuredClone(base), before = selectLabSample(activeLabSampleData(base), command.panelId);
  const result = applyLabSampleCommand(next, command), dates = [...new Set([before?.date, result.date].filter((value): value is string => !!value))];
  const keys = new Set([...Object.keys(before?.markers || {}), ...Object.keys(result.markers)]);
  const maps: NonNullable<ProfileSaveOptions['expectedProfileMapEntries']> = [...(expectations.expectedProfileMapEntries || [])];
  for (const date of dates) {
    const id = labPanelTombstoneKey(command.panelId, date); maps.push({ key: 'labPanelTombstones', id, value: observed.labPanelTombstones?.[id] ?? null });
    for (const markerKey of keys) for (const key of ['manualValues', 'markerValueNotes'] as const) { const id = `${markerKey}:${date}`; maps.push({ key, id, value: observed[key]?.[id] ?? null }); }
  }
  let changed = false, revoked = false;
  const options: ProfileSaveOptions = { ...expectations, baseData: base, forceProfileScope: true, expectedProfileMapEntries: maps,
    expectedLabPanelRecords: [{ panelId: command.panelId, value: labSampleIdentityRows(observed, command.panelId) }],
    expectedLabDateRecords: dates.map(date => ({ date, value: observed.entries.filter(entry => entry.date === date), deletion: labDateDeletionState(observed, date) })),
    canCommit: () => { if (!authorized()) revoked = true; return !revoked; }, onContextFieldConflict: () => { changed = true; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (revoked) denied();
    if (changed) throw Object.assign(new Error('This sample, destination date or shared context changed before saving. Read it again. No change was applied.'), { noChangeApplied: true });
    throw new Error('Could not save this sample change.');
  }
  try {
    if (state.currentProfile !== profileId || state.importedData !== observed) {
      const rebased = rebaseLiveProfileData(base, observed, profileDataBaseline(next) || next);
      adoptProfileData(observed, rebased.data); rememberProfileData(observed, rebased.baseline);
    }
    notifyProfileDataContextChanged(profileId);
  } catch { /* The durable commit has already succeeded. */ }
  return result;
}
