// @ts-check
// Runtime-neutral version and capability contract for the loopback companion.

export const AGENT_HOST_PROTOCOL_VERSION = 2;

export const AGENT_HOST_CAPABILITIES = Object.freeze({
  CHAT_STREAM: 'chat-stream',
  DYNAMIC_TOOLS: 'dynamic-tools',
  IMAGE_UPLOAD: 'image-upload',
  MODEL_CATALOG: 'model-catalog',
  REASONING_CATALOG: 'reasoning-catalog',
  STRUCTURED_OUTPUT: 'structured-output',
  STRUCTURED_HEALTH_TOOLS: 'structured-health-tools',
  THREAD_HISTORY: 'thread-history',
  WEB_SEARCH_ACTIVITY: 'web-search-activity',
});

export const AGENT_HOST_CAPABILITY_LIST = Object.freeze(Object.values(AGENT_HOST_CAPABILITIES));

/** @param {unknown} value */
export function normalizeAgentHostCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim().slice(0, 80)).filter(Boolean))];
}

/** @param {unknown} status @param {string[]} required */
export function agentHostSupportsCapabilities(status, required = []) {
  if (!status || typeof status !== 'object') return required.length === 0;
  const capabilities = new Set(normalizeAgentHostCapabilities(/** @type {any} */ (status).capabilities));
  return required.every(capability => capabilities.has(capability));
}

/** @param {unknown} value */
export function normalizeAgentHostProtocolVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 0;
}
