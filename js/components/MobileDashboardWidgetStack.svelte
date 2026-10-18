<script lang="ts">
 import type {MobileDashboardStackView} from '../mobile-dashboard-presentation.js';
 import DashboardActionBar from './DashboardActionBar.svelte';
 import DashboardWidgetFrame from './DashboardWidgetFrame.svelte';
 let {view}:{view:MobileDashboardStackView}=$props();
</script><svelte:options preserveWhitespace/><section class="m-section m-dashboard-widget-section">
    <div class="m-section-head">
    <div class="m-section-labels">
      <span class="m-section-title">Dashboard widgets</span>
      <span class="m-section-count">{view.count}</span>
    </div>
    
  </div>
    <div class="m-dashboard-widget-actions">{#if view.actions}<DashboardActionBar view={view.actions}/>{/if}</div>
    <div class="dashboard-widgets m-dashboard-widgets">
      {#if view.hasEntries}{#each view.widgets as widget}{#if widget}<DashboardWidgetFrame view={widget}/>{/if}{/each}{:else}<div class="dashboard-widget dashboard-widget-full is-empty"><div class="dashboard-widget-empty">No widgets are visible.</div></div>{/if}
    </div>
  </section>
