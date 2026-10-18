<script lang="ts">
  import type {MtDnaPreviewView} from '../mtdna-preview-presentation.js';
  let {view}: {view: MtDnaPreviewView} = $props();
</script><svelte:options preserveWhitespace /><div class="modal dna-preview-modal" role="dialog"><div class="dna-preview-header">
    <div class="dna-preview-title">mtDNA Import</div>
    <div class="dna-preview-stats">{view.markerCount} mtDNA markers read from {view.fileName}</div>
  </div>
  <div class="dna-preview-body">
    <div class="mtdna-preview-haplogroup">
      <div class="mtdna-hg-label">Haplogroup</div>
      <div class="mtdna-hg-value">{view.haplogroup}</div>
      <div class="mtdna-hg-confidence">{view.matched}/{view.total} diagnostic markers matched</div>
    </div>{#if view.coupling}<div class="mtdna-preview-coupling">
      <div class="mtdna-coupling-label">{view.coupling.label}</div>
      <div class="mtdna-coupling-climate">{view.coupling.climate}</div>
      <div class="mtdna-coupling-desc">{view.coupling.description}</div>
    </div>{/if}{#if view.mismatch?.kind === 'mismatch'}<div class="mtdna-preview-mismatch mtdna-mismatch-{view.mismatch.severity}">
      <strong>Environment mismatch:</strong> {view.mismatch.message}
      {#if view.mismatch.implications !== null}<div class="mtdna-mismatch-implications">{view.mismatch.implications}</div>{/if}
    </div>{:else if view.mismatch?.kind === 'match'}<div class="mtdna-preview-match">{view.mismatch.message}</div>{/if}</div>
  <div class="dna-preview-disclaimer">Processed locally. Coupling classification follows the Wallace mitochondrial paradigm - a research framework, not an established clinical standard.</div>
  <div class="dna-preview-actions">
    <button class="import-btn import-btn-secondary" data-dna-action={view.cancelAction}>Cancel</button>
    <button class="import-btn import-btn-primary" data-dna-action={view.importAction}>Import Haplogroup {view.actionHaplogroup}</button>
  </div></div>