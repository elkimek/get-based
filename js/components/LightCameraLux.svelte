<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="Lux Meter" label="Lux meter" cameraCloseAction="close-lux">
  <LightAimingGuide view={view.guide}/>
  <div id="lux-source-picker" role="group" aria-label="Lux measurement source" class={c('lux-source-picker')}>
    <span class={c('lux-source-picker-label')}>Measure with</span>
    <button type="button" id="lux-source-als" aria-pressed="false" class={c('lux-source-option camera-focus')}>
      <span>Phone light sensor</span>
      <small id="lux-source-als-detail">Preferred</small>
    </button>
    <button type="button" id="lux-source-camera" aria-pressed="false" class={c('lux-source-option camera-focus')}>
      <span>Camera</span>
      <small id="lux-source-camera-detail">Approximate fallback</small>
    </button>
  </div>
  <p id="lux-source-line" class={c('modal-body-hint')}>Initializing…</p>
  <div id="lux-live-dial" class={c('lux-dial')}>
    <div id="lux-value" class={c('lux-dial-value')}>—</div>
    <div id="lux-unit" class={c('lux-dial-unit')}>lux</div>
    <div id="lux-zone" class={c('lux-dial-zone')}>—</div>
  </div>
  <div id="lux-manual-entry" hidden class={c('lux-manual-entry')}>
    <label for="lux-manual-input">Enter a reading from a lux meter</label>
    <div class={c('lux-manual-entry-row')}>
      <input type="number" id="lux-manual-input" min="0" max="200000" step="1" placeholder="e.g. 400" inputmode="decimal" class={c('ctx-input camera-control')}>
      <span>lux</span>
    </div>
    <div id="lux-manual-zone" class={c('lux-dial-zone')}>—</div>
  </div>
  <div class={c('lux-zones')}>
    {#each view.zones || [] as zone}<div class={c('lux-zone-marker')}>≤ {zone.max} <span>{zone.label}</span></div>{/each}
  </div>
  <details id="lux-calibration-panel" class={c('lux-calibration-panel')}>
    <summary class={c('camera-control lux-calibration-summary')}>⚙ Calibrate against a known reference</summary>
    <div class={c('lux-calibration-body')}>
      <p class={c('lux-calibration-hint')}>Place a real lux meter beside this phone, aim both in the same direction, and enter the reference. Camera lux is withheld until this device has been calibrated.</p>
      <div class={c('lux-calibration-entry')}>
        <label for="lux-cal-reference" class={c('camera-label-muted')}>Known reading (lux)</label>
        <input type="number" id="lux-cal-reference" min="0" step="any" placeholder="e.g. 400" class={c('ctx-input camera-control lux-calibration-input')}>
        <button type="button" id="lux-cal-apply" class={c('import-btn import-btn-secondary camera-control lux-calibration-apply')}>Apply</button>
      </div>
      <div class={c('lux-calibration-factor')}>
        <span>Current factor:</span>
        <strong id="lux-cal-current" class={c('lux-calibration-value')}>—</strong>
        <button type="button" id="lux-cal-reset" class={c('import-btn import-btn-secondary camera-control lux-calibration-reset')}>Reset to 1.00×</button>
      </div>
    </div>
  </details>
  <div class={c('modal-actions camera-actions-standard')}>
    <button type="button" data-light-tool-modal-action="close-lux" class={c('import-btn import-btn-secondary camera-control')}>Done</button>
    <button type="button" id="lux-save" class={c('import-btn import-btn-primary camera-control')}>Save reading</button>
  </div>
</LightToolFrame>
