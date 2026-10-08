<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="Flicker Detector" label="Flicker detector" cameraCloseAction="close-flicker">
  <LightAimingGuide view={view.guide}/>
  <p class={c('modal-body-hint')}>Rolling-shutter bands can reveal some modulated lights. No bands does not prove a light is flicker-free, and this camera cannot report a reliable flicker frequency.</p>
  <video id="flicker-video" autoplay playsinline muted class={c('camera-video camera-preview-tall')}></video>
  <div id="flicker-result" class={c('flicker-result')}>Hold camera on a light for 5 seconds…</div>
  <div class={c('modal-actions camera-actions-standard')}>
    <button type="button" data-light-tool-modal-action="close-flicker" class={c('import-btn import-btn-secondary camera-control')}>Done</button>
    <button type="button" id="flicker-save" class={c('import-btn import-btn-primary camera-control')}>Save reading</button>
  </div>
</LightToolFrame>
