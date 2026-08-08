// @ts-check
// chat-message-edit.js — latest-turn editing and non-destructive conversation forks.

import {
  clearChatDraft,
  resetChatComposer,
  saveChatDraft,
} from './chat-composer.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { isChatRuntimeStreaming } from './chat-runtime.js';
import { state } from './state.js';
import { createForkedThread } from './chat-threads.js';
import { showNotification } from './utils.js';

/** @type {{ threadId: string, messageIndex: number, submittedValue: string | null } | null} */
let editSession = null;

const messageEditDeps = {
  renderChatMessages: /** @type {() => void} */ (() => {}),
  sendChatMessage: /** @type {() => void | Promise<void>} */ (() => {}),
  updateChatInputState: /** @type {() => void} */ (() => {}),
};

/** @param {Partial<typeof messageEditDeps>} [deps] */
export function configureChatMessageEditDeps(deps = {}) {
  const previous = { ...messageEditDeps };
  for (const name of Object.keys(messageEditDeps)) {
    const candidate = /** @type {any} */ (deps)[name];
    if (typeof candidate === 'function') {
      /** @type {any} */ (messageEditDeps)[name] = candidate;
    }
  }
  return previous;
}

export function getLatestUserMessageIndex() {
  for (let index = state.chatHistory.length - 1; index >= 0; index -= 1) {
    const message = state.chatHistory[index];
    if (message?.role === 'user' && !message.hidden && !message.joined) return index;
  }
  return -1;
}

/** @param {boolean} active */
function setComposerEditState(active) {
  const area = document.querySelector('.chat-input-area');
  area?.classList.toggle('chat-message-edit-active', active);
  const inputRow = area?.querySelector('.chat-input-row');
  if (active) inputRow?.setAttribute('inert', '');
  else inputRow?.removeAttribute('inert');
  messageEditDeps.updateChatInputState();
}

/** @param {HTMLTextAreaElement} textarea */
function resizeEditTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 72), 240)}px`;
  textarea.classList.toggle('is-scrollable', textarea.scrollHeight > 240);
}

function renderInlineEditor() {
  if (!editSession) return false;
  const message = state.chatHistory[editSession.messageIndex];
  const bubble = document.getElementById(`chat-msg-${editSession.messageIndex}`);
  if (!message || !bubble) return false;

  const label = document.createElement('label');
  label.className = 'chat-message-edit-label';
  label.htmlFor = 'chat-message-edit-input';
  label.textContent = 'Edit your latest message';

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-message-edit-input';
  textarea.id = 'chat-message-edit-input';
  textarea.value = String(message.content || '');
  textarea.rows = 3;
  textarea.setAttribute('aria-describedby', 'chat-message-edit-hint');

  const hint = document.createElement('span');
  hint.className = 'chat-message-edit-hint';
  hint.id = 'chat-message-edit-hint';
  hint.textContent = 'The current response will be replaced.';

  const controls = document.createElement('div');
  controls.className = 'chat-message-edit-controls';
  controls.innerHTML = `<button type="button" class="chat-message-edit-cancel" ${chatMessageActionAttrs('cancel-message-edit')}>Cancel</button>
    <button type="button" class="chat-message-edit-submit" ${chatMessageActionAttrs('submit-message-edit')}>Send again</button>`;

  bubble.classList.add('chat-msg-editing');
  bubble.replaceChildren(label, textarea, hint, controls);
  textarea.addEventListener('input', () => resizeEditTextarea(textarea));
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelChatMessageEdit();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitChatMessageEdit();
    }
  });
  resizeEditTextarea(textarea);
  setComposerEditState(true);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  return true;
}

/** @param {number} messageIndex */
export function beginChatMessageEdit(messageIndex) {
  const message = state.chatHistory[messageIndex];
  if (!message || message.role !== 'user' || !state.currentThreadId) return false;
  if (messageIndex !== getLatestUserMessageIndex()) {
    showNotification('Only your latest message can be edited. Fork an earlier point into a new chat instead.', 'info', 6000);
    return false;
  }
  if (isChatRuntimeStreaming()) {
    showNotification('Wait for the response to finish, or stop it before editing your message.', 'info', 5000);
    return false;
  }
  if (message.hasImages) {
    showNotification('Messages with images cannot be edited because the original attachments may no longer be available.', 'info', 6000);
    return false;
  }
  editSession = {
    threadId: state.currentThreadId,
    messageIndex,
    submittedValue: null,
  };
  return renderInlineEditor();
}

export function cancelChatMessageEdit() {
  if (!editSession) return false;
  editSession = null;
  setComposerEditState(false);
  messageEditDeps.renderChatMessages();
  return true;
}

export function hasPendingChatMessageEdit() {
  return Boolean(editSession);
}

export function getPendingChatMessageEditText() {
  return editSession?.submittedValue;
}

export async function submitChatMessageEdit() {
  const session = editSession;
  const textarea = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById('chat-message-edit-input')
  );
  if (!session || !textarea) return false;
  const value = textarea.value.trim();
  if (!value) {
    textarea.focus();
    return false;
  }
  session.submittedValue = value;
  textarea.disabled = true;
  const submit = /** @type {HTMLButtonElement | null} */ (
    document.querySelector('[data-chat-message-action="submit-message-edit"]')
  );
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Sending…';
  }
  try {
    await messageEditDeps.sendChatMessage();
  } catch {
    showNotification('The edited message could not be sent. Review the conversation and try again.', 'error', 6000);
  }
  if (editSession === session) {
    session.submittedValue = null;
    textarea.disabled = false;
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Send again';
    }
    renderInlineEditor();
  }
  return editSession !== session;
}

/**
 * Called immediately before Send mutates chat history.
 * @returns {{ edited: true } | null | false}
 */
export function prepareChatMessageEditSend() {
  const session = editSession;
  if (!session || session.submittedValue == null) return null;
  if (session.threadId !== state.currentThreadId
    || session.messageIndex !== getLatestUserMessageIndex()) {
    cancelChatMessageEdit();
    return false;
  }
  state.chatHistory = state.chatHistory.slice(0, session.messageIndex);
  editSession = null;
  setComposerEditState(false);
  return { edited: true };
}

/** @param {number} messageIndex */
export async function forkChatFromMessage(messageIndex) {
  const sourceThreadId = state.currentThreadId;
  const message = state.chatHistory[messageIndex];
  if (!sourceThreadId || !message || message.hidden || message.joined) return false;
  if (isChatRuntimeStreaming()) {
    showNotification('Wait for the response to finish, or stop it before forking this conversation.', 'info', 5000);
    return false;
  }
  cancelChatMessageEdit();
  saveChatDraft(sourceThreadId);
  const thread = await createForkedThread(
    sourceThreadId,
    messageIndex,
    state.chatHistory.slice(0, messageIndex + 1),
  );
  if (!thread) return false;
  await clearChatDraft(thread.id);
  resetChatComposer({ clearDraft: false, focus: true });
  showNotification('Forked into a new chat. The original conversation is unchanged.', 'success', 5000);
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('chat-thread-changed', () => {
    if (!editSession || editSession.threadId === state.currentThreadId) return;
    editSession = null;
    setComposerEditState(false);
  });
}
