// @ts-check
// pdf-import-marker-normalization.js - AI marker normalization shared by text/image import

import { MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS, detectProduct, getAdapterByTestType, normalizeWithAdapter } from './adapters.js';
import { isDebugMode } from './utils.js';
import { _sanitizeAIMarker, reconcileImportMarkerMappings } from './pdf-import-marker-mapping.js';
import { normalizeProductScopedAdapterMarkers } from './pdf-import-organic-acid-normalization.js';

export { normalizeProductScopedAdapterMarkers };

const _specialtyTypes = ['OAT', 'fattyAcids', 'Metabolomix+', 'DUTCH', 'HTMA', 'GI'];
const standardCats = new Set(Object.keys(MARKER_SCHEMA));

function _fattyAcidMarkerPart(key) {
  const prefix = 'fattyAcids.';
  if (!key?.startsWith(prefix)) return null;
  const markerPart = key.slice(prefix.length);
  return markerPart && !markerPart.includes('.') ? markerPart : null;
}

/**
 * @param {{ testType?: string, labName?: string | null, markers?: any[] }} parsed
 * @param {{
 *   markerRef?: Record<string, any> | null,
 *   fileName?: string,
 *   sourceText?: string,
 *   existingKeys?: Set<string> | string[] | null,
 *   mode?: string,
 *   emitDebugLogs?: boolean,
 * }} [options]
 */
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
  const detectedProductScoped = !!detected?.adapter?.productScoped;
  const needsAdapterNormalize = testType === 'fattyAcids'
    || (!!detected && testType !== 'blood')
    || detectedProductScoped
    || !!adapterForTestType;
  let adapter = null;
  if (needsAdapterNormalize && parsed.markers?.length) {
    adapter = detected?.adapter || adapterForTestType || getAdapterByTestType('fattyAcids');
    if (adapter?.productScoped) {
      normalizeProductScopedAdapterMarkers(adapter, parsed.markers, detected?.product, parsed.labName || null);
    } else {
      normalizeWithAdapter(adapter, parsed.markers, fileName, sourceText, detected?.product);
    }
    if (emitDebugLogs && isDebugMode()) {
      console.log(`[Import] Adapter ${adapter?.id || 'fattyAcids'} normalized ${parsed.markers.length} markers (testType=${testType})`);
    }
  }

  const markers = (parsed.markers || [])
    .map(marker => normalizeParsedImportMarker(marker, { testType, detected, mode, emitDebugLogs }))
    .filter(marker => !isNaN(marker.value));

  const reconcileOptions = /** @type {{ testType: string, refLookup?: Record<string, any> | null, existingKeys?: Set<string> | string[] | null, preferSuggestedKeys?: boolean }} */ ({
    testType,
    refLookup: markerRef,
    preferSuggestedKeys: !!adapter?.productScoped,
  });
  if (existingKeys) reconcileOptions.existingKeys = existingKeys;
  reconcileImportMarkerMappings(markers, reconcileOptions);

  return { testType, markers };
}

function normalizeParsedImportMarker(m, { testType, detected, mode, emitDebugLogs }) {
  let mappedKey = m.mappedKey || null;
  let matched = !!mappedKey;

  // Product detection is conservative for whole-report normalization when the
  // model says "blood", but generic fattyAcids.* adapter keys are never the
  // desired persisted keys for a detected fatty-acid product.
  if (detected?.adapter?.id === 'fattyAcids' && detected.product?.prefix) {
    const genericFattyAcidKey = mappedKey?.startsWith('fattyAcids.')
      ? mappedKey
      : (!matched && m.suggestedKey?.startsWith('fattyAcids.') ? m.suggestedKey : null);
    if (genericFattyAcidKey) {
      const markerPart = _fattyAcidMarkerPart(genericFattyAcidKey);
      const sDef = SPECIALTY_MARKER_DEFS[genericFattyAcidKey];
      if (markerPart && sDef) {
        if (emitDebugLogs && isDebugMode()) {
          console.log(`[Import Guard] Rewrote ${genericFattyAcidKey} -> ${detected.product.prefix}.${markerPart} (detected ${detected.product.label})`);
        }
        m.suggestedKey = `${detected.product.prefix}.${markerPart}`;
        m.suggestedName = m.suggestedName || sDef?.name || m.rawName;
        m.suggestedCategoryLabel = detected.product.label;
        m.suggestedGroup = 'Fatty Acids';
        mappedKey = null;
        matched = false;
      } else {
        if (emitDebugLogs && isDebugMode()) {
          console.log(`[Import Guard] Demoted invalid ${genericFattyAcidKey} for detected ${detected.product.label}`);
        }
        if (markerPart) {
          m.suggestedKey = `${detected.product.prefix}.${markerPart}`;
        } else if (m.suggestedKey === genericFattyAcidKey) {
          m.suggestedKey = null;
        }
        m.suggestedName = m.suggestedName || m.rawName;
        m.suggestedCategoryLabel = m.suggestedCategoryLabel || detected.product.label;
        m.suggestedGroup = m.suggestedGroup || 'Fatty Acids';
        mappedKey = null;
        matched = false;
      }
    }
  }

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
