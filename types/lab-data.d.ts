/** Canonical persisted lab data. Display-unit conversion belongs at view/input boundaries. */
export interface MarkerProvenance {
  /** Explicitly entered result; automatic derived-value refresh must preserve it. */
  reported?: boolean;
  manuallyEdited?: boolean;
  snapshotId?: string | null;
  file?: string | null;
  at?: number | string;
  derivedFrom?: readonly string[];
}

export interface LabCollectionContext {
  fasting?: boolean | null;
  sampleTime?: string | null;
  cyclePhase?: string | null;
  [key: string]: unknown;
}

export interface LabEntry {
  /** First collection facts retained when an ordinary or approved edit corrects them. */
  collectionOriginals?: Partial<Record<'date' | 'specimen' | 'sampleTime' | 'fasting' | 'cycleDay' | 'cyclePhase' | 'cyclePhaseDetail' | 'cyclePhaseSource', { value: unknown; sourceSnapshotId: string | null }>>;
  manualOriginals?: Record<string, { value: number | true; source: MarkerProvenance | null } | null>;
  /** Stable specimen/panel identity; legacy single-date records need no eager rewrite. */
  panelId?: string;
  date: string;
  markers: Record<string, number | null>;
  markerSources?: Record<string, MarkerProvenance | null>;
  collectionContextSources?: Record<string, string>;
  context?: LabCollectionContext;
  deletedMarkers?: Record<string, number>;
  updatedAt?: number | string;
  importedWith?: { modelId?: string | null; provider?: string | null };
  sourceFile?: string;
  sourceFiles?: string[];
  /** Unknown extension metadata must be narrowed before it is consumed. */
  [key: string]: unknown;
}
