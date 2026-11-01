import { loadHaplogroupCatalog } from './dna-haplogroup-catalog.js';
import type { HaplogroupDefinition, HaplogroupTable } from './dna-haplogroup-catalog.js';
export type { HaplogroupDefinition, HaplogroupTable } from './dna-haplogroup-catalog.js';
import { classifyHaplogroupCoupling as classifyCoupling, replaceMaternalReport, setReportedHaplogroup, clearReportedHaplogroup } from './genetics-mutations.js';
import { prepareGeneticsWrite, commitGeneticsWrite } from './genetics-record-store.js';
import { geneticsScopeRemoved } from './genetics-lifecycle.js';
export interface MtDnaMutation { position: number; allele: string; raw: string }
export interface PendingMtDnaImport {
  mutations: ReturnType<typeof parseMtDNAMutations>;
  resolved: NonNullable<ReturnType<typeof resolveHaplogroup>>;
  coupling: ReturnType<typeof classifyCoupling>;
  hgData: HaplogroupDefinition | undefined;
  source: string;
  restoresRemovedData?: boolean;
}

// dna-mtdna.js - mtDNA haplogroup parsing, preview, persistence, and manual entry.

import { getErrorMessage } from './caught-error.js';
import { publishGeneticsImport } from './genetics-import-events.js';
import { state } from './state.js';
import { HAPLOGROUP_LIST } from './constants.js';
import { showNotification } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { renderMtDnaImportPreview } from './mtdna-preview-presentation.js';
import {
  cacheDnaHaplogroupTable, captureDnaImportOrigin, captureDnaReviewOrigin, isPendingDnaImportCurrent, isPendingDnaImportOwned,
  clearPendingMtDnaImport, ensureDnaModalOverlay,
  getDnaProfileLatitudeBand,
  getPendingMtDnaImport,
  loadGeneticsStylesheetForAction,
  logDnaDebugError,
  refreshDnaShell,
  setPendingMtDnaImport,
} from './dna-runtime.js';

export function loadHaplogroupTable(): Promise<HaplogroupTable> {
  return loadHaplogroupCatalog().then(data => { cacheDnaHaplogroupTable(data); return data; });
}

export function ensureHaplogroupTable() {
  return state.importedData?.genetics?.mtdna ? loadHaplogroupTable() : Promise.resolve(null);
}

export function parseMtDNAMutations(text: string) {
  const mutations: MtDnaMutation[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Format 1: simple "263G" positive-marker notation (Living DNA export)
    const match = trimmed.match(/^(\d+)([ACGT])$/i);
    if (match) { mutations.push({ position: parseInt(match[1]!), allele: match[2]!.toUpperCase(), raw: match[1] + match[2]!.toUpperCase() }); continue; }
    // Format 2: 23andMe tab-separated "rsid\tMT\tposition\tallele"
    const cols = trimmed.split('\t');
    if (cols.length >= 4 && cols[1] === 'MT') {
      const pos = parseInt(cols[2]!);
      const allele = cols[3]!.trim().toUpperCase();
      if (pos > 0 && /^[ACGT]$/.test(allele)) mutations.push({ position: pos, allele, raw: pos + allele });
    }
  }
  return mutations;
}

export function resolveHaplogroup(mutations: readonly Pick<MtDnaMutation, 'raw'>[], hapTable: Pick<HaplogroupTable, 'haplogroups'>) {
  const mutationSet = new Set(mutations.map(m => m.raw));
  let bestMatch: { haplogroup: string; confidence: number; matchedMutations: number; totalDiagnostic: number } | null = null;
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

export function detectMtDNAMismatch(genetics: { mtdna?: { haplogroup?: string; coupling?: ReturnType<typeof classifyCoupling> } | null } | null | undefined) {
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

export async function handleMtDNAFile(file: Pick<File, 'text' | 'name'>) {
  const origin = captureDnaReviewOrigin();
  if (_mtdnaImportRunning) { showNotification('mtDNA import already in progress', 'info'); return false; }
  if (!await loadGeneticsStylesheetForAction() || !origin.current()) return false;
  _mtdnaImportRunning = true;
  try {
    const text = await file.text();
    const mutations = parseMtDNAMutations(text);
    if (mutations.length === 0) { showNotification('No mtDNA mutations found in this file', 'error'); _mtdnaImportRunning = false; return false; }

    const hapTable = await loadHaplogroupTable();
    if (!origin.current()) { _mtdnaImportRunning = false; return false; }
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
    const restoresRemovedData = geneticsScopeRemoved(origin.data.geneticsLifecycle, 'genome') || geneticsScopeRemoved(origin.data.geneticsLifecycle, 'maternal');
    setPendingMtDnaImport({ mutations, resolved, coupling, hgData, source, restoresRemovedData });
    _showMtDNAPreview(resolved, coupling, mutations, file.name, restoresRemovedData);
    _mtdnaImportRunning = false;
    return true;
  } catch (e) {
    logDnaDebugError('mtDNA import error:', e);
    showNotification(getErrorMessage(e, 'Failed to parse mtDNA file'), 'error');
    _mtdnaImportRunning = false;
    return false;
  }
}

function _showMtDNAPreview(resolved: PendingMtDnaImport['resolved'], coupling: PendingMtDnaImport['coupling'], mutations: readonly MtDnaMutation[], fileName: string, restoresRemovedData = false) {
  const mismatch = coupling ? detectMtDNAMismatch({ mtdna: { haplogroup: resolved.haplogroup, coupling } }) : null;

  const html = renderMtDnaImportPreview(resolved, coupling, mutations, fileName, mismatch, restoresRemovedData);

  const overlay = ensureDnaModalOverlay();
  overlay.innerHTML = html;
  openModalOverlay(overlay);
}

export function closeMtDNAPreview() {
  closeModalOverlay('dna-modal-overlay');
  clearPendingMtDnaImport();
}

export async function confirmMtDNAImport() {
  const pending = getPendingMtDnaImport();
  if (!pending) return;
  const staleReview = () => { closeMtDNAPreview(); showNotification('Genetic data changed. Open the file again to review it before saving.', 'info'); };
  if (!isPendingDnaImportCurrent(pending)) {
    if (isPendingDnaImportOwned(pending)) staleReview(); else clearPendingMtDnaImport();
    return;
  }
  const origin = captureDnaImportOrigin();
  const { base, next: draft } = prepareGeneticsWrite(origin.data);
  const previousData = structuredClone(origin.data);

  replaceMaternalReport(draft, {
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
  }, Date.now(), !!pending.restoresRemovedData);

  let conflict = false;
  const authorized = () => origin.current() && getPendingMtDnaImport() === pending && isPendingDnaImportCurrent(pending);
  if (!await commitGeneticsWrite(origin.profileId, origin.data, base, draft, authorized, () => { conflict = true; })) {
    if (getPendingMtDnaImport() === pending) {
      if (!origin.current()) clearPendingMtDnaImport();
      else if (conflict || !isPendingDnaImportCurrent(pending)) staleReview();
    }
    return;
  }
  if (!origin.current() || getPendingMtDnaImport() !== pending) {
    if (getPendingMtDnaImport() === pending) clearPendingMtDnaImport();
    return;
  }
  publishGeneticsImport({ profileId: origin.profileId, ownerData: origin.data, previousData, data: state.importedData, source: pending.source, kind: 'mtdna' });
  closeMtDNAPreview();
  showNotification(`Haplogroup ${pending.resolved.haplogroup} imported`, 'success');
  refreshDnaShell('dashboard');
}

export async function deleteMtDNAData() {
  const origin = captureDnaImportOrigin();
  if (!origin.data.genetics?.mtdna) return;
  const { base, next } = prepareGeneticsWrite(origin.data);
  clearReportedHaplogroup(next);
  if (!await commitGeneticsWrite(origin.profileId, origin.data, base, next, origin.current) || !origin.current()) return;
  refreshDnaShell('dashboard');
  showNotification('mtDNA haplogroup removed', 'info');
}

export { HAPLOGROUP_LIST };

export async function setManualHaplogroup(haplogroup: unknown) {
  if (!haplogroup) return;
  const origin = captureDnaImportOrigin();
  const input = String(haplogroup).trim();
  const hg = HAPLOGROUP_LIST.find(candidate => candidate.toUpperCase() === input.toUpperCase());
  if (!hg) {
    showNotification(`Unknown haplogroup "${input}" - expected one of: ${HAPLOGROUP_LIST.join(', ')}`, 'error');
    return;
  }
  const table = await loadHaplogroupTable();
  if (!origin.current()) return;
  const { base, next } = prepareGeneticsWrite(origin.data);
  setReportedHaplogroup(next, hg, table);
  if (!await commitGeneticsWrite(origin.profileId, origin.data, base, next, origin.current) || !origin.current()) return;
  const coupling = next.genetics?.mtdna?.coupling;
  showNotification(`Haplogroup ${hg} saved${coupling ? ' - ' + coupling.shortLabel : ''}`, 'success');
  refreshDnaShell('dashboard');
}
