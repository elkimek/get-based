<script lang="ts">
 import type {CorrelationsOptionsView} from '../correlations-selection-presentation.js';
 let {view}:{view:CorrelationsOptionsView}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='empty'}<div id="corr-no-results" role="presentation" hidden>No matching items with data.</div>{:else}{#each view.options as option}{#if option.kind==='marker'}<div class="corr-option {option.selected?'selected':''}"
        data-key={option.key} data-name={option.name} data-cat={option.category}
        role="option" aria-selected={option.selected} tabindex="-1" data-compare-action="toggle-marker" data-compare-key={option.key}>
{option.label} <span class="opt-cat">{option.categoryLabel} · {option.count} results</span></div>{:else}<div class="corr-option {option.selected?'selected':''}" data-key={option.key} data-name={option.name} data-cat={option.category} role="button" tabindex="0" data-compare-action="toggle-therapy" data-compare-key={option.key}>{option.label} <span class="opt-cat">{option.category} · {option.date}</span></div>{/if}{/each}{/if}
