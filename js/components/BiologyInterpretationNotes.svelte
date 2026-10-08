<script lang="ts">
  import {readingClasses as c} from '../biology-reading-classes.js';
  let {flags}: {flags: readonly string[]} = $props();
</script>
{#if flags.length}<details data-biology-reading-view class={c('biology-reading-notes')}><summary class={c('biology-reading-notes-summary')}>Interpretation notes <span class={c('biology-section-count')}>{flags.length}</span></summary><ul class={c('biology-reading-note-list')}>{#each flags as flag}<li class={c('biology-reading-note-item')}>{flag}</li>{/each}</ul></details>{/if}
