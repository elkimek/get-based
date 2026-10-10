<script lang="ts">
  import { knowledgeBaseClasses as c } from '../knowledge-base-classes.js';
  import type { KnowledgeBaseStatusView } from '../knowledge-base-presentation.js';
  let { view }: {
    view: KnowledgeBaseStatusView;
  } = $props();
</script>
<span class={c(view.chipClass)}>{view.chipText}</span>{#if view.detailText !== null}<div class={c(view.detailClass)}>{view.detailText}</div>{/if}
