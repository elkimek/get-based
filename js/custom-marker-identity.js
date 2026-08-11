// @ts-check
// custom-marker-identity.js — Stable identities for profile-owned markers.

import { CUSTOM_MARKER_ID_PREFIX, isCustomMarkerId } from './marker-schema.js';
import { createUniqueId } from './unique-id.js';

const LEGACY_CUSTOM_MARKER_ID_PREFIX = `${CUSTOM_MARKER_ID_PREFIX}legacy_`;
const LEGACY_HASH_SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

/** @param {unknown} value */
function isDefinition(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A small deterministic 128-bit fingerprint for legacy migration. This is not
 * a security primitive: it only lets separate offline devices derive the same
 * opaque identity from the only stable legacy input they share.
 *
 * @param {string} value
 */
function legacyFingerprint(value) {
  return LEGACY_HASH_SEEDS.map(seed => {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      hash ^= code & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash ^= code >>> 8;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }).join('');
}

/**
 * Derive a convergent identity for a marker that predates stable custom IDs.
 * New markers must use createCustomMarkerId instead.
 *
 * @param {unknown} dotKey
 * @returns {string | null}
 */
export function deriveLegacyCustomMarkerId(dotKey) {
  if (typeof dotKey !== 'string' || dotKey.length === 0) return null;
  return `${LEGACY_CUSTOM_MARKER_ID_PREFIX}${legacyFingerprint(dotKey)}`;
}

/**
 * Create a category- and name-independent identity for a new custom marker.
 *
 * @param {Record<string, any> | null | undefined} [customMarkers]
 * @returns {string}
 */
export function createCustomMarkerId(customMarkers = null) {
  const usedIds = new Set(
    Object.values(customMarkers || {})
      .filter(isDefinition)
      .map(definition => definition.markerId)
      .filter(isCustomMarkerId),
  );
  for (let attempt = 0; attempt < 16; attempt++) {
    const markerId = createUniqueId(CUSTOM_MARKER_ID_PREFIX);
    if (!usedIds.has(markerId)) return markerId;
  }
  throw new Error('Could not allocate a unique custom marker identity.');
}

/**
 * Ensure a newly authored definition has an opaque identity without replacing
 * an identity received through import or sync.
 *
 * @param {any} definition
 * @param {Record<string, any> | null | undefined} [customMarkers]
 * @returns {string | null}
 */
export function ensureCustomMarkerIdentity(definition, customMarkers = null) {
  if (!isDefinition(definition)) return null;
  if (isCustomMarkerId(definition.markerId)) return definition.markerId;
  definition.markerId = createCustomMarkerId(customMarkers);
  return definition.markerId;
}

/**
 * Add identities to legacy definitions and repair duplicate or malformed IDs.
 * The lexicographically first definition owns a duplicated valid ID; later
 * definitions receive deterministic legacy identities. Existing unique IDs
 * are always preserved.
 *
 * @param {Record<string, any> | null | undefined} customMarkers
 * @returns {Record<string, any> | null | undefined}
 */
export function migrateCustomMarkerIdentities(customMarkers) {
  if (!customMarkers || typeof customMarkers !== 'object' || Array.isArray(customMarkers)) {
    return customMarkers;
  }

  const entries = Object.entries(customMarkers)
    .filter(([, definition]) => isDefinition(definition))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const ownerById = new Map();
  for (const [dotKey, definition] of entries) {
    if (isCustomMarkerId(definition.markerId) && !ownerById.has(definition.markerId)) {
      ownerById.set(definition.markerId, dotKey);
    }
  }

  const assignedIds = new Set(ownerById.keys());
  for (const [dotKey, definition] of entries) {
    if (isCustomMarkerId(definition.markerId) && ownerById.get(definition.markerId) === dotKey) {
      continue;
    }
    const baseId = deriveLegacyCustomMarkerId(dotKey);
    if (!baseId) continue;
    let markerId = baseId;
    let suffix = 2;
    while (assignedIds.has(markerId)) markerId = `${baseId}_${suffix++}`;
    definition.markerId = markerId;
    assignedIds.add(markerId);
  }
  return customMarkers;
}

/** @param {Record<string, any> | null | undefined} customMarkers @param {unknown} dotKey */
export function getCustomMarkerId(customMarkers, dotKey) {
  if (typeof dotKey !== 'string') return null;
  const definition = customMarkers?.[dotKey];
  return isDefinition(definition) && isCustomMarkerId(definition.markerId)
    ? definition.markerId
    : null;
}

/** @param {Record<string, any> | null | undefined} customMarkers @param {unknown} markerId */
export function getCustomMarkerDotKey(customMarkers, markerId) {
  if (!isCustomMarkerId(markerId)) return null;
  for (const [dotKey, definition] of Object.entries(customMarkers || {})) {
    if (isDefinition(definition) && definition.markerId === markerId) return dotKey;
  }
  return null;
}

/** @param {Record<string, any> | null | undefined} customMarkers @param {unknown} value */
export function resolveCustomMarkerDotKey(customMarkers, value) {
  if (typeof value !== 'string') return null;
  if (isDefinition(customMarkers?.[value])) return value;
  return getCustomMarkerDotKey(customMarkers, value);
}
