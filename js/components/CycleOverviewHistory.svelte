<script lang="ts">
  import type {CycleOverviewPeriodView} from '../cycle-overview-presentation.js';
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  let {periods}: {periods: readonly CycleOverviewPeriodView[]} = $props();
</script>
{#if periods.length}<div class={c('cycle-period-log')}>
  {#each periods as period}<span class={c('cycle-period-entry')}>
    <span class={c('cycle-period-date')}>{period.dateLabel}</span>
    <span class={`goals-severity-badge ${period.flowClass}`}>{period.flow}</span>
    {#each period.symptoms as symptom}<span class={c('period-symptom-tag')}>{symptom}</span>{/each}
    {#if period.notes !== null}<span class={c('cycle-period-note')}>{period.notes}</span>{/if}
  </span>{/each}
</div>{/if}
