<script lang="ts">
  import type {ImportReviewView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  import ImportReviewRow from './ImportReviewRow.svelte';
  let {view}: {view: ImportReviewView} = $props();
</script>
<div class={classes('gb-modal-head import-preview-head')}>
  <div><div class="gb-modal-kicker">{view.batchLabel}</div><div class="gb-modal-title">Review &amp; Edit Import</div></div>
  <button type="button" class="modal-close" data-import-review-action="close" aria-label="Close import review">×</button>
</div>
<div class={classes('gb-form-body import-review-body')}>
  <div class={classes('import-review-summary')}>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>File</span><strong class={classes('import-review-file-name')}>{view.fileName}</strong></div>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>Collection date</span><input class={classes('import-collection-control')} type="date" id="import-manual-date" value={view.date} data-import-review-action="manual-date" aria-label="Collection date"></div>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>Collection time</span><input class={classes('import-collection-control')} type="time" id="import-sample-time" value={view.sampleTime} data-import-review-action="manual-sample-time" aria-label="Blood collection time"><small class={classes('import-review-time-help')}>Draw time only — not received, processed, or report time.</small></div>
    <div class={classes('import-review-file')}><span class={classes('import-review-label')}>Fasting status</span><select class={classes('import-collection-control')} id="import-fasting" data-import-review-action="manual-fasting" aria-label="Fasting status">
      <option value="unknown" selected={view.fasting === null}>Unknown</option><option value="fasting" selected={view.fasting === true}>Fasting</option><option value="not-fasting" selected={view.fasting === false}>Not fasting</option>
    </select></div>
    <div class={classes('import-review-stats')} aria-label="Import mapping summary">
      <span class={classes('import-review-stat import-review-stat-matched')}><strong class={classes('import-count-matched')}>{view.counts.matched}</strong> matched</span>
      <span class={classes('import-review-stat import-review-stat-new')}><strong class={classes('import-count-new')}>{view.counts.new}</strong> new</span>
      <span class={classes('import-review-stat import-review-stat-unmatched')}><strong class={classes('import-count-unmatched')}>{view.counts.unmatched}</strong> unmatched</span>
    </div>
  </div>
  {#if view.unmatchedWarning}<div class={classes('import-review-warning')}>A large portion of markers couldn't be mapped. This lab report may not be well supported yet — review the results below carefully before importing. You can <a class={classes('import-review-support')} href="https://github.com/elkimek/get-based/issues" target="_blank" rel="noopener">request support</a> for this lab on GitHub.</div>{/if}
  {#if view.dateWarning}<div class={classes('import-review-warning import-review-date-warning')}>Could not extract collection date from PDF. Please set it above before importing.</div>{/if}
  <div class={classes('import-review-controls')}>
    <div class={classes('import-filter-group')} role="group" aria-label="Filter import rows">
      {#each [{key: 'all', label: 'All'}, {key: 'matched', label: 'Matched'}, {key: 'new', label: 'New'}, {key: 'unmatched', label: 'Unmatched'}, {key: 'excluded', label: 'Excluded'}] as filter}
        <button type="button" class={classes(`import-filter-btn${filter.key === 'all' ? ' active' : ''}`)} data-filter={filter.key} data-import-review-action="filter">{filter.label}</button>
      {/each}
    </div>
    <label class={classes('import-review-search-wrap')}><span class="sr-only">Search import rows</span><input type="search" id="import-review-search" class={classes('import-review-search')} placeholder="Search markers" data-import-review-action="search" autocomplete="off"></label>
    <span class={classes('import-visible-count')} id="import-visible-count" aria-live="polite"></span>
  </div>
  <div class={classes('import-table-wrap')}><table class={classes('import-table')}><thead><tr><th class={classes('import-state-heading')} aria-label="Status"></th><th>Test Name</th><th>Value</th><th>Unit</th><th>Lab Range</th><th>Maps To</th><th>Action</th></tr></thead><tbody>{#each view.rows as row}<ImportReviewRow view={row}/>{/each}</tbody></table></div>
  {#if view.ranges}<label class={classes('import-range-option')}><input class={classes('import-range-checkbox')} type="checkbox" id="import-adopt-ranges" checked={view.ranges.checked}><span class={classes('import-range-copy')}><strong class={classes('import-range-title')}>Use reference ranges from this report</strong><small class={classes('import-range-help')}>{view.ranges.count} marker{view.ranges.count !== 1 ? 's' : ''} differ from the current ranges. Lab-specific intervals are preferred; uncheck to keep the current ranges.</small></span></label>{/if}
  {#if view.privacy?.kind === 'local'}<div class="privacy-notice privacy-notice-success">🔒 Personal information scrubbed by local AI{view.privacy.reviewed ? ' (reviewed)' : ''}</div>{:else if view.privacy?.kind === 'regex'}<div class="privacy-notice privacy-notice-warning">🔒 {view.privacy.replacements} personal detail{view.privacy.plural ? 's' : ''} replaced with fake data<span class={classes('privacy-notice-detail')}>Set up Local AI in Settings for comprehensive language-aware protection</span></div>{/if}
  {#if view.cost}<div class={classes('import-cost-note')}>📊 {view.cost.model} · {view.cost.tokens} tokens · {view.cost.cost}</div>{/if}
  {#if view.debug}<div class={classes('import-debug-note')}>⏲ {view.debug.piiLabel}{' \u00a0|\u00a0 '}Analysis: {view.debug.analysis}s ({view.debug.model})</div>{/if}
  {#if view.privacyDetails}<button type="button" class={classes('import-btn import-btn-secondary import-privacy-details-btn')} data-import-review-action="privacy-details">🔍 View privacy details</button>{/if}
</div>
<div class={classes('import-review-actions')}>
  <button type="button" class={classes('import-btn import-btn-secondary import-review-footer-button')} data-import-review-action="close">{view.cancelLabel}</button>
  <button type="button" class={classes('import-btn import-btn-primary import-review-footer-button')} id="import-confirm-btn" data-import-review-action="confirm" disabled={view.confirmDisabled}>{view.confirmLabel}</button>
</div>
