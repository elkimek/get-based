<script lang="ts">
  import DashboardMiniSparkline from './DashboardMiniSparkline.svelte';
  import type {DashboardKeyTrendsView} from '../dashboard-key-trends-presentation.js';
  let {view}: {view: DashboardKeyTrendsView} = $props();
</script><svelte:options preserveWhitespace />{#if view.rows.length}<div class="db-key-trend-list">{#each view.rows as row}<button type="button" class={'db-key-trend-row db-status-' + row.statusClass} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={row.id} aria-label={row.accessibleLabel}>
      <span class={'db-status-dot db-status-' + row.dotStatus} aria-hidden="true"></span>
      <span class="db-key-trend-name-wrap">
        <span class="db-key-trend-name">{row.name}</span>
        <span class="db-key-trend-cat">{row.category}</span>
      </span>
      <span class="db-key-trend-spark"><DashboardMiniSparkline view={row.sparkline}/></span>
      <span class="db-key-trend-latest"><strong>{row.value}</strong><small>{row.unit}</small></span>
      <span class="db-key-trend-signal"><strong>{row.trendArrow}</strong><small>{row.reason}</small></span>
    </button>{/each}</div>{:else}<div class="dashboard-widget-empty">No trend markers available in this date range.</div>{/if}
