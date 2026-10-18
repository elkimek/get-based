<script lang="ts">
  import SunStartSessionForm from './SunStartSessionForm.svelte';
  import SunPreflightBanner from './SunPreflightBanner.svelte';
  import LightActiveSession from './LightActiveSession.svelte';
  import LightLiveReadouts from './LightLiveReadouts.svelte';
  import LightSessionChips from './LightSessionChips.svelte';
  import type { LightSessionPresentationProps } from '../light-session-presentation.js';
  import LightSessionDetail from './LightSessionDetail.svelte';
  import DeviceSessionModeForm from './DeviceSessionModeForm.svelte';
  import LightSessionRow from './LightSessionRow.svelte';
  import LightSessionHistory from './LightSessionHistory.svelte';
  import SunPastSessionForm from './SunPastSessionForm.svelte';
  import DeviceSessionForm from './DeviceSessionForm.svelte';
  let props: LightSessionPresentationProps = $props();
</script>
{#if props.kind === 'start' || props.kind === 'coverage'}<SunStartSessionForm view={props.kind === 'start' ? props.view : null} silhouetteView={props.silhouetteView}/>
{:else if props.kind === 'preflight'}<SunPreflightBanner view={props.view}/>
{:else if props.kind === 'active'}<LightActiveSession view={props.view}/>
{:else if props.kind === 'live-readouts'}<LightLiveReadouts readouts={props.readouts}/>
{:else if props.kind === 'channel-chips'}<LightSessionChips chips={props.chips}/>
{:else if props.kind === 'detail'}<LightSessionDetail view={props.view} ai={props.ai}/>
{:else if props.kind === 'mode-editor'}<DeviceSessionModeForm name={props.name} modes={props.modes}/>
{:else if props.kind === 'row'}<LightSessionRow view={props.view}/>
{:else if props.kind === 'past'}<SunPastSessionForm view={props.view} silhouetteView={props.silhouetteView}/>
{:else if props.kind === 'device'}<DeviceSessionForm view={props.view} silhouetteView={props.silhouetteView}/>
{:else}<LightSessionHistory {...props}/>{/if}
