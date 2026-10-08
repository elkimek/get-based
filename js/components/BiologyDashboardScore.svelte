<script lang="ts">
  import type {BiologyDashboardScoreView} from '../biology-overview-presentation.js';
  import {biologyOverviewClasses as c} from '../biology-overview-classes.js';
  let {view}: {view: BiologyDashboardScoreView} = $props();
</script>
<button data-biology-overview-view type="button" class="db-hero-bio db-hero-biology-score" data-biology-score-action="jump-to-domain" data-biology-score-id={view.id} aria-label={`Open ${view.title} in Biology Scores lens`}>
  <span class="db-hero-bio-left"><span class="db-hero-bio-num">{view.value}<small class={c('biology-dashboard-unit')}>/100</small></span><span class="db-hero-bio-label"><span class="top">{view.status}</span><span class="actual">{view.meta}</span><span class={c('delta biology-dashboard-detail')}>{view.detail}</span></span></span>
  <span class="db-hero-bio-right"><div class={c('db-hero-bio-bar db-hero-bio-bar-track')} aria-hidden="true"><div class={c('db-hero-bio-bar-fill')} style:width={`${view.width}%`} style:background={view.color}></div><span class={c('db-hero-bio-bar-pin')} style:left={`${view.width}%`}></span></div><span class="db-hero-scale"><span>0</span><span>50</span><span>100</span></span></span>
</button>
