import type { CustomMarkerMap } from './custom-marker-identity.js';
// marker-placement.js — Category-independent marker placement metadata.

import {
  deriveLegacyCustomMarkerId,
  getCustomMarkerDotKey,
  getCustomMarkerId,
} from './custom-marker-identity.js';
import {
  BUILTIN_MARKER_IDENTITIES,
  BUILTIN_MARKER_ID_ALIASES,
  getBuiltinMarkerDotKey,
  getBuiltinMarkerId,
  MARKER_SCHEMA,
} from './marker-schema.js';

/** Placement is a view projection; persisted marker addresses stay immutable. */
export interface MarkerPlacementProfile {
  customMarkers?: CustomMarkerMap | null;
  markerPlacements?: Record<string, unknown> | null;
  [key: string]: unknown;
}
export interface ResolvedMarkerIdentity {
  markerId: string; storageDotKey: string;
  categoryKey: string; markerKey: string; custom: boolean;
}
export interface MarkerPlacementResolution extends ResolvedMarkerIdentity {
  requestedCategoryKey: string | null;
  effectiveCategoryKey: string;
  reason: string;
}
export type MarkerPlacementResult =
  | { ok: false; changed: false; reason: string }
  | { ok: true; changed: boolean; markerId: string; storageDotKey: string; categoryKey: string };
export interface PlacementViewMarker {
  storageDotKey?: unknown;
  markerId?: string; nativeCategoryKey?: string; displayCategoryKey?: string;
  [key: string]: unknown;
}
export interface PlacementViewCategory {
  markers?: Record<string, PlacementViewMarker> | null;
  [key: string]: unknown;
}
type PlacementCategories = Record<string, PlacementViewCategory>;
type OptionalProfile = MarkerPlacementProfile | null | undefined;
type CategoryOf<Categories extends PlacementCategories> = Categories[keyof Categories];
type MarkerOf<Categories extends PlacementCategories> = NonNullable<NonNullable<CategoryOf<Categories>>['markers']>[string];
type ResolvedViewPath<Categories extends PlacementCategories> = {
  categoryKey: string; category: CategoryOf<Categories>; marker: MarkerOf<Categories>;
};

const CATEGORY_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function splitDotKey(dotKey: unknown) {
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
 */
export function migrateMarkerPlacements(data: MarkerPlacementProfile) {
  if (!isRecord(data.markerPlacements)) data.markerPlacements = {};
  for (const [markerId, placement] of Object.entries(data.markerPlacements)) {
    if (typeof placement === 'string') {
      data.markerPlacements[markerId] = { categoryKey: placement };
    }
  }
  for (const [legacyId, currentId] of Object.entries(BUILTIN_MARKER_ID_ALIASES)) {
    if (!Object.prototype.hasOwnProperty.call(data.markerPlacements, legacyId)) continue;
    if (!Object.prototype.hasOwnProperty.call(data.markerPlacements, currentId)) {
      data.markerPlacements[currentId] = data.markerPlacements[legacyId];
    }
    delete data.markerPlacements[legacyId];
  }
  return data.markerPlacements;
}

export function resolveMarkerIdentity(profileData: OptionalProfile, value: unknown): ResolvedMarkerIdentity | null {
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

function buildCategoryModes(profileData: OptionalProfile) {
  const modes = new Map<string, { calculated: boolean; singlePoint: boolean }>();
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

function listMarkerIdentities(profileData: OptionalProfile) {
  const markers: ResolvedMarkerIdentity[] = [];
  const occupiedNativeSlots = new Set<string>();
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
 */
export function getMarkerPlacementPlan(profileData: OptionalProfile) {
  const modes = buildCategoryModes(profileData || {});
  const markers = listMarkerIdentities(profileData || {});
  const placements = isRecord(profileData?.markerPlacements) ? profileData.markerPlacements : {};
  const reserved = new Map(markers.map(marker => [marker.storageDotKey, marker.markerId]));
  const plan: Record<string, MarkerPlacementResolution> = {};

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
      } else if (destinationMode.calculated) {
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
 */
export function setMarkerPlacement(profileData: MarkerPlacementProfile, markerReference: unknown, categoryKey: string): MarkerPlacementResult {
  const marker = resolveMarkerIdentity(profileData, markerReference);
  if (!marker) return { ok: false, changed: false, reason: 'unknown-marker' };
  if (categoryKey === marker.categoryKey) return clearMarkerPlacement(profileData, marker.markerId);

  const current = isRecord(profileData.markerPlacements) ? profileData.markerPlacements : {};
  const candidatePlacements = {
    ...current,
    [marker.markerId]: {
      ...(isRecord(current[marker.markerId]) ? current[marker.markerId] as Record<string, unknown> : {}),
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

export function clearMarkerPlacement(profileData: MarkerPlacementProfile, markerReference: unknown): MarkerPlacementResult {
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
 */
export function applyMarkerPlacements<Categories extends PlacementCategories>(categories: Categories, profileData: OptionalProfile): Categories {
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
    delete source!.markers![placement.markerKey];
    destination.markers[placement.markerKey] = marker;
  }
  return categories;
}

/**
 * Resolve the immutable storage key carried by an active marker. The view-ID
 * fallback preserves behavior for legacy/test marker objects.
 *
 */
export function getMarkerStorageDotKey(marker: PlacementViewMarker | null | undefined, viewId: unknown) {
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
 * Return the immutable storage path in the underscore form used by UI state.
 *
 */
export function getMarkerStorageViewId(marker: PlacementViewMarker | null | undefined, viewId: unknown) {
  const parts = splitDotKey(getMarkerStorageDotKey(marker, viewId));
  return parts ? `${parts.categoryKey}_${parts.markerKey}` : null;
}

/**
 * Resolve a rendered path first, then its immutable native storage path. The
 * fallback lets saved dashboard references follow a marker after placement.
 *
 */
export function resolveActiveMarkerPath<Categories extends PlacementCategories>(categories: Categories | null | undefined, categoryKey: string, markerKey: string): ResolvedViewPath<Categories> | null {
  const directCategory = categories?.[categoryKey];
  const directMarker = directCategory?.markers?.[markerKey];
  if (directCategory && directMarker) return { categoryKey, category: directCategory, marker: directMarker } as ResolvedViewPath<Categories>;
  const storageDotKey = `${categoryKey}.${markerKey}`;
  for (const [displayCategoryKey, category] of Object.entries(categories || {})) {
    const marker = category.markers?.[markerKey];
    if (marker?.storageDotKey === storageDotKey) {
      return { categoryKey: displayCategoryKey, category, marker } as ResolvedViewPath<Categories>;
    }
  }
  return null;
}

export function resolveMarkerStorageViewId<Categories extends PlacementCategories>(categories: Categories, viewId: unknown) {
  if (typeof viewId !== 'string') return null;
  const separator = viewId.indexOf('_');
  if (separator < 1 || separator === viewId.length - 1) return null;
  const resolved = resolveActiveMarkerPath(categories, viewId.slice(0, separator), viewId.slice(separator + 1));
  return getMarkerStorageViewId(resolved?.marker, viewId);
}
