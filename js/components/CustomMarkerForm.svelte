<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import CustomMarkerOptions from './CustomMarkerOptions.svelte';
  import type {CustomMarkerFormView} from '../custom-marker-presentation.js';
  let {view}: {view:CustomMarkerFormView} = $props();
</script><svelte:options preserveWhitespace /><div class="gb-modal-head">
      <div>
        <div class="gb-modal-kicker">Custom marker</div>
        <div class="gb-modal-title" id="cm-form-title">Create New Biomarker</div>
      </div>
      <button class="modal-close" aria-label="Close" data-marker-detail-action="close-modal">&times;</button>
    </div>
    <div class="gb-form-body">
    <div class="manual-entry-form">
      <div class="me-field">
        <label for="cm-category">Category</label>
        <div class="cm-cat-row">
          <select id="cm-category" data-marker-detail-action="toggle-custom-marker-category">
            <CustomMarkerOptions rows={view.options}/>
            <option value="__new__">+ New category...</option>
          </select>
          <div id="cm-new-cat-row" style={componentStaticStyles.hidden}>
            <span id="cm-new-cat-icon" aria-label="Choose category icon" title="Pick icon" role="button" tabindex="0" data-custom="" data-marker-detail-action="pick-new-cat-icon">🔖</span>
            <input type="text" id="cm-new-cat" aria-label="Category name" placeholder="Category name">
          </div>
        </div>
      </div>
      <div class="me-field">
        <label for="cm-name">Marker name</label>
        <!-- svelte-ignore a11y_autofocus --><input type="text" id="cm-name" placeholder="e.g. Lipoprotein(a)" autofocus>
      </div>
      <div class="me-field">
        <label for="cm-unit">Unit</label>
        <input type="text" id="cm-unit" placeholder="e.g. mg/dL, nmol/L, %">
      </div>
      <div class="me-field">
        <span id="cm-ref-label">Reference range (optional)</span>
        <div class="cm-range-row" role="group" aria-labelledby="cm-ref-label">
          <input type="number" id="cm-ref-min" aria-label="Minimum reference value" step="any" placeholder="Min">
          <span class="cm-range-divider">–</span>
          <input type="number" id="cm-ref-max" aria-label="Maximum reference value" step="any" placeholder="Max">
        </div>
      </div>
      <div class="me-field">
        <span id="cm-opt-label">Optimal range (optional)</span>
        <div class="cm-range-row" role="group" aria-labelledby="cm-opt-label">
          <input type="number" id="cm-opt-min" aria-label="Minimum optimal value" step="any" placeholder="Min">
          <span class="cm-range-divider">–</span>
          <input type="number" id="cm-opt-max" aria-label="Maximum optimal value" step="any" placeholder="Max">
        </div>
      </div>
      <div class="gb-form-actions">
        <button type="button" class="import-btn import-btn-primary" data-marker-detail-action="save-custom-marker">Create</button>
        <button type="button" class="import-btn import-btn-secondary" data-marker-detail-action="close-modal">Cancel</button>
      </div>
    </div>
    </div>