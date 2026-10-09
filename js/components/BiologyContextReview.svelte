<script lang="ts">
  import type {BiologyContextReviewView} from '../biology-context-presentation.js';
  import {biologyContextClasses as c} from '../biology-context-classes.js';
  import BiologyContextManualFields from './BiologyContextManualFields.svelte';
  import BiologyContextSuggestion from './BiologyContextSuggestion.svelte';
  let {view}: {view: BiologyContextReviewView} = $props();
</script>
<section data-biology-context-view class={c(`biology-context-ai-panel${view.current ? '' : ' biology-context-ai-required'}`)}>
  <div class={c('biology-context-ai-head')}>
    <div><p class={c('biology-context-copy')}>Add context not already captured in your profile or lab entries.</p></div>
    <button type="button" class={c('dashboard-action-btn dashboard-action-btn-primary biology-context-control')}
      data-biology-score-action="analyze-context-ai">{view.buttonLabel}</button>
  </div>
  <BiologyContextManualFields fields={view.fields}/>
  <p class={c('biology-scores-note')}>Set applicable context above without AI. {view.timing} to each lab entry.</p>
  <p class={c('biology-scores-note')}>{view.status}</p>
  {#if view.summary}<p class={c('biology-context-ai-summary biology-context-copy')}>{view.summary}</p>{/if}
  {#if view.suggestions.length}
    <div class={c('biology-context-suggestions')}>{#each view.suggestions as suggestion}<BiologyContextSuggestion view={suggestion}/>{/each}</div>
  {/if}
</section>
