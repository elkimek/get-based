<script lang="ts">
 import Card from './DashboardInsightCard.svelte';
 import type {DashboardInsightsView} from '../../types/dashboard-insights-view.js';
 let {view}:{view:DashboardInsightsView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="db-insights-list">{#each view.rows as row,index(index)}<Card view={row}/>{/each}</div>