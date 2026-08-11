#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILTIN_MARKER_IDENTITY_DEFINITIONS } from '../js/marker-schema/index.js';
import {
  MARKER_TERMINOLOGY_DEFINITIONS,
  TERMINOLOGY_CATALOG_DEFINITIONS,
} from '../js/marker-terminology/index.js';

const TARGET_PATH = fileURLToPath(new URL('../js/marker-terminology.js', import.meta.url));
const OBSERVATION_TERMINOLOGIES = ['loinc', 'npu', 'nclp'];
const CATALOG_KEYS = [...OBSERVATION_TERMINOLOGIES, 'ucum'];
const STATUS_VALUES = new Set(['active', 'deprecated']);
const CONTEXT_KEYS = ['system', 'component', 'property', 'timeAspect', 'scale', 'method'];
const CODE_PATTERNS = {
  loinc: /^\d{1,7}-\d$/,
  npu: /^NPU\d{5}$/,
  nclp: /^\d{5}$/,
};

export function renderMarkerTerminology() {
  validateMarkerTerminology();
  const registry = buildRegistry();
  return `// @ts-check\n`
    + `// Generated from js/marker-terminology/index.js. Run npm run marker-terminology:build; do not edit.\n\n`
    + `/** @typedef {'loinc' | 'npu' | 'nclp'} MarkerTerminology */\n`
    + `/** @typedef {'active' | 'deprecated'} MarkerTerminologyStatus */\n`
    + `/** @typedef {{ system: string, component: string, property: string, timeAspect: string | null, scale: string | null, method: string | null }} MarkerTerminologyContext */\n`
    + `/** @typedef {{ url: string, release: string, verifiedOn: string }} MarkerTerminologySource */\n`
    + `/** @typedef {{ markerId: string, terminology: MarkerTerminology, code: string, display: string, status: MarkerTerminologyStatus, context: MarkerTerminologyContext, ucumUnits: string[], source: MarkerTerminologySource }} MarkerTerminologyMapping */\n`
    + `/** @typedef {{ title: string, authority: string, homepageUrl: string }} TerminologyCatalog */\n\n`
    + `/** @template T @param {T} value @returns {T} */\n`
    + `function deepFreeze(value) {\n`
    + `  if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n`
    + `    for (const nested of Object.values(value)) deepFreeze(nested);\n`
    + `    Object.freeze(value);\n`
    + `  }\n`
    + `  return value;\n`
    + `}\n\n`
    + `/** @type {Record<string, TerminologyCatalog>} */\n`
    + `const terminologyCatalogs = ${JSON.stringify(TERMINOLOGY_CATALOG_DEFINITIONS)};\n`
    + `export const TERMINOLOGY_CATALOGS = deepFreeze(terminologyCatalogs);\n\n`
    + `/** @type {Record<string, MarkerTerminologyMapping[]>} */\n`
    + `const markerTerminologyRegistry = ${JSON.stringify(registry)};\n`
    + `export const MARKER_TERMINOLOGY_REGISTRY = deepFreeze(markerTerminologyRegistry);\n`
    + `/** @type {Readonly<MarkerTerminologyMapping[]>} */\n`
    + `const EMPTY_MAPPINGS = Object.freeze([]);\n`
    + `/** @type {Map<string, MarkerTerminologyMapping>} */\n`
    + `const mappingByTerminologyCode = new Map();\n`
    + `for (const mappings of Object.values(MARKER_TERMINOLOGY_REGISTRY)) {\n`
    + `  for (const mapping of mappings) {\n`
    + `    mappingByTerminologyCode.set(\`\${mapping.terminology}:\${mapping.code}\`, mapping);\n`
    + `  }\n`
    + `}\n\n`
    + `/**\n`
    + ` * @param {unknown} markerId\n`
    + ` * @param {unknown} [terminology]\n`
    + ` * @returns {Readonly<MarkerTerminologyMapping[]>}\n`
    + ` */\n`
    + `export function getMarkerTerminologyMappings(markerId, terminology) {\n`
    + `  if (typeof markerId !== 'string') return EMPTY_MAPPINGS;\n`
    + `  const mappings = MARKER_TERMINOLOGY_REGISTRY[markerId] || EMPTY_MAPPINGS;\n`
    + `  if (terminology === undefined || terminology === null) return mappings;\n`
    + `  if (typeof terminology !== 'string') return EMPTY_MAPPINGS;\n`
    + `  return Object.freeze(mappings.filter(mapping => mapping.terminology === terminology));\n`
    + `}\n\n`
    + `/**\n`
    + ` * @param {unknown} terminology\n`
    + ` * @param {unknown} code\n`
    + ` * @returns {MarkerTerminologyMapping | null}\n`
    + ` */\n`
    + `export function findMarkerTerminologyMapping(terminology, code) {\n`
    + `  if (typeof terminology !== 'string' || typeof code !== 'string') return null;\n`
    + `  return mappingByTerminologyCode.get(\`\${terminology}:\${code}\`) || null;\n`
    + `}\n`;
}

function buildRegistry() {
  /** @type {Record<string, object[]>} */
  const registry = {};
  for (const mapping of MARKER_TERMINOLOGY_DEFINITIONS) {
    (registry[mapping.markerId] ||= []).push(mapping);
  }
  return registry;
}

function validateMarkerTerminology() {
  const knownMarkerIds = new Set(BUILTIN_MARKER_IDENTITY_DEFINITIONS.map(identity => identity.id));
  const actualCatalogKeys = Object.keys(TERMINOLOGY_CATALOG_DEFINITIONS).sort();
  if (JSON.stringify(actualCatalogKeys) !== JSON.stringify([...CATALOG_KEYS].sort())) {
    throw new Error(`Terminology catalogs must be exactly: ${CATALOG_KEYS.join(', ')}`);
  }

  for (const [key, catalog] of Object.entries(TERMINOLOGY_CATALOG_DEFINITIONS)) {
    requireNonEmptyString(catalog.title, `${key} catalog title`);
    requireNonEmptyString(catalog.authority, `${key} catalog authority`);
    requireHttpsUrl(catalog.homepageUrl, `${key} catalog homepage`);
  }

  const codeKeys = new Set();
  for (const mapping of MARKER_TERMINOLOGY_DEFINITIONS) {
    if (!knownMarkerIds.has(mapping.markerId)) {
      throw new Error(`Unknown marker id in terminology registry: ${mapping.markerId}`);
    }
    if (!OBSERVATION_TERMINOLOGIES.includes(mapping.terminology)) {
      throw new Error(`Unsupported marker terminology: ${mapping.terminology}`);
    }
    if (!CODE_PATTERNS[mapping.terminology].test(mapping.code)) {
      throw new Error(`Invalid ${mapping.terminology} code: ${mapping.code}`);
    }
    const codeKey = `${mapping.terminology}:${mapping.code}`;
    if (codeKeys.has(codeKey)) throw new Error(`Duplicate terminology code: ${codeKey}`);
    codeKeys.add(codeKey);

    requireNonEmptyString(mapping.display, `${codeKey} display`);
    if (!STATUS_VALUES.has(mapping.status)) {
      throw new Error(`Invalid status for ${codeKey}: ${mapping.status}`);
    }
    validateContext(mapping.context, codeKey);
    validateUcumUnits(mapping.ucumUnits, codeKey);
    requireHttpsUrl(mapping.source.url, `${codeKey} source URL`);
    requireNonEmptyString(mapping.source.release, `${codeKey} source release`);
    if (!isValidIsoCalendarDate(mapping.source.verifiedOn)) {
      throw new Error(`Invalid verification date for ${codeKey}: ${mapping.source.verifiedOn}`);
    }
    if (mapping.terminology === 'loinc' && !mapping.source.url.endsWith(`/${mapping.code}`)) {
      throw new Error(`LOINC source URL must identify ${mapping.code}`);
    }
  }

  if (MARKER_TERMINOLOGY_DEFINITIONS.length === 0) {
    throw new Error('Marker terminology registry must not be empty.');
  }
}

function validateContext(context, codeKey) {
  const actualKeys = Object.keys(context).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...CONTEXT_KEYS].sort())) {
    throw new Error(`${codeKey} context must contain exactly: ${CONTEXT_KEYS.join(', ')}`);
  }
  requireNonEmptyString(context.system, `${codeKey} system`);
  requireNonEmptyString(context.component, `${codeKey} component`);
  requireNonEmptyString(context.property, `${codeKey} property`);
  for (const key of ['timeAspect', 'scale', 'method']) {
    const value = context[key];
    if (value !== null && (typeof value !== 'string' || value.length === 0)) {
      throw new Error(`${codeKey} ${key} must be a non-empty string or null`);
    }
  }
}

function validateUcumUnits(units, codeKey) {
  if (!Array.isArray(units) || units.length === 0) {
    throw new Error(`${codeKey} must declare at least one UCUM unit`);
  }
  if (new Set(units).size !== units.length) {
    throw new Error(`${codeKey} contains duplicate UCUM units`);
  }
  for (const unit of units) {
    if (typeof unit !== 'string' || !/^[\x21-\x7e]+$/.test(unit)) {
      throw new Error(`${codeKey} has an invalid UCUM unit expression: ${unit}`);
    }
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function requireHttpsUrl(value, label) {
  requireNonEmptyString(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
}

export function isValidIsoCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rendered = renderMarkerTerminology();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(TARGET_PATH, rendered);
    console.log('Updated js/marker-terminology.js');
  } else if (!fs.existsSync(TARGET_PATH) || fs.readFileSync(TARGET_PATH, 'utf8') !== rendered) {
    console.error('js/marker-terminology.js is stale; run npm run marker-terminology:build');
    process.exitCode = 1;
  } else {
    console.log('Marker terminology runtime registry is current.');
  }
}
