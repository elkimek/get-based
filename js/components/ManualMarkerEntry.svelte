<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import ManualMarkerEntryUnits from './ManualMarkerEntryUnits.svelte';
  import type {ManualEntryView} from '../manual-marker-entry-presentation.js';
  let {view}: {view: ManualEntryView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">{view.category}</div>
        <div class="gb-modal-title">Add Value Manually</div>
      </div>
      <button class="modal-close" aria-label="Back to marker details" data-marker-detail-action={view.close.action} data-marker-detail-id={view.close.id}>&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="modal-unit"><strong>{view.name}</strong> · {view.unit}{view.reference}</div>
    <div class="manual-entry-form">
      <div class="me-field">
        <label for="me-date">Date</label>
        <input type="date" id="me-date" value="{view.date}" max="{view.today}">
      </div>
      <div class="me-field">
        <label for="me-value">Value <ManualMarkerEntryUnits view={view.unitPicker}/></label>
        <!-- svelte-ignore a11y_autofocus (Preserve the legacy native autofocus in this SSR facade; managed modal focus remains controller-owned at 50ms.) --><input type="number" id="me-value" step="any" placeholder="{view.placeholder}" autofocus>
      </div>
      <div class="me-context-grid">
        <div class="me-field">
          <label for="me-sample-time">Collection time <span class="me-optional">(optional)</span></label>
          <input type="time" id="me-sample-time" value="{view.sampleTime}">
          <small>Use the blood draw/collection time, not the lab processing or report time.</small>
        </div>
        <div class="me-field">
          <label for="me-fasting">Fasting status</label>
          <select id="me-fasting">
            <option value="unknown" selected={view.fasting === 'unknown'}>Unknown</option>
            <option value="fasting" selected={view.fasting === 'fasting'}>Fasting</option>
            <option value="not-fasting" selected={view.fasting === 'not-fasting'}>Not fasting</option>
          </select>
        </div>
      </div>
      <div class="me-field">
        <label for="me-note">Note <span style={componentStaticStyles.optionalLabel}>(optional)</span></label>
        <textarea id="me-note" rows="2" placeholder="Context for this value — e.g. fasted 14h, post-workout, different lab, retake of low value..."></textarea>
      </div>
      <div class="gb-form-actions">
        <button class="import-btn import-btn-primary" data-marker-detail-action={view.save.action} data-marker-detail-id={view.save.id}>Save</button>
        <button class="import-btn import-btn-secondary" data-marker-detail-action={view.add.action} data-marker-detail-id={view.add.id} title="Save this value, then enter another marker for the same date">Save &amp; Add Another</button>
        <button class="import-btn import-btn-secondary" data-marker-detail-action={view.cancel.action} data-marker-detail-id={view.cancel.id}>Cancel</button>
      </div>
    </div>
    </div>