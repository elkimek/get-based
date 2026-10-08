<script lang="ts">
  import type { CameraShellView } from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightToolFrame from './LightToolFrame.svelte';
  import LightAimingGuide from './LightAimingGuide.svelte';
  let {view}: {view: CameraShellView} = $props();
</script>
<LightToolFrame title="Color Temperature" label="Color temperature meter" cameraCloseAction="close-cct">
  <LightAimingGuide view={view.guide}/>
  <p class={c('modal-body-hint')}>Approximate warm/cool camera check. It cannot show spectral completeness, red/infrared content, or melanopic EDI.</p>
  <video id="cct-video" autoplay playsinline muted class={c('camera-video camera-preview-compact')}></video>
  <div class={c('cct-result')}>
    <div id="cct-value" class={c('cct-value')}>— K</div>
    <div id="cct-tone" class={c('cct-tone')}>—</div>
    <div id="cct-coherence" class={c('cct-coherence')}></div>
  </div>
  <div class={c('modal-actions camera-actions-compact')}>
    <button type="button" data-light-tool-modal-action="close-cct" class={c('import-btn import-btn-secondary camera-control')}>Done</button>
    <button type="button" id="cct-save" class={c('import-btn import-btn-primary camera-control')}>Save reading</button>
  </div>
</LightToolFrame>
