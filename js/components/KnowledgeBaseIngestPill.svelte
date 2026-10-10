<script lang="ts">
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
</script>
<div class={c('kb-ingest-pill-head')}>
  <strong class={u('pill-heading')}>Indexing knowledge base</strong>
  <button id="lens-ingest-pill-dismiss" class={c('kb-ingest-pill-dismiss')} title="Hide while indexing continues" aria-label="Hide progress">&times;</button>
</div>
<div id="lens-ingest-pill-text" class={c('kb-ingest-pill-text')}>Preparing…</div>
<progress class={u('pill-progress-bar')} id="lens-ingest-pill-bar" value="0" max="1"></progress>
<button id="lens-ingest-pill-cancel" class={c('kb-ingest-pill-stop')}>Stop indexing</button>
