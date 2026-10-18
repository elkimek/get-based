<script lang="ts">
  import type {BiologyScoreDetailView} from '../biology-card-presentation.js';
  import {biologyCardClasses as c} from '../biology-card-classes.js';
  import BiologyScoreMetric from './BiologyScoreMetric.svelte';
  import BiologyAISummary from './BiologyAISummary.svelte';
  import BiologyAIAnswer from './BiologyAIAnswer.svelte';
  import BiologyInterpretationNotes from './BiologyInterpretationNotes.svelte';
  import BiologyMarkerResults from './BiologyMarkerResults.svelte';
  import BiologyMethodology from './BiologyMethodology.svelte';
  import type {LensWidgetToolsView} from '../lens-shell-presentation.js';
  import LensWidgetTools from './LensWidgetTools.svelte';
  import LensDashboardToggle from './LensDashboardToggle.svelte';
  let {view,tools}: {view: BiologyScoreDetailView; tools?: LensWidgetToolsView} = $props();
</script>
<article data-biology-card-view class={c('biology-score-detail biology-score-compact')} id={`biology-score-${view.id}`}>
  <div class={c(`biology-score-summary${view.scope ? ' biology-summary-with-scope' : ''}`)}><span class={c('biology-score-title')}>{view.title}{#if view.scope}<small class={c('biology-score-scope')}>{view.scope}</small>{/if}</span><BiologyScoreMetric view={view.metric}/><span class={c('biology-score-summary-copy')}><strong class={c('biology-card-status')}>{view.status}</strong><span class={c('biology-card-sentence')}>{view.sentence}</span></span><BiologyAISummary view={view.aiSummary}/><span class={c('biology-score-summary-footer')}><span class={c('biology-score-footer-meta')}>{#if view.membership}<span class={c('biology-card-membership biology-membership-badge')} data-overview-membership={view.membership.kind}>{view.membership.label}</span>{/if}<small class={c('biology-card-coverage')}>{view.coverage}</small></span><button type="button" class={c('biology-score-details-label')} data-biology-score-action="toggle-score" aria-expanded="false" aria-controls={`biology-score-panel-${view.id}`} aria-label={`Details for ${view.title}`}>Details <span class={c('biology-details-arrow')} aria-hidden="true">⌄</span></button></span></div>
  <div class={c('biology-score-expanded')} id={`biology-score-panel-${view.id}`}>
    <div class={c('biology-score-detail-tools')}>{#if tools}<LensWidgetTools view={tools}/>{:else}<LensDashboardToggle view={view.dashboardToggle}/>{/if}</div>{' '}
    {#if view.history}<p class={c('biology-score-history-note')}>{view.history}</p>{/if}{' '}
    <div class={c('biology-score-detail-heading')}><h3 class={c('biology-card-heading')}>{view.title}</h3>{#if view.boundary}<p class={c('biology-card-boundary')}>{view.boundary}</p>{/if}</div>{' '}
    <div class={c('biology-score-ai-details')}><BiologyAIAnswer view={view.aiAnswer}/></div>{' '}
    {#if view.flags.length}<BiologyInterpretationNotes flags={view.flags}/>{/if}{' '}
    <BiologyMarkerResults sections={view.markers}/>{' '}
    {#if view.ratio}<p>{view.ratio.label}: {view.ratio.value} · {view.ratio.date} · context only</p>{/if}{' '}
    <BiologyMethodology view={view.methodology}/>
  </div>
</article>
