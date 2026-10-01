import { configureRuntimeCallbacks } from './runtime-callbacks.js';
// context-cards-runtime.js - Explicit callbacks for context-card integrations.

import { state } from './state.js';
import {
  appendImportedArrayItem,
  ensureImportedArray,
  replaceImportedArrayItem,
  trimImportedArray,
} from './data-merge.js';

export interface ContextCardsCallbacks {
  closeModal: (() => unknown) | null;
  navigate: ((category: string) => unknown) | null;
  onContextCardSaved: (() => unknown) | null;
  openContextModal: (() => unknown) | null;
  openInterpretiveLensEditor: (() => unknown) | null;
  recordChange: ((field: string) => unknown) | null;
  triggerDNAFilePicker: (() => unknown) | null;
}
interface ContextHistoryEntry { field?: unknown; date?: unknown; snapshot?: unknown; updatedAt?: unknown }

/**
 * Record context history without requiring the context-card UI composition.
 * Cycle imports and Chat onboarding both persist through this cold-safe path.
 *
 */
export function recordContextCardChange(field: string) {
  const today = new Date().toISOString().slice(0, 10);
  const current: unknown = state.importedData[field];
  const snapshot: unknown = current != null ? JSON.parse(JSON.stringify(current)) : null;
  const snapshotStr = JSON.stringify(snapshot);
  const history = ensureImportedArray(state.importedData, 'changeHistory') as ContextHistoryEntry[];
  let lastIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.field === field) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx >= 0 && JSON.stringify(history[lastIdx]!.snapshot) === snapshotStr) return;
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

const contextCardsRuntimeCallbacks: ContextCardsCallbacks = {
  closeModal: null,
  navigate: null,
  onContextCardSaved: null,
  openContextModal: null,
  openInterpretiveLensEditor: null,
  recordChange: recordContextCardChange,
  triggerDNAFilePicker: null,
};

export function configureContextCardsRuntimeCallbacks(callbacks: Partial<ContextCardsCallbacks> = {}) {
  return configureRuntimeCallbacks(contextCardsRuntimeCallbacks, callbacks, 'inherited');
}

function callContextCardsRuntime<Name extends keyof ContextCardsCallbacks>(name: Name, ...args: Parameters<NonNullable<ContextCardsCallbacks[Name]>>) {
  const callback = contextCardsRuntimeCallbacks[name];
  if (typeof callback !== 'function') return false;
  try {
    (callback as (...args: Parameters<NonNullable<ContextCardsCallbacks[Name]>>) => unknown)(...args);
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

export function navigateContextCardViewRuntime(category: string) {
  return callContextCardsRuntime('navigate', category);
}

export function notifyContextCardSavedRuntime() {
  return callContextCardsRuntime('onContextCardSaved');
}

export function openInterpretiveLensEditorRuntime() {
  return callContextCardsRuntime('openInterpretiveLensEditor');
}

export function recordContextCardChangeRuntime(field: string) {
  return callContextCardsRuntime('recordChange', field);
}

export function triggerContextCardDNAFilePickerRuntime() {
  return callContextCardsRuntime('triggerDNAFilePicker');
}
