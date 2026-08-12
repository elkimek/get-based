// @ts-check
// data-merge-lab-entries.js — Lab-entry freshness and reconciliation.

import {
  LAB_ENTRY_MARKER_TOMBSTONES,
  getLabEntryMarkerTombstoneAt,
  getLabEntryMarkerTombstones,
  getLabEntryMarkerValueTimestamp,
  labEntryMarkerAffectsHOMAIR,
  recalculateLabEntryHOMAIR,
} from './lab-entry.js';

export const FRESH_LOCAL_LAB_ENTRY_TTL_MS = 2 * 60 * 1000;

const TIMESTAMP_FIELDS = [
  'updatedAt',
  'endedAt',
  'startedAt',
  'capturedAt',
  'takenAt',
  'savedAt',
  'loggedAt',
  'createdAt',
  'importedAt',
  'addedAt',
  'at',
];

export function normalizeTimestamp(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// Pick a comparable timestamp for conflict resolution. Higher wins. Tries
// the most recently-edited signal first, then creation/capture fields that
// several synced array surfaces use. Returns 0 if nothing recognizable is
// present so older/foreign records can still merge without throwing.
export function pickTimestamp(rec) {
  if (!rec || typeof rec !== 'object') return 0;
  for (const field of TIMESTAMP_FIELDS) {
    const ts = normalizeTimestamp(rec[field]);
    if (ts !== null) return ts;
  }
  if (typeof rec.date === 'string') {
    const parsed = Date.parse(rec.date);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Shared freshness ordering for id-keyed array records. Positive means `a`
// is newer than `b`, negative means older, zero means no winner. Callers
// intentionally treat zero as "keep the local/current record" so a stale
// pull cannot undo a just-saved local edit when timestamps tie or are absent.
export function compareRecordFreshness(a, b) {
  const aTs = pickTimestamp(a);
  const bTs = pickTimestamp(b);
  if (aTs > bTs) return 1;
  if (aTs < bTs) return -1;
  return 0;
}

export function pickFresherRecord(current, candidate) {
  return compareRecordFreshness(candidate, current) > 0 ? candidate : current;
}

export function hasExplicitTimestamp(rec) {
  if (!rec || typeof rec !== 'object') return false;
  return TIMESTAMP_FIELDS.some(field => normalizeTimestamp(rec[field]) !== null);
}

function mergeSourceFiles(a, b) {
  const files = [];
  for (const item of [a?.sourceFiles, a?.sourceFile, b?.sourceFiles, b?.sourceFile]) {
    if (Array.isArray(item)) {
      for (const file of item) if (file && !files.includes(file)) files.push(file);
    } else if (item && !files.includes(item)) {
      files.push(item);
    }
  }
  return files;
}

export function mergeLabEntry(existing, incoming) {
  if (!existing || typeof existing !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return existing;
  const existingTs = pickTimestamp(existing);
  const incomingTs = pickTimestamp(incoming);
  const incomingWins = incomingTs >= existingTs;
  const base = incomingWins ? { ...existing, ...incoming } : { ...incoming, ...existing };
  const markers = {};
  const markerSources = {};
  const markerTombstones = {};
  const existingMarkers = existing.markers && typeof existing.markers === 'object' ? existing.markers : {};
  const incomingMarkers = incoming.markers && typeof incoming.markers === 'object' ? incoming.markers : {};
  const existingSources = existing.markerSources && typeof existing.markerSources === 'object' ? existing.markerSources : {};
  const incomingSources = incoming.markerSources && typeof incoming.markerSources === 'object' ? incoming.markerSources : {};
  const existingTombstones = getLabEntryMarkerTombstones(existing);
  const incomingTombstones = getLabEntryMarkerTombstones(incoming);
  const markerKeys = new Set([
    ...Object.keys(existingMarkers),
    ...Object.keys(incomingMarkers),
    ...Object.keys(existingTombstones),
    ...Object.keys(incomingTombstones),
  ]);
  let homaIRInputChanged = false;
  let homaIRInputDeleted = false;
  for (const key of markerKeys) {
    const hasExisting = Object.prototype.hasOwnProperty.call(existingMarkers, key);
    const hasIncoming = Object.prototype.hasOwnProperty.call(incomingMarkers, key);
    const existingValueTs = hasExisting ? getLabEntryMarkerValueTimestamp(existing, key) : 0;
    const incomingValueTs = hasIncoming ? getLabEntryMarkerValueTimestamp(incoming, key) : 0;
    const deleteTs = Math.max(
      getLabEntryMarkerTombstoneAt(existing, key),
      getLabEntryMarkerTombstoneAt(incoming, key)
    );
    const valueTs = Math.max(existingValueTs, incomingValueTs);
    if (deleteTs && deleteTs >= valueTs) {
      markerTombstones[key] = deleteTs;
      if (labEntryMarkerAffectsHOMAIR(key)) {
        homaIRInputChanged = true;
        homaIRInputDeleted = true;
      }
      continue;
    }
    if (hasExisting && hasIncoming) {
      const markerIncomingWins = incomingValueTs > existingValueTs
        || (incomingValueTs === existingValueTs && incomingWins);
      markers[key] = markerIncomingWins ? incomingMarkers[key] : existingMarkers[key];
      const sources = markerIncomingWins ? incomingSources : existingSources;
      if (Object.prototype.hasOwnProperty.call(sources, key)) markerSources[key] = sources[key];
      if (labEntryMarkerAffectsHOMAIR(key) && !Object.is(existingMarkers[key], incomingMarkers[key])) {
        homaIRInputChanged = true;
      }
    } else if (hasIncoming) {
      markers[key] = incomingMarkers[key];
      if (incomingSources[key]) markerSources[key] = incomingSources[key];
      if (labEntryMarkerAffectsHOMAIR(key)) homaIRInputChanged = true;
    } else if (hasExisting) {
      markers[key] = existingMarkers[key];
      if (existingSources[key]) markerSources[key] = existingSources[key];
      if (labEntryMarkerAffectsHOMAIR(key)) homaIRInputChanged = true;
    }
  }
  base.markers = markers;
  if (Object.keys(markerSources).length) base.markerSources = markerSources;
  else delete base.markerSources;
  if (Object.keys(markerTombstones).length) base[LAB_ENTRY_MARKER_TOMBSTONES] = markerTombstones;
  else delete base[LAB_ENTRY_MARKER_TOMBSTONES];
  const hasMergedHOMAIR = Object.prototype.hasOwnProperty.call(markers, 'diabetes.homaIR');
  const hasMergedGlucose = Object.prototype.hasOwnProperty.call(markers, 'biochemistry.glucose');
  const hasMergedInsulin = Object.prototype.hasOwnProperty.call(markers, 'diabetes.insulin')
    || Object.prototype.hasOwnProperty.call(markers, 'hormones.insulin')
    || Object.prototype.hasOwnProperty.call(markers, 'diabetes.insulin_d');
  const wouldDeleteExistingHOMAIR = hasMergedHOMAIR && (!hasMergedGlucose || !hasMergedInsulin);
  if (homaIRInputChanged && (!wouldDeleteExistingHOMAIR || homaIRInputDeleted)) recalculateLabEntryHOMAIR(base);
  const sourceFiles = mergeSourceFiles(existing, incoming);
  if (sourceFiles.length) {
    base.sourceFiles = sourceFiles;
    base.sourceFile = incomingWins
      ? (incoming.sourceFile || existing.sourceFile || sourceFiles[sourceFiles.length - 1])
      : (existing.sourceFile || incoming.sourceFile || sourceFiles[sourceFiles.length - 1]);
  }
  return base;
}

export function mergeLabEntriesByDate(localEntries, remoteEntries) {
  const hasLocal = Array.isArray(localEntries);
  const hasRemote = Array.isArray(remoteEntries);
  if (!hasLocal && !hasRemote) return undefined;
  const byDate = new Map();
  const noDate = [];
  function consume(entries) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.date !== 'string' || !entry.date) {
        noDate.push(entry);
        continue;
      }
      const existing = byDate.get(entry.date);
      byDate.set(entry.date, existing ? mergeLabEntry(existing, entry) : entry);
    }
  }
  // Remote first, local second. Local wins timestamp ties so a just-imported
  // unsynced lab entry cannot be wiped by a stale pull.
  consume(remoteEntries);
  consume(localEntries);
  return [...byDate.values(), ...noDate].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function isFreshLocalLabEntry(entry, now) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.date !== 'string' || !entry.date) return false;
  if (!Number.isFinite(entry.updatedAt)) return false;
  return entry.updatedAt <= now + 1000 && now - entry.updatedAt <= FRESH_LOCAL_LAB_ENTRY_TTL_MS;
}

export function preserveFreshLocalLabEntries(merged, local, now = Date.now()) {
  if (!merged || typeof merged !== 'object') return false;
  if (!local || typeof local !== 'object' || !Array.isArray(local.entries)) return false;
  const freshLocalEntries = local.entries.filter(entry => isFreshLocalLabEntry(entry, now));
  if (!freshLocalEntries.length) return false;

  if (!Array.isArray(merged.entries)) merged.entries = [];
  const deletedEntryDates = new Set(Array.isArray(merged._deleted?.entries) ? merged._deleted.entries : []);
  const byDate = new Map();
  for (let i = 0; i < merged.entries.length; i++) {
    const date = merged.entries[i]?.date;
    if (typeof date === 'string' && date) byDate.set(date, i);
  }

  let changed = false;
  for (const localEntry of freshLocalEntries) {
    if (deletedEntryDates.has(localEntry.date)) continue;
    const idx = byDate.get(localEntry.date);
    if (idx === undefined) {
      merged.entries.push(localEntry);
      byDate.set(localEntry.date, merged.entries.length - 1);
      changed = true;
      continue;
    }
    const before = JSON.stringify(merged.entries[idx]);
    const next = mergeLabEntry(merged.entries[idx], localEntry);
    if (JSON.stringify(next) !== before) {
      merged.entries[idx] = next;
      changed = true;
    }
  }
  if (changed) {
    merged.entries.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }
  return changed;
}
