<script lang="ts">
import type {MarkerDetailModalView} from '../marker-detail-view.js';
import MarkerDetailChrome from './MarkerDetailChrome.svelte';
import MarkerDetailHistory from './MarkerDetailHistory.svelte';
import MarkerDetailBioAge from './MarkerDetailBioAge.svelte';
let {view}:{view:MarkerDetailModalView}=$props();
</script><svelte:options preserveWhitespace={true}/><MarkerDetailChrome view={view.header}/>
    <div class="modal-values-grid marker-history-list">{#each view.rows as row}<MarkerDetailHistory view={row}/>{/each}</div>{#if view.paging}<MarkerDetailHistory view={view.paging}/>{/if}{#if view.trend}<MarkerDetailHistory view={view.trend}/>{/if}{#if view.bio}<MarkerDetailBioAge view={view.bio}/>{/if}<MarkerDetailChrome view={view.actions}/>{#if view.deleteMarker}<MarkerDetailChrome view={view.deleteMarker}/>{/if}