<script lang="ts">
  import type {DashboardLightWidgetView} from '../dashboard-light-widget-presentation.js';
  import DashboardLightSunLoading from './DashboardLightSunLoading.svelte';
  import LightReviewAI from './LightReviewAI.svelte';
  import LightPageBody from './LightPageBody.svelte';
  import LightConditionsPresentation from './LightConditionsPresentation.svelte';
  let {view}:{view:DashboardLightWidgetView}=$props();
</script><svelte:options preserveWhitespace/>{#if
  view.kind === 'loading'}<DashboardLightSunLoading/>{:else if
  view.kind === 'today'}<LightReviewAI view={view.view??{kind:'dashboard-fallback'}}/>{:else if
  view.kind === 'conditions'}{#if view.view}<LightConditionsPresentation {...view.view}/>{/if}{:else if
  view.kind === 'page'}{#if view.view}<LightPageBody {...view.view}/>{/if}{/if}