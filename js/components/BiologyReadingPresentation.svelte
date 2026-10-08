<script lang="ts">
  import type {BiologyReadingProps} from '../biology-reading-presentation.js';
  import BiologyMarkerResults from './BiologyMarkerResults.svelte';
  import BiologyMethodology from './BiologyMethodology.svelte';
  import BiologyReadingFacts from './BiologyReadingFacts.svelte';
  import BiologyInterpretationNotes from './BiologyInterpretationNotes.svelte';
  let props: BiologyReadingProps = $props();
</script>
{#if props.kind === 'markers'}<BiologyMarkerResults sections={props.sections}/>{:else if props.kind === 'methodology'}<BiologyMethodology view={props.view}/>{:else if props.kind === 'facts'}<BiologyReadingFacts facts={props.facts}/>{:else}<BiologyInterpretationNotes flags={props.flags}/>{/if}
