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

  const primaryImpactFor = (effect, valence) => {
    if (valence === 'protective') return true;
    if (valence === 'neutral') return false;
    return effect === 'significant' || effect === 'moderate' || effect === 'mild';
  };

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
    const target = primaryImpactFor(info.effect, info.valence) ? byCat : otherByCat;
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
    });
  }

  const effectRank = { significant: 0, moderate: 1, mild: 2 };
  const heaviest = findings => Math.min(...findings.map(finding => effectRank[finding.effect] ?? 3));
  const catOrder = Object.entries(byCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const totalFindings = catOrder.reduce((count, [, findings]) => count + findings.length, 0);
  const otherCatOrder = Object.entries(otherByCat).sort(([, a], [, b]) => heaviest(a) - heaviest(b));
  const otherFindings = otherCatOrder.reduce((count, [, findings]) => count + findings.length, 0);

  const dotFor = (effect, valence) => {
    if (valence === 'protective') return '\uD83D\uDFE2';
    if (valence === 'neutral') return '\u26AA';
    if (effect === 'none') return '\u26AA';
    if (effect === 'significant') return '\uD83D\uDD34';
    if (effect === 'moderate') return '\uD83D\uDFE0';
    if (effect === 'mild') return '\uD83D\uDFE1';
    return '';
  };
  const impactFor = (effect, valence) => {
    if (valence === 'protective') return { label: 'beneficial', tone: 'beneficial', rank: 3 };
    if (valence === 'neutral') return { label: 'neutral', tone: 'informational', rank: 4 };
    if (effect === 'significant') return { label: 'significant', tone: 'significant', rank: 0 };
    if (effect === 'moderate') return { label: 'moderate', tone: 'moderate', rank: 1 };
    if (effect === 'mild') return { label: 'mild', tone: 'mild', rank: 2 };
    if (effect === 'none') return { label: 'normal', tone: 'normal', rank: 5 };
    return { label: 'unclassified', tone: 'informational', rank: 6 };
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

  const overviewCards = [
    {
      label: 'Imported SNPs',
      value: hasSnps ? snpCount.toLocaleString() : '0',
      sub: genetics.source || 'Autosomal raw data',
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
    if (mismatch && mismatch.mismatch) {
      html += `<div class="genetics-mtdna-mismatch mismatch-${mismatch.severity}">${escapeHTML(mismatch.message)}</div>`;
    } else if (mismatch && !mismatch.mismatch) {
      html += `<div class="genetics-mtdna-match">${escapeHTML(mismatch.message)}</div>`;
    }
    html += `<div class="genetics-mtdna-refs">Wallace 2015 (<a href="https://pubmed.ncbi.nlm.nih.gov/26406369/" target="_blank" rel="noopener">PMID: 26406369</a>)
      \u00B7 <button type="button" ${dnaActionAttrs('delete-mtdna')}>remove</button></div>`;
    html += `</div>`;
  }

  if (apoe) {
    html += `<div class="genetics-apoe">APOE: <strong>${escapeHTML(apoe)}</strong></div>`;
  }

  if (totalFindings > 0) {
    let shown = 0;
    const INITIAL_LIMIT = 8;
    html += `<div class="genetics-findings">`;
    html += `<div class="genetics-legend" title="What the dots mean" aria-label="Genetics significance legend">
      <span class="genetics-legend-item genetics-legend-significant"><span class="genetics-legend-dot">🔴</span> significant risk</span>
      <span class="genetics-legend-item genetics-legend-moderate"><span class="genetics-legend-dot">🟠</span> moderate risk</span>
      <span class="genetics-legend-item genetics-legend-mild"><span class="genetics-legend-dot">🟡</span> mild risk</span>
      <span class="genetics-legend-item genetics-legend-beneficial"><span class="genetics-legend-dot">🟢</span> beneficial</span>
      <span class="genetics-legend-item genetics-legend-informational"><span class="genetics-legend-dot">⚪</span> neutral</span>
    </div>`;
    for (const [cat, findings] of catOrder) {
      findings.sort((a, b) => impactFor(a.effect, a.valence).rank - impactFor(b.effect, b.valence).rank);
      const catLabel = catLabels[cat] || cat;
      const startHidden = shown >= INITIAL_LIMIT;
      html += `<div class="genetics-cat-group${startHidden ? ' genetics-extra' : ''}">`;
      html += `<div class="genetics-cat-label">${escapeHTML(catLabel)}</div>`;
      for (const finding of findings) {
        const isExtra = shown >= INITIAL_LIMIT;
        const impact = impactFor(finding.effect, finding.valence);
        const primaryRef = (finding.references || []).find(ref => /^https?:\/\//i.test(String(ref || '')));
        const refLink = primaryRef
          ? ` <a href="${escapeAttr(primaryRef)}" target="_blank" rel="noopener" class="detail-genetics-ref" title="Primary study (PubMed)">primary study</a>`
          : '';
        const snpediaId = `${finding.rsid.charAt(0).toUpperCase()}${finding.rsid.slice(1)}`;
        const snpediaLink = ` <a href="https://www.snpedia.com/index.php/${escapeAttr(encodeURIComponent(snpediaId))}" target="_blank" rel="noopener" class="detail-genetics-ref" title="All studies (SNPedia)">more studies</a>`;
        const rowClasses = ['genetics-finding-row', `genetics-finding-${impact.tone}`];
        if (isExtra && !startHidden) rowClasses.push('genetics-extra');
        html += `<div class="${rowClasses.join(' ')}">
          <span class="genetics-finding-dot">${dotFor(finding.effect, finding.valence)}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(finding.gene || finding.rsid)} ${escapeHTML(finding.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(finding.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.label)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(finding.genotype)}</span>
          <span class="genetics-finding-note">${escapeHTML(finding.note || 'Observed in your imported genotype.')}${refLink}${snpediaLink}</span>
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
      findings.sort((a, b) => impactFor(a.effect, a.valence).rank - impactFor(b.effect, b.valence).rank);
      const catLabel = catLabels[cat] || cat;
      html += `<div class="genetics-cat-group genetics-cat-group-secondary">
        <div class="genetics-cat-label">${escapeHTML(catLabel)}</div>`;
      for (const finding of findings) {
        const impact = impactFor(finding.effect, finding.valence);
        html += `<div class="genetics-finding-row genetics-finding-${impact.tone}">
          <span class="genetics-finding-dot">${dotFor(finding.effect, finding.valence)}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(finding.gene || finding.rsid)} ${escapeHTML(finding.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(finding.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.label)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(finding.genotype)}</span>
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
        <textarea id="manual-snp-bulk" class="dna-manual-textarea" rows="7" spellcheck="false" placeholder="rs1801133 CC&#10;rs1801131 AC&#10;rs429358 TT APOE report"></textarea>
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
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  const significant = [];
  const moderate = [];
  const mild = [];
  const beneficial = [];
  const none = [];
  for (const [rsid, match] of Object.entries(result.matches)) {
    if (apoeRsids.has(rsid)) continue;
    const item = {
      rsid,
      ...match,
      impact: match.valence === 'protective' ? 'beneficial' : match.effect,
    };
    if (item.impact === 'beneficial') beneficial.push(item);
    else if (match.effect === 'significant') significant.push(item);
    else if (match.effect === 'moderate') moderate.push(item);
    else if (match.effect === 'mild') mild.push(item);
    else none.push(item);
  }

  const effectIcon = {
    significant: '\uD83D\uDD34',
    moderate: '\uD83D\uDFE0',
    mild: '\uD83D\uDFE1',
    beneficial: '\uD83D\uDFE2',
    none: '\u26AA',
  };

  function renderGroup(items, label) {
    if (items.length === 0) return '';
    return `<div class="dna-preview-group">
      <div class="dna-preview-group-title">${label} (${items.length})</div>
      ${items.map(match => `<div class="dna-preview-row">
        <span class="dna-preview-icon">${effectIcon[match.impact || match.effect] || '\u2753'}</span>
        <span class="dna-preview-gene">${escapeHTML(match.gene)} <span class="dna-preview-variant">${escapeHTML(match.variant)}</span> <span class="dna-preview-category">${escapeHTML(dnaUiDeps.getSnpCategoryLabel(match.category))}</span></span>
        <span class="dna-preview-genotype">${escapeHTML(match.genotype)}</span>
      </div>
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
          <span class="dna-preview-icon">${effectIcon[match.impact || match.effect] || '\u2753'}</span>
          <span class="dna-preview-gene">${escapeHTML(match.gene)} <span class="dna-preview-variant">${escapeHTML(match.variant)}</span> <span class="dna-preview-category">${escapeHTML(dnaUiDeps.getSnpCategoryLabel(match.category))}</span></span>
          <span class="dna-preview-genotype">${escapeHTML(match.genotype)}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  const html = `
    <div class="dna-preview-header">
      <div class="dna-preview-title">DNA Import \u2014 ${escapeHTML(result.source)}</div>
      <div class="dna-preview-stats">${result.totalLines.toLocaleString()} SNPs scanned \u00B7 ${result.coverage.found} of ${result.coverage.total} health-relevant SNPs found</div>
      ${apoe ? `<div class="dna-preview-apoe">APOE Haplotype: <strong>${escapeHTML(apoe)}</strong></div>` : ''}
    </div>
    <div class="dna-preview-body">
      ${renderGroup(significant, '\uD83D\uDD34 Significant findings')}
      ${renderGroup(moderate, '\uD83D\uDFE0 Moderate findings')}
      ${renderGroup(mild, '\uD83D\uDFE1 Mild findings')}
      ${renderGroup(beneficial, '\uD83D\uDFE2 Beneficial findings')}
      ${renderCollapsedGroup(none, '\u26AA Other imported SNPs')}
    </div>
    <div class="dna-preview-disclaimer">
      Processed locally \u2014 your DNA file was never transmitted. Only matched SNPs are stored.
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
