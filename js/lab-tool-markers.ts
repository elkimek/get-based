// Shared safe marker definitions and context-group policy for exact browser tools.
import type { ProfileData } from '../types/app-state.js';
import { MARKER_SCHEMA } from './marker-schema.js';
import { mergeCustomMarkerDefinitions } from './data-custom-markers.js';
import { isGroupInAIContext } from './lab-context-settings.js';

export function validLabToolMarkerKey(key: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) && !key.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part));
}
export function labToolRegistry(data: ProfileData) {
  if (data.customMarkers != null && (typeof data.customMarkers !== 'object' || Array.isArray(data.customMarkers))) throw new Error('Review the custom marker definitions in their normal editor.');
  for (const key of Object.keys(data.customMarkers || {})) if (!validLabToolMarkerKey(key)) throw new Error('Review the custom marker definitions in their normal editor.');
  const view = { categories: structuredClone(MARKER_SCHEMA) };
  mergeCustomMarkerDefinitions(view, data.customMarkers || {});
  for (const [key, category] of Object.entries(view.categories)) if (typeof data.categoryLabels?.[key] === 'string') category.label = data.categoryLabels[key]!;
  return view.categories;
}
export function labToolMarkerGroup(categoryKey: string, category: { contextGroup?: unknown; group?: unknown; label?: unknown }) {
  // Renaming or moving a marker is presentation, not a new disclosure grant.
  const origin = Object.hasOwn(MARKER_SCHEMA, categoryKey) ? MARKER_SCHEMA[categoryKey]! : category;
  return String('contextGroup' in origin && origin.contextGroup || origin.group || origin.label || '').trim();
}
export function labToolMarker(data: ProfileData, markerKey: string, categories = labToolRegistry(data)) {
  if (!validLabToolMarkerKey(markerKey)) throw new Error('Choose a valid marker.');
  const [categoryKey, key] = markerKey.split('.') as [string, string], category = Object.hasOwn(categories, categoryKey) ? categories[categoryKey] : undefined;
  const value = category && Object.hasOwn(category.markers, key) ? category.markers[key] : undefined;
  if (!category || !value || !isGroupInAIContext(labToolMarkerGroup(categoryKey, category))) throw new Error('This marker is unavailable or its context group is disabled.');
  return { categoryKey, category, value, usesStandardUnit: !MARKER_SCHEMA[categoryKey]?.markers[key] || value.unit === MARKER_SCHEMA[categoryKey]?.markers[key]?.unit,
    name: typeof data.markerLabels?.[markerKey] === 'string' ? data.markerLabels[markerKey]! : String(value.name || key) };
}
