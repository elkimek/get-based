<script lang="ts">
  import type {ImportReviewRowView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  import ImportUnitControl from './ImportUnitControl.svelte';
  import ImportMapControl from './ImportMapControl.svelte';
  import ImportReviewRowAction from './ImportReviewRowAction.svelte';
  import ImportReviewStatus from './ImportReviewStatus.svelte';
  let {view}: {view: ImportReviewRowView} = $props();
</script>
<tr class={classes('import-review-row')} data-import-idx={view.index} data-import-status={view.status}>
  <td class={classes(`import-status-cell ${view.status === 'new' ? 'new-marker' : view.status}`)} data-label="Status"><ImportReviewStatus status={view.status}/></td>
  <td class={classes('import-name-cell')} data-label="Test name">{view.rawName}</td>
  <td class={classes('import-review-cell')} data-label="Value"><input type="number" step="any" class={classes('import-value-input')} data-marker-idx={view.index} value={view.value} data-import-review-action="edit-value" aria-label={`Value for ${view.rawName}`}></td>
  <td class={classes('import-review-cell import-unit-cell')} data-label="Unit"><ImportUnitControl view={view.unit}/></td>
  <td class={classes('import-range-cell')} data-label="Lab range">{view.range}</td>
  <td class={classes('import-map-cell')} data-label="Maps to">{#if view.status === 'matched'}{view.mappedKey}{:else}<ImportMapControl view={view.mapping}/>{/if}</td>
  <td class={classes(`import-row-action${view.status === 'unmatched' ? '' : ' import-row-action-btn'}`)} data-label="Action"><ImportReviewRowAction view={view.exclude} skipped={view.status === 'unmatched'}/></td>
</tr>
