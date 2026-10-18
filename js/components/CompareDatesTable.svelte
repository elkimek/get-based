<script lang="ts">
 import type {CompareDatesTableView} from '../compare-dates-presentation.js';
 import CategoryTableColgroup from './CategoryTableColgroup.svelte';
 import CompareDatesTableHeader from './CompareDatesTableHeader.svelte';
 import CompareDatesTableRows from './CompareDatesTableRows.svelte';
 let {view}:{view:CompareDatesTableView}=$props();
 const columns=['gb-col-marker','gb-col-unit','gb-col-ranges','gb-col-compare-date','gb-col-compare-date','gb-col-delta','gb-col-delta'];
</script><svelte:options preserveWhitespace/><div class="gb-table-shell gb-table-shell-compare" style="--gb-table-min-width:908px">
    <div class="gb-table-sticky-head" aria-hidden="true">
      <div class="gb-table-sticky-head-scroll">
        <table class="compare-table"><CategoryTableColgroup {columns}/><thead><CompareDatesTableHeader firstLabel={view.firstLabel} secondLabel={view.secondLabel}/></thead></table>
      </div>
    </div>
    <div class="compare-table-wrapper" data-gb-table-scroll-sync>
      <table class="compare-table"><CategoryTableColgroup {columns}/><thead><CompareDatesTableHeader firstLabel={view.firstLabel} secondLabel={view.secondLabel}/></thead><tbody><CompareDatesTableRows categories={view.categories}/></tbody></table>
    </div>
  </div>
