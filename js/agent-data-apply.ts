import { captureChatControlAuthorization } from './chat-control-settings.js';
import { chatDataPatchAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { isEMFResource } from './emf-record-fields.js';
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { isAgentDataEnabled } from './agent-data-bindings.js';
import { AGENT_DATA_LABELS, agentDataIdentity, findAgentDataRecord, projectAgentDataChange, applyAgentDataChange, projectChatProfileRecord } from './agent-health-data-model.js';
import type { ProfileSaveOptions } from './data-core-types.js';
import { updateProfileMeta, refreshProfileMetaRuntime } from './profile.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import type { StoredProfileRecord } from './profile-list-store.js';
import { commitReviewedNutritionRecord } from './nutrition-record-store.js';
import { commitReviewedManualRecord } from './manual-record-store.js';
import { commitReviewedMarkerNote } from './marker-note-records.js';
import { commitReviewedLabSample } from './lab-sample-records.js';
import { commitReviewedLabResult } from './lab-result-records.js';
import { isLightMeasurementResource } from './light-measurement-fields.js';
import { isLightDeviceResource } from './light-device-fields.js';
import { isLightEnvironmentResource } from './light-env-mutations.js';
import { isGeneticsResource } from './genetics-proposals.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';

function conflict(): never { throw Object.assign(new Error('This record changed since the proposal. Ask for a new proposal. No change was applied.'), { noChangeApplied: true }); }
export async function applyAgentDataProposal(value: unknown, profileId: string, controlsCurrent: () => boolean = () => true) {
  const authorization = captureChatControlAuthorization(); authorization.assert();
  const proposal = normalizeAgentDataProposal(value);
  if (!proposal) throw new Error('Invalid data proposal.');
  if (!chatDataPatchAllowed(proposal.resource, proposal.operation, parseAgentDataPatch(proposal.patch))) throw Object.assign(new Error(CHAT_NATIVE_UI_NOTICE), { noChangeApplied: true });
  const authorized = () => authorization.current() && controlsCurrent() && state.currentProfile === profileId && isAgentDataEnabled(proposal.resource);
  const denied = (): never => { throw Object.assign(new Error('This profile or data source is disabled or no longer authorized. No change was applied.'), { noChangeApplied: true }); };
  if (!authorized()) denied();

  if (isEMFResource(proposal.resource)) { projectAgentDataChange(proposal); return (await import('./emf-records.js')).commitReviewedEMFRecord(profileId, proposal, authorized); }
  if (proposal.resource === 'sunSessions') { projectAgentDataChange(proposal); return (await import('./sun-session-records.js')).commitReviewedSunSession(profileId, proposal, authorized); }
  if (proposal.resource === 'sunSetup') { projectAgentDataChange(proposal); return (await import('./sun-setup-records.js')).commitReviewedSunSetup(profileId, proposal, authorized); }
  if (isLightMeasurementResource(proposal.resource)) { projectAgentDataChange(proposal); return (await import('./light-measurement-records.js')).commitReviewedLightMeasurementRecord(profileId, proposal, authorized); }
  if (isLightDeviceResource(proposal.resource)) { projectAgentDataChange(proposal); return (await import('./light-device-records.js')).commitReviewedLightDeviceRecord(profileId, proposal, authorized); }
  if (isLightEnvironmentResource(proposal.resource)) { projectAgentDataChange(proposal); return (await import('./light-env-records.js')).commitReviewedLightEnvironmentRecord(profileId, proposal, authorized); }
  if (isGeneticsResource(proposal.resource)) { projectAgentDataChange(proposal); return (await import('./genetics-records.js')).commitReviewedGeneticsRecord(profileId, proposal, authorized); }
  if (proposal.resource === 'labSamples') { projectAgentDataChange(proposal); return commitReviewedLabSample(profileId, proposal, authorized); }
  if (proposal.resource === 'labResults') { projectAgentDataChange(proposal); return commitReviewedLabResult(profileId, proposal, authorized); }
  if (proposal.resource === 'markerNotes' || proposal.resource === 'markerValueNotes') { projectAgentDataChange(proposal); return commitReviewedMarkerNote(profileId, proposal, authorized); }
  if (proposal.resource === 'meals') { projectAgentDataChange(proposal); return commitReviewedNutritionRecord(profileId, proposal, authorized); }
  if (proposal.resource === 'manualReadings') { projectAgentDataChange(proposal); return commitReviewedManualRecord(profileId, proposal, authorized); }
  if (proposal.resource === 'profile') {
    projectAgentDataChange(proposal);
    const before: unknown = JSON.parse(proposal.baseline);
    if ((before as { id?: unknown })?.id !== profileId) conflict();
    const { updates } = projectChatProfileRecord(before, parseAgentDataPatch(proposal.patch), proposal.effectiveDate);
    if (!await updateProfileMeta(profileId, updates, { expected: before as StoredProfileRecord, canCommit: authorized })) conflict();
    try { await refreshProfileMetaRuntime(profileId); notifyProfileDataContextChanged(profileId); } catch { /* Metadata is committed. */ }
    return 'Profile details updated.';
  }
  if (['datedNotes', 'supplements'].includes(proposal.resource) && !proposal.recordId) throw new Error('The record identity is missing.');
  const baseData = await readAgentProfileRecords(profileId), { before, after } = projectAgentDataChange(proposal);
  if (!profileDataValuesEqual(before, findAgentDataRecord(baseData, proposal.resource, proposal.recordId))) conflict();
  const next = structuredClone(baseData);
  const options: ProfileSaveOptions = { baseData, forceProfileScope: true };
  let changed = false, revoked = false;
  options.canCommit = () => { if (!authorized()) revoked = true; return !revoked; };
  options.onContextFieldConflict = () => { changed = true; };
  if (proposal.resource === 'nutritionTargets') options.expectedContextField = { key: 'nutritionTargets', value: before };
  else if (proposal.resource === 'profileNotes') { options.expectedContextNotes = String(before); options.onContextNotesConflict = () => { changed = true; }; }
  else {
    const key = proposal.resource === 'datedNotes' ? 'notes' : 'supplements';
    options.expectedProfileRecords = [{ key, id: proposal.recordId, value: before }];
    const nextId = after == null ? '' : agentDataIdentity(proposal.resource, after);
    if (after !== null && nextId !== proposal.recordId) {
      if (findAgentDataRecord(baseData, proposal.resource, nextId) !== null) conflict();
      options.expectedProfileRecords.push({ key, id: nextId, value: null });
    }
  }
  applyAgentDataChange(next, proposal);
  if (!await saveImportedDataForProfile(profileId, next, options)) {
    if (revoked) denied();
    if (changed) conflict();
    throw new Error(`Could not save ${AGENT_DATA_LABELS[proposal.resource]}.`);
  }
  try { notifyProfileDataContextChanged(profileId); } catch { /* The domain write is committed. */ }
  return `${AGENT_DATA_LABELS[proposal.resource]} updated (${proposal.operation}).`;
}
