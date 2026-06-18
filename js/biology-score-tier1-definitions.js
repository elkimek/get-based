// @ts-nocheck
// biology-score-tier1-definitions.js — additional getbased-native Biology Score definitions.

export const TIER1_BIOLOGY_SCORE_DEFINITIONS = [
  {
    id: 'oneCarbonCoherence', title: 'Methylation', kicker: 'Homocysteine + B vitamins', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'methylation', coherenceWeight: 1.0,
    summary: 'Homocysteine, B12/folate, and red-cell context for methylation/one-carbon coherence.',
    inputs: [
      { key: 'homocysteine', label: 'Homocysteine load', weight: 1.8, paths: 'coagulation.homocysteine', core: true },
      { key: 'activeB12', label: 'Active B12 / holotranscobalamin', weight: 1.15, paths: ['vitamins.activeB12', 'vitamins.holotranscobalamin', 'vitamins.holoTC', 'custom.activeB12', 'custom.activeVitaminB12', 'custom.holotranscobalamin', 'custom.holoTC'], core: true, coreGroup: 'b12Status', coreGroupLabel: 'B12 status (active or total B12)' },
      { key: 'b12', label: 'Total vitamin B12', weight: 0.85, paths: 'vitamins.vitaminB12', core: true, coreGroup: 'b12Status', coreGroupLabel: 'B12 status (active or total B12)' },
      { key: 'folate', label: 'Folate', weight: 1.1, paths: 'vitamins.folate', core: true },
      { key: 'mma', label: 'Methylmalonic acid', weight: 0.7, paths: ['oatNutritional.methylmalonic', 'vitamins.methylmalonicAcid', 'vitamins.mma'], recencyRequired: false },
      { key: 'mcv', label: 'MCV red-cell size', weight: 0.45, paths: 'hematology.mcv', recencyRequired: false },
      { key: 'mch', label: 'MCH red-cell hemoglobin', weight: 0.25, paths: 'hematology.mch', recencyRequired: false },
      { key: 'rdw', label: 'RDW size variation', weight: 0.25, paths: ['hematology.rdwcv', 'hematology.rdw'], recencyRequired: false },
      { key: 'creatinine', label: 'Creatinine clearance context', weight: 0.25, paths: 'biochemistry.creatinine', recencyRequired: false },
    ],
  },
  {
    id: 'fluidFiltrationCoherence', title: 'Kidney & Hydration', kicker: 'Filtration + electrolyte context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'kidney', coherenceWeight: 1.0,
    summary: 'Kidney filtration, hydration, and electrolyte context that can distort interpretation of other lab patterns.',
    inputs: [
      { key: 'egfr', label: 'eGFR filtration', weight: 1.45, paths: ['biochemistry.egfr', 'biochemistry.eGFR'], core: true },
      { key: 'creatinine', label: 'Creatinine', weight: 1.0, paths: 'biochemistry.creatinine', core: true },
      { key: 'urea', label: 'Urea/BUN', weight: 0.75, paths: 'biochemistry.urea' },
      { key: 'bunCreatRatio', label: 'BUN/creatinine ratio', weight: 0.65, paths: 'calculatedRatios.bunCreatRatio' },
      { key: 'sodium', label: 'Sodium', weight: 0.85, paths: 'electrolytes.sodium', core: true },
      { key: 'potassium', label: 'Potassium', weight: 0.85, paths: 'electrolytes.potassium', core: true },
      { key: 'chloride', label: 'Chloride', weight: 0.45, paths: 'electrolytes.chloride' },
      { key: 'cystatinC', label: 'Cystatin C', weight: 0.75, paths: 'biochemistry.cystatinC' },
      { key: 'gfrCystatin', label: 'Cystatin-C eGFR', weight: 0.65, paths: 'biochemistry.gfrCystatin' },
      { key: 'albumin', label: 'Albumin plasma context', weight: 0.35, paths: 'proteins.albumin' },
    ],
  },
  {
    id: 'liverBileSignal', title: 'Liver & Bile Flow', kicker: 'Hepatic flow context', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'liver', coherenceWeight: 1.0,
    summary: 'Liver enzyme, bile-flow, protein synthesis, and metabolic burden pattern.',
    inputs: [
      { key: 'alt', label: 'ALT liver-cell signal', weight: 1.15, paths: 'biochemistry.alt', core: true },
      { key: 'ast', label: 'AST liver/muscle signal', weight: 0.9, paths: 'biochemistry.ast', core: true },
      { key: 'ggt', label: 'GGT bile/toxin signal', weight: 1.2, paths: 'biochemistry.ggt', core: true },
      { key: 'alp', label: 'ALP bile/bone context', weight: 0.9, paths: 'biochemistry.alp', core: true },
      { key: 'bilirubin', label: 'Total bilirubin', weight: 0.75, paths: 'biochemistry.bilirubinTotal' },
      { key: 'albumin', label: 'Albumin synthesis context', weight: 0.55, paths: 'proteins.albumin' },
      { key: 'platelets', label: 'Platelet portal context', weight: 0.35, paths: 'hematology.platelets' },
      { key: 'deRitis', label: 'AST/ALT ratio', weight: 0.4, paths: 'calculatedRatios.deRitisRatio' },
      { key: 'ferritin', label: 'Ferritin liver/inflammation context', weight: 0.35, paths: 'iron.ferritin' },
      { key: 'triglycerides', label: 'Triglyceride metabolic context', weight: 0.3, paths: 'lipids.triglycerides' },
    ],
  },
  {
    id: 'boneMineralSignal', title: 'Bone & Mineral Balance', kicker: 'D–calcium coherence', evidence: 'contextual', panelTier: 'minimum', coherenceDomain: 'mineral', coherenceWeight: 1.0,
    summary: 'Vitamin D, calcium-phosphate, kidney, and bone-turnover context for mineral signaling.',
    inputs: [
      { key: 'vitaminD', label: '25-OH vitamin D', weight: 1.45, paths: 'vitamins.vitaminD', core: true },
      { key: 'calcium', label: 'Total calcium', weight: 1.0, paths: 'electrolytes.calciumTotal', core: true },
      { key: 'phosphorus', label: 'Phosphorus', weight: 0.85, paths: 'electrolytes.phosphorus', core: true },
      { key: 'alp', label: 'ALP bone/liver context', weight: 0.75, paths: 'biochemistry.alp' },
      { key: 'magnesium', label: 'Serum magnesium', weight: 0.55, paths: 'electrolytes.magnesium' },
      { key: 'magnesiumRBC', label: 'RBC magnesium', weight: 0.45, paths: ['electrolytes.magnesiumRBC', 'biostarksMineral.magnesium'] },
      { key: 'calcitriol', label: '1,25-(OH)₂D / calcitriol', weight: 0.45, paths: 'vitamins.calcitriol' },
      { key: 'creatinine', label: 'Kidney context', weight: 0.35, paths: 'biochemistry.creatinine' },
      { key: 'egfr', label: 'eGFR kidney context', weight: 0.35, paths: ['biochemistry.egfr', 'biochemistry.eGFR'] },
    ],
  },
];
