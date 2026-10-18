<script lang="ts">
 import type {DashboardBiometricSyncView} from '../../types/dashboard-biometric-views.js';
 let {view}:{view:DashboardBiometricSyncView|null}=$props();
</script><svelte:options preserveWhitespace={true}/>{#if view}<span class={'db-biometric-sync-status'+(view.stale?' is-stale':'')}>{view.label}</span>
      {#if view.stale}<button type="button" class="dashboard-action-btn db-biometric-sync-btn" data-dashboard-widget-action="sync-biometric-now">Sync stale data</button>{/if}{/if}