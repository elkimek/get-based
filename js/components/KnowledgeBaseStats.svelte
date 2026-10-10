<script lang="ts">
  import { knowledgeBaseClasses as c } from '../knowledge-base-classes.js';
  import type { KnowledgeBaseStatsView } from '../knowledge-base-presentation.js';
  let { view }: {
    view: KnowledgeBaseStatsView;
  } = $props();
</script>
{#if view.part === 'summary'}<span class={c('kb-stats-dot')} aria-hidden="true"></span>{view.countCopy}<span title={view.modelTitle}>{view.modelLabel} on {view.backendLabel}{view.speed}</span>{:else if view.part === 'performance-note'}<div class={c('kb-performance-note')}>BGE-base favors retrieval quality over CPU import speed. For faster indexing, create a new library with the Balanced profile.</div>{:else}<span class={c('kb-status-error')}>Failed to load library: {view.message}</span>{/if}
