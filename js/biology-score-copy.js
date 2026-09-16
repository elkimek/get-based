// Biology Score questions. Core and additional panels come from the shared input contract.

export const BIOLOGY_SCORE_COPY = {
  metabolicFlexibility: { scopeLabel: 'Fasting glucose–insulin pattern', question: 'How do fasting glucose, insulin and lipid patterns fit together?' },
  thyroidCoherence: { question: 'How do TSH, Free T4 and Free T3 fit together, and what context could explain disagreement?' },
  cardiovascularLipoprotein: { scopeLabel: 'ApoB particle pattern', question: 'What do these markers show about cholesterol-carrying particles?' },
  redoxStress: { scopeLabel: 'CRP inflammation pattern', question: 'Is there an inflammatory or liver-metabolic burden pattern that could distort recovery and metabolic signaling?' },
  lipidMembrane: { scopeLabel: 'Assay-specific Omega-3 Index', question: 'What does this assay show about fatty-acid balance?' },
  bloodFlowViscosity: { scopeLabel: 'Blood-cell concentration', question: 'What do red-cell concentration, platelets and clotting markers show?' },
  ironHandling: { question: 'Do iron stores, circulating iron and red blood cells tell the same story?' },
  oneCarbonCoherence: { question: 'Do homocysteine, B vitamins and blood counts show consistent one-carbon clues?' },
  fluidFiltrationCoherence: { question: 'What do kidney filtration and electrolyte results show, and could muscle mass affect them?' },
  liverBileSignal: { question: 'How do liver enzymes and bile-related markers fit together?' },
  boneMineralSignal: { question: 'Are vitamin D, calcium-phosphate, kidney, and bone-mineral signals coherent?' },
  immuneCellBalance: { question: 'How do the white blood cell counts and their balance compare with the selected ranges?' },
  anabolicRecoverySignal: { scopeLabel: 'Hormone & protein pattern', boundary: 'Hormones and proteins provide indirect recovery clues and overlap with Hormone Axis. Albumin does not measure muscle protein or nutritional recovery. Read recent training and inflammation alongside them; this score does not measure recovery speed or readiness.', question: 'What do hormones, proteins and training-related markers suggest about recovery?' },
  cellularEnergyCoherence: { scopeLabel: 'Organic-acid pattern', boundary: 'Assay-specific organic acids describe metabolic patterns. They do not quantify energy production or mitochondrial efficiency; collection and creatinine normalization matter.', question: 'What do organic-acid and related markers suggest about cellular energy pathways?' },
  stressResilience: { scopeLabel: 'Timed cortisol & DHEA-S', boundary: 'Cortisol and DHEA-S describe a stress-hormone pattern at collection. Timing matters; a single draw cannot measure resilience or a daily cortisol rhythm.', question: 'How do timed cortisol, DHEA-S and recovery-related markers fit together?' },
  hormoneAxis: { question: 'Are sex hormones and pituitary feedback coherent for this profile’s sex, age, cycle/menopause, and therapy context?' },
  gutImmuneSignal: { scopeLabel: 'Stool & microbial-metabolite clues', boundary: 'Stool inflammation and microbial metabolites are separate clues. The pattern does not establish gut permeability, microbiome composition or a specific organism.', question: 'What do stool, microbial-metabolite and inflammation markers suggest about gut-related patterns?' },
  nerveMuscleSignal: { question: 'How do muscle-stress and B-vitamin markers fit together?' },
};

export function getBiologyScoreCopy(scoreId) {
  return BIOLOGY_SCORE_COPY[scoreId] || {};
}
