<script lang="ts">
  import type {BiologyPageView} from '../biology-page-presentation.js';
  import {biologyPageClasses as c} from '../biology-page-classes.js';
  import LensPageHeader from './LensPageHeader.svelte';
  import LabDateRange from './LabDateRange.svelte';
  import BiologyContextPresentation from './BiologyContextPresentation.svelte';
  import BiologyCoherenceOverview from './BiologyCoherenceOverview.svelte';
  import BiologyNextChecks from './BiologyNextChecks.svelte';
  import BiologyCoveragePlanner from './BiologyCoveragePlanner.svelte';
  import BiologyScoreGroup from './BiologyScoreGroup.svelte';
  let {view}: {view: BiologyPageView} = $props();
</script>
<div data-biology-page-view class="biology-scores-page">
  <LensPageHeader view={{title:'Biology Scores',subtitle:'Body-system patterns from your labs, with marker-level explanations.',className:'biology-scores-lens-header',actions:null}}>
    {#snippet actions()}<div class="biology-score-header-actions"><button type="button" class="dashboard-action-btn dashboard-action-btn-primary" data-biology-score-action="interpret-lens">Discuss scores in chat</button>{' '}<LabDateRange view={view.range}/></div>{/snippet}
  </LensPageHeader>
  <p class={c('biology-scores-note')}>Higher scores mean closer agreement with your selected ranges, including Risk and Load scores. AI interpretations are optional; scores are for learning, not diagnosis.</p>
  <BiologyContextPresentation kind="section" view={view.context}/>
  {#if view.coherence}<BiologyCoherenceOverview view={view.coherence}/>{/if}
  <div class={c('biology-planning-grid')}>{#if view.checks.length}<BiologyNextChecks rows={view.checks}/>{/if}<BiologyCoveragePlanner view={view.coverage}/></div>
  <BiologyScoreGroup view={view.groups.baseline}/><BiologyScoreGroup view={view.groups.advanced}/>
  {#if view.groups.waiting.cards.length}<BiologyScoreGroup view={view.groups.waiting}/>{/if}
</div>
