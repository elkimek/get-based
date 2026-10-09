<script lang="ts">
  import type {ReportBuilderView} from '../report-builder-presentation.js';
  import {reportBuilderClasses as classes} from '../report-builder-classes.js';
  import ReportBuilderSetup from './ReportBuilderSetup.svelte';
  import ReportBuilderSections from './ReportBuilderSections.svelte';
  import ReportBuilderAI from './ReportBuilderAI.svelte';

  let {view}: {view: ReportBuilderView} = $props();
</script>

<div class="modal-overlay" id={view.overlayId} data-report-builder-overlay data-report-preset={view.presetId} data-report-builder-view>
  <div class={classes('modal gb-form-modal report-builder-modal')} role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
    <div class={classes('gb-modal-head report-builder-head')}>
      <div class="gb-modal-title" id="report-builder-title">Create a report</div>
      <button type="button" class="modal-close" aria-label="Close" data-report-action="close">&times;</button>
    </div>
    <div class={classes('gb-form-body report-builder-body')}>
      <div class={classes('report-builder-scroll')}>
        <ReportBuilderSetup {view}/>
        <ReportBuilderSections {view}/>
        <div class={classes('report-builder-section')}>
          <label class={classes('report-builder-field')} for="report-purpose">
            <span class={classes('report-builder-section-title')}>Reason for sharing / questions <span class={classes('report-optional-label')}>Optional</span></span>
            <textarea id="report-purpose" class={classes('report-builder-select')} rows="3" maxlength="1200" placeholder="What would you like to ask or discuss?"></textarea>
          </label>
          <p class={classes('report-builder-help')}>Appears at the start of your report and guides the overview, if you generate one.</p>
        </div>
        <ReportBuilderAI available={view.aiAvailable}/>
      </div>
      <div class={classes('gb-form-actions report-builder-actions')}>
        <div class={classes('report-builder-selection-summary')} id="report-builder-selection-summary" data-report-selection-summary aria-live="polite"></div>
        <div class={classes('report-builder-footer-buttons')}>
          <button type="button" class={classes('import-btn import-btn-secondary report-builder-footer-button')} data-report-action="close">Cancel</button>
          <button type="button" class={classes('import-btn import-btn-primary report-builder-preview-btn report-builder-footer-button')} aria-describedby="report-builder-selection-summary" data-report-action="export">Preview PDF</button>
        </div>
      </div>
    </div>
  </div>
</div>
