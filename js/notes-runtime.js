// @ts-check
// notes-runtime.js - Explicit application callbacks for Notes views.

/** @type {{
 *   closeModal: (() => void) | null,
 *   rememberModalTrigger: (() => void) | null,
 *   navigate: ((route: string) => void) | null,
 * }} */
const notesRuntimeDeps = {
  closeModal: null,
  rememberModalTrigger: null,
  navigate: null,
};

/**
 * @param {{
 *   closeModal?: (() => void) | null,
 *   rememberModalTrigger?: (() => void) | null,
 *   navigate?: ((route: string) => void) | null,
 * }} deps
 */
export function configureNotesRuntimeDeps(deps = {}) {
  const previous = { ...notesRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    notesRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'rememberModalTrigger')) {
    notesRuntimeDeps.rememberModalTrigger = typeof deps.rememberModalTrigger === 'function'
      ? deps.rememberModalTrigger
      : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    notesRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  return previous;
}

export function closeNoteModalRuntime() {
  notesRuntimeDeps.closeModal?.();
}

export function rememberNoteModalTriggerRuntime() {
  notesRuntimeDeps.rememberModalTrigger?.();
}

export function navigateAfterNoteChangeRuntime(route = 'dashboard') {
  notesRuntimeDeps.navigate?.(route || 'dashboard');
}
