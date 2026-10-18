<script lang="ts">
  import type {DashboardAlertsView} from '../dashboard-lab-summary-presentation.js';
  let {view}: {view: DashboardAlertsView} = $props();
</script>
<div class="alerts-section dashboard-alerts-widget"><div class="alerts-title">Needs Attention ({view.total})</div>
  {#each view.trends as alert}
    <div class={`trend-alert-card ${alert.tone}`} role="button" tabindex="0" aria-label={alert.accessibleLabel} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={alert.id ?? undefined}>
      <span class="trend-alert-arrow">{alert.arrow}</span>
      <div class="trend-alert-info">
        <div class="trend-alert-name">{alert.name} <span class="trend-alert-cat">{alert.category}</span></div>
        <div class="trend-alert-label">{alert.label}</div>
      </div>
      <div class="trend-alert-spark">{alert.spark}</div>
    </div>
  {/each}
  {#each view.critical as flag}
    <div class={`alert-card ${flag.tone}`} role="button" tabindex="0" aria-label={flag.accessibleLabel} data-dashboard-widget-action="navigate" data-dashboard-widget-route={flag.route ?? undefined}>
      <span class="alert-indicator">{flag.label}</span>
      <span class="alert-name">{flag.name}</span>
      <span class="alert-value">{flag.value} {flag.unit}</span>
      <span class="alert-ref">{flag.minimum} – {flag.maximum}</span>
    </div>
  {/each}
</div>
