<script lang="ts">
  import type { KnowledgeBaseLibraryCreateView } from '../knowledge-base-library-presentation.js';
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
  import KnowledgeBaseLibraryModel from './KnowledgeBaseLibraryModel.svelte';
  let { view }: {
    view: KnowledgeBaseLibraryCreateView;
  } = $props();
</script>
<div class={c('kb-create-dialog')} role="dialog" aria-modal="true" aria-labelledby="lens-create-title">
  <div class={[c('gb-modal-head'), u('create-head')].join(' ')}>
    <div>
      <div class={c('gb-modal-title')} id="lens-create-title">Create a library</div>
    </div>
    <button class={c('modal-close')} id="lens-create-close" aria-label="Close">&times;</button>
  </div>
  <div class={c('kb-create-body')}>
    <div class={c('kb-create-device')}>{view.deviceLine}</div>
    <label class={c('kb-field')} for="lens-create-name">
      <span class={u('field-label')}>Library name</span>
      <input type="text" id="lens-create-name" class={c('kb-field-control')} placeholder="e.g. Research Papers" autocomplete="off">
      <small class={u('field-small')}>Use separate libraries for collections you do not want searched together.</small>
    </label>
    <div class={c('kb-field kb-model-field')}>
      <span class={u('field-label')}>Search profile</span>
      <small class={u('field-small')}>This choice is locked at creation. Changing it later requires indexing the documents again.</small>
      <div class={c('kb-model-picker')} role="radiogroup" aria-label="Search profile">{#each view.models as model}<KnowledgeBaseLibraryModel view={model}/>{/each}</div>
    </div>
    <div class={c('kb-create-actions')}>
      <button class={[c('import-btn import-btn-secondary'), u('create-action')].join(' ')} id="lens-create-cancel">Cancel</button>
      <button class={[c('import-btn import-btn-primary'), u('create-action')].join(' ')} id="lens-create-ok">Create library</button>
    </div>
  </div>
</div>
