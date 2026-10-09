<script lang="ts">
  import type {ImportMarkerMapCategoryView} from '../import-marker-map-presentation.js';
  import {importMarkerMapClasses as classes} from '../import-marker-map-classes.js';
  let {categories}: {categories: ImportMarkerMapCategoryView[]} = $props();
</script>

{#each categories as category}
  <button type="button" class={classes(`import-map-category${category.active ? ' active' : ''}`)} data-import-map-category={category.key}>
    <span>{category.label}</span><span>{category.count}</span>
  </button>
{/each}
