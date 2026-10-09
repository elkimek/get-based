<script lang="ts">
  import type {BiologySummaryWidgetView} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  import BiologySummaryHero from './BiologySummaryHero.svelte';
  import BiologySummaryCard from './BiologySummaryCard.svelte';
  let {view}: {view: BiologySummaryWidgetView} = $props();
</script>
<div data-biology-summary-view class={c('biology-scores-widget')}>
  <BiologySummaryHero view={view.hero}/>
  <div class={c('biology-score-grid')}>{#each view.cards as card}<BiologySummaryCard view={card}/>{/each}</div>
  <p class={c('biology-scores-note')}>Educational pattern score only. Score tone reflects the current marker pattern, coverage reflects missing inputs, and staleness is tracked separately.</p>
</div>
