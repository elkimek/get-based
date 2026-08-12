#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_MARKER_IDENTITY_DEFINITIONS,
  MARKER_SCHEMA,
} from '../js/marker-schema/index.js';

const TARGET_PATH = fileURLToPath(new URL('../js/marker-schema.js', import.meta.url));

export function renderMarkerSchema() {
  validateMarkerIdentities();
  const identityOverrides = runtimeMarkerIdentityOverrides();
  return `// @ts-check\n`
    + `// Generated from js/marker-schema/index.js. Run npm run marker-schema:build; do not edit.\n\n`
    + `export const MARKER_SCHEMA = ${JSON.stringify(MARKER_SCHEMA)};\n\n`
    + `/** @type {Record<string, [string, string[], string[]]>} */\n`
    + `const markerIdentityOverrides = ${JSON.stringify(identityOverrides)};\n`
    + `const markerIdentities = [];\n`
    + `for (const [categoryKey, category] of Object.entries(MARKER_SCHEMA)) {\n`
    + `  for (const markerKey of Object.keys(category.markers || {})) {\n`
    + `    const currentDotKey = \`\${categoryKey}.\${markerKey}\`;\n`
    + `    const override = markerIdentityOverrides[currentDotKey];\n`
    + `    markerIdentities.push(Object.freeze({\n`
    + `      id: \`gb:marker:\${override?.[0] || markerKey}\`,\n`
    + `      currentDotKey,\n`
    + `      legacyDotKeys: Object.freeze(override?.[1] || []),\n`
    + `      legacyIds: Object.freeze(override?.[2] || []),\n`
    + `    }));\n`
    + `  }\n`
    + `}\n`
    + `export const BUILTIN_MARKER_IDENTITIES = Object.freeze(markerIdentities);\n`
    + `/** @type {Map<string, (typeof BUILTIN_MARKER_IDENTITIES)[number]>} */\n`
    + `const builtinMarkerIdentityById = new Map(BUILTIN_MARKER_IDENTITIES.map(identity => [identity.id, identity]));\n`
    + `for (const identity of BUILTIN_MARKER_IDENTITIES) {\n`
    + `  for (const legacyId of identity.legacyIds) builtinMarkerIdentityById.set(legacyId, identity);\n`
    + `}\n`
    + `/** @type {Map<string, string>} */\n`
    + `const builtinMarkerIdByDotKey = new Map(BUILTIN_MARKER_IDENTITIES.map(identity => [identity.currentDotKey, identity.id]));\n`
    + `for (const identity of BUILTIN_MARKER_IDENTITIES) {\n`
    + `  for (const legacyDotKey of identity.legacyDotKeys) builtinMarkerIdByDotKey.set(legacyDotKey, identity.id);\n`
    + `}\n`
    + `export const BUILTIN_MARKER_DOT_KEY_ALIASES = Object.freeze(Object.fromEntries(\n`
    + `  BUILTIN_MARKER_IDENTITIES.flatMap(identity => identity.legacyDotKeys.map(dotKey => [dotKey, identity.currentDotKey])),\n`
    + `));\n\n`
    + `export const BUILTIN_MARKER_ID_ALIASES = Object.freeze(Object.fromEntries(\n`
    + `  BUILTIN_MARKER_IDENTITIES.flatMap(identity => identity.legacyIds.map(markerId => [markerId, identity.id])),\n`
    + `));\n\n`
    + `/** @param {unknown} dotKey @returns {string | null} */\n`
    + `export function getBuiltinMarkerId(dotKey) {\n`
    + `  return typeof dotKey === 'string' ? builtinMarkerIdByDotKey.get(dotKey) || null : null;\n`
    + `}\n\n`
    + `/** @param {unknown} markerId @returns {string | null} */\n`
    + `export function getBuiltinMarkerDotKey(markerId) {\n`
    + `  return typeof markerId === 'string' ? builtinMarkerIdentityById.get(markerId)?.currentDotKey || null : null;\n`
    + `}\n\n`
    + `/** @param {unknown} value @returns {string | null} */\n`
    + `export function resolveBuiltinMarkerDotKey(value) {\n`
    + `  if (typeof value !== 'string') return null;\n`
    + `  const identity = builtinMarkerIdentityById.get(value);\n`
    + `  if (identity) return identity.currentDotKey;\n`
    + `  const markerId = builtinMarkerIdByDotKey.get(value);\n`
    + `  return markerId ? builtinMarkerIdentityById.get(markerId)?.currentDotKey || null : null;\n`
    + `}\n\n`
    + `export const CUSTOM_MARKER_ID_PREFIX = 'custom:';\n`
    + `/** @param {unknown} value @returns {boolean} */\n`
    + `export function isCustomMarkerId(value) {\n`
    + `  return typeof value === 'string' && /^custom:[A-Za-z0-9_-]+$/.test(value);\n`
    + `}\n`;
}

function runtimeMarkerIdentityOverrides() {
  /** @type {Record<string, [string, readonly string[], readonly string[]]>} */
  const overrides = {};
  for (const identity of BUILTIN_MARKER_IDENTITY_DEFINITIONS) {
    const identityKey = identity.id.slice('gb:marker:'.length);
    const markerKey = identity.currentDotKey.slice(identity.currentDotKey.indexOf('.') + 1);
    if (identityKey !== markerKey || identity.legacyDotKeys.length || identity.legacyIds.length) {
      overrides[identity.currentDotKey] = [identityKey, identity.legacyDotKeys, identity.legacyIds];
    }
  }
  return overrides;
}

function validateMarkerIdentities() {
  const catalogDotKeys = Object.entries(MARKER_SCHEMA).flatMap(([categoryKey, category]) =>
    Object.keys(category.markers || {}).map(markerKey => `${categoryKey}.${markerKey}`));
  const catalogDotKeySet = new Set(catalogDotKeys);
  const ids = new Set();
  const currentDotKeys = new Set();
  const legacyDotKeys = new Set();
  const legacyIds = new Set();

  for (const identity of BUILTIN_MARKER_IDENTITY_DEFINITIONS) {
    if (!/^gb:marker:[A-Za-z][A-Za-z0-9_]*$/.test(identity.id)) {
      throw new Error(`Invalid built-in marker id: ${identity.id}`);
    }
    if (ids.has(identity.id)) throw new Error(`Duplicate built-in marker id: ${identity.id}`);
    if (!catalogDotKeySet.has(identity.currentDotKey)) {
      throw new Error(`Unknown current marker dotKey: ${identity.currentDotKey}`);
    }
    if (currentDotKeys.has(identity.currentDotKey)) {
      throw new Error(`Duplicate current marker dotKey: ${identity.currentDotKey}`);
    }
    ids.add(identity.id);
    currentDotKeys.add(identity.currentDotKey);

    for (const legacyDotKey of identity.legacyDotKeys) {
      if (legacyDotKey === identity.currentDotKey || catalogDotKeySet.has(legacyDotKey)) {
        throw new Error(`Legacy marker dotKey is still current: ${legacyDotKey}`);
      }
      if (legacyDotKeys.has(legacyDotKey)) {
        throw new Error(`Duplicate legacy marker dotKey: ${legacyDotKey}`);
      }
      legacyDotKeys.add(legacyDotKey);
    }
    for (const legacyId of identity.legacyIds) {
      if (!/^gb:marker:[A-Za-z][A-Za-z0-9_]*$/.test(legacyId)) {
        throw new Error(`Invalid legacy built-in marker id: ${legacyId}`);
      }
      if (legacyId === identity.id || ids.has(legacyId) || legacyIds.has(legacyId)) {
        throw new Error(`Duplicate legacy built-in marker id: ${legacyId}`);
      }
      legacyIds.add(legacyId);
    }
  }

  if ([...ids].some(id => legacyIds.has(id))) {
    throw new Error('A legacy built-in marker id is still current.');
  }

  if (currentDotKeys.size !== catalogDotKeySet.size
      || catalogDotKeys.some(dotKey => !currentDotKeys.has(dotKey))) {
    throw new Error('Built-in marker identities must cover every current schema dotKey exactly once.');
  }
}

const rendered = renderMarkerSchema();
if (process.argv.includes('--write')) {
  fs.writeFileSync(TARGET_PATH, rendered);
  console.log('Updated js/marker-schema.js');
} else if (fs.readFileSync(TARGET_PATH, 'utf8') !== rendered) {
  console.error('js/marker-schema.js is stale; run npm run marker-schema:build');
  process.exitCode = 1;
} else {
  console.log('Marker schema runtime catalog is current.');
}
