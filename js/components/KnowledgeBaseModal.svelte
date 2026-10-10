<script lang="ts">
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
  import type { KnowledgeBaseModalView } from '../knowledge-base-presentation.js';
  import KnowledgeBasePanel from './KnowledgeBasePanel.svelte';
  let { view }: {
    view: KnowledgeBaseModalView;
  } = $props();
</script>
<div class={c('gb-modal-head')}>
  {#if view.showContextBack}<button type="button" class={c('context-back-btn')} data-lens-action="open-context" aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>{/if}
  <div><div class={c('gb-modal-title')}>Knowledge Base</div></div>
  <button class={c('modal-close')} data-lens-action="close-kb" aria-label="Close">&times;</button>
</div>
<div class={[c('gb-form-body'), u('body')].join(' ')}><div class={[c('settings-section'), u('custom-section')].join(' ')} id="custom-lens-section"><KnowledgeBasePanel view={view.panel}/></div></div>
