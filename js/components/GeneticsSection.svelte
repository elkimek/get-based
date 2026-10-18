<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import type {GeneticsView,GeneticsAxesView,GeneticsRowView} from '../genetics-section-presentation.js';
  let {view}:{view:GeneticsView}=$props();
</script><svelte:options preserveWhitespace={true}/>{#snippet axes(a:GeneticsAxesView)}<span class="genetics-finding-axes">
      <span class={a.evidenceClass} title={a.evidenceTitle}>Evidence · {a.evidenceLabel}</span>
      <span class={a.relevanceClass} title={a.relevanceTitle}>Relevance · {a.relevanceLabel}</span>
    </span>{/snippet}{#snippet row(f:GeneticsRowView)}<div class={f.classes}>
          <span class="genetics-finding-dot">{f.dot}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">{f.gene}</span>
            <span class="genetics-finding-rsid">{f.rsid}</span>
          </span>
          <span class={f.impactClass}>{f.impact}</span>
          <span class="genetics-finding-genotype">{f.genotype}</span>
          {@render axes(f.axes)}
          <span class="genetics-finding-note">{f.note}{#if f.links}{#if f.links.primaryHref!==null} <a href={f.links.primaryHref} target="_blank" rel="noopener" class="detail-genetics-ref" title="Primary study (PubMed)">primary study</a>{/if} <a href={f.links.snpediaHref} target="_blank" rel="noopener" class="detail-genetics-ref" title="All studies (SNPedia)">more studies</a> <button type="button" class="detail-genetics-ref genetics-ai-link" data-dna-action={f.links.askActions.action} data-dna-rsid={f.links.askActions.rsid}>Ask AI</button> <a href={f.links.correctionHref} target="_blank" rel="noopener" class="detail-genetics-ref" title="Suggest a public catalog correction without sharing your genotype">suggest correction</a>{/if}</span>
        </div>{/snippet}{#if view.kind==='empty'}<div class="genetics-empty-stub" data-dna-action={view.actions[0]?.action} role="button" tabindex="0" aria-label="Add DNA data">
      <span class="genetics-empty-stub-icon" aria-hidden="true">&#129516;</span>
      <span class="genetics-empty-stub-body">
        <span class="genetics-empty-stub-title">Add your DNA data</span>
        <span class="genetics-empty-stub-sub">Upload raw DNA, import a lab report PDF, or add one SNP manually. Files stay on this device.</span>
        <span class="genetics-empty-actions">
          <button type="button" class="genetics-action-link" data-dna-action={view.actions[1]?.action}>Raw DNA file</button>
          <button type="button" class="genetics-action-link" data-dna-action={view.actions[2]?.action}>Report PDF/text</button>
          <button type="button" class="genetics-action-link" data-dna-action={view.actions[3]?.action}>Add SNP manually</button>
        </span>
      </span>
      <span class="genetics-empty-stub-arrow" aria-hidden="true">&rarr;</span>
    </div>{:else}<div class="dashboard-section genetics-section" id="genetics-section">
    <div class="section-header" role="button" tabindex="0" aria-label="Expand or collapse genetics section" data-dna-action={view.headerActions.action} style={componentStaticStyles.pointer}>
      <span>🧬 Genetics</span>
      <span class="section-meta">{view.meta}
        <span class={view.arrowClass}>▾</span></span>
    </div><div class={view.bodyClass}><div class="genetics-overview-grid">{#each view.cards as card}<div class="genetics-overview-card">
      <span class="genetics-overview-label">{card.label}</span>
      <strong>{card.value}</strong>
      <small>{card.sub}</small>
    </div>{/each}</div>{#if view.mtdna}<div class="genetics-mtdna">
      <div class="genetics-mtdna-hg"><span class="genetics-mtdna-label">mtDNA Haplogroup:</span> <strong>{view.mtdna.haplogroup}</strong></div>{#if view.mtdna.coupling}<div class="genetics-mtdna-coupling">{view.mtdna.coupling.label} — {view.mtdna.coupling.climate}</div>{/if}{#if view.mtdna.facts.length}<div class="genetics-mtdna-facts">{#each view.mtdna.facts as fact}<span><small>{fact.label}</small><strong>{fact.value}</strong></span>{/each}</div>{/if}{#each view.mtdna.details as detail}<div class="genetics-mtdna-detail">{detail}</div>{/each}{#if view.mtdna.match}<div class={view.mtdna.match.classes}>{view.mtdna.match.message}</div>{/if}<div class="genetics-mtdna-refs">Wallace 2015 (<a href="https://pubmed.ncbi.nlm.nih.gov/26406369/" target="_blank" rel="noopener">PMID: 26406369</a>)
      · <a href={view.mtdna.evidenceHref} target="_blank" rel="noopener">suggest study or correction</a>
      · <button type="button" data-dna-action={view.mtdna.removeActions.action}>remove</button></div></div>{/if}{#if view.apoe}<div class="genetics-apoe">APOE: <strong>{view.apoe.value}</strong>{@render axes(view.apoe.axes)}</div>{/if}{#if view.groups.length}<div class="genetics-findings"><div class="genetics-legend" title="Direction is separate from evidence strength and personal relevance" aria-label="Genetics interpretation legend">
      <span class="genetics-legend-item genetics-legend-risk"><span class="genetics-legend-dot">🔴</span> risk association</span>
      <span class="genetics-legend-item genetics-legend-protective"><span class="genetics-legend-dot">🟢</span> protective association</span>
      <span class="genetics-legend-item genetics-legend-trait"><span class="genetics-legend-dot">🔵</span> trait</span>
      <span class="genetics-legend-item genetics-legend-informational"><span class="genetics-legend-dot">⚪</span> neutral</span>
      <span class="genetics-legend-help">Direction, evidence strength, and personal relevance are separate. Strong evidence is not the same as a diagnosis or a proven intervention.</span>
    </div>{#each view.groups as group}<div class={group.classes}><div class="genetics-cat-label">{group.label}</div>{#each group.rows as finding}{@render row(finding)}{/each}</div>{/each}{#if view.more}<button class="genetics-show-all" data-dna-action={view.more.actions.action}>{view.more.count} more findings</button>{/if}</div>{/if}{#if view.otherGroups.length}<details class="genetics-other-snps">
      <summary>Other imported SNPs ({view.otherCount})</summary>
      <div class="genetics-other-snps-list">{#each view.otherGroups as group}<div class={group.classes}>
        <div class="genetics-cat-label">{group.label}</div>{#each group.rows as finding}{@render row(finding)}{/each}</div>{/each}</div></details>{/if}{#if view.stale!==null}<div class="genetics-stale-hint">{view.stale}</div>{/if}<div class="genetics-actions">
    <button type="button" class="genetics-action-link" data-dna-action={view.actions[0]?.action}>Add SNP</button>
    <button type="button" class="genetics-action-link" data-dna-action={view.actions[1]?.action}>Import report</button>
    <button type="button" class="genetics-action-link" data-dna-action={view.actions[2]?.action}>Re-import raw DNA</button>
    <button type="button" class="genetics-action-link genetics-action-delete" data-dna-action={view.actions[3]?.action}>Delete</button>
    <a class="genetics-action-link" href={view.issueHref} target="_blank" rel="noopener">Suggest a catalog SNP</a>
  </div></div></div>{/if}