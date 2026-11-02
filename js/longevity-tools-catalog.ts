// longevity-tools-catalog.ts — longevity-tools.com tools/biomarkers + get-based mapping.
//
// Source of truth: https://www.longevity-tools.com/llms.txt and the homepage
// sections (read 2026-10-31). Values are passed in the URL hash
// (`#ID=value_unit&…`), which the site parses client-side only — nothing is sent
// to its server. Units: `/` → `~`; the site converts units itself, so we hand it
// the value in get-based's stored (SI) unit and never convert.
//
// Mapping rules (same as the lab connectors): exact get-based marker keys only,
// no fuzzy matching. A site ID without a mapped marker is simply left empty and
// the user can type it on the site.

export type LongevityToolKind = 'interpreter' | 'calculator' | 'bioage' | 'biomarker';

export interface LongevityTool {
  readonly path: string;
  readonly title: string;
  readonly section: string;
  readonly kind: LongevityToolKind;
  readonly desc?: string;
  /** Site parameter IDs the page accepts (llms.txt "Accepted biomarker IDs"). */
  readonly inputs: readonly string[];
  /** Legacy pages (Levine PhenoAge) take bare numbers and auto-detect the unit. */
  readonly bareValues?: boolean;
}

export interface LongevityParamSource {
  /** get-based marker keys, first one with a value wins. */
  readonly keys: readonly string[];
  /** Site unit token for the value as stored in get-based (before `/`→`~`). */
  readonly unit: string;
  /** Multiply the stored value before sending (only for scale changes such as fraction ↔ %). */
  readonly factor?: number;
}

/** Site biomarker ID → get-based marker key(s) + stored unit. */
export const LONGEVITY_PARAM_SOURCES: Readonly<Record<string, LongevityParamSource>> = {
  // Lipids
  'S-ApoA1': { keys: ['lipids.apoAI'], unit: 'g/L' },
  'S-ApoB': { keys: ['lipids.apoB'], unit: 'g/L' },
  'S-cholesterol': { keys: ['lipids.cholesterol'], unit: 'mmol/L' },
  'S-HDL': { keys: ['lipids.hdl'], unit: 'mmol/L' },
  'S-LDL': { keys: ['lipids.ldl'], unit: 'mmol/L' },
  'S-Lp-a': { keys: ['lipids.lpA'], unit: 'nmol/L' },
  'S-TAG': { keys: ['lipids.triglycerides'], unit: 'mmol/L' },
  // Glucose metabolism
  'S-glucose': { keys: ['biochemistry.glucose'], unit: 'mmol/L' },
  'S-insulin': { keys: ['diabetes.insulin'], unit: 'mIU/L' },
  'S-C-peptide': { keys: ['diabetes.cPeptide'], unit: 'ug/L' },
  'B-HbA1c': { keys: ['diabetes.hba1c'], unit: 'mmol/mol' },
  // Liver
  'S-AST': { keys: ['biochemistry.ast'], unit: 'ukat/L' },
  'S-ALT': { keys: ['biochemistry.alt'], unit: 'ukat/L' },
  'S-ALP': { keys: ['biochemistry.alp'], unit: 'ukat/L' },
  'S-GGT': { keys: ['biochemistry.ggt'], unit: 'ukat/L' },
  'S-LDH': { keys: ['biochemistry.ldh'], unit: 'ukat/L' },
  'S-tBIL': { keys: ['biochemistry.bilirubinTotal'], unit: 'umol/L' },
  'S-dBIL': { keys: ['biochemistry.bilirubinDirect'], unit: 'umol/L' },
  'S-albumin': { keys: ['proteins.albumin'], unit: 'g/L' },
  // Kidney
  'S-creatinine': { keys: ['biochemistry.creatinine'], unit: 'umol/L' },
  'S-cystatin-C': { keys: ['biochemistry.cystatinC'], unit: 'mg/L' },
  'S-urea': { keys: ['biochemistry.urea'], unit: 'mmol/L' },
  'S-uric-acid': { keys: ['biochemistry.uricAcid'], unit: 'umol/L' },
  'U-albumin': { keys: ['urinalysis.albumin'], unit: 'mg/L' },
  'U-creatinine': { keys: ['urinalysis.creatinine'], unit: 'mmol/L' },
  'U-protein': { keys: ['urinalysis.totalProtein'], unit: 'g/L' },
  // Thyroid
  'S-TSH': { keys: ['thyroid.tsh'], unit: 'mIU/L' },
  'S-fT4': { keys: ['thyroid.ft4'], unit: 'pmol/L' },
  'S-fT3': { keys: ['thyroid.ft3'], unit: 'pmol/L' },
  'S-rT3': { keys: ['thyroid.reverseT3'], unit: 'nmol/L' },
  'S-TPOAb': { keys: ['thyroid.tpoAb'], unit: 'kIU/L' },
  'S-TRAb': { keys: ['thyroid.trab'], unit: 'IU/L' },
  // Sex hormones
  'S-TST': { keys: ['hormones.testosterone'], unit: 'nmol/L' },
  'fTST': { keys: ['hormones.freeTestosterone'], unit: 'pmol/L' },
  'S-SHBG': { keys: ['hormones.shbg'], unit: 'nmol/L' },
  'S-estradiol': { keys: ['hormones.estradiol'], unit: 'pmol/L' },
  'S-LH': { keys: ['hormones.lh'], unit: 'IU/L' },
  'S-FSH': { keys: ['hormones.fsh'], unit: 'IU/L' },
  'S-prolactin': { keys: ['hormones.prolactin'], unit: 'ug/L' },
  'S-DHEAS': { keys: ['hormones.dheaS'], unit: 'umol/L' },
  // Blood and nutrients
  'S-ferritin': { keys: ['iron.ferritin'], unit: 'ug/L' },
  'TSAT': { keys: ['iron.transferrinSat'], unit: '%' },
  'S-folate': { keys: ['vitamins.folate'], unit: 'nmol/L' },
  'S-B12': { keys: ['vitamins.vitaminB12'], unit: 'pmol/L' },
  'S-holoTC': { keys: ['vitamins.activeB12'], unit: 'pmol/L' },
  'P-MMA': { keys: ['vitamins.methylmalonicAcid'], unit: 'nmol/L' },
  'P-homocysteine': { keys: ['coagulation.homocysteine'], unit: 'umol/L' },
  'S-25-OH-D': { keys: ['vitamins.vitaminD'], unit: 'nmol/L' },
  'HGB': { keys: ['hematology.hemoglobin'], unit: 'g/L' },
  'HCT': { keys: ['hematology.hematocrit'], unit: '%' },
  'MCV': { keys: ['hematology.mcv'], unit: 'fL' },
  'MCH': { keys: ['hematology.mch'], unit: 'pg' },
  'RBC': { keys: ['hematology.rbc'], unit: 'x10e12/L' },
  'RDW': { keys: ['hematology.rdwcv'], unit: '%' },
  'PLT': { keys: ['hematology.platelets'], unit: 'x10e9/L' },
  // Immunity
  'S-hsCRP': { keys: ['proteins.hsCRP', 'proteins.crp'], unit: 'mg/L' },
  'WBC': { keys: ['hematology.wbc'], unit: 'x10e9/L' },
  // get-based stores lymphocytes % as a fraction (e.g. 0.28), the site wants %.
  'LYM': { keys: ['differential.lymphocytesPct'], unit: '%', factor: 100 },
  'LYMabs': { keys: ['differential.lymphocytes'], unit: 'x10e9/L' },
  'MONOabs': { keys: ['differential.monocytes'], unit: 'x10e9/L' },
  'NEUabs': { keys: ['differential.neutrophils'], unit: 'x10e9/L' },
  // Tumor markers
  'S-tPSA': { keys: ['tumorMarkers.psa'], unit: 'ug/L' },
  // Body
  'fatPercentage': { keys: ['bodyComposition.bodyFatPct'], unit: '%' },
};

/** Profile/body parameters filled from outside the lab entries. */
export const LONGEVITY_PROFILE_PARAMS = ['age', 'gender', 'weight', 'height', 'BP-sys', 'BP-dia', 'waistCirc'] as const;

/** Questionnaire inputs get-based does not store — left for the user to answer on the site. */
export const LONGEVITY_UNFILLED_PARAMS = ['Dx-diabetes', 'smoking', 'Rx-lipidLowering', 'Rx-antihypertensive', 'race', 'gripStrength'] as const;

const I = (path: string, title: string, section: string, inputs: string[], desc?: string, extra: Partial<LongevityTool> = {}): LongevityTool =>
  ({ path, title, section, kind: 'interpreter', inputs, ...(desc ? { desc } : {}), ...extra });
const C = (path: string, title: string, section: string, inputs: string[]): LongevityTool => ({ path, title, section, kind: 'calculator', inputs });
const B = (id: string, title: string, section: string): LongevityTool => ({ path: `/biomarker/${id}`, title, section, kind: 'biomarker', inputs: [id] });

export const LONGEVITY_SECTIONS = [
  'Bio-age calculators', 'Heart and Blood Vessels', 'Blood Sugar', 'Liver and Gallbladder', 'Kidney', 'Thyroid',
  'Sex Hormones', 'Blood and Nutrients', 'Body Measurements', 'Immunity', 'Tumor Markers',
] as const;

export const LONGEVITY_TOOLS: readonly LongevityTool[] = [
  // Bio-age
  I('/humanitys-bortz-blood-age', "Humanity's Bortz Blood Age", 'Bio-age calculators',
    ['age', 'S-cystatin-C', 'RDW', 'S-GGT', 'S-SHBG', 'B-HbA1c', 'NEUabs', 'S-hsCRP', 'MCV', 'MONOabs', 'MCH', 'S-ALP', 'S-glucose', 'S-albumin', 'S-urea', 'S-ApoA1', 'LYM', 'S-cholesterol', 'RBC', 'S-25-OH-D', 'S-ALT', 'S-creatinine', 'gender'],
    'The most advanced biological age calculator model based on blood tests available in commercial labs.', { kind: 'bioage' }),
  I('/levine-pheno-age', 'Levine PhenoAge Calculator', 'Bio-age calculators',
    ['S-albumin', 'S-creatinine', 'S-glucose', 'S-hsCRP', 'LYM', 'MCV', 'RDW', 'S-ALP', 'WBC', 'age'],
    'Biological age calculator from routine blood biomarkers prioritizing costs over precision.', { kind: 'bioage', bareValues: true }),
  // Heart
  I('/cvd-prevent-risk-interpreter', 'CVD Risk Interpreter - PREVENT', 'Heart and Blood Vessels',
    ['gender', 'age', 'Dx-diabetes', 'smoking', 'Rx-lipidLowering', 'Rx-antihypertensive', 'BP-sys', 'BP-dia', 'S-cholesterol', 'S-HDL', 'S-LDL', 'S-creatinine', 'weight', 'height', 'B-HbA1c', 'U-albumin', 'U-creatinine'],
    'Estimates cardiovascular risk from routine labs, explains the results and proposes personalized prevention strategies.'),
  I('/calculation/RW-ApoB', 'Risk-weighted ApoB Interpreter', 'Heart and Blood Vessels', ['S-ApoB', 'S-Lp-a', 'S-TAG'],
    'Combines ApoB, Lp(a), and triglycerides to show particle proportions, cardiovascular risk contributions, and population percentiles.'),
  B('S-ApoA1', 'ApoA1', 'Heart and Blood Vessels'), B('S-ApoB', 'ApoB', 'Heart and Blood Vessels'),
  B('S-cholesterol', 'Cholesterol (Total)', 'Heart and Blood Vessels'), B('S-HDL', 'HDL', 'Heart and Blood Vessels'),
  B('S-LDL', 'LDL', 'Heart and Blood Vessels'), B('S-Lp-a', 'Lp(a)', 'Heart and Blood Vessels'), B('S-TAG', 'Triglycerides', 'Heart and Blood Vessels'),
  // Blood sugar
  I('/glucose-metabolism-interpreter', 'Glucose Metabolism Interpreter', 'Blood Sugar',
    ['S-glucose', 'S-insulin', 'S-C-peptide', 'S-TAG', 'S-LDH', 'S-HDL', 'B-HbA1c'],
    'Provides a comprehensive metabolic assessment of blood glucose control using a static multi-biomarker approach.'),
  C('/calculation/C-peptide-insulin-ratio', 'C-peptide/insulin', 'Blood Sugar', ['S-C-peptide', 'S-insulin']),
  C('/calculation/HOMA-IR', 'HOMA-IR', 'Blood Sugar', ['S-glucose', 'S-insulin']),
  C('/calculation/QUICKI', 'QUICKI', 'Blood Sugar', ['S-glucose', 'S-insulin']),
  C('/calculation/TAG-HDL-ratio', 'Triglyceride/HDL', 'Blood Sugar', ['S-TAG', 'S-HDL']),
  C('/calculation/TyG', 'TyG', 'Blood Sugar', ['S-TAG', 'S-glucose']),
  B('S-C-peptide', 'C-peptide', 'Blood Sugar'), B('S-glucose', 'Glucose', 'Blood Sugar'),
  B('B-HbA1c', 'HbA1c', 'Blood Sugar'), B('S-insulin', 'Insulin', 'Blood Sugar'),
  // Liver
  I('/liver-function-interpreter', 'Liver Function Blood Test Interpreter', 'Liver and Gallbladder',
    ['gender', 'Dx-diabetes', 'S-AST', 'S-ALT', 'S-ALP', 'S-GGT', 'S-tBIL', 'S-dBIL', 'S-TAG', 'S-glucose', 'S-albumin', 'PLT', 'MCV', 'weight', 'height', 'waistCirc'],
    'Comprehensive liver function test interpretation tool that automatically calculates key liver health indexes and provides recommendations based on official clinical guidelines.'),
  C('/calculation/ANI', 'ANI', 'Liver and Gallbladder', ['gender', 'weight', 'height', 'S-AST', 'S-ALT', 'MCV']),
  C('/calculation/DT-Bili', 'D/T Bilirubin Ratio', 'Liver and Gallbladder', ['S-tBIL', 'S-dBIL']),
  C('/calculation/FIB-3', 'FIB-3', 'Liver and Gallbladder', ['S-AST', 'S-ALT', 'PLT']),
  C('/calculation/FLI', 'FLI', 'Liver and Gallbladder', ['weight', 'height', 'waistCirc', 'S-TAG', 'S-GGT']),
  C('/calculation/LSS', 'LSS', 'Liver and Gallbladder', ['weight', 'race', 'Dx-diabetes', 'S-AST', 'PLT', 'S-albumin']),
  C('/calculation/R-Factor', 'R-Factor', 'Liver and Gallbladder', ['S-ALT', 'S-ALP']),
  C('/calculation/TyG-BMI', 'TyG-BMI', 'Liver and Gallbladder', ['weight', 'height', 'S-TAG', 'S-glucose']),
  B('S-albumin', 'Albumin', 'Liver and Gallbladder'), B('S-ALP', 'ALP', 'Liver and Gallbladder'),
  B('S-ALT', 'ALT', 'Liver and Gallbladder'), B('S-AST', 'AST', 'Liver and Gallbladder'),
  B('S-dBIL', 'Bilirubin (Direct)', 'Liver and Gallbladder'), B('S-tBIL', 'Bilirubin (Total)', 'Liver and Gallbladder'),
  B('S-GGT', 'GGT', 'Liver and Gallbladder'), B('S-LDH', 'LDH', 'Liver and Gallbladder'),
  // Kidney
  I('/kidney-health-interpreter', 'Kidney Health Interpreter', 'Kidney',
    ['age', 'gender', 'S-creatinine', 'S-cystatin-C', 'U-albumin', 'U-creatinine', 'U-protein'],
    'Comprehensive kidney function assessment combining blood and urine markers to visually interpret, stage and differentiate kidney dysfunction.'),
  C('/calculation/eGFRcr', 'eGFRcr', 'Kidney', ['gender', 'age', 'S-creatinine']),
  C('/calculation/eGFRcr-cys', 'eGFRcr-cys', 'Kidney', ['gender', 'age', 'S-creatinine', 'S-cystatin-C']),
  C('/calculation/eGFRcys', 'eGFRcys', 'Kidney', ['gender', 'age', 'S-cystatin-C']),
  C('/calculation/eGFRdiff', 'eGFRdiff', 'Kidney', ['gender', 'age', 'S-creatinine', 'S-cystatin-C']),
  C('/calculation/uACR', 'uACR', 'Kidney', ['U-albumin', 'U-creatinine']),
  C('/calculation/uPCR', 'uPCR', 'Kidney', ['U-protein', 'U-creatinine']),
  B('S-creatinine', 'Creatinine', 'Kidney'), B('S-cystatin-C', 'Cystatin C', 'Kidney'),
  B('S-urea', 'Urea', 'Kidney'), B('S-uric-acid', 'Uric acid', 'Kidney'),
  // Thyroid
  I('/thyroid-function-interpreter', 'Thyroid Function Interpreter', 'Thyroid',
    ['S-TSH', 'S-fT4', 'S-fT3', 'S-rT3', 'S-TPOAb', 'S-TRAb', 'S-TgAb-Roche'],
    'Comprehensive assessment of thyroid function blood tests with HPT axis visualizations designed to detect thyroid-related dysfunction early.'),
  C('/calculation/FT3-FT4-ratio', 'FT3/FT4 molar ratio', 'Thyroid', ['S-fT3', 'S-fT4']),
  C('/calculation/fT3-rT3-ratio', 'fT3/rT3 ratio', 'Thyroid', ['S-fT3', 'S-rT3']),
  C('/calculation/PTFQI', 'PTFQI', 'Thyroid', ['S-TSH', 'S-fT4']),
  C('/calculation/PTFQI-FT3', 'PTFQI-FT3', 'Thyroid', ['S-TSH', 'S-fT3']),
  C('/calculation/SPINA-GD', 'SPINA-GD', 'Thyroid', ['S-fT4', 'S-fT3']),
  C('/calculation/SPINA-GT', 'SPINA-GT', 'Thyroid', ['S-TSH', 'S-fT4']),
  C('/calculation/TSHI', 'TSHI', 'Thyroid', ['S-TSH', 'S-fT4']),
  B('S-fT3', 'fT3', 'Thyroid'), B('S-fT4', 'fT4', 'Thyroid'), B('S-rT3', 'rT3', 'Thyroid'),
  B('S-TPOAb', 'TPOAb', 'Thyroid'), B('S-TRAb', 'TRAb', 'Thyroid'), B('S-TSH', 'TSH', 'Thyroid'),
  // Sex hormones
  I('/male-hormones-interpreter', 'Male Hormones Interpreter', 'Sex Hormones',
    ['S-TST', 'S-LH', 'S-FSH', 'S-estradiol', 'S-prolactin', 'S-SHBG', 'S-albumin'],
    'Comprehensive male hormone interpretation that visualizes the testosterone production and feedback pathway to identify the true root cause of hormonal imbalance.'),
  C('/calculation/TT-E2-ratio', 'TT/E2', 'Sex Hormones', ['S-TST', 'S-estradiol']),
  B('S-DHEAS', 'DHEAS', 'Sex Hormones'), B('S-estradiol', 'Estradiol', 'Sex Hormones'), B('S-FSH', 'FSH', 'Sex Hormones'),
  B('S-LH', 'LH', 'Sex Hormones'), B('S-prolactin', 'Prolactin', 'Sex Hormones'), B('S-SHBG', 'SHBG', 'Sex Hormones'),
  B('fTST', 'Testosterone (Free)', 'Sex Hormones'), B('S-TST', 'Testosterone (Total)', 'Sex Hormones'),
  // Blood and nutrients
  I('/b12-status-interpreter', 'B12 Status Interpreter', 'Blood and Nutrients',
    ['age', 'S-B12', 'S-holoTC', 'P-MMA', 'P-homocysteine', 'S-folate', 'MCV', 'HGB', 'gender'],
    'Combines vitamin B12 related markers into the cB12 indicator, estimates body B12 stores, and provides a personalized supplementation plan.'),
  I('/iron-status-interpreter', 'Iron Status Interpreter', 'Blood and Nutrients',
    ['S-ferritin', 'weight', 'S-hsCRP', 'S-albumin', 'MCH', 'RDW', 'HGB', 'MCV', 'TSAT', 'gender'],
    'Calculates Body Iron Stores and provides a personalized intervention plan.'),
  B('S-ferritin', 'Ferritin', 'Blood and Nutrients'), B('S-folate', 'Folate', 'Blood and Nutrients'),
  B('HCT', 'HCT', 'Blood and Nutrients'), B('HGB', 'HGB', 'Blood and Nutrients'), B('S-holoTC', 'HoloTC', 'Blood and Nutrients'),
  B('P-homocysteine', 'Homocysteine', 'Blood and Nutrients'), B('MCH', 'MCH', 'Blood and Nutrients'), B('MCV', 'MCV', 'Blood and Nutrients'),
  B('P-MMA', 'MMA', 'Blood and Nutrients'), B('PLT', 'PLT', 'Blood and Nutrients'), B('RBC', 'RBC', 'Blood and Nutrients'),
  B('RDW', 'RDW', 'Blood and Nutrients'), B('TSAT', 'Transferrin Saturation', 'Blood and Nutrients'),
  B('S-B12', 'Vitamin B12', 'Blood and Nutrients'), B('S-25-OH-D', 'Vitamin D - 25(OH)D', 'Blood and Nutrients'),
  // Body
  I('/grip-strength-interpreter', 'Grip Strength Interpreter', 'Body Measurements', ['gripStrength', 'weight', 'height', 'age', 'gender'],
    'Discover the grip strength percentile, evaluate its impact on mortality, and estimate the risk of future muscle weakness.'),
  I('/body-weight-interpreter', 'Body Weight Interpreter', 'Body Measurements', ['gender', 'weight', 'height', 'fatPercentage', 'waistCirc']),
  B('fatPercentage', 'Body fat', 'Body Measurements'), B('BP-sys', 'Systolic Blood Pressure', 'Body Measurements'),
  // Immunity
  B('S-hsCRP', 'hsCRP', 'Immunity'), B('LYM', 'LYM', 'Immunity'), B('LYMabs', 'Lymphocytes (Absolute)', 'Immunity'),
  B('MONOabs', 'Monocytes (Absolute)', 'Immunity'), B('NEUabs', 'Neutrophils (Absolute)', 'Immunity'), B('WBC', 'WBC', 'Immunity'),
  // Tumor markers
  B('S-tPSA', 'tPSA', 'Tumor Markers'),
];

export const LONGEVITY_BASE_URL = 'https://www.longevity-tools.com';

export interface LongevityValue { value: number; unit: string; date: string | null; label: string }
export type LongevityValues = Readonly<Record<string, LongevityValue | string>>;

function formatNumber(value: number): string {
  const rounded = parseFloat(value.toPrecision(6));
  return String(rounded);
}

/** Unit token for the hash: `/` → `~`, `^` dropped (site syntax `x10e9~L`), spaces removed. */
export function longevityUnitToken(unit: string): string {
  return unit.replace(/\s+/g, '').replace(/\//g, '~');
}

/** Build the pre-filled URL for a tool. Returns the URL and which inputs were filled/missing. */
export function buildLongevityToolUrl(tool: LongevityTool, values: LongevityValues): { url: string; filled: string[]; missing: string[] } {
  const parts: string[] = [];
  const filled: string[] = [];
  const missing: string[] = [];
  for (const id of tool.inputs) {
    const v = values[id];
    if (v == null) { missing.push(id); continue; }
    if (typeof v === 'string') { parts.push(`${id}=${encodeURIComponent(v)}`); filled.push(id); continue; }
    const num = formatNumber(v.value);
    if (tool.bareValues) parts.push(`${id}=${num}`);
    else parts.push(`${id}=${num}${v.unit ? `_${encodeURIComponent(longevityUnitToken(v.unit)).replace(/%7E/gi, '~')}` : ''}`);
    filled.push(id);
  }
  const url = `${LONGEVITY_BASE_URL}${tool.path}${parts.length ? `#${parts.join('&')}` : ''}`;
  return { url, filled, missing };
}
