<script lang="ts">
  import type {DashboardCorrelationView} from '../dashboard-lab-summary-presentation.js';
  let {view}: {view: DashboardCorrelationView} = $props();
</script>
{#if view.kind === 'correlation-empty'}
  <button type="button" class="db-correlation-empty" data-dashboard-widget-action="navigate" data-dashboard-widget-route="correlations">
    <strong>Pick markers to compare</strong>
    <span>Correlations need at least three shared dated values.</span>
  </button>
{:else}
  <div class="db-correlation-widget">
    <div class="db-correlation-head">
      <span>vs <strong>{view.target}</strong></span>
      <button type="button" data-dashboard-widget-action="navigate" data-dashboard-widget-route="correlations">Open</button>
    </div>
    <div class="db-correlation-grid">
      {#each view.pairs as pair}
        <button type="button" class={`db-correlation-cell ${pair.directionClass}`} data-dashboard-widget-action="open-marker-detail" data-dashboard-widget-id={pair.id ?? undefined}>
          <span>{pair.name}</span>
          <strong>{pair.coefficient}</strong>
          <small>{pair.value}{#if pair.unit !== null}{' '}{pair.unit}{/if}</small>
        </button>
      {/each}
    </div>
  </div>
{/if}
