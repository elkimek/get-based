<script lang="ts">
  import type {LensDashboardToggleView} from '../lens-page-shell.js';
  let {view}: {view: LensDashboardToggleView | null} = $props();
</script>
{#if view}<button type="button" class="dashboard-widget-tool lens-widget-dashboard-toggle" data-lens-page-action={view.action} data-lens-page-id={view.id}>{view.label}</button>{/if}
