// Captured-profile transactions publish marker edits only after exact reviewed data commits.
import type { ProfileData } from '../types/app-state.js';
import type { LabMarkerCommand } from './lab-marker-mutations.js';
import { applyLabMarkerCommand } from './lab-marker-mutations.js';
import { profileDataBaseline, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { selectLabPanel } from './lab-panel-mutations.js';
import { identifyLabPanels, labPanelId } from './lab-panel-identity.js';
import { labDateDeletionState, labPanelTombstoneKey, filterRemovedLabDates, filterRemovedLabPanels } from './lab-panel-deletions.js';
import type { ProfileSaveOptions } from './data-core-types.js';
export async function commitLabMarkerCommand(profileId: string, observed: ProfileData, command: LabMarkerCommand, authorized: () => boolean = () => true,
  reviewExpectations: Pick<ProfileSaveOptions, 'expectedContextField' | 'expectedProfileMapEntries'> = {}) {
  const denied = (): never => { throw Object.assign(new Error('This lab edit is no longer authorized. No change was applied.'), { noChangeApplied: true }); };
  if (!authorized()) denied();
  const base = structuredClone(profileDataBaseline(observed) || observed), next = structuredClone(base);
  next.entries = filterRemovedLabDates(filterRemovedLabPanels(identifyLabPanels(next.entries || []), next.labPanelTombstones), next) as ProfileData['entries'];
  const selected = command.newPanel ? null : selectLabPanel(next, command.date, command.panelId);
  const result = applyLabMarkerCommand(next, command);
  if (!result || command.kind === 'remove' && !result.changed) return null;
  const noteKey = `${command.dotKey}:${command.date}`, id = selected ? labPanelId(selected) : command.panelId;
  const expected: NonNullable<ProfileSaveOptions['expectedProfileMapEntries']> = [
    { key: 'manualValues', id: noteKey, value: observed.manualValues?.[noteKey] ?? null },
    { key: 'markerValueNotes', id: noteKey, value: observed.markerValueNotes?.[noteKey] ?? null },
  ];
  if (id) { const key = labPanelTombstoneKey(id, command.date); expected.push({ key: 'labPanelTombstones', id: key, value: observed.labPanelTombstones?.[key] ?? null }); }
  let changed = false, revoked = false;
  const options: ProfileSaveOptions = { ...reviewExpectations, baseData: base, forceProfileScope: true, expectedProfileMapEntries: [...expected, ...(reviewExpectations.expectedProfileMapEntries || [])],
    expectedLabDateRecords: [{ date: command.date, value: structuredClone((observed.entries || []).filter(row => row.date === command.date)), deletion: labDateDeletionState(observed, command.date) }],
    onContextFieldConflict: () => { changed = true; }, canCommit: () => { if (!authorized()) revoked = true; return !revoked; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (revoked) denied();
    if (changed) throw Object.assign(new Error('This sample changed before the edit was saved. Reload its results. No change was applied.'), { noChangeApplied: true });
    throw new Error('Could not save this lab edit.');
  }
  let published = result;
  try {
    if (state.currentProfile !== profileId || state.importedData !== observed) {
      const rebased = rebaseLiveProfileData(base, observed, profileDataBaseline(next) || next);
      adoptProfileData(observed, rebased.data); rememberProfileData(observed, rebased.baseline);
    }
    if ('markers' in result) published = selectLabPanel(observed, command.date, command.panelId || (typeof result.panelId === 'string' ? result.panelId : undefined)) || result;
  } catch { /* Presentation cannot turn an accepted write into a failure. */ }
  try { notifyProfileDataContextChanged(profileId); } catch { /* The write already committed. */ }
  return published;
}
