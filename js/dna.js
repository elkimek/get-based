// @ts-check
// dna.js — DNA storage, context assembly, and UI orchestration
import { state } from './state.js';
import { escapeAttr, escapeHTML, hashString, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { dnaActionAttrs, initDnaActionDelegates } from './dna-actions.js';
import { findGenotypeInfo as findGenotypeInfoImpl, findGenotypeMatch, findSnpHint as findSnpHintImpl, sortAlleles } from './dna-genotype.js';
import {
  detectDNAFile,
  isDNAFile,
  isDNAFileByContent,
  parseClinicalSnpReportTextWithTable,
  parseDNAFileWithTable,
} from './dna-parser.js';
import {
  cacheDnaSnpTable, callDnaFileHandler, clearPendingDnaImport,
  confirmDnaDeleteDialog, getDnaRuntimeState, getPendingDnaImport,
  isDnaLabImportRunning, logDnaDebugError, logDnaDebugWarn,
  navigateDnaRoute, publishDnaWindowBindings, refreshDnaShell,
  refreshDnaSidebar, saveDnaRuntimeAndRefresh, setPendingDnaImport,
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
export { detectDNAFile, isDNAFile, isDNAFileByContent };
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

// Catalog signature: { size, hash } over the sorted rsID list. Stamped on
// genetics at import time and re-computed at render time so the genetics
// card can flag "catalog grew since your import — re-import to include
// new SNPs". Hash catches swap/replace cases that a raw size compare misses.
function _catalogSignature(snpTable) {
  if (!snpTable) return null;
  const rsids = Object.keys(snpTable).filter(k => k.startsWith('rs')).sort();
  return { size: rsids.length, hash: hashString(rsids.join(',')) };
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
  const rsid = String(rsidInput || '').trim().toLowerCase();
  const genotype = String(genotypeInput || '').trim().toUpperCase();
  if (!/^rs\d+$/.test(rsid)) return { ok: false, error: 'Enter a valid rsID, e.g. rs1801133.' };
  if (!/^[ACGT]{1,2}$/.test(genotype)) return { ok: false, error: 'Enter a genotype using A/C/G/T, e.g. CT.' };
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
    note: match.info.note,
    source: sourceMeta,
  };
  profileData.genetics.source = sourceMeta.label || profileData.genetics.source || 'Manual SNPs';
  profileData.genetics.importDate = new Date().toISOString().slice(0, 10);
  profileData.genetics.catalogVersion = _catalogSignature(_snpTable);
  recalculateGeneticsSummary(profileData.genetics);
  return { ok: true, rsid, snp: profileData.genetics.snps[rsid] };
}

export function saveGeneticsData(profileData, parseResult) {
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
      note: data.note,
    };
  }
  if (apoe) {
    profileData.genetics.apoe = apoe;
  }
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

  // mtDNA haplogroup — always include when present
  if (includeGenomeSummary && genetics.mtdna) {
    const mt = genetics.mtdna;
    const cLabel = mt.coupling ? mt.coupling.label : 'coupling unknown';
    lines.push(`mtDNA Haplogroup: ${mt.haplogroup} (${cLabel})`);
    if (mt.coupling) {
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
  const impactLabelFor = (effect, valence) => {
    if (valence === 'protective') return 'beneficial';
    if (valence === 'neutral') return effect && effect !== 'none' ? `neutral/${effect}` : 'neutral';
    if (effect === 'significant' || effect === 'moderate' || effect === 'mild') return `${effect} risk`;
    if (effect === 'none') return 'normal/no impact';
    return 'unclassified';
  };
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
    const apoeComponent = genetics.apoe && apoeRsids.has(rsid);
    if (includeSnpInventory) {
      const componentLabel = apoeComponent ? ', APOE component' : '';
      inventory.push(`${gene}${variant ? ' ' + variant : ''} ${rsid}: ${genotype} (${impactLabelFor(effect, valence)}, ${getSnpCategoryLabel(cat)}${componentLabel})`);
    }

    // APOE component SNPs are not detailed as separate findings when the
    // combined haplotype is available; the optional inventory can still expose
    // the raw imported calls for lookup/confirmation.
    if (!includePriorityFindings || apoeComponent) continue;
    if (!genotypeInfo || (genotypeInfo.effect === 'none' && genotypeInfo.valence !== 'protective')) continue;

    // Filter to SNPs relevant to active markers (if provided)
    if (activeMarkerKeys && activeMarkerKeys.length > 0) {
      const markerKeys = entry?.markers || stored.markers || [];
      const hasRelevantMarker = markerKeys.some(m => activeMarkerKeys.includes(m));
      if (!hasRelevantMarker) continue;
    }

    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(`${gene} ${variant}: ${genotype} — ${genotypeInfo.note}`);
  }

  for (const [cat, entries] of Object.entries(byCategory)) {
    lines.push(`${getSnpCategoryLabel(cat)} (${entries.length}): ${entries.join('; ')}`);
  }
  if (includeSnpInventory && inventory.length > 0) {
    lines.push(`Imported SNP inventory for lookup (normal/no-impact calls are stored but not priority findings): ${inventory.join('; ')}`);
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
  return buildGeneticsContext(genetics, null, { includeSnpInventory: true });
}

// ═══════════════════════════════════════════════
// DASHBOARD SECTION
// ═══════════════════════════════════════════════

export function renderGeneticsSection() {
  const genetics = state.importedData.genetics;
  const hasSnps = genetics && genetics.snps && Object.keys(genetics.snps).length > 0;
  const hasMtdna = genetics && genetics.mtdna;
  // Empty-state CTA: lives in the natural conceptual slot (where genetics
  // would render) so users who skipped the chat onboarding DNA step have a
  // path back. Below the fold on first paint but appears after supplements/charts.
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
  if (hasSnps && !_snpTable) {
    loadSNPTable().then(() => navigateDnaRoute('dashboard'));
    return '';
  }
  const snpTable = _snpTable;
  const snpCount = hasSnps ? Object.keys(genetics.snps).length : 0;
  const apoe = genetics.apoe;
  const collapsed = localStorage.getItem('labcharts-genetics-collapsed') === '1';

  const primaryImpactFor = (effect, valence) => {
    if (valence === 'protective') return true;
    if (valence === 'neutral') return false;
    return effect === 'significant' || effect === 'moderate' || effect === 'mild';
  };

  // Group findings by category. Only meaningful impact tiers are shown up
  // front; normal / neutral rows stay available in a collapsed group.
  const byCat = {};
  const otherByCat = {};
  const apoeRsids = new Set(['rs429358', 'rs7412']);
  for (const [rsid, stored] of Object.entries(genetics.snps || {})) {
    if (apoe && apoeRsids.has(rsid)) continue;
    const entry = snpTable?.[rsid];
    if (!entry) continue;
    const info = findGenotypeInfo(entry, stored.genotype);
    if (!info) continue;
    const cat = entry.category || 'other';
    const target = primaryImpactFor(info.effect, info.valence) ? byCat : otherByCat;
    if (!target[cat]) target[cat] = [];
    target[cat].push({ rsid, gene: stored.gene || entry.gene, variant: stored.variant || entry.variant, genotype: stored.genotype, effect: info.effect, valence: info.valence || 'risk', note: info.note, references: entry.references || [] });
  }

  // Sort categories by the weight of the heaviest finding in each — significant
  // categories first, then moderate-only, then mild-only. Before there were
  // only two non-none tiers the binary "has significant?" sort sufficed, but
  // with three tiers a category of moderates was tying with a category of
  // milds, hiding clinical priority in arrival order.
  const _effectRank = { significant: 0, moderate: 1, mild: 2 };
  const _heaviest = (findings) => Math.min(...findings.map(f => _effectRank[f.effect] ?? 3));
  const catOrder = Object.entries(byCat).sort(([, a], [, b]) => _heaviest(a) - _heaviest(b));
  const totalFindings = catOrder.reduce((n, [, fs]) => n + fs.length, 0);
  const otherCatOrder = Object.entries(otherByCat).sort(([, a], [, b]) => _heaviest(a) - _heaviest(b));
  const otherFindings = otherCatOrder.reduce((n, [, fs]) => n + fs.length, 0);

  // Two-axis dot: severity x valence. Protective = green regardless of magnitude;
  // neutral = white circle (lab-artifact / neutral, neither bad nor good).
  // Risk severity scales by warmth (significant -> red, moderate -> orange, mild -> yellow).
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
  const catLabels = SNP_CATEGORY_LABELS;

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
      sub: genetics.source || 'Autosomal raw data'
    },
    {
      label: 'Findings',
      value: String(totalFindings),
      sub: totalFindings ? 'Interpreted from known SNPs' : 'No interpreted findings'
    },
    apoe ? {
      label: 'APOE',
      value: apoe,
      sub: 'Haplotype context'
    } : null,
    hasMtdna ? {
      label: 'mtDNA',
      value: genetics.mtdna.haplogroup,
      sub: genetics.mtdna.coupling?.shortLabel || 'Maternal lineage'
    } : null
  ].filter(Boolean);

  html += '<div class="genetics-overview-grid">';
  overviewCards.forEach(card => {
    html += `<div class="genetics-overview-card">
      <span class="genetics-overview-label">${escapeHTML(card.label)}</span>
      <strong>${escapeHTML(card.value)}</strong>
      <small>${escapeHTML(card.sub)}</small>
    </div>`;
  });
  html += '</div>';

  // mtDNA Haplogroup — prominent display
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
    // Initially show first 8 findings, rest hidden behind "show all"
    let shown = 0;
    const INITIAL_LIMIT = 8;
    html += `<div class="genetics-findings">`;
    // Legend — explain the dot scheme so users can read severity AND valence at a glance.
    html += `<div class="genetics-legend" title="What the dots mean" aria-label="Genetics significance legend">
      <span class="genetics-legend-item genetics-legend-significant"><span class="genetics-legend-dot">🔴</span> significant risk</span>
      <span class="genetics-legend-item genetics-legend-moderate"><span class="genetics-legend-dot">🟠</span> moderate risk</span>
      <span class="genetics-legend-item genetics-legend-mild"><span class="genetics-legend-dot">🟡</span> mild risk</span>
      <span class="genetics-legend-item genetics-legend-beneficial"><span class="genetics-legend-dot">🟢</span> beneficial</span>
      <span class="genetics-legend-item genetics-legend-informational"><span class="genetics-legend-dot">⚪</span> neutral</span>
    </div>`;
    for (const [cat, findings] of catOrder) {
      // Within-category: severity descending, with beneficial and neutral
      // entries still visible so the desktop section matches the mobile summary.
      findings.sort((a, b) => impactFor(a.effect, a.valence).rank - impactFor(b.effect, b.valence).rank);
      const catLabel = catLabels[cat] || cat;
      const startHidden = shown >= INITIAL_LIMIT;
      html += `<div class="genetics-cat-group${startHidden ? ' genetics-extra' : ''}">`;
      html += `<div class="genetics-cat-label">${escapeHTML(catLabel)}</div>`;
      for (const f of findings) {
        const isExtra = shown >= INITIAL_LIMIT;
        const impact = impactFor(f.effect, f.valence);
        const primaryRef = (f.references || []).find(ref => /^https?:\/\//i.test(String(ref || '')));
        const refLink = primaryRef ? ` <a href="${escapeAttr(primaryRef)}" target="_blank" rel="noopener" class="detail-genetics-ref" title="Primary study (PubMed)">primary study</a>` : '';
        const snpediaId = `${f.rsid.charAt(0).toUpperCase()}${f.rsid.slice(1)}`;
        const snpediaLink = ` <a href="https://www.snpedia.com/index.php/${escapeAttr(encodeURIComponent(snpediaId))}" target="_blank" rel="noopener" class="detail-genetics-ref" title="All studies (SNPedia)">more studies</a>`;
        const rowClasses = ['genetics-finding-row', `genetics-finding-${impact.tone}`];
        if (isExtra && !startHidden) rowClasses.push('genetics-extra');
        html += `<div class="${rowClasses.join(' ')}">
          <span class="genetics-finding-dot">${dotFor(f.effect, f.valence)}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(f.gene || f.rsid)} ${escapeHTML(f.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(f.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.label)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(f.genotype)}</span>
          <span class="genetics-finding-note">${escapeHTML(f.note || 'Observed in your imported genotype.')}${refLink}${snpediaLink}</span>
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
      for (const f of findings) {
        const impact = impactFor(f.effect, f.valence);
        html += `<div class="genetics-finding-row genetics-finding-${impact.tone}">
          <span class="genetics-finding-dot">${dotFor(f.effect, f.valence)}</span>
          <span class="genetics-finding-main">
            <span class="genetics-finding-gene">${escapeHTML(f.gene || f.rsid)} ${escapeHTML(f.variant || '')}</span>
            <span class="genetics-finding-rsid">${escapeHTML(f.rsid)} · ${escapeHTML(catLabel)}</span>
          </span>
          <span class="genetics-finding-impact genetics-impact-${impact.tone}">${escapeHTML(impact.label)}</span>
          <span class="genetics-finding-genotype">${escapeHTML(f.genotype)}</span>
          <span class="genetics-finding-note">${escapeHTML(f.note || 'Observed in your imported genotype.')}</span>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div></details>`;
  }

  const _staleHint = _geneticsStalenessHint(genetics);
  if (_staleHint) {
    html += `<div class="genetics-stale-hint">${escapeHTML(_staleHint)}</div>`;
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

function toggleGeneticsCollapse() {
  const body = document.querySelector('.genetics-body');
  const arrow = document.querySelector('.genetics-collapse-arrow');
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  arrow?.classList.toggle('collapsed', isHidden);
  localStorage.setItem('labcharts-genetics-collapsed', isHidden ? '1' : '0');
}

function toggleGeneticsExpand(btn) {
  const container = document.querySelector('.genetics-findings');
  if (!container) return;
  const isExpanded = container.classList.toggle('expanded');
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = isExpanded ? 'Show less' : btn.dataset.label;
}

function reimportDNA() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) callDnaFileHandler(file);
  };
  input.click();
}

let _dnaModalEscapeBound = false, _dnaBackdropMouseDownInside = false;

function nudgeDnaModal() {
  const dialog = document.querySelector('#dna-modal-overlay .modal');
  if (!(dialog instanceof HTMLElement)) return;
  dialog.classList.remove('modal-nudge'); void dialog.offsetWidth;
  dialog.classList.add('modal-nudge');
  dialog.addEventListener('animationend', () => dialog.classList.remove('modal-nudge'), { once: true });
}

function handleDnaBackdropMouseDown(event) {
  const target = event.target;
  _dnaBackdropMouseDownInside = target instanceof Element && !!target.closest('.modal');
}

function handleDnaBackdropClick(event) {
  const target = event.target;
  if (_dnaBackdropMouseDownInside) { _dnaBackdropMouseDownInside = false; return; }
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
  if (!_dnaModalEscapeBound) { document.addEventListener('keydown', handleDnaModalEscape); _dnaModalEscapeBound = true; }
  openModalOverlay(overlay, { initialFocus, focusDelay: 30, scrollLock: true });
}

async function openManualSnpModal() {
  await loadSNPTable();
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
}

export function parseManualSnpRows(singleRsid, singleGenotype, bulkText) {
  const rows = [];
  const addRow = (rsid, genotype, note = '') => rows.push({ rsid: String(rsid || '').trim(), genotype: String(genotype || '').trim(), note: String(note || '').trim() });
  if (String(singleRsid || '').trim() || String(singleGenotype || '').trim()) addRow(singleRsid, singleGenotype);
  for (const rawLine of String(bulkText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(rs\d+)\s*[,;:\t ]\s*([ACGT]{1,2})\b\s*(.*)$/i);
    if (match) addRow(match[1], match[2], match[3]);
    else rows.push({ rsid: '', genotype: '', note: line, error: `Could not read "${line}". Use: rs1801133 CC` });
  }
  return rows;
}

async function saveManualSnpFromModal() {
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

async function importSnpReport() {
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

async function handleSnpReportFile(file) {
  if (_dnaImportRunning) { showNotification('DNA import already in progress', 'info'); return; }
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
      return;
    }
    showDNAImportPreview(result, file.name);
  } catch (e) {
    logDnaDebugError('SNP report import error:', e);
    showNotification(e.message || 'Failed to read SNP report', 'error');
    _dnaImportRunning = false;
  }
}

// ═══════════════════════════════════════════════
// IMPORT FLOW
// ═══════════════════════════════════════════════

let _dnaImportRunning = false;

export async function handleDNAFile(file) {
  if (_dnaImportRunning) { showNotification('DNA import already in progress', 'info'); return; }
  if (isDnaLabImportRunning()) { showNotification('Lab import in progress — wait for it to finish', 'info'); return; }
  _dnaImportRunning = true;
  try {
    showNotification('Parsing DNA file...', 'info');
    const result = await parseDNAFile(file);
    if (Object.keys(result.matches).length === 0) {
      showNotification('No health-relevant SNPs found in this file. Is it a DNA raw data export?', 'error');
      _dnaImportRunning = false;
      return;
    }
    showDNAImportPreview(result, file.name);
  } catch (e) {
    logDnaDebugError('DNA import error:', e);
    showNotification(e.message || 'Failed to parse DNA file', 'error');
    _dnaImportRunning = false;
  }
}

function showDNAImportPreview(result, fileName) {
  setPendingDnaImport(result);

  // Categorize matches by effect — skip raw APOE components when haplotype resolved
  const apoe = resolveAPOE(result.matches);
  const apoeRsids = apoe ? new Set(['rs429358', 'rs7412']) : new Set();
  // parseDNAFile already filtered out SNPs whose raw call doesn't resolve to
  // any catalog genotype (Low-pass WGS imputation noise: garbage allele calls
  // that aren't valid variants for the locus), so every entry here has a
  // curated effect tier \u2014 significant / moderate / mild / none. No "unknown"
  // bucket: surfacing those as "Genotype not in lookup" was misleading because
  // the rsID *is* curated, only the specific allele call was bad data.
  const significant = [], moderate = [], mild = [], beneficial = [], none = [];
  for (const [rsid, m] of Object.entries(result.matches)) {
    if (apoeRsids.has(rsid)) continue;
    const item = { rsid, ...m, impact: m.valence === 'protective' ? 'beneficial' : m.effect };
    if (item.impact === 'beneficial') beneficial.push(item);
    else if (m.effect === 'significant') significant.push(item);
    else if (m.effect === 'moderate') moderate.push(item);
    else if (m.effect === 'mild') mild.push(item);
    else none.push(item);
  }

  const effectIcon = { significant: '\uD83D\uDD34', moderate: '\uD83D\uDFE0', mild: '\uD83D\uDFE1', beneficial: '\uD83D\uDFE2', none: '\u26AA' };
  const effectLabel = { significant: 'Significant impact', moderate: 'Moderate impact', mild: 'Mild impact', beneficial: 'Beneficial', none: 'Normal / no impact' };

  function renderGroup(items, label) {
    if (items.length === 0) return '';
    return `<div class="dna-preview-group">
      <div class="dna-preview-group-title">${label} (${items.length})</div>
      ${items.map(m => `<div class="dna-preview-row">
        <span class="dna-preview-icon">${effectIcon[m.impact || m.effect] || '\u2753'}</span>
        <span class="dna-preview-gene">${escapeHTML(m.gene)} <span class="dna-preview-variant">${escapeHTML(m.variant)}</span> <span class="dna-preview-category">${escapeHTML(getSnpCategoryLabel(m.category))}</span></span>
        <span class="dna-preview-genotype">${escapeHTML(m.genotype)}</span>
      </div>
      <div class="dna-preview-note">${escapeHTML(m.note)}</div>`).join('')}
    </div>`;
  }

  function renderCollapsedGroup(items, label) {
    if (items.length === 0) return '';
    return `<div class="dna-preview-group">
      <div class="dna-preview-group-title dna-preview-collapsible" role="button" tabindex="0" ${dnaActionAttrs('toggle-preview-group')}>
        ${label} (${items.length}) <span class="dna-preview-expand-hint">show</span>
      </div>
      <div class="dna-preview-collapsed-items">
        ${items.map(m => `<div class="dna-preview-row">
          <span class="dna-preview-icon">${effectIcon[m.impact || m.effect] || '\u2753'}</span>
          <span class="dna-preview-gene">${escapeHTML(m.gene)} <span class="dna-preview-variant">${escapeHTML(m.variant)}</span> <span class="dna-preview-category">${escapeHTML(getSnpCategoryLabel(m.category))}</span></span>
          <span class="dna-preview-genotype">${escapeHTML(m.genotype)}</span>
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

  // Use a dedicated overlay — don't clobber the PDF import modal
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

function closeDNAImportPreview() {
  clearPendingDnaImport();
  _dnaImportRunning = false;
  closeModalOverlay('dna-modal-overlay');
  if (_dnaModalEscapeBound) { document.removeEventListener('keydown', handleDnaModalEscape); _dnaModalEscapeBound = false; }
}

async function confirmDNAImport() {
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
function getRelevantSNPs(dotKey) {
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
    results.push({ rsid, gene: stored.gene, variant: stored.variant, genotype: stored.genotype, effect: info.effect, note: info.note, references: entry.references || [] });
  }
  const order = { significant: 0, moderate: 1, mild: 2, none: 3 };
  results.sort((a, b) => (order[a.effect] ?? 3) - (order[b.effect] ?? 3));
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
async function confirmDeleteDNA() {
  if (await confirmDnaDeleteDialog()) {
    const runtimeState = getDnaRuntimeState();
    const targetState = runtimeState || state;
    const originalData = JSON.parse(JSON.stringify(targetState.importedData || {}));
    deleteGeneticsData(targetState.importedData);
    if (!await saveDnaRuntimeAndRefresh()) {
      targetState.importedData = originalData;
      state.importedData = originalData;
      showNotification('Could not save genetic data deletion. Try again after the app finishes loading.', 'error');
    }
  }
}

initDnaActionDelegates({ triggerDNAFilePicker: triggerDnaFilePicker, closeDNAImportPreview, closeMtDNAPreview, confirmDeleteDNA, confirmDNAImport, confirmMtDNAImport, deleteMtDNAData, importSnpReport, openManualSnpModal, reimportDNA, saveManualSnpFromModal, toggleGeneticsCollapse, toggleGeneticsExpand });

publishDnaWindowBindings({
  state, saveImportedData, buildGeneticsContext, getRelevantSNPs,
  isDNAFile, isDNAFileByContent, detectDNAFile, parseClinicalSnpReportText, parseManualSnpRows, upsertGeneticsSnp, handleDNAFile, handleSnpReportFile,
  importSnpReport, openManualSnpModal, saveManualSnpFromModal, closeDNAImportPreview, confirmDNAImport, confirmDeleteDNA, deleteGeneticsData,
  getSnpCategoryLabel, SNP_CATEGORY_LABELS, toggleGeneticsCollapse, toggleGeneticsExpand, reimportDNA,
  handleMtDNAFile, closeMtDNAPreview, confirmMtDNAImport, deleteMtDNAData, detectMtDNAMismatch, ensureHaplogroupTable, setManualHaplogroup, HAPLOGROUP_LIST,
});
