import { OAT_MARKERS, FA_MARKERS, BIOSTARKS_MARKERS, GUT_STOOL_MARKERS, ADAPTER_MARKERS } from './specialty-marker-catalog.js';
import type { AdapterMarkerDefinition } from './specialty-marker-catalog.js';
export type { AdapterMarkerDefinition } from './specialty-marker-catalog.js';
export { ADAPTER_MARKERS } from './specialty-marker-catalog.js';
export interface AdapterParsedMarker {
  rawName: string;
  suggestedName?: string | null;
  mappedKey?: string | null;
  suggestedKey?: string | null;
  suggestedCategoryLabel?: string | null;
  suggestedGroup?: string | null | undefined;
  unit?: string | null;
}
export interface AdapterProduct { prefix: string; label: string; group?: string; kind?: string }
export interface ParserAdapter {
  id: string;
  testTypes: string[];
  markers: Record<string, AdapterMarkerDefinition>;
  /** The lazy importer guarantees product-specific keys for this adapter. */
  productScoped?: boolean;
  detect?: (fileName?: string | null, pdfText?: string | null) => AdapterProduct | null;
  normalize?: (markers: AdapterParsedMarker[], fileName?: string | null, pdfText?: string | null, product?: AdapterProduct | null) => void;
}

// adapters.js — Parser adapter registry for specialty lab products
//
// Each adapter provides a marker map and optional detection/normalization
// for a specific test type or product. The main AI pipeline uses adapters to:
// 1. Include adapter markers in buildMarkerReference() so AI can match them
// 2. Detect products from filename/text content
// 3. Post-process AI output (normalize keys, deduplicate, skip calculated)
//
// Adapter interface:
//   id:         unique string identifier
//   testTypes:  array of testType values this adapter handles
//   markers:    object of "category.markerKey" to report definitions

import { MARKER_SCHEMA } from './schema.js';
import { isDebugMode } from './utils.js';

// Marker definitions are shared with profile migrations by specialty-marker-catalog.js.

// ═══════════════════════════════════════════════
// Fatty Acids Adapter — product-specific (Spadia, ZinZino, OmegaQuant)
// ═══════════════════════════════════════════════

const FA_PRODUCTS = [
  { patterns: ['zinzino', 'balancetest', 'balance test'], prefix: 'zinzinoFA', label: 'ZinZino' },
  { patterns: ['omegaquant', 'ayumetrix'], prefix: 'omegaquantFA', label: 'OmegaQuant' },
  { patterns: ['spadia'], prefix: 'spadiaFA', label: 'Spadia' },
];

function _detectFAProduct(fileName?: string | null, pdfText?: string | null) {
  const fnLower = (fileName || '').toLowerCase();
  const textLower = (pdfText || '').slice(0, 3000).toLowerCase();
  for (const p of FA_PRODUCTS) {
    for (const pat of p.patterns) {
      if (fnLower.includes(pat) || textLower.includes(pat)) return { prefix: p.prefix, label: p.label };
    }
  }
  return null;
}

function _normalizeFAMarkers(markers: AdapterParsedMarker[], fileName?: string | null, pdfText?: string | null, detectedProduct?: AdapterProduct | null) {
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  let product = detectedProduct || _detectFAProduct(fileName, pdfText);
  // Fallback: derive from first non-generic suggestedGroup the AI returned
  if (!product) {
    const firstLabel = markers.find(m => m.suggestedCategoryLabel && !/fatty|omega|saturated|trans|mono/i.test(m.suggestedCategoryLabel))?.suggestedCategoryLabel;
    if (firstLabel) {
      const prefix = firstLabel.toLowerCase().replace(/[^a-z0-9]/g, '') + 'FA';
      product = { prefix, label: firstLabel };
    } else {
      product = { prefix: 'fattyAcidsTest', label: 'Fatty Acids Test' };
    }
  }
  for (const m of markers) {
    // Never rewrite markers already matched to standard schema categories
    if (m.mappedKey) {
      const catKey = m.mappedKey.split('.')[0];
      if (standardCats.has(catKey!)) {
        if (isDebugMode()) console.log(`[FA Normalize] Skipping ${m.mappedKey} — standard category`);
        continue;
      }
    }
    const markerPart = m.suggestedKey ? m.suggestedKey.split('.').pop()
      : m.mappedKey ? m.mappedKey.split('.').pop()
      : m.rawName.replace(/[^a-zA-Z0-9_]/g, '');
    if (!markerPart) continue;
    m.mappedKey = null;
    m.suggestedKey = `${product.prefix}.${markerPart}`;
    m.suggestedCategoryLabel = product.label;
    m.suggestedGroup = 'Fatty Acids';
  }
}

// ═══════════════════════════════════════════════
// Metabolomix+ Adapter — Genova Diagnostics combined panel
// OAT + amino acids + elements + optional FA bloodspot add-on
// ═══════════════════════════════════════════════
function _detectMetabolomix(fileName?: string | null, pdfText?: string | null) {
  const haystack = `${fileName || ''}\n${String(pdfText || '').slice(0, 6000)}`.toLowerCase();
  const explicitProduct = /\bmetabolomix\s*\+?/i.test(haystack);
  const officialCode = /\b3200\b/.test(haystack) && /genova/.test(haystack);
  return explicitProduct || officialCode
    ? { prefix: 'metabolomix', label: 'Metabolomix+', group: 'Metabolomix+' }
    : null;
}

function _detectMosaicOAT(fileName?: string | null, pdfText?: string | null) {
  const haystack = `${fileName || ''}\n${String(pdfText || '').slice(0, 6000)}`.toLowerCase();
  const hasMosaicLab = /mosaic\s*(?:diagnostics|dx)|mosaicdx|great plains laborator|\bmdx[_ -]/i.test(haystack);
  if (!hasMosaicLab) return null;
  if (/microbial organic acids test|(?:^|[_ -])moat(?:[_ .-]|$)/im.test(haystack)) {
    return { prefix: 'mosaicMoat', label: 'Mosaic MOAT', group: 'Mosaic MOAT', kind: 'moat' };
  }
  if (/organic acids? test|(?:^|[_ -])oat(?:[_ .-]|$)/im.test(haystack)) {
    return { prefix: 'mosaicOat', label: 'Mosaic OAT', group: 'Mosaic OAT', kind: 'oat' };
  }
  return null;
}

// ═══════════════════════════════════════════════
// BioStarks Adapter — dried blood spot (amino acids, fatty acids, minerals, vitamins, hormones, metabolism)
// ═══════════════════════════════════════════════


const BIOSTARKS_PATTERNS = ['biostarks', 'bio starks', 'bio-starks'];

function _detectBiostarks(fileName?: string | null, pdfText?: string | null) {
  const fnLower = (fileName || '').toLowerCase();
  const textLower = (pdfText || '').slice(0, 3000).toLowerCase();
  for (const pat of BIOSTARKS_PATTERNS) {
    if (fnLower.includes(pat) || textLower.includes(pat)) return { prefix: 'biostarks', label: 'BioStarks' };
  }
  return null;
}

function _normalizeBiostarks(markers: AdapterParsedMarker[]) {
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const biostarksKeys = new Set(Object.keys(BIOSTARKS_MARKERS));

  // Name → adapter key lookup (exact + aliases)
  const nameLookup = new Map<string, string>();
  for (const [key, def] of Object.entries(BIOSTARKS_MARKERS)) {
    nameLookup.set(def.name.toLowerCase(), key);
  }
  nameLookup.set('bcaa', 'biostarksAmino.bcaa');
  nameLookup.set('branched chain amino acids', 'biostarksAmino.bcaa');
  nameLookup.set('branched-chain amino acids', 'biostarksAmino.bcaa');
  nameLookup.set('omega-3 index', 'biostarksFA.omega3Index');
  nameLookup.set('omega 3 index', 'biostarksFA.omega3Index');
  nameLookup.set('vitamin e', 'biostarksVitamin.vitaminE');
  nameLookup.set('alpha-tocopherol', 'biostarksVitamin.vitaminE');
  nameLookup.set('vitamin e alpha-tocopherol', 'biostarksVitamin.vitaminE');
  nameLookup.set('testosterone / cortisol ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('testosterone/cortisol ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('t/c ratio', 'biostarksHormone.testCortisolRatio');
  nameLookup.set('linoleic acid', 'biostarksFA.linoleicAcid');
  nameLookup.set('oleic acid', 'biostarksFA.oleicAcid');
  // Bare mineral names (AI may omit "(RBC)" suffix — selenium has no standard schema fallback)
  nameLookup.set('magnesium', 'biostarksMineral.magnesium');
  nameLookup.set('selenium', 'biostarksMineral.selenium');
  nameLookup.set('zinc', 'biostarksMineral.zinc');
  nameLookup.set('magnesium rbc', 'biostarksMineral.magnesium');
  nameLookup.set('selenium rbc', 'biostarksMineral.selenium');
  nameLookup.set('zinc rbc', 'biostarksMineral.zinc');
  // L-prefixed amino acids
  nameLookup.set('l-arginine', 'biostarksAmino.arginine');
  nameLookup.set('l-glutamine', 'biostarksAmino.glutamine');
  nameLookup.set('l-tryptophan', 'biostarksAmino.tryptophan');
  nameLookup.set('l-carnitine', 'biostarksAmino.carnitine');
  nameLookup.set('l-proline', 'biostarksAmino.proline');
  nameLookup.set('l-threonine', 'biostarksAmino.threonine');
  nameLookup.set('l-tyrosine', 'biostarksAmino.tyrosine');
  nameLookup.set('l-valine', 'biostarksAmino.valine');
  nameLookup.set('l-citrulline', 'biostarksAmino.citrulline');
  nameLookup.set('l-asparagine', 'biostarksAmino.asparagine');
  // FA chemical names
  nameLookup.set('docosahexaenoic acid', 'biostarksFA.dha');
  nameLookup.set('eicosapentaenoic acid', 'biostarksFA.epa');
  nameLookup.set('free carnitine', 'biostarksAmino.carnitine');

  for (const m of markers) {
    const name = (m.rawName || m.suggestedName || '').toLowerCase().trim();
    const key = m.mappedKey || m.suggestedKey || '';

    // Already correctly mapped to a BioStarks adapter key — skip
    if (biostarksKeys.has(key)) continue;

    // BioStarks is a hybrid panel: ordinary serum-style markers can stay in the
    // standard schema, but BioStarks-specific amino acids, fatty acids,
    // intracellular minerals, vitamin E, and ratio markers must not be left in
    // lookalike generic/OAT categories just because the AI found a standard name.
    const match = nameLookup.get(name);
    if (match) {
      const def = BIOSTARKS_MARKERS[match]!;
      m.mappedKey = null;
      m.suggestedKey = match;
      m.suggestedCategoryLabel = def.categoryLabel;
      m.suggestedGroup = 'BioStarks';
      if (isDebugMode()) console.log(`[BioStarks] Normalized ${name} → ${match}`);
      continue;
    }

    // Standard schema mapping — keep for BioStarks markers not defined in the
    // adapter (e.g. active B12, vitamin D, ferritin, lipids, glucose), but keep
    // the old unit-based mineral guard as a fallback for variant RBC labels.
    if (m.mappedKey) {
      const catKey = m.mappedKey.split('.')[0];
      if (standardCats.has(catKey!)) {
        const unit = (m.unit || '').toLowerCase();
        if (unit.includes('ghb') || unit.includes('g hb')) {
          const markerPart = m.mappedKey.split('.')[1];
          const mineralKey = `biostarksMineral.${markerPart}`;
          if (BIOSTARKS_MARKERS[mineralKey]) {
            const def = BIOSTARKS_MARKERS[mineralKey];
            m.mappedKey = null;
            m.suggestedKey = mineralKey;
            m.suggestedCategoryLabel = def.categoryLabel;
            m.suggestedGroup = 'BioStarks';
            if (isDebugMode()) console.log(`[BioStarks] Remapped intracellular ${name} → ${mineralKey}`);
          }
        }
        continue;
      }
    }
  }
}

// ═══════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════
const ADAPTERS: ParserAdapter[] = [
  {
    id: 'fattyAcids',
    testTypes: ['fattyAcids'],
    markers: FA_MARKERS,
    detect(fileName, pdfText) { return _detectFAProduct(fileName, pdfText); },
    normalize(markers, fileName, pdfText, detected) { _normalizeFAMarkers(markers, fileName, pdfText, detected); },
  },
  {
    id: 'metabolomix',
    testTypes: ['metabolomix', 'Metabolomix+'],
    productScoped: true,
    markers: {}, // Reuses OAT + FA markers (no unique markers)
    detect(fileName, pdfText) { return _detectMetabolomix(fileName, pdfText); },
  },
  {
    id: 'mosaicOat',
    testTypes: ['Mosaic OAT', 'Mosaic MOAT', 'MOAT'],
    productScoped: true,
    markers: {}, // Product catalog is loaded with the importer, not at app startup
    detect(fileName, pdfText) { return _detectMosaicOAT(fileName, pdfText); },
  },
  {
    id: 'oat',
    testTypes: ['OAT'],
    productScoped: true,
    markers: OAT_MARKERS,
  },
  {
    id: 'gutStool',
    testTypes: ['stool', 'gut', 'giMap', 'GI-MAP', 'GI Effects'],
    markers: GUT_STOOL_MARKERS,
  },
  {
    id: 'biostarks',
    testTypes: ['biostarks'],
    markers: BIOSTARKS_MARKERS,
    detect(fileName, pdfText) { return _detectBiostarks(fileName, pdfText); },
    normalize(markers, _fileName, _pdfText, _detected) { _normalizeBiostarks(markers); },
  },
  // Future adapters: DUTCH, HTMA, GI-MAP, HealthieOne, etc.
];

// ═══════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════

/** Get all adapter markers merged into a single object (for buildMarkerReference) */
export function getAllAdapterMarkers() {
  const all: Record<string, AdapterMarkerDefinition> = {};
  for (const adapter of ADAPTERS) {
    Object.assign(all, adapter.markers);
  }
  return all;
}

/** Find an adapter by testType */
export function getAdapterByTestType(testType: string) {
  return ADAPTERS.find(a => a.testTypes.includes(testType)) || null;
}

/** Detect product from filename/text across all adapters */
export function detectProduct(fileName?: string | null, pdfText?: string | null) {
  for (const adapter of ADAPTERS) {
    if (adapter.detect) {
      const result = adapter.detect(fileName, pdfText);
      if (result) return { adapter, product: result };
    }
  }
  return null;
}

/** Run adapter normalization on parsed markers (post-AI) */
export function normalizeWithAdapter(adapter: ParserAdapter | null | undefined, markers: AdapterParsedMarker[], fileName?: string | null, pdfText?: string | null, detectedProduct?: AdapterProduct | null) {
  if (adapter?.normalize) {
    adapter.normalize(markers, fileName, pdfText, detectedProduct);
  }
}

/** All adapter markers, with the legacy specialty name kept at this ownership boundary. */

export { ADAPTER_MARKERS as SPECIALTY_MARKER_DEFS };
