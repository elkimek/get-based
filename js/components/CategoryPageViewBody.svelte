<script lang="ts">
 import type {CategoryPageBodyView} from '../category-page-presentation.js';
 import CategoryGlyph from './CategoryGlyph.svelte';
 import CategoryPageRangeEmptyState from './CategoryPageRangeEmptyState.svelte';
 import CategoryMarkerDataGaps from './CategoryMarkerDataGaps.svelte';
 import CategoryChartCard from './CategoryChartCard.svelte';
 import CategoryDataTable from './CategoryDataTable.svelte';
 import CategoryHeatmap from './CategoryHeatmap.svelte';
 import CategoryFattyAcids from './CategoryFattyAcids.svelte';
 let {view}:{view:CategoryPageBodyView}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='outside-range'}<CategoryPageRangeEmptyState view={view.view}/>{:else if view.kind==='empty-category'}<div class="empty-state"><div class="empty-state-icon empty-state-icon-category"><CategoryGlyph view={view.glyph}/></div>
        <h3>No Data Available</h3><p>Import lab results containing {view.lowercaseLabel} markers to see data here.</p></div>{:else if view.kind==='empty-charts'}<div class="empty-state"><h3>No Data Available</h3><p>Import lab results to see marker charts here.</p></div>{:else if view.kind==='charts'}<div class="charts-grid">{#each view.cards as card}<CategoryChartCard view={card}/>{/each}</div><CategoryMarkerDataGaps sections={view.gaps}/>{:else if view.kind==='table'}<CategoryDataTable view={view.view}/>{:else if view.kind==='heatmap'}<CategoryHeatmap view={view.view}/>{:else if view.view}<CategoryFattyAcids view={view.view}/>{/if}
