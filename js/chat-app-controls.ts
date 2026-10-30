import { state } from './state.js';
import { executeAppControl } from './app-control-commands.js';
import { saveChatHistory } from './chat-history.js';
import { isChatRuntimeStreaming } from './chat-runtime.js';
import { showNotification } from './utils.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
const pending = new WeakSet<object>();

export async function handleChatAppControl(index: number, id: string, action: 'apply' | 'discard' | 'undo', refresh: () => void) {
  const history = state.chatHistory, message = history[index], profile = state.currentProfile, thread = state.currentThreadId;
  const record = message?.appControls?.find(item => item.id === id);
  if (message?.role !== 'assistant' || !record || pending.has(record) || record.status !== (action === 'undo' ? 'changed' : 'pending')) return;
  const current = () => state.currentProfile === profile && state.currentThreadId === thread && state.chatHistory === history
    && history[index] === message && record.profileId === profile && record.threadId === thread;
  // A view repaint must not discard an editor or race a running answer.
  const canCommit = () => current() && !isChatRuntimeStreaming()
    && !document.querySelector('.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap],[data-chat-message-editor-host] textarea');
  if (!current()) return;
  if (action !== 'discard' && record.action === 'profile.selection' && message.agentDrafts?.some(draft => draft.status === 'pending')) { showNotification('Resolve the other proposals in this reply before switching profiles. They have been kept.', 'info'); return; }
  if (action !== 'discard' && !canCommit()) { showNotification('Finish the current reply and close any open editor before applying this app control.', 'info'); return; }
  pending.add(record);
  const previous = record.status;
  const assistant = record.action.startsWith('assistant.');
  const savedLabel = record.action === 'assistant.persona' ? 'Persona selection saved.' : record.action === 'labs.overlays' ? 'Chart layers saved.' : record.action === 'context.preferences' ? 'Context preferences saved.' : record.action === 'labs.ordering' ? 'Lab order saved.' : record.action === 'assistant.preferences' ? 'Assistant preferences saved.' : assistant ? 'Assistant selection saved.' : 'Display preference saved.';
  const restoredLabel = record.action === 'assistant.persona' ? 'Previous persona restored.' : record.action === 'labs.overlays' ? 'Previous chart layers restored.' : record.action === 'labs.ordering' ? 'Previous lab order restored.' : record.action === 'assistant.preferences' ? 'Previous assistant preferences restored.' : assistant ? 'Previous assistant selection restored.' : 'Display preference restored.';
  const input: AppControlRecord = { ...record, status: previous };
  try {
    // An interrupted command must restore as inactive even if the process exits
    // between the native setting write and the final conversation receipt.
    record.status = action === 'discard' ? 'discarded' : 'applying'; refresh();
    if (!await saveChatHistory()) { record.status = previous; throw new Error('The control could not be saved. No app setting was changed.'); }
    if (!current()) return;
    if (action === 'discard') return;
    const receipt = await executeAppControl(input, action === 'undo', canCommit);
    record.status = action === 'undo' ? 'undone' : 'changed';
    record.undoAvailable = receipt.undoAvailable;
    if (receipt.transitioned) {
      if (!receipt.receiptSaved && state.currentProfile === receipt.destinationProfileId) showNotification('Profile switched. Its historical chat receipt could not be saved; check the native profile picker before trying again.', 'info');
      return;
    }
    if (current()) {
      const saved = await saveChatHistory();
      if (current()) showNotification(!saved ? 'The change was saved, but this conversation receipt could not be saved. Check native settings before retrying.'
        : record.action === 'assistant.persona' && action !== 'undo' && !receipt.changed.length ? 'Persona already selected.'
        : record.action === 'context.preferences' ? receipt.receiptSaved === false ? `${savedLabel} Its historical receipt could not be saved; check the native Context dialog before trying again.` : savedLabel
        : action !== 'undo' && !receipt.undoAvailable && !receipt.undoNotOffered ? `${savedLabel} Its Undo receipt could not be saved; check the native settings for further changes.`
        : action === 'undo' && ['labs.ordering', 'labs.overlays'].includes(record.action) && receipt.receiptSaved === false ? `${restoredLabel} Its native receipt could not be saved; check the lab view after reloading.`
        : receipt.refreshed ? action === 'undo' ? restoredLabel : savedLabel : `${savedLabel} Reopen the view to refresh it.`, saved ? 'success' : 'info');
    }
  } catch (error) {
    if (record.status === 'applying') {
      const unchanged = error instanceof Error && 'noChangeApplied' in error;
      record.status = ['labs.ordering', 'labs.overlays'].includes(record.action) && action === 'undo' && unchanged ? 'changed' : unchanged ? 'conflict' : 'failed';
      if (['labs.ordering', 'labs.overlays'].includes(record.action) && action === 'undo') record.undoAvailable = false;
    }
    if (current()) { await saveChatHistory().catch(() => false); showNotification(error instanceof Error ? error.message : 'The app change could not be confirmed. Check native settings.', 'error'); }
    else if (record.action === 'profile.selection') showNotification('The profile transition could not be fully confirmed. Open the native profile picker to check the active profile.', 'error');
  } finally { pending.delete(record); if (current()) refresh(); }
}
