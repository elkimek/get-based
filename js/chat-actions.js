// @ts-check
// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import {
  CHAT_ICON_COPY,
  CHAT_ICON_EDIT,
  CHAT_ICON_FORK,
  CHAT_ICON_REFRESH,
  CHAT_ICON_VOLUME,
  setIconButtonContent,
} from './chat-icons.js';
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
import { applyAgentDraft, renderAgentDraftCards } from './agent-drafts.js';
import { claimAgentDraft } from './agent-draft-claims.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';

const chatMessageActionDeps = {
  closeSummaryModal: /** @type {() => void} */ (() => {}),
  continueDiscussion: /** @type {() => void | Promise<void>} */ (() => {}),
  copySummary: /** @type {() => void} */ (() => {}),
  deleteSavedSummary: /** @type {(id: string) => void | Promise<void>} */ (() => {}),
  downloadSummary: /** @type {() => void} */ (() => {}),
  endDiscussion: /** @type {() => void} */ (() => {}),
  editUserMessage: /** @type {(index: number) => void} */ (() => {}),
  forkMessage: /** @type {(index: number) => void | Promise<void>} */ (() => {}),
  jumpToSearchResult: /** @type {(threadId: string, index: number, prefix: string) => void | Promise<void>} */ (() => {}),
  openEMFAssessmentEditor,
  openImageLightbox: /** @type {(src: string) => void} */ (() => {}),
  pauseDiscussion: /** @type {() => void} */ (() => {}),
  printSummary: /** @type {() => void} */ (() => {}),
  cancelMessageEdit: /** @type {() => void} */ (() => {}),
  removeImageAttachment: /** @type {(index: number) => void} */ (() => {}),
  resumeDiscussion: /** @type {() => void | Promise<void>} */ (() => {}),
  retryDiscussionParticipant: /** @type {(id: string) => void | Promise<void>} */ (() => {}),
  showEarlierMessages: /** @type {() => void} */ (() => {}),
  submitMessageEdit: /** @type {() => void | Promise<void>} */ (() => {}),
  switchThread: /** @type {(threadId: string) => void | Promise<void>} */ (() => {}),
  startDiscussionFromPicker: /** @type {() => void | Promise<void>} */ (() => {}),
  toggleMessageSpeech: /** @type {(index: number) => void | Promise<void>} */ (() => {}),
  viewSavedSummary: /** @type {(id: string) => void} */ (() => {}),
  renderChatMessages: /** @type {() => void} */ (() => {}),
};

export function configureChatMessageActionDeps(deps = {}) {
  const previous = { ...chatMessageActionDeps };
  for (const name of Object.keys(chatMessageActionDeps)) {
    const candidate = /** @type {any} */ (deps)[name];
    if (typeof candidate === 'function') {
      /** @type {any} */ (chatMessageActionDeps)[name] = candidate;
    }
  }
  return previous;
}

let chatMessageDelegatesInstalled = false;
export { chatMessageActionAttrs } from './chat-message-action-attrs.js';

function closestChatMessageAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(CHAT_MESSAGE_ACTION_SELECTOR)
      : null
  );
}

function readMessageIndex(actionEl) {
  const raw = actionEl.getAttribute(CHAT_MESSAGE_INDEX_ATTR);
  const index = raw == null ? NaN : Number(raw);
  return Number.isInteger(index) ? index : null;
}

function containChatMessageEvent(event) {
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

const pendingDraftActions = new WeakSet();

async function updateAgentDraft(actionEl, apply) {
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
  const refresh = () => { if (isCurrent()) chatMessageActionDeps.renderChatMessages(); };
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
    await claimAgentDraft(profile, draftId);
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

function runChatMessageAction(actionEl, event) {
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
    chatMessageActionDeps.editUserMessage(index);
  } else if (action === 'fork-message') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    void chatMessageActionDeps.forkMessage(index);
  } else if (action === 'cancel-message-edit') {
    chatMessageActionDeps.cancelMessageEdit();
  } else if (action === 'submit-message-edit') {
    void chatMessageActionDeps.submitMessageEdit();
  } else if (action === 'switch-fork-source') {
    const threadId = actionEl.dataset.chatMessageThreadId || '';
    if (!threadId) return false;
    void chatMessageActionDeps.switchThread(threadId);
  } else if (action === 'toggle-context-details') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    toggleContextDetails(index);
  } else if (action === 'toggle-message-speech') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    void chatMessageActionDeps.toggleMessageSpeech(index);
  } else if (action === 'remove-image-attachment') {
    const index = readMessageIndex(actionEl);
    if (index == null) return false;
    chatMessageActionDeps.removeImageAttachment(index);
  } else if (action === 'open-image-lightbox') {
    const src = actionEl instanceof HTMLImageElement ? actionEl.src : actionEl.dataset.chatMessageSrc;
    if (!src) return false;
    chatMessageActionDeps.openImageLightbox(src);
  } else if (action === 'open-emf-assessment') {
    void chatMessageActionDeps.openEMFAssessmentEditor();
  } else if (action === 'jump-search-result') {
    const index = readMessageIndex(actionEl);
    const threadId = actionEl.dataset.chatMessageThreadId || '';
    if (!threadId || index == null) return false;
    void chatMessageActionDeps.jumpToSearchResult(threadId, index, actionEl.dataset.chatMessagePrefix || '');
  } else if (action === 'view-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return false;
    chatMessageActionDeps.viewSavedSummary(id);
  } else if (action === 'close-summary') {
    chatMessageActionDeps.closeSummaryModal();
  } else if (action === 'copy-summary') {
    chatMessageActionDeps.copySummary();
  } else if (action === 'download-summary') {
    chatMessageActionDeps.downloadSummary();
  } else if (action === 'print-summary') {
    chatMessageActionDeps.printSummary();
  } else if (action === 'delete-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return false;
    void chatMessageActionDeps.deleteSavedSummary(id);
  } else if (action === 'start-discussion-from-picker') {
    void chatMessageActionDeps.startDiscussionFromPicker();
  } else if (action === 'continue-discussion') {
    void chatMessageActionDeps.continueDiscussion();
  } else if (action === 'end-discussion') {
    chatMessageActionDeps.endDiscussion();
  } else if (action === 'resume-discussion') {
    void chatMessageActionDeps.resumeDiscussion();
  } else if (action === 'retry-discussion-participant') {
    const personaId = actionEl.dataset.chatMessagePersonaId || '';
    if (!personaId) return false;
    void chatMessageActionDeps.retryDiscussionParticipant(personaId);
  } else if (action === 'pause-discussion') {
    chatMessageActionDeps.pauseDiscussion();
  } else if (action === 'show-earlier-messages') {
    chatMessageActionDeps.showEarlierMessages();
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

function handleChatMessageClick(event) {
  const actionEl = closestChatMessageAction(event.target);
  if (!actionEl) return;
  runChatMessageAction(actionEl, event);
}

function handleChatMessageKeydown(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (event.key === 'Enter' && target.dataset.chatMessageKeyAction === 'continue-discussion') {
    event.preventDefault();
    void chatMessageActionDeps.continueDiscussion();
    return;
  }

  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestChatMessageAction(target);
  if (!actionEl || actionEl.getAttribute('role') !== 'button') return;
  runChatMessageAction(actionEl, event);
}

function handleChatRecommendationToggle(event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('rec-chat-wrapper')) return;
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

export function installChatMessageActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || chatMessageDelegatesInstalled) return;
  chatMessageDelegatesInstalled = true;
  root.addEventListener('click', handleChatMessageClick);
  root.addEventListener('keydown', handleChatMessageKeydown);
  root.addEventListener('toggle', handleChatRecommendationToggle, true);
}

installChatMessageActionDelegates();

/** @param {number} msgIndex */
function buildForkActions(msgIndex) {
  const attrs = chatMessageActionAttrs('fork-message', { index: msgIndex });
  return `<button class="chat-action-btn chat-fork-action" type="button" ${attrs} title="Continue from this message in a new chat">${CHAT_ICON_FORK}<span>Fork to new chat</span></button>
    <details class="chat-action-more"><summary title="More message actions" aria-label="More message actions"><span aria-hidden="true">•••</span></summary><div class="chat-action-more-popover"><button type="button" ${attrs}>${CHAT_ICON_FORK}<span>Fork to new chat</span></button></div></details>`;
}

function latestVisibleUserMessageIndex() {
  for (let index = state.chatHistory.length - 1; index >= 0; index -= 1) {
    const message = state.chatHistory[index];
    if (message?.role === 'user' && !message.hidden && !message.joined) return index;
  }
  return -1;
}

export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = renderAgentDraftCards(msg, msgIndex);
  html += '<div class="chat-action-bar">';
  if (isLast && msg.discussionError) {
    if (msg.discussionPersonaId) {
      html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('retry-discussion-participant', { personaId: msg.discussionPersonaId })} title="Retry only this participant">${CHAT_ICON_REFRESH}<span>Retry ${escapeHTML(msg.personalityName || 'participant')}</span></button>`;
    }
    html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('resume-discussion')} title="Retry every remaining discussion response"><span>Resume round</span></button>`;
  } else if (isLast && !msg.discussion) {
    const retry = msg.stopped || msg.error;
    html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('regenerate-last-message')} title="${retry ? 'Retry response' : 'Regenerate response'}">${CHAT_ICON_REFRESH}<span>${retry ? 'Retry' : 'Regenerate'}</span></button>`;
  }
  html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('copy-message', { index: msgIndex })} id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">${CHAT_ICON_COPY}<span>Copy</span></button>`;
  if (!msg.error) {
    html += `<button class="chat-action-btn chat-listen-btn" type="button" ${chatMessageActionAttrs('toggle-message-speech', { index: msgIndex })} id="chat-listen-btn-${msgIndex}" title="Read message aloud" aria-pressed="false">${CHAT_ICON_VOLUME}<span>Listen</span></button>`;
  }
  html += buildForkActions(msgIndex);
  html += '</div>';

  if (msg.context && msg.context.length > 0) {
    html += `<button type="button" class="chat-context-toggle" aria-expanded="false" aria-controls="chat-ctx-details-${msgIndex}" ${chatMessageActionAttrs('toggle-context-details', { index: msgIndex })}>`;
    html += `<span class="chat-toggle-arrow" id="chat-ctx-arrow-${msgIndex}">\u25B8</span> Context provided (${msg.context.length} area${msg.context.length !== 1 ? 's' : ''})`;
    html += '</button>';
    html += `<div class="chat-context-details" id="chat-ctx-details-${msgIndex}" style="display:none">`;
    for (const area of msg.context) {
      html += `<span class="chat-context-item">\u2713 ${escapeHTML(area.label)}${area.detail ? ' (' + escapeHTML(area.detail) + ')' : ''}</span>`;
    }
    html += '</div>';
  }

  return html;
}

export function buildUserActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'user' || msg.hidden) return '';
  const latestUserIndex = latestVisibleUserMessageIndex();
  if (msgIndex !== latestUserIndex || msg.hasImages) return '';
  return `<div class="chat-user-action-bar"><button class="chat-action-btn chat-edit-retry-action" type="button" ${chatMessageActionAttrs('edit-user-message', { index: msgIndex })} title="Edit and resend (replaces the current response)" aria-label="Edit and resend your latest message">${CHAT_ICON_EDIT}</button></div>`;
}

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
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
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

export function copyMessage(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.joined) return;
  const btn = document.getElementById(`chat-copy-btn-${msgIndex}`);
  if (!navigator.clipboard) {
    if (btn) {
      setIconButtonContent(btn, 'x', 'Not supported');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
    return;
  }
  const attribution = msg.role === 'assistant' ? getAIOutputAttribution(msg) : '';
  const clipboardText = attribution ? `${msg.content}\n\n${attribution}` : msg.content;
  navigator.clipboard.writeText(clipboardText).then(() => {
    if (btn) {
      setIconButtonContent(btn, 'check', 'Copied');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
  }).catch(() => {
    if (btn) {
      setIconButtonContent(btn, 'x', 'Failed');
      setTimeout(() => { setIconButtonContent(btn, 'copy', 'Copy'); }, 1500);
    }
  });
}

export function toggleContextDetails(msgIndex) {
  const details = document.getElementById(`chat-ctx-details-${msgIndex}`);
  const arrow = document.getElementById(`chat-ctx-arrow-${msgIndex}`);
  const toggle = document.querySelector(`[data-chat-message-action="toggle-context-details"][data-chat-message-index="${msgIndex}"]`);
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
  toggle?.setAttribute('aria-expanded', String(!open));
}
