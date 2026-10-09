/** Literal picker views. Matching, sorting and selection remain in the import controller. */
export interface ImportMarkerMapView {
  rawName: string;
  value: string;
  unit: string;
  range: string;
  showRange: boolean;
  clearLabel: 'Keep as new' | 'Clear mapping';
}
export interface ImportMarkerMapCategoryInput {
  key: string;
  label: string;
  count: number;
}
export interface ImportMarkerMapCategoryView extends ImportMarkerMapCategoryInput {
  active: boolean;
}
export interface ImportMarkerMapResultInput {
  key: string;
  name: unknown;
  unit: unknown;
  range: unknown;
  categoryLabel: unknown;
  units: readonly string[];
}
export interface ImportMarkerMapResultView {
  key: string;
  name: string;
  categoryLabel: string;
  units: string;
  range: string;
  selected: boolean;
}
export interface ImportMarkerMapContextInput {
  rawName?: unknown;
  value?: unknown;
  unit?: unknown;
  refMin?: unknown;
  refMax?: unknown;
  suggestedKey?: unknown;
}
const text = (value: unknown): string => value == null ? '' : String(value);

export function projectImportMarkerMap(marker?: ImportMarkerMapContextInput | null): ImportMarkerMapView {
  const showRange = marker?.refMin != null || marker?.refMax != null;
  return {
    rawName: text(marker?.rawName || 'Imported marker'),
    value: text(marker?.value ?? ''),
    unit: text(marker?.unit || ''),
    range: showRange ? `${marker?.refMin == null ? '?' : String(marker.refMin)}-${marker?.refMax == null ? '?' : String(marker.refMax)}` : '',
    showRange,
    clearLabel: marker?.suggestedKey ? 'Keep as new' : 'Clear mapping',
  };
}

export function projectImportMarkerMapCategories(
  categories: readonly ImportMarkerMapCategoryInput[],
  activeCategory: string,
): ImportMarkerMapCategoryView[] {
  return categories.map(category => ({...category, active: category.key === activeCategory}));
}

export function projectImportMarkerMapResults(
  items: readonly ImportMarkerMapResultInput[],
  currentKey: string,
): ImportMarkerMapResultView[] {
  return items.map(item => ({
    key: item.key,
    name: text(item.name),
    categoryLabel: text(item.categoryLabel),
    units: item.units.length ? item.units.join(', ') : text(item.unit || 'no unit'),
    range: item.range ? text(item.range) : '',
    selected: item.key === currentKey,
  }));
}
