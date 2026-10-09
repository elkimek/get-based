<script lang="ts">
  import type {LensWidgetToolsView} from '../lens-shell-presentation.js';
  import {lensShellClasses as c, lensShellUtilities} from '../lens-shell-classes.js';
  import LensDashboardToggle from './LensDashboardToggle.svelte';
  let {view}: {view: LensWidgetToolsView} = $props();
</script>
{#if view.move && view.move.route && view.move.count >= 2}
  <button type="button" class={c('dashboard-widget-tool')} disabled={view.move.index <= 0}
    data-lens-page-action="move-widget" data-lens-page-route={view.move.route} data-lens-page-id={view.move.id} data-lens-page-direction="-1" aria-label="Move page section up">↑</button>
  <button type="button" class={c('dashboard-widget-tool')} disabled={view.move.index >= view.move.count - 1}
    data-lens-page-action="move-widget" data-lens-page-route={view.move.route} data-lens-page-id={view.move.id} data-lens-page-direction="1" aria-label="Move page section down">↓</button>{/if}<LensDashboardToggle view={view.dashboard} extraClass={lensShellUtilities('dashboard-widget-tool')}/>
