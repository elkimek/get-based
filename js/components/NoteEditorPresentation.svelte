<script lang="ts">
  import type { NoteEditorView } from '../notes-presentation.js';
  import { noteEditorClasses as c } from '../note-editor-classes.js';

  let { view }: { view: NoteEditorView } = $props();
</script><svelte:options preserveWhitespace={true} /><button type="button" class="modal-close" data-note-action="close">&times;</button>
    <h3>{view.title}</h3>
    <div class="modal-unit">Add context: medication changes, supplements, symptoms, lifestyle changes</div>
    <div class={c.dateContainer}>
      <!-- svelte-ignore a11y_label_has_associated_control (Keep the sealed native Date label contract during presentation migration.) --><label class={c.dateLabel}>Date</label>
      <input type="date" id="note-date-input" value={view.date} class={c.dateInput}>
    </div>
    <textarea class={c.textarea} id="note-textarea" placeholder="e.g. Started creatine supplement, switched to low-carb diet...">{view.text}</textarea>
    <div class="note-editor-actions">
      <button type="button" class="import-btn import-btn-primary" data-note-action="save" data-note-index={view.saveIndex}>Save</button>
      <button type="button" class="import-btn import-btn-secondary" data-note-action="close">Cancel</button>
      {#if view.isEditing}<button type="button" class={c.deleteButton} data-note-action="delete" data-note-index={view.deleteIndex}>Delete</button>{/if}
    </div>