<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryHeatmapView} from '../category-presentation.js';
 import CategoryScrollableTable from './CategoryScrollableTable.svelte';
 let {view}:{view:CategoryHeatmapView}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='empty'}<div class="heatmap-wrapper"><div style={componentStaticStyles.categoryEmpty}>No data yet for this category. Use the sidebar to add a value or import a PDF.</div></div>{:else}<CategoryScrollableTable {view}/>{/if}
