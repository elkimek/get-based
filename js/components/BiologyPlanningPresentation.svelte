<script lang="ts">
  import type {BiologyPlanningProps} from '../biology-planning-presentation.js';
  import BiologyNextChecks from './BiologyNextChecks.svelte';
  import BiologyCoveragePlanner from './BiologyCoveragePlanner.svelte';
  let props: BiologyPlanningProps = $props();
</script>
{#if props.kind === 'checks'}<BiologyNextChecks rows={props.rows}/>{:else}<BiologyCoveragePlanner view={props.view}/>{/if}
