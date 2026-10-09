<script lang="ts">
  import type {ImportReviewStatus} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  let {status}: {status: ImportReviewStatus} = $props();
  const label = $derived(status === 'matched' ? 'Matched' : status === 'new' ? 'New' : 'Unmatched');
</script>
<span class={classes('import-status-dot')} title={label} role="img" aria-label={label}></span>
