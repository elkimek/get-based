// @ts-check

import { getViewRuntimeFunction } from './views-runtime-bridge.js';

/**
 * @typedef {Window & typeof globalThis & {
 *   closeModal?: () => void,
 *   rememberModalTrigger?: () => void,
 *   navigate?: (route: string) => void,
 *   __noteActionDelegatesBound?: boolean,
 * }} NotesRuntimeWindow
 */

function getNotesRuntimeWindow() {
  return /** @type {NotesRuntimeWindow | null} */ (typeof window !== 'undefined' ? window : null);
}

/** @param {string} name */
function getNotesRuntimeFunction(name) {
  const runtime = getNotesRuntimeWindow();
  if (!runtime) return null;
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) : getViewRuntimeFunction(name);
}

export function closeNoteModalRuntime() {
  getNotesRuntimeFunction('closeModal')?.();
}

export function rememberNoteModalTriggerRuntime() {
  getNotesRuntimeFunction('rememberModalTrigger')?.();
}

export function navigateAfterNoteChangeRuntime(route = 'dashboard') {
  getNotesRuntimeFunction('navigate')?.(route || 'dashboard');
}

export function isNoteActionDelegatesBoundRuntime() {
  const runtime = getNotesRuntimeWindow();
  return !!runtime?.__noteActionDelegatesBound;
}

export function markNoteActionDelegatesBoundRuntime() {
  const runtime = getNotesRuntimeWindow();
  if (!runtime) return false;
  runtime.__noteActionDelegatesBound = true;
  return true;
}
