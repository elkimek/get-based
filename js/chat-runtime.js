// @ts-check
// chat-runtime.js - Browser runtime adapters for shared chat hooks.

import { openContextModalRuntime } from './context-cards-runtime.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

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
  const sendChatMessage = getRuntimeFunction('sendChatMessage');
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
