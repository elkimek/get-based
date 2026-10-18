<script lang="ts">
 import Sync from './DashboardBiometricSyncStatus.svelte';
 import Tile from './DashboardBiometricTile.svelte';
 import type {DashboardBiometricsOverviewView} from '../../types/dashboard-biometric-views.js';
 let {view}:{view:DashboardBiometricsOverviewView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="db-biometric-overview-bar">
      <span>{view.count} metric{view.pluralSuffix} selected</span>
      <div class="db-biometric-overview-actions">
        <Sync view={view.sync}/>
        <button type="button" class="dashboard-action-btn" data-dashboard-widget-action="open-biometric-picker">Add metrics</button>
      </div>
    </div>{#if view.rows.length}<div class="db-wearable-grid db-biometric-overview-grid">{#each view.rows as row,index(index)}<Tile view={row}/>{/each}</div>{:else}<div class="dashboard-widget-empty">No biometrics selected.</div>{/if}