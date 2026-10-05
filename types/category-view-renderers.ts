export interface CategoryMarkerReader {
  values: unknown[];
  name?: unknown; unit?: unknown;
  refMin?: unknown; refMax?: unknown; optimalMin?: unknown; optimalMax?: unknown;
  singlePoint?: unknown; singleDateLabel?: unknown;
  phaseRefRanges?: unknown[] | null | undefined;
  contextRefRanges?: unknown[] | null | undefined;
  contextOptimalRanges?: unknown[] | null | undefined;
}
export interface CategoryReader { markers: unknown; singleDate?: unknown; singleDateLabel?: unknown }
export interface CategoryRangeReader { min?: unknown; max?: unknown }
// Private unguarded formatter/numeric operations; no persisted producer guarantee.
export interface CategoryNumericRangeOperations { min?: number | null | undefined; max?: number | null | undefined }
export interface CategoryNumericMarkerOperations extends Omit<CategoryMarkerReader, 'values' | 'refMin' | 'refMax' | 'optimalMin' | 'optimalMax'> {
  values: Array<number | null | undefined>;
  refMin?: number | null | undefined; refMax?: number | null | undefined;
  optimalMin?: number | null | undefined; optimalMax?: number | null | undefined;
}
export interface CategoryDelegateRoot { addEventListener(type: string, listener: (event: Event) => void, options: {capture: true; passive: true}): unknown }
export interface CategoryScrollTarget { closest?: unknown }
export interface CategoryEventRoot { contains?: ((element: HTMLElement) => unknown) | undefined }
