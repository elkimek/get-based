import { renderHTML } from './components/NoteEditorPresentation.svelte.html.js';
import type { NoteEditorView } from './notes-presentation.js';

/** Synchronous presentation only; native inputs and existing delegates retain ownership. */
export function renderNoteEditor(view: NoteEditorView): string {
  return renderHTML({ view });
}
