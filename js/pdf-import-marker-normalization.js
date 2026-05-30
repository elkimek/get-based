// pdf-import-marker-normalization.js - AI marker normalization shared by text/image import

import { MARKER_SCHEMA, SPECIALTY_MARKER_DEFS } from './schema.js';
import { detectProduct, getAdapterByTestType, normalizeWithAdapter } from './adapters.js';
import { isDebugMode } from './utils.js';
import { _sanitizeAIMarker, reconcileImportMarkerMappings } from './pdf-import-marker-mapping.js';

const _specialtyTypes = ['OAT', 'fattyAcids', 'Metabolomix+', 'DUTCH', 'HTMA', 'GI'];
const standardCats = new Set(Object.keys(MARKER_SCHEMA));

export function normalizeParsedImportMarkers(parsed, {
  markerRef,
  fileName = '',
  sourceText = '',
  existingKeys,
  mode = 'text',
  emitDebugLogs = false,
} = {}) {
  if (Array.isArray(parsed.markers)) parsed.markers.forEach(_sanitizeAIMarker);

  const testType = parsed.testType || 'blood';
  const detected = detectProduct(fileName, sourceText);
  const adapterForTestType = !detected && testType !== 'blood' ? getAdapterByTestType(testType) : null;
  const needsAdapterNormalize = testType === 'fattyAcids' || (!!detected && testType !== 'blood') || !!adapterForTestType;
  if (needsAdapterNormalize && parsed.markers?.length) {
    const adapter = detected?.adapter || adapterForTestType || getAdapterByTestType('fattyAcids');
    normalizeWithAdapter(adapter, parsed.markers, fileName, sourceText, detected?.product);
    if (emitDebugLogs && isDebugMode()) {
      console.log(`[Import] Adapter ${adapter?.id || 'fattyAcids'} normalized ${parsed.markers.length} markers (testType=${testType})`);
    }
  }

  const markers = (parsed.markers || [])
    .map(marker => normalizeParsedImportMarker(marker, { testType, detected, mode, emitDebugLogs }))
    .filter(marker => !isNaN(marker.value));

  const reconcileOptions = { testType, refLookup: markerRef };
  if (existingKeys) reconcileOptions.existingKeys = existingKeys;
  reconcileImportMarkerMappings(markers, reconcileOptions);

  return { testType, markers };
}

function normalizeParsedImportMarker(m, { testType, detected, mode, emitDebugLogs }) {
  let mappedKey = m.mappedKey || null;
  let matched = !!mappedKey;

  // Guard: never allow standard blood work mappings for known specialty tests.
  // Only fire for well-defined specialty types, not for mixed/comprehensive reports.
  if (matched && _specialtyTypes.includes(testType)) {
    const catKey = mappedKey.split('.')[0];
    if (standardCats.has(catKey)) {
      if (emitDebugLogs && isDebugMode()) {
        console.log(`[Import Guard] Demoted ${mappedKey} - standard category in ${testType} test`);
      }
      const markerPart = mappedKey.split('.')[1];
      const specialtyMatch = Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
        if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
        const sDef = SPECIALTY_MARKER_DEFS[k];
        return sDef.group === testType || sDef.group?.toLowerCase() === testType.toLowerCase();
      });
      if (specialtyMatch) {
        const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
        m.suggestedKey = specialtyMatch;
        m.suggestedName = sDef.name;
        m.suggestedCategoryLabel = sDef.categoryLabel;
        m.suggestedGroup = m.suggestedGroup || sDef.group || testType;
      } else if (!m.suggestedKey) {
        const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
        const catSuffix = catKey.charAt(0).toUpperCase() + catKey.slice(1);
        m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
        m.suggestedName = getDemotedSuggestedName(m, catKey, markerPart, mode);
        m.suggestedCategoryLabel = m.suggestedCategoryLabel || MARKER_SCHEMA[catKey]?.label || catSuffix;
        m.suggestedGroup = m.suggestedGroup || testType;
      }
      mappedKey = null;
      matched = false;
    }
  }

  // Guard: even for blood testType, remap to specialty key if adapter detected a product.
  // This catches AI misidentifying specialty tests as blood.
  if (matched && testType === 'blood' && detected) {
    const catKey = mappedKey.split('.')[0];
    if (standardCats.has(catKey)) {
      const markerPart = mappedKey.split('.')[1];
      const adapterGroup = detected.adapter?.id === 'oat' ? 'OAT' : detected.adapter?.id === 'fattyAcids' ? 'Fatty Acids' : null;
      const specialtyMatch = adapterGroup && Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
        if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
        return SPECIALTY_MARKER_DEFS[k].group === adapterGroup;
      });
      if (specialtyMatch) {
        const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
        if (emitDebugLogs && isDebugMode()) {
          console.log(`[Import Guard] Remapped ${mappedKey} -> ${specialtyMatch} (adapter detected)`);
        }
        m.suggestedKey = specialtyMatch;
        m.suggestedName = sDef.name;
        m.suggestedCategoryLabel = sDef.categoryLabel;
        m.suggestedGroup = sDef.group || testType;
        mappedKey = null;
        matched = false;
      }
    }
  }

  // Guard: also rewrite suggestedKey if AI used a standard category for specialty test.
  if (!matched && m.suggestedKey && testType !== 'blood') {
    const sugCat = m.suggestedKey.split('.')[0];
    if (standardCats.has(sugCat)) {
      const markerPart = m.suggestedKey.split('.')[1] || m.rawName.replace(/[^a-zA-Z0-9]/g, '');
      const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
      const catSuffix = sugCat.charAt(0).toUpperCase() + sugCat.slice(1);
      if (emitDebugLogs && isDebugMode()) {
        console.log(`[Import Guard] Rewrote suggestedKey ${m.suggestedKey} -> ${prefix}${catSuffix}.${markerPart}`);
      }
      m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
      m.suggestedCategoryLabel = m.suggestedCategoryLabel || MARKER_SCHEMA[sugCat]?.label || catSuffix;
      m.suggestedGroup = testType;
    }
  }

  return mode === 'image'
    ? normalizeImageImportMarker(m, mappedKey, matched)
    : normalizeTextImportMarker(m, mappedKey, matched, testType);
}

function getDemotedSuggestedName(marker, catKey, markerPart, mode) {
  if (mode === 'image') return marker.suggestedName || marker.rawName;
  return marker.suggestedName || MARKER_SCHEMA[catKey]?.markers?.[markerPart]?.name || marker.rawName;
}

function normalizeTextImportMarker(m, mappedKey, matched, testType) {
  return {
    rawName: m.rawName,
    value: typeof m.value === 'number' ? m.value : parseFloat(String(m.value).replace(',', '.')),
    mappedKey,
    matched,
    suggestedKey: m.suggestedKey || null,
    suggestedName: m.suggestedName || null,
    suggestedCategoryLabel: m.suggestedCategoryLabel || null,
    unit: m.unit || null,
    refMin: m.refMin != null ? m.refMin : null,
    refMax: m.refMax != null ? m.refMax : null,
    group: m.suggestedGroup || m.group || (testType !== 'blood' ? testType : null) || null,
  };
}

function normalizeImageImportMarker(m, mappedKey, matched) {
  return {
    rawName: m.rawName || '',
    value: typeof m.value === 'number' ? m.value : parseFloat(m.value),
    mappedKey,
    matched,
    unit: m.unit || '',
    refMin: m.refMin != null ? m.refMin : null,
    refMax: m.refMax != null ? m.refMax : null,
    suggestedKey: m.suggestedKey || null,
    suggestedName: m.suggestedName || null,
    suggestedCategoryLabel: m.suggestedCategoryLabel || null,
    suggestedGroup: m.suggestedGroup || null,
  };
}
