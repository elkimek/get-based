<script lang="ts">
  import type {BiologySummaryMarker} from '../biology-summary-presentation.js';
  import {biologySummaryClasses as c} from '../biology-summary-classes.js';
  let {seen, missing, extra}: {seen: BiologySummaryMarker[]; missing: BiologySummaryMarker[]; extra: number} = $props();
</script>
{#snippet marker(item: BiologySummaryMarker, muted: boolean)}
  {#if item.id && !muted}<button type="button" class={c('biology-score-token biology-summary-marker biology-summary-control')} title={item.title}
    data-biology-score-action="open-marker" data-biology-marker-id={item.id}>{item.label}</button>
  {:else}<span class={c(`biology-score-token${muted ? ' biology-score-token-muted' : ''}`)} title={item.title}>{item.label}</span>{/if}
{/snippet}
{#if seen.length || missing.length}
  <div class={c('biology-score-inputs')}>
    {#if seen.length}<div class={c('biology-summary-input-row')}><span class={c('biology-score-input-label')}>Seen</span>{#each seen as item}{@render marker(item, false)}{/each}</div>{/if}
    {#if missing.length}<div class={c('biology-summary-input-row')}><span class={c('biology-score-input-label')}>Missing</span>{#each missing as item}{@render marker(item, true)}{/each}{#if extra}<span class={c('biology-score-token biology-score-token-muted')}>+{extra}</span>{/if}</div>{/if}
  </div>
{/if}
