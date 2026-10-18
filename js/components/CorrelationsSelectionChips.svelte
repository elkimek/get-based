<script lang="ts">
 import type {CorrelationChipView} from '../correlations-selection-presentation.js';
 let {chips}:{chips:readonly CorrelationChipView[]}=$props();
</script><svelte:options preserveWhitespace/>{#each chips as chip}{#if chip.kind==='marker'}<span class="corr-chip" style="background:{chip.background};border-color:{chip.border};color:{chip.color}">
{chip.label} <button type="button" class="chip-remove" aria-label="Remove {chip.ariaLabel}" data-compare-action="toggle-marker" data-compare-key={chip.key}>&times;</button></span>{:else}<span class="corr-chip">{chip.label} <button type="button" class="chip-remove" aria-label="Remove {chip.ariaLabel}" data-compare-action="toggle-therapy" data-compare-key={chip.key}>&times;</button></span>{/if}{/each}
