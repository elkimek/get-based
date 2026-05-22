// chat-actions.js — message action bar rendering and handlers

import { state } from './state.js';
import { escapeHTML } from './utils.js';
import { CHAT_ICON_COPY, CHAT_ICON_REFRESH, setIconButtonContent } from './chat-icons.js';
import { saveChatHistory } from './chat-history.js';

export function buildActionBar(msgIndex) {
  const msg = state.chatHistory[msgIndex];
  if (!msg || msg.role !== 'assistant') return '';
  const isLast = msgIndex === state.chatHistory.length - 1;

  let html = '<div class="chat-action-bar">';
  if (isLast) {
    html += `<button class="chat-action-btn" onclick="regenerateLastMessage()" title="Regenerate response">${CHAT_ICON_REFRESH}<span>Regenerate</span></button>`;
  }
  html += `<button class="chat-action-btn" onclick="copyMessage(${msgIndex})" id="chat-copy-btn-${msgIndex}" title="Copy to clipboard">${CHAT_ICON_COPY}<span>Copy</span></button>`;
  html += '</div>';

  if (msg.context && msg.context.length > 0) {
    html += `<div class="chat-context-toggle" onclick="toggleContextDetails(${msgIndex})">`;
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
  const input = document.getElementById('chat-input');
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
