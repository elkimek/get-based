// @ts-check
// Per-model chat reasoning preferences for direct and local AI providers.
// CLI-backed selections use agent-chat-settings so Settings and Chat share the
// same source of truth.

const CHAT_REASONING_KEY_PREFIX = 'labcharts-chat-reasoning-effort-v1';

function preferenceKey(provider, modelId) {
  const cleanProvider = String(provider || '').trim().slice(0, 80) || 'unknown';
  const cleanModel = String(modelId || '').trim().slice(0, 200) || 'default';
  return `${CHAT_REASONING_KEY_PREFIX}:${encodeURIComponent(cleanProvider)}:${encodeURIComponent(cleanModel)}`;
}

export function getDirectChatReasoningEffort(provider, modelId) {
  return (localStorage.getItem(preferenceKey(provider, modelId)) || '').trim().slice(0, 40);
}

export function setDirectChatReasoningEffort(provider, modelId, effort) {
  const key = preferenceKey(provider, modelId);
  const value = String(effort || '').trim().slice(0, 40);
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
  globalThis.dispatchEvent?.(new CustomEvent('getbased:chat-model-selection-changed'));
  return value;
}

export const CHAT_REASONING_PREFERENCE_KEY_PREFIX = CHAT_REASONING_KEY_PREFIX;
