<script lang="ts">
  import type {ImportMapControlView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  let {view}: {view: ImportMapControlView} = $props();
</script>
<div class={classes('import-map-control')}>
  <div class={classes('import-map-summary')}>
    {#if view.summaryKind !== 'none'}
      <div class={classes(view.summaryKind === 'mapped' ? 'import-mapped-key' : 'import-suggested-key')}>{view.summaryKind === 'mapped' ? 'Mapped to ' : 'New marker: '}<code class={classes('import-map-summary-key')}>{view.key}</code></div>
    {/if}
  </div>
  <button type="button" class={classes('import-map-picker-btn')} data-marker-idx={view.index} data-import-review-action="open-map-modal" title={view.label} aria-label={`Open marker picker for ${view.rawName}`}>
    <span class={classes('import-map-picker-icon')} aria-hidden="true"><svg class={classes('import-map-link-icon')} viewBox="0 0 24 24" focusable="false"><path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1l1.2-1.2"/></svg></span>
    <span class="sr-only">{view.label}</span>
  </button>
</div>
