<script lang="ts">
 import type {PlacementFormView} from '../marker-placement-view.js';
 import MarkerPlacementOptions from './MarkerPlacementOptions.svelte';
 let {view}:{view:PlacementFormView}=$props();
</script><svelte:options preserveWhitespace/><div class="gb-modal-head">
      <button type="button" class="context-back-btn" aria-label="Back to marker details" data-marker-detail-action={view.back.action} data-marker-detail-id={view.back.id??undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
      </button>
      <div>
        <div class="gb-modal-kicker">Category placement</div>
        <div class="gb-modal-title">Move {view.markerName}</div>
      </div>
      <button type="button" class="modal-close" aria-label="Close" data-marker-detail-action={view.close.action}>×</button>
    </div>
    <div class="gb-form-body">
      <div class="marker-placement-safety" role="note">
        <strong>Only where this marker appears will change.</strong>
        <span>Values, history, units, notes, reference ranges, backups, shares, imports, and sync stay linked to the same marker.</span>
      </div>
      <div class="manual-entry-form">
        <div class="me-field">
          <label for="marker-placement-category">Category</label>
          <select id="marker-placement-category" aria-describedby="marker-placement-help">
            <MarkerPlacementOptions groups={view.groups}/>
          </select>
          <div class="marker-placement-current">Current: <strong>{view.currentLabel}</strong> · Original: <strong>{view.nativeLabel}</strong></div>
          <div class="marker-placement-help" id="marker-placement-help">Choose an existing compatible category. {view.help}</div>
        </div>
        <div class="gb-form-actions">
          {#if view.restore}<button type="button" class="import-btn import-btn-secondary marker-placement-restore" data-marker-detail-action={view.restore.action} data-marker-detail-id={view.restore.id??undefined}>Restore original</button>{/if}
          <button type="button" class="import-btn import-btn-secondary" data-marker-detail-action={view.cancel.action} data-marker-detail-id={view.cancel.id??undefined}>Cancel</button>
          <button type="button" class="import-btn import-btn-primary marker-placement-save" data-marker-detail-action={view.save.action} data-marker-detail-id={view.save.id??undefined}>Move marker</button>
        </div>
      </div>
    </div>
