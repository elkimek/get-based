<script lang="ts">
  import type {CycleOverviewAlertView} from '../cycle-overview-presentation.js';
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  let {alerts}: {alerts: readonly CycleOverviewAlertView[]} = $props();
</script>
{#each alerts as alert}<div class={c(`cycle-alert cycle-alert-${alert.tone}`)}>
  <span class={c('cycle-alert-icon')}><CycleIcon name={alert.icon}/></span>
  <div class={c('cycle-alert-copy')}>
    <strong>{alert.title}</strong>
    <div class={c('cycle-alert-detail')}>{alert.message}</div>
  </div>
</div>{/each}
