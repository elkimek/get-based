<script lang="ts">
  import {
    knowledgeBaseClasses as c,
    knowledgeBaseUtilities as u,
  } from '../knowledge-base-classes.js';
  import type { KnowledgeBasePanelView } from '../knowledge-base-presentation.js';
  import KnowledgeBaseStatus from './KnowledgeBaseStatus.svelte';
  import KnowledgeBaseLocalFields from './KnowledgeBaseLocalFields.svelte';
  import KnowledgeBaseExternalFields from './KnowledgeBaseExternalFields.svelte';
  let { view }: {
    view: KnowledgeBasePanelView;
  } = $props();
</script>
<div class={c('kb-panel')}>
  <section class={c('kb-intro')}>
    <div class={c('kb-intro-copy')}>
      <strong class={u('intro-title')}>Ground AI answers in documents you trust.</strong>
      <p class={u('intro-description')}>Add research papers, clinical guides, or personal notes. getbased searches them before answering and can cite the matching excerpts. <a class={u('intro-link')} href="https://docs.getbased.health/guides/knowledge-base" target="_blank" rel="noopener">Learn how it works →</a></p>
    </div>
    <div class={c('kb-status')} id="lens-status-chip"><KnowledgeBaseStatus view={view.status}/></div>
  </section>

  <section class={c('kb-section kb-engine-section')} aria-labelledby="kb-engine-heading">
    <div class={c('kb-section-head kb-engine-head')}>
      <div>
        <h3 class={u('section-title')} id="kb-engine-heading">Where it runs</h3>
        <p class={u('section-description')}>{view.backendCopy}</p>
      </div>
      <label class={c('kb-enable-control')} for="lens-enabled-toggle">
        <span>Use in AI answers</span>
        <span class={c('toggle-switch')}>
          <input type="checkbox" id="lens-enabled-toggle" checked={view.enabled} data-lens-action="toggle-enabled">
          <span class={c('toggle-slider')}></span>
        </span>
      </label>
    </div>
    <div class={c('ctx-btn-group kb-engine-picker')} role="radiogroup" aria-label="Knowledge Base engine">
      <button type="button" class={[c(view.isBrowser ? 'ctx-btn-option active' : 'ctx-btn-option'), u('engine-option')].join(' ')} role="radio" aria-checked={view.isBrowser} data-lens-action="set-backend" data-lens-backend="in-browser">On this device</button>
      <button type="button" class={[c(view.isExternal ? 'ctx-btn-option active' : 'ctx-btn-option'), u('engine-option')].join(' ')} role="radio" aria-checked={view.isExternal} data-lens-action="set-backend" data-lens-backend="external-server">External server</button>
    </div>
  </section>

  {#if view.isBrowser}<KnowledgeBaseLocalFields/>{/if}
  {#if view.isExternal}<KnowledgeBaseExternalFields {view}/>{/if}

  <section class={c('kb-section')} aria-labelledby="kb-retrieval-heading">
    <div class={c('kb-section-head')}>
      <div>
        <h3 class={u('section-title')} id="kb-retrieval-heading">Search behavior</h3>
        <p class={u('section-description')}>Control how much supporting context is sent with each question.</p>
      </div>
    </div>
    <div class={c('kb-retrieval-grid')}>
      <label class={c('kb-field kb-compact-field')} for="lens-topk-input">
        <span class={[u('field-label'), u('compact-field-label')].join(' ')}>Excerpts per question</span>
        <input type="number" class={c('kb-field-control kb-number-control')} id="lens-topk-input" value={view.topK} min="1" max="10" inputmode="numeric">
        <small class={u('field-small')}>Usually 3–5 is enough. Higher values add more context to each AI request.</small>
      </label>
      <label class={c('kb-option-card')} for="lens-multi-query-checkbox">
        <input class={u('option-checkbox')} type="checkbox" id="lens-multi-query-checkbox" checked={view.multiQuery}>
        <span>
          <strong class={u('option-title')}>Improve recall with query rewriting</strong>
          <small class={u('option-help')}>Your AI provider searches synonyms and related terms. Adds about one second to the first matching question.</small>
        </span>
      </label>
    </div>
  </section>

  <div class={c('kb-footer-actions')}>
    <div class={c('kb-footer-secondary')}>
      {#if view.connected}<button class={c('kb-text-btn')} data-lens-action="clear-cache">Clear search cache</button>{/if}
      {#if view.connected}<button class={c('kb-text-btn kb-text-btn-danger')} data-lens-action="remove-lens">Remove knowledge source</button>{/if}
    </div>
    <button class={c('import-btn import-btn-primary kb-save-btn')} data-lens-action="save-config">{view.saveLabel}</button>
  </div>

  <div class={c('kb-privacy-note')}>
    <span aria-hidden="true">🔒</span>
    <span>{view.privacyCopy}</span>
  </div>
</div>
