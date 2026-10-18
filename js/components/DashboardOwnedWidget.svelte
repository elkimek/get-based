<script lang="ts">
 import Notes from './DashboardLabNotes.svelte';
 import QuickMarkers from './DashboardQuickMarkers.svelte';
 import type {DashboardOwnedWidgetView} from '../../types/dashboard-owned-widgets.js';
 type CollectionView=Extract<DashboardOwnedWidgetView,{kind:'notes'|'quick-markers'}>;
 let {view}:{view:CollectionView}=$props();
 export function setView(next:CollectionView):void {view=next;}
</script>
<svelte:options preserveWhitespace={true}/>
{#if view.kind==='notes'}<Notes view={view}/>{:else}<QuickMarkers view={view}/>{/if}
