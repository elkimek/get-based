import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { customMarkerCreationSnapshot, customMarkerRemovalSnapshot, customMarkerInput, projectCustomMarker } from './custom-marker-proposals.js';
import { readNativeCustomMarkerCreation, readNativeCustomMarker, reviewNativeCustomMarker, previewNativeCustomMarkerCreation, commitNativeCustomMarkerCreation, commitNativeCustomMarkerRemoval } from './custom-marker-store.js';
import { customMarkerCatalog, customMarkerMap } from './custom-marker-core.js';
import { validCustomMarkerKey, isBuiltinMarkerKey } from './custom-marker-lifecycle.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { labToolMarker, labToolMarkerGroup } from './lab-tool-markers.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { state } from './state.js';

const allowedCategory = (category: { key: string; label: string; group: string }) => isGroupInAIContext(labToolMarkerGroup(category.key, category));
export function canDiscloseCustomMarkerReview(data: ProfileData, proposal: AgentDataProposal) {
  try {
    const baseline: unknown = JSON.parse(proposal.baseline);
    if (proposal.operation === 'add') {
      const snapshot = customMarkerCreationSnapshot(baseline), input = customMarkerInput(parseAgentDataPatch(proposal.patch));
      if (input.newCategory) return true;
      const category = customMarkerCatalog(data)[input.category!];
      return !!category && allowedCategory({ key: input.category!, label: category.label, group: String(category.contextGroup || category.group || category.label) }) && snapshot.categories.some(row => row.key === input.category);
    }
    const before = customMarkerRemovalSnapshot(baseline);
    return allowedCategory(before.category);
  } catch { return false; }
}
export async function readCurrentCustomMarkerCreation(profileId: string) {
  const creation = await readNativeCustomMarkerCreation(profileId);
  return { version: 1 as const, ...creation, categories: creation.categories.filter(allowedCategory) };
}
export async function readCurrentCustomMarker(profileId: string, key: string) {
  if (!validCustomMarkerKey(key) || isBuiltinMarkerKey(key)) throw new Error('Choose an exact custom marker key.');
  const data = await readAgentProfileRecords(profileId);
  if (!Object.hasOwn(customMarkerMap(data, 'customMarkers'), key)) return null;
  labToolMarker(data, key); return readNativeCustomMarker(profileId, key);
}
export async function listCurrentCustomMarkers(profileId: string) {
  const data = await readAgentProfileRecords(profileId), categories = customMarkerCatalog(data), rows = [];
  for (const key of Object.keys(customMarkerMap(data, 'customMarkers'))) {
    try { if (!validCustomMarkerKey(key) || isBuiltinMarkerKey(key)) continue; labToolMarker(data, key, categories); rows.push(await reviewNativeCustomMarker(data, key)); }
    catch { /* Opaque, disabled or invalid native definitions are not disclosed as editable records. */ }
  }
  return rows;
}
export async function prepareReviewedCustomMarker(profileId: string, proposal: AgentDataProposal) {
  if (proposal.operation === 'add') {
    const snapshot = customMarkerCreationSnapshot(JSON.parse(proposal.baseline)), input = customMarkerInput(parseAgentDataPatch(proposal.patch));
    if (input.category && !snapshot.categories.some(row => row.key === input.category)) throw new Error('Choose an enabled category from the creation snapshot.');
    const preview = await previewNativeCustomMarkerCreation(profileId, input, snapshot.markerId);
    if (!allowedCategory(preview.plan.category)) throw new Error('This marker category context is disabled.');
    proposal.recordId = preview.plan.markerKey; proposal.baseline = JSON.stringify({ ...snapshot, preview });
  }
  projectCustomMarker(proposal);
  if (!canDiscloseCustomMarkerReview(state.importedData, proposal)) throw new Error('This marker category context is disabled.');
}
export async function commitReviewedCustomMarker(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  projectCustomMarker(proposal);
  const allowed = () => authorized() && canDiscloseCustomMarkerReview(state.importedData, proposal)
    && !(typeof document !== 'undefined' && document.querySelector('.ref-edit-form,.modal-overlay.show .marker-form-modal'));
  if (proposal.operation === 'add') {
    const snapshot = customMarkerCreationSnapshot(JSON.parse(proposal.baseline));
    await commitNativeCustomMarkerCreation(profileId, customMarkerInput(parseAgentDataPatch(proposal.patch)), { markerId: snapshot.markerId, expected: snapshot.preview!, allowed });
    return 'Custom marker created. No result was invented.';
  }
  await commitNativeCustomMarkerRemoval(profileId, customMarkerRemovalSnapshot(JSON.parse(proposal.baseline)), allowed);
  return 'Custom marker and reviewed results removed after native confirmation.';
}
