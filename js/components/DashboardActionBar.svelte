<script lang="ts">
  import type {DashboardActionBarView} from '../dashboard-action-bar-presentation.js';
  let {view, sticky = false}: {view: DashboardActionBarView; sticky?: boolean} = $props();
</script><svelte:options preserveWhitespace={true}/>{#snippet buttons()}<button class="dashboard-action-btn" type="button" data-dashboard-widget-action="toggle-organize">{view.organizeLabel}</button>
      <button class="dashboard-action-btn dashboard-action-btn-primary" type="button" data-dashboard-widget-action="open-picker">+ Add widget</button>
      {#if view.showReset}<button type="button" class="dashboard-action-btn" data-dashboard-widget-action="reset-widgets">Reset layout</button>{/if}{/snippet}{#if sticky}<div class="dashboard-sticky-actions" aria-label="Floating dashboard widget controls">{@render buttons()}</div>{:else}{@render buttons()}{/if}