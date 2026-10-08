<script lang="ts">
  import type { LightDeviceSetupProps } from '../light-device-setup-presentation.js';
  import LightDevicePresets from './LightDevicePresets.svelte';
  import LightDeviceCustomForm from './LightDeviceCustomForm.svelte';
  let props: LightDeviceSetupProps = $props();
</script>

{#if props.kind === 'presets'}
  <LightDevicePresets view={props.view}/>
{:else}
  <LightDeviceCustomForm view={props.view}/>
{/if}
