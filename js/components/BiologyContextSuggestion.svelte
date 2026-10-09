<script lang="ts">
  import type {BiologyContextSuggestionView} from '../biology-context-presentation.js';
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  let {view}: {view: BiologyContextSuggestionView} = $props();
</script>
<div class={`${c('biology-context-suggestion')} biology-context-${view.confidence}`}>
  <div class={c('biology-context-suggestion-heading')}>
    <strong class={c('biology-context-suggestion-label')}>{view.label}</strong>
    <span class={c('biology-context-meta')}>{view.confidenceLabel}</span>
  </div>
  <p class={c('biology-context-copy')}>{view.reason}</p>
  {#if view.evidence.length}
    <ul class={c('biology-context-evidence')}>{#each view.evidence as item}<li>{item}</li>{/each}</ul>
  {/if}
  {#if view.affects !== null}<small class={c('biology-context-meta')}>Affects: {view.affects}</small>{/if}
  {#if !view.active}
    <div class={c('biology-context-actions')}>
      <button type="button" class={c('dashboard-action-btn dashboard-action-btn-secondary biology-context-control')}
        data-biology-score-action="apply-context-ai" data-context-flag={view.flag}>Apply flag</button>
      <button type="button" class={c('dashboard-action-btn dashboard-action-btn-secondary biology-context-control')}
        data-biology-score-action="dismiss-context-ai" data-context-flag={view.flag}>Dismiss</button>
    </div>
  {/if}
</div>
