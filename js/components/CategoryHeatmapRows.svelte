<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryHeatmapRowView} from '../category-presentation.js';
 let {rows}:{rows:readonly CategoryHeatmapRowView[]}=$props();
</script><svelte:options preserveWhitespace/>{#each rows as row}<tr><td role="button" tabindex="0" aria-label={row.accessibleName} style={componentStaticStyles.pointer} data-marker-detail-action="show-detail-modal" data-marker-detail-id={row.id}>{row.name}</td>{#each row.values as cell}<td class="heatmap-{cell.status}" role="button" tabindex="0" aria-label={cell.label} data-marker-detail-action="show-detail-modal" data-marker-detail-id={row.id}>{cell.value}</td>{/each}</tr>{/each}
