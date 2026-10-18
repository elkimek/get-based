import {escapeHTML, escapeAttr} from '../../js/utils.js';
import {dnaActionAttrs} from '../../js/dna-actions.js';
import type {DnaPreviewInput, DnaPreviewFinding as PreviewFinding} from '../../js/dna-preview-presentation.js';
export function originalDnaPreview(input: DnaPreviewInput): string {
  const [risk,protective,informational,none] = input.groups;
  const apoe=input.apoe,previewStats=input.stats;
  const dnaUiDeps={getSnpCategoryLabel:input.categoryLabel};
  const result={get source(){return input.source();},get coverage(){return {get found(){return input.importCount();}};}};
  const renderPreviewAssessment = (match: PreviewFinding) => {
    const profile = match.evidenceProfile;
    return `<div class="dna-preview-assessment">
      <span class="genetics-axis genetics-axis-evidence genetics-axis-${escapeAttr(profile.evidenceLevel)}">Evidence · ${escapeHTML(profile.evidenceShortLabel)}</span>
      <span class="genetics-axis genetics-axis-relevance genetics-axis-${escapeAttr(profile.relevanceLevel)}">Relevance · ${escapeHTML(profile.relevanceShortLabel)}</span>
    </div>`;
  };

  function renderGroup(items: PreviewFinding[], label: string) {
    if (items.length === 0) return '';
    return `<div class="dna-preview-group">
      <div class="dna-preview-group-title">${label} (${items.length})</div>
      ${items.map(match => `<div class="dna-preview-row">
        <span class="dna-preview-icon">${match.presentation.icon}</span>
        <span class="dna-preview-gene">${escapeHTML(match.gene)} <span class="dna-preview-variant">${escapeHTML(match.variant)}</span> <span class="dna-preview-category">${escapeHTML(dnaUiDeps.getSnpCategoryLabel(match.category))}</span></span>
        <span class="dna-preview-genotype">${escapeHTML(match.genotype)}</span>
      </div>
      ${renderPreviewAssessment(match)}
      <div class="dna-preview-note">${escapeHTML(match.note)}</div>`).join('')}
    </div>`;
  }

  function renderCollapsedGroup(items: PreviewFinding[], label: string) {
    if (items.length === 0) return '';
    return `<div class="dna-preview-group">
      <div class="dna-preview-group-title dna-preview-collapsible" role="button" tabindex="0" ${dnaActionAttrs('toggle-preview-group')}>
        ${label} (${items.length}) <span class="dna-preview-expand-hint">show</span>
      </div>
      <div class="dna-preview-collapsed-items">
        ${items.map(match => `<div class="dna-preview-row">
          <span class="dna-preview-icon">${match.presentation.icon}</span>
          <span class="dna-preview-gene">${escapeHTML(match.gene)} <span class="dna-preview-variant">${escapeHTML(match.variant)}</span> <span class="dna-preview-category">${escapeHTML(dnaUiDeps.getSnpCategoryLabel(match.category))}</span></span>
          <span class="dna-preview-genotype">${escapeHTML(match.genotype)}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  const html = `
    <div class="dna-preview-header">
      <div class="dna-preview-title">DNA Import \u2014 ${escapeHTML(result.source)}</div>
      <div class="dna-preview-stats">${escapeHTML(previewStats)}</div>
      ${apoe ? `<div class="dna-preview-apoe">APOE Haplotype: <strong>${escapeHTML(apoe)}</strong></div>` : ''}
    </div>
    <div class="dna-preview-body">
      ${renderGroup(risk, '\uD83D\uDD34 Risk associations')}
      ${renderGroup(protective, '\uD83D\uDFE2 Protective associations')}
      ${renderGroup(informational, '\uD83D\uDD35 Informational traits')}
      ${renderCollapsedGroup(none, '\u26AA Reference, neutral, or ungraded calls')}
    </div>
    <div class="dna-preview-disclaimer">
      Processed locally \u2014 your DNA file was never transmitted. Evidence strength and personal relevance are separate; neither label is a diagnosis.
    </div>
    <div class="dna-preview-actions">
      <button class="import-btn import-btn-secondary" ${dnaActionAttrs('close-preview')}>Cancel</button>
      <button class="import-btn import-btn-primary" ${dnaActionAttrs('confirm-import')}>Import ${result.coverage.found} SNPs</button>
    </div>`;

  return `<div class="modal dna-preview-modal" role="dialog">${html}</div>`;
}
