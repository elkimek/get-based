<script lang="ts">
 import type {DashboardLabMarkerView} from '../../types/dashboard-lab-marker-views.js';
 import DashboardMiniSparkline from './DashboardMiniSparkline.svelte';
 let {view}:{view:DashboardLabMarkerView}=$props();
</script>
<svelte:options preserveWhitespace={true}/>

{#if view.kind==='single-marker'}<button type="button" class={'db-stat-widget db-single-marker-widget db-status-'+view.statusClass} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={view.id} aria-label={view.accessibleLabel}>
      <div class="db-stat-head">
        <span class={'db-status-dot db-status-'+view.dotStatus} aria-hidden="true"></span>
        <span>{view.name}</span>
      </div>
      <div class="db-stat-value">{view.value}{#if view.unit!==null}<small>{view.unit}</small>{/if}</div>
      <div class="db-stat-delta">{view.trendArrow} vs prev</div>
      <DashboardMiniSparkline view={view.sparkline}/>
      <div class="db-stat-reason">{view.reason}</div>
    </button>
{:else if view.kind==='spotlight'}<button type="button" class="db-spotlight" data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={view.id} aria-label={view.accessibleLabel}>
      <div class="db-spotlight-head">
        <div>
          <div class="db-spotlight-name">{view.name}</div>
          <div class="db-spotlight-meta">{view.range}</div>
          <div class="db-spotlight-priority">{view.priority}</div>
        </div>
        <div class="db-spotlight-value">{view.value}<small>{view.unit}</small></div>
      </div>
      <DashboardMiniSparkline view={view.sparkline}/>
    </button>
{:else}<button type="button" class={'labs-priority-banner db-status-'+view.statusClass} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={view.id} aria-label={view.accessibleLabel}>
      <span class={'db-status-dot db-status-'+view.dotStatus} aria-hidden="true"></span>
      <span class="labs-priority-copy">
        <span class="labs-priority-kicker">Current Priority</span>
        <strong>{view.name}</strong>
        <small>{view.priority}</small>
      </span>
      <span class="labs-priority-spark"><DashboardMiniSparkline view={view.sparkline}/></span>
      <span class="labs-priority-value">{view.value}<small>{view.unit}</small></span>
    </button>
{/if}
