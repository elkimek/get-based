<script lang="ts">
  import type {BiologyAISummaryView} from '../biology-ai-presentation.js';
  import {biologyAIClasses as classes} from '../biology-ai-classes.js';
  import BiologyAIDot from './BiologyAIDot.svelte';
  import BiologyAISkeleton from './BiologyAISkeleton.svelte';
  let {view}: {view: BiologyAISummaryView} = $props();
</script>
<span class={classes('biology-score-ai-teaser')} data-biology-ai-view data-biology-score-ai-summary={view.id} aria-busy={view.processing}>
  <span class={classes('biology-score-ai-teaser-label')} role="status" aria-live="polite" aria-atomic="true" aria-label={view.statusLabel}><BiologyAIDot processing={view.processing} color={view.color}/>{view.status}</span>
  <span class={classes('biology-score-ai-teaser-text')}>{#if view.skeleton}<BiologyAISkeleton/>{:else}{view.summary}{/if}</span>
  <button type="button" class={classes('biology-score-ai-teaser-action')} disabled={view.processing} data-biology-score-action={view.action} data-biology-score-id={view.id} aria-label={view.actionLabel}>{view.label}</button>
  {#if view.refreshReason}<span class={classes('biology-score-ai-refresh-reason')}>{view.refreshReason}</span>{/if}
  <span class={classes('biology-score-ai-error')} role="status">{view.error}</span>
</span>
