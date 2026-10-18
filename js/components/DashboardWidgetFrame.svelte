<script lang="ts">
  import DashboardWidgetBody from './DashboardWidgetBody.svelte';
  import type {DashboardWidgetFrameView} from '../dashboard-widget-presentation.js';
  let {view}: {view: DashboardWidgetFrameView} = $props();
</script>
<section class={view.className} data-widget-id={view.id} draggable={view.organizing ? 'true' : undefined} data-dashboard-widget-drag-id={view.dragId ?? undefined} data-dashboard-widget-drop-id={view.dragId ?? undefined}>
  <div class="dashboard-widget-chrome">
    <div class="dashboard-widget-handle" aria-hidden="true">⋮⋮</div>
    <div class="dashboard-widget-heading">
      {#if view.source !== null}<div class="dashboard-widget-source">{view.source}</div>{/if}
      <div class="dashboard-widget-title">{view.title}</div>
      {#if view.description !== null}<div class="dashboard-widget-description">{view.description}</div>{/if}
    </div>
    {#if view.tools}
      <div class="dashboard-widget-tools">
        <button type="button" class="dashboard-widget-tool" disabled={!view.tools.canMoveUp} data-dashboard-widget-action="move-widget" data-dashboard-widget-id={view.tools.upId ?? undefined} data-dashboard-widget-direction="-1" aria-label={view.tools.upLabel}>↑</button>
        <button type="button" class="dashboard-widget-tool" disabled={!view.tools.canMoveDown} data-dashboard-widget-action="move-widget" data-dashboard-widget-id={view.tools.downId ?? undefined} data-dashboard-widget-direction="1" aria-label={view.tools.downLabel}>↓</button>
        <button type="button" class="dashboard-widget-tool" data-dashboard-widget-action="hide-widget" data-dashboard-widget-id={view.tools.removeId ?? undefined} aria-label={view.tools.removeLabel}>{view.tools.removeText}</button>
      </div>
    {/if}
  </div>
  <div class="dashboard-widget-body"><DashboardWidgetBody content={view.content} /></div>
</section>
