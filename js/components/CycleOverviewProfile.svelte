<script lang="ts">
  import type {CycleOverviewSummaryView} from '../cycle-overview-presentation.js';
  import {cycleOverviewClasses as c} from '../cycle-overview-classes.js';
  import CycleIcon from './CycleIcon.svelte';
  let {summary}: {summary: CycleOverviewSummaryView | null} = $props();
</script>
{#if summary}<button type="button" class={c('cycle-summary-card')} aria-label={summary.ariaLabel} data-cycle-action="open-editor">
  <span class={c('cycle-summary-icon')}><CycleIcon name="droplet"/></span>
  <span class={c('cycle-summary-copy')}>
    <span class={c('cycle-summary-label')}>Current profile</span>
    <strong>{summary.primary}</strong>
    <span class={c('cycle-summary-tags')}>{#each summary.meta as item}<span class={c('cycle-meta-tag')}>{item}</span>{/each}</span>
  </span>
</button>{:else}<button type="button" class={c('cycle-prompt')} aria-label="Set up cycle tracking" data-cycle-action="open-editor">
  <span class={c('cycle-prompt-icon')}><CycleIcon name="droplet"/></span>
  <span class={c('cycle-prompt-copy')}>
    <strong>Track your cycle for better lab interpretation</strong>
    <span>Hormone, iron, and inflammation markers shift by phase. Add cycle context so AI can account for timing.</span>
  </span>
</button>{/if}
