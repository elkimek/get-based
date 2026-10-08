<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="Window / Glass Transmission" label="Glass transmission test" cameraCloseAction="close-glass">
  <LightAimingGuide view={view.guide}/>
  <p class={c('modal-body-hint glass-comparison-warning')}>⚠ Aim at the same patch of sky / light source for both readings. North-window through the glass vs. east-window without it measures scene difference, not glass transmission.</p>
  <div id="glass-step-inside" class={c('glass-step')}>
    <span>Step 1: <strong>through the glass</strong></span>
    <button type="button" id="glass-measure-inside" class={c('import-btn import-btn-secondary camera-control')}>Measure inside</button>
    <span id="glass-reading-inside" class={c('glass-reading')}>—</span>
  </div>
  <div id="glass-step-outside" class={c('glass-step')}>
    <span>Step 2: <strong>direct (no glass)</strong></span>
    <button type="button" id="glass-measure-outside" class={c('import-btn import-btn-secondary camera-control')}>Measure outside</button>
    <span id="glass-reading-outside" class={c('glass-reading')}>—</span>
  </div>
  <div id="glass-result" class={c('glass-result')}></div>
  <div class={c('modal-actions camera-actions-compact')}>
    <button type="button" data-light-tool-modal-action="close-glass" class={c('import-btn import-btn-secondary camera-control')}>Done</button>
    <button type="button" id="glass-save" disabled class={c('import-btn import-btn-primary camera-control')}>Save reading</button>
  </div>
</LightToolFrame>
