// @ts-check
// chat-message-action-attrs.js - no-dependency delegated chat action attributes

import { escapeAttr } from './utils.js';

export const CHAT_MESSAGE_ACTION_ATTR = 'data-chat-message-action';
export const CHAT_MESSAGE_INDEX_ATTR = 'data-chat-message-index';
export const CHAT_MESSAGE_ACTION_SELECTOR = `[${CHAT_MESSAGE_ACTION_ATTR}]`;

function chatMessageAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function chatMessageActionAttrs(action, attrs = {}) {
  let html = `${CHAT_MESSAGE_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    html += ` data-chat-message-${escapeAttr(chatMessageAttrName(name))}="${escapeAttr(String(value))}"`;
  }
  return html;
}
