<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryPageView} from '../category-page-presentation.js';
 import CategoryGlyph from './CategoryGlyph.svelte';
 import CategoryPageViewBody from './CategoryPageViewBody.svelte';
 import LabDateRange from './LabDateRange.svelte';
 import ChartLayersDropdown from './ChartLayersDropdown.svelte';
 let {view}:{view:CategoryPageView}=$props();
</script><svelte:options preserveWhitespace/><div class="category-header"><h2><CategoryGlyph view={view.glyph}/><span class="category-title-text">{view.label}</span> <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename category" title="Rename category" data-category-page-action="rename-category" data-category-page-category={view.key} style={componentStaticStyles.renameControl}>rename</span></h2>
    <p>{view.countLabel}</p></div><div style={componentStaticStyles.categoryControls}><div class="view-toggle" role="tablist" aria-label="View mode" style={componentStaticStyles.noBottomMargin}>
    <button class="view-btn active" role="tab" aria-selected="true" tabindex="0" data-category-page-action="switch-view" data-category-page-category={view.key} data-category-page-view="charts">Charts</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" data-category-page-action="switch-view" data-category-page-category={view.key} data-category-page-view="table">Table</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" data-category-page-action="switch-view" data-category-page-category={view.key} data-category-page-view="heatmap">Heatmap</button></div><LabDateRange view={view.range}/>{#if view.layers}<ChartLayersDropdown view={view.layers}/>{/if}</div><div id="view-content"><CategoryPageViewBody view={view.body}/></div>
