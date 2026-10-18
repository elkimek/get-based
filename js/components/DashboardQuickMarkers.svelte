<script lang="ts">
 import DashboardMiniSparkline from './DashboardMiniSparkline.svelte';
 import type {DashboardQuickMarkersView} from '../../types/dashboard-owned-widgets.js';
 let {view}:{view:DashboardQuickMarkersView}=$props();
</script>
<svelte:options preserveWhitespace={true}/>
{#if view.rows.length}<div class="db-quick-marker-grid">{#each view.rows as tile (tile.id)}<button type="button" class={'db-stat-widget db-quick-marker-tile db-status-'+tile.statusClass} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={tile.id} aria-label={tile.accessibleLabel}>
      <div class="db-stat-head">
        <span class={'db-status-dot db-status-'+tile.dotStatus} aria-hidden="true"></span>
        <span>{tile.name}</span>
      </div>
      <div class="db-stat-value">{tile.value}{#if tile.unit!==null}<small>{tile.unit}</small>{/if}</div>
      <div class="db-stat-delta">{tile.trendArrow} vs prev</div>
      <DashboardMiniSparkline view={tile.sparkline}/>
      <div class="db-stat-reason">{tile.reason}</div>
    </button>{/each}</div>{/if}
