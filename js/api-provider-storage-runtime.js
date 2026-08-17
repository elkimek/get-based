// @ts-check
// api-provider-storage-runtime.js - Browser runtime adapters for persisted provider settings.

import {
  refreshChatWebSearchToggleRuntime,
  updateChatAttachmentControlsRuntime,
  updateChatHeaderModelRuntime,
  updateChatInputStateRuntime,
} from './chat-runtime.js';

async function rejectUnconfiguredProviderWrite() {
  throw new Error('Encrypted provider storage is not configured.');
}

/** @type {{ encryptedSetItem: (key: string, value: string) => Promise<void> }} */
const apiProviderStorageRuntimeDeps = {
  encryptedSetItem: rejectUnconfiguredProviderWrite,
};

export function configureApiProviderStorageRuntimeDeps(deps = {}) {
  const previous = { ...apiProviderStorageRuntimeDeps };
  if (Object.hasOwn(deps, 'encryptedSetItem')) {
    apiProviderStorageRuntimeDeps.encryptedSetItem = typeof deps.encryptedSetItem === 'function'
      ? deps.encryptedSetItem
      : rejectUnconfiguredProviderWrite;
  }
  return previous;
}

export function encryptedSetProviderItemRuntime(key, value) {
  return apiProviderStorageRuntimeDeps.encryptedSetItem(key, value);
}

function getApiProviderStorageRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function refreshAIProviderSelectionRuntime() {
  const headerRefreshed = updateChatHeaderModelRuntime();
  const attachmentsRefreshed = updateChatAttachmentControlsRuntime();
  const inputRefreshed = updateChatInputStateRuntime();
  const searchRefreshed = refreshChatWebSearchToggleRuntime();
  return searchRefreshed || inputRefreshed || attachmentsRefreshed || headerRefreshed;
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
