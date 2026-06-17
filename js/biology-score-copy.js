// @ts-nocheck
// biology-score-copy.js — user-facing questions and panel expectations for Biology Scores.

export const BIOLOGY_SCORE_COPY = {
  metabolicFlexibility: {
    question: 'Is glucose-insulin handling flexible, or is fasting metabolism showing insulin-resistance pressure?',
    basicInputs: ['Fasting glucose', 'Fasting insulin or HOMA-IR', 'Triglycerides', 'HDL'],
    extendedInputs: ['HbA1c', 'TG/HDL ratio', 'C-peptide', 'Fructosamine'],
  },
  thyroidCoherence: {
    question: 'Is the thyroid axis internally coherent, or is the signal distorted by conversion, brake, or autoimmune context?',
    basicInputs: ['TSH', 'Free T4', 'Free T3'],
    extendedInputs: ['Reverse T3', 'TPO antibodies', 'Thyroglobulin antibodies', 'Total T3/T4 when available'],
  },
  cardiovascularLipoprotein: {
    question: 'Is the lipoprotein pattern atherogenic or protective — and what is the residual risk after standard cholesterol?',
    basicInputs: ['ApoB', 'ApoA1', 'ApoB/ApoA1 ratio', 'LDL cholesterol'],
    extendedInputs: ['Lp(a)', 'Total cholesterol/HDL ratio', 'Homocysteine', 'hs-CRP', 'Triglycerides'],
  },
  redoxStress: {
    question: 'Is there an inflammatory or liver-metabolic burden pattern that could distort recovery and metabolic signaling?',
    basicInputs: ['hs-CRP or CRP', 'GGT'],
    extendedInputs: ['Uric acid', 'Ferritin', 'Homocysteine', 'Vitamin D', 'Selenium'],
  },
  lipidMembrane: {
    question: 'Does the fatty-acid pattern support resilient membrane signaling, or show omega-3/inflammatory lipid gaps?',
    basicInputs: ['Omega-3 index', 'DHA', 'EPA'],
    extendedInputs: ['AA/EPA ratio', 'Omega-6/3 ratio', 'DPA', 'Linoleic acid', 'Arachidonic acid'],
  },
  bloodFlowViscosity: {
    question: 'Are there hemoconcentration, plasma-viscosity, or clotting-context signals that need interpretation?',
    basicInputs: ['Hematocrit', 'Hemoglobin', 'Platelets'],
    extendedInputs: ['Fibrinogen', 'D-dimer', 'Albumin', 'Sodium', 'BUN/creatinine ratio', 'CRP'],
  },
  ironHandling: {
    question: 'Is iron available, stored, inflamed/sequestered, or overloaded — and do red cells reflect usable iron?',
    basicInputs: ['Ferritin', 'Transferrin saturation', 'Hemoglobin', 'MCV/MCH'],
    extendedInputs: ['Serum iron', 'Transferrin/TIBC', 'CRP or hs-CRP', 'Soluble transferrin receptor', 'Copper/ceruloplasmin'],
  },
  oneCarbonCoherence: {
    question: 'Is methylation demand, B-vitamin status, and homocysteine handling coherent?',
    basicInputs: ['Homocysteine', 'Vitamin B12', 'Folate'],
    extendedInputs: ['Methylmalonic acid', 'MCV/MCH/RDW', 'Creatinine/eGFR context', 'B6/PLP when available'],
  },
  fluidFiltrationCoherence: {
    question: 'Are kidney filtration, hydration, and electrolyte signals stable enough to trust the rest of the panel?',
    basicInputs: ['Creatinine', 'eGFR', 'Sodium', 'Potassium'],
    extendedInputs: ['Urea/BUN', 'BUN/creatinine ratio', 'Cystatin C', 'Chloride', 'Albumin'],
  },
  liverBileSignal: {
    question: 'Is the liver enzyme, bile-flow, and detox-burden pattern calm or strained?',
    basicInputs: ['ALT', 'AST', 'GGT', 'ALP', 'Bilirubin'],
    extendedInputs: ['Albumin', 'Platelets', 'AST/ALT ratio', 'Ferritin', 'Triglycerides', 'LDH'],
  },
  boneMineralSignal: {
    question: 'Are vitamin D, calcium-phosphate, kidney, and bone-mineral signals coherent?',
    basicInputs: ['25-OH vitamin D', 'Calcium', 'Phosphorus', 'ALP'],
    extendedInputs: ['Magnesium', 'RBC magnesium', 'Calcitriol', 'Creatinine/eGFR', 'PTH when available'],
  },
  immuneCellBalance: {
    question: 'Does the white-cell pattern look calm, activated, suppressed, allergic, or stress-skewed?',
    basicInputs: ['WBC', 'Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils'],
    extendedInputs: ['Basophils', 'Neutrophil/lymphocyte ratio', 'Platelets', 'hs-CRP', 'Vitamin D', 'B12/folate when relevant'],
  },
  anabolicRecoverySignal: {
    question: 'Is the body showing enough anabolic, protein, and recovery signal — or a catabolic/stressed pattern?',
    basicInputs: ['Testosterone or estradiol context', 'Albumin', 'Total protein', 'CBC basics', 'hs-CRP'],
    extendedInputs: ['Free testosterone', 'SHBG', 'DHEA-S', 'IGF-1', 'LH/FSH', 'Vitamin D', 'Thyroid context', 'Creatine kinase'],
  },
};
