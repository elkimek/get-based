<script lang="ts">
  import type {CycleImportPeriodView} from '../cycle-import-presentation.js';
  import {cycleImportClasses as classes} from '../cycle-import-classes.js';
  let {view}: {view: CycleImportPeriodView} = $props();
</script>
<tr data-import-status={view.status}>
  <td class={classes('cycle-import-status-cell')} data-label="Status"><span class={classes(`cycle-import-row-status ${view.status === 'unmatched' ? 'cycle-import-row-status-conflict' : 'cycle-import-row-status-ready'}`)}>{view.statusLabel}</span></td>
  <td data-label="Start">{view.start}</td><td data-label="End">{view.end}</td>
  <td data-label="Flow">{view.flow}</td><td data-label="Symptoms">{view.symptoms}</td>
</tr>
