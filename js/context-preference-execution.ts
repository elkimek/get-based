// Only a native review button may commit disclosure changes. Re-enabling requires a fresh review.
import type { ContextPreferenceControlIdentity } from '../shared/context-preference-contract.js';
import { reviewedContextPreferenceControl, contextPreferenceConflict } from './context-preference-controls.js';
import { createContextHubSession } from './context-hub-session.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { saveContextPreferenceReceipt } from './context-preference-receipts.js';
import { state } from './state.js';
export async function executeContextPreferenceControl(record: ContextPreferenceControlIdentity, authorized: () => boolean) {
  const lease = reviewedContextPreferenceControl(record), history = state.chatHistory;
  const current = () => authorized() && state.currentProfile === record.profileId && state.currentThreadId === record.threadId && state.importedData === lease.root && state.chatHistory === history;
  if (!current()) contextPreferenceConflict('The originating disclosure review changed. Nothing was applied.');
  lease.used = true; await claimAgentDraft(record.profileId, `${record.id}-app`);
  if (!current()) contextPreferenceConflict('The originating disclosure review changed. Nothing was applied.');
  const session = createContextHubSession();
  let outcome: Awaited<ReturnType<typeof session.save>>;
  try { outcome = await session.save({ kind: 'preferences', patch: record.parameters }, { canCommit: current, expectedRevision: lease.revision }); }
  finally { session.retire(); }
  if (outcome === 'failed') throw new Error('The context-source save could not be confirmed. Check the native Context dialog before trying again.');
  if (outcome !== 'saved') contextPreferenceConflict('The disclosure review changed or became unavailable. Nothing from this review was applied. Read a fresh review.');
  let receiptSaved = false;
  try { await saveContextPreferenceReceipt(record); receiptSaved = true; } catch { /* Saved disclosure remains authoritative. */ }
  return { changed: ['context.preferences'], refreshed: true, undoAvailable: false, receiptSaved };
}
