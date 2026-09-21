/** Canonical persisted lab data. Display-unit conversion belongs at view/input boundaries. */
export interface MarkerProvenance {
  manuallyEdited?: boolean;
  snapshotId?: string | null;
  file?: string | null;
  at?: number | string;
}

export interface LabCollectionContext {
  fasting?: boolean | null;
  sampleTime?: string | null;
  cyclePhase?: string | null;
  [key: string]: unknown;
}

export interface LabEntry {
  date: string;
  markers: Record<string, number | null>;
  markerSources?: Record<string, MarkerProvenance | null>;
  collectionContextSources?: Record<string, MarkerProvenance | null>;
  context?: LabCollectionContext;
  deletedMarkers?: Record<string, number>;
  updatedAt?: number | string;
  importedWith?: { modelId?: string | null; provider?: string | null };
  sourceFile?: string;
  sourceFiles?: string[];
  /** Unknown extension metadata must be narrowed before it is consumed. */
  [key: string]: unknown;
}
