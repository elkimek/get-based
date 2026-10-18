<script lang="ts">
 import type {SupplementRow} from '../supplement-dashboard-presentation.js';
 import SupplementTimelineBar from './SupplementTimelineBar.svelte';
 let {view}:{view:SupplementRow}=$props();
</script><svelte:options preserveWhitespace/><!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions (The existing delegate owns click and keyboard activation.) --><div class="supp-bar-row" role="button" tabindex="0" aria-label={view.aria} data-supp-action="open-editor" data-supp-index={view.index}><span class="supp-bar-label" title={view.title}>{view.name}</span><div class="supp-bar-track">{#each view.bars as bar}<SupplementTimelineBar view={bar}/>{/each}</div></div>
