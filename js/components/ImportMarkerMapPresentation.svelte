<script lang="ts">
  import type {ImportMarkerMapView} from '../import-marker-map-presentation.js';
  import {importMarkerMapClasses as classes} from '../import-marker-map-classes.js';
  let {view}: {view: ImportMarkerMapView} = $props();
</script>

<div class={classes('modal import-marker-map-modal')} role="dialog" aria-modal="true" aria-labelledby="import-map-modal-title">
  <div class="gb-modal-head import-map-modal-head">
    <div>
      <div class="gb-modal-kicker">Import mapping</div>
      <div class="gb-modal-title" id="import-map-modal-title">Map to Existing Marker</div>
    </div>
    <button type="button" class="modal-close" data-import-map-action="close" aria-label="Close mapping">&times;</button>
  </div>
  <div class={classes('import-map-modal-body')}>
    <div class={classes('import-map-context')}>
      <span class={classes('import-map-context-label')}>{view.rawName}</span>
      <strong class={classes('import-map-context-value')}>{view.value} {view.unit}</strong>
      {#if view.showRange}<small class={classes('import-map-context-range')}>Range {view.range}</small>{/if}
    </div>
    <label class={classes('import-map-search-wrap')}>
      <span class="sr-only">Search existing markers</span>
      <input type="search" class={classes('import-map-modal-search')} placeholder="Search markers, categories, units" autocomplete="off">
    </label>
    <div class={classes('import-map-modal-grid')}>
      <div class={classes('import-map-categories')} aria-label="Marker categories"></div>
      <div class={classes('import-map-results')} aria-live="polite"></div>
    </div>
  </div>
  <div class={classes('import-map-modal-actions')}>
    <button type="button" class={classes('import-btn import-btn-secondary import-map-action-button')} data-import-map-action="clear">{view.clearLabel}</button>
    <button type="button" class={classes('import-btn import-btn-secondary import-map-action-button')} data-import-map-action="close">Cancel</button>
  </div>
</div>
