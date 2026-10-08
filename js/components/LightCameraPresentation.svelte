<script lang="ts">
  import type {CameraToolPresentationProps} from '../light-camera-presentation.js';
  import LightCameraResult from './LightCameraResult.svelte';
  import LightCameraLux from './LightCameraLux.svelte';
  import LightCameraFlicker from './LightCameraFlicker.svelte';
  import LightCameraDarkness from './LightCameraDarkness.svelte';
  import LightCameraCCT from './LightCameraCCT.svelte';
  import LightCameraSpectrum from './LightCameraSpectrum.svelte';
  import LightCameraGlass from './LightCameraGlass.svelte';
  let props: CameraToolPresentationProps = $props();
</script>
{#if props.kind === 'shell'}
{#if props.view.tool === 'lux'}<LightCameraLux view={props.view}/>
{:else if props.view.tool === 'flicker'}<LightCameraFlicker view={props.view}/>
{:else if props.view.tool === 'darkness'}<LightCameraDarkness view={props.view}/>
{:else if props.view.tool === 'cct'}<LightCameraCCT view={props.view}/>
{:else if props.view.tool === 'spectrum'}<LightCameraSpectrum view={props.view}/>
{:else if props.view.tool === 'glass-transmission'}<LightCameraGlass view={props.view}/>
{/if}
{:else}<LightCameraResult view={props}/>{/if}
