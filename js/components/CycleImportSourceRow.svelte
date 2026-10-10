<script lang="ts">
  import type {CycleImportSourceView} from '../cycle-import-presentation.js';
  import {cycleImportClasses as classes} from '../cycle-import-classes.js';
  let {view}: {view: CycleImportSourceView} = $props();
</script>
<div class={classes('cycle-source-row')}>
  <div class={classes('cycle-source-main')}><strong>{view.label}</strong><span>{view.periodCount} periods / {view.observationCount} local observations{view.importedAt !== null ? ` / ${view.importedAt}` : ''}</span>
    {#if view.batches.length}<div class={classes('cycle-import-batches')}>{#each view.batches as batch}<button type="button" class={classes('cycle-mini-action')} data-cycle-import-action="delete-import" data-cycle-import-import-id={batch.importId}>{batch.label}</button>{/each}</div>{/if}
  </div>
  {#if view.deleteTitle !== null}<button type="button" class={classes('cycle-icon-btn cycle-delete-btn')} data-cycle-import-action="delete-source" data-cycle-import-source={view.source || undefined} title={view.deleteTitle} aria-label={view.deleteAriaLabel}>x</button>{/if}
</div>
