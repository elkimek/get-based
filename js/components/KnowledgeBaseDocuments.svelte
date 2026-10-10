<script lang="ts">
  import { knowledgeBaseClasses as c } from '../knowledge-base-classes.js';
  import type { KnowledgeBaseDocumentView } from '../knowledge-base-presentation.js';
  let { documents }: {
    documents: readonly KnowledgeBaseDocumentView[];
  } = $props();
</script>
<div class={c('kb-document-table')}>
  {#each documents as document}<div class={c('kb-document-row')}>
    <span class={c('kb-document-name')} title={document.source}>{document.source}</span>
    <span class={c('kb-document-count')} title="Indexed excerpts">{document.chunks}</span>
    <button class={c('kb-doc-delete')} data-lens-action="delete-doc" data-lens-source={document.actionSource} aria-label={document.deleteLabel} title="Remove document">×</button>
  </div>{/each}
</div>
<div class={c('kb-document-actions')}><button class={c('kb-text-btn kb-text-btn-danger')} data-lens-action="clear-local">Remove all documents</button></div>
