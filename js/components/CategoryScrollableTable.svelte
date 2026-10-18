<script lang="ts">
 import type {CategoryScrollableTableView} from '../category-presentation.js';
 import CategoryTableColgroup from './CategoryTableColgroup.svelte';
 import CategoryTableHeader from './CategoryTableHeader.svelte';
 import CategoryDataRows from './CategoryDataRows.svelte';
 import CategoryHeatmapRows from './CategoryHeatmapRows.svelte';
 let {view}:{view:CategoryScrollableTableView}=$props();
 const tableClass=$derived(view.kind==='data'?'data-table':'heatmap-table');
 const wrapperClass=$derived(view.kind==='data'?'data-table-wrapper':'heatmap-wrapper');
</script><svelte:options preserveWhitespace/><div class="gb-table-shell gb-table-shell-{view.kind}" style="--gb-table-min-width:{view.minimumWidth}px">
    <div class="gb-table-sticky-head" aria-hidden="true">
      <div class="gb-table-sticky-head-scroll">
        <table class={tableClass}><CategoryTableColgroup columns={view.columns}/><thead><CategoryTableHeader kind={view.kind} dates={view.dates}/></thead></table>
      </div>
    </div>
    <div class={wrapperClass} data-gb-table-scroll-sync>
      <table class={tableClass}><CategoryTableColgroup columns={view.columns}/><thead><CategoryTableHeader kind={view.kind} dates={view.dates}/></thead><tbody>{#if view.kind==='data'}<CategoryDataRows rows={view.rows}/>{:else}<CategoryHeatmapRows rows={view.rows}/>{/if}</tbody></table>
    </div>
  </div>
