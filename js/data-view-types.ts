/** Numeric marker projection used by custom-marker and calculated-marker helpers. */
export type MarkerValues = Array<number | null | undefined>;
export interface MarkerViewRange {
  min: number | null;
  max: number | null;
}
export interface MarkerViewDefinition {
  name?: string | undefined;
  unit?: string | undefined;
  refMin?: number | null | undefined;
  refMax?: number | null | undefined;
  values?: MarkerValues;
  custom?: boolean;
  contextRefRanges?: Array<MarkerViewRange | null>;
  contextRangeLabels?: Array<string | null>;
  specimen?: unknown;
  method?: unknown;
  referenceSampleTime?: unknown;
  referenceRangeSource?: unknown;
  optimalRangeSource?: unknown;
}
export interface MarkerViewCategory {
  label: string;
  icon: string;
  singlePoint?: boolean;
  group?: string | null;
  markers: Record<string, MarkerViewDefinition>;
}
export interface MarkerViewData {
  categories: Record<string, MarkerViewCategory>;
}
export interface CustomMarkerViewDefinition extends MarkerViewDefinition {
  categoryLabel?: string;
  icon?: string;
  singlePoint?: boolean;
  group?: string | null;
}
