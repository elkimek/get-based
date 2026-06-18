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
    basicInputs: ['Homocysteine', 'Active or total B12', 'Folate'],
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
  cellularEnergyCoherence: {
    question: 'Do mitochondrial-energy and organic-acid patterns look efficient, or are fuel-handling / fatty-acid oxidation clues accumulating?',
    basicInputs: ['No routine baseline requirement — this is an advanced score'],
    extendedInputs: ['OAT lactate and pyruvate', 'TCA-cycle organic acids', 'Ethylmalonic/adipic/suberic acids', 'CoQ10 organic-acid clue', 'Carnitine', 'CK', 'Free T3'],
  },
  stressResilience: {
    question: 'Does the HPA/stress axis look resilient, or is stress pressure visible through cortisol, DHEA, inflammation, glucose, and thyroid context?',
    basicInputs: ['No routine baseline requirement — this is an advanced score'],
    extendedInputs: ['Cortisol', 'DHEA-S', 'Testosterone/cortisol ratio', 'Glucose/insulin', 'hs-CRP', 'CBC differential', 'Free T3/TSH'],
  },
  hormoneAxis: {
    question: 'Are sex hormones and pituitary feedback coherent for this profile’s sex, age, cycle/menopause, and therapy context?',
    basicInputs: ['Sex hormone status: total/free testosterone, estradiol, or progesterone', 'SHBG', 'Pituitary feedback: LH and FSH'],
    extendedInputs: ['Prolactin', 'DHT', 'Androstenedione', 'DHEA-S', 'Cortisol', 'Cycle-day / menopause / contraception / hormone-therapy context'],
  },
  gutImmuneSignal: {
    question: 'Do gut-barrier, microbiome-adjacent, and immune clues suggest a calm gut-immune interface or a strained one?',
    basicInputs: ['No routine baseline requirement — this is an advanced score'],
    extendedInputs: ['Calprotectin', 'Zonulin', 'Secretory IgA', 'OAT microbial markers', 'hs-CRP', 'Eosinophils', 'Albumin', 'B12 context'],
  },
  nerveMuscleSignal: {
    question: 'Do nerve-muscle support and stress markers look stable, or are neuromuscular energy, methylation, inflammation, or glycation clues strained?',
    basicInputs: ['No routine baseline requirement — this is an advanced score'],
    extendedInputs: ['CK', 'Creatinine/muscle-mass context', 'Active or total B12', 'Homocysteine', 'Vitamin D', 'Magnesium', 'HbA1c/glucose', 'hs-CRP', 'NfL when available'],
  },
};

/**
 * Return profile-aware Biology Score copy without making every renderer know
 * about sex/cycle-specific marker requirements.
 * @param {string} scoreId
 * @param {{sex?: string | null, cycleStatus?: string | null, hormoneTherapy?: boolean}} [profileContext]
 */
export function getBiologyScoreCopy(scoreId, profileContext = {}) {
  const base = BIOLOGY_SCORE_COPY[scoreId] || {};
  if (scoreId !== 'hormoneAxis') return base;
  const therapyContext = profileContext.hormoneTherapy
    ? ['Current hormone therapy / contraception / stimulation context']
    : ['Medication or hormone-therapy context, if relevant'];
  if (profileContext.sex === 'female') {
    return {
      ...base,
      basicInputs: ['Estradiol and/or progesterone', 'SHBG', 'Pituitary feedback: LH and FSH', 'Prolactin', 'Cycle day, menopause, contraception, or hormone-therapy context'],
      extendedInputs: ['Total/free testosterone, DHT, or androstenedione when androgen symptoms or PCOS context matters', 'DHEA-S', 'Cortisol', ...therapyContext],
    };
  }
  if (profileContext.sex === 'male') {
    return {
      ...base,
      basicInputs: ['Total or free testosterone', 'SHBG', 'Pituitary feedback: LH and FSH', 'Prolactin'],
      extendedInputs: ['Estradiol', 'DHT', 'Androstenedione', 'DHEA-S', 'Cortisol', ...therapyContext],
    };
  }
  return {
    ...base,
    basicInputs: ['Sex hormone status appropriate to profile sex', 'SHBG', 'Pituitary feedback: LH and FSH', 'Prolactin'],
    extendedInputs: ['Estradiol/progesterone or testosterone as appropriate', 'DHT', 'Androstenedione', 'DHEA-S', 'Cortisol', 'Cycle/menopause/therapy context when relevant'],
  };
}
