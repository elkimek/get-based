// @ts-nocheck
// biology-score-mappings.js — audit metadata for non-generic Biology Scores.

export const CUSTOM_BIOLOGY_SCORE_MAPPINGS = {
  mitoThyroid: [
    { key: 'ft3', label: 'Free T3', weight: 1, paths: 'thyroid.ft3' },
    { key: 'tsh', label: 'TSH', weight: 1, paths: 'thyroid.tsh' },
    { key: 'tag', label: 'Triglycerides', weight: 1, paths: 'lipids.triglycerides' },
  ],
  thyroidCoherence: [
    { key: 'tsh', label: 'TSH', weight: 1.0, paths: 'thyroid.tsh' },
    { key: 'ft3', label: 'Free T3', weight: 1.3, paths: 'thyroid.ft3' },
    { key: 'ft4', label: 'Free T4 / conversion', weight: 1.35, paths: 'thyroid.ft4' },
    { key: 'reverseT3', label: 'Reverse T3 brake context', weight: 0.45, paths: ['thyroid.reverseT3', 'thyroid.rT3', 'thyroid.rt3'] },
    { key: 'tpoAb', label: 'TPO antibody context', weight: 0.35, paths: ['thyroid.tpoAb', 'thyroid.antiTPO', 'thyroid.aTPO'] },
    { key: 'tgAb', label: 'Thyroglobulin antibody context', weight: 0.25, paths: ['thyroid.tgAb', 'thyroid.antiTG', 'thyroid.aTG'] },
  ],
  bloodFlowViscosity: [
    { key: 'hct', label: 'Hematocrit concentration', weight: 1.15, paths: 'hematology.hematocrit' },
    { key: 'hgb', label: 'Hemoglobin concentration', weight: 0.75, paths: 'hematology.hemoglobin' },
    { key: 'platelets', label: 'Platelet count context', weight: 0.55, paths: 'hematology.platelets' },
    { key: 'fibrinogen', label: 'Fibrinogen / plasma viscosity context', weight: 0.95, paths: 'coagulation.fibrinogen' },
    { key: 'dDimer', label: 'D-dimer activation context', weight: 0.8, paths: ['coagulation.dDimer', 'coagulation.d_dimer'] },
    { key: 'albumin', label: 'Albumin plasma context', weight: 0.35, paths: 'proteins.albumin' },
    { key: 'sodium', label: 'Sodium hydration context', weight: 0.25, paths: 'electrolytes.sodium' },
    { key: 'bunCreatRatio', label: 'BUN/creatinine hydration context', weight: 0.35, paths: 'calculatedRatios.bunCreatRatio' },
    { key: 'crp', label: 'Inflammation context', weight: 0.35, paths: ['proteins.hsCRP', 'proteins.crp'] },
  ],
  ironHandling: [
    { key: 'ferritin', label: 'Ferritin storage context', weight: 1.15, paths: 'iron.ferritin' },
    { key: 'transferrinSat', label: 'Transferrin saturation', weight: 1.25, paths: 'iron.transferrinSat' },
    { key: 'hgb', label: 'Hemoglobin utilization', weight: 0.8, paths: 'hematology.hemoglobin' },
    { key: 'mch', label: 'MCH red-cell ironization', weight: 0.65, paths: 'hematology.mch' },
    { key: 'mcv', label: 'MCV red-cell size', weight: 0.5, paths: 'hematology.mcv' },
    { key: 'iron', label: 'Serum iron context', weight: 0.55, paths: 'iron.iron' },
    { key: 'transferrin', label: 'Transferrin transport', weight: 0.45, paths: 'iron.transferrin' },
    { key: 'tibc', label: 'TIBC transport capacity', weight: 0.35, paths: 'iron.tibc' },
    { key: 'sTfR', label: 'Soluble transferrin receptor', weight: 0.55, paths: ['iron.solubleTransferrinReceptor', 'iron.sTfR', 'iron.transferrinReceptor'] },
    { key: 'crp', label: 'Inflammation context for ferritin', weight: 0.45, paths: ['proteins.hsCRP', 'proteins.crp'] },
    { key: 'copper', label: 'Copper support', weight: 0.35, paths: 'electrolytes.copper' },
    { key: 'ceruloplasmin', label: 'Ceruloplasmin', weight: 0.3, paths: 'proteins.ceruloplasmin' },
  ],
};
