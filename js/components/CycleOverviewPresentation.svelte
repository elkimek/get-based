<script lang="ts">
  import type {CycleOverviewPresentationView} from '../cycle-overview-presentation.js';
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  import CycleOverviewHeader from './CycleOverviewHeader.svelte';
  import CycleOverviewProfile from './CycleOverviewProfile.svelte';
  import CycleOverviewPhases from './CycleOverviewPhases.svelte';
  import CycleOverviewHistory from './CycleOverviewHistory.svelte';
  import CycleOverviewAlerts from './CycleOverviewAlerts.svelte';
  let {view}: {view: CycleOverviewPresentationView} = $props();
</script>
<div class={c(view.compact ? 'cycle-section cycle-section-compact' : 'cycle-section')} data-cycle-overview-view>
  {#if view.showHeader}<CycleOverviewHeader showTour={view.hasProfile} editIcon={view.editIcon} editLabel={view.editLabel}/>{/if}
  <CycleOverviewProfile summary={view.summary}/>
  {#if view.hasProfile}
    {#if view.drawDescription !== null}<div class={c('cycle-draw-date')}>
      <span class={c('cycle-draw-icon')}><CycleIcon name="calendar"/></span>
      <div class={c('cycle-draw-copy')}>
        <strong>Next best blood draw</strong>
        <span>{view.drawDescription}</span>
        <small>Early follicular phase gives the most stable baseline for hormones, iron, and inflammation markers.</small>
      </div>
    </div>{/if}
    <CycleOverviewPhases phases={view.phases} overflowLabel={view.overflowLabel}/>
    <CycleOverviewHistory periods={view.periods}/>
    <CycleOverviewAlerts alerts={view.alerts}/>
  {/if}
</div>
