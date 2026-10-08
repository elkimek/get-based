<script lang="ts">
  import type { LightSessionPresentationProps } from '../light-session-presentation.js';
  import LightSessionRow from './LightSessionRow.svelte';
  import LightSessionHistory from './LightSessionHistory.svelte';
  import SunPastSessionForm from './SunPastSessionForm.svelte';
  import DeviceSessionForm from './DeviceSessionForm.svelte';
  let props: LightSessionPresentationProps = $props();
</script>
{#if props.kind === 'row'}<LightSessionRow view={props.view}/>
{:else if props.kind === 'past'}<SunPastSessionForm view={props.view} silhouetteHTML={props.silhouetteHTML}/>
{:else if props.kind === 'device'}<DeviceSessionForm view={props.view} silhouetteHTML={props.silhouetteHTML}/>
{:else}<LightSessionHistory {...props}/>{/if}
