<script lang="ts">
 import type {DashboardBiometricTileView} from '../../types/dashboard-biometric-views.js';
 let {view}:{view:DashboardBiometricTileView}=$props();
</script><svelte:options preserveWhitespace={true}/>{#if view.kind==='manual-empty'}<div class="db-biometric-tile-wrap">
        <div class="wearable-card wearable-card-empty db-biometric-manual-empty" data-empty-metric={view.metricId} data-dashboard-widget-action="open-biometric-manual-log" data-dashboard-widget-id={view.id??undefined} role="button" tabindex="0" aria-label={'Log '+view.accessibleLabel+' manually'}>
          <div class="wearable-card-top"><span class="wearable-metric-name">{view.label}</span></div>
          <div class="wearable-value-row wearable-value-row-empty"><span class="wearable-value wearable-value-dash">-</span></div>
          <div class="wearable-card-bottom"><div class="wearable-empty-cta">+ Log</div></div>
        </div>
        <button type="button" class="db-biometric-remove" data-dashboard-widget-action="remove-biometric-metric" data-dashboard-widget-id={view.remove.id??undefined} aria-label={'Remove '+view.remove.label+' from Biometrics Overview'} title="Remove metric">&times;</button>
      </div>{:else}<div class="db-biometric-tile-wrap">
      <button type="button" class="db-wearable-tile db-biometric-widget" data-dashboard-widget-action="open-biometric-detail" data-dashboard-widget-id={view.id??undefined} aria-label={view.accessibleLabel}>
        <span class="db-wearable-label">{view.label}</span>
        <strong>{view.value}</strong>
        <span class="db-wearable-foot"><small>{view.unit}</small><em>{view.change}</em></span>
      </button>
      <button type="button" class="db-biometric-remove" data-dashboard-widget-action="remove-biometric-metric" data-dashboard-widget-id={view.remove.id??undefined} aria-label={'Remove '+view.remove.label+' from Biometrics Overview'} title="Remove metric">&times;</button>
    </div>{/if}