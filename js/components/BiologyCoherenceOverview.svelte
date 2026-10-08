<script lang="ts">
  import type {BiologyCoherenceView} from '../biology-overview-presentation.js';
  import {biologyOverviewClasses as c} from '../biology-overview-classes.js';
  import BiologyScoreMetric from './BiologyScoreMetric.svelte';
  import BiologyAISummary from './BiologyAISummary.svelte';
  import BiologyAIAnswer from './BiologyAIAnswer.svelte';
  import BiologyContributors from './BiologyContributors.svelte';
  import BiologyReadingFacts from './BiologyReadingFacts.svelte';
  import BiologyInterpretationNotes from './BiologyInterpretationNotes.svelte';
  import LensDashboardToggle from './LensDashboardToggle.svelte';
  let {view}: {view: BiologyCoherenceView} = $props();
</script>
<section data-biology-overview-view class={c('biology-coherence-hero biology-coherence-visual')} id="biology-score-biologicalCoherence">
  <div class={c('biology-coherence-overview')}><BiologyScoreMetric view={view.metric}/><div><h2 class={c('biology-coherence-title')}>Biological Coherence</h2><p class={c('biology-coherence-explanation')}>{view.explanation}</p><small class={c('biology-coherence-coverage')}>{view.coverage}</small></div></div>
  <div class={c('biology-coherence-ai')}><BiologyAISummary view={view.aiSummary}/><p class={c('biology-scores-note')}>AI runs when requested. Update missing insights reuses saved answers; provider charges may apply. Scores are calculated locally.</p></div>
  {#if view.domains.length}<div class={c('biology-coherence-domains')}>{#each view.domains as domain}<button type="button" class={c('biology-coherence-domain-row')} style:--score-color={domain.color} title={`${domain.value}/100 · Open ${domain.label}`} data-biology-score-action="jump-to-domain" data-biology-score-id={domain.id}><span class={c('biology-domain-label')}>{domain.label}</span><span class={c('biology-domain-meter')} aria-hidden="true"><span class={c('biology-domain-fill')} style:width={`${domain.width}%`}></span></span><strong class={c('biology-domain-value')}>{domain.value}</strong></button>{/each}</div>{/if}
  <BiologyContributors view={view.contributors}/>
  <details class={c('biology-coherence-interpretation')}><summary class={c('biology-overview-disclosure')}>Explanation</summary><BiologyAIAnswer view={view.aiAnswer}/></details>
  <details class={c('biology-coherence-breakdown')}><summary class={c('biology-overview-disclosure')}>How the overview works</summary>
    <div class={c('biology-reading-body')}><BiologyReadingFacts facts={view.facts}/>{#if view.flags.length}<BiologyInterpretationNotes flags={view.flags}/>{/if}<div class={c('biology-reading-source')}><LensDashboardToggle view={view.dashboardToggle}/></div></div>
  </details>
</section>
