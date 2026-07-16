// @ts-check
// chat-runtime.js - Browser runtime adapters for shared chat hooks.

import { openContextModalRuntime } from './context-cards-runtime.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

/** @type {Record<'refreshWebSearchToggle' | 'sendChatMessage' | 'updateChatHeaderModel' | 'updateChatNudge', Function | null>} */
const chatRuntimeCallbacks = {
  refreshWebSearchToggle: null,
  sendChatMessage: null,
  updateChatHeaderModel: null,
  updateChatNudge: null,
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
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) : getViewRuntimeFunction(name);
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
  getRuntimeFunction('renderChatMessages')?.();
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
  getRuntimeFunction('updateDiscussButton')?.();
}

export function openChatContextModalRuntime() {
  openContextModalRuntime();
}

export function closeChatModalRuntime() {
  getRuntimeFunction('closeModal')?.();
}

export function isChatRuntimeStreaming() {
  return Boolean(getRuntimeFunction('isChatStreaming')?.());
}

export function getChatRegenerateCallbacks() {
  const renderChatMessages = getRuntimeFunction('renderChatMessages');
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
