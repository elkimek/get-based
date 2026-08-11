// @ts-check
// dna-mtdna.js - mtDNA haplogroup parsing, preview, persistence, and manual entry.

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { HAPLOGROUP_LIST } from './constants.js';
import { escapeHTML, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { dnaActionAttrs } from './dna-actions.js';
import {
  cacheDnaHaplogroupTable,
  clearPendingMtDnaImport,
  getDnaProfileLatitudeBand,
  getPendingMtDnaImport,
  loadGeneticsStylesheetForAction,
  logDnaDebugError,
  refreshDnaShell,
  setPendingMtDnaImport,
} from './dna-runtime.js';

let _haplogroupTable = null;
let _haplogroupTablePromise = null;

export function loadHaplogroupTable() {
  if (_haplogroupTable) return Promise.resolve(_haplogroupTable);
  if (!_haplogroupTablePromise) {
    _haplogroupTablePromise = fetch('data/haplogroups.json')
      .then(r => r.json())
      .then(data => { _haplogroupTable = data; cacheDnaHaplogroupTable(data); return data; })
      .catch(err => { _haplogroupTablePromise = null; console.error('Failed to load haplogroup table:', err); throw err; });
  }
  return _haplogroupTablePromise;
}

export function ensureHaplogroupTable() {
  return state.importedData?.genetics?.mtdna ? loadHaplogroupTable() : Promise.resolve(null);
}

export function parseMtDNAMutations(text) {
  const mutations = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Format 1: simple "263G" positive-marker notation (Living DNA export)
    const match = trimmed.match(/^(\d+)([ACGT])$/i);
    if (match) { mutations.push({ position: parseInt(match[1]), allele: match[2].toUpperCase(), raw: match[1] + match[2].toUpperCase() }); continue; }
    // Format 2: 23andMe tab-separated "rsid\tMT\tposition\tallele"
    const cols = trimmed.split('\t');
    if (cols.length >= 4 && cols[1] === 'MT') {
      const pos = parseInt(cols[2]);
      const allele = cols[3].trim().toUpperCase();
      if (pos > 0 && /^[ACGT]$/.test(allele)) mutations.push({ position: pos, allele, raw: pos + allele });
    }
  }
  return mutations;
}

export function resolveHaplogroup(mutations, hapTable) {
  const mutationSet = new Set(mutations.map(m => m.raw));
  let bestMatch = null;
  let bestScore = 0;
  let bestMatchedCount = 0;

  for (const [hg, data] of Object.entries(hapTable.haplogroups)) {
    const diag = data.mutations;
    const matched = diag.filter(m => mutationSet.has(m));
    const score = matched.length / diag.length;
    // Tiebreaker: when scores are equal, prefer the haplogroup with more
    // matched mutations. Sub-clades store parent+derived markers together
    // (cumulative inheritance), so a true H1 carrier matches 3/3 on H1 and
    // 2/2 on H - both score 1.0, but H1 has the larger matched count.
    const better = score > bestScore || (score === bestScore && matched.length > bestMatchedCount);
    if (better && matched.length >= 2 && score >= 0.6) {
      bestScore = score;
      bestMatchedCount = matched.length;
      bestMatch = { haplogroup: hg, confidence: score, matchedMutations: matched.length, totalDiagnostic: diag.length };
    }
  }

  // Fallback: if no match, check for H (defined by ABSENCE of non-H markers)
  if (!bestMatch) {
    const nonHMarkers = ['7028T', '2706G', '10400T', '10398G', '489C'];
    const hasNonH = nonHMarkers.some(m => mutationSet.has(m));
    const hasUniversal = ['263G', '750G', '1438G', '4769G', '8860G', '15326G'].filter(m => mutationSet.has(m));
    if (!hasNonH && hasUniversal.length >= 3) {
      bestMatch = { haplogroup: 'H', confidence: 0.7, matchedMutations: hasUniversal.length, totalDiagnostic: 6 };
    }
  }

  return bestMatch;
}

function classifyCoupling(haplogroup, hapTable) {
  const hgData = hapTable.haplogroups[haplogroup];
  if (!hgData) return null;
  const couplingKey = hgData.coupling;
  const couplingData = hapTable.couplingLevels[couplingKey];
  if (!couplingData) return null;
  return {
    level: couplingKey,
    label: couplingData.label,
    shortLabel: couplingData.shortLabel,
    climate: hgData.climate,
    description: couplingData.description,
    implications: couplingData.implications,
    matchedLatBands: couplingData.latitudeBands
  };
}

export function detectMtDNAMismatch(genetics) {
  if (!genetics?.mtdna?.coupling) return null;
  const coupling = genetics.mtdna.coupling;

  // Get latitude band from profile
  const bandStr = getDnaProfileLatitudeBand();
  if (!bandStr) return null;

  const BANDS = ['<25\u00b0 latitude (tropical)', '25-40\u00b0 (subtropical)', '40-50\u00b0 (temperate)', '50-60\u00b0 (northern)', '>60\u00b0 (subarctic)'];
  const bandIndex = BANDS.indexOf(bandStr);
  if (bandIndex === -1) return null;

  const bandNames = ['tropical', 'subtropical', 'temperate', 'northern', 'subarctic'];
  if (coupling.matchedLatBands.includes(bandIndex)) {
    return { mismatch: false, message: `In the Wallace lens, mtDNA haplogroup ${genetics.mtdna.haplogroup} (${coupling.shortLabel}) aligns with your ${bandNames[bandIndex]} latitude.` };
  }

  const minBand = Math.min(...coupling.matchedLatBands);
  const maxBand = Math.max(...coupling.matchedLatBands);
  const distance = bandIndex < minBand ? minBand - bandIndex : bandIndex - maxBand;
  const severity = distance >= 2 ? 'significant' : 'moderate';

  return {
    mismatch: true,
    severity,
    message: `The Wallace lens places mtDNA haplogroup ${genetics.mtdna.haplogroup} (${coupling.shortLabel}) with ${coupling.climate.toLowerCase()} climates, while your current latitude is ${bandNames[bandIndex]}.`,
    implications: coupling.implications
  };
}

let _mtdnaImportRunning = false;

export async function handleMtDNAFile(file) {
  if (_mtdnaImportRunning) { showNotification('mtDNA import already in progress', 'info'); return false; }
  if (!await loadGeneticsStylesheetForAction()) return false;
  _mtdnaImportRunning = true;
  try {
    const text = await file.text();
    const mutations = parseMtDNAMutations(text);
    if (mutations.length === 0) { showNotification('No mtDNA mutations found in this file', 'error'); _mtdnaImportRunning = false; return false; }

    const hapTable = await loadHaplogroupTable();
    const resolved = resolveHaplogroup(mutations, hapTable);
    if (!resolved) { showNotification('Could not determine haplogroup - try a more complete mtDNA export', 'error'); _mtdnaImportRunning = false; return false; }

    const coupling = classifyCoupling(resolved.haplogroup, hapTable);
    const hgData = hapTable.haplogroups[resolved.haplogroup];
    const lowerName = file.name.toLowerCase();
    const source = lowerName.includes('livingdna') || lowerName.includes('living_dna')
      ? 'mtDNA (Living DNA)'
      : lowerName.includes('23andme') || lowerName.includes('genome')
        ? 'mtDNA (23andMe)'
        : 'mtDNA marker list';
    setPendingMtDnaImport({ mutations, resolved, coupling, hgData, source });
    _showMtDNAPreview(resolved, coupling, mutations, file.name);
    _mtdnaImportRunning = false;
    return true;
  } catch (e) {
    logDnaDebugError('mtDNA import error:', e);
    showNotification(getErrorMessage(e, 'Failed to parse mtDNA file'), 'error');
    _mtdnaImportRunning = false;
    return false;
  }
}

function _showMtDNAPreview(resolved, coupling, mutations, fileName) {
  const mismatch = coupling ? detectMtDNAMismatch({ mtdna: { haplogroup: resolved.haplogroup, coupling } }) : null;

  let html = `<div class="dna-preview-header">
    <div class="dna-preview-title">mtDNA Import</div>
    <div class="dna-preview-stats">${mutations.length} mtDNA markers read from ${escapeHTML(fileName)}</div>
  </div>
  <div class="dna-preview-body">
    <div class="mtdna-preview-haplogroup">
      <div class="mtdna-hg-label">Haplogroup</div>
      <div class="mtdna-hg-value">${escapeHTML(resolved.haplogroup)}</div>
      <div class="mtdna-hg-confidence">${resolved.matchedMutations}/${resolved.totalDiagnostic} diagnostic markers matched</div>
    </div>`;
  if (coupling) {
    html += `<div class="mtdna-preview-coupling">
      <div class="mtdna-coupling-label">${escapeHTML(coupling.label)}</div>
      <div class="mtdna-coupling-climate">${escapeHTML(coupling.climate)}</div>
      <div class="mtdna-coupling-desc">${escapeHTML(coupling.description)}</div>
    </div>`;
  }
  if (mismatch && mismatch.mismatch) {
    html += `<div class="mtdna-preview-mismatch mtdna-mismatch-${mismatch.severity}">
      <strong>Environment mismatch:</strong> ${escapeHTML(mismatch.message)}
      ${mismatch.implications ? `<div class="mtdna-mismatch-implications">${escapeHTML(mismatch.implications)}</div>` : ''}
    </div>`;
  } else if (mismatch && !mismatch.mismatch) {
    html += `<div class="mtdna-preview-match">${escapeHTML(mismatch.message)}</div>`;
  }
  html += `</div>
  <div class="dna-preview-disclaimer">Processed locally. Coupling classification follows the Wallace mitochondrial paradigm - a research framework, not an established clinical standard.</div>
  <div class="dna-preview-actions">
    <button class="import-btn import-btn-secondary" ${dnaActionAttrs('close-mtdna-preview')}>Cancel</button>
    <button class="import-btn import-btn-primary" ${dnaActionAttrs('confirm-mtdna-import')}>Import Haplogroup ${escapeHTML(resolved.haplogroup)}</button>
  </div>`;

  let overlay = document.getElementById('dna-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dna-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal dna-preview-modal" role="dialog">${html}</div>`;
  openModalOverlay(overlay);
}

export function closeMtDNAPreview() {
  closeModalOverlay('dna-modal-overlay');
  clearPendingMtDnaImport();
}

export async function confirmMtDNAImport() {
  const pending = getPendingMtDnaImport();
  if (!pending) return;

  if (!state.importedData.genetics) {
    state.importedData.genetics = { source: null, importDate: null, coverage: { found: 0, total: 0 }, effects: {}, snps: {} };
  }
  state.importedData.genetics.mtdna = {
    haplogroup: pending.resolved.haplogroup,
    confidence: pending.resolved.confidence,
    matchedMutations: pending.resolved.matchedMutations,
    totalDiagnostic: pending.resolved.totalDiagnostic,
    origin: pending.hgData?.origin || null,
    details: pending.hgData?.etc || null,
    coupling: pending.coupling ? {
      level: pending.coupling.level,
      label: pending.coupling.label,
      shortLabel: pending.coupling.shortLabel,
      climate: pending.coupling.climate,
      description: pending.coupling.description,
      implications: pending.coupling.implications,
      matchedLatBands: pending.coupling.matchedLatBands
    } : null,
    mutations: pending.mutations.map(m => m.raw),
    source: pending.source,
    importDate: new Date().toISOString().slice(0, 10)
  };

  if (!await saveImportedData()) return;
  closeMtDNAPreview();
  showNotification(`Haplogroup ${pending.resolved.haplogroup} imported`, 'success');
  refreshDnaShell('dashboard');
}

export async function deleteMtDNAData() {
  if (state.importedData.genetics) {
    delete state.importedData.genetics.mtdna;
    if (!await saveImportedData()) return;
    refreshDnaShell('dashboard');
    showNotification('mtDNA haplogroup removed', 'info');
  }
}

export { HAPLOGROUP_LIST };

export async function setManualHaplogroup(haplogroup) {
  if (!haplogroup) return;
  const input = String(haplogroup).trim();
  const hg = HAPLOGROUP_LIST.find(candidate => candidate.toUpperCase() === input.toUpperCase());
  if (!hg) {
    showNotification(`Unknown haplogroup "${input}" - expected one of: ${HAPLOGROUP_LIST.join(', ')}`, 'error');
    return;
  }
  const hapTable = await loadHaplogroupTable();
  const coupling = classifyCoupling(hg, hapTable);
  if (!state.importedData.genetics) {
    state.importedData.genetics = { source: null, importDate: null, coverage: { found: 0, total: 0 }, effects: {}, snps: {} };
  }
  state.importedData.genetics.mtdna = {
    haplogroup: hg,
    confidence: 1,
    origin: hapTable.haplogroups[hg]?.origin || null,
    details: hapTable.haplogroups[hg]?.etc || null,
    coupling: coupling ? {
      level: coupling.level,
      label: coupling.label,
      shortLabel: coupling.shortLabel,
      climate: coupling.climate,
      description: coupling.description,
      implications: coupling.implications,
      matchedLatBands: coupling.matchedLatBands
    } : null,
    mutations: [],
    source: 'manual',
    importDate: new Date().toISOString().slice(0, 10)
  };
  if (!await saveImportedData()) return;
  showNotification(`Haplogroup ${hg} saved${coupling ? ' - ' + coupling.shortLabel : ''}`, 'success');
  refreshDnaShell('dashboard');
}
