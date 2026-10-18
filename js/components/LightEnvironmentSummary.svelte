<script lang="ts">
  import LightBurdenAI from './LightBurdenAI.svelte';
  import type { EnvironmentSummaryView } from '../light-environment-summary-presentation.js';
  import { environmentSummaryClasses as c } from '../light-environment-summary-classes.js';
  let { view }: { view: EnvironmentSummaryView } = $props();
</script>

{#if view.kind === 'assessment'}
  <div data-light-environment-summary class={c(`light-env-assessment-summary light-env-assessment-summary-${view.color}`)}>
    <div class={c('light-env-assessment-status')}>
      <span class={c('light-env-summary-kicker')}>Indoor light picture</span>
      <span class={c('light-env-assessment-tier')}>{view.label}</span>
      {#if view.parts.length}<span class={c('light-env-assessment-parts')}>{view.parts.join(' · ')}</span>{/if}
    </div>
    <p class={c('light-env-assessment-lead')}>{view.lead}</p>
    <div class={c('light-env-assessment-metrics')}>
      {#each view.metrics as metric}
        <div class={c('light-env-assessment-metric')}>
          <span class={c('light-env-assessment-metric-label')}>{metric.label}</span>
          <strong class={c('assessment-metric-value')}>{metric.value}</strong>
          <span class={c('assessment-metric-detail')}>{metric.sub}</span>
        </div>
      {/each}
    </div>
    <div class={c('light-env-assessment-actions')}>
      <button type="button" class={c('dashboard-action-btn dashboard-action-btn-primary')} data-light-env-action="open-assessment">{view.actionLabel}</button>
      {#if view.hasRooms}<button type="button" class={c('dashboard-action-btn')} data-light-env-action="open-assessment-save-audit">Save audit</button>{/if}
    </div>
  </div>
{:else}
  <div data-light-environment-summary class={c(`light-env-summary light-env-summary-top light-env-summary-${view.color}`)}>
    <div class={c('light-env-summary-kicker')}>Indoor light picture</div>
    <div class={c('light-env-summary-head')}>
      <span class={c('light-env-summary-tier')}>{view.label}</span>
      {#if view.parts.length}<span class={c('light-env-summary-parts')}>{view.parts.join(' · ')}</span>{/if}
    </div>
    {#if view.burden !== null}
      <LightBurdenAI view={view.burden}/>
    {:else}
      <p class={c('light-env-summary-interp')}>{view.interp}</p>
    {/if}
  </div>
{/if}
