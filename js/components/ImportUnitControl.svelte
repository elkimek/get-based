<script lang="ts">
  import type {ImportUnitControlView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  let {view}: {view: ImportUnitControlView} = $props();
</script>
{#if !view.schemaBacked}
  <div class={classes('import-unit-combo')}>
    <input type="text" class={classes('import-unit-input import-unit-text')} data-marker-idx={view.index} value={view.unit} data-import-review-action="edit-unit" aria-label={`Unit for ${view.rawName}`} autocomplete="off">
    <button type="button" class={classes('import-unit-picker-btn')} data-marker-idx={view.index} data-import-review-action="unit-picker" aria-haspopup="listbox" aria-expanded="false" title="Choose common unit" aria-label={`Choose common unit for ${view.rawName}`}>
      <span class={classes('import-unit-button-caret')} aria-hidden="true">▾</span>
    </button>
  </div>
{:else}
  <button type="button" class={classes('import-unit-input import-unit-button')} data-marker-idx={view.index} data-import-review-action="unit-picker" aria-haspopup="listbox" aria-expanded="false" title={view.displayUnit} aria-label={`Unit for ${view.rawName}`}>
    <span class={classes('import-unit-button-text')}>{view.displayUnit}</span>
    <span class={classes('import-unit-button-caret')} aria-hidden="true">▾</span>
  </button>
{/if}
