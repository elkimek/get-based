// @ts-check
// marker-placement.js — Category-independent marker placement metadata.

import {
  deriveLegacyCustomMarkerId,
  getCustomMarkerDotKey,
  getCustomMarkerId,
} from './custom-marker-identity.js';
import {
  BUILTIN_MARKER_IDENTITIES,
  getBuiltinMarkerDotKey,
  getBuiltinMarkerId,
  MARKER_SCHEMA,
} from './marker-schema.js';

const CATEGORY_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/** @param {unknown} value */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} dotKey */
function splitDotKey(dotKey) {
  if (typeof dotKey !== 'string') return null;
  const dot = dotKey.indexOf('.');
  if (dot < 1 || dot === dotKey.length - 1) return null;
  const categoryKey = dotKey.slice(0, dot);
  const markerKey = dotKey.slice(dot + 1);
  if (!CATEGORY_KEY_RE.test(categoryKey) || !/^[A-Za-z0-9_]+$/.test(markerKey)) return null;
  return { categoryKey, markerKey };
}

/**
 * Keep placement metadata additive and forward-compatible. Unknown marker IDs,
 * destinations, and extra object fields must survive import/sync ordering; the
 * runtime simply falls back to the marker's native category until they resolve.
 *
 * @param {Record<string, any>} data
 * @returns {Record<string, any>}
 */
export function migrateMarkerPlacements(data) {
  if (!isRecord(data.markerPlacements)) data.markerPlacements = {};
  for (const [markerId, placement] of Object.entries(data.markerPlacements)) {
    if (typeof placement === 'string') {
      data.markerPlacements[markerId] = { categoryKey: placement };
    }
  }
  return data.markerPlacements;
}

/**
 * @param {Record<string, any>} profileData
 * @param {unknown} value Stable marker ID or native storage dotkey.
 */
export function resolveMarkerIdentity(profileData, value) {
  const customMarkers = isRecord(profileData?.customMarkers) ? profileData.customMarkers : {};
  const builtinMarkerId = getBuiltinMarkerId(value)
    || (getBuiltinMarkerDotKey(value) ? String(value) : null);
  const builtinDotKey = getBuiltinMarkerDotKey(builtinMarkerId);
  if (builtinDotKey && builtinMarkerId) {
    const parts = splitDotKey(builtinDotKey);
    return parts ? { markerId: builtinMarkerId, storageDotKey: builtinDotKey, ...parts, custom: false } : null;
  }

  let storageDotKey = getCustomMarkerDotKey(customMarkers, value);
  if (!storageDotKey && typeof value === 'string' && isRecord(customMarkers[value])) storageDotKey = value;
  const parts = splitDotKey(storageDotKey);
  if (!parts || !storageDotKey) return null;
  const markerId = getCustomMarkerId(customMarkers, storageDotKey)
    || deriveLegacyCustomMarkerId(storageDotKey);
  return markerId ? { markerId, storageDotKey, ...parts, custom: true } : null;
}

/** @param {Record<string, any>} profileData */
function buildCategoryModes(profileData) {
  const modes = new Map();
  for (const [categoryKey, category] of Object.entries(MARKER_SCHEMA)) {
    modes.set(categoryKey, {
      calculated: !!category.calculated,
      singlePoint: !!category.singlePoint,
    });
  }
  for (const [dotKey, definition] of Object.entries(profileData?.customMarkers || {})) {
    const parts = splitDotKey(dotKey);
    if (!parts || modes.has(parts.categoryKey) || !isRecord(definition)) continue;
    modes.set(parts.categoryKey, {
      calculated: false,
      singlePoint: !!definition.singlePoint,
    });
  }
  return modes;
}

/** @param {Record<string, any>} profileData */
function listMarkerIdentities(profileData) {
  const markers = [];
  const occupiedNativeSlots = new Set();
  for (const identity of BUILTIN_MARKER_IDENTITIES) {
    const parts = splitDotKey(identity.currentDotKey);
    if (!parts) continue;
    markers.push({
      markerId: identity.id,
      storageDotKey: identity.currentDotKey,
      ...parts,
      custom: false,
    });
    occupiedNativeSlots.add(`${parts.categoryKey}.${parts.markerKey}`);
  }
  for (const dotKey of Object.keys(profileData?.customMarkers || {}).sort()) {
    const marker = resolveMarkerIdentity(profileData, dotKey);
    if (!marker || occupiedNativeSlots.has(marker.storageDotKey)) continue;
    markers.push(marker);
    occupiedNativeSlots.add(marker.storageDotKey);
  }
  return markers.sort((left, right) => left.storageDotKey < right.storageDotKey ? -1 : left.storageDotKey > right.storageDotKey ? 1 : 0);
}

/**
 * Resolve every known marker to one safe display category. Native category
 * slots remain reserved even when their marker moves, making imported
 * conflicts deterministic and preventing one marker from hiding another.
 *
 * @param {Record<string, any>} profileData
 * @returns {Record<string, any>}
 */
export function getMarkerPlacementPlan(profileData) {
  const modes = buildCategoryModes(profileData || {});
  const markers = listMarkerIdentities(profileData || {});
  const placements = isRecord(profileData?.markerPlacements) ? profileData.markerPlacements : {};
  const reserved = new Map(markers.map(marker => [marker.storageDotKey, marker.markerId]));
  const plan = {};

  for (const marker of markers) {
    const raw = placements[marker.markerId];
    const requestedCategoryKey = typeof raw === 'string'
      ? raw
      : isRecord(raw) && typeof raw.categoryKey === 'string' ? raw.categoryKey : null;
    let effectiveCategoryKey = marker.categoryKey;
    let reason = requestedCategoryKey ? 'invalid-category' : 'native';

    if (requestedCategoryKey === marker.categoryKey) {
      reason = 'native';
    } else if (requestedCategoryKey && CATEGORY_KEY_RE.test(requestedCategoryKey)) {
      const sourceMode = modes.get(marker.categoryKey);
      const destinationMode = modes.get(requestedCategoryKey);
      const destinationSlot = `${requestedCategoryKey}.${marker.markerKey}`;
      if (!destinationMode) {
        reason = 'unknown-category';
      } else if (sourceMode?.calculated || destinationMode.calculated) {
        reason = 'calculated-category';
      } else if (!!sourceMode?.singlePoint !== !!destinationMode.singlePoint) {
        reason = 'category-mode-mismatch';
      } else if (reserved.has(destinationSlot) && reserved.get(destinationSlot) !== marker.markerId) {
        reason = 'marker-key-collision';
      } else {
        effectiveCategoryKey = requestedCategoryKey;
        reason = 'placed';
        reserved.set(destinationSlot, marker.markerId);
      }
    }

    plan[marker.markerId] = {
      ...marker,
      requestedCategoryKey,
      effectiveCategoryKey,
      reason,
    };
  }
  return plan;
}

/**
 * Store a marker's primary display category without re-keying any marker data.
 * Moving back to the native category removes the redundant override.
 *
 * @param {Record<string, any>} profileData
 * @param {string} markerReference Stable marker ID or native storage dotkey.
 * @param {string} categoryKey
 */
export function setMarkerPlacement(profileData, markerReference, categoryKey) {
  const marker = resolveMarkerIdentity(profileData, markerReference);
  if (!marker) return { ok: false, changed: false, reason: 'unknown-marker' };
  if (categoryKey === marker.categoryKey) return clearMarkerPlacement(profileData, marker.markerId);

  const current = isRecord(profileData.markerPlacements) ? profileData.markerPlacements : {};
  const candidatePlacements = {
    ...current,
    [marker.markerId]: {
      ...(isRecord(current[marker.markerId]) ? current[marker.markerId] : {}),
      categoryKey,
    },
  };
  const candidateProfile = { ...profileData, markerPlacements: candidatePlacements };
  const resolved = getMarkerPlacementPlan(candidateProfile)[marker.markerId];
  if (!resolved || resolved.effectiveCategoryKey !== categoryKey || resolved.reason !== 'placed') {
    return { ok: false, changed: false, reason: resolved?.reason || 'invalid-category' };
  }

  const previous = current[marker.markerId];
  profileData.markerPlacements = current;
  current[marker.markerId] = candidatePlacements[marker.markerId];
  return {
    ok: true,
    changed: !isRecord(previous) || previous.categoryKey !== categoryKey,
    markerId: marker.markerId,
    storageDotKey: marker.storageDotKey,
    categoryKey,
  };
}

/** @param {Record<string, any>} profileData @param {string} markerReference */
export function clearMarkerPlacement(profileData, markerReference) {
  const marker = resolveMarkerIdentity(profileData, markerReference);
  if (!marker) return { ok: false, changed: false, reason: 'unknown-marker' };
  if (!isRecord(profileData.markerPlacements)) profileData.markerPlacements = {};
  const changed = Object.prototype.hasOwnProperty.call(profileData.markerPlacements, marker.markerId);
  if (changed) delete profileData.markerPlacements[marker.markerId];
  return {
    ok: true,
    changed,
    markerId: marker.markerId,
    storageDotKey: marker.storageDotKey,
    categoryKey: marker.categoryKey,
  };
}

/**
 * Add immutable identity metadata to the active view and project accepted
 * placements only after the native-category data pipeline has completed.
 *
 * @param {Record<string, any>} categories
 * @param {Record<string, any>} profileData
 */
export function applyMarkerPlacements(categories, profileData) {
  const plan = getMarkerPlacementPlan(profileData || {});
  for (const placement of Object.values(plan)) {
    const marker = categories[placement.categoryKey]?.markers?.[placement.markerKey];
    if (!marker) continue;
    marker.markerId = placement.markerId;
    marker.storageDotKey = placement.storageDotKey;
    marker.nativeCategoryKey = placement.categoryKey;
    marker.displayCategoryKey = placement.effectiveCategoryKey;
  }
  for (const placement of Object.values(plan)) {
    if (placement.effectiveCategoryKey === placement.categoryKey) continue;
    const source = categories[placement.categoryKey];
    const destination = categories[placement.effectiveCategoryKey];
    const marker = source?.markers?.[placement.markerKey];
    if (!marker || !destination?.markers || destination.markers[placement.markerKey]) continue;
    delete source.markers[placement.markerKey];
    destination.markers[placement.markerKey] = marker;
  }
  return categories;
}

/**
 * Resolve the immutable storage key carried by an active marker. The view-ID
 * fallback preserves behavior for legacy/test marker objects.
 *
 * @param {Record<string, any> | null | undefined} marker
 * @param {unknown} viewId
 * @returns {string | null}
 */
export function getMarkerStorageDotKey(marker, viewId) {
  if (typeof marker?.storageDotKey === 'string' && splitDotKey(marker.storageDotKey)) {
    return marker.storageDotKey;
  }
  if (typeof viewId !== 'string') return null;
  const separator = viewId.indexOf('_');
  if (separator < 1 || separator === viewId.length - 1) return null;
  const fallback = `${viewId.slice(0, separator)}.${viewId.slice(separator + 1)}`;
  return splitDotKey(fallback) ? fallback : null;
}

/**
 * Resolve a rendered path first, then its immutable native storage path. The
 * fallback lets saved dashboard references follow a marker after placement.
 *
 * @param {Record<string, any>} categories
 * @param {string} categoryKey
 * @param {string} markerKey
 */
export function resolveActiveMarkerPath(categories, categoryKey, markerKey) {
  const directCategory = categories?.[categoryKey];
  const directMarker = directCategory?.markers?.[markerKey];
  if (directCategory && directMarker) return { categoryKey, category: directCategory, marker: directMarker };
  const storageDotKey = `${categoryKey}.${markerKey}`;
  for (const [displayCategoryKey, category] of Object.entries(categories || {})) {
    const marker = category.markers?.[markerKey];
    if (marker?.storageDotKey === storageDotKey) {
      return { categoryKey: displayCategoryKey, category, marker };
    }
  }
  return null;
}
