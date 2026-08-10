// @ts-check
// dna-ui.js — Genetics dashboard rendering and autosomal DNA modal owner.

import { state } from './state.js';
import { escapeAttr, escapeHTML } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { dnaActionAttrs } from './dna-actions.js';
import {
  clearPendingDnaImport,
  loadGeneticsStylesheetForAction,
  navigateDnaRoute,
  setPendingDnaImport,
} from './dna-runtime.js';
import { detectMtDNAMismatch } from './dna-mtdna.js';
import {
  mtdnaEvidenceIssueUrl,
  newSnpSuggestionIssueUrl,
  resolveSnpEvidenceProfile,
  snpEvidenceIssueUrl,
  snpFindingPresentation,
  snpFindingRank,
} from './dna-evidence.js';

/** @type {Record<string, any>} */
const dnaUiDeps = {
  findGenotypeInfo: null,
  geneticsStalenessHint: null,
  getSnpCategoryLabel: category => String(category || 'Other'),
  getSnpCategoryLabels: () => ({}),
  getSnpTable: () => null,
  handleDNAFile: null,
  loadSnpTable: null,
  resolveAPOE: null,
  setImportRunning: null,
};

export function configureDnaUi(deps = {}) {
  const previous = { ...dnaUiDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.hasOwn(dnaUiDeps, key) && typeof value === 'function') {
      dnaUiDeps[key] = value;
    }
  }
  return previous;
}

export function renderGeneticsSection() {
  const genetics = state.importedData.genetics;
  const hasSnps = genetics && genetics.snps && Object.keys(genetics.snps).length > 0;
  const hasMtdna = genetics && genetics.mtdna;
  if (!hasSnps && !hasMtdna) {
    return `<div class="genetics-empty-stub" ${dnaActionAttrs('import-file')} role="button" tabindex="0" aria-label="Add DNA data">
      <span class="genetics-empty-stub-icon" aria-hidden="true">&#129516;</span>
      <span class="genetics-empty-stub-body">
        <span class="genetics-empty-stub-title">Add your DNA data</span>
        <span class="genetics-empty-stub-sub">Upload raw DNA, import a lab report PDF, or add one SNP manually. Files stay on this device.</span>
        <span class="genetics-empty-actions">
          <button type="button" class="genetics-action-link" ${dnaActionAttrs('import-file')}>Raw DNA file</button>
          <button type="button" class="genetics-action-link" ${dnaActionAttrs('import-snp-report')}>Report PDF/text</button>
          <button type="button" class="genetics-action-link" ${dnaActionAttrs('add-manual-snp')}>Add SNP manually</button>
        </span>
      </span>
      <span class="genetics-empty-stub-arrow" aria-hidden="true">&rarr;</span>
    </div>`;
  }

  const snpTable = dnaUiDeps.getSnpTable();
  if (hasSnps && !snpTable) {
    dnaUiDeps.loadSnpTable?.().then(() => navigateDnaRoute('dashboard'));
    return '';
  }

  const snpCount = hasSnps ? Object.keys(genetics.snps).length : 0;
  const apoe = genetics.apoe;
  const collapsed = localStorage.getItem('labcharts-genetics-collapsed') === '1';

  const byCat = {};
  const otherByCat = {};
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps || {})) {
    if (apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable?.[rsid];
    if (!entry) continue;
    const info = dnaUiDeps.findGenotypeInfo?.(entry, stored.genotype);
    if (!info) continue;
    const cat = entry.category || 'other';
    const presentation = snpFindingPresentation(info.effect, info.valence);
    const evidenceProfile = resolveSnpEvidenceProfile(entry, info);
    const isPrimary = ['risk', 'protective', 'trait'].includes(presentation.tone);
    const target = isPrimary ? byCat : otherByCat;
    if (!target[cat]) target[cat] = [];
    target[cat].push({
      rsid,
      gene: stored.gene || entry.gene,
      variant: stored.variant || entry.variant,
      genotype: stored.genotype,
      effect: info.effect,
      valence: info.valence || 'risk',
      note: info.note,
      references: entry.references || [],
      catalogEntry: entry,
      presentation,
      evidenceProfile,
      rank: snpFindingRank(evidenceProfile, presentation),
    });
  }

  const heaviest = findings => Math.min(...findings.map(finding => finding.rank ?? 999));
  const catOrder = Object.entries(byCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const totalFindings = catOrder.reduce((count, [, findings]) => count + findings.length, 0);
  const otherCatOrder = Object.entries(otherByCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const otherFindings = otherCatOrder.reduce((count, [, findings]) => count + findings.length, 0);

  const renderAssessment = finding => {
    const profile = finding.evidenceProfile || resolveSnpEvidenceProfile(finding.catalogEntry, finding);
    return `<span class="genetics-finding-axes">
      <span class="genetics-axis genetics-axis-evidence genetics-axis-${escapeAttr(profile.evidenceLevel)}" title="${escapeAttr(profile.evidenceDescription)}">Evidence · ${escapeHTML(profile.evidenceShortLabel)}</span>
      <span class="genetics-axis genetics-axis-relevance genetics-axis-${escapeAttr(profile.relevanceLevel)}" title="${escapeAttr(profile.relevanceDescription)}">Relevance · ${escapeHTML(profile.relevanceShortLabel)}</span>
    </span>`;
  };
  const catLabels = dnaUiDeps.getSnpCategoryLabels();

  const metaParts = [];
  if (genetics.source) metaParts.push(escapeHTML(genetics.source));
  if (hasSnps) metaParts.push(`${snpCount} SNPs`);
  if (hasMtdna) metaParts.push(`mtDNA ${escapeHTML(genetics.mtdna.haplogroup)}`);
  if (totalFindings > 0) metaParts.push(`${totalFindings} findings`);
  const latestDate = [genetics.importDate, genetics.mtdna?.importDate].filter(Boolean).sort().pop();
  if (latestDate) metaParts.push(latestDate);

  let html = `<div class="dashboard-section genetics-section" id="genetics-section">
    <div class="section-header" role="button" tabindex="0" aria-label="Expand or collapse genetics section" ${dnaActionAttrs('toggle-genetics-collapse')} style="cursor:pointer">
      <span>\uD83E\uDDEC Genetics</span>
      <span class="section-meta">${metaParts.join(' \u00B7 ')}
        <span class="genetics-collapse-arrow${collapsed ? ' collapsed' : ''}">\u25BE</span></span>
    </div>`;

  html += `<div class="genetics-body${collapsed ? ' hidden' : ''}">`;

  const coverageFound = Number(genetics.coverage?.found);
  const coverageTotal = Number(genetics.coverage?.total);
  const hasCoverage = hasSnps && Number.isFinite(coverageFound) && Number.isFinite(coverageTotal) && coverageTotal > 0;
  const coveragePct = hasCoverage ? Math.round((coverageFound / coverageTotal) * 100) : null;
  const overviewCards = [
    {
      label: hasCoverage ? 'Catalog coverage' : 'Imported SNPs',
      value: hasCoverage ? `${coverageFound.toLocaleString()} / ${coverageTotal.toLocaleString()}` : (hasSnps ? snpCount.toLocaleString() : '0'),
      sub: hasCoverage ? `${coveragePct}% matched · ${genetics.source || 'DNA import'}` : (genetics.source || 'Autosomal raw data'),
    },
    {
      label: 'Findings',
      value: String(totalFindings),
      sub: totalFindings ? 'Interpreted from known SNPs' : 'No interpreted findings',
    },
    apoe ? {
      label: 'APOE',
      value: apoe,
      sub: 'Haplotype context',
    } : null,
    hasMtdna ? {
      label: 'mtDNA',
      value: genetics.mtdna.haplogroup,
      sub: genetics.mtdna.coupling?.shortLabel || 'Maternal lineage',
    } : null,
  ].filter(card => card !== null);

  html += '<div class="genetics-overview-grid">';
  overviewCards.forEach(card => {
    html += `<div class="genetics-overview-card">
      <span class="genetics-overview-label">${escapeHTML(card.label)}</span>
      <strong>${escapeHTML(card.value)}</strong>
      <small>${escapeHTML(card.sub)}</small>
    </div>`;
  });
  html += '</div>';

  if (hasMtdna) {
    const mt = genetics.mtdna;
    const mismatch = detectMtDNAMismatch(genetics);
    html += `<div class="genetics-mtdna">
      <div class="genetics-mtdna-hg"><span class="genetics-mtdna-label">mtDNA Haplogroup:</span> <strong>${escapeHTML(mt.haplogroup)}</strong></div>`;
    if (mt.coupling) {
      html += `<div class="genetics-mtdna-coupling">${escapeHTML(mt.coupling.label)} \u2014 ${escapeHTML(mt.coupling.climate)}</div>`;
    }
    const mtFacts = [
      mt.origin ? `<span><small>Origin</small><strong>${escapeHTML(mt.origin)}</strong></span>` : '',
      mt.source ? `<span><small>Source</small><strong>${escapeHTML(mt.source)}</strong></span>` : '',
      Number.isFinite(Number(mt.matchedMutations)) && Number.isFinite(Number(mt.totalDiagnostic))
        ? `<span><small>Marker match</small><strong>${Number(mt.matchedMutations)} / ${Number(mt.totalDiagnostic)}</strong></span>`
        : '',
    ].filter(Boolean);
    if (mtFacts.length) html += `<div class="genetics-mtdna-facts">${mtFacts.join('')}</div>`;
    if (mt.details) html += `<div class="genetics-mtdna-detail">${escapeHTML(mt.details)}</div>`;
    if (mt.coupling?.description) html += `<div class="genetics-mtdna-detail">${escapeHTML(mt.coupling.description)}</div>`;
    if (mt.coupling?.implications) html += `<div class="genetics-mtdna-detail">${escapeHTML(mt.coupling.implications)}</div>`;
    if (mismatch && mismatch.mismatch) {
      html += `<div class="genetics-mtdna-mismatch mismatch-${mismatch.severity}">${escapeHTML(mismatch.message)}</div>`;
    } else if (mismatch && !mismatch.mismatch) {
      html += `<div class="genetics-mtdna-match">${escapeHTML(mismatch.message)}</div>`;
    }
    html += `<div class="genetics-mtdna-refs">Wallace 2015 (<a href="https://pubmed.ncbi.nlm.nih.gov/26406369/" target="_blank" rel="noopener">PMID: 26406369</a>)
      \u00B7 <a href="${escapeAttr(mtdnaEvidenceIssueUrl())}" target="_blank" rel="noopener">suggest study or correction</a>
      \u00B7 <button type="button" ${dnaActionAttrs('delete-mtdna')}>remove</button></div>`;
    html += `</div>`;
  }

  if (apoe) {
    const apoeProfile = resolveSnpEvidenceProfile(snpTable?.rs429358 || snpTable?.rs7412 || {});
    html += `<div class="genetics-apoe">APOE: <strong>${escapeHTML(apoe)}</strong>${renderAssessment({ evidenceProfile: apoeProfile })}</div>`;
  }

  if (totalFindings > 0) {
    let shown = 0;
    const INITIAL_LIMIT = 8;
    html += `<div class="genetics-findings">`;
    html += `<div class="genetics-legend" title="Direction is separate from evidence strength and personal relevance" aria-label="Genetics interpretation legend">
      <span class="genetics-legend-item genetics-legend-risk"><span class="genetics-legend-dot">🔴</span> risk association</span>
      <span class="genetics-legend-item genetics-legend-protective"><span class="genetics-legend-dot">🟢</span> protective association</span>
      <span class="genetics-legend-item genetics-legend-trait"><span class="genetics-legend-dot">🔵</span> trait</span>
      <span class="genetics-legend-item genetics-legend-informational"><span class="genetics-legend-dot">⚪</span> neutral</span>
      <span class="genetics-legend-help">Direction, evidence strength, and personal relevance are separate. Strong evidence is not the same as a diagnosis or a proven intervention.</span>
    </div>`;
    for (const [cat, findings] of catOrder) {
      findings.sort((a, b) => a.rank - b.rank);
      const catLabel = catLabels[cat] || cat;
      const startHidden = shown >= INITIAL_LIMIT;
      html += `<div class="genetics-cat-group${startHidden ? ' genetics-extra' : ''}">`;
      html += `<div class="genetics-cat-label">${escapeHTML(catLabel)}</div>`;
      for (const finding of findings) {
        const isExtra = shown >= INITIAL_LIMIT;
        const impact = finding.presentation;
        const primaryRef = (finding.references || []).find(ref => /^https?:\/\//i.test(String(ref || '')));
        const refLink = primaryRef
          ? ` <a href="${escapeAttr(primaryRef)}" target="_blank" rel="noopener" class="detail-genetics-ref" title="Primary study (PubMed)">primary study</a>`
          : '';
        const snpediaId = `${finding.rsid.charAt(0).toUpperCase()}${finding.rsid.slice(1)}`;
        const snpediaLink = ` <a href="https://www.snpedia.com/index.php/${escapeAttr(encodeURIComponent(snpediaId))}" target="_blank" rel="noopener" class="detail-genetics-ref" title="All studies (SNPedia)">more studies</a>`;
        const correctionLink = ` <a href="${escapeAttr(snpEvidenceIssueUrl(finding.rsid, finding.catalogEntry))}" target="_blank" rel="noopener" class="detail-genetics-ref" title="Suggest a public catalog correction without sharing your genotype">suggest correction</a>`;
        const askAiLink = ` <button type="button" class="detail-genetics-ref genetics-ai-link" ${dnaActionAttrs('ask-ai-snp', { rsid: finding.rsid })}>Ask AI</button>`;
        const rowClasses = ['genetics-finding-row', `genetics-finding-${impact.tone}`];
        if (isExtra && !startHidden) rowClasses.push('genetics-extra');
        html += `<div class="${rowClasses.join(' ')}">
          <span class="genetics-finding-dot">${impact.icon}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(finding.gene || finding.rsid)} ${escapeHTML(finding.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(finding.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.shortLabel)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(finding.genotype)}</span>
          ${renderAssessment(finding)}
          <span class="genetics-finding-note">${escapeHTML(finding.note || 'Observed in your imported genotype.')}${refLink}${snpediaLink}${askAiLink}${correctionLink}</span>
        </div>`;
        shown++;
      }
      html += `</div>`;
    }
    if (totalFindings > INITIAL_LIMIT) {
      html += `<button class="genetics-show-all" ${dnaActionAttrs('toggle-genetics-expand')}>${totalFindings - INITIAL_LIMIT} more findings</button>`;
    }
    html += `</div>`;
  }

  if (otherFindings > 0) {
    html += `<details class="genetics-other-snps">
      <summary>Other imported SNPs (${otherFindings})</summary>
      <div class="genetics-other-snps-list">`;
    for (const [cat, findings] of otherCatOrder) {
      findings.sort((a, b) => a.rank - b.rank);
      const catLabel = catLabels[cat] || cat;
      html += `<div class="genetics-cat-group genetics-cat-group-secondary">
        <div class="genetics-cat-label">${escapeHTML(catLabel)}</div>`;
      for (const finding of findings) {
        const impact = finding.presentation;
        html += `<div class="genetics-finding-row genetics-finding-${impact.tone}">
          <span class="genetics-finding-dot">${impact.icon}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(finding.gene || finding.rsid)} ${escapeHTML(finding.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(finding.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.shortLabel)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(finding.genotype)}</span>
          ${renderAssessment(finding)}
          <span class="genetics-finding-note">${escapeHTML(finding.note || 'Observed in your imported genotype.')}</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div></details>`;
  }

  const staleHint = dnaUiDeps.geneticsStalenessHint?.(genetics);
  if (staleHint) {
    html += `<div class="genetics-stale-hint">${escapeHTML(staleHint)}</div>`;
  }

  html += `<div class="genetics-actions">
    <button type="button" class="genetics-action-link" ${dnaActionAttrs('add-manual-snp')}>Add SNP</button>
    <button type="button" class="genetics-action-link" ${dnaActionAttrs('import-snp-report')}>Import report</button>
    <button type="button" class="genetics-action-link" ${dnaActionAttrs('reimport-dna')}>Re-import raw DNA</button>
    <button type="button" class="genetics-action-link genetics-action-delete" ${dnaActionAttrs('delete-dna')}>Delete</button>
    <a class="genetics-action-link" href="${escapeAttr(newSnpSuggestionIssueUrl())}" target="_blank" rel="noopener">Suggest a catalog SNP</a>
  </div>`;
  html += `</div></div>`;

  return html;
}

export function toggleGeneticsCollapse() {
  const body = document.querySelector('.genetics-body');
  const arrow = document.querySelector('.genetics-collapse-arrow');
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  arrow?.classList.toggle('collapsed', isHidden);
  localStorage.setItem('labcharts-genetics-collapsed', isHidden ? '1' : '0');
}

export function toggleGeneticsExpand(button) {
  const container = document.querySelector('.genetics-findings');
  if (!container) return;
  const isExpanded = container.classList.toggle('expanded');
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = isExpanded ? 'Show less' : button.dataset.label;
}

export function reimportDNA() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void dnaUiDeps.handleDNAFile?.(file);
  };
  input.click();
}

let dnaModalEscapeBound = false;
let dnaBackdropMouseDownInside = false;

function nudgeDnaModal() {
  const dialog = document.querySelector('#dna-modal-overlay .modal');
  if (!(dialog instanceof HTMLElement)) return;
  dialog.classList.remove('modal-nudge');
  void dialog.offsetWidth;
  dialog.classList.add('modal-nudge');
  dialog.addEventListener('animationend', () => dialog.classList.remove('modal-nudge'), { once: true });
}

function handleDnaBackdropMouseDown(event) {
  const target = event.target;
  dnaBackdropMouseDownInside = target instanceof Element && !!target.closest('.modal');
}

function handleDnaBackdropClick(event) {
  const target = event.target;
  if (dnaBackdropMouseDownInside) {
    dnaBackdropMouseDownInside = false;
    return;
  }
  if (!(target instanceof Element) || target.id !== 'dna-modal-overlay') return;
  event.preventDefault();
  nudgeDnaModal();
}

function handleDnaModalEscape(event) {
  const overlay = document.getElementById('dna-modal-overlay');
  if (event.key !== 'Escape' || !overlay?.classList.contains('show')) return;
  event.preventDefault();
  closeDNAImportPreview();
}

function openDnaModalOverlay(overlay, initialFocus) {
  if (!overlay.dataset.dnaBackdropNudgeWired) {
    overlay.addEventListener('mousedown', handleDnaBackdropMouseDown);
    overlay.addEventListener('click', handleDnaBackdropClick);
    overlay.dataset.dnaBackdropNudgeWired = '1';
  }
  if (!dnaModalEscapeBound) {
    document.addEventListener('keydown', handleDnaModalEscape);
    dnaModalEscapeBound = true;
  }
  openModalOverlay(overlay, { initialFocus, focusDelay: 30, scrollLock: true });
}

export async function openManualSnpModal() {
  if (!await loadGeneticsStylesheetForAction()) return false;
  await dnaUiDeps.loadSnpTable?.();
  clearPendingDnaImport();
  const html = `<div class="dna-preview-header dna-manual-header">
      <div>
        <div class="dna-preview-title">Add SNPs manually</div>
        <div class="dna-preview-stats">Paste one SNP or a whole small report table. Same path, no duplicate modes.</div>
      </div>
    </div>
    <div class="dna-preview-body dna-manual-snp-body">
      <div class="dna-manual-card dna-manual-card-bulk">
        <div class="dna-manual-section-head">
          <span>SNP calls</span>
          <small>One per line: rsID + genotype. Notes after that are optional.</small>
        </div>
        <textarea id="manual-snp-bulk" class="dna-manual-textarea" rows="7" spellcheck="false" placeholder="rs1801133 CC&#10;rs8175347 6/7&#10;rs429358 TT APOE report"></textarea>
      </div>
      <label class="dna-manual-field dna-manual-source">Source label
        <input id="manual-snp-source" class="dna-manual-input" type="text" placeholder="Manual entry / lab report name" autocomplete="off">
      </label>
      <p class="dna-manual-help">Use a single line for one SNP, or paste a dozen lines. getbased validates each rsID, normalizes strand-aware genotypes, and merges accepted rows into existing genome data.</p>
    </div>
    <div class="dna-preview-actions">
      <button type="button" class="import-btn import-btn-secondary" ${dnaActionAttrs('close-preview')}>Cancel</button>
      <button type="button" class="import-btn import-btn-primary" ${dnaActionAttrs('save-manual-snp')}>Save SNPs</button>
    </div>`;
  let overlay = document.getElementById('dna-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dna-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal dna-preview-modal dna-manual-modal" role="dialog" aria-label="Add SNPs manually">${html}</div>`;
  openDnaModalOverlay(overlay, '#manual-snp-bulk');
  return true;
}

export function showDNAImportPreview(result) {
  setPendingDnaImport(result);

  const apoe = dnaUiDeps.resolveAPOE?.(result.matches);
  const rawMatchedCount = Number(result.rawMatchedCount);
  const preservedOverrideCount = Number(result.preservedOverrideCount) || 0;
  const previewStats = preservedOverrideCount > 0
    ? `${result.totalLines.toLocaleString()} SNPs scanned · ${rawMatchedCount.toLocaleString()} found in file · ${result.coverage.found} available after preserving ${preservedOverrideCount} curated override${preservedOverrideCount === 1 ? '' : 's'}`
    : `${result.totalLines.toLocaleString()} SNPs scanned · ${result.coverage.found} of ${result.coverage.total} health-relevant SNPs found`;
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  const risk = [];
  const protective = [];
  const informational = [];
  const none = [];
  for (const [rsid, match] of Object.entries(result.matches)) {
    if (apoeRsids.has(rsid)) continue;
    const presentation = snpFindingPresentation(match.effect, match.valence);
    const evidenceProfile = resolveSnpEvidenceProfile(match, match);
    const item = {
      rsid,
      ...match,
      presentation,
      evidenceProfile,
    };
    if (presentation.tone === 'risk') risk.push(item);
    else if (presentation.tone === 'protective') protective.push(item);
    else if (presentation.tone === 'trait') informational.push(item);
    else none.push(item);
  }

  const renderPreviewAssessment = match => {
    const profile = match.evidenceProfile;
    return `<div class="dna-preview-assessment">
      <span class="genetics-axis genetics-axis-evidence genetics-axis-${escapeAttr(profile.evidenceLevel)}">Evidence · ${escapeHTML(profile.evidenceShortLabel)}</span>
      <span class="genetics-axis genetics-axis-relevance genetics-axis-${escapeAttr(profile.relevanceLevel)}">Relevance · ${escapeHTML(profile.relevanceShortLabel)}</span>
    </div>`;
  };

  function renderGroup(items, label) {
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

  function renderCollapsedGroup(items, label) {
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

  let overlay = document.getElementById('dna-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dna-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal dna-preview-modal" role="dialog">${html}</div>`;
  openDnaModalOverlay(overlay, '.import-btn-primary');
}

export function closeDNAImportPreview() {
  clearPendingDnaImport();
  dnaUiDeps.setImportRunning?.(false);
  closeModalOverlay('dna-modal-overlay');
  if (dnaModalEscapeBound) {
    document.removeEventListener('keydown', handleDnaModalEscape);
    dnaModalEscapeBound = false;
  }
}
