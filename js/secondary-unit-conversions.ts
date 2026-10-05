// secondary-unit-conversions.js — Secondary clinical import unit conversions

// ═══════════════════════════════════════════════
// SECONDARY CLINICAL UNITS REGISTRY
// ═══════════════════════════════════════════════
// Authoritative registry mapping biomarkers to almost all globally recognized secondary clinical units
// and their exact conversion factors to SI. Factor definition: value_SI = value_secondary / factor.
export interface SecondaryUnitConversion {
  unit: string;
  factor: number;
  type: 'multiply' | 'hba1c';
}

/** Each call creates independent mutable records, as the original registry did. */
function multiplyUnits(...units: Array<readonly [unit: string, factor: number]>): SecondaryUnitConversion[] {
  return units.map(([unit, factor]) => ({ unit, factor, type: 'multiply' }));
}

function enzymeActivityUnits(): SecondaryUnitConversion[] {
  return multiplyUnits(['mU/ml', 60], ['U/l', 60], ['nkat/l', 1000]);
}

function cholesterolUnits(): SecondaryUnitConversion[] {
  return multiplyUnits(['mg/l', 386.7], ['g/l', 0.3867], ['mmol/l', 1]);
}

function proteinMassUnits(): SecondaryUnitConversion[] {
  return multiplyUnits(['mg/l', 1000], ['g/l', 1]);
}

function cellCountUnits(): SecondaryUnitConversion[] {
  return multiplyUnits(['g/l', 1], ['10^3/µl', 1]);
}

export const SECONDARY_UNIT_CONVERSIONS: Record<string, SecondaryUnitConversion[]> = {
  // Biochemistry
  'biochemistry.glucose': multiplyUnits(['mg/l', 180.18], ['g/l', 0.18018]),
  // Urea: SI unit is mmol/l (urea molecule). Some european mass-concentration units (mg/l, g/l)
  // express the whole urea molecule (MW 60.06).
  // "BUN" mg/dL is handled by the PRIMARY UNIT_CONVERSIONS entry.
  'biochemistry.urea': multiplyUnits(['mg/l', 60.06], ['g/l', 0.06006]),
  'biochemistry.creatinine': multiplyUnits(['mg/l', 0.1131], ['µmol/l', 1]),
  'biochemistry.uricAcid': multiplyUnits(['mg/l', 0.1681], ['mmol/l', 0.001]),
  'biochemistry.bilirubinTotal': multiplyUnits(['mg/l', 0.5848], ['µmol/l', 1]),
  'biochemistry.bilirubinDirect': multiplyUnits(['mg/l', 0.5848], ['\u00b5mol/l', 1]),
  'biochemistry.bilirubinIndirect': multiplyUnits(['mg/l', 0.5848], ['\u00b5mol/l', 1]),
  'biochemistry.ast': enzymeActivityUnits(),
  'biochemistry.alt': enzymeActivityUnits(),
  'biochemistry.alp': enzymeActivityUnits(),
  'biochemistry.ggt': enzymeActivityUnits(),
  'biochemistry.ldh': enzymeActivityUnits(),
  'biochemistry.creatineKinase': enzymeActivityUnits(),
  'biochemistry.amylase': multiplyUnits(['U/l', 60]),
  'biochemistry.lipase': multiplyUnits(['U/l', 60]),
  'biochemistry.cystatinC': multiplyUnits(['g/l', 0.001], ['mg/l', 1]),
  'biochemistry.osmolality': multiplyUnits(['mmol/kg', 1]),

  // Hormones
  'hormones.testosterone': multiplyUnits(['µg/l', 0.28818], ['ng/ml', 0.28818], ['pg/ml', 288.18], ['nmol/l', 1]),
  'hormones.freeTestosterone': multiplyUnits(
    ['µg/l', 0.0002885], ['ng/ml', 0.0002885], ['ng/dl', 0.02885], ['pmol/l', 1],
  ),
  'hormones.estradiol': multiplyUnits(['ng/l', 0.2724], ['nmol/l', 0.001], ['pmol/l', 1]),
  'hormones.progesterone': multiplyUnits(['µg/l', 0.3145], ['pg/ml', 314.5], ['nmol/l', 1]),
  'hormones.dheaS': multiplyUnits(['mg/l', 0.3687], ['µg/ml', 0.3687], ['ng/ml', 368.7], ['µmol/l', 1]),
  'hormones.dht': multiplyUnits(['pg/ml', 288.18], ['ng/ml', 0.28818], ['µg/l', 0.28818], ['nmol/l', 1]),
  'hormones.igf1': multiplyUnits(['µg/l', 1], ['nmol/l', 0.1307]),
  // WHO 3rd IS 84/500-calibrated assays: 1 µg/L (1 ng/mL) = 21.2 mIU/L.
  'hormones.prolactin': multiplyUnits(
    ['mU/l', 21.2], ['mIU/l', 21.2], ['µU/ml', 21.2], ['µIU/ml', 21.2], ['µg/l', 1],
  ),
  'diabetes.insulin': multiplyUnits(['pmol/l', 6.0], ['mU/l', 1]),
  'diabetes.cPeptide': multiplyUnits(['nmol/l', 0.331]),
  'hormones.acth': multiplyUnits(['pg/ml', 4.541]),
  'hormones.aldosterone': multiplyUnits(['ng/dl', 0.03605]),
  'hormones.lh': multiplyUnits(['U/l', 1]),
  'hormones.fsh': multiplyUnits(['U/l', 1]),
  'hormones.pth': multiplyUnits(['ng/l', 9.43], ['pmol/l', 1]),
  'hormones.calcitonin': multiplyUnits(['pmol/l', 0.292], ['ng/l', 1]),
  'hormones.bioactiveTestosterone': multiplyUnits(
    ['µg/l', 0.28818], ['ng/ml', 0.28818], ['pg/ml', 288.18], ['nmol/l', 1],
  ),
  'hormones.hCG': multiplyUnits(['U/l', 1], ['mU/ml', 1]),
  'tumorMarkers.afp': multiplyUnits(['U/ml', 1], ['kU/l', 1], ['kIU/l', 1], ['ng/ml', 1.21]),

  // Electrolytes
  'electrolytes.calciumTotal': multiplyUnits(['mg/l', 40.08], ['mEq/l', 2], ['mmol/l', 1]),
  'electrolytes.calciumIonized': multiplyUnits(['mg/l', 40.08], ['mmol/l', 1]),
  'electrolytes.phosphorus': multiplyUnits(['mg/l', 30.97], ['mmol/l', 1]),
  'electrolytes.magnesium': multiplyUnits(['mg/l', 24.31], ['mEq/l', 2], ['mmol/l', 1]),
  'electrolytes.magnesiumRBC': multiplyUnits(['mg/l', 24.31], ['mEq/l', 2], ['mmol/l', 1]),
  'electrolytes.copper': multiplyUnits(['µg/l', 63.55], ['mg/l', 0.06355], ['µmol/l', 1]),
  'electrolytes.zinc': multiplyUnits(['µg/l', 65.4], ['mg/l', 0.0654], ['µmol/l', 1]),
  'electrolytes.selenium': multiplyUnits(['\u00b5g/l', 78.971], ['\u00b5mol/l', 1]),

  // Lipids & Proteins
  'lipids.cholesterol': cholesterolUnits(),
  'lipids.triglycerides': multiplyUnits(['mg/l', 885.7], ['g/l', 0.8857], ['mmol/l', 1]),
  'lipids.hdl': cholesterolUnits(),
  'lipids.ldl': cholesterolUnits(),
  'lipids.nonHdl': cholesterolUnits(),
  'lipids.apoAI': proteinMassUnits(),
  'lipids.apoB': proteinMassUnits(),
  // Lp(a): SI unit is nmol/l (particle count). Mass units (mg/l, mg/dl) report total
  // particle mass and have NO exact molar conversion — the ratio depends on apo(a)
  // isoform size and the assay. ~2.4 nmol/L per mg/dL (i.e. ~0.24 nmol/L per mg/L, so
  // factor 4.167) is a widely-used approximation only; the 2022 EAS consensus
  // discourages mg↔nmol conversion for clinical decisions. Sanity check: Unilabs SK's
  // 0–300 mg/L (= 0–30 mg/dL) upper-normal ≈ 72 nmol/L, near the schema optimalMax 75.
  'lipids.lpA': multiplyUnits(['mg/l', 4.167]),
  'iron.iron': multiplyUnits(['µg/l', 55.85], ['mg/l', 0.05585], ['µmol/l', 1]),
  'iron.ferritin': multiplyUnits(['mg/l', 0.001], ['µg/l', 1]),
  'iron.transferrin': proteinMassUnits(),
  'iron.tibc': multiplyUnits(['µg/l', 55.85], ['mg/l', 0.05585], ['µmol/l', 1]),
  'proteins.hsCRP': multiplyUnits(['µg/ml', 1], ['mg/l', 1]),
  'proteins.crp': multiplyUnits(['µg/ml', 1], ['mg/l', 1]),
  'proteins.totalProtein': multiplyUnits(['mg/ml', 1], ['mg/dl', 100], ['g/l', 1]),
  'proteins.albumin': multiplyUnits(['mg/ml', 1], ['mg/dl', 100], ['g/l', 1]),
  'proteins.ceruloplasmin': proteinMassUnits(),

  // Bone metabolism and urine protein units common in ANZ reports.
  'boneMetabolism.p1np': multiplyUnits(['ng/l', 1000]),
  'urinalysis.totalProtein': multiplyUnits(['mg/l', 1000]),

  // Thyroid
  'thyroid.tsh': multiplyUnits(['mU/l', 1], ['mIU/l', 1]),
  'thyroid.ft4': multiplyUnits(['ng/l', 0.7769], ['pg/ml', 0.7769], ['pmol/l', 1]),
  'thyroid.ft3': multiplyUnits(['ng/l', 0.6513], ['pg/dl', 65.13], ['pmol/l', 1]),
  'thyroid.t4total': multiplyUnits(['ng/ml', 0.77687], ['nmol/l', 1]),
  'thyroid.t3total': multiplyUnits(['nmol/l', 1]),

  // Vitamins
  'vitamins.vitaminD': multiplyUnits(['µg/l', 0.4006], ['nmol/l', 1]),
  'vitamins.vitaminD3': multiplyUnits(['µg/l', 0.4006], ['nmol/l', 1]),
  'vitamins.calcitriol': multiplyUnits(['ng/l', 0.4167], ['pmol/l', 1]),
  'vitamins.vitaminA': multiplyUnits(['µg/l', 286.5], ['mg/l', 0.2865], ['µmol/l', 1]),
  'vitamins.vitaminB12': multiplyUnits(['ng/l', 1.355], ['pmol/l', 1]),
  'vitamins.folate': multiplyUnits(['µg/l', 0.4413], ['nmol/l', 1]),

  // Hematology
  'hematology.wbc': cellCountUnits(),
  'hematology.rbc': multiplyUnits(['T/l', 1], ['10^6/µl', 1]),
  'hematology.hemoglobin': multiplyUnits(['mmol/l', 0.06206], ['g/L', 1]),
  'hematology.platelets': cellCountUnits(),
  'differential.neutrophils': cellCountUnits(),
  'differential.lymphocytes': cellCountUnits(),
  'differential.monocytes': cellCountUnits(),
  'differential.eosinophils': cellCountUnits(),
  'differential.basophils': cellCountUnits()
};
