<script lang="ts">
  import type {EMFInterpretationModalView} from '../emf-interpretation-presentation.js';
  import EMFInterpretationBody from './EMFInterpretationBody.svelte';
  let {view}: {view: EMFInterpretationModalView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class="emf-interp-modal">
    <div class="emf-interp-header">
      <h3>{view.title}</h3>
      <button class="modal-close" aria-label="Close" data-emf-interp-action="close">&times;</button>
    </div>
    <div class="emf-interp-body" id="emf-interp-body">
      <EMFInterpretationBody view={view.body} />
    </div>
    <div id="emf-interp-recs"></div>
    <div class="emf-interp-footer">
      <div id="emf-interp-meta" class="emf-interp-meta">
        {view.meta}
      </div>
      <div class="emf-interp-actions">
        <button class="import-btn import-btn-primary" id="emf-interp-generate" data-emf-interp-action="generate">{view.generate}</button>
        {#if view.showDiscuss}<button class="import-btn import-btn-secondary" data-emf-interp-action="discuss">Discuss in Chat</button>{/if}
        <button class="import-btn import-btn-secondary" data-emf-interp-action="close">Close</button>
      </div>
    </div>
  </div>