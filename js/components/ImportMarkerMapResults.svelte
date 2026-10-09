<script lang="ts">
  import type {ImportMarkerMapResultView} from '../import-marker-map-presentation.js';
  import {importMarkerMapClasses as classes} from '../import-marker-map-classes.js';
  let {results}: {results: ImportMarkerMapResultView[]} = $props();
</script>

{#if results.length === 0}
  <div class={classes('import-map-empty')}>No markers match this search.</div>
{:else}
  {#each results as result}
    <button type="button" class={classes(`import-map-result${result.selected ? ' selected' : ''}`)} data-import-map-key={result.key}>
      <span class={classes('import-map-result-main')}>
        <strong>{result.name}</strong>
        <code class={classes('import-map-result-key')}>{result.key}</code>
      </span>
      <span class={classes('import-map-result-meta')}>
        <span class={classes('import-map-result-badge')}>{result.categoryLabel}</span>
        <span class={classes('import-map-result-badge')}>{result.units}</span>
        {#if result.range}<span class={classes('import-map-result-badge')}>{result.range}</span>{/if}
      </span>
    </button>
  {/each}
{/if}
