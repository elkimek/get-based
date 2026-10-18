<script lang="ts">
 import type {LensWidgetContent} from '../lens-widget-content.js';
 import type {LensWidgetToolsView} from '../lens-shell-presentation.js';
 import BiologyScoreDetail from './BiologyScoreDetail.svelte';
 import LightWidgetBody from './LightWidgetBody.svelte';
  import DashboardQuickMarkers from './DashboardQuickMarkers.svelte';
  import DashboardKeyTrends from './DashboardKeyTrends.svelte';
  import DashboardGenomeWidget from './DashboardGenomeWidget.svelte';
  import GenomeImportDetails from './GenomeImportDetails.svelte';
  import BodySources from './BodySources.svelte';
  import DashboardBiometricsOverview from './DashboardBiometricsOverview.svelte';
  import DashboardInsights from './DashboardInsights.svelte';
  import NutritionDashboard from './NutritionDashboard.svelte';
  import SupplementTimeline from './SupplementTimeline.svelte';
  import CycleOverviewPresentation from './CycleOverviewPresentation.svelte';
  import ContextCardCatalog from './ContextCardCatalog.svelte';
  import FocusCard from './FocusCard.svelte';
  import RecommendationPresentation from './RecommendationPresentation.svelte';
 let {content,tools}:{content:LensWidgetContent;tools?:LensWidgetToolsView}=$props();
</script>{#if content.kind === 'quick-markers'}<DashboardQuickMarkers view={content.view}/>{:else if
  content.kind === 'key-trends'}<DashboardKeyTrends view={content.view}/>{:else if
  content.kind === 'genome'}<DashboardGenomeWidget view={content.view}/>{:else if
  content.kind === 'genome-import'}<GenomeImportDetails view={content.view}/>{:else if
  content.kind === 'wearables'}<DashboardBiometricsOverview view={content.view}/>{:else if
  content.kind === 'body-sources'}<BodySources view={content.view}/>{:else if
  content.kind === 'nutrition' || content.kind === 'fuel'}{#if content.view}<NutritionDashboard view={content.view}/>{/if}{:else if
  content.kind === 'supplements'}{#if content.view}<SupplementTimeline kind="section" view={content.view}/>{/if}{:else if
  content.kind === 'cycle'}{#if content.view}<CycleOverviewPresentation view={content.view}/>{/if}{:else if
  content.kind === 'focus'}<FocusCard view={content.view}/>{:else if
  content.kind === 'recommendations'}<RecommendationPresentation view={content.view}/>{:else if
  content.kind === 'insights'}{#if content.view}<DashboardInsights view={content.view}/>{/if}{:else if
  content.kind === 'profile-context' && content.view}<ContextCardCatalog view={content.view}/>{:else if
  content.kind === 'biology-score'}{#if tools}<BiologyScoreDetail view={content.view} {tools}/>{:else}<BiologyScoreDetail view={content.view}/>{/if}{:else if
  content.kind === 'light'}<LightWidgetBody content={content.view}/>{/if}
