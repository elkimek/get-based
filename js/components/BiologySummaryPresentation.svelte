<script lang="ts">
  import type {BiologySummaryProps} from '../biology-summary-presentation.js';
  import BiologySummaryWidget from './BiologySummaryWidget.svelte';
  import BiologyCompatibilityLens from './BiologyCompatibilityLens.svelte';
  let props: BiologySummaryProps = $props();
</script>
{#if props.kind === 'widget'}<BiologySummaryWidget view={props.view}/>{:else}<BiologyCompatibilityLens view={props.view}/>{/if}
