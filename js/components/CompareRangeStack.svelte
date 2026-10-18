<script lang="ts">
 import type {CompareRangeStackView,CompareRangeLineView} from '../compare-dates-presentation.js';
 let {view}:{view:CompareRangeStackView}=$props();
</script><svelte:options preserveWhitespace/>{#snippet lines(rows:readonly CompareRangeLineView[])}{#each rows as row}
<span class="compare-range-line{row.used?' compare-range-line-used':''}">
<span class="compare-range-label">{row.label}</span>
<span class="compare-range-bounds">{row.bounds}</span>
{#if row.badge}<span class="compare-range-used">used</span>{/if}
</span>{/each}{/snippet}{#if view.kind==='same'}<div class="compare-range-stack">{@render lines(view.lines)}</div>{:else}<div class="compare-range-stack compare-range-stack-dated">
<div class="compare-range-date-group">
<span class="compare-range-date">{view.firstLabel}</span>
{@render lines(view.first)}
</div>
<div class="compare-range-date-group">
<span class="compare-range-date">{view.secondLabel}</span>
{@render lines(view.second)}
</div>
</div>{/if}
