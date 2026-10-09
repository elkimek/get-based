<script lang="ts">
  import type {BiologySummaryHeroView} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  import BiologyContextBanner from './BiologyContextBanner.svelte';
  let {view}: {view: BiologySummaryHeroView} = $props();
</script>
<div class={c(`biology-scores-hero${view.lens ? ' biology-scores-lens-hero' : ''}`)}>
  <div><p class={c('biology-summary-lead')}>{view.lead}</p>
    {#if view.labels.length}<BiologyContextBanner labels={view.labels} page={false} heading="Active context modifiers"/>{/if}
  </div>
  <span class={c('biology-scores-count')}>{view.count}</span>
</div>
