/** Prepared controller facts only; session, dates and persistence remain in notes.ts. */
export interface NoteEditorInput {
  isEditing: boolean;
  defaultDate: unknown;
  currentText: unknown;
  existingIdx: unknown;
}

export interface NoteEditorView {
  title: 'Add Note' | 'Edit Note';
  isEditing: boolean;
  date: string;
  text: string;
  saveIndex: string | null;
  deleteIndex: string | null;
}

const literal = (value: unknown): string => value == null ? '' : String(value);

/** Preserve native-template coercion order and nullish-only action attribute omission. */
export function projectNoteEditorView(input: NoteEditorInput): NoteEditorView {
  const date = literal(input.defaultDate);
  const text = literal(input.currentText);
  const saveIndex = input.isEditing && input.existingIdx != null
    ? String(input.existingIdx)
    : null;
  const deleteIndex = input.isEditing && input.existingIdx != null
    ? String(input.existingIdx)
    : null;

  return {
    title: input.isEditing ? 'Edit Note' : 'Add Note',
    isEditing: input.isEditing,
    date,
    text,
    saveIndex,
    deleteIndex,
  };
}
