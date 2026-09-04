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
import { setChatInputValue } from './chat-composer.js';
import { restoreMessageAttachments } from './chat-images.js';
import { applyAgentDraft, renderAgentDraftCards } from './agent-drafts.js';
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

async function updateAgentDraft(actionEl, apply) {
  const index = readMessageIndex(actionEl);
  const draftId = actionEl.dataset.chatMessageDraftId || '';
  const message = index == null ? null : state.chatHistory[index];
  const draft = message?.agentDrafts?.find(item => item.id === draftId);
  if (!draft || draft.status !== 'pending') return false;
  if (!apply) {
    draft.status = 'discarded';
    await saveChatHistory();
    chatMessageActionDeps.renderChatMessages();
    showNotification('Proposed change discarded', 'info');
    return true;
  }
  draft.status = 'applying';
  chatMessageActionDeps.renderChatMessages();
  try {
    const notice = await applyAgentDraft({ ...draft, status: 'pending' });
    draft.status = 'applied';
    draft.appliedAt = new Date().toISOString();
    await saveChatHistory();
    chatMessageActionDeps.renderChatMessages();
    showNotification(notice, 'success');
  } catch (error) {
    draft.status = 'pending';
    chatMessageActionDeps.renderChatMessages();
    showNotification(error instanceof Error ? error.message : 'The proposed change could not be applied.', 'error');
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

export function regenerateLastMessage() {
  if (state.chatHistory.length < 2) return;
  if (isChatRuntimeStreaming()) return;
  const callbacks = getChatRegenerateCallbacks();
  if (!callbacks) return;
  const { renderChatMessages, sendChatMessage } = callbacks;

  const lastUserMsg = state.chatHistory[state.chatHistory.length - 2];
  if (!lastUserMsg || lastUserMsg.role !== 'user') return;
  if (lastUserMsg.hasImages && !restoreMessageAttachments(lastUserMsg)) {
    showNotification(
      'The original images are no longer available. Attach them again to retry this response.',
      'info',
      6000,
    );
    return;
  }
  state.chatHistory.pop();
  setChatInputValue(lastUserMsg.content === '(image)' ? '' : lastUserMsg.content);
  state.chatHistory.pop();
  void saveChatHistory();
  renderChatMessages();
  sendChatMessage();
}

export function copyMessage(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg) return;
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
