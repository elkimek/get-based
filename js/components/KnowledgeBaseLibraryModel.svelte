<script lang="ts">
  import type { KnowledgeBaseLibraryModelView } from '../knowledge-base-library-presentation.js';
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
  let { view }: {
    view: KnowledgeBaseLibraryModelView;
  } = $props();
</script>
<label class={c('kb-model-card')}>
  <input class={u('model-radio')} type="radio" name="lens-create-model" value={view.key} checked={view.isRecommended}>
  <span class={c('kb-model-copy')}>
    <span class={c('kb-model-title')}><span class={c('kb-model-profile')}>{view.profileLabel}</span>{view.label}</span>
    <span class={c('kb-model-meta')}>{view.downloadMB}&nbsp;MB download &middot; {view.langLabel}</span>
    <span class={c('kb-model-notes')}>{view.notes}</span>
  </span>
  {#if view.isRecommended}<span class={c('kb-recommended-badge')}>Recommended</span>{/if}
</label>
