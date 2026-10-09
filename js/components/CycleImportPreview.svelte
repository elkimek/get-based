<script lang="ts">
  import type {CycleImportPreviewView} from '../cycle-import-presentation.js';
  import {cycleImportClasses as classes} from '../cycle-import-classes.js';
  import CycleImportPeriodRow from './CycleImportPeriodRow.svelte';
  let {view}: {view: CycleImportPreviewView} = $props();
</script>
<div class={classes('gb-modal-head import-preview-head')}>
  <div><div class="gb-modal-kicker">Cycle import · {view.source}</div><div class="gb-modal-title">Review cycle import</div></div>
  <button type="button" class="modal-close" data-cycle-import-action="close" aria-label="Close import preview">×</button>
</div>
<div class={classes('gb-form-body import-review-body')}>
  <div class={classes('import-review-summary')}>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>File</span><strong>{view.fileName}</strong></div>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>Range</span><strong>{view.firstDate} - {view.lastDate}</strong></div>
    <div class={classes('import-review-stats')} aria-label="Cycle import summary">
      <span class={classes('import-review-stat import-review-stat-neutral')}><strong>{view.observationCount}</strong> daily observations</span><span class={classes('import-review-stat import-review-stat-matched')}><strong>{view.periodCount}</strong> periods found</span>
      {#if view.conflictCount}<span class={classes('import-review-stat import-review-stat-unmatched')}><strong>{view.conflictCount}</strong> overlap{view.conflictCount !== 1 ? 's' : ''}</span><span class={classes('import-review-stat import-review-stat-new')}><strong>{view.importCount}</strong> will import</span>{/if}
    </div>
  </div>
  {#if view.conflictCount}<div class={classes('import-review-warning cycle-import-conflict-warning')} role="alert"><strong>{view.conflictSummary}</strong><span>Choose how to handle the overlapping periods below.</span></div>{/if}
  {#if view.warnings.length}<div class={classes('import-review-warning')} role="alert">{#each view.warnings as warning, index}{#if index}<br>{/if}{warning}{/each}</div>{/if}
  {#if view.conflictCount}<div class={classes('cycle-import-conflicts')} role="radiogroup" aria-label="Cycle import conflict handling">
    {#each [{value: 'keep-existing', label: 'Keep existing', description: 'Import non-overlapping periods and leave conflicts unchanged.'}, {value: 'replace-overlapping', label: 'Replace overlaps', description: 'Replace overlapping existing period entries with imported periods.'}] as option}
      <label class={classes('cycle-import-conflict-option')}><input type="radio" name="cycle-import-conflict" value={option.value} checked={view.conflictMode === option.value} data-cycle-import-action="conflict-mode"><span><strong>{option.label}</strong><small>{option.description}</small></span></label>
    {/each}
  </div>{/if}
  <div class={classes('cycle-import-table-heading')}><strong>{view.periodCount ? 'Periods found' : 'No periods found'}</strong><span>{view.periodCount ? 'Check the dates and details before importing.' : 'Daily observations can still be saved on this device.'}</span></div>
  {#if view.periodCount}<div class={classes('import-table-wrap cycle-import-table-wrap')}><table class={classes('import-table import-review-table cycle-import-table')} aria-label="Periods detected in this import">
    <thead><tr><th class={classes('cycle-import-status-heading')}>Status</th><th>Start</th><th>End</th><th>Flow</th><th>Symptoms</th></tr></thead><tbody>{#each view.rows as row}<CycleImportPeriodRow view={row}/>{/each}</tbody>
  </table></div>{/if}
  {#if view.periodCount > 18}<div class={classes('cycle-import-more')}>Showing 18 of {view.periodCount} periods.</div>{/if}
  <div class={classes('cycle-import-privacy-note')}><span class={classes('cycle-import-privacy-icon')} aria-hidden="true">🔒</span><span><strong>Daily details stay on this device.</strong><small>Period summaries can sync across devices when cross-device sync is enabled.</small></span></div>
</div>
<div class={classes('import-review-actions')}>
  <button type="button" class={classes('import-btn import-btn-secondary')} data-cycle-import-action="close">Cancel</button>
  <button type="button" class={classes('import-btn import-btn-primary')} data-cycle-import-action="confirm">{view.confirmLabel}</button>
</div>
