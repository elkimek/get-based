<script lang="ts">
  import type {BiologyOverviewProps} from '../biology-overview-presentation.js';
  import BiologyCoherenceOverview from './BiologyCoherenceOverview.svelte';
  import BiologyDashboardScore from './BiologyDashboardScore.svelte';
  import BiologyDashboardCoherence from './BiologyDashboardCoherence.svelte';
  let props: BiologyOverviewProps = $props();
</script>
{#if props.kind === 'coherence'}<BiologyCoherenceOverview view={props.view}/>{:else if props.kind === 'dashboard-score'}<BiologyDashboardScore view={props.view}/>{:else}<BiologyDashboardCoherence view={props.view}/>{/if}
