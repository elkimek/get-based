<script lang="ts">
  import type {BiologyCoverageView} from '../biology-planning-presentation.js';
  import {planningClasses as c} from '../biology-planning-classes.js';
  import BiologyPlanningCard from './BiologyPlanningCard.svelte';
  import BiologyCoverageBundle from './BiologyCoverageBundle.svelte';
  let {view}: {view: BiologyCoverageView} = $props();
</script>
<BiologyPlanningCard kind="coverage">
  <div class={c('biology-score-coverage-head')}>
    <div class={c('biology-score-coverage-main')}><div class={c('biology-score-coverage-title-row')}><div class={c('biology-score-coverage-metric')}><strong class={c('biology-coverage-number')}>{view.baselineCoverage}%</strong><span>baseline coverage</span></div><div><p class={c('biology-coverage-intro')}>{view.baselineIntro}</p></div></div></div>
    <div class={c('biology-score-coverage-actions')}><button type="button" class={c('biology-plan-action')} data-biology-score-action="plan-coverage-chat">Make lab plan</button></div>
    <div class={c('biology-coverage-progress-row')}><div class={c('biology-coverage-progress')} role="progressbar" aria-label="Baseline coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={view.baselineCoverage}><span class={c('biology-coverage-progress-fill')} style:width={`${view.progress}%`}></span></div></div>
  </div>
  {#if view.questions.length}<div class="biology-coverage-questions">{#each view.questions as question}<p class={c('biology-coverage-question')}><strong>{question.label}</strong> · {question.reason}</p>{/each}</div>{/if}
  {#if view.priority}<div class={c('biology-coverage-priority')}><BiologyCoverageBundle bundle={view.priority}/></div>{/if}
  <details class={c('biology-reading-notes biology-coverage-more')}><summary class={c('biology-coverage-more-summary')}>All suggested markers &amp; optional extras</summary>{' '}<div class={c('biology-coverage-bundle-grid')}>
    {#each view.bundles as bundle}<BiologyCoverageBundle {bundle}/>{' '}{/each}
  </div></details>
</BiologyPlanningCard>
