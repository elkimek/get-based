<script lang="ts">
  import LensDataWidgetBody from './LensDataWidgetBody.svelte';
  import DashboardLabSummary from './DashboardLabSummary.svelte';
  import DashboardLabMarkers from './DashboardLabMarkers.svelte';
  import DashboardLabNotes from './DashboardLabNotes.svelte';
  import BiologyDashboardScore from './BiologyDashboardScore.svelte';
  import BiologyDashboardCoherence from './BiologyDashboardCoherence.svelte';
  import DashboardLightWidgetBody from './DashboardLightWidgetBody.svelte';
  import DashboardLightSunLoading from './DashboardLightSunLoading.svelte';
  import type {DashboardWidgetContent} from '../dashboard-widget-presentation.js';
  let {content}: {content: DashboardWidgetContent | null} = $props();
</script>
{#if content === null}<div class="dashboard-widget-empty">No data available for this widget.</div>
{:else if content.kind === 'lab-summary'}<DashboardLabSummary view={content.view} />
{:else if content.kind === 'lab-marker'}<DashboardLabMarkers view={content.view} />
{:else if content.kind === 'notes'}<DashboardLabNotes view={content.view} />
{:else if content.kind === 'biology-dashboard-score'}<BiologyDashboardScore view={content.view} />
{:else if content.kind === 'biology-dashboard-coherence'}<BiologyDashboardCoherence view={content.view} />
{:else if content.kind === 'dashboard-light'}<DashboardLightWidgetBody view={content.view} />
{:else if content.kind === 'light-loading'}<DashboardLightSunLoading />
{:else}<LensDataWidgetBody {content} />{/if}
