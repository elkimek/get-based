import type { LabOverlayControlIdentity } from '../shared/lab-overlay-contract.js';
import { reviewedLabOverlayControl } from './lab-overlay-controls.js';
import { canDiscloseLabOverlays } from './lab-overlay-policy.js';
import { commitLabOverlayPreferences, overlayConflict } from './lab-overlay-preferences.js';
import { readOverlayProof, writeOverlayProof } from './lab-overlay-receipts.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { state } from './state.js';
export async function executeLabOverlayControl(record: LabOverlayControlIdentity, undo: boolean, authorized: () => boolean) {
  const root = state.importedData, history = state.chatHistory, view = state.currentView;
  const current = () => authorized() && state.currentProfile === record.profileId && state.currentThreadId === record.threadId && state.importedData === root && state.chatHistory === history && canDiscloseLabOverlays(record);
  const check = () => { if (!current()) overlayConflict('The originating overlay profile, chat or source permission changed. Nothing was applied.'); }; check();
  if (undo) { const proof = await readOverlayProof(record); check(); if (proof.outcome !== 'changed') overlayConflict('This chart-layer Undo has already been attempted. Request a fresh review.'); }
  else reviewedLabOverlayControl(record);
  await claimAgentDraft(record.profileId, `${record.id}${undo ? '-undo' : '-app'}`); check();
  if (undo) try { await writeOverlayProof(record, 'undoing'); } catch { overlayConflict('The Undo attempt could not be recorded. The saved overlay switches are unchanged.'); }
  await commitLabOverlayPreferences(undo ? record.baseline : record.parameters, { profileId: record.profileId, expected: undo ? record.parameters : record.baseline, requireLocks: true, canCommit: current });
  let receiptSaved = false; try { await writeOverlayProof(record, undo ? 'undone' : 'changed'); receiptSaved = true; } catch { /* Saved switches remain authoritative. */ }
  let refreshed = false;
  if (current() && state.currentView === view) try { const display = await import('./data-view-controls.js'); if (current() && state.currentView === view) refreshed = display.refreshDataViewRuntime(); } catch { /* A repaint cannot turn a saved preference into failure. */ }
  return { changed: ['labs.overlays'], refreshed, undoAvailable: !undo && receiptSaved, receiptSaved };
}
