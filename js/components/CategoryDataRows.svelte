<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryTableRowView} from '../category-presentation.js';
 import CategoryRangeRail from './CategoryRangeRail.svelte';
 import CategoryRangeText from './CategoryRangeText.svelte';
 let {rows}:{rows:readonly CategoryTableRowView[]}=$props();
</script><svelte:options preserveWhitespace/>{#each rows as row}<tr data-marker-detail-action={row.id?'show-detail-modal':undefined} data-marker-detail-id={row.id??undefined} style={row.id?componentStaticStyles.pointer:undefined}><td class="marker-name">{row.name}</td>
      <td class="unit-col">{row.unit}</td>
      <td class="ref-col"><CategoryRangeText view={row.range}/></td>{#each row.values as cell}<td class="value-cell val-{cell.status}" data-marker-detail-action={cell.emptyAction?'open-manual-entry':undefined} data-marker-detail-id={cell.emptyAction?.id} data-marker-detail-date={cell.emptyAction?.date} style={cell.emptyAction?componentStaticStyles.cellCursor:undefined} title={cell.emptyAction?.title}>{cell.value}</td>{/each}<td><span class="trend-arrow {row.trend.className}">{row.trend.arrow}</span></td><td><CategoryRangeRail view={row.rail}/></td></tr>{/each}
