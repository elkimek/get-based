<script lang="ts">
  import BioAge from './DashboardBioAge.svelte';
  import Correlation from './DashboardCorrelation.svelte';
  import Alerts from './DashboardAlerts.svelte';
  import type {DashboardLabSummaryView} from '../dashboard-lab-summary-presentation.js';
  let {view}: {view: DashboardLabSummaryView} = $props();
</script>
{#if view.kind === 'bio-age'}<BioAge {view} />
{:else if view.kind === 'alerts'}<Alerts {view} />
{:else}<Correlation {view} />{/if}
