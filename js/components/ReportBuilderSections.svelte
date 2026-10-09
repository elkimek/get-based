<script lang="ts">
  import type {ReportBuilderView} from '../report-builder-presentation.js';
  import {reportBuilderClasses as classes} from '../report-builder-classes.js';

  let {view}: {view: ReportBuilderView} = $props();
</script>

<div class={classes('report-builder-section')}>
  <div class={classes('report-builder-field-head')}>
    <span class={classes('report-builder-section-title')}>Include in the report</span>
    <span class={classes('report-selection-count')} data-report-section-count></span>
  </div>
  <div class={classes('report-section-grid')}>
    {#each view.sections as section}
      <label class={classes('report-builder-check')}>
        <input type="checkbox" data-report-section={section.id} checked={section.checked} class={classes('report-choice-input')}>
        <span>{section.label}</span>
      </label>
    {/each}
  </div>
  <p class={classes('report-builder-help')}>Lab results include ranges, flags and trends. Genome uses the findings choice below.</p>
  <details class={classes('report-options-details')} data-report-for="categories">
    <summary class={classes('report-options-summary')}>Lab categories <span class={classes('report-options-meta')} data-report-category-count></span></summary>
    <div class={classes('report-options-body')}>
      <div class={classes('report-category-actions')}>
        <button type="button" class={classes('report-mini-btn')} data-report-action="select-all-categories">All</button>
        <button type="button" class={classes('report-mini-btn')} aria-label="Select lab categories with flagged results" data-report-action="select-priority-categories">Flagged</button>
        <button type="button" class={classes('report-mini-btn')} data-report-action="clear-categories">Clear</button>
      </div>
      <div class={classes('report-category-list')}>
        {#each view.categories as category}
          <label class={classes('report-category-row')}>
            <input type="checkbox" data-report-category={category.key} data-report-priority={String(category.priority)} checked={category.checked} class={classes('report-choice-input')}>
            <span class={classes('report-category-copy')}>
              <span class={classes('report-category-title')}>{category.label}</span>
              <span class={classes('report-category-meta')}>{category.summary}</span>
            </span>
          </label>
        {:else}
          <div class={classes('report-builder-empty')}>No lab categories with data.</div>
        {/each}
      </div>
    </div>
  </details>
  <div class={classes('report-genome-options')} data-report-for="genetics">
    <label class={classes('report-builder-field')} for="report-genome-mode">
      <span class={classes('report-builder-label')}>Genome findings</span>
      <select id="report-genome-mode" class={classes('report-builder-select')}>
        <option value="risks">Risk associations</option>
        <option value="risks-traits">Risks and traits</option>
        <option value="traits">Traits only</option>
        <option value="all">All findings, including protective and reference calls</option>
      </select>
    </label>
    <p class={classes('report-builder-help')}>Uses your genotype’s current catalog interpretation. Associations are not diagnoses. Adding an appendix does not expand this selection.</p>
  </div>
  <details class={classes('report-options-details')} data-report-for="context">
    <summary class={classes('report-options-summary')}>Personal context <span class={classes('report-options-meta')}>Choose what to share</span></summary>
    <div class={classes('report-options-body')}>
      <div class={classes('report-section-grid')}>
        {#each view.contextTitles as title}
          <label class={classes('report-builder-check')}>
            <input type="checkbox" data-report-context={title} checked class={classes('report-choice-input')}>
            <span>{title}</span>
          </label>
        {:else}
          <p class={classes('report-builder-help')}>No personal context recorded.</p>
        {/each}
      </div>
    </div>
  </details>
  <details class={classes('report-options-details')} data-report-for="notes">
    <summary class={classes('report-options-summary')}>Manage notes <span class={classes('report-options-meta')}>{view.notes.length} stored</span></summary>
    <div class={classes('report-options-body')}>
      <p class={classes('report-builder-help')}>Timeline notes are also in Dashboard → Add widget → Labs → Notes. Older notes do not establish their original author. Turn off Timeline notes above to omit them.</p>
      <p class={classes('report-builder-help')}>Edit or delete opens the note editor. Reopen Create a report after saving your changes.</p>
      {#each view.notes as note}
        <div class={classes('report-note-review')}>
          <strong>{note.date}</strong>
          <p class={classes('report-note-text')}>{note.text}</p>
          <button type="button" class={classes('report-mini-btn')} data-report-action="edit-note" data-report-index={note.index}>Edit or delete</button>
        </div>
      {:else}
        <p>No timeline notes recorded.</p>
      {/each}
    </div>
  </details>
</div>
