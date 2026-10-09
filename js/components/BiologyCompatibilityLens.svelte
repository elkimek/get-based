<script lang="ts">
  import type {BiologyCompatibilityLensView} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  import BiologySummaryHero from './BiologySummaryHero.svelte';
  import BiologyCoherenceOverview from './BiologyCoherenceOverview.svelte';
  import BiologyNextChecks from './BiologyNextChecks.svelte';
  import BiologyCoveragePlanner from './BiologyCoveragePlanner.svelte';
  import BiologyScoreDetail from './BiologyScoreDetail.svelte';
  let {view}: {view: BiologyCompatibilityLensView} = $props();
</script>
<div data-biology-summary-view class={c('biology-scores-lens')}>
  <BiologySummaryHero view={view.hero}/>
  {#if view.coherence}<BiologyCoherenceOverview view={view.coherence}/>{/if}
  {#if view.checks.length}<BiologyNextChecks rows={view.checks}/>{/if}
  <BiologyCoveragePlanner view={view.coverage}/>
  <div class={c('biology-score-detail-stack')}>{#each view.details as detail}<BiologyScoreDetail view={detail}/>{/each}</div>
  <p class={c('biology-scores-note')}>Educational pattern score only. This is reference/target-pattern coherence, not an outcome-validated diagnosis. Score tone reflects the current marker pattern; confidence reflects core-marker coverage; staleness is tracked separately.</p>
</div>
