<svelte:options preserveWhitespace={true}/><script lang="ts">
  import type {DnaPreviewView, DnaPreviewGroup} from '../dna-preview-presentation.js';
  let {view}: {view: DnaPreviewView} = $props();
</script>{#snippet group(g: DnaPreviewGroup)}{#if g.rows.length}{#if g.collapsed}<div class="dna-preview-group">
      <div class="dna-preview-group-title dna-preview-collapsible" role="button" tabindex="0" data-dna-action={g.action}>
        {g.label} ({g.rows.length}) <span class="dna-preview-expand-hint">show</span>
      </div>
      <div class="dna-preview-collapsed-items">
        {#each g.rows as row}<div class="dna-preview-row">
          <span class="dna-preview-icon">{row.icon}</span>
          <span class="dna-preview-gene">{row.gene} <span class="dna-preview-variant">{row.variant}</span> <span class="dna-preview-category">{row.category}</span></span>
          <span class="dna-preview-genotype">{row.genotype}</span>
        </div>{/each}
      </div>
    </div>{:else}<div class="dna-preview-group">
      <div class="dna-preview-group-title">{g.label} ({g.rows.length})</div>
      {#each g.rows as row}<div class="dna-preview-row">
        <span class="dna-preview-icon">{row.icon}</span>
        <span class="dna-preview-gene">{row.gene} <span class="dna-preview-variant">{row.variant}</span> <span class="dna-preview-category">{row.category}</span></span>
        <span class="dna-preview-genotype">{row.genotype}</span>
      </div>
      <div class="dna-preview-assessment">
      <span class="genetics-axis genetics-axis-evidence genetics-axis-{row.evidenceLevel}">Evidence · {row.evidenceLabel}</span>
      <span class="genetics-axis genetics-axis-relevance genetics-axis-{row.relevanceLevel}">Relevance · {row.relevanceLabel}</span>
    </div>
      <div class="dna-preview-note">{row.note}</div>{/each}
    </div>{/if}{/if}{/snippet}<div class="modal dna-preview-modal" role="dialog">
    <div class="dna-preview-header">
      <div class="dna-preview-title">DNA Import — {view.source}</div>
      <div class="dna-preview-stats">{view.stats}</div>
      {#if view.apoe !== null}<div class="dna-preview-apoe">APOE Haplotype: <strong>{view.apoe}</strong></div>{/if}
    </div>
    <div class="dna-preview-body">
      {@render group(view.groups[0]!)}
      {@render group(view.groups[1]!)}
      {@render group(view.groups[2]!)}
      {@render group(view.groups[3]!)}
    </div>
    <div class="dna-preview-disclaimer">
      Processed locally — your DNA file was never transmitted. Evidence strength and personal relevance are separate; neither label is a diagnosis.
    </div>
    <div class="dna-preview-actions">
      <button class="import-btn import-btn-secondary" data-dna-action={view.cancelAction}>Cancel</button>
      <button class="import-btn import-btn-primary" data-dna-action={view.importAction}>Import {view.importCount} SNPs</button>
    </div></div>