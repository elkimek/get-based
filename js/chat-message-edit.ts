// chat-message-edit.js — latest-turn editing and non-destructive conversation forks.

import {
  clearChatDraft,
  resetChatComposer,
  saveChatDraft,
} from './chat-composer.js';
import { renderChatMessageEditor, publishChatMessageEditorBusy, disposeChatMessageEditor } from './chat-message-editor-component.js';
import { publishChatMessageEditing } from './chat-message-editor-view.js';
import { isChatRuntimeStreaming } from './chat-runtime.js';
import { state } from './state.js';
import { createForkedThread } from './chat-threads.js';
import { showNotification } from './utils.js';

interface ChatEditSession { profile: typeof state.currentProfile; threadId: string; messageIndex: number; history: typeof state.chatHistory; message: (typeof state.chatHistory)[number]; submittedValue: string | null }
let editSession: ChatEditSession | null = null;

type MessageEditCalls = { renderChatMessages: () => unknown; sendChatMessage: () => unknown; updateChatInputState: () => unknown };
const messageEditDeps: MessageEditCalls = {
  renderChatMessages: () => {},
  sendChatMessage: () => {},
  updateChatInputState: () => {},
};

export function configureChatMessageEditDeps(deps: Record<string, unknown> = {}): { [Key in keyof MessageEditCalls]: unknown } {
  const previous = { ...messageEditDeps };
  for (const name of Object.keys(messageEditDeps)) {
    const candidate = deps[name];
    if (typeof candidate === 'function') {
      (messageEditDeps as Record<string, unknown>)[name] = candidate;
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

function setComposerEditState(active: boolean) {
  publishChatMessageEditing(active);
  messageEditDeps.updateChatInputState();
}

function renderInlineEditor(draft?: string) {
  const session = editSession;
  if (!session) return false;
  const message = state.chatHistory[session.messageIndex];
  const bubble = document.getElementById(`chat-msg-${session.messageIndex}`);
  if (!message || !bubble) return false;
  const rendered = renderChatMessageEditor(bubble, session.messageIndex, draft ?? String(message.content || ''), {
    cancel: () => { if (editSession === session) cancelChatMessageEdit(); },
    submit: () => { if (editSession === session) void submitChatMessageEdit(); },
    retired: () => { if (editSession === session) { editSession = null; setComposerEditState(false); } },
  });
  // Replacing a previously mounted editor retires that owner synchronously.
  if (rendered) { editSession = session; setComposerEditState(true); }
  return rendered;
}

export function beginChatMessageEdit(messageIndex: number) {
  if (editSession?.submittedValue != null) return false;
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
    profile: state.currentProfile,
    message,
    history: state.chatHistory,
    threadId: state.currentThreadId,
    messageIndex,
    submittedValue: null,
  };
  if (renderInlineEditor()) return true;
  editSession = null;
  return false;
}

export function cancelChatMessageEdit() {
  if (!editSession) return false;
  editSession = null;
  disposeChatMessageEditor();
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
  const textarea = document.getElementById('chat-message-edit-input') as HTMLTextAreaElement | null;
  if (!session || !textarea || session.submittedValue != null) return false;
  if (session.profile !== state.currentProfile || session.threadId !== state.currentThreadId
    || session.history !== state.chatHistory || session.message !== state.chatHistory[session.messageIndex]) { cancelChatMessageEdit(); return false; }
  const value = textarea.value.trim();
  if (!value) {
    textarea.focus();
    return false;
  }
  session.submittedValue = value;
  publishChatMessageEditorBusy(true);
  try {
    await messageEditDeps.sendChatMessage();
  } catch {
    if (editSession === session && session.profile === state.currentProfile && session.threadId === state.currentThreadId
      && session.history === state.chatHistory && session.message === state.chatHistory[session.messageIndex]) showNotification('The edited message could not be sent. Review the conversation and try again.', 'error', 6000);
  }
  if (editSession === session) {
    session.submittedValue = null;
    publishChatMessageEditorBusy(false);
    if (session.profile !== state.currentProfile || session.threadId !== state.currentThreadId
      || session.history !== state.chatHistory || session.message !== state.chatHistory[session.messageIndex]) {
      cancelChatMessageEdit();
    } else renderInlineEditor(value);
  }
  return editSession !== session;
}

/**
 * Called immediately before Send mutates chat history.
 * @returns {{ edited: true, restore: () => void } | null | false}
 */
export function prepareChatMessageEditSend(): { edited: true; restore: () => void } | null | false {
  const session = editSession;
  if (!session || session.submittedValue == null) return null;
  if (session.profile !== state.currentProfile
    || session.history !== state.chatHistory
    || session.message !== state.chatHistory[session.messageIndex]
    || session.threadId !== state.currentThreadId
    || session.messageIndex !== getLatestUserMessageIndex()) {
    cancelChatMessageEdit();
    return false;
  }
  state.chatHistory = state.chatHistory.slice(0, session.messageIndex);
  editSession = null;
  setComposerEditState(false);
  return { edited: true, restore: () => {
    if (session.profile !== state.currentProfile || session.threadId !== state.currentThreadId
      || session.message !== state.chatHistory[session.messageIndex] || editSession) return;
    session.history = state.chatHistory;
    editSession = session;
    setComposerEditState(true);
  } };
}

export async function forkChatFromMessage(messageIndex: number) {
  const profile = state.currentProfile;
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
  if (!thread || profile !== state.currentProfile || state.currentThreadId !== thread.id) return false;
  await clearChatDraft(thread.id);
  if (profile !== state.currentProfile || state.currentThreadId !== thread.id) return false;
  resetChatComposer({ clearDraft: false, focus: true });
  showNotification('Forked into a new chat. The original conversation is unchanged.', 'success', 5000);
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('chat-thread-changed', () => {
    if (!editSession || (editSession.profile === state.currentProfile && editSession.threadId === state.currentThreadId)) return;
    editSession = null;
    disposeChatMessageEditor();
    setComposerEditState(false);
  });
}
