<script lang="ts">
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  import CycleImportPicker from './CycleImportPicker.svelte';
  let {showTour,editIcon,editLabel}: {showTour: boolean; editIcon: 'edit' | 'plus'; editLabel: string} = $props();
</script>
<div class={c('cycle-widget-head')}>
  <div class={c('cycle-widget-title-wrap')}>
    <span class={c('cycle-widget-kicker')}>Body context</span>
    <span class={c('cycle-widget-title')}>Menstrual cycle</span>
  </div>
  <div class={c('cycle-widget-actions')}>
    {#if showTour}<button type="button" class={c('cycle-icon-btn')} data-cycle-action="start-tour" title="Cycle feature tour" aria-label="Take the cycle feature tour"><CycleIcon name="help"/></button>{/if}
    <CycleImportPicker/>
    <button type="button" class={c('cycle-action-btn')} data-cycle-action="open-editor"><CycleIcon name={editIcon}/><span>{editLabel}</span></button>
  </div>
</div>
