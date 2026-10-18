<script lang="ts">
  import {lensDataWidgetHasContent, type LensDataPageView} from '../lens-data-page-presentation.js';
  import {lensShellClasses as c} from '../lens-shell-classes.js';
  import LensPageHeader from './LensPageHeader.svelte';
  import LensActionButtons from './LensActionButtons.svelte';
  import LensWidgetFrame from './LensWidgetFrame.svelte';
  import LabDateRange from './LabDateRange.svelte';
  import LabsEmptyDropZone from './LabsEmptyDropZone.svelte';
  import DashboardLabMarkers from './DashboardLabMarkers.svelte';
  import LensDataWidgetBody from './LensDataWidgetBody.svelte';
  let {view}: {view: LensDataPageView} = $props();
</script>
<LensPageHeader view={view.header}>{#snippet actions()}{#if view.kind === 'labs' || view.kind === 'labs-empty'}<LabDateRange view={view.range}/>{:else}<LensActionButtons view={view.actions}/>{/if}{/snippet}</LensPageHeader>{#if view.kind === 'labs-empty'}<LabsEmptyDropZone/>{:else}{#if view.kind === 'labs' && view.priority}<DashboardLabMarkers view={view.priority}/>{/if}<div data-lens-shell-view class={c('dashboard-widgets lens-page-widgets')} data-lens-route={view.grid.route} data-lens-order-key={view.grid.orderKey}>
    {#each view.grid.widgets as widget}<LensWidgetFrame view={widget.view} hasContent={lensDataWidgetHasContent(widget.content)}>{#snippet body()}
      <LensDataWidgetBody content={widget.content}/>
    {/snippet}</LensWidgetFrame>{/each}
  </div>
{/if}
