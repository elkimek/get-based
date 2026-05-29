// pdf-import-marker-mapping.js — marker key safety, reference lookup, and unit normalization for imports

import { state } from './state.js';
import { MARKER_SCHEMA, SPECIALTY_MARKER_DEFS, UNIT_CONVERSIONS } from './schema.js';

// ═══════════════════════════════════════════════
// UNIT NORMALIZATION — convert US-unit values to SI before storage
// ═══════════════════════════════════════════════
function normalizeUnitStr(s) {
  return s.toLowerCase().replace(/\s/g, '').replace(/[\u00b5\u03bc]/g, 'u').replace(/^mcg/, 'ug').replace(/^iu\//, 'u/').replace(/^ug\/l$/, 'ng/ml');
}

// Marker keys flow into onclick handlers and dynamic property names. Reject
// anything that isn't strictly `category.markerKey` (alphanumeric, optional
// trailing underscore in the marker half) so a poisoned/prompt-injected AI
// response can't escape an attribute context. Downstream code already
// handles `null` mappedKey/suggestedKey by deriving a safe key from rawName.
const _SAFE_MARKER_KEY = /^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/;

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
  ['celkbilkovina', 'urinalysis.totalProtein'],
  ['celkovabilkovina', 'urinalysis.totalProtein'],
  ['pomerproteinkreatinin', 'urinalysis.proteinCreatinineRatio'],
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
  ['ast', 'biochemistry.ast'],
  ['alt', 'biochemistry.alt'],
  ['alp', 'biochemistry.alp'],
  ['ggt', 'biochemistry.ggt'],
  ['kreatinkinaza', 'biochemistry.creatineKinase'],
  ['cystatinc', 'biochemistry.cystatinC'],
  ['gfcystatin', 'biochemistry.gfrCystatin'],
  ['sodik', 'electrolytes.sodium'],
  ['draslik', 'electrolytes.potassium'],
  ['chloridy', 'electrolytes.chloride'],
  ['cacelkovy', 'electrolytes.calciumTotal'],
  ['panorganicky', 'electrolytes.phosphorus'],
  ['horcik', 'electrolytes.magnesium'],
  ['horcikvery', 'electrolytes.magnesiumRBC'],
  ['cholesterol', 'lipids.cholesterol'],
  ['triacylglyceroly', 'lipids.triglycerides'],
  ['hdlcholesterol', 'lipids.hdl'],
  ['ldlcholesterol', 'lipids.ldl'],
  ['apoai', 'lipids.apoAI'],
  ['apob', 'lipids.apoB'],
  ['nonhdl', 'lipids.nonHdl'],
  ['cholhdl', 'lipids.cholHdlRatio'],
  ['zelezo', 'iron.iron'],
  ['ferritin', 'iron.ferritin'],
  ['transferin', 'iron.transferrin'],
  ['crp', 'proteins.crp'],
  ['hscrp', 'proteins.hsCRP'],
  ['celkbilkovina', 'proteins.totalProtein'],
  ['celkovabilkovina', 'proteins.totalProtein'],
  ['albumin', 'proteins.albumin'],
  ['vitamindcelkovy', 'vitamins.vitaminD'],
  ['kyselinalistova', 'vitamins.folate'],
  ['hba1c', 'diabetes.hba1c'],
  ['inzulin', 'hormones.insulin'],
  ['fsh', 'hormones.fsh'],
  ['lh', 'hormones.lh'],
  ['prolaktin', 'hormones.prolactin'],
  ['shbg', 'hormones.shbg'],
  ['testosteron', 'hormones.testosterone'],
  ['fai', 'hormones.fai'],
  ['igf1', 'hormones.igf1'],
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
  ['homocystein', 'coagulation.homocysteine'],
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
  return (refLookup[key] || existingKeys.has(key)) ? key : null;
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

function _buildStandardBloodNameLookup() {
  const lookup = new Map(BLOOD_IMPORT_ALIASES);
  const add = (label, key) => {
    for (const variant of _compactImportLabelVariants(label)) {
      if (variant && !lookup.has(variant)) lookup.set(variant, key);
    }
  };
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    if (cat.calculated) continue;
    for (const [markerKey, marker] of Object.entries(cat.markers || {})) {
      const fullKey = `${catKey}.${markerKey}`;
      add(markerKey, fullKey);
      add(marker.name, fullKey);
    }
  }
  return lookup;
}

function _resolveStandardBloodImportKey(marker, refLookup) {
  const rawName = marker.rawName || marker.suggestedName || '';
  const specimen = _getImportSpecimen(rawName);
  const unit = normalizeUnitStr(marker.unit || '');
  const compact = _compactImportLabel(rawName);
  const compactBase = compact.replace(/#/g, '');

  if (_isUrineImportSpecimen(specimen)) {
    if (compactBase === 'ph') return 'urinalysis.ph';
    if (compactBase === 'hustotamoci' || compactBase === 'specifickahustota' || compactBase === 'specificgravity') return 'urinalysis.specificGravity';
    return null;
  }

  if (unit === 'arb.j.' || unit.includes('/ul')) return null;

  const hasAbsoluteHint = /#|\babs\b|absolute/i.test(String(rawName)) || unit.includes('10^9');
  if (compactBase === 'neutrofily') return hasAbsoluteHint ? 'differential.neutrophils' : 'differential.neutrophilsPct';
  if (compactBase === 'lymfocyty') return hasAbsoluteHint ? 'differential.lymphocytes' : 'differential.lymphocytesPct';
  if (compactBase === 'monocyty') return hasAbsoluteHint ? 'differential.monocytes' : 'differential.monocytesPct';
  if (compactBase === 'eosinofily') return hasAbsoluteHint ? 'differential.eosinophils' : null;
  if (compactBase === 'basofily') return hasAbsoluteHint ? 'differential.basophils' : null;

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
  return refLookup[key] ? key : null;
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
    const mappedSpecimenBad = _isSpecimenIncompatibleImportKey(marker, marker.mappedKey, standardCats);
    const suggestedSpecimenBad = _isSpecimenIncompatibleImportKey(marker, marker.suggestedKey, standardCats);
    const exactMappedKey = mappedSpecimenBad ? null : _knownImportKey(marker.mappedKey, testType, refLookup, existingKeys, standardCats);
    const exactSuggestedKey = suggestedSpecimenBad ? null : _knownImportKey(marker.suggestedKey, testType, refLookup, existingKeys, standardCats);
    const exactKey = exactMappedKey || exactSuggestedKey;
    const existingCustomKey = exactKey || _resolveExistingCustomImportKey(marker, existingNameLookup, testType, refLookup, existingKeys, standardCats);
    const aliasKey = testType === 'blood' ? _resolveStandardBloodImportKey(marker, refLookup) : null;
    const resolvedKey = aliasKey || existingCustomKey;
    if (resolvedKey) {
      marker.mappedKey = resolvedKey;
      marker.matched = true;
      marker.suggestedKey = null;
    } else if (mappedSpecimenBad || suggestedSpecimenBad) {
      _demoteSpecimenIncompatibleImportKey(marker, marker.mappedKey || marker.suggestedKey, standardCats);
    } else if (marker.mappedKey && !_knownImportKey(marker.mappedKey, testType, refLookup, existingKeys, standardCats)) {
      if (!marker.suggestedKey && _SAFE_MARKER_KEY.test(marker.mappedKey)) marker.suggestedKey = marker.mappedKey;
      marker.mappedKey = null;
      marker.matched = false;
    }
  }
  return markers;
}

export function normalizeToSI(key, value, unit) {
  if (value == null) return value;
  // Hematocrit: schema stores as % (40–50) but some labs report as fraction l/l (0.40–0.50)
  if (key === 'hematology.hematocrit' && value < 1.5) {
    return parseFloat((value * 100).toFixed(1));
  }
  const conv = UNIT_CONVERSIONS[key];
  if (!conv) return value;

  // When the AI returned a unit string, match it against the expected US unit
  if (unit) {
    const aiUnit = normalizeUnitStr(unit);
    if (conv.type === 'multiply') {
      if (aiUnit === normalizeUnitStr(conv.usUnit)) return parseFloat((value / conv.factor).toPrecision(6));
    } else if (conv.type === 'hba1c' && aiUnit === '%') {
      return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
    return value;
  }

  // Unit is empty/null — check if value looks like it's in the US/display range
  // and needs conversion. Use the schema's SI ref range as sanity check.
  if (conv.type === 'multiply' && conv.factor > 1) {
    const [catKey, markerKey] = key.split('.');
    const marker = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
    if (marker && marker.refMax != null) {
      // If value is much larger than the SI ref max, it's likely in US units
      // Threshold: value > refMax × factor × 0.3 (well above SI range, plausible in US range)
      if (value > marker.refMax * conv.factor * 0.3) {
        return parseFloat((value / conv.factor).toPrecision(6));
      }
    }
  }
  return value;
}

export function buildMarkerReference() {
  const ref = {};
  const isFemale = state.profileSex === 'female';
  for (const [catKey, cat] of Object.entries(MARKER_SCHEMA)) {
    if (cat.calculated) continue;
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
  const custom = (state.importedData && state.importedData.customMarkers) ? state.importedData.customMarkers : {};
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
