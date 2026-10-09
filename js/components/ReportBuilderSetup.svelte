<script lang="ts">
  import type {ReportBuilderView} from '../report-builder-presentation.js';
  import {reportBuilderClasses as classes} from '../report-builder-classes.js';

  let {view}: {view: ReportBuilderView} = $props();
</script>

<p class={classes('report-builder-help report-intro-copy')}>Choose personal records to review or share. Your PDF preview is created locally.</p>
<div class={classes('report-builder-section')}>
  <div class={classes('report-builder-field-head')}>
    <span class={classes('report-builder-section-title')}>Start with a template</span>
    <span class={classes('report-selection-count')} data-report-template-customized hidden>Customized</span>
  </div>
  <div class={classes('report-preset-grid')}>
    {#each view.presets as preset}
      <button type="button" class={classes(`report-preset-btn${preset.active ? ' active' : ''}`)} data-report-action="set-preset" data-report-preset={preset.id} aria-pressed={preset.active}>
        <span class={classes('report-preset-title')}>{preset.label}</span>
        <span class={classes('report-preset-meta')}>{preset.subtitle}</span>
      </button>
    {/each}
  </div>
  <p class={classes('report-builder-help')} data-report-template-description>{view.description}</p>
  <p class={classes('report-builder-help')}>Templates set sections and dates. Result ranges, questions, detail and AI preferences stay as you choose them.</p>
</div>
<div class={classes('report-builder-section')}>
  <div class={classes('report-builder-two-col')}>
    <label class={classes('report-builder-field')} for="report-date-range">
      <span class={classes('report-builder-label')}>Date range</span>
      <select id="report-date-range" class={classes('report-builder-select')}>
        {#each view.dateOptions as option}
          <option value={option.value} selected={option.selected}>{option.label}</option>
        {/each}
      </select>
    </label>
    <label class={classes('report-builder-field')} for="report-range-mode">
      <span class={classes('report-builder-label')}>Result ranges</span>
      <select id="report-range-mode" class={classes('report-builder-select')} aria-describedby="report-range-help">
        {#each view.rangeOptions as option}
          <option value={option.value} selected={option.selected}>{option.label}</option>
        {/each}
      </select>
    </label>
  </div>
  <p class={classes('report-builder-help')} id="report-range-help">Applies only to this report. Lab ranges use app or custom references when unavailable. Optimal and Both flag against optimal ranges where available; phase-specific reference ranges take precedence.</p>
  <fieldset class={classes('report-detail-options')}>
    <legend class={classes('report-builder-label report-detail-legend')}>Report detail</legend>
    <div class={classes('report-section-grid')}>
      <label class={classes('report-builder-check report-detail-card')}>
        <input type="radio" name="report-detail" value="summary" checked class={classes('report-detail-input')}>
        <span><strong class={classes('report-detail-title')}>Concise summary</strong><small class={classes('report-detail-description')}>Key results and averages for a quick review.</small></span>
      </label>
      <label class={classes('report-builder-check report-detail-card')}>
        <input type="radio" name="report-detail" value="appendix" class={classes('report-detail-input')}>
        <span><strong class={classes('report-detail-title')}>Include detailed records</strong><small class={classes('report-detail-description')}>Add selected histories and full notes as an appendix.</small></span>
      </label>
    </div>
  </fieldset>
</div>
