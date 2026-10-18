<svelte:options preserveWhitespace={true}/><script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
import type {MarkerDetailNotesView} from '../marker-detail-view.js';
let {view}:{view:MarkerDetailNotesView}=$props();
</script>{#snippet notes(node:MarkerDetailNotesView)}{#if node.kind === "editor"}<div class="marker-note-section">
    <div class="marker-note-header"><span class="marker-note-label">Note</span><button class="marker-note-edit-btn" data-marker-detail-action={node.editActions.action} data-marker-detail-dot-key={node.editActions.dotKey??undefined}>{node.editLabel}</button></div>
    {#if node.note}{@render notes(node.note)}{/if}
    <div class="marker-note-editor" id="marker-note-editor" style={componentStaticStyles.hidden}>
      <textarea id="marker-note-input" placeholder="Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)" rows="3">{node.text}</textarea>
      <div class="marker-note-actions">
        <button class="import-btn import-btn-primary" data-marker-detail-action={node.saveActions.action} data-marker-detail-dot-key={node.saveActions.dotKey??undefined} data-marker-detail-id={node.saveActions.id??undefined}>Save</button>
        <button class="import-btn import-btn-secondary" data-marker-detail-action={node.cancelActions.action} data-marker-detail-dot-key={node.cancelActions.dotKey??undefined}>Cancel</button>
        {#if node.delete}{@render notes(node.delete)}{/if}
	      </div>
	    </div>
	  </div>{:else if node.kind === "text"}<div class="marker-note-text">{node.text}</div>{:else if node.kind === "delete"}<button class="import-btn import-btn-secondary" style={componentStaticStyles.danger} data-marker-detail-action={node.actions.action} data-marker-detail-dot-key={node.actions.dotKey??undefined} data-marker-detail-id={node.actions.id??undefined}>Delete</button>{/if}{/snippet}{@render notes(view)}