// Portable client records can leave the device independently of a full backup.
// Adding a field here deliberately makes it available to recipients.
const fields = [
  'entries', 'notes', 'supplements', 'healthGoals', 'diagnoses', 'diet', 'exercise',
  'sleepRest', 'sleepCircadian', 'lightCircadian', 'stress', 'loveLife', 'environment',
  'interpretiveLens', 'contextNotes', 'menstrualCycle', 'emfAssessment', 'genetics',
  'geneticsLifecycle', 'geneticsSnpTombstones', 'biometrics', 'customMarkers',
  'customMarkerLifecycle', 'markerPlacements', 'labOrdering', 'labPanelTombstones',
  'refOverrides', 'categoryLabels', 'categoryIcons', 'markerLabels', 'markerNotes',
  'markerValueNotes', 'manualValues', 'manualMetricTombstones', 'manualBodyReadings',
  'changeHistory', 'chatSummaries', 'wearableSummary', 'wearableCardOrder',
  'wearablePrimaryOverride', 'sunSessions', 'deviceSessions', 'lightDevices',
  'lightAudits', 'lightMeasurements', 'lightEnvironment', 'sunDefaults', 'sunCorrelations',
  'lifelightProfile', 'lightDailyVerdicts', 'channelMixAI', 'biologyScoreContextAI',
  'biologyScoreAI', 'biologyScoreContextSettings', 'contextSourceSettings', 'nutritionContextDays',
  'nutritionTargets', 'importSnapshots', '_deleted',
] as const;

export function projectPortableProfileData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid profile data.');
  const record = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
}

export function readStoredPortableProfile(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Stored profile data could not be read.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid stored profile data.');
  return value as Record<string, unknown>;
}

export function hasPortableProfileContent(data: Record<string, unknown>) {
  return fields.some(key => {
    if (key === 'nutritionContextDays') return false;
    const value = data[key];
    return typeof value === 'object' && value !== null ? Object.keys(value).length > 0 : Boolean(value);
  });
}
