<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="Sleep Darkness Meter" label="Sleep darkness meter" cameraCloseAction="close-dark">
  <LightAimingGuide view={view.guide}/>
  <p class={c('modal-body-hint')}>Set the room as you actually sleep. The camera check is qualitative; enter a meter reading below for lux.</p>
  <div id="dark-status" class={c('dark-status')}>Press Start when ready.</div>
  <details class={c('darkness-meter-panel')}>
    <summary class={c('camera-control darkness-meter-summary')}>Enter a lux-meter reading instead</summary>
    <div class={c('darkness-meter-entry')}>
      <label class={c('ctx-label darkness-meter-label')}>Reading at the pillow (photopic lux)
        <input type="number" id="dark-meter-input" min="0" max="10000" step="0.01" inputmode="decimal" placeholder="e.g. 0.2" class={c('ctx-input camera-control')}>
      </label>
      <button type="button" id="dark-meter-save" class={c('import-btn import-btn-secondary camera-control')}>Save meter reading</button>
    </div>
    <small class={c('darkness-meter-note')}>Photopic lux is not melanopic EDI; source spectrum still matters.</small>
  </details>
  <div class={c('modal-actions camera-actions-standard')}>
    <button type="button" data-light-tool-modal-action="close-dark" class={c('import-btn import-btn-secondary camera-control')}>Cancel</button>
    <button type="button" id="dark-start" class={c('import-btn import-btn-primary camera-control')}>Start 30-second read</button>
    <button type="button" id="dark-save" disabled class={c('import-btn import-btn-primary camera-control')}>Save camera check</button>
  </div>
</LightToolFrame>
