<script lang="ts">
  import type {ImportExcludeView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  let {view}: {view: ImportExcludeView} = $props();
</script>
<span class={classes('import-exclude-icon')} aria-hidden="true">{view.excluded ? '+' : '×'}</span><span class="sr-only">{view.label}</span>
