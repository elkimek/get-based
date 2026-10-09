<script lang="ts">
  import type {ImportUnitMenuOptionView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  let {options}: {options: ImportUnitMenuOptionView[]} = $props();
</script>
{#each options as option}
  <button type="button" class={classes('import-unit-option')} data-import-unit-option={option.unit} data-marker-idx={option.index} role="option" aria-selected={option.selected ? 'true' : 'false'} disabled={option.disabled}>{option.label}</button>
{/each}
