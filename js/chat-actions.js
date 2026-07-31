// @ts-check
// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import {
  CHAT_ICON_COPY,
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

const chatMessageActionDeps = {
  closeSummaryModal: /** @type {() => void} */ (() => {}),
  continueDiscussion: /** @type {() => void | Promise<void>} */ (() => {}),
  copySummary: /** @type {() => void} */ (() => {}),
  deleteSavedSummary: /** @type {(id: string) => void | Promise<void>} */ (() => {}),
  downloadSummary: /** @type {() => void} */ (() => {}),
  endDiscussion: /** @type {() => void} */ (() => {}),
  jumpToSearchResult: /** @type {(threadId: string, index: number, prefix: string) => void | Promise<void>} */ (() => {}),
  openEMFAssessmentEditor,
  openImageLightbox: /** @type {(src: string) => void} */ (() => {}),
  printSummary: /** @type {() => void} */ (() => {}),
  removeImageAttachment: /** @type {(index: number) => void} */ (() => {}),
  startDiscussionFromPicker: /** @type {() => void | Promise<void>} */ (() => {}),
  toggleMessageSpeech: /** @type {(index: number) => void | Promise<void>} */ (() => {}),
  viewSavedSummary: /** @type {(id: string) => void} */ (() => {}),
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

export function installChatMessageActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || chatMessageDelegatesInstalled) return;
  chatMessageDelegatesInstalled = true;
  root.addEventListener('click', handleChatMessageClick);
  root.addEventListener('keydown', handleChatMessageKeydown);
}

installChatMessageActionDelegates();

export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = '<div class="chat-action-bar">';
  if (isLast) {
    html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('regenerate-last-message')} title="Regenerate response">${CHAT_ICON_REFRESH}<span>Regenerate</span></button>`;
  }
  html += `<button class="chat-action-btn" type="button" ${chatMessageActionAttrs('copy-message', { index: msgIndex })} id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">${CHAT_ICON_COPY}<span>Copy</span></button>`;
  html += `<button class="chat-action-btn chat-listen-btn" type="button" ${chatMessageActionAttrs('toggle-message-speech', { index: msgIndex })} id="chat-listen-btn-${msgIndex}" title="Read message aloud" aria-pressed="false">${CHAT_ICON_VOLUME}<span>Listen</span></button>`;
  html += '</div>';

  if (msg.context && msg.context.length > 0) {
    html += `<div class="chat-context-toggle" role="button" tabindex="0" ${chatMessageActionAttrs('toggle-context-details', { index: msgIndex })}>`;
    html += `<span class="chat-toggle-arrow" id="chat-ctx-arrow-${msgIndex}">\u25B8</span> Context used (${msg.context.length} area${msg.context.length !== 1 ? 's' : ''})`;
    html += '</div>';
    html += `<div class="chat-context-details" id="chat-ctx-details-${msgIndex}" style="display:none">`;
    for (const area of msg.context) {
      html += `<span class="chat-context-item">\u2713 ${escapeHTML(area.label)}${area.detail ? ' (' + escapeHTML(area.detail) + ')' : ''}</span>`;
    }
    html += '</div>';
  }

  return html;
}

export function regenerateLastMessage() {
  if (state.chatHistory.length < 2) return;
  if (isChatRuntimeStreaming()) return;
  const callbacks = getChatRegenerateCallbacks();
  if (!callbacks) return;
  const { renderChatMessages, sendChatMessage } = callbacks;

  state.chatHistory.pop();
  const lastUserMsg = state.chatHistory[state.chatHistory.length - 1];
  if (!lastUserMsg || lastUserMsg.role !== 'user') return;
  const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('chat-input'));
  if (input) input.value = lastUserMsg.content;
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
  navigator.clipboard.writeText(msg.content).then(() => {
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
  if (!details) return;
  const open = details.style.display !== 'none';
  details.style.display = open ? 'none' : 'flex';
  if (arrow) arrow.textContent = open ? '\u25B8' : '\u25BE';
}
