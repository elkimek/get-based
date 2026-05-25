// sync-delta-surfaces.js - ImportedData surfaces covered by per-row sync.

// See memory/project_evolu_delta_refactor_plan.md for full design + risk
// register. Short version: every pushProfile writes the entire importedData
// blob into one CRDT message. Evolu's per-owner relay quota fills after
// enough full-state pushes, creating recurring "phone says committed,
// desktop sees stale" wedges. The cure is to use Evolu the way it expects:
// many small rows mutated independently.
//
// Pull-side: blob merge establishes the baseline first, then per-row state overlays on top.
// Per-row wins on disagreement because each row carries its own LWW timestamp
// and reflects the up-to-the-moment state, while the blob may be a stale
// snapshot from before another device synced.

// Arrays subject to delta sync. Dotted paths are honored by the push-side
// planners and pull-side overlays.
export const DELTA_ARRAYS = [
  'sunSessions',
  'lightDevices',
  'deviceSessions',
  'lightAudits',
  'lightMeasurements',
  // Nested arrays ride per-row CRDTs so Phase 2 does not regress room/screen
  // edits to wholesale last-write-wins on the parent object.
  'lightEnvironment.rooms',
  'lightEnvironment.screens',
  'entries',
  'notes',
  'supplements',
  'healthGoals',
  'changeHistory',
  'chatSummaries',
];

// Keyed-object shapes subject to delta sync.
export const DELTA_MAPS = [
  'markerNotes',
  'markerValueNotes',
  'customMarkers',
  'manualValues',
  'refOverrides',
  'categoryLabels',
  'categoryIcons',
  'markerLabels',
  'wearablePrimaryOverride',
  // Keep SNPs per-key so independent raw DNA imports compose across devices.
  // The rest of `genetics` remains a scalar.
  'genetics.snps',
  // Singleton-per-day AI verdicts keyed by ISO date.
  'lightDailyVerdicts',
];

// Singleton-shape importedData fields.
export const DELTA_SCALARS = [
  'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian',
  'stress', 'loveLife', 'environment',
  'interpretiveLens', 'contextNotes',
  'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics',
  // Dotted scalar; rooms/screens stay array-shaped above.
  'lightEnvironment.burdenAI',
  'sunCorrelations', 'lifelightProfile', 'sunDefaults',
  'channelMixAI',
  'wearableSummary', 'wearableCardOrder',
];
