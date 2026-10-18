<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CompareDateCategoryView} from '../compare-dates-presentation.js';
 import CategoryGlyph from './CategoryGlyph.svelte';
 import CompareRangeStack from './CompareRangeStack.svelte';
 let {categories}:{categories:readonly CompareDateCategoryView[]}=$props();
</script><svelte:options preserveWhitespace/>{#each categories as category}<tr class="cat-row"><td colspan="7"><span class="compare-category-label"><CategoryGlyph view={category.glyph}/><span>{category.label}</span></span></td></tr>{#each category.rows as row}<tr>
<td class="marker-name">{row.name}</td>
<td style={componentStaticStyles.mutedUnit}>{row.unit}</td>
<td class="compare-ranges-cell"><CompareRangeStack view={row.range}/></td>
<td class="value-cell val-{row.firstStatus}" style={componentStaticStyles.emphasis}>{row.firstValue}</td>
<td class="value-cell val-{row.secondStatus}" style={componentStaticStyles.emphasis}>{row.secondValue}</td>
<td class={row.direction} style={componentStaticStyles.emphasis}>{row.delta}</td>
<td class={row.direction} style={componentStaticStyles.emphasis}>{row.percent}</td>
</tr>{/each}{/each}
