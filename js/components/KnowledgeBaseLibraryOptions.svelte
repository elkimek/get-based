<script lang="ts">
  import type { KnowledgeBaseLibraryOptionsView } from '../knowledge-base-library-presentation.js';
  let { view }: {
    view: KnowledgeBaseLibraryOptionsView;
  } = $props();
</script>
{#each view.options as option}<option value={option.value} selected={option.selected}>{option.label}</option>{/each}
