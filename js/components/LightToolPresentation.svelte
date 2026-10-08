<script lang="ts">
  import type { LightToolPresentationProps } from '../light-tools-presentation.js';
  import LightToolsLauncher from './LightToolsLauncher.svelte';
  import LightGoldenHourLog from './LightGoldenHourLog.svelte';
  import LightAuditWalkthrough from './LightAuditWalkthrough.svelte';
  import LightAuditPauseRows from './LightAuditPauseRows.svelte';
  import LightAuditWalkthroughStatus from './LightAuditWalkthroughStatus.svelte';
  let props: LightToolPresentationProps = $props();
</script>
{#if props.kind === 'launcher'}<LightToolsLauncher view={props.view}/>
{:else if props.kind === 'golden'}<LightGoldenHourLog view={props.view}/>
{:else if props.kind === 'audit'}<LightAuditWalkthrough guide={props.guide}/>
{:else if props.kind === 'audit-rows'}<LightAuditPauseRows rows={props.rows}/>
{:else}<LightAuditWalkthroughStatus state={props.state}/>{/if}
