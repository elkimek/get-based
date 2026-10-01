interface ProviderAttestationValues {
  _ppqAttestation?: unknown;
  _routstrAttestation?: unknown;
  _veniceAttestation?: unknown;
}

export interface ChatRuntimeCallbacks {
  closeModal: (() => unknown) | null;
  isChatStreaming: (() => unknown) | null;
  onChatSaved: ((event: { customPersonality: boolean }) => unknown) | null;
  openContextModal: (() => unknown) | null;
  refreshWebSearchToggle: (() => unknown) | null;
  renderChatMessages: (() => unknown) | null;
  resumeAI: (() => unknown) | null;
  sendChatMessage: ((options?: Record<string, unknown>) => unknown) | null;
  updateChatHeaderModel: (() => unknown) | null;
  updateChatNudge: (() => unknown) | null;
  updateDiscussButton: (() => unknown) | null;
}

// chat-runtime.js - Browser runtime adapters for shared chat hooks.

import { openContextModalRuntime } from './context-cards-runtime.js';

const chatRuntimeCallbacks: ChatRuntimeCallbacks = {
  closeModal: null,
  isChatStreaming: null,
  onChatSaved: null,
  openContextModal: null,
  refreshWebSearchToggle: null,
  renderChatMessages: null,
  resumeAI: null,
  sendChatMessage: null,
  updateChatHeaderModel: null,
  updateChatNudge: null,
  updateDiscussButton: null,
};

export function configureChatRuntimeCallbacks(callbacks: Partial<ChatRuntimeCallbacks> = {}) {
  const previous = { ...chatRuntimeCallbacks };
  for (const name of (Object.keys(chatRuntimeCallbacks) as Array<keyof ChatRuntimeCallbacks>)) {
    if (name in callbacks) {
      const callback = callbacks[name];
      (chatRuntimeCallbacks[name] as ChatRuntimeCallbacks[keyof ChatRuntimeCallbacks]) =
        typeof callback === 'function' ? callback : null;
    }
  }
  return previous;
}

function callChatRuntimeCallback(name: Exclude<keyof ChatRuntimeCallbacks, 'onChatSaved'>) {
  const callback = chatRuntimeCallbacks[name];
  if (typeof callback !== 'function') return false;
  callback();
  return true;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as Window & ProviderAttestationValues)
    : null;
}

/**
 */
function getRuntimeValue(name: keyof ProviderAttestationValues) {
  const runtime = getRuntimeWindow();
  return runtime ? runtime[name] : undefined;
}

export function renderChatMessagesRuntime() {
  callChatRuntimeCallback('renderChatMessages');
}

export function notifyCustomPersonalitySavedRuntime() {
  chatRuntimeCallbacks.onChatSaved?.({ customPersonality: true });
}

export function resumeChatAIRuntime() {
  return callChatRuntimeCallback('resumeAI');
}

export function refreshChatWebSearchToggleRuntime() {
  return callChatRuntimeCallback('refreshWebSearchToggle');
}

export function updateChatHeaderModelRuntime() {
  return callChatRuntimeCallback('updateChatHeaderModel');
}

export function updateChatNudgeRuntime() {
  return callChatRuntimeCallback('updateChatNudge');
}

export function updateDiscussButtonRuntime() {
  callChatRuntimeCallback('updateDiscussButton');
}

export async function openChatContextModalRuntime() {
  if (openContextModalRuntime()) return true;
  // Chat can be the first feature opened on a fresh profile, before the
  // dashboard Context composition has registered its callback. Load that
  // surface only when the user explicitly asks for it.
  try {
    if (!chatRuntimeCallbacks.openContextModal) return false;
    await chatRuntimeCallbacks.openContextModal();
    return true;
  } catch (error) {
    console.error('[chat] Context could not be opened', error);
    return false;
  }
}

export function closeChatModalRuntime() {
  callChatRuntimeCallback('closeModal');
}

export function isChatRuntimeStreaming() {
  return Boolean(chatRuntimeCallbacks.isChatStreaming?.());
}

export function getChatRegenerateCallbacks() {
  const renderChatMessages = chatRuntimeCallbacks.renderChatMessages;
  const sendChatMessage = chatRuntimeCallbacks.sendChatMessage;
  if (!renderChatMessages || !sendChatMessage) return null;
  return { renderChatMessages, sendChatMessage };
}

export function getChatProviderAttestation(provider: string) {
  const key = provider === 'ppq' ? '_ppqAttestation'
    : provider === 'routstr' ? '_routstrAttestation'
    : '_veniceAttestation';
  return getRuntimeValue(key);
}
