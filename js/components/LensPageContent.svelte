<script lang="ts">
  import type {LensContentProps} from '../lens-content-presentation.js';
  import LensActionButtons from './LensActionButtons.svelte';
  import GenomeImportDetails from './GenomeImportDetails.svelte';
  import BodySources from './BodySources.svelte';

  let props: LensContentProps = $props();
</script>

{#if props.kind === 'actions'}
  <LensActionButtons view={props.view}/>
{:else if props.kind === 'body-sources'}
  <BodySources view={props.view}/>
{:else if props.view}
  <GenomeImportDetails view={props.view}/>
{/if}
