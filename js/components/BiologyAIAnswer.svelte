<script lang="ts">
  import type {BiologyAIAnswerView} from '../biology-ai-presentation.js';
  import {biologyAIClasses as classes} from '../biology-ai-classes.js';
  import {renderMarkdown} from '../markdown.js';
  import BiologyAIDot from './BiologyAIDot.svelte';
  import BiologyAISkeleton from './BiologyAISkeleton.svelte';
  let {view}: {view: BiologyAIAnswerView} = $props();
</script>
<section class={classes('biology-score-ai')} data-biology-ai-view tabindex="-1" data-biology-score-ai-panel={view.id} aria-busy={view.processing}>
  <div class={classes('biology-score-ai-head')}>
    <div>
      {#if view.heading}<h4 class={classes('biology-ai-heading')}>{view.heading}</h4>{/if}
      {#if view.processing}<span class={classes('biology-score-ai-processing')} role="status"><BiologyAIDot processing/>Assessing markers</span>{/if}
    </div>
    <button type="button" class="dashboard-action-btn dashboard-action-btn-secondary" disabled={view.processing} data-biology-score-action="interpret-score-ai" data-biology-score-id={view.id}>{view.label}</button>
  </div>
  {#if view.refreshReason}<p class={classes('biology-score-ai-stale')}>{view.refreshReason} Refresh to use the latest inputs.</p>{/if}
  {#if view.provenance}<p class={classes('biology-scores-note biology-ai-provenance')}>{view.provenance}</p>{/if}
  <div class={classes('biology-score-ai-answer')} data-biology-score-ai-answer={view.id}>{#if view.text}{@html renderMarkdown(view.text)}{:else if view.processing}<BiologyAISkeleton/>{:else}Explain the main signal, the context that matters, and what to check next.{/if}</div>
</section>
