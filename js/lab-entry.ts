/** Accepted edit/merge view: foreign metadata stays opaque until existing checks consume it. */
export interface LabEntryDraft {
  date?: unknown;
  markers?: Record<string, unknown> | null;
  markerSources?: Record<string, LabMarkerSource | null | undefined> | null;
  collectionContextSources?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  deletedMarkers?: Record<string, unknown> | null;
  updatedAt?: unknown;
  sourceFile?: unknown;
  sourceFiles?: unknown;
  [key: string]: unknown;
}
export interface LabMarkerSource {
  file?: unknown; at?: unknown; snapshotId?: unknown; derivedFrom?: readonly string[]; manuallyEdited?: unknown;
}
interface LabEditOptions { now?: number | undefined; stamp?: boolean }
interface MarkerEditOptions extends LabEditOptions {
  source?: LabMarkerSource | null | undefined;
  clearSource?: boolean;
  recordTombstone?: boolean;
  overwrite?: boolean;
}
type OptionalLabEntry = LabEntryDraft | null | undefined;
export interface LabMarkerDeletion { changed: boolean; deletedKeys: string[]; removedEntry?: boolean }

// lab-entry.js - shared helpers for mutating one lab entry row.

export const LAB_ENTRY_MARKER_TOMBSTONES = 'deletedMarkers';
export const CANONICAL_INSULIN_MARKER_KEY = 'diabetes.insulin';
export const LEGACY_INSULIN_MARKER_KEYS = Object.freeze([
  'hormones.insulin',
  'diabetes.insulin_d',
]);

/**
 * Normalize an explicitly reported blood-draw time to the entry-level HH:MM
 * form used by contextual marker ranges. Deliberately reject free text here:
 * processing/report timestamps must never silently become collection times.
 *
 */
export function normalizeLabSampleTime(value: unknown) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const match = raw.match(/^(?:\d{4}-\d{2}-\d{2}[T\s])?(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*(am|pm))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase() || '';
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}


export function normalizeLabFastingStatus(value: unknown) {
  if (value === true || value === false) return value;
  return null;
}

/**
 * Merge structured collection context into a lab entry without disturbing
 * cycle/illness/training context already attached to the same draw date.
 * A present null/unknown value clears only that field; omitted properties do
 * not change existing context.
 *
 */
export function setLabEntryCollectionContext(entry: OptionalLabEntry, patch: { sampleTime?: unknown; fasting?: unknown } = {}, opts: LabEditOptions & { sourceSnapshotId?: string | null } = {}) {
  if (!entry || typeof entry !== 'object' || !patch || typeof patch !== 'object') return false;
  const context = entry.context && typeof entry.context === 'object' && !Array.isArray(entry.context)
    ? { ...entry.context }
    : {};
  const sources = entry.collectionContextSources && typeof entry.collectionContextSources === 'object'
    ? { ...entry.collectionContextSources }
    : {};
  let changed = false;
  const updateSource = (field: string) => {
    if (typeof opts.sourceSnapshotId === 'string' && opts.sourceSnapshotId) {
      if (sources[field] !== opts.sourceSnapshotId) changed = true;
      sources[field] = opts.sourceSnapshotId;
    } else if (Object.prototype.hasOwnProperty.call(sources, field)) {
      delete sources[field];
      changed = true;
    }
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'sampleTime')) {
    const sampleTime = normalizeLabSampleTime(patch.sampleTime);
    if (sampleTime) {
      if (context.sampleTime !== sampleTime) changed = true;
      context.sampleTime = sampleTime;
    } else if (Object.prototype.hasOwnProperty.call(context, 'sampleTime')) {
      delete context.sampleTime;
      changed = true;
    }
    updateSource('sampleTime');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fasting')) {
    const fasting = normalizeLabFastingStatus(patch.fasting);
    if (fasting !== null) {
      if (context.fasting !== fasting) changed = true;
      context.fasting = fasting;
    } else if (Object.prototype.hasOwnProperty.call(context, 'fasting')) {
      delete context.fasting;
      changed = true;
    }
    updateSource('fasting');
  }
  if (!changed) return false;
  if (Object.keys(context).length > 0) entry.context = context;
  else delete entry.context;
  if (Object.keys(sources).length > 0) entry.collectionContextSources = sources;
  else delete entry.collectionContextSources;
  if (opts.stamp !== false) stampLabEntryUpdated(entry, opts.now);
  return true;
}

function isInsulinMarkerKey(dotKey: string) {
  return dotKey === CANONICAL_INSULIN_MARKER_KEY || LEGACY_INSULIN_MARKER_KEYS.includes(dotKey);
}

function canonicalMarkerKey(dotKey: string) {
  return isInsulinMarkerKey(dotKey) ? CANONICAL_INSULIN_MARKER_KEY : dotKey;
}

function insulinValueKey(entry: OptionalLabEntry) {
  if (!entry?.markers) return null;
  return [CANONICAL_INSULIN_MARKER_KEY, ...LEGACY_INSULIN_MARKER_KEYS]
    .find(key => Object.prototype.hasOwnProperty.call(entry.markers, key)) || null;
}

export function normalizeTimestamp(value: unknown): number | null {
  if (Number.isFinite(value)) return value as number;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ensureMarkerMap(entry: LabEntryDraft) {
  if (!entry.markers || typeof entry.markers !== 'object') entry.markers = {};
  return entry.markers;
}

function ensureMarkerSources(entry: LabEntryDraft) {
  if (!entry.markerSources || typeof entry.markerSources !== 'object') entry.markerSources = {};
  return entry.markerSources;
}

function ensureMarkerTombstones(entry: LabEntryDraft) {
  if (!entry[LAB_ENTRY_MARKER_TOMBSTONES] || typeof entry[LAB_ENTRY_MARKER_TOMBSTONES] !== 'object') {
    entry[LAB_ENTRY_MARKER_TOMBSTONES] = {};
  }
  return entry[LAB_ENTRY_MARKER_TOMBSTONES];
}

export function stampLabEntryUpdated(entry: OptionalLabEntry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return now;
  entry.updatedAt = now;
  return now;
}

export function createLabEntry(date: string, opts: { now?: number } = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  return { date, markers: {}, updatedAt: now };
}

export function recalculateLabEntryHOMAIR(entry: OptionalLabEntry) {
  if (!entry?.markers) return;
  const glucose = entry.markers['biochemistry.glucose'];
  const insulinKey = insulinValueKey(entry);
  const insulin = insulinKey ? entry.markers[insulinKey] : undefined;
  if (glucose !== undefined && insulin !== undefined) {
    entry.markers['diabetes.homaIR'] = Math.round(((glucose as number) * (insulin as number)) / 22.5 * 100) / 100;
    const glucoseSource = entry.markerSources?.['biochemistry.glucose'];
    const insulinSource = insulinKey ? entry.markerSources?.[insulinKey] : undefined;
    const sharedSnapshotId = glucoseSource?.snapshotId && glucoseSource.snapshotId === insulinSource?.snapshotId
      ? glucoseSource.snapshotId
      : null;
    if (sharedSnapshotId) {
      ensureMarkerSources(entry)['diabetes.homaIR'] = {
        file: glucoseSource!.file || insulinSource!.file || null,
        at: Math.max(normalizeTimestamp(glucoseSource!.at) || 0, normalizeTimestamp(insulinSource!.at) || 0) || Date.now(),
        snapshotId: sharedSnapshotId,
        derivedFrom: ['biochemistry.glucose', insulinKey || CANONICAL_INSULIN_MARKER_KEY],
      };
    } else if (entry.markerSources) {
      delete entry.markerSources['diabetes.homaIR'];
    }
  } else {
    delete entry.markers['diabetes.homaIR'];
    if (entry.markerSources) delete entry.markerSources['diabetes.homaIR'];
  }
}

export function labEntryMarkerAffectsHOMAIR(dotKey: string) {
  return dotKey === 'biochemistry.glucose'
    || isInsulinMarkerKey(dotKey);
}

export function isSnapshotDerivedHOMAIR(entry: OptionalLabEntry, dotKey: string) {
  if (dotKey !== 'diabetes.homaIR') return false;
  const glucoseSource = entry?.markerSources?.['biochemistry.glucose'];
  const insulinKey = insulinValueKey(entry);
  const insulinSource = insulinKey ? entry?.markerSources?.[insulinKey] : undefined;
  return !!(glucoseSource?.snapshotId && glucoseSource.snapshotId === insulinSource?.snapshotId);
}

function affectsHOMAIR(dotKey: string, keys: readonly string[] = []) {
  return labEntryMarkerAffectsHOMAIR(dotKey) || keys.some(labEntryMarkerAffectsHOMAIR);
}

export function getLabEntryMarkerTombstones(entry: OptionalLabEntry) {
  const tombstones = entry?.[LAB_ENTRY_MARKER_TOMBSTONES];
  return tombstones && typeof tombstones === 'object' && !Array.isArray(tombstones)
    ? tombstones
    : {};
}

export function hasLabEntryMarkerTombstones(entry: OptionalLabEntry) {
  return Object.keys(getLabEntryMarkerTombstones(entry)).length > 0;
}

export function getLabEntryMarkerTombstoneAt(entry: OptionalLabEntry, dotKey: string) {
  const ts = normalizeTimestamp(getLabEntryMarkerTombstones(entry)[dotKey]);
  return ts === null ? 0 : ts;
}

export function getLabEntryMarkerValueTimestamp(entry: OptionalLabEntry, dotKey: string) {
  const sourceTs = normalizeTimestamp(entry?.markerSources?.[dotKey]?.at);
  if (sourceTs !== null) return sourceTs;
  const updatedTs = normalizeTimestamp(entry?.updatedAt);
  if (updatedTs !== null) return updatedTs;
  if (typeof entry?.date === 'string') {
    const parsed = Date.parse(entry.date);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function clearLabEntryMarkerTombstone(entry: OptionalLabEntry, dotKey: string) {
  const tombstones = entry?.[LAB_ENTRY_MARKER_TOMBSTONES];
  if (!tombstones || typeof tombstones !== 'object') return;
  delete tombstones[dotKey];
  if (Object.keys(tombstones).length === 0) delete entry[LAB_ENTRY_MARKER_TOMBSTONES];
}

export function markLabEntryMarkerDeleted(entry: OptionalLabEntry, dotKey: string, now = Date.now()) {
  if (!entry || typeof entry !== 'object' || !dotKey) return;
  ensureMarkerTombstones(entry)[dotKey] = now;
}

export function setLabEntryMarker<T extends OptionalLabEntry>(entry: T, dotKey: string, value: unknown, opts: MarkerEditOptions = {}): T | null {
  if (!entry || typeof entry !== 'object' || !dotKey) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const storageKey = canonicalMarkerKey(dotKey);
  const keys = [storageKey];

  if (storageKey === CANONICAL_INSULIN_MARKER_KEY) {
    for (const legacyKey of LEGACY_INSULIN_MARKER_KEYS) {
      if (entry.markers) delete entry.markers[legacyKey];
      if (entry.markerSources) delete entry.markerSources[legacyKey];
      clearLabEntryMarkerTombstone(entry, legacyKey);
    }
  }

  for (const key of keys) {
    ensureMarkerMap(entry)[key] = value;
    clearLabEntryMarkerTombstone(entry, key);
    if (Object.prototype.hasOwnProperty.call(opts, 'source')) {
      if (opts.source == null) {
        if (entry.markerSources) delete entry.markerSources[key];
      } else {
        ensureMarkerSources(entry)[key] = opts.source;
      }
    } else if (opts.clearSource && entry.markerSources) {
      delete entry.markerSources[key];
    }
  }
  if (affectsHOMAIR(storageKey, keys)) recalculateLabEntryHOMAIR(entry);
  if (opts.stamp !== false) stampLabEntryUpdated(entry, now);
  return entry;
}

export function syncLabEntryInsulinMirror(entry: OptionalLabEntry, opts: LabEditOptions = {}) {
  if (!entry?.markers) return false;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const sourceKey = insulinValueKey(entry);
  if (!sourceKey) return false;
  const markerSource = entry.markerSources?.[sourceKey];
  entry.markers[CANONICAL_INSULIN_MARKER_KEY] = entry.markers[sourceKey];
  if (markerSource) {
    ensureMarkerSources(entry)[CANONICAL_INSULIN_MARKER_KEY] = markerSource;
  }
  clearLabEntryMarkerTombstone(entry, CANONICAL_INSULIN_MARKER_KEY);
  for (const legacyKey of LEGACY_INSULIN_MARKER_KEYS) {
    delete entry.markers[legacyKey];
    if (entry.markerSources) delete entry.markerSources[legacyKey];
    clearLabEntryMarkerTombstone(entry, legacyKey);
  }
  recalculateLabEntryHOMAIR(entry);
  if (opts.stamp !== false) stampLabEntryUpdated(entry, now);
  return true;
}

export function deleteLabEntryMarker(entry: OptionalLabEntry, dotKey: string, opts: MarkerEditOptions = {}): LabMarkerDeletion {
  if (!entry || typeof entry !== 'object' || !dotKey) return { changed: false, deletedKeys: [] };
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const keys = isInsulinMarkerKey(dotKey)
    ? [CANONICAL_INSULIN_MARKER_KEY, ...LEGACY_INSULIN_MARKER_KEYS]
    : [dotKey];
  const deletedKeys: string[] = [];

  for (const key of keys) {
    const hadValue = !!(entry.markers && Object.prototype.hasOwnProperty.call(entry.markers, key));
    const hadSource = !!(entry.markerSources && Object.prototype.hasOwnProperty.call(entry.markerSources, key));
    if (!hadValue && !hadSource) continue;
    if (entry.markers) delete entry.markers[key];
    if (entry.markerSources) delete entry.markerSources[key];
    if (opts.recordTombstone !== false) markLabEntryMarkerDeleted(entry, key, now);
    deletedKeys.push(key);
  }
  if (deletedKeys.length && affectsHOMAIR(dotKey, deletedKeys)) recalculateLabEntryHOMAIR(entry);
  if (deletedKeys.length && opts.stamp !== false) stampLabEntryUpdated(entry, now);
  return { changed: deletedKeys.length > 0, deletedKeys };
}

export function renameLabEntryMarker(entry: OptionalLabEntry, fromKey: string, toKey: string, opts: MarkerEditOptions = {}) {
  if (!entry || typeof entry !== 'object' || !fromKey || !toKey || fromKey === toKey) return false;
  let changed = false;
  const markers = entry.markers && typeof entry.markers === 'object' ? entry.markers : null;
  if (markers && Object.prototype.hasOwnProperty.call(markers, fromKey)) {
    if (opts.overwrite || !Object.prototype.hasOwnProperty.call(markers, toKey)) {
      markers[toKey] = markers[fromKey];
    }
    delete markers[fromKey];
    changed = true;
  }
  const sources = entry.markerSources && typeof entry.markerSources === 'object' ? entry.markerSources : null;
  if (sources && Object.prototype.hasOwnProperty.call(sources, fromKey)) {
    if (opts.overwrite || !Object.prototype.hasOwnProperty.call(sources, toKey)) {
      sources[toKey] = sources[fromKey];
    }
    delete sources[fromKey];
    changed = true;
  }
  clearLabEntryMarkerTombstone(entry, fromKey);
  if (changed && (affectsHOMAIR(fromKey) || affectsHOMAIR(toKey))) recalculateLabEntryHOMAIR(entry);
  if (changed && opts.stamp !== false) stampLabEntryUpdated(entry, opts.now);
  return changed;
}

export function isLabEntryEmpty(entry: OptionalLabEntry) {
  return !entry?.markers || Object.keys(entry.markers).length === 0;
}

export function isLabEntryRemovable(entry: OptionalLabEntry) {
  return isLabEntryEmpty(entry) && !hasLabEntryMarkerTombstones(entry);
}
