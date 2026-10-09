<script lang="ts">
  import type {LensDashboardToggleView} from '../lens-page-shell.js';
  let {view, extraClass = ''}: {view: LensDashboardToggleView | null; extraClass?: string} = $props();
</script>
{#if view}<button type="button" class={`dashboard-widget-tool lens-widget-dashboard-toggle${extraClass ? ` ${extraClass}` : ''}`} data-lens-page-action={view.action} data-lens-page-id={view.id}>{view.label}</button>{/if}
