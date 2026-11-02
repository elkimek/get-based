// Canonical base ranges and native override preservation, shared by UI and tools.
export type MarkerRangeKind = 'reference' | 'optimal';
export interface MarkerRangeBounds { min: number | null; max: number | null }
export type RangeFields = { refMin?: number | null | undefined; refMax?: number | null | undefined; refMin_f?: number | null | undefined; refMax_f?: number | null | undefined; optimalMin?: number | null | undefined; optimalMax?: number | null | undefined; referenceRangeSource?: unknown; optimalRangeSource?: unknown };
type Categories = Record<string, { markers: Record<string, RangeFields> }>;
export function markerRangeKind(type: string): MarkerRangeKind | null { return type === 'optimal' ? 'optimal' : type === 'ref' || type === 'reference' ? 'reference' : null; }
export function validateMarkerRange(min: unknown, max: unknown): asserts min is number | null {
  if (![min, max].every(value => value === null || typeof value === 'number' && Number.isFinite(value))) throw new Error('Range bounds must be finite numbers or explicit open bounds.');
  if (typeof min === 'number' && typeof max === 'number' && min > max) throw new Error('The range minimum must not exceed its maximum.');
}
export function applyBaseMarkerRanges(categories: Categories, sex: unknown, optimal: Record<string, { optimalMin?: number | null | undefined; optimalMax?: number | null | undefined; optimalMin_f?: number | null | undefined; optimalMax_f?: number | null | undefined }>, overrides: Record<string, unknown>) {
  if (sex === 'female') for (const category of Object.values(categories)) for (const marker of Object.values(category.markers)) {
    if (marker.refMin_f !== undefined) marker.refMin = marker.refMin_f;
    if (marker.refMax_f !== undefined) marker.refMax = marker.refMax_f;
  }
  for (const [id, range] of Object.entries(optimal)) {
    const [category, key] = id.split('.') as [string, string], marker = categories[category]?.markers[key];
    if (!marker) continue;
    marker.optimalMin = sex === 'female' && range.optimalMin_f !== undefined ? range.optimalMin_f : range.optimalMin;
    marker.optimalMax = sex === 'female' && range.optimalMax_f !== undefined ? range.optimalMax_f : range.optimalMax;
  }
  for (const [id, raw] of Object.entries(overrides)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const [category, key] = id.split('.') as [string, string], marker = categories[category]?.markers[key], range = raw as Record<string, unknown>;
    if (!marker) continue;
    for (const kind of ['ref', 'optimal'] as const) {
      if (`${kind}Min` in range) marker[`${kind}Min`] = range[`${kind}Min`] as number | null;
      if (`${kind}Max` in range) marker[`${kind}Max`] = range[`${kind}Max`] as number | null;
      if (`${kind}Min` in range || `${kind}Max` in range) marker[kind === 'ref' ? 'referenceRangeSource' : 'optimalRangeSource'] = range[`${kind}Source`] || 'custom';
    }
  }
}
export function writeMarkerRangeOverride(override: Record<string, unknown>, type: MarkerRangeKind, bounds: MarkerRangeBounds, current: MarkerRangeBounds) {
  validateMarkerRange(bounds.min, bounds.max);
  const kind = type === 'reference' ? 'ref' : 'optimal', lab = type === 'reference' ? 'labRef' : 'labOptimal';
  if (override[`${kind}Source`] !== 'manual' && (`${kind}Min` in override || `${kind}Max` in override) && !(`${lab}Min` in override) && !(`${lab}Max` in override)) {
    override[`${lab}Min`] = override[`${kind}Min`] ?? current.min;
    override[`${lab}Max`] = override[`${kind}Max`] ?? current.max;
    override[`${lab}Source`] = override[`${kind}Source`] || 'custom';
  }
  override[`${kind}Min`] = bounds.min; override[`${kind}Max`] = bounds.max; override[`${kind}Source`] = 'manual';
}
export function restoreMarkerRangeOverride(override: Record<string, unknown>, type: MarkerRangeKind) {
  const kind = type === 'reference' ? 'ref' : 'optimal', lab = type === 'reference' ? 'labRef' : 'labOptimal';
  if (`${lab}Min` in override || `${lab}Max` in override) {
    for (const bound of ['Min', 'Max']) {
      if (`${lab}${bound}` in override) override[`${kind}${bound}`] = override[`${lab}${bound}`];
      else delete override[`${kind}${bound}`];
      delete override[`${lab}${bound}`];
    }
    override[`${kind}Source`] = override[`${lab}Source`] || 'import'; delete override[`${lab}Source`];
    return override[`${kind}Source`] === 'import' ? 'Range reverted to lab range' : 'Range reverted to previous range';
  }
  delete override[`${kind}Min`]; delete override[`${kind}Max`]; delete override[`${kind}Source`];
  return 'Range reverted to default';
}
