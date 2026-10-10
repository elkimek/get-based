<script lang="ts">
  import type {CycleEditorPeriodView} from '../cycle-editor-presentation.js';
  import {cycleEditorClasses as c} from '../cycle-editor-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  let {periods}: {periods: readonly CycleEditorPeriodView[]} = $props();
</script>
{#if periods.length}<div class={c('cycle-log-list')}>
  {#each periods as period}<div class={c('cycle-log-item')}>
    <span class={c('cycle-log-icon')}><CycleIcon name="droplet"/></span>
    <div class={c('cycle-log-main')}>
      <div class={c('cycle-log-date')}>{period.dateLabel}</div>
      <div class={c('cycle-log-meta')}>
        <span class={`goals-severity-badge ${period.flowClass}`}>{period.flow}</span>
        {#each period.symptoms as symptom}<span class={c('period-symptom-tag')}>{symptom}</span>{/each}
        {#if period.notes !== null}<span class={c('cycle-period-note')}>{period.notes}</span>{/if}
      </div>
    </div>
    <button type="button" class={c('cycle-icon-btn cycle-delete-btn')} data-cycle-action="delete-period" data-cycle-start-date={period.startDate} aria-label={period.deleteAriaLabel} title="Delete period"><CycleIcon name="trash"/></button>
  </div>{/each}
</div>{/if}
