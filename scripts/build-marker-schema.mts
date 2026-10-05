#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_MARKER_IDENTITY_DEFINITIONS,
  MARKER_SCHEMA,
} from '../js/marker-schema/index.js';

const TARGET_PATH = fileURLToPath(new URL('../js/marker-schema.ts', import.meta.url));

export function renderMarkerSchema() {
  validateMarkerIdentities();
  const identityOverrides = runtimeMarkerIdentityOverrides();
  return `import type { MarkerCategory } from './marker-schema/types.js';
// Generated from js/marker-schema/index.ts. Run npm run marker-schema:build; do not edit.

export interface BuiltinMarkerIdentity { id: string; currentDotKey: string; legacyDotKeys: readonly string[]; legacyIds: readonly string[] }

export const MARKER_SCHEMA: Record<string, MarkerCategory> = ${JSON.stringify(MARKER_SCHEMA)};

const markerIdentityOverrides: Record<string, [string, string[], string[]]> = ${JSON.stringify(identityOverrides)};
const markerIdentities: BuiltinMarkerIdentity[] = [];
for (const [categoryKey, category] of Object.entries(MARKER_SCHEMA)) {
  for (const markerKey of Object.keys(category.markers || {})) {
    const currentDotKey = \`\${categoryKey}.\${markerKey}\`;
    const override = markerIdentityOverrides[currentDotKey];
    markerIdentities.push(Object.freeze({
      id: \`gb:marker:\${override?.[0] || markerKey}\`,
      currentDotKey,
      legacyDotKeys: Object.freeze(override?.[1] || []),
      legacyIds: Object.freeze(override?.[2] || []),
    }));
  }
}
export const BUILTIN_MARKER_IDENTITIES = Object.freeze(markerIdentities);
const builtinMarkerIdentityById = new Map(BUILTIN_MARKER_IDENTITIES.map(identity => [identity.id, identity]));
for (const identity of BUILTIN_MARKER_IDENTITIES) {
  for (const legacyId of identity.legacyIds) builtinMarkerIdentityById.set(legacyId, identity);
}
const builtinMarkerIdByDotKey = new Map(BUILTIN_MARKER_IDENTITIES.map(identity => [identity.currentDotKey, identity.id]));
for (const identity of BUILTIN_MARKER_IDENTITIES) {
  for (const legacyDotKey of identity.legacyDotKeys) builtinMarkerIdByDotKey.set(legacyDotKey, identity.id);
}
export const BUILTIN_MARKER_DOT_KEY_ALIASES = Object.freeze(Object.fromEntries(
  BUILTIN_MARKER_IDENTITIES.flatMap(identity => identity.legacyDotKeys.map(dotKey => [dotKey, identity.currentDotKey])),
));

export const BUILTIN_MARKER_ID_ALIASES = Object.freeze(Object.fromEntries(
  BUILTIN_MARKER_IDENTITIES.flatMap(identity => identity.legacyIds.map(markerId => [markerId, identity.id])),
));

export function getBuiltinMarkerId(dotKey: unknown) {
  return typeof dotKey === 'string' ? builtinMarkerIdByDotKey.get(dotKey) || null : null;
}

export function getBuiltinMarkerDotKey(markerId: unknown) {
  return typeof markerId === 'string' ? builtinMarkerIdentityById.get(markerId)?.currentDotKey || null : null;
}

export function resolveBuiltinMarkerDotKey(value: unknown) {
  if (typeof value !== 'string') return null;
  const identity = builtinMarkerIdentityById.get(value);
  if (identity) return identity.currentDotKey;
  const markerId = builtinMarkerIdByDotKey.get(value);
  return markerId ? builtinMarkerIdentityById.get(markerId)?.currentDotKey || null : null;
}

export const CUSTOM_MARKER_ID_PREFIX = 'custom:';
export function isCustomMarkerId(value: unknown) {
  return typeof value === 'string' && /^custom:[A-Za-z0-9_-]+$/.test(value);
}
`;
}

function runtimeMarkerIdentityOverrides() {
  const overrides: Record<string, [string, readonly string[], readonly string[]]> = {};
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
  console.log('Updated js/marker-schema.ts');
} else if (fs.readFileSync(TARGET_PATH, 'utf8') !== rendered) {
  console.error('js/marker-schema.ts is stale; run npm run marker-schema:build');
  process.exitCode = 1;
} else {
  console.log('Marker schema runtime catalog is current.');
}
