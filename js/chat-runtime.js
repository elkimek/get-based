// @ts-check
// chat-runtime.js - Browser runtime adapters for shared chat hooks.

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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
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
  getRuntimeFunction('openContextModal')?.();
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
  return getRuntimeValue(provider === 'ppq' ? '_ppqAttestation' : '_veniceAttestation');
}
