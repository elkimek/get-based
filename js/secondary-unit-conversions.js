// @ts-check
// secondary-unit-conversions.js — Secondary clinical import unit conversions

// ═══════════════════════════════════════════════
// SECONDARY CLINICAL UNITS REGISTRY
// ═══════════════════════════════════════════════
// Authoritative registry mapping biomarkers to almost all globally recognized secondary clinical units
// and their exact conversion factors to SI. Factor definition: value_SI = value_secondary / factor.
export const SECONDARY_UNIT_CONVERSIONS = {
  // Biochemistry
  'biochemistry.glucose': [
    { unit: 'mg/l', factor: 180.18, type: 'multiply' },
    { unit: 'g/l', factor: 0.18018, type: 'multiply' }
  ],
  // Urea: SI unit is mmol/l (urea molecule). Some european mass-concentration units (mg/l, g/l)
  // express the whole urea molecule (MW 60.06).
  // "BUN" mg/dL is handled by the PRIMARY UNIT_CONVERSIONS entry.
  'biochemistry.urea': [
    { unit: 'mg/l', factor: 60.06, type: 'multiply' },
    { unit: 'g/l', factor: 0.06006, type: 'multiply' }
  ],
  'biochemistry.creatinine': [
    { unit: 'mg/l', factor: 0.1131, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'biochemistry.uricAcid': [
    { unit: 'mg/l', factor: 0.1681, type: 'multiply' },
    { unit: 'mmol/l', factor: 0.001, type: 'multiply' }
  ],
  'biochemistry.bilirubinTotal': [
    { unit: 'mg/l', factor: 0.5848, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'biochemistry.bilirubinDirect': [
    { unit: 'mg/l', factor: 0.5848, type: 'multiply' },
    { unit: '\u00b5mol/l', factor: 1, type: 'multiply' }
  ],
  'biochemistry.bilirubinIndirect': [
    { unit: 'mg/l', factor: 0.5848, type: 'multiply' },
    { unit: '\u00b5mol/l', factor: 1, type: 'multiply' }
  ],
  'biochemistry.ast': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.alt': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.alp': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.ggt': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.ldh': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.creatineKinase': [
    { unit: 'mU/ml', factor: 60, type: 'multiply' },
    { unit: 'U/l', factor: 60, type: 'multiply' },
    { unit: 'nkat/l', factor: 1000, type: 'multiply' }
  ],
  'biochemistry.amylase': [
    { unit: 'U/l', factor: 60, type: 'multiply' }
  ],
  'biochemistry.lipase': [
    { unit: 'U/l', factor: 60, type: 'multiply' }
  ],
  'biochemistry.cystatinC': [
    { unit: 'g/l', factor: 0.001, type: 'multiply' },
    { unit: 'mg/l', factor: 1, type: 'multiply' }
  ],
  'biochemistry.osmolality': [
    { unit: 'mmol/kg', factor: 1, type: 'multiply' }
  ],

  // Hormones
  'hormones.testosterone': [
    { unit: 'µg/l', factor: 0.28818, type: 'multiply' },
    { unit: 'ng/ml', factor: 0.28818, type: 'multiply' },
    { unit: 'pg/ml', factor: 288.18, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.freeTestosterone': [
    { unit: 'µg/l', factor: 0.0002885, type: 'multiply' },
    { unit: 'ng/ml', factor: 0.0002885, type: 'multiply' },
    { unit: 'ng/dl', factor: 0.02885, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.estradiol': [
    { unit: 'ng/l', factor: 0.2724, type: 'multiply' },
    { unit: 'nmol/l', factor: 0.001, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.progesterone': [
    { unit: 'µg/l', factor: 0.3145, type: 'multiply' },
    { unit: 'pg/ml', factor: 314.5, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.dheaS': [
    { unit: 'mg/l', factor: 0.3687, type: 'multiply' },
    { unit: 'µg/ml', factor: 0.3687, type: 'multiply' },
    { unit: 'ng/ml', factor: 368.7, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.dht': [
    { unit: 'pg/ml', factor: 288.18, type: 'multiply' },
    { unit: 'ng/ml', factor: 0.28818, type: 'multiply' },
    { unit: 'µg/l', factor: 0.28818, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.igf1': [
    { unit: 'µg/l', factor: 1, type: 'multiply' },
    { unit: 'nmol/l', factor: 0.1307, type: 'multiply' }
  ],
  // WHO 3rd IS 84/500-calibrated assays: 1 µg/L (1 ng/mL) = 21.2 mIU/L.
  'hormones.prolactin': [
    { unit: 'mU/l', factor: 21.2, type: 'multiply' },
    { unit: 'mIU/l', factor: 21.2, type: 'multiply' },
    { unit: 'µU/ml', factor: 21.2, type: 'multiply' },
    { unit: 'µIU/ml', factor: 21.2, type: 'multiply' },
    { unit: 'µg/l', factor: 1, type: 'multiply' }
  ],
  'diabetes.insulin': [
    { unit: 'pmol/l', factor: 6.0, type: 'multiply' },
    { unit: 'mU/l', factor: 1, type: 'multiply' }
  ],
  'diabetes.cPeptide': [
    { unit: 'nmol/l', factor: 0.331, type: 'multiply' }
  ],
  'hormones.acth': [
    { unit: 'pg/ml', factor: 4.541, type: 'multiply' }
  ],
  'hormones.aldosterone': [
    { unit: 'ng/dl', factor: 0.03605, type: 'multiply' }
  ],
  'hormones.lh': [
    { unit: 'U/l', factor: 1, type: 'multiply' }
  ],
  'hormones.fsh': [
    { unit: 'U/l', factor: 1, type: 'multiply' }
  ],
  'hormones.pth': [
    { unit: 'ng/l', factor: 9.43, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.calcitonin': [
    { unit: 'pmol/l', factor: 0.292, type: 'multiply' },
    { unit: 'ng/l', factor: 1, type: 'multiply' }
  ],
  'hormones.bioactiveTestosterone': [
    { unit: 'µg/l', factor: 0.28818, type: 'multiply' },
    { unit: 'ng/ml', factor: 0.28818, type: 'multiply' },
    { unit: 'pg/ml', factor: 288.18, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'hormones.hCG': [
    { unit: 'U/l', factor: 1, type: 'multiply' },
    { unit: 'mU/ml', factor: 1, type: 'multiply' }
  ],
  'tumorMarkers.afp': [
    { unit: 'U/ml', factor: 1, type: 'multiply' },
    { unit: 'kU/l', factor: 1, type: 'multiply' },
    { unit: 'kIU/l', factor: 1, type: 'multiply' },
    { unit: 'ng/ml', factor: 1.21, type: 'multiply' }
  ],

  // Electrolytes
  'electrolytes.calciumTotal': [
    { unit: 'mg/l', factor: 40.08, type: 'multiply' },
    { unit: 'mEq/l', factor: 2, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.calciumIonized': [
    { unit: 'mg/l', factor: 40.08, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.phosphorus': [
    { unit: 'mg/l', factor: 30.97, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.magnesium': [
    { unit: 'mg/l', factor: 24.31, type: 'multiply' },
    { unit: 'mEq/l', factor: 2, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.magnesiumRBC': [
    { unit: 'mg/l', factor: 24.31, type: 'multiply' },
    { unit: 'mEq/l', factor: 2, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.copper': [
    { unit: 'µg/l', factor: 63.55, type: 'multiply' },
    { unit: 'mg/l', factor: 0.06355, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.zinc': [
    { unit: 'µg/l', factor: 65.4, type: 'multiply' },
    { unit: 'mg/l', factor: 0.0654, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'electrolytes.selenium': [
    { unit: '\u00b5g/l', factor: 78.971, type: 'multiply' },
    { unit: '\u00b5mol/l', factor: 1, type: 'multiply' }
  ],

  // Lipids & Proteins
  'lipids.cholesterol': [
    { unit: 'mg/l', factor: 386.7, type: 'multiply' },
    { unit: 'g/l', factor: 0.3867, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'lipids.triglycerides': [
    { unit: 'mg/l', factor: 885.7, type: 'multiply' },
    { unit: 'g/l', factor: 0.8857, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'lipids.hdl': [
    { unit: 'mg/l', factor: 386.7, type: 'multiply' },
    { unit: 'g/l', factor: 0.3867, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'lipids.ldl': [
    { unit: 'mg/l', factor: 386.7, type: 'multiply' },
    { unit: 'g/l', factor: 0.3867, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'lipids.nonHdl': [
    { unit: 'mg/l', factor: 386.7, type: 'multiply' },
    { unit: 'g/l', factor: 0.3867, type: 'multiply' },
    { unit: 'mmol/l', factor: 1, type: 'multiply' }
  ],
  'lipids.apoAI': [
    { unit: 'mg/l', factor: 1000, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],
  'lipids.apoB': [
    { unit: 'mg/l', factor: 1000, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],
  // Lp(a): SI unit is nmol/l (particle count). Mass units (mg/l, mg/dl) report total
  // particle mass and have NO exact molar conversion — the ratio depends on apo(a)
  // isoform size and the assay. ~2.4 nmol/L per mg/dL (i.e. ~0.24 nmol/L per mg/L, so
  // factor 4.167) is a widely-used approximation only; the 2022 EAS consensus
  // discourages mg↔nmol conversion for clinical decisions. Sanity check: Unilabs SK's
  // 0–300 mg/L (= 0–30 mg/dL) upper-normal ≈ 72 nmol/L, near the schema optimalMax 75.
  'lipids.lpA': [
    { unit: 'mg/l', factor: 4.167, type: 'multiply' }
  ],
  'iron.iron': [
    { unit: 'µg/l', factor: 55.85, type: 'multiply' },
    { unit: 'mg/l', factor: 0.05585, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'iron.ferritin': [
    { unit: 'mg/l', factor: 0.001, type: 'multiply' },
    { unit: 'µg/l', factor: 1, type: 'multiply' }
  ],
  'iron.transferrin': [
    { unit: 'mg/l', factor: 1000, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],
  'iron.tibc': [
    { unit: 'µg/l', factor: 55.85, type: 'multiply' },
    { unit: 'mg/l', factor: 0.05585, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'proteins.hsCRP': [
    { unit: 'µg/ml', factor: 1, type: 'multiply' },
    { unit: 'mg/l', factor: 1, type: 'multiply' }
  ],
  'proteins.crp': [
    { unit: 'µg/ml', factor: 1, type: 'multiply' },
    { unit: 'mg/l', factor: 1, type: 'multiply' }
  ],
  'proteins.totalProtein': [
    { unit: 'mg/ml', factor: 1, type: 'multiply' },
    { unit: 'mg/dl', factor: 100, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],
  'proteins.albumin': [
    { unit: 'mg/ml', factor: 1, type: 'multiply' },
    { unit: 'mg/dl', factor: 100, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],
  'proteins.ceruloplasmin': [
    { unit: 'mg/l', factor: 1000, type: 'multiply' },
    { unit: 'g/l', factor: 1, type: 'multiply' }
  ],

  // Bone metabolism and urine protein units common in ANZ reports.
  'boneMetabolism.p1np': [
    { unit: 'ng/l', factor: 1000, type: 'multiply' }
  ],
  'urinalysis.totalProtein': [
    { unit: 'mg/l', factor: 1000, type: 'multiply' }
  ],

  // Thyroid
  'thyroid.tsh': [
    { unit: 'mU/l', factor: 1, type: 'multiply' },
    { unit: 'mIU/l', factor: 1, type: 'multiply' }
  ],
  'thyroid.ft4': [
    { unit: 'ng/l', factor: 0.7769, type: 'multiply' },
    { unit: 'pg/ml', factor: 0.7769, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'thyroid.ft3': [
    { unit: 'ng/l', factor: 0.6513, type: 'multiply' },
    { unit: 'pg/dl', factor: 65.13, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'thyroid.t4total': [
    { unit: 'ng/ml', factor: 0.77687, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'thyroid.t3total': [
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],

  // Vitamins
  'vitamins.vitaminD': [
    { unit: 'µg/l', factor: 0.4006, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'vitamins.vitaminD3': [
    { unit: 'µg/l', factor: 0.4006, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],
  'vitamins.calcitriol': [
    { unit: 'ng/l', factor: 0.4167, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'vitamins.vitaminA': [
    { unit: 'µg/l', factor: 286.5, type: 'multiply' },
    { unit: 'mg/l', factor: 0.2865, type: 'multiply' },
    { unit: 'µmol/l', factor: 1, type: 'multiply' }
  ],
  'vitamins.vitaminB12': [
    { unit: 'ng/l', factor: 1.355, type: 'multiply' },
    { unit: 'pmol/l', factor: 1, type: 'multiply' }
  ],
  'vitamins.folate': [
    { unit: 'µg/l', factor: 0.4413, type: 'multiply' },
    { unit: 'nmol/l', factor: 1, type: 'multiply' }
  ],

  // Hematology
  'hematology.wbc': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'hematology.rbc': [
    { unit: 'T/l', factor: 1, type: 'multiply' },
    { unit: '10^6/µl', factor: 1, type: 'multiply' }
  ],
  'hematology.hemoglobin': [
    { unit: 'mmol/l', factor: 0.06206, type: 'multiply' },
    { unit: 'g/L', factor: 1, type: 'multiply' }
  ],
  'hematology.platelets': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'differential.neutrophils': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'differential.lymphocytes': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'differential.monocytes': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'differential.eosinophils': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ],
  'differential.basophils': [
    { unit: 'g/l', factor: 1, type: 'multiply' },
    { unit: '10^3/µl', factor: 1, type: 'multiply' }
  ]
};
