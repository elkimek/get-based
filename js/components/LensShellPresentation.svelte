<script lang="ts">
  import type {LensShellProps} from '../lens-shell-presentation.js';
  import LensPageHeader from './LensPageHeader.svelte';
  import LensPageWidget from './LensPageWidget.svelte';
  import LensPageGrid from './LensPageGrid.svelte';
  import LensWidgetTools from './LensWidgetTools.svelte';
  let props: LensShellProps = $props();
</script>
{#if props.kind === 'header'}<LensPageHeader view={props.view}/>
{:else if props.kind === 'widget'}<LensPageWidget view={props.view}/>
{:else if props.kind === 'grid'}<LensPageGrid view={props.view}/>
{:else}<LensWidgetTools view={props.view}/>{/if}
