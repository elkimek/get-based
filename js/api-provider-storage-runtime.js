// @ts-check
// api-provider-storage-runtime.js - Browser runtime adapters for persisted provider settings.

import {
  refreshChatWebSearchToggleRuntime,
  updateChatHeaderModelRuntime,
} from './chat-runtime.js';

function getApiProviderStorageRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function refreshAIProviderSelectionRuntime() {
  const headerRefreshed = updateChatHeaderModelRuntime();
  return refreshChatWebSearchToggleRuntime() || headerRefreshed;
}

export function dispatchAISettingsLocalChangedRuntime() {
  const runtime = getApiProviderStorageRuntime();
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof runtime.CustomEvent !== 'function') return false;
  try {
    runtime.dispatchEvent(new runtime.CustomEvent('labcharts-ai-settings-local-changed'));
    return true;
  } catch {
    return false;
  }
}

export function touchRoutstrSessionClock() {
  const stored = Number(localStorage.getItem('labcharts-routstr-session-updated-at') || 0);
  const previous = Number.isFinite(stored) ? stored : 0;
  const updatedAt = Math.max(Date.now(), previous + 1);
  localStorage.setItem('labcharts-routstr-session-updated-at', String(updatedAt));
  return updatedAt;
}
