// Deterministic Biology score definitions and calculation. UI, AI and event lifecycle live separately.
import { filterDatesByRange } from './data.js';
import { computeBiologicalCoherence } from './biology-score-coherence.js';
import { assessScoreRecency } from './biology-score-dates.js';
import { getScoreInputs } from './biology-score-contract.js';
import { addScoreInterpretation } from './biology-score-methodology.js';
import { getBiologyScoreCopy } from './biology-score-copy.js';
import { computeWeightedComposite, computeBloodFlowSignals, computeIronHandling, computeThyroidCoherence } from './biology-score-engine.js';
import { TIER1_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier1-definitions.js';
import { TIER2_BIOLOGY_SCORE_DEFINITIONS } from './biology-score-tier2-definitions.js';
import { getBiologyProfileContext } from './profile-context.js';
import { state } from './state.js';
import type { BiologyData, BiologyDefinition, BiologyComputedDomain, BiologyInterpretedDomain, BiologyOverview, BiologyScore } from '../types/biology-scores.js';
import type { ScoreOptions } from './biology-score-types.js';

// Existing scoring helpers read range settings from state. Capture each view
// synchronously and restore both settings before any render, write or await.
export function computeBiologyScoreView(data: BiologyData, view: unknown, options: ScoreOptions = {}) {
  const previous = { rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter };
  try {
    Object.assign(state, view);
    return computeBiologyScores((filterDatesByRange as (data: BiologyData, options: Parameters<typeof filterDatesByRange>[1]) => BiologyData)(data, { fallbackToAll: false }), options);
  } finally { Object.assign(state, previous); }
}

// These assays share schema suffixes; keep their ordered fallback paths together.
function fattyAcidPaths(marker: string, biostarksMarker = '') {
  const paths = ['fattyAcids', 'spadiaFA', 'omegaquantFA', 'zinzinoFA', 'metabolomixFA', 'fattyAcidsTest'].map(group => `${group}.${marker}`);
  if (biostarksMarker) paths.push(`biostarksFA.${biostarksMarker}`);
  return paths;
}

export const SCORE_DEFINITIONS: BiologyDefinition[] = [
  {
    id: 'biologicalCoherence', title: 'Biological Coherence', kicker: 'System-level signal', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'overview',
    summary: 'A single read across your marker patterns. Strong domains show where your system is coherent; strained ones point to where retesting or deeper context helps.', compute: (data: BiologyData, def: BiologyDefinition, options: ScoreOptions = {}) => (computeBiologicalCoherence as (data: BiologyData, def: BiologyDefinition, definitions: BiologyDefinition[], compute: (data: BiologyData, definitions: BiologyDefinition[]) => BiologyComputedDomain[]) => BiologyOverview)(data, def, SCORE_DEFINITIONS, (input, defs) => computeBiologyScoresInternal(input, defs, options)),
  },
  {
    id: 'metabolicFlexibility', title: 'Metabolic Flexibility', kicker: 'Glucose-insulin strain', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'metabolic', coherenceWeight: 1.2,
    summary: 'A practical fasting-lab proxy for fuel flexibility, anchored on glucose-insulin pressure and triglyceride/HDL handling.',
    compute: computeWeightedComposite,
    inputs: [
      { key: 'homaIR', label: 'HOMA-IR', weight: 1.7, paths: 'diabetes.homaIR', core: true },
      { key: 'insulin', label: 'Fasting insulin', weight: 1.45, paths: 'diabetes.insulin', core: true },
      { key: 'glucose', label: 'Fasting glucose', weight: 0.95, paths: 'biochemistry.glucose', core: true },
      { key: 'hba1c', label: 'HbA1c', weight: 0.85, paths: 'diabetes.hba1c' },
      { key: 'tgHdlRatio', label: 'TG/HDL ratio', weight: 1.15, paths: 'calculatedRatios.tgHdlRatio', core: true },
      { key: 'tag', label: 'Triglycerides', weight: 0.75, paths: 'lipids.triglycerides' },
      { key: 'hdl', label: 'HDL', weight: 0.55, paths: 'lipids.hdl' },
      { key: 'cPeptide', label: 'C-peptide', weight: 0.35, paths: 'diabetes.cPeptide' },
      { key: 'fructosamine', label: 'Fructosamine', weight: 0.3, paths: 'diabetes.fructosamine' },
    ],
  },
  {
    id: 'thyroidCoherence', title: 'Thyroid Coherence', kicker: 'Signal quality', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'endocrine', coherenceWeight: 1.0,
    summary: 'TSH and Free T4 core pattern with additional Free T3, antibody and conversion context.', compute: computeThyroidCoherence,
  },
  {
    id: 'cardiovascularLipoprotein', title: 'Cardiovascular Risk', kicker: 'Lipoprotein pattern', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'cardiovascular', coherenceWeight: 1.1,
    summary: 'ApoB and related lipoprotein patterns; a marker summary, not an event-risk calculation.',
    compute: computeWeightedComposite,
    inputs: [
      { key: 'apoB', label: 'ApoB', weight: 2.0, paths: ['lipids.apoB', 'lipids.apoB_'], core: true },
      { key: 'apoBA1Ratio', label: 'ApoB/ApoA1 ratio', weight: 1.5, paths: ['calculatedRatios.apoBapoAIRatio', 'calculatedRatios.apoBA1Ratio'], core: true },
      { key: 'apoA1', label: 'ApoA1', weight: 1.0, paths: ['lipids.apoAI', 'lipids.apoA1'] },
      { key: 'lpA', label: 'Lp(a)', weight: 1.0, paths: ['lipids.lpA', 'lipids.lpa', 'lipids.lp_a'] },
      { key: 'ldl', label: 'LDL cholesterol', weight: 0.8, paths: ['lipids.ldl', 'lipids.ldlCholesterol', 'calculatedRatios.ldl'] },
      { key: 'nonHdl', label: 'Non-HDL cholesterol', weight: 0.8, paths: 'lipids.nonHdl' },
      { key: 'cholHdlRatio', label: 'Total cholesterol/HDL ratio', weight: 0.6, paths: ['calculatedRatios.cholHdlRatio', 'lipids.cholHdlRatio'] },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.5, paths: 'coagulation.homocysteine', recencyRequired: false },
      { key: 'hsCrp', label: 'hs-CRP', weight: 0.4, paths: 'proteins.hsCRP', recencyRequired: false },
      { key: 'triglycerides', label: 'Triglycerides', weight: 0.4, paths: 'lipids.triglycerides', recencyRequired: false },
    ],
  },
  {
    id: 'redoxStress', title: 'Inflammatory Load', kicker: 'Metabolic burden context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'inflammation', coherenceWeight: 1.0,
    summary: 'CRP or hs-CRP anchors inflammation; liver-metabolic and nutrient markers add context.', compute: computeWeightedComposite,
    inputs: [
      { key: 'hsCrp', label: 'hs-CRP', weight: 1.55, paths: 'proteins.hsCRP', core: true },
      { key: 'crp', label: 'CRP', weight: 0.55, paths: 'proteins.crp' },
      { key: 'ggt', label: 'GGT', weight: 1.25, paths: 'biochemistry.ggt', core: true },
      { key: 'uricAcid', label: 'Uric acid', weight: 0.6, paths: 'biochemistry.uricAcid' },
      { key: 'ferritin', label: 'Ferritin', weight: 0.45, paths: 'iron.ferritin' },
      { key: 'homocysteine', label: 'Homocysteine', weight: 0.55, paths: 'coagulation.homocysteine' },
      { key: 'bilirubin', label: 'Bilirubin', weight: 0.25, paths: 'biochemistry.bilirubinTotal' },
      { key: 'vitaminD', label: '25-OH vitamin D', weight: 0.3, paths: 'vitamins.vitaminD' },
      { key: 'selenium', label: 'Selenium', weight: 0.25, paths: 'electrolytes.selenium' },
      { key: 'seleniumUrine', label: 'Urine selenium', weight: 0.25, paths: 'nutrientElements.selenium' },
      { key: 'seleniumRBC', label: 'RBC selenium', weight: 0.25, paths: 'biostarksMineral.selenium' },
    ],
  },
  {
    id: 'lipidMembrane', title: 'Lipid Membrane', kicker: 'Fatty-acid architecture', evidence: 'contextual', panelTier: 'extended', coherenceDomain: 'membrane', coherenceWeight: 1.0,
    summary: 'Assay-specific fatty-acid patterns, including omega-3 status and lipid balance.', compute: computeWeightedComposite,
    inputs: [
      { key: 'omega3Index', label: 'Omega-3 index', weight: 2.0, core: true, paths: fattyAcidPaths('omega3Index', 'omega3Index') },
      { key: 'dha', label: 'DHA', weight: 1.15, paths: fattyAcidPaths('dhaC22_6', 'dha') },
      { key: 'epa', label: 'EPA', weight: 0.9, paths: fattyAcidPaths('epaC20_5', 'epa') },
      { key: 'aaEpa', label: 'AA/EPA ratio', weight: 0.55, paths: fattyAcidPaths('aaEpaRatio') },
      { key: 'omega6to3', label: 'Omega-6/3 ratio', weight: 0.45, paths: fattyAcidPaths('omega6to3Ratio') },
      { key: 'dpa', label: 'DPA', weight: 0.25, paths: fattyAcidPaths('dpaC22_5') },
      { key: 'linoleic', label: 'Linoleic acid', weight: 0.25, paths: fattyAcidPaths('linoleicC18_2', 'linoleicAcid') },
      { key: 'arachidonic', label: 'Arachidonic acid', weight: 0.25, paths: fattyAcidPaths('arachidonicC20_4') },
    ],
  },
  {
    id: 'bloodFlowViscosity', title: 'Blood Flow Context', kicker: 'Flow context', evidence: 'experimental', panelTier: 'minimum', coherenceDomain: 'blood', coherenceWeight: 0.8,
    summary: 'Blood concentration and clotting-context signals; experimental and not a direct blood-viscosity measurement.', compute: computeBloodFlowSignals,
  },
  {
    id: 'ironHandling', title: 'Iron Handling', kicker: 'Transport + storage', evidence: 'production', panelTier: 'minimum', coherenceDomain: 'blood', coherenceWeight: 1.2,
    summary: 'Rule-based iron availability, storage, overload, inflammation, and red-cell utilization context.', compute: computeIronHandling,
  },
  ...TIER1_BIOLOGY_SCORE_DEFINITIONS.map(def => ({ ...def, compute: computeWeightedComposite })),
  ...TIER2_BIOLOGY_SCORE_DEFINITIONS.map(def => ({ ...def, compute: computeWeightedComposite })),
];

function computeBiologyScoresInternal(data: BiologyData, definitions: BiologyDefinition[], options: ScoreOptions = {}): BiologyInterpretedDomain[] {
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const computeOptions = { ...options, profileContext };
  return definitions.map((def) => {
    const result = addScoreInterpretation((def.compute as (data: BiologyData, definition: BiologyDefinition, options: ScoreOptions) => BiologyComputedDomain)(data, def, computeOptions));
    const rows = [...result.available, ...result.missing];
    const labels = (core: boolean) => [...new Set(rows.filter(i => !!i.core === core).map(i => i.coreGroupLabel || i.label))];
    return { ...getBiologyScoreCopy(def.id), ...result, basicInputs: labels(true), extendedInputs: labels(false) };
  });
}

export function computeBiologyScores(data: BiologyData, options: ScoreOptions = {}): BiologyScore[] {
  const components = computeBiologyScoresInternal(data, SCORE_DEFINITIONS.filter(d => d.id !== 'biologicalCoherence'), options);
  const overview = (computeBiologicalCoherence as (data: BiologyData, definition: BiologyDefinition, definitions: BiologyDefinition[], compute: (data: BiologyData, definitions: BiologyDefinition[]) => BiologyComputedDomain[]) => BiologyOverview)(data, SCORE_DEFINITIONS[0]!, SCORE_DEFINITIONS, (_data, defs) => components.filter(s => defs.some(d => d.id === s.id)));
  // Keep a separate historical overview when no current domain can be computed.
  // Current score/coverage remain unchanged for AI and other data consumers.
  if (!Number.isFinite(overview.rawScore) && overview.available.length === 0) {
    const historical = components.filter(s => Number.isFinite(s.rawScore) && ['stale', 'mixed-dates'].includes(s.recencyStatus));
    if (historical.length) {
      const snapshot = (computeBiologicalCoherence as (data: BiologyData, definition: BiologyDefinition, definitions: BiologyDefinition[], compute: (data: BiologyData, definitions: BiologyDefinition[]) => BiologyComputedDomain[]) => BiologyOverview)(data, SCORE_DEFINITIONS[0]!, SCORE_DEFINITIONS,
        (_data, defs) => components.filter(s => defs.some(d => d.id === s.id)).map(s => historical.includes(s) ? { ...s, score: s.rawScore } : s));
      const markers = historical.filter(s => s.panelTier !== 'extended').flatMap(s => s.available.filter(i => i.core && !i.profileContextOnly));
      const recency = assessScoreRecency(markers);
      if (Number.isFinite(snapshot.rawScore)) overview.historicalSnapshot = { ...snapshot, score: null, presentationDates: markers.map(i => i.date),
        recencyStatus: recency.status, recencyBadge: recency.badge, recencyMessage: recency.message };
    }
  }
  const displayed = overview.historicalSnapshot || overview;
  const contributorIds = new Set(displayed.available.flatMap(domain => domain.contributorIds || []));
  const historicalOverview = !Number.isFinite(displayed.score) && Number.isFinite(displayed.rawScore);
  for (const score of components) {
    const included = contributorIds.has(score.id);
    const optional = score.panelTier === 'extended';
    const reason = score.recencyStatus === 'stale' ? 'Older results' : score.recencyStatus === 'mixed-dates' ? 'Mixed dates' : score.recencyStatus === 'unknown-date' ? 'Check dates' : 'Needs inputs or context';
    score.overviewMembership = { included, optional, label: optional ? 'Optional · Outside overview' : included ? historicalOverview ? 'In historical overview' : Number.isFinite(displayed.rawScore) ? 'In overview' : 'Ready for overview' : `Excluded · ${reason}` };
  }
  overview.membership = components.filter(s => s.panelTier !== 'extended').map(s => ({ id: s.id, title: s.title, domain: s.coherenceDomain, ...s.overviewMembership! }));
  if (overview.historicalSnapshot) overview.historicalSnapshot.membership = overview.membership!;
  return [overview, ...components].map(score => ({ ...score, aiRangeMode: state.rangeMode }));
}

export function getBiologyScoreMapping() {
  return SCORE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    evidence: def.evidence || 'experimental',
    panelTier: def.panelTier || 'minimum',
    coherenceDomain: def.coherenceDomain || null,
    coherenceWeight: def.coherenceWeight || 1,
    inputs: getScoreInputs(def).map((input) => ({
      key: input.key,
      label: input.label,
      weight: input.weight,
      paths: Array.isArray(input.paths) ? input.paths : [input.paths],
      recencyRequired: input.recencyRequired !== false,
      core: input.core === true,
      coreGroup: input.coreGroup || '',
      coreGroupLabel: input.coreGroupLabel || '',
      evidenceGroup: input.evidenceGroup,
      contextOnly: input.contextOnly || '',
      coreSex: Array.isArray(input.coreSex) ? input.coreSex : [],
    })),
    formula: def.id === 'biologicalCoherence' ? 'fixed-domain-core-composite' : 'grouped-core-range-fit',
  }));
}

export function getBiologyScoreWidgetDefinitions() {
  return SCORE_DEFINITIONS.map((def) => ({
    id: `biology-score-${def.id}`,
    scoreId: def.id,
    source: 'Biology Scores',
    title: def.title,
    description: def.summary,
    size: def.id === 'biologicalCoherence' ? 'full' : 'half',
  }));
}

