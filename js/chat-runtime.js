// @ts-check
// chat-runtime.js - Browser runtime adapters for shared chat hooks.

import { openContextModalRuntime } from './context-cards-runtime.js';

/** @type {Record<'closeModal' | 'isChatStreaming' | 'onChatSaved' | 'refreshWebSearchToggle' | 'renderChatMessages' | 'resumeAI' | 'sendChatMessage' | 'updateChatHeaderModel' | 'updateChatNudge' | 'updateDiscussButton', Function | null>} */
const chatRuntimeCallbacks = {
  closeModal: null,
  isChatStreaming: null,
  onChatSaved: null,
  refreshWebSearchToggle: null,
  renderChatMessages: null,
  resumeAI: null,
  sendChatMessage: null,
  updateChatHeaderModel: null,
  updateChatNudge: null,
  updateDiscussButton: null,
};

/** @param {Partial<Record<keyof typeof chatRuntimeCallbacks, Function | null>>} [callbacks] */
export function configureChatRuntimeCallbacks(callbacks = {}) {
  const previous = { ...chatRuntimeCallbacks };
  for (const name of Object.keys(chatRuntimeCallbacks)) {
    if (name in callbacks) {
      const callback = callbacks[/** @type {keyof typeof chatRuntimeCallbacks} */ (name)];
      chatRuntimeCallbacks[/** @type {keyof typeof chatRuntimeCallbacks} */ (name)] =
        typeof callback === 'function' ? callback : null;
    }
  }
  return previous;
}

/** @param {keyof typeof chatRuntimeCallbacks} name */
function callChatRuntimeCallback(name) {
  const callback = chatRuntimeCallbacks[name];
  if (typeof callback !== 'function') return false;
  callback();
  return true;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {any}
 */
function getRuntimeValue(name) {
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
    const { openContextModal } = await import('./context-cards.js');
    openContextModal();
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

/** @param {string} provider */
export function getChatProviderAttestation(provider) {
  const key = provider === 'ppq' ? '_ppqAttestation'
    : provider === 'routstr' ? '_routstrAttestation'
    : '_veniceAttestation';
  return getRuntimeValue(key);
}
