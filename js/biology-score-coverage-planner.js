// biology-score-coverage-planner.js — shared Coverage Planner data model for UI and chat prompts.

import { contextOnlyNeedsMoreData } from './biology-score-engine.js';

/** @param {any} item */
export function markerDisplayLabel(item) {
  if (item?.coreGroupLabel && item?.displayValue == null) return item.coreGroupLabel.replace(/^B12 status \(active or total B12\)$/i, 'Active or total B12');
  if (item?.dotKey === 'proteins.hsCRP') return 'hs-CRP';
  if (item?.dotKey === 'proteins.crp') return 'CRP';
  const byKey = {
    reverseT3: 'Reverse T3',
    tpoAb: 'TPO antibodies',
    tgAb: 'Thyroglobulin antibodies',
    platelets: 'Platelets',
    fibrinogen: 'Fibrinogen',
    dDimer: 'D-dimer',
    albumin: 'Albumin',
    sodium: 'Sodium',
    bunCreatRatio: 'BUN/creatinine ratio',
    crp: 'CRP',
    hsCrp: 'hs-CRP',
    homocysteine: 'Homocysteine',
    triglycerides: 'Triglycerides',
    tag: 'Triglycerides',
    alt: 'ALT',
    ast: 'AST',
    alp: 'ALP',
    ggt: 'GGT',
    glucose: 'Glucose',
    insulin: 'Insulin',
    hba1c: 'HbA1c',
    urea: 'Urea',
    creatinine: 'Creatinine',
    egfr: 'eGFR',
    wbc: 'WBC',
    neutrophils: 'Neutrophils',
    lymphocytes: 'Lymphocytes',
    eosinophils: 'Eosinophils',
    linoleic: 'Linoleic acid',
    arachidonic: 'Arachidonic acid',
    calcitriol: '1,25-(OH)₂D / calcitriol',
    magnesiumRBC: 'RBC magnesium',
    calcium: 'Total calcium',
    calciumIonized: 'Ionized calcium',
    nonHdl: 'Non-HDL cholesterol',
    phosphorus: 'Phosphorus',
    ferritin: 'Ferritin',
    iron: 'Serum iron',
    lh: 'LH',
    fsh: 'FSH',
    prolactin: 'Prolactin',
    lpA: 'Lp(a)',
    lpa: 'Lp(a)',
    hct: 'Hematocrit',
    hgb: 'Hemoglobin',
    mch: 'MCH',
    mcv: 'MCV',
    apoB: 'ApoB',
    apoA1: 'ApoA1',
    shbg: 'SHBG',
    dheaS: 'DHEA-S',
    igf1: 'IGF-1',
    ft3: 'Free T3',
    tsh: 'TSH',
    ck: 'Creatine kinase',
    vitaminD: '25-OH vitamin D',
    b12: 'Vitamin B12',
    activeB12: 'Active B12',
    cPeptide: 'C-peptide',
    fructosamine: 'Fructosamine',
    selenium: 'Selenium',
    lactate: 'Lactate',
    pyruvate: 'Pyruvate',
  };
  if (item?.key && byKey[item.key]) return byKey[item.key];
  return String(item?.label || '')
    .replace(/^B12 status \(active or total B12\)$/i, 'Active or total B12')
    .replace(/\s+pituitary signal$/i, '')
    .replace(/\s+genetic risk$/i, '')
    .replace(/\s+concentration$/i, '')
    .replace(/\s+red-cell ironization$/i, '')
    .replace(/\s+red-cell size$/i, '')
    .replace(/\s*\/\s*plasma viscosity context/gi, '')
    .replace(/\s+brake context$/i, '')
    .replace(/\s+activation context$/i, '')
    .replace(/\s+hydration context$/i, '')
    .replace(/\s+plasma context$/i, '')
    .replace(/\s+storage context$/i, '')
    .replace(/\s+context for ferritin$/i, '')
    .replace(/\s+availability context$/i, '')
    .replace(/\s+adrenal reserve context$/i, '')
    .replace(/\s+repair signal$/i, '')
    .replace(/\s+recovery\/bone context$/i, '')
    .replace(/\s+oxygen-carrying context$/i, '')
    .replace(/\s+metabolic context$/i, '')
    .replace(/\s+tissue stress$/i, '')
    .replace(/\s+tissue-energy stress$/i, '')
    .replace(/\s+protein-turnover context$/i, '')
    .replace(/\s+muscle\/kidney context$/i, '')
    .replace(/\s+stress load$/i, '')
    .replace(/\s+stress skew$/i, '')
    .replace(/\s+stress suppression context$/i, '')
    .replace(/\s+stress context$/i, '')
    .replace(/\s+axis context$/i, '')
    .replace(/\s+androgen conversion context$/i, '')
    .replace(/\s+androgen precursor context$/i, '')
    .replace(/\s+adrenal androgen context$/i, '')
    .replace(/\s+hormone-axis context$/i, '')
    .replace(/\s+nerve support$/i, '')
    .replace(/\s+nerve\/vascular stress$/i, '')
    .replace(/\s+neuromuscular context$/i, '')
    .replace(/\s+nerve stress$/i, '')
    .replace(/\s+nerve context$/i, '')
    .replace(/\s+context$/i, '')
    .trim();
}

/** @param {any[]} markers */
export function labelMarkers(markers) {
  return (markers || []).map(markerDisplayLabel);
}

/** @param {any} score */
export function effectiveMissingMarkers(score) {
  const coveredCoreGroups = new Set((score.available || [])
    .filter(item => item.coreGroup && item.core !== false && !item.profileContextOnly)
    .map(item => item.coreGroup));
  const seenGroups = new Set();
  return (score.missing || [])
    .filter(item => !item.coreGroup || !coveredCoreGroups.has(item.coreGroup))
    .map(item => {
      if (score.id === 'fluidFiltrationCoherence' && score.profileContext?.lowMuscleMass && item.coreGroup === 'filtration') {
        const alternative = score.missing.find(i => i.key === 'gfrCystatin');
        if (alternative) return { ...alternative, coreGroupLabel: 'Cystatin-C eGFR (creatinine is unreliable)', label: 'Cystatin-C eGFR' };
      }
      return item.coreGroup ? { ...item, label: item.coreGroupLabel || item.label } : item;
    })
    .filter(item => {
      if (!item.coreGroup) return true;
      if (seenGroups.has(item.coreGroup)) return false;
      seenGroups.add(item.coreGroup);
      return true;
    });
}

/** @param {any} score */
export function effectiveContextMarkers(score, { unresolvedOnly = false } = {}) {
  const seen = new Set();
  return (score.available || [])
    .filter(item => item.profileContextOnly || item.contextLimited)
    .filter(item => !unresolvedOnly || contextOnlyNeedsMoreData(item))
    .filter(item => {
      const key = item.coreGroup || item.dotKey || item.path || item.key || item.label;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** @param {any[]} scores */
function uniqueMissingMarkers(scores, { coreOnly = false, limit = 12 } = {}) {
  const seen = new Set();
  const markers = [];
  for (const score of scores) {
    for (const item of effectiveMissingMarkers(score)) {
      if (item.plannerOptional === false || item.contextOnly) continue;
      if (coreOnly && !item.core) continue;
      const path = item.dotKey || item.path;
      const key = item.coreGroup || path || item.key || item.label;
      if (!key || seen.has(key) || (path && seen.has(path))) continue;
      seen.add(key);
      if (path) seen.add(path);
      markers.push({ ...item, scoreTitle: score.title, panelTier: score.panelTier });
      if (markers.length >= limit) return markers;
    }
  }
  return markers;
}

/** @param {any[]} markers */
function uniqueByMarker(markers, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const item of markers) {
    const key = item.coreGroup || item.dotKey || item.path || item.key || item.label;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** @param {any[]} markers */
function bundle(markers, emptyText) {
  return { markers, labels: labelMarkers(markers), emptyText };
}

export function optionalMarkerReason(item) {
  if (item.conditionalReason) return item.conditionalReason;
  const reasons = { uacr: 'Adds kidney-damage information beyond filtration.', lpA: 'Adds an inherited lipoprotein dimension beyond ApoB.', nonHdl: 'Calculated from total cholesterol and HDL; no separate assay.', hba1c: 'Adds longer-term glucose context; consider red-cell and iron factors.', albumin: 'Helps interpret total calcium and protein context.', calciumIonized: 'Can clarify calcium status when total calcium is difficult to interpret.', pth: 'Helps explain a calcium–phosphate pattern.', mma: 'Can clarify an unresolved B12 result; kidney function matters.', ft3: 'Adds active thyroid-hormone context to TSH and FT4.' };
  return reasons[item.key] || `Consider for a specific question about ${item.scoreTitle || 'this marker pattern'}.`;
}

function optionalPriority(item) {
  const keys = ['uacr', 'lpA', 'nonHdl', 'hba1c', 'albumin', 'calciumIonized', 'pth', 'mma', 'ft3'];
  const index = keys.indexOf(item.key);
  return index < 0 ? keys.length : index;
}

export function buildBiologyScoreCoveragePlannerModel(detailScores, coherence) {
  const baselineScores = detailScores.filter(score => score.panelTier !== 'extended');
  const advancedScores = detailScores.filter(score => score.panelTier === 'extended');
  const baselineCoverage = Math.round(((coherence?.coverage || 0) * 100));
  const liveDomains = coherence?.available?.length || 0;
  const missingDomains = coherence?.missing?.length || 0;
  const baselineCoreMissing = uniqueMissingMarkers(baselineScores, { coreOnly: true, limit: Infinity });
  const baselineUsefulMissing = uniqueMissingMarkers(baselineScores, { coreOnly: false, limit: Infinity });
  const advancedMissing = uniqueMissingMarkers(advancedScores, { coreOnly: false, limit: Infinity });
  const coreShortlist = baselineCoreMissing;
  const conditionalAlternatives = baselineScores.flatMap(score => {
    const keys = score.id === 'boneMineralSignal' && score.available.some(i => i.key === 'calcium' && i.contextLimited)
      ? ['calciumIonized'] : score.id === 'fluidFiltrationCoherence' && score.available.some(i => i.coreGroup === 'filtration' && (i.contextLimited || (i.profileContextOnly && /muscle|creatinine.*unreliable/i.test(i.contextReason)))) ? ['gfrCystatin'] : [];
    return keys.flatMap(key => {
      if (score.available.some(i => i.key === key && !i.profileContextOnly && !i.contextLimited)) return [];
      const item = [...score.missing, ...score.available].find(i => i.key === key);
      if (!item || coreShortlist.some(i => i.coreGroup === item.coreGroup)) return [];
      return [{ ...item, core: false, coreGroup: '', coreGroupLabel: '', scoreTitle: score.title,
        conditionalReason: key === 'calciumIonized' ? 'Can clarify total calcium when albumin limits its interpretation.' : 'Provides an alternative filtration estimate when creatinine-based results need context.' }];
    });
  });
  const optionalUpgrades = uniqueByMarker([
    ...conditionalAlternatives,
    ...baselineUsefulMissing.filter(item => !coreShortlist.some(core => (core.coreGroup && core.coreGroup === item.coreGroup) || (core.dotKey || core.path || core.key) === (item.dotKey || item.path || item.key))),
  ], Infinity).sort((a, b) => Number(!!b.conditionalReason) - Number(!!a.conditionalReason) || optionalPriority(a) - optionalPriority(b));
  const advancedDepth = uniqueByMarker(advancedMissing, Infinity);
  const baselineIntro = baselineCoreMissing.length
    ? 'Start with missing core markers. Additional tests can wait until you have a specific question.'
    : baselineScores.some(score => score.contextLimited)
      ? 'Core results are present. Review collection and profile context before adding more tests.'
      : 'Core markers are covered. Choose optional tests only when they help answer a question.';
  const scoreRows = baselineScores.map(score => {
    const effectiveMissing = effectiveMissingMarkers(score).filter(item => item.plannerOptional !== false && !item.contextOnly).sort((a, b) => Number(b.core) - Number(a.core) || optionalPriority(a) - optionalPriority(b));
    const contextNeeded = effectiveContextMarkers(score, { unresolvedOnly: true });
    const coreMissing = effectiveMissing.filter(item => item.core);
    const coreContext = contextNeeded.filter(item => item.core);
    const usefulMissing = coreMissing.length ? coreMissing : coreContext.length ? coreContext : effectiveMissing.length ? effectiveMissing.slice(0, 4) : contextNeeded.slice(0, 4);
    const coveragePct = Math.round((score.coverage || 0) * 100);
    return { score, usefulMissing, coreMissingCount: coreMissing.length, coreContextCount: coreContext.length, contextCount: contextNeeded.length, coveragePct };
  }).filter(row => row.usefulMissing.length).sort((a, b) => (b.coreMissingCount - a.coreMissingCount) || (b.coreContextCount - a.coreContextCount) || (a.coveragePct - b.coveragePct) || a.score.title.localeCompare(b.score.title));
  return {
    baselineCoverage,
    liveDomains,
    missingDomains,
    baselineCoreMissing,
    baselineUsefulMissing,
    advancedMissing,
    coreShortlist,
    optionalUpgrades,
    advancedDepth,
    baselineIntro,
    scoreRows,
    bundles: {
      baselineFirst: bundle(coreShortlist, 'Baseline core markers covered'),
      optionalUpgrades: bundle(optionalUpgrades, 'No obvious baseline upgrades'),
      advancedDepth: bundle(advancedDepth, 'Advanced scores are optional'),
    },
  };
}

export function formatBiologyScoreCoveragePlannerPrompt(model) {
  const baseline = model.bundles.baselineFirst.labels.length ? model.bundles.baselineFirst.labels.join(', ') : model.bundles.baselineFirst.emptyText;
  const optional = model.bundles.optionalUpgrades.labels.length ? model.bundles.optionalUpgrades.labels.join(', ') : model.bundles.optionalUpgrades.emptyText;
  const advanced = model.bundles.advancedDepth.labels.length ? model.bundles.advancedDepth.labels.join(', ') : model.bundles.advancedDepth.emptyText;
  const scoreLines = model.scoreRows.map(row => {
    const markers = labelMarkers(row.usefulMissing).join(', ') || 'none';
    const label = row.coreMissingCount
      ? `${row.coreMissingCount} core gap${row.coreMissingCount === 1 ? '' : 's'}`
      : row.coreContextCount
        ? `${row.coreContextCount} context needed`
        : row.contextCount
          ? 'context needed'
          : 'additional context';
    return `- ${row.score.title}: ${markers} (${label}; ${row.coveragePct}% coverage)`;
  }).join('\n') || '- No score-specific baseline gaps.';
  return `Make a lab-order plan from this exact Biology Scores Coverage Planner snapshot. Do not replace it with generic tiers and do not recommend markers already satisfied by an equivalent marker/core group. Calculate HOMA-IR and lipid ratios from same-draw component markers when possible; do not order duplicate derived tests. Non-HDL cholesterol is calculated from total cholesterol minus HDL. Do not add routine D-dimer, reverse T3, zonulin, calcitriol or NfL to complete a wellness panel. Optional tests must answer a concrete unresolved question; retain all existing results as context. A conditional alternative explicitly listed below may resolve a limitation in an existing route; explain that reason rather than treating it as routine duplicate testing. If Active B12 satisfies the B12 group, do not ask for Total vitamin B12 unless you clearly label it optional redundancy.\n\nBaseline coverage: ${model.baselineCoverage}% (${model.liveDomains} live core domains, ${model.missingDomains} missing domains).\nBaseline first / best next lab bundle: ${baseline}.\nOptional tests for specific questions: ${optional}.\nReasons: ${model.optionalUpgrades.map(item => `${markerDisplayLabel(item)}: ${optionalMarkerReason(item)}`).join(' ')}\nAdvanced depth / specialty tests: ${advanced}.\n\nScore-by-score gaps shown in the planner:\n${scoreLines}\n\nPlease turn that exact planner into a concise, user-friendly ordering plan: what to order first, what can wait, and which Biology Scores each marker improves.`;
}
