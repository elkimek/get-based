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
  contextRefRanges?: Array<MarkerViewRange | null | undefined>;
  contextRangeLabels?: Array<string | null | undefined>;
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
  icon?: string | undefined;
  singlePoint?: boolean;
  group?: string | null;
}

/** Populated marker projection consumed by ranges, charts, chat, and reports. */
export interface ActiveMarker extends MarkerViewDefinition {
  values: Array<number | null>;
  optimalMin?: number | null | undefined;
  optimalMax?: number | null | undefined;
  refMin_f?: number | null;
  refMax_f?: number | null;
  singlePoint?: boolean;
  singleDate?: string | null;
  singleDateLabel?: string | null;
  markerId?: string;
  nativeCategoryKey?: string;
  displayCategoryKey?: string;
  storageDotKey?: string;
  rangePolicy?: string;
  phaseRefRanges?: Array<(MarkerViewRange & {label?: string; phaseSource?: string; cycleDay?: number | null}) | null | undefined>;
  phaseLabels?: Array<string | null | undefined>;
  phaseDisplayLabels?: Array<string | null | undefined>;
  phaseCycleDays?: Array<number | null | undefined>;
  phaseSources?: Array<string | null | undefined>;
  contextOptimalRanges?: Array<MarkerViewRange | null | undefined>;
  contextOptimalRangeLabels?: Array<string | null | undefined>;
  [key: string]: unknown;
}
export interface ActiveCategory extends MarkerViewCategory {
  markers: Record<string, ActiveMarker>;
  singleDate?: string | null;
  singleDateLabel?: string | null;
  [key: string]: unknown;
}
export interface ActiveData extends MarkerViewData {
  categories: Record<string, ActiveCategory>;
  dates: string[];
  dateLabels: string[];
  entryContextByDate?: Record<string, import('../types/lab-data.js').LabCollectionContext>;
  phaseLabels?: Array<string | null | undefined>;
  phaseDisplayLabels?: Array<string | null | undefined>;
  phaseCycleDays?: Array<number | null | undefined>;
  phaseSources?: Array<string | null | undefined>;
}
