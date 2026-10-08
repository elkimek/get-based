<script lang="ts">
  import type {CameraGuidePresentationProps} from '../light-camera-presentation.js';
  import LightAimingGuide from './LightAimingGuide.svelte';
  import LightCameraLock from './LightCameraLock.svelte';
  let props: CameraGuidePresentationProps = $props();
</script>
{#if props.kind === 'guide'}<LightAimingGuide view={props.guide}/>{:else}<LightCameraLock lock={props.lock}/>{/if}
