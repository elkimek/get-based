/** Identity repair accepts foreign definition fields without changing them. */
export type CustomMarkerDefinition = Record<string, unknown>;
export type CustomMarkerMap = Record<string, unknown>;
type OptionalMarkerMap = CustomMarkerMap | null | undefined;

// custom-marker-identity.js — Stable identities for profile-owned markers.

import { CUSTOM_MARKER_ID_PREFIX, isCustomMarkerId } from './marker-schema.js';
import { createUniqueId } from './unique-id.js';

const LEGACY_CUSTOM_MARKER_ID_PREFIX = `${CUSTOM_MARKER_ID_PREFIX}legacy_`;
const LEGACY_HASH_SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

function isDefinition(value: unknown): value is CustomMarkerDefinition {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A small deterministic 128-bit fingerprint for legacy migration. This is not
 * a security primitive: it only lets separate offline devices derive the same
 * opaque identity from the only stable legacy input they share.
 *
 */
function legacyFingerprint(value: string) {
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
 */
export function deriveLegacyCustomMarkerId(dotKey: unknown) {
  if (typeof dotKey !== 'string' || dotKey.length === 0) return null;
  return `${LEGACY_CUSTOM_MARKER_ID_PREFIX}${legacyFingerprint(dotKey)}`;
}

/**
 * Create a category- and name-independent identity for a new custom marker.
 *
 */
export function createCustomMarkerId(customMarkers: OptionalMarkerMap = null) {
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
 */
export function ensureCustomMarkerIdentity(definition: unknown, customMarkers: OptionalMarkerMap = null) {
  if (!isDefinition(definition)) return null;
  if (isCustomMarkerId(definition.markerId)) return definition.markerId as string;
  definition.markerId = createCustomMarkerId(customMarkers);
  return definition.markerId as string;
}

/**
 * Add identities to legacy definitions and repair duplicate or malformed IDs.
 * The lexicographically first definition owns a duplicated valid ID; later
 * definitions receive deterministic legacy identities. Existing unique IDs
 * are always preserved.
 *
 */
export function migrateCustomMarkerIdentities<T extends OptionalMarkerMap>(customMarkers: T): T {
  if (!customMarkers || typeof customMarkers !== 'object' || Array.isArray(customMarkers)) {
    return customMarkers;
  }

  const entries = Object.entries(customMarkers)
    .filter(([, definition]) => isDefinition(definition))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0) as [string, CustomMarkerDefinition][];
  const ownerById = new Map<string, string>();
  for (const [dotKey, definition] of entries) {
    if (isCustomMarkerId(definition.markerId) && !ownerById.has(definition.markerId as string)) {
      ownerById.set(definition.markerId as string, dotKey);
    }
  }

  const assignedIds = new Set(ownerById.keys());
  for (const [dotKey, definition] of entries) {
    if (isCustomMarkerId(definition.markerId) && ownerById.get(definition.markerId as string) === dotKey) {
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

export function getCustomMarkerId(customMarkers: OptionalMarkerMap, dotKey: unknown) {
  if (typeof dotKey !== 'string') return null;
  const definition = customMarkers?.[dotKey];
  return isDefinition(definition) && isCustomMarkerId(definition.markerId)
    ? definition.markerId as string
    : null;
}

export function getCustomMarkerDotKey(customMarkers: OptionalMarkerMap, markerId: unknown) {
  if (!isCustomMarkerId(markerId)) return null;
  for (const [dotKey, definition] of Object.entries(customMarkers || {})) {
    if (isDefinition(definition) && definition.markerId === markerId) return dotKey;
  }
  return null;
}

export function resolveCustomMarkerDotKey(customMarkers: OptionalMarkerMap, value: unknown) {
  if (typeof value !== 'string') return null;
  if (isDefinition(customMarkers?.[value])) return value;
  return getCustomMarkerDotKey(customMarkers, value);
}
