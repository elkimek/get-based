<script lang="ts">
  import type {ChartLayersView} from '../chart-layers-presentation.js';
  let {view}:{view:ChartLayersView}=$props();
</script><svelte:options preserveWhitespace={true}/><div class="chart-layers-wrapper">
    <button class="view-btn chart-layers-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="chart-layers-dropdown" data-lab-data-action="toggle-chart-layers">Layers ▾</button>
    <div class="chart-layers-dropdown" id="chart-layers-dropdown" role="menu">
      {#if view.notes}<label class="chart-layers-row" data-lab-data-action="chart-layers-row">
        <input type="checkbox" checked={view.notes.checked} data-lab-data-change="set-note-overlay">
        <span>📝 Notes</span>
      </label>{/if}
      {#if view.supplements}<label class="chart-layers-row" data-lab-data-action="chart-layers-row">
        <input type="checkbox" checked={view.supplements.checked} data-lab-data-change="set-supp-overlay">
        <span>💊 Supplements</span>
      </label>{/if}
      {#if view.cycle}<label class="chart-layers-row" data-lab-data-action="chart-layers-row">
        <input type="checkbox" checked={view.cycle.checked} data-lab-data-change="set-phase-overlay">
        <span>🔴 Cycle phase at blood draw</span>
      </label>{/if}
    </div>
  </div>