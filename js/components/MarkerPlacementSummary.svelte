<script lang="ts">
 import type {PlacementSummaryView} from '../marker-placement-view.js';
 let {view}:{view:PlacementSummaryView}=$props();
</script><svelte:options preserveWhitespace/><div class="gb-detail-category-row">
    <span class="gb-detail-kicker">{view.currentLabel}</span>
    <button type="button" class="gb-detail-category-change" aria-label="Change category for {view.markerName}" data-marker-detail-action={view.open.action} data-marker-detail-id={view.open.id??undefined}>Change category</button>
    {#if view.native}<span class="gb-detail-category-origin">Originally {view.native.label}</span>
      <button type="button" class="gb-detail-category-restore" data-marker-detail-action={view.native.restore.action} data-marker-detail-id={view.native.restore.id??undefined}>Restore</button>{/if}
  </div>
