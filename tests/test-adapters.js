#!/usr/bin/env node
// test-adapters.js — Adapter registry: structure, fatty acids, OAT, metabolomix, cross-adapter
//
// Static source inspection only — switched from HTTP fetch to fs.readFileSync
// so it runs node-side without a dev server.
//
// Run: node tests/test-adapters.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Adapter Registry Tests ===\n');

const adaptersSrc = read('js/adapters.js');
const schemaSrc = read('js/schema.js');

  // ═══════════════════════════════════════
  // 1. Registry Structure
  // ═══════════════════════════════════════
  console.log('%c 1. Registry Structure ', 'font-weight:bold;color:#f59e0b');

  // ADAPTER_MARKERS total count (217 per CLAUDE.md: 165 OAT + 29 FA + 23 BioStarks)
  const allMarkerEntries = (adaptersSrc.match(/": \{ name: "/g) || []);
  assert('ADAPTER_MARKERS has 217 entries', allMarkerEntries.length === 217, `found ${allMarkerEntries.length}`);

  // Four adapters registered
  const adapterIds = ['fattyAcids', 'metabolomix', 'oat', 'biostarks'];
  for (const id of adapterIds) {
    assert(`Adapter '${id}' registered`, adaptersSrc.includes(`id: '${id}'`));
  }

  // Each adapter has required fields (id, testTypes, markers)
  assert('fattyAcids has testTypes', adaptersSrc.includes("testTypes: ['fattyAcids']"));
  assert('metabolomix has testTypes', adaptersSrc.includes("testTypes: ['metabolomix', 'Metabolomix+']"));
  assert('oat has testTypes', adaptersSrc.includes("testTypes: ['OAT']"));
  assert('biostarks has testTypes', adaptersSrc.includes("testTypes: ['biostarks']"));

  // Public API functions exist
  assert('detectProduct exported', adaptersSrc.includes('export function detectProduct('));
  assert('normalizeWithAdapter exported', adaptersSrc.includes('export function normalizeWithAdapter('));
  assert('getAdapterByTestType exported', adaptersSrc.includes('export function getAdapterByTestType('));
  assert('getAllAdapterMarkers exported', adaptersSrc.includes('export function getAllAdapterMarkers('));
  assert('ADAPTER_MARKERS exported', adaptersSrc.includes('export const ADAPTER_MARKERS'));

  // ═══════════════════════════════════════
  // 2. Fatty Acids Adapter (29 markers)
  // ═══════════════════════════════════════
  console.log('%c 2. Fatty Acids Adapter ', 'font-weight:bold;color:#f59e0b');

  // Marker count
  const faEntries = (adaptersSrc.match(/"fattyAcids\.\w+": \{/g) || []);
  assert('FA adapter has 29 markers', faEntries.length === 29, `found ${faEntries.length}`);

  // Product detection — FA_PRODUCTS array
  assert('FA_PRODUCTS defined', adaptersSrc.includes('const FA_PRODUCTS = ['));
  assert('ZinZino product pattern', adaptersSrc.includes("'zinzino'") && adaptersSrc.includes("prefix: 'zinzinoFA'"));
  assert('OmegaQuant product pattern', adaptersSrc.includes("'omegaquant'") && adaptersSrc.includes("prefix: 'omegaquantFA'"));
  assert('Spadia product pattern', adaptersSrc.includes("'spadia'") && adaptersSrc.includes("prefix: 'spadiaFA'"));
  assert('ZinZino balancetest alias', adaptersSrc.includes("'balancetest'"));
  assert('OmegaQuant ayumetrix alias', adaptersSrc.includes("'ayumetrix'"));

  // Product detection function
  assert('_detectFAProduct function defined', adaptersSrc.includes('function _detectFAProduct('));
  assert('FA detect checks fileName lowercase', adaptersSrc.includes("const fnLower = (fileName || '').toLowerCase()"));

  // Key fatty acid markers present
  const faMarkerKeys = [
    'palmiticC16', 'stearicC18', 'oleicC18_1', 'linoleicC18_2',
    'epaC20_5', 'dhaC22_6', 'omega3Index', 'omega6to3Ratio',
    'arachidonicC20_4', 'dpaC22_5', 'membraneFluidity',
    'nervonicC24_1', 'aaEpaRatio', 'linoleicDglaRatio'
  ];
  for (const key of faMarkerKeys) {
    assert(`FA has fattyAcids.${key}`, adaptersSrc.includes(`"fattyAcids.${key}"`));
  }

  // All FA markers have group: "Fatty Acids"
  assert('FA markers use group "Fatty Acids"', adaptersSrc.includes('group: "Fatty Acids"'));
  // FA markers use % unit
  assert('FA markers use % unit', adaptersSrc.includes('"fattyAcids.palmiticC16": { name: "Palmitic Acid C16:0", unit: "%"'));

  // Product-specific reference ranges (Spadia defaults are the base ranges in FA_MARKERS)
  assert('FA omega3Index has ref range 8-12', adaptersSrc.includes('"fattyAcids.omega3Index": { name: "Omega-3 Index", unit: "%", refMin: 8.0, refMax: 12.0'));

  // Normalization function
  assert('_normalizeFAMarkers function defined', adaptersSrc.includes('function _normalizeFAMarkers('));
  assert('FA normalize sets suggestedGroup to Fatty Acids', adaptersSrc.includes("m.suggestedGroup = 'Fatty Acids'"));
  assert('FA normalize skips standard categories', adaptersSrc.includes('standardCats.has(catKey)'));
  assert('FA normalize has fallback prefix', adaptersSrc.includes("prefix: 'fattyAcidsTest'"));

  // ═══════════════════════════════════════
  // 3. OAT Adapter (165 markers)
  // ═══════════════════════════════════════
  console.log('%c 3. OAT Adapter ', 'font-weight:bold;color:#f59e0b');

  // Count OAT markers by matching the OAT_MARKERS object keys
  // OAT markers use multiple category prefixes: oatMicrobial, oatMetabolic, oatNeuro, oatNutritional, oatAminoFatty, oxidativeStress, urineAmino, urineAminoMetab, toxicElements, nutrientElements
  const oatPrefixedEntries = (adaptersSrc.match(/"oat\w+\.\w+": \{/g) || []);
  const oxidativeEntries = (adaptersSrc.match(/"oxidativeStress\.\w+": \{/g) || []);
  const urineAminoEntries = (adaptersSrc.match(/"urineAmino\.\w+": \{/g) || []);
  const urineMetabEntries = (adaptersSrc.match(/"urineAminoMetab\.\w+": \{/g) || []);
  const toxicEntries = (adaptersSrc.match(/"toxicElements\.\w+": \{/g) || []);
  const nutrientEntries = (adaptersSrc.match(/"nutrientElements\.\w+": \{/g) || []);
  const oatTotal = oatPrefixedEntries.length + oxidativeEntries.length + urineAminoEntries.length + urineMetabEntries.length + toxicEntries.length + nutrientEntries.length;
  assert('OAT adapter has 165 markers', oatTotal === 165, `found ${oatTotal} (oat:${oatPrefixedEntries.length} ox:${oxidativeEntries.length} uAA:${urineAminoEntries.length} uMetab:${urineMetabEntries.length} tox:${toxicEntries.length} nutr:${nutrientEntries.length})`);

  // OAT has no detect or normalize functions (minimal adapter)
  assert('OAT adapter has no detect function', adaptersSrc.includes("id: 'oat',\n    testTypes: ['OAT'],\n    markers: OAT_MARKERS,\n  }"));

  // Key OAT markers present across categories
  assert('OAT has oatMicrobial.citramalic', adaptersSrc.includes('"oatMicrobial.citramalic"'));
  assert('OAT has oatMetabolic.pyruvic', adaptersSrc.includes('"oatMetabolic.pyruvic"'));
  assert('OAT has oatNeuro.quinolinic', adaptersSrc.includes('"oatNeuro.quinolinic"'));
  assert('OAT has oatNutritional.methylmalonic', adaptersSrc.includes('"oatNutritional.methylmalonic"'));
  assert('OAT has oatAminoFatty.ethylmalonic', adaptersSrc.includes('"oatAminoFatty.ethylmalonic"'));
  assert('OAT has oxidativeStress.ohdg8', adaptersSrc.includes('"oxidativeStress.ohdg8"'));
  assert('OAT has urineAmino.taurine', adaptersSrc.includes('"urineAmino.taurine"'));
  assert('OAT has urineAminoMetab.glycine', adaptersSrc.includes('"urineAminoMetab.glycine"'));
  assert('OAT has toxicElements.lead', adaptersSrc.includes('"toxicElements.lead"'));
  assert('OAT has nutrientElements.zinc', adaptersSrc.includes('"nutrientElements.zinc"'));

  // OAT category labels
  assert('OAT has Microbial Overgrowth category', adaptersSrc.includes('"OAT: Microbial Overgrowth"'));
  assert('OAT has Metabolic category', adaptersSrc.includes('"OAT: Metabolic"'));
  assert('OAT has Neurotransmitters category', adaptersSrc.includes('"OAT: Neurotransmitters"'));
  assert('OAT has Nutritional & Detox category', adaptersSrc.includes('"OAT: Nutritional & Detox"'));
  assert('OAT has Amino Acids & Lipids category', adaptersSrc.includes('"OAT: Amino Acids & Lipids"'));

  // All OAT group markers use group: "OAT"
  assert('OAT markers use group "OAT"', adaptersSrc.includes('group: "OAT"'));

  // OAT testType detection
  assert('OAT testType is "OAT"', adaptersSrc.includes("testTypes: ['OAT']"));

  // ═══════════════════════════════════════
  // 4. Metabolomix Adapter
  // ═══════════════════════════════════════
  console.log('%c 4. Metabolomix Adapter ', 'font-weight:bold;color:#f59e0b');

  // Detection patterns
  assert('METABOLOMIX_PATTERNS defined', adaptersSrc.includes('const METABOLOMIX_PATTERNS = ['));
  assert('Detects "metabolomix" pattern', adaptersSrc.includes("'metabolomix'"));
  assert('Detects "genova diagnostics" pattern', adaptersSrc.includes("'genova diagnostics'"));
  assert('Detects "3200 metabolomix" pattern', adaptersSrc.includes("'3200 metabolomix'"));
  assert('Returns prefix metabolomix', adaptersSrc.includes("prefix: 'metabolomix'"));
  assert('Returns label Metabolomix+', adaptersSrc.includes("label: 'Metabolomix+'"));

  // Metabolomix has empty markers (reuses OAT + FA)
  assert('Metabolomix markers is empty object', adaptersSrc.includes("markers: {}, // Reuses OAT + FA"));

  // FA routing logic — separates FA markers from OAT markers
  assert('_normalizeMetabolomix function defined', adaptersSrc.includes('function _normalizeMetabolomix('));
  assert('Metabolomix detects FA marker keys', adaptersSrc.includes("const faMarkerKeys = new Set(Object.keys(FA_MARKERS)"));
  assert('Metabolomix has FA regex patterns', adaptersSrc.includes('const faPatterns = /omega|fatty|linole'));
  assert('Metabolomix routes FA to faMarkers array', adaptersSrc.includes('faMarkers.push(m)'));
  assert('Metabolomix routes non-FA to oatMarkers array', adaptersSrc.includes('oatMarkers.push(m)'));
  assert('Metabolomix uses metabolomixFA prefix', adaptersSrc.includes("prefix: 'metabolomixFA'"));
  assert('Metabolomix FA normalization calls _normalizeFAMarkers', adaptersSrc.includes('_normalizeFAMarkers(faMarkers, fileName, pdfText, metabolomixFA)'));

  // _detectMetabolomix function
  assert('_detectMetabolomix function defined', adaptersSrc.includes('function _detectMetabolomix('));
  assert('Metabolomix checks first 5000 chars of text', adaptersSrc.includes(".slice(0, 5000).toLowerCase()"));

  // ═══════════════════════════════════════
  // 5. Cross-Adapter Tests
  // ═══════════════════════════════════════
  console.log('%c 5. Cross-Adapter Tests ', 'font-weight:bold;color:#f59e0b');

  // getAdapterByTestType returns correct adapter for each type
  assert('getAdapterByTestType checks testTypes array', adaptersSrc.includes("a.testTypes.includes(testType)"));
  assert('getAdapterByTestType returns null for unknown', adaptersSrc.includes("|| null"));

  // ADAPTERS array contains all four adapters
  assert('ADAPTERS array defined', adaptersSrc.includes('const ADAPTERS = ['));
  const adapterBlocks = (adaptersSrc.match(/id: '\w+'/g) || []);
  assert('ADAPTERS has 4 entries', adapterBlocks.length === 4, `found ${adapterBlocks.length}`);

  // detectProduct iterates all adapters
  assert('detectProduct loops all adapters', adaptersSrc.includes('for (const adapter of ADAPTERS)'));
  assert('detectProduct returns adapter + product', adaptersSrc.includes('return { adapter, product: result }'));
  assert('detectProduct returns null when none match', /detectProduct[\s\S]*?return null;/.test(adaptersSrc));

  // normalizeWithAdapter delegates to adapter.normalize
  assert('normalizeWithAdapter calls adapter.normalize', adaptersSrc.includes('adapter.normalize(markers'));

  // getAllAdapterMarkers merges all adapter markers
  assert('getAllAdapterMarkers uses Object.assign', adaptersSrc.includes('Object.assign(all, adapter.markers)'));

  // SPECIALTY_MARKER_DEFS re-exported from schema.js
  assert('schema.js re-exports SPECIALTY_MARKER_DEFS', schemaSrc.includes("export { ADAPTER_MARKERS as SPECIALTY_MARKER_DEFS } from './adapters.js'"));

  // Adapter interface comment documents required fields
  assert('Adapter interface documented', adaptersSrc.includes('Adapter interface:'));
  assert('Interface documents id field', adaptersSrc.includes('id:         unique string identifier'));
  assert('Interface documents testTypes field', adaptersSrc.includes('testTypes:  array of testType values'));
  assert('Interface documents markers field', adaptersSrc.includes('markers:    object of'));

  // Imports
  assert('Imports MARKER_SCHEMA', adaptersSrc.includes("import { MARKER_SCHEMA } from './schema.js'"));
  assert('Imports isDebugMode', adaptersSrc.includes("import { isDebugMode } from './utils.js'"));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
