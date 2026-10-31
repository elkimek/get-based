import { captureChatControlAuthorization } from './chat-control-settings.js';
// Execution is called only from the native review button, never from a model tool.
import { chatAppControlAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { normalizeAppControls, parseDisplayControlPatch, parseAssistantSelection, assistantSelectionsEqual, assistantConnectionId } from '../shared/agent-control-contract.js';
import type { AppControlRecord, DisplayControlPatch } from '../shared/agent-control-contract.js';
import { commitDisplayPreferences, DisplayPreferenceConflict } from './display-preferences.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { state } from './state.js';
import * as assistantSelectionOwner from './assistant-selection.js';

const proofKey = (profile: string, id: string) => `labcharts-${profile}-app-control-${id}`;
const equal = (a: DisplayControlPatch, b: DisplayControlPatch) => Object.keys(a).length === Object.keys(b).length
  && Object.entries(a).every(([key, value]) => b[key as keyof DisplayControlPatch] === value);
export interface AppControlReceipt { changed: string[]; refreshed: boolean; undoAvailable: boolean; undoNotOffered?: boolean; transitioned?: boolean; receiptSaved?: boolean; destinationProfileId?: string }
export async function executeAppControl(raw: AppControlRecord, undo: boolean, canCommit: () => boolean): Promise<AppControlReceipt> {
  const authorization = captureChatControlAuthorization(raw.id); authorization.assert();
  if (!chatAppControlAllowed(raw.action, raw.parameters)) throw new Error(CHAT_NATIVE_UI_NOTICE);
  const record = normalizeAppControls([raw], true)[0];
  if (!record || record.status !== (undo ? 'changed' : 'pending')) throw new Error('This app control is no longer actionable.');
  const root = state.importedData;
  const current = () => authorization.current() && canCommit() && state.currentProfile === record.profileId && state.currentThreadId === record.threadId && state.importedData === root;
  const assertCurrent = () => { if (!current()) throw new DisplayPreferenceConflict('The originating chat changed. No app setting was changed.'); };
  assertCurrent();
  if (record.action === 'assistant.persona') throw new Error('Persona management is available only in the manual persona picker and editor.');
  if (record.action === 'labs.overlays') {
    const owner = await import('./lab-overlay-execution.js'); assertCurrent(); return owner.executeLabOverlayControl(record, undo, current);
  }

  if (record.action === 'profile.selection') {
    if (undo) throw new Error('Switch profiles through a fresh review. This transition has no reusable Undo authority.');
    const owner = await import('./profile-selection.js'); assertCurrent();
    const snapshot = owner.previewProfileSelection(record.leaseId, record.parameters.profileId);
    if (JSON.stringify(snapshot.before) !== JSON.stringify(record.baseline) || JSON.stringify(snapshot.proposed) !== JSON.stringify(record.proposed)) throw new DisplayPreferenceConflict('The reviewed profile changed. Request a fresh review.');
    await claimAgentDraft(record.profileId, `${record.id}-app`); assertCurrent();
    const result = await owner.commitProfileSelection(record.leaseId, record.parameters.profileId, current);
    let receiptSaved = false;
    try { await (await import('./profile-control-receipts.js')).saveProfileControlReceipt(record); receiptSaved = true; } catch { /* The transition is complete; an unverified historical label stays inactive. */ }
    return { changed: ['profile.selection'], refreshed: true, undoAvailable: false, transitioned: true, receiptSaved, destinationProfileId: result.profileId };
  }

  if (record.action === 'assistant.connection') {
    const owner = await import('./assistant-connections.js'); assertCurrent();
    let leaseId = record.leaseId, patch = record.parameters;
    if (undo) {
      const stored = await encryptedGetItem(proofKey(record.profileId, record.id), { throwOnDecryptError: true }); assertCurrent();
      const proof: unknown = stored ? JSON.parse(stored) : null;
      if (!proof || typeof proof !== 'object' || !('action' in proof) || proof.action !== record.action || !('before' in proof) || !('after' in proof) || !('leaseId' in proof) || typeof proof.leaseId !== 'string') throw new Error('No current native connection Undo receipt is available. Request a fresh review.');
      const before = parseAssistantSelection(proof.before), after = parseAssistantSelection(proof.after);
      if (!before || !after || !assistantSelectionsEqual(before, record.baseline) || !assistantSelectionsEqual(after, record.proposed)) throw new Error('The connection control does not match its native execution receipt.');
      leaseId = proof.leaseId; patch = { connectionId: assistantConnectionId(before), model: before.model, effort: before.effort };
    } else if (!assistantSelectionsEqual(owner.previewAssistantConnection(leaseId, patch), record.proposed) || !assistantSelectionsEqual(owner.readAssistantSelection(), record.baseline)) throw new Error('The connection effects changed. Request a fresh review.');
    await claimAgentDraft(record.profileId, `${record.id}${undo ? '-undo' : '-app'}`); assertCurrent();
    const receipt = await owner.commitAssistantConnection(leaseId, patch, { requireLocks: true, canCommit: current });
    let undoAvailable = false;
    if (!undo) {
      try { await encryptedSetItem(proofKey(record.profileId, record.id), JSON.stringify({ action: record.action, before: receipt.before, after: receipt.after, leaseId: receipt.leaseId })); undoAvailable = true; }
      catch { /* Saved route remains authoritative; unproven Undo is withheld. */ }
    }
    return { changed: receipt.changed ? ['assistant.connection'] : [], refreshed: true, undoAvailable };
  }
  if (record.action === 'assistant.selection') {
    const owner = await Promise.resolve(assistantSelectionOwner); assertCurrent();
    let leaseId = record.leaseId, patch = record.parameters;
    if (undo) {
      const stored = await encryptedGetItem(proofKey(record.profileId, record.id), { throwOnDecryptError: true }); assertCurrent();
      const proof: unknown = stored ? JSON.parse(stored) : null;
      if (!proof || typeof proof !== 'object' || !('action' in proof) || proof.action !== record.action || !('before' in proof) || !('after' in proof) || !('leaseId' in proof) || typeof proof.leaseId !== 'string') throw new Error('No current native assistant Undo receipt is available. Request a fresh model change.');
      const before = parseAssistantSelection(proof.before), after = parseAssistantSelection(proof.after);
      if (!before || !after || !assistantSelectionsEqual(before, record.baseline) || !assistantSelectionsEqual(after, record.proposed)) throw new Error('The assistant control does not match its native execution receipt.');
      leaseId = proof.leaseId; patch = { model: before.model, effort: before.effort };
    } else if (!assistantSelectionsEqual(owner.previewAssistantSelection(leaseId, patch), record.proposed) || !assistantSelectionsEqual(owner.readAssistantSelection(), record.baseline)) throw new Error('The assistant selection effects changed. Request a fresh review.');
    await claimAgentDraft(record.profileId, `${record.id}${undo ? '-undo' : '-app'}`); assertCurrent();
    const receipt = await owner.commitAssistantSelection(leaseId, patch, { requireLocks: true, canCommit: current, expectedProposed: undo ? record.baseline : record.proposed });
    let undoAvailable = false;
    if (!undo) {
      try { await encryptedSetItem(proofKey(record.profileId, record.id), JSON.stringify({ action: record.action, before: receipt.before, after: receipt.after, leaseId: receipt.leaseId })); undoAvailable = true; }
      catch { /* The selection was saved; only Undo availability is lost. */ }
    }
    return { changed: receipt.changed ? ['assistant.selection'] : [], refreshed: true, undoAvailable };
  }
  if (record.action !== 'display.preferences') throw new Error(CHAT_NATIVE_UI_NOTICE);
  let patch = record.parameters, expected = record.baseline;
  if (undo) {
    // Conversation imports or edits are not execution evidence. Only the native
    // command owner writes this private, encrypted-at-rest receipt.
    const stored = await encryptedGetItem(proofKey(record.profileId, record.id), { throwOnDecryptError: true });
    assertCurrent();
    const proof: unknown = stored ? JSON.parse(stored) : null;
    if (!proof || typeof proof !== 'object' || !('before' in proof) || !('after' in proof)) throw new Error('No saved execution receipt is available. Check Display settings.');
    const before = parseDisplayControlPatch(proof.before), after = parseDisplayControlPatch(proof.after);
    if (!before || !after || !equal(before, record.baseline) || !equal(after, record.parameters)) throw new Error('This control does not match its native execution receipt.');
    patch = before; expected = after;
  }
  await claimAgentDraft(record.profileId, `${record.id}${undo ? '-undo' : '-app'}`);
  assertCurrent();
  const receipt = await commitDisplayPreferences(patch, { profileId: record.profileId, expected, requireLocks: true, canCommit: current });
  let undoAvailable = false;
  if (!undo) {
    try { await encryptedSetItem(proofKey(record.profileId, record.id), JSON.stringify({ before: record.baseline, after: record.parameters })); undoAvailable = true; }
    catch { /* Preferences are already saved. Do not report this as a failed setting write or offer an unproven Undo. */ }
  }
  // Persisted settings are authoritative even when a mounted view cannot repaint.
  // Presentation failure must never be reported as a failed data write.
  let refreshed = false;
  if (current()) {
    try {
      const view = await import('./data-view-controls.js');
      if (current()) { view.refreshCommittedDisplayPreferences(receipt); refreshed = true; }
      const settings = await import('./settings-display-panel.js');
      if (current()) settings.updateDisplaySettingsPanel();
    } catch { /* The receipt below truthfully distinguishes saved from refreshed. */ }
  }
  return { changed: receipt.changed, refreshed, undoAvailable };
}
