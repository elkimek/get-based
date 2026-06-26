// @ts-check
// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { CHAT_ICON_COPY, CHAT_ICON_REFRESH, setIconButtonContent } from './chat-icons.js';
import { saveChatHistory } from './chat-history.js';
import {
  CHAT_MESSAGE_ACTION_ATTR,
  CHAT_MESSAGE_ACTION_SELECTOR,
  CHAT_MESSAGE_INDEX_ATTR,
  chatMessageActionAttrs,
} from './chat-message-action-attrs.js';

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
  const appWindow = /** @type {any} */ (window);

  if (action === 'contain-click') {
    containChatMessageEvent(event);
    return true;
  }

  if (action === 'regenerate-last-message') {
    regenerateLastMessage();
  } else if (action === 'copy-message') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    copyMessage(index);
  } else if (action === 'toggle-context-details') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    toggleContextDetails(index);
  } else if (action === 'remove-image-attachment') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    appWindow.removeImageAttachment?.(index);
  } else if (action === 'open-image-lightbox') {
    const src = actionEl instanceof HTMLImageElement ? actionEl.src : actionEl.dataset.chatMessageSrc;
    if (!src) return;
    appWindow.openImageLightbox?.(src);
  } else if (action === 'open-emf-assessment') {
    appWindow.openEMFAssessmentEditor?.();
  } else if (action === 'jump-search-result') {
    const index = readMessageIndex(actionEl);
    const threadId = actionEl.dataset.chatMessageThreadId || '';
    if (!threadId || index == null) return;
    void appWindow.jumpToSearchResult?.(threadId, index, actionEl.dataset.chatMessagePrefix || '');
  } else if (action === 'view-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return;
    appWindow.viewSavedSummary?.(id);
  } else if (action === 'close-summary') {
    appWindow.closeSummaryModal?.();
  } else if (action === 'copy-summary') {
    appWindow.copySummary?.();
  } else if (action === 'download-summary') {
    appWindow.downloadSummary?.();
  } else if (action === 'print-summary') {
    appWindow.printSummary?.();
  } else if (action === 'delete-summary') {
    const id = actionEl.dataset.chatMessageSummaryId || '';
    if (!id) return;
    void appWindow.deleteSavedSummary?.(id);
  } else if (action === 'start-discussion-from-picker') {
    void appWindow.startDiscussionFromPicker?.();
  } else if (action === 'continue-discussion') {
    void appWindow.continueDiscussion?.();
  } else if (action === 'end-discussion') {
    appWindow.endDiscussion?.();
  } else if (action === 'apply-agent-proposal') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    void appWindow.applyAgentProposalFromChat?.(index);
  } else if (action === 'edit-agent-proposal') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    appWindow.editAgentProposalFromChat?.(index);
  } else if (action === 'dismiss-agent-proposal') {
    const index = readMessageIndex(actionEl);
    if (index == null) return;
    void appWindow.dismissAgentProposalFromChat?.(index);
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
    void /** @type {any} */ (window).continueDiscussion?.();
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
  if (window.isChatStreaming?.()) return;
  const renderChatMessages = window.renderChatMessages;
  const sendChatMessage = window.sendChatMessage;
  if (typeof renderChatMessages !== 'function' || typeof sendChatMessage !== 'function') return;

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

Object.assign(window, {
  regenerateLastMessage,
  copyMessage,
  toggleContextDetails,
});
