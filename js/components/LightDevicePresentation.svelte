<script lang="ts">
  import type { LightDevicePresentationProps } from '../light-device-library-presentation.js';
  import LightDeviceLibrary from './LightDeviceLibrary.svelte';
  import LightDevicePicker from './LightDevicePicker.svelte';
  import LightDeviceChannelChips from './LightDeviceChannelChips.svelte';
  let props: LightDevicePresentationProps = $props();
</script>
{#if props.kind === 'library'}<LightDeviceLibrary cards={props.cards}/>
{:else if props.kind === 'picker'}<LightDevicePicker rows={props.rows}/>
{:else}<LightDeviceChannelChips chips={props.chips}/>{/if}
