import { labOrderingControlSignature as orderingControlSignature } from '../shared/lab-ordering-control-contract.js';
import { readProof, writeProof, type Proof } from './lab-ordering-control-receipts.js';
// Native review-button execution and private completion proof; never a model dependency.
import type { OrderingControlInput } from './lab-ordering-controls.js';
import { reviewedLabOrderingLease, orderingConflict } from './lab-ordering-controls.js';
import { labOrderingPolicy, canDiscloseLabOrdering } from './lab-ordering-policy.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { readNativeLabOrder, commitNativeLabOrder } from './lab-ordering-store.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { state } from './state.js';
import { getActiveData } from './data.js';
import { getCategoryCustomizationBuildSidebar, navigateCategoryCustomizationRuntime } from './category-customization-runtime.js';
export async function executeLabOrderingControl(record: OrderingControlInput, undo: boolean, authorized: () => boolean) {
  const root = state.importedData, history = state.chatHistory, view = state.currentView;
  const current = () => authorized() && state.currentProfile === record.profileId && state.currentThreadId === record.threadId && state.importedData === root && state.chatHistory === history
    && canDiscloseLabOrdering(record) && !(typeof document !== 'undefined' && document.querySelector('.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap],[data-chat-message-editor-host] textarea'));
  const check = () => { if (!current()) orderingConflict('The originating chat, editor or lab disclosure changed. Nothing was applied.'); }; check();
  const data = await readAgentProfileRecords(record.profileId), fresh = await readNativeLabOrder(record.profileId, record.parameters.scopeId, current), policy = labOrderingPolicy(data, fresh.record); check();
  let expected = fresh, before: unknown, operationId: string | null = null;
  let proof: Proof | null = null;
  if (undo) {
    proof = await readProof(record); check();
    if (proof.outcome !== 'changed' || proof.afterRevision !== fresh.revision || proof.policy !== policy.stamp) orderingConflict('This ordering changed after Apply. Read a fresh review.');
    before = proof.before; operationId = proof.operationId;
  } else {
    const lease = reviewedLabOrderingLease(record);
    if (lease.snapshot.revision !== fresh.revision || lease.policy !== policy.stamp) orderingConflict('The reviewed lab order or disclosure changed. Read a fresh review.');
    expected = lease.snapshot; lease.used = true;
  }
  await claimAgentDraft(record.profileId, `${record.id}${undo ? '-undo' : '-app'}`); check();
  if (undo && proof) {
    // A crash or failed post-save proof cannot restore a stale actionable Undo label.
    try { await writeProof(record, { ...proof, outcome: 'undoing' }); }
    catch { orderingConflict('The Undo attempt could not be recorded. Your saved order is unchanged. Request a fresh review.'); }
    check();
  }
  const command = undo ? operationId ? { cancelMove: operationId } : { restore: before }
    : 'move' in record.parameters ? { move: record.parameters.move } : { reset: true as const };
  const result = await commitNativeLabOrder(record.profileId, expected, command, () => current() && labOrderingPolicy(state.importedData, expected.record).stamp === policy.stamp);
  let receiptSaved = false;
  const completed: Proof = { version: 1, signature: orderingControlSignature(record), outcome: undo ? 'undone' : 'changed', before: undo ? before : result.before,
    operationId: undo ? operationId : 'move' in record.parameters ? result.after.commands.at(-1)!.id : null,
    afterRevision: result.snapshot.revision, policy: policy.stamp };
  try { await writeProof(record, completed); receiptSaved = true; } catch { /* Durable ordering remains authoritative. */ }
  let refreshed = false;
  if (current() && state.currentView === view) try {
    const active = getActiveData(); getCategoryCustomizationBuildSidebar()?.(active); navigateCategoryCustomizationRuntime(view || 'dashboard', active); refreshed = true;
  } catch { /* Repaint cannot undo a durable result. */ }
  return { changed: ['labs.ordering'], refreshed, undoAvailable: !undo && receiptSaved, receiptSaved };
}
