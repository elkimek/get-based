// @ts-check

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

export function closeNoteModalRuntime() {
  const runtime = getNotesRuntimeWindow();
  runtime?.closeModal?.();
}

export function rememberNoteModalTriggerRuntime() {
  const runtime = getNotesRuntimeWindow();
  runtime?.rememberModalTrigger?.();
}

export function navigateAfterNoteChangeRuntime(route = 'dashboard') {
  const runtime = getNotesRuntimeWindow();
  runtime?.navigate?.(route || 'dashboard');
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

export function exposeNoteEditorRuntime(actions) {
  const runtime = getNotesRuntimeWindow();
  if (!runtime) return false;
  Object.assign(runtime, actions);
  return true;
}
