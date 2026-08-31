// @ts-check
// pdf-import-marker-mapping.js — marker key safety, reference lookup, and unit normalization for imports

import { state } from './state.js';
import {
  MARKER_SCHEMA,
  normalizeClinicalUnit as normalizeUnitStr,
  UNIT_CONVERSIONS,
} from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import {
  annotateImportedRatioUnitConventions,
  IMPORTABLE_CALCULATED_MARKER_KEYS,
} from './pdf-import-ratio-units.js';

export { normalizeToSI } from './schema.js';
export {
  convertGenericImportValueUnit,
  convertImportValueUnit,
  convertSIToImportUnit,
  GENERIC_IMPORT_UNITS,
  getValidUnitsForMarker,
} from './pdf-import-unit-conversions.js';

// ═══════════════════════════════════════════════
// UNIT NORMALIZATION — convert US-unit values to SI before storage
// ═══════════════════════════════════════════════

// Marker keys flow into onclick handlers and dynamic property names. Reject
// anything that isn't strictly `category.markerKey` (alphanumeric, optional
// trailing underscore in the marker half) so a poisoned/prompt-injected AI
// response can't escape an attribute context. Downstream code already
// handles `null` mappedKey/suggestedKey by deriving a safe key from rawName.
const _SAFE_MARKER_KEY = /^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/;

function _isImportableCalculatedMarkerKey(key) {
  if (!IMPORTABLE_CALCULATED_MARKER_KEYS.has(key)) return false;
  const [catKey, markerKey] = String(key || '').split('.');
  return !!MARKER_SCHEMA[catKey]?.calculated && !!MARKER_SCHEMA[catKey]?.markers?.[markerKey];
}

function _hasImportReferenceKey(key, refLookup, existingKeys = /** @type {Set<string> | null} */ (null)) {
  return !!refLookup[key] || !!existingKeys?.has?.(key) || _isImportableCalculatedMarkerKey(key);
}

export function _sanitizeAIMarker(m) {
  if (typeof m.mappedKey === 'string' && !_SAFE_MARKER_KEY.test(m.mappedKey)) m.mappedKey = null;
  if (typeof m.suggestedKey === 'string' && !_SAFE_MARKER_KEY.test(m.suggestedKey)) m.suggestedKey = null;
  return m;
}

function _stripImportAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const IMPORT_SPECIMEN_PREFIX_RE = /^\s*(used|xxx|fs|fw|s|p|b|u|f)(?=$|[\s._:-])/i;

function _stripImportSpecimenPrefix(value) {
  return String(value || '').replace(/^\s*(?:used|xxx|fs|fw|s|p|b|u|f)(?=$|[\s._:-])[\s._:-]*/i, '');
}

function _stripImportLabelUnits(value) {
  return _stripImportAccents(value)
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\s*[\(\[]\s*[^)\]]*(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g\s*\/\s*l|m\s*u|iu\s*\/\s*l|u\s*\/\s*l|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g|m\s*u|iu|u|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)\s*(?:\/\s*[a-z0-9^]+)?\s*$/i, ' ');
}

function _normalizeImportLabel(value) {
  return _stripImportLabelUnits(_stripImportSpecimenPrefix(value))
    .toLowerCase()
    .replace(/\bvypocet\b/g, '')
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function _compactImportLabel(value) {
  return _normalizeImportLabel(value).replace(/[^a-z0-9#]/g, '');
}

function _compactImportLabelVariants(value) {
  const variants = [
    _compactImportLabel(value),
    _compactImportLabel(String(value || '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')),
  ].filter(Boolean);
  return [...new Set(variants)];
}

const DIFFERENTIAL_IMPORT_STEMS = new Map([
  ['neutrofily', 'neutrophils'],
  ['neutrophils', 'neutrophils'],
  ['neutrophil', 'neutrophils'],
  ['lymfocyty', 'lymphocytes'],
  ['lymphocytes', 'lymphocytes'],
  ['lymphocyte', 'lymphocytes'],
  ['monocyty', 'monocytes'],
  ['monocytes', 'monocytes'],
  ['monocyte', 'monocytes'],
  ['eosinofily', 'eosinophils'],
  ['eosinophils', 'eosinophils'],
  ['eosinophil', 'eosinophils'],
  ['basofily', 'basophils'],
  ['basophils', 'basophils'],
  ['basophil', 'basophils'],
]);

function _stripDifferentialPercentSuffix(compactBase) {
  return String(compactBase || '').replace(/(?:pct|percent|percentage)$/i, '');
}

function _differentialStemFromCompactBase(compactBase) {
  return DIFFERENTIAL_IMPORT_STEMS.get(_stripDifferentialPercentSuffix(compactBase)) || null;
}

function _hasImportAbsoluteHint(rawName, unit) {
  return /#|\babs\b|absolute/i.test(String(rawName || '')) || String(unit || '').includes('10^9');
}

function _hasImportPercentHint(rawName, unit, compactBase) {
  const unitNorm = String(unit || '');
  return /%|\bpct\b|percent|percentage/i.test(String(rawName || '')) ||
    unitNorm === '%' ||
    unitNorm === 'pct' ||
    unitNorm === 'percent' ||
    unitNorm === 'percentage' ||
    /(?:pct|percent|percentage)$/i.test(String(compactBase || ''));
}

function _suggestDifferentialPercentImportKey(marker) {
  const rawName = marker?.rawName || marker?.suggestedName || '';
  const unit = normalizeUnitStr(marker?.unit || '');
  const compactBase = _compactImportLabel(rawName).replace(/#/g, '');
  const stem = _differentialStemFromCompactBase(compactBase);
  if (!stem) return null;
  if (_hasImportAbsoluteHint(rawName, unit)) return null;
  if (!_hasImportPercentHint(rawName, unit, compactBase)) return null;
  return `differential.${stem}Pct`;
}


export function _cleanImportedMarkerDisplayName(value) {
  const cleaned = _stripImportLabelUnits(_stripImportSpecimenPrefix(value))
    .trim()
    .replace(/\s+/g, ' ');
  return cleaned || String(value || '').trim();
}

function _getImportSpecimen(rawName) {
  const match = String(rawName || '').match(IMPORT_SPECIMEN_PREFIX_RE);
  return match ? match[1].toLowerCase() : '';
}

function _isUrineImportSpecimen(specimen) {
  return specimen === 'u' || specimen === 'used';
}

function _camelImportKeyPart(value, fallback = 'marker') {
  const words = _normalizeImportLabel(value).split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const key = words.map((word, idx) => idx === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return key.replace(/^[0-9]+/, '') || fallback;
}

const URINE_CUSTOM_IMPORT_KEYS = new Map([
  ['bilkovina', 'urinalysis.proteinQualitative'],
  ['glukosa', 'urinalysis.glucoseQualitative'],
  ['glukoza', 'urinalysis.glucoseQualitative'],
  ['krev', 'urinalysis.bloodQualitative'],
  ['leukocyty', 'urinalysis.leukocytesQualitative'],
  ['ketolatky', 'urinalysis.ketonesQualitative'],
  ['bilirubin', 'urinalysis.bilirubinQualitative'],
  ['urobilinogen', 'urinalysis.urobilinogenQualitative'],
  ['nitrity', 'urinalysis.nitritesQualitative'],
  ['erytrocyty', 'urinalysis.erythrocytes'],
  ['hlen', 'urinalysis.mucus'],
  ['kreatinin', 'urinalysis.creatinine'],
  ['albumin', 'urinalysis.albumin'],
  ['mikroalbumin', 'urinalysis.albumin'],
  ['pomeralbuminkreatinin', 'urinalysis.albuminCreatinineRatio'],
  ['albuminkreatininratio', 'urinalysis.albuminCreatinineRatio'],
  ['acr', 'urinalysis.albuminCreatinineRatio'],
  ['celkbilkovina', 'urinalysis.totalProtein'],
  ['celkovabilkovina', 'urinalysis.totalProtein'],
  ['pomerproteinkreatinin', 'urinalysis.proteinCreatinineRatio'],
  ['proteincreatinineratio', 'urinalysis.proteinCreatinineRatio'],
  ['pcr', 'urinalysis.proteinCreatinineRatio'],
]);

function _isSpecimenIncompatibleImportKey(marker, key, standardCats) {
  if (typeof key !== 'string' || !_SAFE_MARKER_KEY.test(key)) return false;
  const specimen = _getImportSpecimen(marker?.rawName || marker?.suggestedName || '');
  if (!_isUrineImportSpecimen(specimen)) return false;
  const catKey = key.split('.')[0];
  return standardCats.has(catKey) && catKey !== 'urinalysis';
}

function _urineSuggestedImportKey(marker) {
  const label = marker?.rawName || marker?.suggestedName || '';
  const compact = _compactImportLabel(label).replace(/#/g, '');
  const known = URINE_CUSTOM_IMPORT_KEYS.get(compact);
  if (known) return known;
  return `urinalysis.${_camelImportKeyPart(label, 'urineMarker')}`;
}

function _demoteSpecimenIncompatibleImportKey(marker, rejectedKey, standardCats) {
  const suggestedBad = _isSpecimenIncompatibleImportKey(marker, marker.suggestedKey, standardCats);
  if (!marker.suggestedKey || suggestedBad || marker.suggestedKey === rejectedKey) {
    marker.suggestedKey = _urineSuggestedImportKey(marker);
  }
  marker.suggestedName = marker.suggestedName || _cleanImportedMarkerDisplayName(marker.rawName);
  marker.suggestedCategoryLabel = marker.suggestedCategoryLabel || 'Urinalysis';
  marker.mappedKey = null;
  marker.matched = false;
}

const BLOOD_IMPORT_ALIASES = new Map([
  ['glukoza', 'biochemistry.glucose'],
  ['glukosa', 'biochemistry.glucose'],
  ['urea', 'biochemistry.urea'],
  ['kreatinin', 'biochemistry.creatinine'],
  ['egfckdepi', 'biochemistry.egfr'],
  ['egfrckdepi', 'biochemistry.egfr'],
  ['egfr', 'biochemistry.egfr'],
  ['kyselinamocova', 'biochemistry.uricAcid'],
  ['bilirubincelkovy', 'biochemistry.bilirubinTotal'],
  ['bilirubinprimy', 'biochemistry.bilirubinDirect'],
  ['directbilirubin', 'biochemistry.bilirubinDirect'],
  ['bilirubinneprimy', 'biochemistry.bilirubinIndirect'],
  ['indirectbilirubin', 'biochemistry.bilirubinIndirect'],
  ['bikarbonat', 'biochemistry.bicarbonate'],
  ['totalco2', 'biochemistry.bicarbonate'],
  ['amylaza', 'biochemistry.amylase'],
  ['lipaza', 'biochemistry.lipase'],
  ['osmolalita', 'biochemistry.osmolality'],
  ['ast', 'biochemistry.ast'],
  ['alt', 'biochemistry.alt'],
  ['alp', 'biochemistry.alp'],
  ['ggt', 'biochemistry.ggt'],
  ['kreatinkinaza', 'biochemistry.creatineKinase'],
  ['cystatinc', 'biochemistry.cystatinC'],
  ['gfcystatin', 'biochemistry.gfrCystatin'],
  ['laktat', 'biochemistry.lactate'],
  ['lactate', 'biochemistry.lactate'],
  ['kyselinamlecna', 'biochemistry.lactate'],
  ['pyruvat', 'biochemistry.pyruvate'],
  ['pyruvate', 'biochemistry.pyruvate'],
  ['sodik', 'electrolytes.sodium'],
  ['draslik', 'electrolytes.potassium'],
  ['chloridy', 'electrolytes.chloride'],
  ['cacelkovy', 'electrolytes.calciumTotal'],
  ['caionizovany', 'electrolytes.calciumIonized'],
  ['ionizedcalcium', 'electrolytes.calciumIonized'],
  ['panorganicky', 'electrolytes.phosphorus'],
  ['horcik', 'electrolytes.magnesium'],
  ['horcikvery', 'electrolytes.magnesiumRBC'],
  ['selen', 'electrolytes.selenium'],
  ['cholesterol', 'lipids.cholesterol'],
  ['triacylglyceroly', 'lipids.triglycerides'],
  ['hdlcholesterol', 'lipids.hdl'],
  ['ldlcholesterol', 'lipids.ldl'],
  ['apoai', 'lipids.apoAI'],
  ['apob', 'lipids.apoB'],
  ['lpa', 'lipids.lpA'],
  ['lipoproteina', 'lipids.lpA'],
  ['nonhdl', 'lipids.nonHdl'],
  ['tghdl', 'calculatedRatios.tgHdlRatio'],
  ['tghdlratio', 'calculatedRatios.tgHdlRatio'],
  ['triglyceridehdlratio', 'calculatedRatios.tgHdlRatio'],
  ['triglyceridestohdlratio', 'calculatedRatios.tgHdlRatio'],
  ['ldlhdl', 'calculatedRatios.ldlHdlRatio'],
  ['ldlhdlratio', 'calculatedRatios.ldlHdlRatio'],
  ['ldltohdlratio', 'calculatedRatios.ldlHdlRatio'],
  ['apobapoai', 'calculatedRatios.apoBapoAIRatio'],
  ['apobapoairatio', 'calculatedRatios.apoBapoAIRatio'],
  ['apobapoa1', 'calculatedRatios.apoBapoAIRatio'],
  ['apobapoa1ratio', 'calculatedRatios.apoBapoAIRatio'],
  ['cholhdl', 'calculatedRatios.cholHdlRatio'],
  ['cholhdlratio', 'calculatedRatios.cholHdlRatio'],
  ['cholesterolhdlratio', 'calculatedRatios.cholHdlRatio'],
  ['totalcholesterolhdlratio', 'calculatedRatios.cholHdlRatio'],
  ['nlr', 'calculatedRatios.nlr'],
  ['neutrophillymphocyteratio', 'calculatedRatios.nlr'],
  ['neutrophiltolymphocyteratio', 'calculatedRatios.nlr'],
  ['plr', 'calculatedRatios.plr'],
  ['plateletlymphocyteratio', 'calculatedRatios.plr'],
  ['platelettolymphocyteratio', 'calculatedRatios.plr'],
  ['monocytelymphocyteratio', 'calculatedRatios.mlr'],
  ['monocytetolymphocyteratio', 'calculatedRatios.mlr'],
  ['mlr', 'calculatedRatios.mlr'],
  ['deritisratio', 'calculatedRatios.deRitisRatio'],
  ['astalt', 'calculatedRatios.deRitisRatio'],
  ['astaltratio', 'calculatedRatios.deRitisRatio'],
  ['copperzincratio', 'calculatedRatios.copperZincRatio'],
  ['cuznratio', 'calculatedRatios.copperZincRatio'],
  ['freet3freet4ratio', 'calculatedRatios.ft3ft4Ratio'],
  ['ft3ft4ratio', 'calculatedRatios.ft3ft4Ratio'],
  ['buncreatinineratio', 'calculatedRatios.bunCreatRatio'],
  ['buncreatratio', 'calculatedRatios.bunCreatRatio'],
  ['hscrphdlratio', 'calculatedRatios.crpHdlRatio'],
  ['hscrphdlcratio', 'calculatedRatios.crpHdlRatio'],
  ['atherogenicindexofplasma', 'calculatedRatios.atherogenicIndexPlasma'],
  ['aip', 'calculatedRatios.atherogenicIndexPlasma'],
  ['triglycerideglucoseindex', 'calculatedRatios.tygIndex'],
  ['tygindex', 'calculatedRatios.tygIndex'],
  ['tyg', 'calculatedRatios.tygIndex'],
  ['albuminglobulinratio', 'calculatedRatios.albuminGlobulinRatio'],
  ['agr', 'calculatedRatios.albuminGlobulinRatio'],
  ['fib4index', 'calculatedRatios.fib4Index'],
  ['fib4', 'calculatedRatios.fib4Index'],
  ['systemicimmuneinflammationindex', 'calculatedRatios.systemicImmuneInflammationIndex'],
  ['sii', 'calculatedRatios.systemicImmuneInflammationIndex'],
  ['aniongap', 'calculatedRatios.anionGap'],
  ['zelezo', 'iron.iron'],
  ['ferritin', 'iron.ferritin'],
  ['transferin', 'iron.transferrin'],
  ['solubilnitransferinovyreceptor', 'iron.solubleTransferrinReceptor'],
  ['solubletransferrinreceptor', 'iron.solubleTransferrinReceptor'],
  ['stfr', 'iron.solubleTransferrinReceptor'],
  ['crp', 'proteins.crp'],
  ['hscrp', 'proteins.hsCRP'],
  ['neurofilamentlight', 'proteins.neurofilamentLight'],
  ['nfl', 'proteins.neurofilamentLight'],
  ['calprotectin', 'stool.calprotectin'],
  ['fecalcalprotectin', 'stool.calprotectin'],
  ['stoolcalprotectin', 'stool.calprotectin'],
  ['zonulin', 'stool.zonulin'],
  ['secretoryiga', 'stool.secretoryIgA'],
  ['siga', 'stool.secretoryIgA'],
  ['celkbilkovina', 'proteins.totalProtein'],
  ['celkovabilkovina', 'proteins.totalProtein'],
  ['albumin', 'proteins.albumin'],
  ['globulin', 'proteins.globulin'],
  ['sedimentace', 'proteins.esr'],
  ['esr', 'proteins.esr'],
  ['vitamindcelkovy', 'vitamins.vitaminD'],
  ['kyselinalistova', 'vitamins.folate'],
  ['holotranskobalamin', 'vitamins.activeB12'],
  ['holotranscobalamin', 'vitamins.activeB12'],
  ['holotc', 'vitamins.activeB12'],
  ['activeb12', 'vitamins.activeB12'],
  ['aktivnib12', 'vitamins.activeB12'],
  ['methylmalonicacid', 'vitamins.methylmalonicAcid'],
  ['kyselinamethylmalonova', 'vitamins.methylmalonicAcid'],
  ['mma', 'vitamins.methylmalonicAcid'],
  ['vitaminb1', 'vitamins.vitaminB1'],
  ['thiamine', 'vitamins.vitaminB1'],
  ['vitaminb6', 'vitamins.vitaminB6'],
  ['pyridoxalphosphate', 'vitamins.vitaminB6'],
  ['vitaminc', 'vitamins.vitaminC'],
  ['ascorbicacid', 'vitamins.vitaminC'],
  ['vitamine', 'vitamins.vitaminE'],
  ['alphatocopherol', 'vitamins.vitaminE'],
  ['hba1c', 'diabetes.hba1c'],
  ['cpeptide', 'diabetes.cPeptide'],
  ['cpeptid', 'diabetes.cPeptide'],
  ['fructosamine', 'diabetes.fructosamine'],
  ['fruktosamin', 'diabetes.fructosamine'],
  ['inzulin', 'diabetes.insulin'],
  ['fsh', 'hormones.fsh'],
  ['lh', 'hormones.lh'],
  ['prolaktin', 'hormones.prolactin'],
  ['pth', 'hormones.pth'],
  ['ipth', 'hormones.pth'],
  ['intactpth', 'hormones.pth'],
  ['parathormon', 'hormones.pth'],
  ['parathormone', 'hormones.pth'],
  ['parahormone', 'hormones.pth'],
  ['parathyroidhormone', 'hormones.pth'],
  ['parathyroidhormoneintact', 'hormones.pth'],
  ['kortizol', 'hormones.cortisol'],
  ['cortisol', 'hormones.cortisol'],
  ['acth', 'hormones.acth'],
  ['aldosteron', 'hormones.aldosterone'],
  ['aldosterone', 'hormones.aldosterone'],
  ['renin', 'hormones.renin'],
  ['amh', 'hormones.amh'],
  ['antimullerianhormone', 'hormones.amh'],
  ['androstenedion', 'hormones.androstenedione'],
  ['androstenedione', 'hormones.androstenedione'],
  ['dihydrotestosteron', 'hormones.dht'],
  ['dihydrotestosterone', 'hormones.dht'],
  ['dht', 'hormones.dht'],
  ['shbg', 'hormones.shbg'],
  ['testosteron', 'hormones.testosterone'],
  ['fai', 'hormones.fai'],
  ['igf1', 'hormones.igf1'],
  ['reverset3', 'thyroid.reverseT3'],
  ['rt3', 'thyroid.reverseT3'],
  ['tpoantibodies', 'thyroid.tpoAb'],
  ['tpoantibody', 'thyroid.tpoAb'],
  ['thyroidperoxidaseantibodies', 'thyroid.tpoAb'],
  ['antitpo', 'thyroid.tpoAb'],
  ['tgantibodies', 'thyroid.tgAb'],
  ['thyroglobulinantibodies', 'thyroid.tgAb'],
  ['antitg', 'thyroid.tgAb'],
  ['trab', 'thyroid.trab'],
  ['tshreceptorantibodies', 'thyroid.trab'],
  ['thyreoglobulin', 'thyroid.thyroglobulin'],
  ['thyroglobulin', 'thyroid.thyroglobulin'],
  ['leukocyty', 'hematology.wbc'],
  ['erytrocyty', 'hematology.rbc'],
  ['hemoglobin', 'hematology.hemoglobin'],
  ['hematokrit', 'hematology.hematocrit'],
  ['mcv', 'hematology.mcv'],
  ['mch', 'hematology.mch'],
  ['mchc', 'hematology.mchc'],
  ['rdwcv', 'hematology.rdwcv'],
  ['trombocyty', 'hematology.platelets'],
  ['trombokrit', 'hematology.pct'],
  ['pdw', 'hematology.pdw'],
  ['mpv', 'hematology.mpv'],
  ['retikulocyty', 'hematology.reticulocytes'],
  ['reticulocytes', 'hematology.reticulocytes'],
  ['retikulocytyprocenta', 'hematology.reticulocytesPct'],
  ['reticulocytespercent', 'hematology.reticulocytesPct'],
  ['nezralegranulocyty', 'hematology.immatureGranulocytes'],
  ['immaturegranulocytes', 'hematology.immatureGranulocytes'],
  ['homocystein', 'coagulation.homocysteine'],
  ['pt', 'coagulation.pt'],
  ['prothrombintime', 'coagulation.pt'],
  ['inr', 'coagulation.inr'],
  ['aptt', 'coagulation.aptt'],
  ['activatedpartialthromboplastintime', 'coagulation.aptt'],
  ['fibrinogen', 'coagulation.fibrinogen'],
  ['ddimer', 'coagulation.dDimer'],
  ['ddimery', 'coagulation.dDimer'],
  ['dimerd', 'coagulation.dDimer'],
  ['p1np', 'boneMetabolism.p1np'],
  ['betactx', 'boneMetabolism.ctx'],
  ['ctx', 'boneMetabolism.ctx'],
  ['hstropont', 'cardiac.hsTroponinT'],
  ['hstroponint', 'cardiac.hsTroponinT'],
  ['hstroponini', 'cardiac.hsTroponinI'],
  ['bnp', 'cardiac.bnp'],
  ['ntprobnp', 'cardiac.ntProBnp'],
  ['cea', 'tumorMarkers.cea'],
  ['ca125', 'tumorMarkers.ca125'],
  ['ca199', 'tumorMarkers.ca199'],
  ['ca153', 'tumorMarkers.ca153'],
]);

function _standardMarkerShortNames() {
  const names = new Set();
  for (const cat of Object.values(MARKER_SCHEMA)) {
    if (cat.calculated) continue;
    for (const markerKey of Object.keys(cat.markers || {})) names.add(markerKey);
  }
  return names;
}

export function getExistingImportMarkerKeys() {
  const keys = new Set();
  for (const key of Object.keys(state.importedData?.customMarkers || {})) keys.add(key);
  return keys;
}

function _knownImportKey(key, testType, refLookup, existingKeys, standardCats) {
  if (typeof key !== 'string' || !_SAFE_MARKER_KEY.test(key)) return null;
  const catKey = key.split('.')[0];
  const standard = standardCats.has(catKey);
  if (testType !== 'blood' && testType !== 'biostarks' && standard) return null;
  return _hasImportReferenceKey(key, refLookup, existingKeys) ? key : null;
}

function _buildExistingCustomMarkerNameLookup(existingKeys) {
  const lookup = new Map();
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const standardMarkerNames = _standardMarkerShortNames();
  const add = (label, key) => {
    const compact = _compactImportLabel(label);
    if (compact && !lookup.has(compact)) lookup.set(compact, key);
  };
  const custom = state.importedData?.customMarkers || {};
  for (const [key, def] of Object.entries(custom)) {
    if (!_SAFE_MARKER_KEY.test(key)) continue;
    const [catKey, markerKey] = key.split('.');
    if (!standardCats.has(catKey) && standardMarkerNames.has(markerKey)) continue;
    add(def?.name, key);
    add(markerKey, key);
  }
  for (const key of existingKeys || []) {
    if (!_SAFE_MARKER_KEY.test(key)) continue;
    const [catKey, markerKey] = key.split('.');
    if (!standardCats.has(catKey) && markerKey && !standardMarkerNames.has(markerKey)) add(markerKey, key);
  }
  return lookup;
}

function _resolveExistingCustomImportKey(marker, nameLookup, testType, refLookup, existingKeys, standardCats) {
  const labels = [marker.rawName, marker.suggestedName];
  if (marker.suggestedKey) labels.push(marker.suggestedKey.split('.').pop());
  if (marker.mappedKey) labels.push(marker.mappedKey.split('.').pop());
  for (const label of labels) {
    for (const variant of _compactImportLabelVariants(label)) {
      const key = nameLookup.get(variant);
      const known = _knownImportKey(key, testType, refLookup, existingKeys, standardCats);
      if (known) return known;
    }
  }
  return null;
}

function _buildSpecialtyImportNameLookup() {
  const lookup = new Map();
  const add = (label, key) => {
    for (const variant of _compactImportLabelVariants(label)) {
      if (variant && !lookup.has(variant)) lookup.set(variant, key);
    }
  };
  for (const [fullKey, marker] of Object.entries(SPECIALTY_MARKER_DEFS || {})) {
    add(fullKey.split('.').pop(), fullKey);
    add(marker.name, fullKey);
    if (fullKey === 'stool.calprotectin') {
      add('Fecal Calprotectin', fullKey);
      add('Stool Calprotectin', fullKey);
    }
  }
  return lookup;
}

function _resolveSpecialtyImportKey(marker, refLookup) {
  const lookup = _buildSpecialtyImportNameLookup();
  const labels = [marker.rawName, marker.suggestedName];
  if (marker.mappedKey) labels.push(marker.mappedKey.split('.').pop());
  if (marker.suggestedKey) labels.push(marker.suggestedKey.split('.').pop());
  for (const label of labels) {
    for (const variant of _compactImportLabelVariants(label)) {
      const key = lookup.get(variant);
      if (key && refLookup[key]) return key;
    }
  }
  return null;
}

function _buildStandardBloodNameLookup() {
  const lookup = new Map(BLOOD_IMPORT_ALIASES);
  const add = (label, key) => {
    for (const variant of _compactImportLabelVariants(label)) {
      if (variant && !lookup.has(variant)) lookup.set(variant, key);
    }
  };
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    for (const [markerKey, marker] of Object.entries(cat.markers || {})) {
      const fullKey = `${catKey}.${markerKey}`;
      if (cat.calculated && !_isImportableCalculatedMarkerKey(fullKey)) continue;
      add(markerKey, fullKey);
      add(marker.name, fullKey);
    }
  }
  return lookup;
}

function _resolveStandardBloodImportKey(
  marker,
  refLookup,
  differentialPercentSuggestedKey = /** @type {string | null | undefined} */ (undefined),
) {
  const rawName = marker.rawName || marker.suggestedName || '';
  const specimen = _getImportSpecimen(rawName);
  const unit = normalizeUnitStr(marker.unit || '');
  const compact = _compactImportLabel(rawName);
  const compactBase = compact.replace(/#/g, '');

  if (_isUrineImportSpecimen(specimen)) {
    if (compactBase === 'ph') return 'urinalysis.ph';
    if (compactBase === 'hustotamoci' || compactBase === 'specifickahustota' || compactBase === 'specificgravity') return 'urinalysis.specificGravity';
    const urineKey = URINE_CUSTOM_IMPORT_KEYS.get(compactBase);
    if (urineKey && refLookup[urineKey]) return urineKey;
    return null;
  }

  if (unit === 'arb.j.' || unit.includes('/ul')) return null;

  const hasAbsoluteHint = _hasImportAbsoluteHint(rawName, unit);
  const pctSuggestedKey = differentialPercentSuggestedKey === undefined
    ? _suggestDifferentialPercentImportKey(marker)
    : differentialPercentSuggestedKey;
  if (pctSuggestedKey) {
    return refLookup[pctSuggestedKey] ? pctSuggestedKey : null;
  }
  const differentialStem = _differentialStemFromCompactBase(compactBase);
  if (differentialStem && hasAbsoluteHint) {
    const absoluteKey = `differential.${differentialStem}`;
    return refLookup[absoluteKey] ? absoluteKey : null;
  }
  if (compactBase === 'neutrofily' || compactBase === 'lymfocyty' || compactBase === 'monocyty') {
    const pctKey = `differential.${differentialStem}Pct`;
    return refLookup[pctKey] ? pctKey : null;
  }
  const lookup = _buildStandardBloodNameLookup();
  const labels = [marker.rawName, marker.suggestedName];
  if (marker.mappedKey) labels.push(marker.mappedKey.split('.').pop());
  if (marker.suggestedKey) labels.push(marker.suggestedKey.split('.').pop());
  let key = null;
  for (const label of labels) {
    for (const variant of _compactImportLabelVariants(label)) {
      key = lookup.get(variant);
      if (key) break;
    }
    if (key) break;
  }
  if (!key) return null;
  if (key === 'biochemistry.creatinine' && unit && unit !== normalizeUnitStr('µmol/l')) return null;
  return _hasImportReferenceKey(key, refLookup) ? key : null;
}

export function reconcileImportMarkerMappings(markers, options = {}) {
  if (!Array.isArray(markers)) return markers;
  const testType = options.testType || 'blood';
  const refLookup = options.refLookup || buildMarkerReference();
  const existingKeys = options.existingKeys || getExistingImportMarkerKeys();
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const existingNameLookup = options.existingNameLookup || _buildExistingCustomMarkerNameLookup(existingKeys);
  for (const marker of markers) {
    if (!marker) continue;
    const differentialPercentSuggestedKey = testType === 'blood' ? _suggestDifferentialPercentImportKey(marker) : null;
    const mappedSpecimenBad = _isSpecimenIncompatibleImportKey(marker, marker.mappedKey, standardCats);
    const suggestedSpecimenBad = _isSpecimenIncompatibleImportKey(marker, marker.suggestedKey, standardCats);
    const exactMappedKey = mappedSpecimenBad || differentialPercentSuggestedKey ? null : _knownImportKey(marker.mappedKey, testType, refLookup, existingKeys, standardCats);
    const exactSuggestedKey = suggestedSpecimenBad || differentialPercentSuggestedKey ? null : _knownImportKey(marker.suggestedKey, testType, refLookup, existingKeys, standardCats);
    const exactKey = exactMappedKey || exactSuggestedKey;
    const existingCustomKey = exactKey || (differentialPercentSuggestedKey ? null : _resolveExistingCustomImportKey(marker, existingNameLookup, testType, refLookup, existingKeys, standardCats));
    const aliasKey = testType === 'blood'
      ? _resolveStandardBloodImportKey(marker, refLookup, differentialPercentSuggestedKey)
      : _resolveSpecialtyImportKey(marker, refLookup);
    const preferredSuggestedKey = options.preferSuggestedKeys
      && typeof marker.suggestedKey === 'string'
      && _SAFE_MARKER_KEY.test(marker.suggestedKey)
      && !standardCats.has(marker.suggestedKey.split('.')[0]);
    const resolvedKey = preferredSuggestedKey
      ? (exactSuggestedKey || exactMappedKey)
      : (aliasKey || existingCustomKey);
    if (resolvedKey) {
      marker.mappedKey = resolvedKey;
      marker.matched = true;
      marker.suggestedKey = null;
    } else if (preferredSuggestedKey) {
      // A product adapter intentionally created this new custom key. Keep it
      // instead of name-aliasing the marker back to a generic OAT catalog key.
      marker.mappedKey = null;
      marker.matched = false;
    } else if (differentialPercentSuggestedKey) {
      marker.mappedKey = null;
      marker.matched = false;
      marker.suggestedKey = differentialPercentSuggestedKey;
      marker.suggestedName = marker.suggestedName || _cleanImportedMarkerDisplayName(marker.rawName);
      marker.suggestedCategoryLabel = marker.suggestedCategoryLabel || 'WBC Differential';
    } else if (mappedSpecimenBad || suggestedSpecimenBad) {
      _demoteSpecimenIncompatibleImportKey(marker, marker.mappedKey || marker.suggestedKey, standardCats);
    } else if (marker.mappedKey && !_knownImportKey(marker.mappedKey, testType, refLookup, existingKeys, standardCats)) {
      if (!marker.suggestedKey && _SAFE_MARKER_KEY.test(marker.mappedKey)) marker.suggestedKey = marker.mappedKey;
      marker.mappedKey = null;
      marker.matched = false;
    }
  }
  annotateImportedRatioUnitConventions(markers);
  return markers;
}

/**
 * @param {{profileSex?: string, includeCustomMarkers?: boolean}} [options]
 */
export function buildMarkerReference(options = {}) {
  const ref = {};
  const profileSex = options.profileSex === undefined ? state.profileSex : options.profileSex;
  const includeCustomMarkers = options.includeCustomMarkers !== false;
  const isFemale = profileSex === 'female';
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    if (cat.calculated) {
      for (const [markerKey, marker] of Object.entries(cat.markers)) {
        const fullKey = `${catKey}.${markerKey}`;
        if (!_isImportableCalculatedMarkerKey(fullKey)) continue;
        ref[fullKey] = { name: marker.name, unit: marker.unit, refMin: marker.refMin, refMax: marker.refMax };
      }
      continue;
    }
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      const rMin = isFemale && marker.refMin_f != null ? marker.refMin_f : marker.refMin;
      const rMax = isFemale && marker.refMax_f != null ? marker.refMax_f : marker.refMax;
      const fullKey = `${catKey}.${markerKey}`;
      // Show display units (e.g. "%" instead of "" for fraction markers) so the AI
      // returns a recognizable unit that normalizeToSI can convert back to SI
      const conv = UNIT_CONVERSIONS[fullKey];
      const displayUnit = conv?.usUnit || marker.unit;
      const displayMin = conv && conv.type === 'multiply' && rMin != null ? parseFloat((rMin * conv.factor).toPrecision(4)) : rMin;
      const displayMax = conv && conv.type === 'multiply' && rMax != null ? parseFloat((rMax * conv.factor).toPrecision(4)) : rMax;
      ref[fullKey] = { name: marker.name, unit: displayUnit, refMin: displayMin, refMax: displayMax };
    }
  }
  // Include custom markers from previous imports (override specialty defaults)
  // Build set of standard marker short names to filter out corrupted FA-prefixed duplicates
  const _stdMarkerNames = new Set();
  for (const cat of Object.values(MARKER_SCHEMA)) {
    if (cat.calculated) continue;
    for (const mk of Object.keys(cat.markers)) _stdMarkerNames.add(mk);
  }
  const custom = includeCustomMarkers && state.importedData?.customMarkers
    ? state.importedData.customMarkers
    : {};
  for (const [fullKey, def] of Object.entries(custom)) {
    if (!ref[fullKey]) {
      // Skip corrupted entries: custom category but marker name matches a standard marker
      const [catKey, markerKey] = fullKey.split('.');
      if (markerKey && !MARKER_SCHEMA[catKey] && _stdMarkerNames.has(markerKey)) continue;
      ref[fullKey] = { name: def.name, unit: def.unit, refMin: def.refMin, refMax: def.refMax };
    }
  }
  // Include specialty marker definitions (fallback for first-time imports)
  for (const [key, def] of Object.entries(SPECIALTY_MARKER_DEFS)) {
    if (!ref[key]) {
      ref[key] = { name: def.name, unit: def.unit, refMin: def.refMin, refMax: def.refMax };
    }
  }
  return ref;
}
