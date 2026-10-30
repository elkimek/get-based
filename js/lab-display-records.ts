import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { ProfileData } from '../types/app-state.js';
import type { LabDisplayResource, LabDisplayRecord } from './lab-display-core.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { labDisplayRecord, nativeLabDisplayRecords } from './lab-display-core.js';
import { parseLabDisplaySnapshot, labDisplayCommand, projectLabDisplay } from './lab-display-proposals.js';
import { readNativeLabDisplay, commitNativeLabDisplay } from './lab-display-store.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { state } from './state.js';
import { getActiveData } from './data.js';
import { getCategoryCustomizationBuildSidebar, navigateCategoryCustomizationRuntime } from './category-customization-runtime.js';
import { getMarkerStorageDotKey } from './marker-placement.js';

function allowed(record: LabDisplayRecord) {
  return 'name' in record ? isGroupInAIContext(record.nativeCategory.group) && isGroupInAIContext(record.category.group) : isGroupInAIContext(record.group);
}
export function canDiscloseLabDisplayReview(data: ProfileData, proposal: AgentDataProposal) {
  try { const snapshot = parseLabDisplaySnapshot(JSON.parse(proposal.baseline)), projected = projectLabDisplay(proposal);
    return allowed(snapshot.record) && allowed(projected.after) && allowed(labDisplayRecord(data, snapshot.resource, snapshot.record.id));
  } catch { return false; }
}
export async function readCurrentLabDisplay(profileId: string, resource: LabDisplayResource, id: string) {
  const snapshot = await readNativeLabDisplay(profileId, resource, id);
  if (!allowed(snapshot.record)) throw new Error('This lab source group is disabled.');
  return { ...snapshot, choices: snapshot.choices.filter(row => isGroupInAIContext(row.group)) };
}
export async function listCurrentLabDisplay(profileId: string, resource: LabDisplayResource) {
  return nativeLabDisplayRecords(await readAgentProfileRecords(profileId), resource).filter(allowed);
}
export async function commitReviewedLabDisplay(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  projectLabDisplay(proposal); const expected = parseLabDisplaySnapshot(JSON.parse(proposal.baseline));
  const root = state.importedData, view = state.currentView, modal = typeof document !== 'undefined' ? document.getElementById('detail-modal') : null, content = modal?.firstElementChild, oldViewId = modal?.dataset.syncRefreshKind === 'marker' ? modal.dataset.syncRefreshItemId : null;
  const oldMarkerKey = oldViewId ? getMarkerStorageDotKey(state.markerRegistry[oldViewId], oldViewId) : null;
  const canCommit = () => authorized() && canDiscloseLabDisplayReview(state.importedData, proposal)
    && !(typeof document !== 'undefined' && document.querySelector('.ref-edit-form,.modal-overlay.show .marker-form-modal,.modal-overlay.show .marker-placement-form,.confirm-overlay.show'));
  await commitNativeLabDisplay(profileId, expected, labDisplayCommand(expected.resource, proposal.operation, parseAgentDataPatch(proposal.patch)), canCommit);
  // Refresh only the still-owned surface after persistence; this is no navigation grant.
  if (state.currentProfile === profileId && state.importedData === root && state.currentView === view) try {
    const data = getActiveData(); getCategoryCustomizationBuildSidebar()?.(data); navigateCategoryCustomizationRuntime(view, data);
    if (oldViewId && modal?.isConnected && modal.firstElementChild === content && document.getElementById('modal-overlay')?.classList.contains('show')) {
      const nextId = oldMarkerKey ? Object.entries(data.categories).flatMap(([category, value]) => Object.entries(value.markers).filter(([name, marker]) => getMarkerStorageDotKey(marker, `${category}_${name}`) === oldMarkerKey).map(([name]) => `${category}_${name}`))[0] : null;
      if (nextId) { const detail = await import('./marker-detail-modal.js'); if (state.currentProfile === profileId && state.importedData === root && state.currentView === view && modal.firstElementChild === content) await detail.showDetailModal(nextId); }
    }
  } catch { /* Saved metadata remains durable if a surface cannot refresh. */ }
  return 'Lab display metadata saved. Canonical marker data and source permissions are preserved.';
}
