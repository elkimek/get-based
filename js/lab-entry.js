// @ts-check
// lab-entry.js - shared helpers for mutating one lab entry row.

export const LAB_ENTRY_MARKER_TOMBSTONES = 'deletedMarkers';

function normalizeTimestamp(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ensureMarkerMap(entry) {
  if (!entry.markers || typeof entry.markers !== 'object') entry.markers = {};
  return entry.markers;
}

function ensureMarkerSources(entry) {
  if (!entry.markerSources || typeof entry.markerSources !== 'object') entry.markerSources = {};
  return entry.markerSources;
}

function ensureMarkerTombstones(entry) {
  if (!entry[LAB_ENTRY_MARKER_TOMBSTONES] || typeof entry[LAB_ENTRY_MARKER_TOMBSTONES] !== 'object') {
    entry[LAB_ENTRY_MARKER_TOMBSTONES] = {};
  }
  return entry[LAB_ENTRY_MARKER_TOMBSTONES];
}

export function getInsulinMirrorMarkerKey(dotKey) {
  if (dotKey === 'hormones.insulin') return 'diabetes.insulin_d';
  if (dotKey === 'diabetes.insulin_d') return 'hormones.insulin';
  return null;
}

export function stampLabEntryUpdated(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return now;
  entry.updatedAt = now;
  return now;
}

export function createLabEntry(date, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  return { date, markers: {}, updatedAt: now };
}

export function recalculateLabEntryHOMAIR(entry) {
  if (!entry?.markers) return;
  const glucose = entry.markers['biochemistry.glucose'];
  const insulin = entry.markers['hormones.insulin'] ?? entry.markers['diabetes.insulin_d'];
  if (glucose !== undefined && insulin !== undefined) {
    entry.markers['diabetes.homaIR'] = Math.round((glucose * insulin) / 22.5 * 100) / 100;
    const glucoseSource = entry.markerSources?.['biochemistry.glucose'];
    const insulinSource = entry.markerSources?.['hormones.insulin'] ?? entry.markerSources?.['diabetes.insulin_d'];
    const sharedSnapshotId = glucoseSource?.snapshotId && glucoseSource.snapshotId === insulinSource?.snapshotId
      ? glucoseSource.snapshotId
      : null;
    if (sharedSnapshotId) {
      ensureMarkerSources(entry)['diabetes.homaIR'] = {
        file: glucoseSource.file || insulinSource.file || null,
        at: Math.max(normalizeTimestamp(glucoseSource.at) || 0, normalizeTimestamp(insulinSource.at) || 0) || Date.now(),
        snapshotId: sharedSnapshotId,
        derivedFrom: ['biochemistry.glucose', insulinSource === entry.markerSources?.['hormones.insulin'] ? 'hormones.insulin' : 'diabetes.insulin_d'],
      };
    } else if (entry.markerSources) {
      delete entry.markerSources['diabetes.homaIR'];
    }
  } else {
    delete entry.markers['diabetes.homaIR'];
    if (entry.markerSources) delete entry.markerSources['diabetes.homaIR'];
  }
}

export function labEntryMarkerAffectsHOMAIR(dotKey) {
  return dotKey === 'biochemistry.glucose'
    || dotKey === 'hormones.insulin'
    || dotKey === 'diabetes.insulin_d';
}

export function isSnapshotDerivedHOMAIR(entry, dotKey) {
  if (dotKey !== 'diabetes.homaIR') return false;
  const glucoseSource = entry?.markerSources?.['biochemistry.glucose'];
  const insulinSource = entry?.markerSources?.['hormones.insulin'] ?? entry?.markerSources?.['diabetes.insulin_d'];
  return !!(glucoseSource?.snapshotId && glucoseSource.snapshotId === insulinSource?.snapshotId);
}

function affectsHOMAIR(dotKey, keys = []) {
  return labEntryMarkerAffectsHOMAIR(dotKey) || keys.some(labEntryMarkerAffectsHOMAIR);
}

export function getLabEntryMarkerTombstones(entry) {
  const tombstones = entry?.[LAB_ENTRY_MARKER_TOMBSTONES];
  return tombstones && typeof tombstones === 'object' && !Array.isArray(tombstones)
    ? tombstones
    : {};
}

export function hasLabEntryMarkerTombstones(entry) {
  return Object.keys(getLabEntryMarkerTombstones(entry)).length > 0;
}

export function getLabEntryMarkerTombstoneAt(entry, dotKey) {
  const ts = normalizeTimestamp(getLabEntryMarkerTombstones(entry)[dotKey]);
  return ts === null ? 0 : ts;
}

export function getLabEntryMarkerValueTimestamp(entry, dotKey) {
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

export function clearLabEntryMarkerTombstone(entry, dotKey) {
  const tombstones = entry?.[LAB_ENTRY_MARKER_TOMBSTONES];
  if (!tombstones || typeof tombstones !== 'object') return;
  delete tombstones[dotKey];
  if (Object.keys(tombstones).length === 0) delete entry[LAB_ENTRY_MARKER_TOMBSTONES];
}

export function markLabEntryMarkerDeleted(entry, dotKey, now = Date.now()) {
  if (!entry || typeof entry !== 'object' || !dotKey) return;
  ensureMarkerTombstones(entry)[dotKey] = now;
}

export function setLabEntryMarker(entry, dotKey, value, opts = {}) {
  if (!entry || typeof entry !== 'object' || !dotKey) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const keys = [dotKey];
  const mirrorKey = opts.mirrorInsulin ? getInsulinMirrorMarkerKey(dotKey) : null;
  if (mirrorKey) keys.push(mirrorKey);

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
  if (affectsHOMAIR(dotKey, keys)) recalculateLabEntryHOMAIR(entry);
  if (opts.stamp !== false) stampLabEntryUpdated(entry, now);
  return entry;
}

export function syncLabEntryInsulinMirror(entry, opts = {}) {
  if (!entry?.markers) return false;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const hormonesKey = 'hormones.insulin';
  const diabetesKey = 'diabetes.insulin_d';
  let sourceKey = null;
  if (entry.markers[hormonesKey] !== undefined) {
    entry.markers[diabetesKey] = entry.markers[hormonesKey];
    sourceKey = hormonesKey;
  } else if (entry.markers[diabetesKey] !== undefined) {
    entry.markers[hormonesKey] = entry.markers[diabetesKey];
    sourceKey = diabetesKey;
  } else {
    return false;
  }
  clearLabEntryMarkerTombstone(entry, getInsulinMirrorMarkerKey(sourceKey));
  if (entry.markerSources?.[sourceKey]) {
    ensureMarkerSources(entry)[getInsulinMirrorMarkerKey(sourceKey)] = entry.markerSources[sourceKey];
  }
  recalculateLabEntryHOMAIR(entry);
  if (opts.stamp !== false) stampLabEntryUpdated(entry, now);
  return true;
}

export function deleteLabEntryMarker(entry, dotKey, opts = {}) {
  if (!entry || typeof entry !== 'object' || !dotKey) return { changed: false, deletedKeys: [] };
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const keys = [dotKey];
  const mirrorKey = opts.mirrorInsulin ? getInsulinMirrorMarkerKey(dotKey) : null;
  if (mirrorKey) keys.push(mirrorKey);
  const deletedKeys = [];

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

export function renameLabEntryMarker(entry, fromKey, toKey, opts = {}) {
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

export function isLabEntryEmpty(entry) {
  return !entry?.markers || Object.keys(entry.markers).length === 0;
}

export function isLabEntryRemovable(entry) {
  return isLabEntryEmpty(entry) && !hasLabEntryMarkerTombstones(entry);
}
