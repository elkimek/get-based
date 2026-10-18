<script lang="ts">
 import type {DashboardNotesView} from '../../types/dashboard-owned-widgets.js';
 let {view}:{view:DashboardNotesView}=$props();
</script>
<svelte:options preserveWhitespace={true}/>
<div class="notes-section dashboard-notes-widget"><button type="button" class="add-note-btn" data-dashboard-widget-action="open-note-editor">+ Add Note</button>{#each view.rows as note (note.index)}<div class="note-card" role="button" tabindex="0" aria-label={'Note from '+note.dateLabel} data-dashboard-widget-action="open-note-editor" data-dashboard-widget-index={note.index}>
          <div class="note-card-date">{note.dateLabel}</div>
          <div class="note-card-text">{note.preview}</div>
          <div class="note-card-actions">
            <button type="button" class="note-card-action" data-dashboard-widget-action="open-note-editor" data-dashboard-widget-index={note.index}>Edit</button>
            <button type="button" class="note-card-action note-card-action-delete" data-dashboard-widget-action="delete-note" data-dashboard-widget-index={note.index}>Delete</button>
          </div>
        </div>{:else}<div class="dashboard-widget-empty">No notes yet. Add notes to track context around your lab results.</div>{/each}</div>
