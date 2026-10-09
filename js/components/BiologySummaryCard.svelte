<script lang="ts">
  import type {BiologySummaryCardView} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  import BiologySummaryStatus from './BiologySummaryStatus.svelte';
  import BiologySummaryInputs from './BiologySummaryInputs.svelte';
  let {view}: {view: BiologySummaryCardView} = $props();
</script>
<article class={c(`biology-score-card biology-score-card-${view.tone}`)} data-biology-score-action="jump-to-domain" data-biology-score-id={view.id}>
  <div class={c('biology-score-card-head')}>
    <div><div class={c('biology-score-kicker')}>{view.kicker}</div>
      <h4 class={c('biology-summary-title')}><button type="button" class={c('biology-summary-jump biology-summary-control')}
        data-biology-score-action="jump-to-domain" data-biology-score-id={view.id}
        aria-label={`Open ${view.title} in Biology Scores lens`}>{view.title}</button></h4>
    </div>
    <div class={c('biology-score-value')}><strong class={c('biology-summary-number')}>{view.value}</strong><span class={c('biology-summary-unit')}>/100</span></div>
  </div>
  <p class={c('biology-score-summary')}>{view.summary}</p>
  <div class={c('biology-score-rail')} aria-hidden="true">
    <div class={c('biology-score-rail-fill')}></div>
    {#if view.pin !== null}<span class={c(`biology-score-pin biology-score-pin-${view.tone}`)} style:left={`calc(${view.pin}% - 5px)`}></span>{/if}
  </div>
  <BiologySummaryStatus statuses={view.statuses}/>
  <BiologySummaryInputs seen={view.seen} missing={view.missing} extra={view.extraMissing}/>
</article>
