<script lang="ts">
  import type {LabDateRangeView} from '../lab-date-range-presentation.js';
  import {labDateRangeClasses as c} from '../lab-date-range-classes.js';
  let {view}: {view: LabDateRangeView} = $props();
</script>
{#snippet control()}
  <div data-lab-date-range-view class={c(`date-range-filter${view.showScope ? ' lab-range-scoped' : ''}`)} role="group" aria-label="Lab date range">{#each view.ranges as range}<button class={c(`range-btn${range.active ? ' active lab-range-active' : ''}`)} type="button" aria-pressed={range.active} data-lab-data-action="set-date-range" data-lab-data-range={range.key}>{range.label}</button>{/each}</div>
{/snippet}
{#if view.showScope}
  <div data-lab-date-range-view class={c('dashboard-lab-date-range')}><div><strong class={c('lab-range-scope-title')}>Lab date range</strong><p class={c('lab-range-scope-copy')}>{view.scope}</p></div>{@render control()}</div>
{:else}{@render control()}{/if}
