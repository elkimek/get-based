<script lang="ts">
  import type {CycleOverviewPhaseView} from '../cycle-overview-presentation.js';
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  let {phases,overflowLabel}: {phases: readonly CycleOverviewPhaseView[]; overflowLabel: string | null} = $props();
</script>
{#if phases.length}<div class={c('cycle-draw-phases')}>
  {#each phases as phase}<span class={c('cycle-draw-tag')}><span class={c(`cycle-phase-badge phase-${phase.phase}`)}>{phase.label}</span><span>{phase.dateLabel}</span>{#if phase.dayLabel !== null}<span class={c('cycle-tag-day')}>{phase.dayLabel}</span>{/if}<span class={c('cycle-tag-day')}>{phase.sourceLabel}</span></span>{/each}
  {#if overflowLabel !== null}<span class={c('cycle-draw-tag cycle-draw-more')}>{overflowLabel}</span>{/if}
</div>{/if}
