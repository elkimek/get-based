// @ts-check
// context-cards-runtime.js - Explicit callbacks for context-card integrations.

import { state } from './state.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
  trimImportedArray,
} from './data-merge.js';

/**
 * Record context history without requiring the context-card UI composition.
 * Cycle imports and Chat onboarding both persist through this cold-safe path.
 *
 * @param {string} field
 */
export function recordContextCardChange(field) {
  const today = new Date().toISOString().slice(0, 10);
  const current = state.importedData[field];
  const snapshot = current != null ? JSON.parse(JSON.stringify(current)) : null;
  const snapshotStr = JSON.stringify(snapshot);
  const history = ensureImportedArray(state.importedData, 'changeHistory');
  let lastIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].field === field) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx >= 0 && JSON.stringify(history[lastIdx].snapshot) === snapshotStr) return;
  const now = Date.now();
  const todayIdx = history.findIndex(entry => entry.field === field && entry.date === today);
  if (todayIdx >= 0) {
    replaceImportedArrayItem(state.importedData, 'changeHistory', todayIdx, {
      ...history[todayIdx],
      snapshot,
      updatedAt: now,
    });
  } else {
    appendImportedArrayItem(state.importedData, 'changeHistory', {
      field,
      date: today,
      snapshot,
      updatedAt: now,
    });
  }
  trimImportedArray(state.importedData, 'changeHistory', 200);
}

/** @type {Record<string, Function | null>} */
const contextCardsRuntimeCallbacks = {
  closeModal: null,
  navigate: null,
  onContextCardSaved: null,
  openContextModal: null,
  openInterpretiveLensEditor: null,
  recordChange: recordContextCardChange,
  triggerDNAFilePicker: null,
};

/** @param {Record<string, any>} [callbacks] */
export function configureContextCardsRuntimeCallbacks(callbacks = {}) {
  const previous = { ...contextCardsRuntimeCallbacks };
  for (const name of Object.keys(contextCardsRuntimeCallbacks)) {
    if (name in callbacks) {
      contextCardsRuntimeCallbacks[name] = typeof callbacks[name] === 'function'
        ? callbacks[name]
        : null;
    }
  }
  return previous;
}

function callContextCardsRuntime(name, ...args) {
  const callback = contextCardsRuntimeCallbacks[name];
  if (typeof callback !== 'function') return false;
  try {
    callback(...args);
    return true;
  } catch {
    return false;
  }
}

export function openContextModalRuntime() {
  return callContextCardsRuntime('openContextModal');
}

export function closeContextCardModalRuntime() {
  return callContextCardsRuntime('closeModal');
}

/** @param {string} category */
export function navigateContextCardViewRuntime(category) {
  return callContextCardsRuntime('navigate', category);
}

export function notifyContextCardSavedRuntime() {
  return callContextCardsRuntime('onContextCardSaved');
}

export function openInterpretiveLensEditorRuntime() {
  return callContextCardsRuntime('openInterpretiveLensEditor');
}

/** @param {string} field */
export function recordContextCardChangeRuntime(field) {
  return callContextCardsRuntime('recordChange', field);
}

export function triggerContextCardDNAFilePickerRuntime() {
  return callContextCardsRuntime('triggerDNAFilePicker');
}
