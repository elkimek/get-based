// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { configureChatSpeechAction } from './chat-speech-component.js';
import { escapeHTML, showNotification } from './utils.js';
import { renderChatMessageActions, ensureChatMessageActions } from './chat-message-actions-component.js';
import { captureChatMessageCopyFeedback, isChatMessageActionCurrent, toggleOwnedChatMessageContext } from './chat-message-actions-view.js';
import { saveChatHistory } from './chat-history.js';
import {
  CHAT_MESSAGE_ACTION_ATTR,
  CHAT_MESSAGE_ACTION_SELECTOR,
  CHAT_MESSAGE_INDEX_ATTR,
  chatMessageActionAttrs,
} from './chat-message-action-attrs.js';
import { getChatRegenerateCallbacks, isChatRuntimeStreaming } from './chat-runtime.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { getMessageAttachments } from './chat-images.js';
import { applyAgentDraft } from './agent-drafts.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';

// Configuration snapshots remain opaque; private calls describe the original
// consumed callback operation and retain raw results/errors and method receivers.
type ActionTargetRead = { closest?: (selector: string) => HTMLElement | null };
const chatMessageActionDeps: Record<string, unknown> = {
  closeSummaryModal: (() => {}),
  continueDiscussion: (() => {}),
  copySummary: (() => {}),
  deleteSavedSummary: (() => {}),
  downloadSummary: (() => {}),
  endDiscussion: (() => {}),
  editUserMessage: (() => {}),
  forkMessage: (() => {}),
  jumpToSearchResult: (() => {}),
  openEMFAssessmentEditor,
  openImageLightbox: (() => {}),
  pauseDiscussion: (() => {}),
  printSummary: (() => {}),
  cancelMessageEdit: (() => {}),
  removeImageAttachment: (() => {}),
  resumeDiscussion: (() => {}),
  retryDiscussionParticipant: (() => {}),
  showEarlierMessages: (() => {}),
  submitMessageEdit: (() => {}),
  switchThread: (() => {}),
  startDiscussionFromPicker: (() => {}),
  toggleMessageSpeech: (() => {}),
  viewSavedSummary: (() => {}),
  renderChatMessages: (() => {}),
};

export function configureChatMessageActionDeps(deps: unknown = {}) {
  const previous = { ...chatMessageActionDeps };
  for (const name of Object.keys(chatMessageActionDeps)) {
    const candidate = (deps as Record<string, unknown>)[name];
    if (typeof candidate === 'function') {
      (chatMessageActionDeps)[name] = candidate;
    }
  }
  return previous;
}

let chatMessageDelegatesInstalled = false;
export { chatMessageActionAttrs } from './chat-message-action-attrs.js';

function closestChatMessageAction(target: ActionTargetRead | null | undefined) {
  return (
    target && typeof target.closest === 'function'
      ? target.closest(CHAT_MESSAGE_ACTION_SELECTOR)
      : null
  );
}

function readMessageIndex(actionEl: HTMLElement) {
  const raw = actionEl.getAttribute(CHAT_MESSAGE_INDEX_ATTR);
  const index = raw == null ? NaN : Number(raw);
  return Number.isInteger(index) ? index : null;
}

function containChatMessageEvent(event: Event) {
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

/** Context is an unvalidated extension; this view describes the existing display reader.
 * @typedef {Array<{ label: unknown, detail?: unknown }>} ChatContextDisplay
 */
const pendingDraftActions = new WeakSet<object>();

async function updateAgentDraft(actionEl: HTMLElement, apply: boolean) {
  const index = readMessageIndex(actionEl);
  const draftId = actionEl.dataset.chatMessageDraftId || '';
  const message = index == null ? null : state.chatHistory[index];
  const draft = message?.agentDrafts?.find(item => item.id === draftId);
  if (!draft || draft.status !== 'pending' || pendingDraftActions.has(draft)) return false;
  pendingDraftActions.add(draft);
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  const history = state.chatHistory;
  const isCurrent = () => profile === state.currentProfile && thread === state.currentThreadId && history === state.chatHistory;
  const refresh = () => { if (isCurrent()) (chatMessageActionDeps.renderChatMessages as (...args: unknown[]) => unknown)(); };
  let claimAttempted = false;
  let mutationStarted = false;
  let mutationCompleted = false;
  try {
    // Save the still-pending proposal before taking an irreversible claim.
    // The in-memory guard rejects duplicate clicks during this preparatory save.
    // A failure or navigation here leaves no persisted in-flight status.
    if (!apply) draft.status = 'discarded';
    refresh();
    if (!await saveChatHistory()) throw new Error('Could not save the proposal status. No change was applied.');
    if (!isCurrent()) return true;
    if (!apply) {
      showNotification('Proposed change discarded', 'info');
      return true;
    }
    draft.status = 'applying';
    refresh();
    claimAttempted = true;
    await claimAgentDraft(profile as string, draftId);
    if (!isCurrent()) { draft.status = 'failed'; return true; }
    mutationStarted = true;
    const notice = await applyAgentDraft({ ...draft, status: 'pending' });
    mutationCompleted = true;
    draft.status = 'applied';
    draft.appliedAt = new Date().toISOString();
    // The origin retains its durable claim if the user navigated away. Never
    // save the captured proposal into a different active conversation.
    if (!isCurrent()) return true;
    if (!await saveChatHistory()) throw new Error('The change was saved, but its conversation status could not be saved. Check your data before making another proposal.');
    if (isCurrent()) showNotification(notice, 'success');
  } catch (error) {
    // Mutators can fail after a partial commit. Keep ambiguous outcomes out of
    // the retry path; the durable applying claim provides the same protection.
    draft.status = mutationCompleted ? 'applied' : claimAttempted ? 'failed' : 'pending';
    if (isCurrent()) {
      showNotification(mutationStarted
        ? 'Check your data before trying this change again. The proposal could not be fully confirmed.'
        : error instanceof Error ? error.message : 'The proposal status could not be saved.', 'error');
    }
  } finally {
    pendingDraftActions.delete(draft);
    refresh();
  }
  return true;
}

function runChatMessageAction(actionEl: HTMLElement, event: Event) {
  if (!isChatMessageActionCurrent(actionEl)) ensureChatMessageActions();
  if (!isChatMessageActionCurrent(actionEl)) return false;
  const action = actionEl.getAttribute(CHAT_MESSAGE_ACTION_ATTR);

  if (action === 'contain-click') {
    containChatMessageEvent(event);
    return true;
  }

  if (action === 'regenerate-last-message') {
    regenerateLastMessage();
  } else if (action === 'copy-message') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    copyMessage(index);
  } else if (action === 'edit-user-message') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    (chatMessageActionDeps.editUserMessage as (...args: unknown[]) => unknown)(index);
  } else if (action === 'fork-message') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    void (chatMessageActionDeps.forkMessage as (...args: unknown[]) => unknown)(index);
  } else if (action === 'cancel-message-edit') {
    (chatMessageActionDeps.cancelMessageEdit as (...args: unknown[]) => unknown)();
  } else if (action === 'submit-message-edit') {
    void (chatMessageActionDeps.submitMessageEdit as (...args: unknown[]) => unknown)();
  } else if (action === 'switch-fork-source') {
    const threadId = actionEl.dataset.chatMessageThreadId || '';
    if (!threadId) return false;
    void (chatMessageActionDeps.switchThread as (...args: unknown[]) => unknown)(threadId);
  } else if (action === 'toggle-context-details') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    toggleContextDetails(index);
  } else if (action === 'toggle-message-speech') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    void (chatMessageActionDeps.toggleMessageSpeech as (...args: unknown[]) => unknown)(index);
  } else if (action === 'remove-image-attachment') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    (chatMessageActionDeps.removeImageAttachment as (...args: unknown[]) => unknown)(index);
  } else if (action === 'open-image-lightbox') {
    const src = actionEl instanceof HTMLImageElement ? actionEl.src : actionEl.dataset.chatMessageSrc;
    if (!src) return false;
    (chatMessageActionDeps.openImageLightbox as (...args: unknown[]) => unknown)(src);
  } else if (action === 'open-emf-assessment') {
    void (chatMessageActionDeps.openEMFAssessmentEditor as (...args: unknown[]) => unknown)();
  } else if (action === 'jump-search-result') {
    const index = readMessageIndex(actionEl);
    const threadId = actionEl.dataset.chatMessageThreadId || '';
    if (!threadId || index == null) return false;
    void (chatMessageActionDeps.jumpToSearchResult as (...args: unknown[]) => unknown)(threadId, index, actionEl.dataset.chatMessagePrefix || '');
  } else if (action === 'view-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return false;
    (chatMessageActionDeps.viewSavedSummary as (...args: unknown[]) => unknown)(id);
  } else if (action === 'close-summary') {
    (chatMessageActionDeps.closeSummaryModal as (...args: unknown[]) => unknown)();
  } else if (action === 'copy-summary') {
    (chatMessageActionDeps.copySummary as (...args: unknown[]) => unknown)();
  } else if (action === 'download-summary') {
    (chatMessageActionDeps.downloadSummary as (...args: unknown[]) => unknown)();
  } else if (action === 'print-summary') {
    (chatMessageActionDeps.printSummary as (...args: unknown[]) => unknown)();
  } else if (action === 'delete-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return false;
    void (chatMessageActionDeps.deleteSavedSummary as (...args: unknown[]) => unknown)(id);
  } else if (action === 'start-discussion-from-picker') {
    void (chatMessageActionDeps.startDiscussionFromPicker as (...args: unknown[]) => unknown)();
  } else if (action === 'continue-discussion') {
    void (chatMessageActionDeps.continueDiscussion as (...args: unknown[]) => unknown)();
  } else if (action === 'end-discussion') {
    (chatMessageActionDeps.endDiscussion as (...args: unknown[]) => unknown)();
  } else if (action === 'resume-discussion') {
    void (chatMessageActionDeps.resumeDiscussion as (...args: unknown[]) => unknown)();
  } else if (action === 'retry-discussion-participant') {
    const personaId = actionEl.dataset.chatMessagePersonaId || '';
    if (!personaId) return false;
    void (chatMessageActionDeps.retryDiscussionParticipant as (...args: unknown[]) => unknown)(personaId);
  } else if (action === 'pause-discussion') {
    (chatMessageActionDeps.pauseDiscussion as (...args: unknown[]) => unknown)();
  } else if (action === 'show-earlier-messages') {
    (chatMessageActionDeps.showEarlierMessages as (...args: unknown[]) => unknown)();
  } else if (action === 'apply-agent-draft') {
    void updateAgentDraft(actionEl, true);
  } else if (action === 'discard-agent-draft') {
    void updateAgentDraft(actionEl, false);
  } else {
    return false;
  }

  event.preventDefault();
  return true;
}

function handleChatMessageClick(event: Event) {
  const actionEl = closestChatMessageAction(event.target as ActionTargetRead | null);
  if (!actionEl || actionEl.hasAttribute('data-chat-speech-owned')) return;
  runChatMessageAction(actionEl, event);
}

function handleChatMessageKeydown(event: Event & Partial<Pick<KeyboardEvent, 'key'>>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (event.key === 'Enter' && target.dataset.chatMessageKeyAction === 'continue-discussion') {
    event.preventDefault();
    void (chatMessageActionDeps.continueDiscussion as (...args: unknown[]) => unknown)();
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestChatMessageAction(target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  runChatMessageAction(actionEl, event);
}

function handleChatRecommendationToggle(event: Event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('rec-chat-wrapper') || details.hasAttribute('data-chat-recommendations-view')) return;
  const index = readMessageIndex(details);
  if (index == null) return;
  const message = state.chatHistory[index];
  if (!message?.recSlots?.length) return;

  const nextOpen = details.open;
  const clearsNewCue = nextOpen && message.recNew;
  if (message.recOpen === nextOpen && !clearsNewCue) return;
  message.recOpen = nextOpen;
  if (clearsNewCue) {
    message.recNew = false;
    details.querySelector('.rec-chat-new')?.remove();
    details.classList.remove('rec-chat-unseen', 'rec-chat-attention');
  }
  void saveChatHistory();
}

export function installChatMessageActionDelegates(root: Document | HTMLElement | null = typeof document !== 'undefined' ? document : null) {
  if (!root || chatMessageDelegatesInstalled) return;
  chatMessageDelegatesInstalled = true;
  root.addEventListener('click', handleChatMessageClick);
  root.addEventListener('keydown', handleChatMessageKeydown);
  root.addEventListener('toggle', handleChatRecommendationToggle, true);
}

installChatMessageActionDelegates();

export function buildActionBar(msgIndex: number) { return renderChatMessageActions(msgIndex, 'assistant'); }
export function buildUserActionBar(msgIndex: number) { return renderChatMessageActions(msgIndex, 'user'); }

export function buildForkSourceNotice() {
  const thread = state.chatThreads.find(item => item.id === state.currentThreadId);
  if (!thread?.forkedFromThreadId) return '';
  const source = state.chatThreads.find(item => item.id === thread.forkedFromThreadId);
  if (!source) return '<div class="chat-fork-notice" role="note">Forked from another conversation</div>';
  return `<div class="chat-fork-notice" role="note"><span>Forked from <strong>${escapeHTML(source.name || 'conversation')}</strong></span><button type="button" ${chatMessageActionAttrs('switch-fork-source', { threadId: source.id })}>View original</button></div>`;
}

let regenerationPending = false;

export function regenerateLastMessage() {
  if (regenerationPending || state.chatHistory.length < 2 || isChatRuntimeStreaming()) return undefined;
  const callbacks = getChatRegenerateCallbacks();
  if (!callbacks) return undefined;
  const history = state.chatHistory;
  const length = history.length;
  const lastUserMsg = history[length - 2];
  const lastResponse = history[length - 1];
  if (!lastUserMsg || lastUserMsg.joined || lastUserMsg.role !== 'user'
    || lastResponse?.role !== 'assistant') return undefined;
  const profile = state.currentProfile;
  const threadId = state.currentThreadId;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const draft = input?.value;
  const prefix = history.slice(0, -2);
  let removed = false;
  regenerationPending = true;
  return (async () => {
    try {
      // Keep the original turn durable until Send accepts the replacement.
      if (!await saveChatHistory()) {
        showNotification('Could not save this conversation. Retry was cancelled to protect your messages.', 'error', 6000);
        return;
      }
      if (profile !== state.currentProfile || threadId !== state.currentThreadId
        || history !== state.chatHistory || history.length !== length
        || history[length - 2] !== lastUserMsg || history[length - 1] !== lastResponse
        || isChatRuntimeStreaming() || input?.value !== draft) return;
      const attachments = lastUserMsg.hasImages ? getMessageAttachments(lastUserMsg) : [];
      if (lastUserMsg.hasImages && !attachments.length) {
        showNotification(
          'The original images are no longer available. Attach them again to retry this response.',
          'info', 6000,
        );
        return;
      }
      await callbacks.sendChatMessage({
        retry: { content: lastUserMsg.content === '(image)' ? '' : lastUserMsg.content, attachments },
        prepareRetry: () => {
        // Send calls this only after approval and route validation. Navigation
        // during consent must never persist a temporarily shortened transcript.
        if (profile !== state.currentProfile || threadId !== state.currentThreadId
          || history !== state.chatHistory || history.length !== length
          || history[length - 2] !== lastUserMsg || history[length - 1] !== lastResponse) return false;
        state.chatHistory.pop();
        state.chatHistory.pop();
        removed = true;
        callbacks.renderChatMessages();
        return true;
      } });
    } catch {
      showNotification('The response could not be retried. Review the conversation and try again.', 'error', 6000);
    } finally {
      // Consent refusal, unavailable backends and synchronous send failures can
      // leave the replacement untouched. Restore only our own unchanged prefix.
      if (removed && profile === state.currentProfile && threadId === state.currentThreadId
        && history === state.chatHistory && history.length === prefix.length
        && prefix.every((message, index) => history[index] === message)) {
        history.push(lastUserMsg, lastResponse);
        callbacks.renderChatMessages();
      }
      regenerationPending = false;
    }
  })();
}

export function copyMessage(msgIndex: number) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.joined) return;
  ensureChatMessageActions();
  const feedback = captureChatMessageCopyFeedback(msgIndex);
  if (!navigator.clipboard) { feedback('unsupported'); return; }
  const attribution = msg.role === 'assistant' ? getAIOutputAttribution(msg) : '';
  const clipboardText = attribution ? `${msg.content}\n\n${attribution}` : msg.content;
  navigator.clipboard.writeText(clipboardText).then(() => { feedback('copied'); }).catch(() => { feedback('failed'); });
}

export function toggleContextDetails(msgIndex: number) {
  ensureChatMessageActions();
  return toggleOwnedChatMessageContext(msgIndex);
}

configureChatSpeechAction(index => (chatMessageActionDeps.toggleMessageSpeech as (index: number) => unknown)(index));
