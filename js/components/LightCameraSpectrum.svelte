<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="What kind of light is this?" label="Spectrum classifier" cameraCloseAction="close-spec">
  <LightAimingGuide view={view.guide}/>
  <p class={c('modal-body-hint')}>Qualitative warm/cool RGB pattern and rolling-shutter banding screen. This cannot identify a full spectrum, UV, infrared, melanopic EDI, or sleep safety.</p>
  <video id="spec-video" autoplay playsinline muted class={c('camera-video camera-preview-compact')}></video>
  <div id="spec-result" class={c('spec-result')}>Reading…</div>
  <div class={c('modal-actions camera-actions-compact')}>
    <button type="button" data-light-tool-modal-action="close-spec" class={c('import-btn import-btn-secondary camera-control')}>Done</button>
    <button type="button" id="spec-save" class={c('import-btn import-btn-primary camera-control')}>Save reading</button>
  </div>
</LightToolFrame>
