// @ts-check
// dna.js — DNA storage, context assembly, and UI orchestration
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { escapeHTML, hashString, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { initDnaActionDelegates } from './dna-actions.js';
import { configureDnaModuleBridge } from './dna-runtime-bridge.js';
import {
  closeDNAImportPreview,
  configureDnaUi,
  openManualSnpModal,
  reimportDNA,
  renderGeneticsSection,
  showDNAImportPreview,
  toggleGeneticsCollapse,
  toggleGeneticsExpand,
} from './dna-ui.js';
import { findGenotypeInfo as findGenotypeInfoImpl, findGenotypeMatch, findSnpHint as findSnpHintImpl, normalizeGenotype, sortAlleles } from './dna-genotype.js';
import {
  detectDNAFile,
  isDNAFile,
  isDNAFileByContent,
  parseClinicalSnpReportTextWithTable,
  parseDNAFileWithTable,
} from './dna-parser.js';
import {
  cacheDnaSnpTable, clearPendingDnaImport,
  confirmDnaDeleteDialog, getPendingDnaImport,
  isDnaLabImportRunning, logDnaDebugError, logDnaDebugWarn,
  loadGeneticsStylesheetForAction,
  navigateDnaRoute, openDnaChatPrompt, refreshDnaShell,
  refreshDnaSidebar,
  triggerDnaFilePicker, updateDnaChatNudge,
} from './dna-runtime.js';
import {
  HAPLOGROUP_LIST,
  closeMtDNAPreview,
  confirmMtDNAImport,
  deleteMtDNAData,
  detectMtDNAMismatch,
  ensureHaplogroupTable,
  handleMtDNAFile,
  loadHaplogroupTable,
  parseMtDNAMutations,
  resolveHaplogroup,
  setManualHaplogroup,
} from './dna-mtdna.js';
import {
  buildSnpAIInterpretationPrompt,
  dnaStudyReferenceLabel,
  mtdnaEvidenceIssueUrl,
  newSnpSuggestionIssueUrl,
  resolveSnpEvidenceProfile,
  snpEvidenceIssueUrl,
  snpFindingPresentation,
  snpFindingRank,
} from './dna-evidence.js';
export { detectDNAFile, isDNAFile, isDNAFileByContent };
export {
  closeDNAImportPreview,
  openManualSnpModal,
  reimportDNA,
  renderGeneticsSection,
  toggleGeneticsCollapse,
  toggleGeneticsExpand,
};
// ═══════════════════════════════════════════════
// PARSE DNA FILE
// ═══════════════════════════════════════════════
let _snpTable = null;
let _snpTablePromise = null;
export const SNP_CATEGORY_LABELS = {
  methylation: 'Methylation',
  iron: 'Iron',
  lipids: 'Lipids',
  vitaminD: 'Vitamin D',
  vitaminB12: 'Vitamin B12',
  bilirubin: 'Bilirubin',
  thyroid: 'Thyroid',
  fattyAcids: 'Fatty Acids',
  bloodSugar: 'Blood Sugar',
  sexHormones: 'Sex Hormones',
  alcohol: 'Alcohol',
  caffeine: 'Caffeine',
  bodyComposition: 'Body Composition',
  neurotransmitters: 'Neurotransmitter Metabolism',
  performance: 'Exercise Traits',
  digestion: 'Digestion',
  vitaminA: 'Vitamin A',
  skin: 'Skin & Sun',
  other: 'Other'
};

export function getSnpCategoryLabel(category) {
  if (!category) return SNP_CATEGORY_LABELS.other;
  return SNP_CATEGORY_LABELS[category] || String(category);
}

function loadSNPTable({ forceFresh = false } = {}) {
  // Page-lifetime cache short-circuit. Bypass with forceFresh=true so a
  // re-import after a catalog version bump always sees the latest entries
  // — without the bypass, the parser walks an old allowlist and silently
  // drops any rsIDs that were added to the catalog since the page loaded.
  if (_snpTable && !forceFresh) return Promise.resolve(_snpTable);
  if (forceFresh) {
    _snpTable = null;
    _snpTablePromise = null;
  }
  if (!_snpTablePromise) {
    _snpTablePromise = fetch('data/snp-health.json', forceFresh ? { cache: 'no-store' } : undefined)
      .then(r => r.json())
      .then(data => { _snpTable = data; cacheDnaSnpTable(data); return data; })
      .catch(err => { _snpTablePromise = null; logDnaDebugError('Failed to load SNP table:', err); throw err; });
  }
  return _snpTablePromise;
}

export function parseClinicalSnpReportText(text, options = {}) {
  return parseClinicalSnpReportTextWithTable(text, _snpTable, options);
}

// Eagerly load SNP table when genetics data exists (e.g. after JSON import)
export function ensureSNPTable() {
  return state.importedData?.genetics ? loadSNPTable() : Promise.resolve(null);
}

// Catalog signature: { size, hash } over every sorted rsID and its complete
// catalog annotation. Stamped on
// genetics at import time and re-computed at render time so the genetics
// card can flag "catalog grew since your import — re-import to include
// new SNPs". Hash catches swap/replace cases that a raw size compare misses.
function _catalogSignature(snpTable) {
  if (!snpTable) return null;
  const rsids = Object.keys(snpTable).filter(k => k.startsWith('rs')).sort();
  const canonicalize = value => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    }
    return value;
  };
  const catalogContent = rsids.map(rsid => [rsid, canonicalize(snpTable[rsid])]);
  return { size: rsids.length, hash: hashString(JSON.stringify(catalogContent)) };
}

// Returns { matches: { rsid: { genotype, gene, variant, effect, note } }, source, totalLines, coverage }
export async function parseDNAFile(file) {
  // Force-fresh on every parse so a re-import after the catalog grew
  // (e.g. new SNP added to data/snp-health.json since this page loaded)
  // always sees the latest allowlist. The cache hit is fine for everything
  // else (rendering, re-rendering, dashboard tooltips); the import path
  // is the one place a stale cache silently drops valid SNPs.
  const snpTable = await loadSNPTable({ forceFresh: true });
  return parseDNAFileWithTable(file, snpTable);
}

// Single source of truth for "given a raw genotype call, what catalog entry
// does it correspond to". Exported so recommendations.js and any future
// consumer share the same lookup semantics.
export function findGenotypeInfo(entry, genotype) {
  return findGenotypeInfoImpl(entry, genotype);
}

// Same strand-aware lookup, for entry.snpHints. Keyed identically to
// entry.genotypes, so the palindromic guard derived from the genotype set
// is correct here too.
export function findSnpHint(entry, genotype) {
  return findSnpHintImpl(entry, genotype);
}

// ═══════════════════════════════════════════════
// APOE HAPLOTYPE RESOLUTION
// ═══════════════════════════════════════════════

// APOE is determined by two SNPs: rs429358 and rs7412
// rs429358 T→C = ε4 allele, rs7412 C→T = ε2 allele
// APOE haplotype from unphased genotypes — genotype-combination lookup
// Raw DNA files are UNPHASED (alleles aren't assigned to chromosomes),
// so we use the diploid genotype pair, not per-allele pairing.
// ε2: rs429358=T, rs7412=T | ε3: rs429358=T, rs7412=C | ε4: rs429358=C, rs7412=C
function resolveAPOE(matches) {
  const g429 = matches.rs429358?.genotype;
  const g7412 = matches.rs7412?.genotype;
  if (!g429 || !g7412 || g429.length !== 2 || g7412.length !== 2) return null;
  const key = `${sortAlleles(g429)}|${sortAlleles(g7412)}`;
  const table = {
    'TT|CC': '\u03B53/\u03B53', 'CT|CC': '\u03B53/\u03B54', 'CC|CC': '\u03B54/\u03B54',
    'TT|CT': '\u03B52/\u03B53', 'CT|CT': '\u03B52/\u03B54', 'TT|TT': '\u03B52/\u03B52',
  };
  return table[key] || null;
}

// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════

function recalculateGeneticsSummary(genetics) {
  if (!genetics) return;
  const apoe = resolveAPOE(genetics.snps || {});
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  let significant = 0, moderate = 0, mild = 0, normal = 0;
  for (const [rsid, data] of Object.entries(genetics.snps || {})) {
    if (apoeRsids.has(rsid)) continue;
    if (data.effect === 'significant') significant++;
    else if (data.effect === 'moderate') moderate++;
    else if (data.effect === 'mild') mild++;
    else if (data.effect === 'none') normal++;
  }
  genetics.effects = { significant, moderate, mild, normal };
  genetics.coverage = { found: Object.keys(genetics.snps || {}).length, total: Object.keys(_snpTable || {}).filter(k => k.startsWith('rs')).length };
  if (apoe) genetics.apoe = apoe;
  else delete genetics.apoe;
}

export function upsertGeneticsSnp(profileData, rsidInput, genotypeInput, source = {}) {
  const previousGenetics = profileData.genetics || null;
  const hadStoredSnps = Object.keys(previousGenetics?.snps || {}).length > 0;
  const previousCatalogVersion = previousGenetics?.catalogVersion;
  const rsid = String(rsidInput || '').trim().toLowerCase();
  const genotype = normalizeGenotype(genotypeInput);
  if (!/^rs\d+$/.test(rsid)) return { ok: false, error: 'Enter a valid rsID, e.g. rs1801133.' };
  if (!genotype) return { ok: false, error: 'Enter an allele genotype such as CT, or a supported repeat such as 6/7.' };
  const entry = _snpTable?.[rsid];
  if (!entry) return { ok: false, error: 'This SNP is not in the getbased health SNP catalog yet.' };
  const match = findGenotypeMatch(entry, genotype);
  if (!match) return { ok: false, error: 'That genotype does not match this SNP catalog entry.' };
  if (!profileData.genetics) {
    profileData.genetics = { source: 'Manual SNPs', importDate: new Date().toISOString().slice(0, 10), coverage: { found: 0, total: 0 }, effects: {}, snps: {}, catalogVersion: _catalogSignature(_snpTable) };
  }
  if (!profileData.genetics.snps) profileData.genetics.snps = {};
  const sourceMeta = {
    type: source.type || 'manual',
    label: source.label || source.fileName || 'Manual entry',
    fileName: source.fileName || null,
    rawText: source.rawText || null,
    addedAt: source.addedAt || new Date().toISOString(),
  };
  profileData.genetics.snps[rsid] = {
    genotype,
    normalizedGenotype: match.key,
    gene: entry.gene,
    variant: entry.variant,
    category: entry.category || null,
    markers: entry.markers || [],
    effect: match.info.effect,
    valence: match.info.valence,
    evidence: entry.evidence,
    relevance: entry.relevance,
    note: match.info.note,
    source: sourceMeta,
  };
  if (!hadStoredSnps || !profileData.genetics.source) {
    profileData.genetics.source = sourceMeta.label || profileData.genetics.source || 'Manual SNPs';
  }
  profileData.genetics.importDate = new Date().toISOString().slice(0, 10);
  // A manual/report addition does not mean the user's existing raw file was
  // reprocessed against the newest catalog. Preserve its prior signature so
  // a genuine catalog-staleness prompt is not accidentally cleared.
  if (!hadStoredSnps) profileData.genetics.catalogVersion = _catalogSignature(_snpTable);
  else if (previousCatalogVersion) profileData.genetics.catalogVersion = previousCatalogVersion;
  else delete profileData.genetics.catalogVersion;
  recalculateGeneticsSummary(profileData.genetics);
  return { ok: true, rsid, snp: profileData.genetics.snps[rsid] };
}

export function saveGeneticsData(profileData, parseResult) {
  const previous = profileData.genetics || null;
  const preservedMtDna = previous?.mtdna ? JSON.parse(JSON.stringify(previous.mtdna)) : null;
  const preservedAddedSnps = Object.fromEntries(
    Object.entries(previous?.snps || {}).filter(([, snp]) => snp?.source && typeof snp.source === 'object')
  );
  // Count effects for quick display (avoids needing SNP table at render time)
  const apoe = resolveAPOE(parseResult.matches);
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  let significant = 0, moderate = 0, mild = 0, normal = 0;
  for (const [rsid, data] of Object.entries(parseResult.matches)) {
    if (apoeRsids.has(rsid)) continue;
    if (data.effect === 'significant') significant++;
    else if (data.effect === 'moderate') moderate++;
    else if (data.effect === 'mild') mild++;
    else if (data.effect === 'none') normal++;
  }
  profileData.genetics = {
    source: parseResult.source,
    importDate: new Date().toISOString().slice(0, 10),
    coverage: parseResult.coverage,
    effects: { significant, moderate, mild, normal },
    snps: {},
    catalogVersion: _catalogSignature(_snpTable),
  };
  for (const [rsid, data] of Object.entries(parseResult.matches)) {
    profileData.genetics.snps[rsid] = {
      genotype: data.genotype,
      normalizedGenotype: data.normalizedGenotype || findGenotypeMatch(_snpTable?.[rsid], data.genotype)?.key || data.genotype,
      gene: data.gene,
      variant: data.variant,
      category: data.category || null,
      markers: data.markers || [],
      effect: data.effect,
      valence: data.valence,
      evidence: data.evidence || _snpTable?.[rsid]?.evidence,
      relevance: data.relevance || _snpTable?.[rsid]?.relevance,
      note: data.note,
    };
  }
  for (const [rsid, stored] of Object.entries(preservedAddedSnps)) {
    if (!profileData.genetics.snps[rsid]) profileData.genetics.snps[rsid] = stored;
  }
  if (preservedMtDna) profileData.genetics.mtdna = preservedMtDna;
  if (apoe) {
    profileData.genetics.apoe = apoe;
  }
  recalculateGeneticsSummary(profileData.genetics);
}

export function deleteGeneticsData(profileData) {
  delete profileData.genetics;
}

// Returns a one-line user-facing hint or null. "May" wording — the user's
// raw file may not actually contain the new rsIDs, so we don't promise
// anything specific.
function _geneticsStalenessHint(genetics) {
  if (!_snpTable || !genetics) return null;
  const current = _catalogSignature(_snpTable);
  if (!current) return null;
  const stored = genetics.catalogVersion;
  if (stored && stored.hash === current.hash) return null;
  if (stored && current.size > stored.size) {
    const delta = current.size - stored.size;
    return `${delta} new SNP${delta === 1 ? '' : 's'} added to the catalog since your import — re-importing may include them.`;
  }
  if (stored) {
    return `Catalog has been updated since your import — re-importing may refresh your matches.`;
  }
  // Legacy import (pre-catalog-tracking): we can't tell precisely, but the
  // current catalog may include SNPs the user is missing.
  return `Re-importing may include any SNPs added to the catalog since your last import.`;
}

// ═══════════════════════════════════════════════
// CONTEXT ASSEMBLY
// ═══════════════════════════════════════════════

// Build genetics context string for AI. Priority findings stay limited to
// effectful/protective SNPs relevant to current markers; callers can opt into
// a compact all-imported-SNP inventory for lookup questions.
export function buildGeneticsContext(genetics, activeMarkerKeys, options = {}) {
  if (!genetics) return '';
  if (!genetics.snps && !genetics.mtdna && !genetics.apoe) return '';

  const lines = [];
  const includeGenomeSummary = options.includeGenomeSummary !== false;
  const includePriorityFindings = options.includePriorityFindings !== false;
  const includeSnpInventory = options.includeSnpInventory === true;
  const includeEvidenceDetails = options.includeEvidenceDetails === true;
  const maxPriorityFindings = Number.isFinite(options.maxPriorityFindings)
    ? Math.max(0, Math.floor(options.maxPriorityFindings))
    : 12;

  // mtDNA haplogroup — always include when present
  if (includeGenomeSummary && genetics.mtdna) {
    const mt = genetics.mtdna;
    const cLabel = mt.coupling ? mt.coupling.label : 'coupling unknown';
    lines.push(`mtDNA Haplogroup: ${mt.haplogroup} (${cLabel})`);
    if (mt.origin) lines.push(`Maternal lineage origin context: ${mt.origin}`);
    if (mt.details) lines.push(`Lineage context: ${mt.details}`);
    if (mt.coupling) {
      if (mt.coupling.description) lines.push(`Wallace coupling context: ${mt.coupling.description}`);
      if (mt.coupling.implications) lines.push(`Wallace lens implications: ${mt.coupling.implications}`);
      lines.push('Interpretation guide: use this as an evolutionary bioenergetics lens for plausible environment fit and self-observation, not as a direct measurement of personal coupling or proof that a climate causes symptoms.');
      const mismatch = detectMtDNAMismatch(genetics);
      if (mismatch && mismatch.mismatch) {
        lines.push(`ENVIRONMENT MISMATCH: ${mismatch.message}`);
        if (mismatch.implications) lines.push(`Implications: ${mismatch.implications}`);
      } else if (mismatch && !mismatch.mismatch) {
        lines.push(mismatch.message);
      }
    }
  }

  // APOE haplotype — always include
  if (includeGenomeSummary && genetics.apoe) {
    lines.push(`APOE: ${genetics.apoe}`);
  }

  // Group priority SNP findings by functional category. When opted in, the
  // compact inventory below lists every imported catalog call so chat can
  // confirm a normal/neutral SNP exists instead of treating it as missing data.
  const snpTable = _snpTable;
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  const byCategory = {};
  const inventory = [];
  const priorityFindings = [];
  let hasSnpEvidenceContext = false;
  for (const [rsid, stored] of Object.entries(genetics.snps || {})) {
    const entry = snpTable?.[rsid];
    const genotypeInfo = entry ? findGenotypeInfo(entry, stored.genotype) : {
      effect: stored.effect,
      note: stored.note,
      valence: stored.valence,
    };
    const cat = entry?.category || stored.category || 'other';
    const gene = stored.gene || entry?.gene || rsid;
    const variant = stored.variant || entry?.variant || '';
    const genotype = stored.genotype || '?';
    const effect = genotypeInfo?.effect || stored.effect || '';
    const valence = genotypeInfo?.valence || stored.valence || '';
    const presentation = snpFindingPresentation(effect, valence);
    const evidenceProfile = resolveSnpEvidenceProfile(entry || stored, genotypeInfo || stored);
    hasSnpEvidenceContext = true;
    const apoeComponent = genetics.apoe && apoeRsids.has(rsid);
    if (includeSnpInventory) {
      const componentLabel = apoeComponent ? ', APOE component' : '';
      inventory.push(`${gene}${variant ? ' ' + variant : ''} ${rsid}: ${genotype} (${presentation.label}; evidence: ${evidenceProfile.evidenceLabel}; relevance: ${evidenceProfile.relevanceLabel}; ${getSnpCategoryLabel(cat)}${componentLabel})`);
    }

    // APOE component SNPs are not detailed as separate findings when the
    // combined haplotype is available; the optional inventory can still expose
    // the raw imported calls for lookup/confirmation.
    if (!includePriorityFindings || apoeComponent) continue;
    if (!genotypeInfo || (genotypeInfo.effect === 'none' && !['protective', 'informational'].includes(genotypeInfo.valence))) continue;

    // Filter to SNPs relevant to active markers (if provided)
    if (activeMarkerKeys && activeMarkerKeys.length > 0) {
      const markerKeys = entry?.markers || stored.markers || [];
      const hasRelevantMarker = markerKeys.some(m => activeMarkerKeys.includes(m));
      if (!hasRelevantMarker) continue;
    }

    const evidenceScope = includeEvidenceDetails && evidenceProfile.scope ? ` Scope: ${evidenceProfile.scope}` : '';
    const relevanceContext = includeEvidenceDetails && evidenceProfile.context ? ` Interpretation context: ${evidenceProfile.context}` : '';
    priorityFindings.push({
      cat,
      rank: snpFindingRank(evidenceProfile, presentation),
      text: `${gene} ${variant}: ${genotype} — ${presentation.label}; ${genotypeInfo.note} [Evidence: ${evidenceProfile.evidenceLabel}. Relevance: ${evidenceProfile.relevanceLabel}.${evidenceScope}${relevanceContext}]`,
    });
  }

  priorityFindings.sort((a, b) => a.rank - b.rank || String(a.text).localeCompare(String(b.text)));
  for (const finding of priorityFindings.slice(0, maxPriorityFindings)) {
    if (!byCategory[finding.cat]) byCategory[finding.cat] = [];
    byCategory[finding.cat].push(finding.text);
  }

  for (const [cat, entries] of Object.entries(byCategory)) {
    lines.push(`${getSnpCategoryLabel(cat)} (${entries.length}): ${entries.join('; ')}`);
  }
  const omittedPriorityCount = Math.max(0, priorityFindings.length - maxPriorityFindings);
  if (omittedPriorityCount > 0) {
    lines.push(`${omittedPriorityCount} additional priority SNP finding${omittedPriorityCount === 1 ? '' : 's'} omitted from automatic context; ask about a gene or rsID for a focused interpretation.`);
  }
  if (includeSnpInventory && inventory.length > 0) {
    lines.push(`Imported SNP inventory for lookup (normal/no-impact calls are stored but not priority findings): ${inventory.join('; ')}`);
  }
  if (hasSnpEvidenceContext) {
    lines.push('Genome evidence guide: direction, evidence strength, and relevance are separate; genotype alone is not diagnostic. Catalog annotations are a grounded baseline, not a limit on broader model knowledge; distinguish established evidence from inference.');
  }

  if (lines.length === 0) return '';
  const headerParts = [];
  if (genetics.source) headerParts.push(genetics.source);
  if (genetics.snps) headerParts.push(`${Object.keys(genetics.snps).length} SNPs`);
  if (genetics.mtdna) headerParts.push(`mtDNA ${genetics.mtdna.haplogroup}`);
  return `GENETICS (${headerParts.join(', ')}):\n${lines.map(l => '- ' + l).join('\n')}`;
}

// Full genetics dump for when user explicitly asks about genetics
export function buildFullGeneticsContext(genetics) {
  return buildGeneticsContext(genetics, null, {
    includeSnpInventory: true,
    includeEvidenceDetails: true,
    maxPriorityFindings: Number.MAX_SAFE_INTEGER,
  });
}

export function askAIAboutSnp(rsid) {
  const normalizedRsid = String(rsid || '').trim().toLowerCase();
  const stored = state.importedData?.genetics?.snps?.[normalizedRsid];
  const entry = _snpTable?.[normalizedRsid];
  return openDnaChatPrompt(buildSnpAIInterpretationPrompt(normalizedRsid, stored, entry));
}

// ═══════════════════════════════════════════════
// MANUAL / REPORT SNP IMPORT
// ═══════════════════════════════════════════════

export function parseManualSnpRows(singleRsid, singleGenotype, bulkText) {
  const rows = [];
  const addRow = (rsid, genotype, note = '') => rows.push({ rsid: String(rsid || '').trim(), genotype: String(genotype || '').trim(), note: String(note || '').trim() });
  if (String(singleRsid || '').trim() || String(singleGenotype || '').trim()) addRow(singleRsid, singleGenotype);
  for (const rawLine of String(bulkText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(rs\d+)\s*[,;:\t ]\s*([ACGT]{1,2}|\d+\s*[\/|]\s*\d+)\b\s*(.*)$/i);
    if (match) addRow(match[1], match[2], match[3]);
    else rows.push({ rsid: '', genotype: '', note: line, error: `Could not read "${line}". Use: rs1801133 CC or rs8175347 6/7` });
  }
  return rows;
}

export async function saveManualSnpFromModal() {
  await loadSNPTable();
  const rsid = /** @type {HTMLInputElement | null} */ (document.getElementById('manual-snp-rsid'))?.value || '';
  const genotype = /** @type {HTMLInputElement | null} */ (document.getElementById('manual-snp-genotype'))?.value || '';
  const bulk = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('manual-snp-bulk'))?.value || '';
  const label = /** @type {HTMLInputElement | null} */ (document.getElementById('manual-snp-source'))?.value || 'Manual SNP entry';
  const rows = parseManualSnpRows(rsid, genotype, bulk);
  if (rows.length === 0) { showNotification('Add at least one rsID + genotype pair.', 'error'); return; }

  const originalData = state.importedData;
  const draftData = JSON.parse(JSON.stringify(originalData || {}));
  const accepted = [], errors = [];
  for (const [index, row] of rows.entries()) {
    if (row.error) { errors.push(`Line ${index + 1}: ${row.error}`); continue; }
    const source = { type: 'manual', label, rawText: [row.rsid, row.genotype, row.note].filter(Boolean).join(' ') || null };
    const result = upsertGeneticsSnp(draftData, row.rsid, row.genotype, source);
    if (!result.ok) errors.push(`${row.rsid || `Line ${index + 1}`}: ${result.error || 'Could not save SNP'}`);
    else accepted.push(result);
  }
  if (accepted.length === 0) { showNotification(errors.slice(0, 3).join(' · ') || 'Could not save SNPs', 'error', 7000); return; }
  state.importedData = draftData;
  if (!await saveImportedData()) { state.importedData = originalData; return; }
  closeModalOverlay('dna-modal-overlay');
  const errorSuffix = errors.length ? ` (${errors.length} skipped)` : '';
  showNotification(`Saved ${accepted.length} SNP${accepted.length === 1 ? '' : 's'}${errorSuffix}`, errors.length ? 'info' : 'success', 5000);
  if (errors.length) logDnaDebugWarn('Manual SNP import skipped rows:', errors);
  refreshDnaSidebar();
  navigateDnaRoute('genome');
}

export async function importSnpReport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.txt,.csv,.text';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    await handleSnpReportFile(file);
  };
  input.click();
}

export async function handleSnpReportFile(file) {
  if (_dnaImportRunning) { showNotification('DNA import already in progress', 'info'); return false; }
  if (!await loadGeneticsStylesheetForAction()) return false;
  _dnaImportRunning = true;
  try {
    showNotification('Reading SNP report...', 'info');
    await loadSNPTable({ forceFresh: true });
    let text = '';
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const { extractPDFText } = await import('./pdf-import.js');
      text = await extractPDFText(file);
    } else {
      text = await file.text();
    }
    const result = parseClinicalSnpReportText(text, { source: file.name, fileName: file.name, type: 'pdf-report' });
    result.mergeSnps = true;
    if (Object.keys(result.matches).length === 0) {
      showNotification('No catalog SNP results found in this report. Add the SNP manually.', 'error');
      _dnaImportRunning = false;
      return false;
    }
    showDNAImportPreview(result);
    return true;
  } catch (e) {
    logDnaDebugError('SNP report import error:', e);
    showNotification(getErrorMessage(e, 'Failed to read SNP report'), 'error');
    _dnaImportRunning = false;
    return false;
  }
}

// ═══════════════════════════════════════════════
// IMPORT FLOW
// ═══════════════════════════════════════════════

let _dnaImportRunning = false;

export async function handleDNAFile(file) {
  if (_dnaImportRunning) { showNotification('DNA import already in progress', 'info'); return false; }
  if (isDnaLabImportRunning()) { showNotification('Lab import in progress — wait for it to finish', 'info'); return false; }
  if (!await loadGeneticsStylesheetForAction()) return false;
  _dnaImportRunning = true;
  try {
    showNotification('Parsing DNA file...', 'info');
    const result = await parseDNAFile(file);
    if (Object.keys(result.matches).length === 0) {
      showNotification('No health-relevant SNPs found in this file. Is it a DNA raw data export?', 'error');
      _dnaImportRunning = false;
      return false;
    }
    showDNAImportPreview(result);
    return true;
  } catch (e) {
    logDnaDebugError('DNA import error:', e);
    showNotification(getErrorMessage(e, 'Failed to parse DNA file'), 'error');
    _dnaImportRunning = false;
    return false;
  }
}

export async function confirmDNAImport() {
  const result = getPendingDnaImport();
  if (!result) return;
  const originalData = state.importedData;
  const draftData = JSON.parse(JSON.stringify(originalData || {}));
  if (result.mergeSnps) {
    for (const [rsid, snp] of Object.entries(result.matches || {})) {
      const saved = upsertGeneticsSnp(draftData, rsid, snp.genotype, snp.source || { type: 'report-text', label: result.source });
      if (!saved.ok) { showNotification(saved.error || `Could not save ${rsid}`, 'error'); _dnaImportRunning = false; return; }
    }
  } else saveGeneticsData(draftData, result);
  state.importedData = draftData;
  if (!await saveImportedData()) {
    state.importedData = originalData; _dnaImportRunning = false;
    return;
  }
  clearPendingDnaImport();
  _dnaImportRunning = false;
  closeModalOverlay('dna-modal-overlay');
  showNotification(`Imported ${result.coverage.found} SNPs from ${result.source}`, 'success');

  // Build summary for chat confirmation
  const apoe = state.importedData.genetics?.apoe;
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  let sigCount = 0, modCount = 0, mildCount = 0, normCount = 0;
  for (const [rsid, m] of Object.entries(result.matches)) {
    if (apoeRsids.has(rsid)) continue;
    if (m.effect === 'significant') sigCount++;
    else if (m.effect === 'moderate') modCount++;
    else if (m.effect === 'mild') mildCount++;
    else if (m.effect === 'none') normCount++;
  }
  const parts = [];
  if (apoe) parts.push(`APOE: <strong>${escapeHTML(apoe)}</strong>`);
  if (sigCount > 0) parts.push(`\uD83D\uDD34 ${sigCount} significant`);
  if (modCount > 0) parts.push(`\uD83D\uDFE1 ${modCount} moderate`);
  if (mildCount > 0) parts.push(`\uD83D\uDFE0 ${mildCount} mild`);
  if (normCount > 0) parts.push(`\uD83D\uDFE2 ${normCount} normal`);

  // Update chat onboarding — replace DNA upload with confirmation
  const dnaEl = /** @type {HTMLElement | null} */ (document.querySelector('.chat-onboard-dna'));
  if (dnaEl) {
    dnaEl.style.borderTop = '1px solid var(--border)';
    dnaEl.style.paddingTop = '12px';
    dnaEl.style.marginTop = '12px';
    dnaEl.innerHTML = `<p style="margin:0 0 6px">\uD83E\uDDEC <strong>${result.coverage.found} SNPs imported</strong> from ${escapeHTML(result.source)}</p>
      <div style="font-size:13px;line-height:1.8">${parts.join(' &nbsp;\u00B7&nbsp; ')}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:6px">I'll factor these into all your lab interpretations.</div>`;
  } else {
    updateDnaChatNudge();
  }

  // Refresh sidebar (genetics nav count) AND dashboard. Without the
  // explicit buildSidebar call, the nav-count stays at the pre-import
  // value because navigate() only re-renders main content, not nav.
  // Symptom that surfaced this: after re-importing on the same device
  // the dashboard correctly showed "43 SNPs" while the sidebar still
  // said "🧬 Genetics 40".
  refreshDnaShell('dashboard');
}

// ═══════════════════════════════════════════════
// DETAIL MODAL HELPER
// ═══════════════════════════════════════════════

// Get SNPs relevant to a specific marker dotKey (e.g. "coagulation.homocysteine")
export function getRelevantSNPs(dotKey) {
  const genetics = state.importedData.genetics;
  if (!genetics || !genetics.snps || !_snpTable) return [];
  const results = [];
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps)) {
    if (genetics.apoe && apoeRsids.has(rsid)) continue;
    const entry = _snpTable[rsid];
    if (!entry || !entry.markers) continue;
    if (!entry.markers.includes(dotKey)) continue;
    const info = findGenotypeInfo(entry, stored.genotype);
    if (!info) continue;
    const presentation = snpFindingPresentation(info.effect, info.valence);
    const evidenceProfile = resolveSnpEvidenceProfile(entry, info);
    results.push({
      rsid,
      gene: stored.gene,
      variant: stored.variant,
      genotype: stored.genotype,
      effect: info.effect,
      valence: info.valence,
      note: info.note,
      references: entry.references || [],
      evidence: entry.evidence,
      relevance: entry.relevance,
      presentation,
      evidenceProfile,
      rank: (presentation.rank * 100) + (evidenceProfile.relevanceRank * 10) + evidenceProfile.evidenceRank,
    });
  }
  results.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return results;
}

export {
  HAPLOGROUP_LIST,
  closeMtDNAPreview,
  confirmMtDNAImport,
  deleteMtDNAData,
  detectMtDNAMismatch,
  ensureHaplogroupTable,
  handleMtDNAFile,
  loadHaplogroupTable,
  parseMtDNAMutations,
  resolveHaplogroup,
  setManualHaplogroup,
};

/// Custom confirm dialog so the destructive Delete on the genetics card
/// matches the rest of the app's modal styling and respects PWA/file
/// contexts where the native confirm prompt would feel out of place.
export async function confirmDeleteDNA() {
  if (await confirmDnaDeleteDialog()) {
    const originalData = JSON.parse(JSON.stringify(state.importedData || {}));
    deleteGeneticsData(state.importedData);
    if (!await saveImportedData()) {
      state.importedData = originalData;
      showNotification('Could not save genetic data deletion. Try again after the app finishes loading.', 'error');
      return;
    }
    refreshDnaShell('dashboard');
  }
}

configureDnaUi({
  findGenotypeInfo,
  geneticsStalenessHint: _geneticsStalenessHint,
  getSnpCategoryLabel,
  getSnpCategoryLabels: () => SNP_CATEGORY_LABELS,
  getSnpTable: () => _snpTable,
  handleDNAFile,
  loadSnpTable: loadSNPTable,
  resolveAPOE,
  setImportRunning: running => { _dnaImportRunning = !!running; },
});

initDnaActionDelegates({ askAIAboutSnp, triggerDNAFilePicker: triggerDnaFilePicker, closeDNAImportPreview, closeMtDNAPreview, confirmDeleteDNA, confirmDNAImport, confirmMtDNAImport, deleteMtDNAData, importSnpReport, openManualSnpModal, reimportDNA, saveManualSnpFromModal, toggleGeneticsCollapse, toggleGeneticsExpand });

configureDnaModuleBridge({
  buildGeneticsContext, buildSnpAIInterpretationPrompt, getRelevantSNPs,
  dnaStudyReferenceLabel, mtdnaEvidenceIssueUrl, newSnpSuggestionIssueUrl,
  resolveSnpEvidenceProfile, snpEvidenceIssueUrl, snpFindingPresentation, snpFindingRank,
  isDNAFile, isDNAFileByContent, detectDNAFile, parseClinicalSnpReportText, parseManualSnpRows, upsertGeneticsSnp, handleDNAFile, handleSnpReportFile,
  importSnpReport, openManualSnpModal, saveManualSnpFromModal, closeDNAImportPreview, confirmDNAImport, confirmDeleteDNA, deleteGeneticsData,
  getSnpCategoryLabel, SNP_CATEGORY_LABELS, toggleGeneticsCollapse, toggleGeneticsExpand, reimportDNA,
  handleMtDNAFile, closeMtDNAPreview, confirmMtDNAImport, deleteMtDNAData, detectMtDNAMismatch, ensureHaplogroupTable, setManualHaplogroup, HAPLOGROUP_LIST,
});
