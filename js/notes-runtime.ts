import { configureRuntimeCallbacks } from './runtime-callbacks.js';

export interface NotesRuntimeCallbacks {
  closeModal: (() => void) | null;
  rememberModalTrigger: (() => void) | null;
  navigate: ((route: string) => void) | null;
}

// notes-runtime.js - Explicit application callbacks for Notes views.

const notesRuntimeDeps: NotesRuntimeCallbacks = {
  closeModal: null,
  rememberModalTrigger: null,
  navigate: null,
};

export function configureNotesRuntimeDeps(deps: Partial<NotesRuntimeCallbacks> = {}): NotesRuntimeCallbacks {
  return configureRuntimeCallbacks(notesRuntimeDeps, deps);
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
