<script lang="ts">
  import type {ImportExcludeView} from '../import-review-presentation.js';
  import {importReviewClasses as classes} from '../import-review-classes.js';
  import ImportExcludeContent from './ImportExcludeContent.svelte';
  let {view, skipped = false}: {view?: ImportExcludeView; skipped?: boolean} = $props();
</script>
{#if skipped}
  <span class={classes('import-skip-note')}>Skipped unless mapped</span>
{:else if view}
  <button type="button" class={classes(`import-exclude-btn${view.excluded ? ' is-restore' : ''}`)} data-import-review-action="toggle-row" title={view.label} aria-label={view.label}><ImportExcludeContent {view}/></button>
{/if}
