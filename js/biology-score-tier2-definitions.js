// @ts-nocheck
// biology-score-tier2-definitions.js — contextual Biology Score definitions for recovery and immune patterning.

export const TIER2_BIOLOGY_SCORE_DEFINITIONS = [
  {
    id: 'immuneCellBalance', title: 'Immune Cell Balance', kicker: 'CBC differential pattern', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'immune', coherenceWeight: 1.0,
    summary: 'White-cell count and differential pattern for immune activation, suppression, allergy/eosinophil, and stress-skew context.',
    inputs: [
      { key: 'wbc', label: 'White blood cells', weight: 1.25, paths: 'hematology.wbc' },
      { key: 'neutrophils', label: 'Neutrophils', weight: 1.1, paths: 'differential.neutrophils' },
      { key: 'lymphocytes', label: 'Lymphocytes', weight: 1.1, paths: 'differential.lymphocytes' },
      { key: 'monocytes', label: 'Monocytes', weight: 0.55, paths: 'differential.monocytes' },
      { key: 'eosinophils', label: 'Eosinophils', weight: 0.45, paths: 'differential.eosinophils' },
      { key: 'basophils', label: 'Basophils', weight: 0.25, paths: 'differential.basophils' },
      { key: 'nlr', label: 'Neutrophil/lymphocyte ratio', weight: 0.75, paths: 'calculatedRatios.nlr' },
      { key: 'platelets', label: 'Platelet immune context', weight: 0.35, paths: 'hematology.platelets' },
      { key: 'hsCrp', label: 'hs-CRP inflammation context', weight: 0.45, paths: ['proteins.hsCRP', 'proteins.crp'] },
      { key: 'vitaminD', label: 'Vitamin D immune context', weight: 0.25, paths: 'vitamins.vitaminD' },
    ],
  },
  {
    id: 'anabolicRecoverySignal', title: 'Anabolic Recovery Signal', kicker: 'Build vs breakdown context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'recovery', coherenceWeight: 0.8,
    summary: 'Hormone, protein, inflammation, thyroid, and tissue-stress context for recovery and anabolic/catabolic balance.',
    inputs: [
      { key: 'testosterone', label: 'Total testosterone', weight: 1.05, paths: 'hormones.testosterone', sexWeightScale: { female: 0.35 } },
      { key: 'freeTestosterone', label: 'Free testosterone', weight: 1.25, paths: 'hormones.freeTestosterone', sexWeightScale: { female: 0.35 } },
      { key: 'shbg', label: 'SHBG availability context', weight: 0.55, paths: 'hormones.shbg' },
      { key: 'fai', label: 'Free androgen index', weight: 0.65, paths: 'hormones.fai', sexWeightScale: { female: 0.35 } },
      { key: 'dheaS', label: 'DHEA-S adrenal reserve context', weight: 0.75, paths: 'hormones.dheaS' },
      { key: 'igf1', label: 'IGF-1 repair signal', weight: 0.8, paths: 'hormones.igf1' },
      { key: 'estradiol', label: 'Estradiol recovery/bone context', weight: 0.4, paths: 'hormones.estradiol', sexWeightScale: { female: 1.7 } },
      { key: 'lh', label: 'LH axis context', weight: 0.25, paths: 'hormones.lh' },
      { key: 'fsh', label: 'FSH axis context', weight: 0.25, paths: 'hormones.fsh' },
      { key: 'albumin', label: 'Albumin protein reserve', weight: 0.85, paths: 'proteins.albumin' },
      { key: 'totalProtein', label: 'Total protein', weight: 0.65, paths: 'proteins.totalProtein' },
      { key: 'hemoglobin', label: 'Hemoglobin oxygen-carrying context', weight: 0.45, paths: 'hematology.hemoglobin' },
      { key: 'hsCrp', label: 'Inflammation drag', weight: 0.55, paths: ['proteins.hsCRP', 'proteins.crp'] },
      { key: 'vitaminD', label: 'Vitamin D recovery context', weight: 0.35, paths: 'vitamins.vitaminD' },
      { key: 'ft3', label: 'Free T3 metabolic context', weight: 0.3, paths: 'thyroid.ft3' },
      { key: 'tsh', label: 'TSH thyroid context', weight: 0.25, paths: 'thyroid.tsh' },
      { key: 'ck', label: 'Creatine kinase tissue stress', weight: 0.35, paths: 'biochemistry.creatineKinase' },
      { key: 'urea', label: 'Urea protein-turnover context', weight: 0.25, paths: 'biochemistry.urea' },
      { key: 'creatinine', label: 'Creatinine muscle/kidney context', weight: 0.25, paths: 'biochemistry.creatinine' },
    ],
  },
];
