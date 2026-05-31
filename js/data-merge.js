// data-merge.js — per-array record merge for cross-device sync.

import { DELTA_ARRAY_CONFIG } from './sync-delta-surface-config.js';
import { _isAllowlistSafeId } from './sync-delta-id.js';
//
// Background: sync pushes the whole `importedData` blob and pull used to do
// `localStorage.setItem(JSON.stringify(remote))`. With concurrent edits on
// two devices, last-writer-wins on the whole blob silently clobbers the
// loser's writes — surfaced as "logged a sun session on phone, never showed
// up on desktop" because desktop's later push overwrote the phone's row
// before it was pulled.
//
// Strategy: for known append-only id-keyed arrays (sun feature + a couple
// related), union local ∪ remote by `id`. Conflict on the same id picks the
// record with the higher shared freshness timestamp (`updatedAt`, `endedAt`,
// `capturedAt`, `createdAt`, etc.; whichever exists). Tombstones in
// `_deleted[arrayPath]` filter resurrected rows so deletes don't undo
// themselves on the device that didn't issue them.
//
// Single-object subtrees (lifelightProfile, sunDefaults, sunCorrelations,
// lightEnvironment top-level scalars) stay LWW — they're not multi-record.
//
// Other id-less arrays that have stable per-row sync ids merge through their
// configured itemIdFn below, so the blob baseline and itemRow overlay use the
// same freshness policy.

// id-keyed arrays inside importedData. Each key is a dotted path; nested
// arrays inside lightEnvironment go through a tiny accessor helper.
//
// IMPORTANT: every entry must have a string `id` field for unionById to
// dedup. Lists where entries are keyed by something other than `id` (e.g.
// changeHistory, which is keyed by field+date) belong in
// COMPOSITE_KEYED_ARRAYS instead, NOT here — otherwise the noId fallback
// in unionById will keep both sides' records and double the array on
// every cross-device pull, blowing past per-site caps.
export const ID_KEYED_ARRAYS = [
  'sunSessions',
  'deviceSessions',
  'lightDevices',
  'lightMeasurements',
  'lightAudits',
  'lightEnvironment.rooms',
  'lightEnvironment.screens',
];

export const NATURAL_KEYED_ARRAYS = Object.keys(DELTA_ARRAY_CONFIG)
  .filter(path => path !== 'entries' && path !== 'changeHistory');

// `_deleted[path]` tombstones can apply to id-keyed arrays and to select
// natural-key arrays that have a stable sync item id. Lab entries are keyed by
// collection date in the per-row sync layer, so a deleted import date needs a
// tombstone or a peer's still-live row can resurrect it before our next push.
export const TOMBSTONE_ARRAY_PATHS = [
  ...ID_KEYED_ARRAYS,
  ...NATURAL_KEYED_ARRAYS,
  'entries',
];

// Arrays whose entries don't carry an `id` but have a stable composite
// key. Each entry: { path, key: (entry) => string, cap?: number }.
// During merge we union local + remote, dedup by composite key (later
// entry wins on tie via timestamp), then optionally cap the array.
//
// changeHistory: keyed by `field|date` (recordChange overwrites
// same-day same-field by design). Cap matches the per-site cap of 200
// in context-cards.js + export.js + wearables-summary.js so a multi-
// device merge can never sneak past it.
// Exported so sync.js's per-row overlay can re-apply the cap after a
// v4 cutover pull (which bypasses mergeImportedData's natural cap step).
// Keep entries here in sync with consumer-side caps.
export const COMPOSITE_KEYED_ARRAYS = [
  { path: 'changeHistory', key: (e) => e?.field && e?.date ? `${e.field}|${e.date}` : null, cap: 200 },
];

const LOCAL_WINS_MAP_FIELDS = [
  'customMarkers',
  'refOverrides',
  'categoryLabels',
  'categoryIcons',
  'markerLabels',
  'markerNotes',
  'markerValueNotes',
  'manualValues',
];

export const FRESH_LOCAL_LAB_ENTRY_TTL_MS = 2 * 60 * 1000;
const TOMBSTONE_META_KEY = '_deletedAt';
const TOMBSTONE_CLEAR_META_KEY = '_deletedClearedAt';

const TIMESTAMP_FIELDS = [
  'updatedAt',
  'endedAt',
  'startedAt',
  'capturedAt',
  'takenAt',
  'savedAt',
  'loggedAt',
  'createdAt',
  'addedAt',
  'at',
];

function normalizeTimestamp(value) {
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

function hasExplicitTimestamp(rec) {
  if (!rec || typeof rec !== 'object') return false;
  return TIMESTAMP_FIELDS.some(field => normalizeTimestamp(rec[field]) !== null);
}

function mergePlainMap(localMap, remoteMap) {
  const hasLocal = localMap && typeof localMap === 'object' && !Array.isArray(localMap);
  const hasRemote = remoteMap && typeof remoteMap === 'object' && !Array.isArray(remoteMap);
  if (!hasLocal && !hasRemote) return undefined;
  return { ...(hasRemote ? remoteMap : {}), ...(hasLocal ? localMap : {}) };
}

function preserveLocalGeneticsSnps(local, remote, out) {
  const localSnps = local?.genetics?.snps;
  const remoteGenetics = remote?.genetics;
  if (!localSnps || typeof localSnps !== 'object' || Array.isArray(localSnps)) return;
  if (Object.keys(localSnps).length === 0) return;
  if (!remoteGenetics || typeof remoteGenetics !== 'object' || Array.isArray(remoteGenetics)) return;
  if (Object.prototype.hasOwnProperty.call(remoteGenetics, 'snps')) return;
  if (!out.genetics || typeof out.genetics !== 'object' || Array.isArray(out.genetics)) return;
  out.genetics = { ...out.genetics, snps: { ...localSnps } };
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
  const incomingWins = incomingTs > existingTs || incomingTs === existingTs;
  const base = incomingWins ? { ...existing, ...incoming } : { ...incoming, ...existing };
  const markers = {};
  const markerSources = {};
  const existingMarkers = existing.markers && typeof existing.markers === 'object' ? existing.markers : {};
  const incomingMarkers = incoming.markers && typeof incoming.markers === 'object' ? incoming.markers : {};
  const existingSources = existing.markerSources && typeof existing.markerSources === 'object' ? existing.markerSources : {};
  const incomingSources = incoming.markerSources && typeof incoming.markerSources === 'object' ? incoming.markerSources : {};
  const markerKeys = new Set([...Object.keys(existingMarkers), ...Object.keys(incomingMarkers)]);
  for (const key of markerKeys) {
    if (Object.prototype.hasOwnProperty.call(existingMarkers, key)
      && Object.prototype.hasOwnProperty.call(incomingMarkers, key)) {
      markers[key] = incomingWins ? incomingMarkers[key] : existingMarkers[key];
      markerSources[key] = incomingWins
        ? (incomingSources[key] || existingSources[key])
        : (existingSources[key] || incomingSources[key]);
    } else if (Object.prototype.hasOwnProperty.call(incomingMarkers, key)) {
      markers[key] = incomingMarkers[key];
      if (incomingSources[key]) markerSources[key] = incomingSources[key];
    } else {
      markers[key] = existingMarkers[key];
      if (existingSources[key]) markerSources[key] = existingSources[key];
    }
  }
  base.markers = markers;
  if (Object.keys(markerSources).length) base.markerSources = markerSources;
  else delete base.markerSources;
  const sourceFiles = mergeSourceFiles(existing, incoming);
  if (sourceFiles.length) {
    base.sourceFiles = sourceFiles;
    base.sourceFile = incomingWins
      ? (incoming.sourceFile || existing.sourceFile || sourceFiles[sourceFiles.length - 1])
      : (existing.sourceFile || incoming.sourceFile || sourceFiles[sourceFiles.length - 1]);
  }
  return base;
}

function mergeLabEntriesByDate(localEntries, remoteEntries) {
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

// Get/set helpers for the dotted path.
// Exported so sync.js can plan deltas at nested paths (e.g.
// `lightEnvironment.rooms`) without re-implementing the walk.
export function getAt(obj, path) {
  if (!obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}
// Reject any path segment that would walk Object.prototype. setAt is only
// called with allowlisted importedData paths, but defence-in-depth — a
// future caller passing user input through here would otherwise enable
// prototype pollution (the same class of bug `_isAllowlistSafeId` defends
// against in sync.js). Mirrors that guard so both code paths agree.
const _PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function setAt(obj, path, value) {
  const parts = path.split('.');
  for (const p of parts) {
    if (_PROTO_KEYS.has(p)) return;
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function naturalItemId(path, item) {
  const itemIdFn = DELTA_ARRAY_CONFIG[path]?.itemIdFn;
  if (typeof itemIdFn !== 'function') return null;
  const id = itemIdFn(item);
  return _isAllowlistSafeId(id) ? id : null;
}

export function getConfiguredArrayItemId(path, item) {
  const naturalId = naturalItemId(path, item);
  if (naturalId) return naturalId;
  return item && typeof item.id === 'string' && _isAllowlistSafeId(item.id)
    ? item.id
    : null;
}

export function recordArrayItemTombstone(importedData, arrayPath, item) {
  const id = getConfiguredArrayItemId(arrayPath, item);
  if (id) recordTombstone(importedData, arrayPath, id);
  return id;
}

function unionByItemId(localArr, remoteArr, tombstones, itemIdFn) {
  const tomb = tombstones instanceof Set ? tombstones : new Set(tombstones || []);
  const byId = new Map();
  const noId = [];

  function consider(item) {
    if (!item || typeof item !== 'object') return;
    const id = itemIdFn(item);
    if (typeof id !== 'string') {
      noId.push(item);
      return;
    }
    if (tomb.has(id)) return; // tombstoned — drop
    const existing = byId.get(id);
    if (!existing) { byId.set(id, item); return; }
    // Conflict — pick the fresher record. Existing/current wins ties so a
    // stale pull cannot revert local data when timestamps are equal/missing.
    byId.set(id, pickFresherRecord(existing, item));
  }

  if (Array.isArray(localArr))  for (const it of localArr)  consider(it);
  if (Array.isArray(remoteArr)) for (const it of remoteArr) consider(it);

  return [...byId.values(), ...noId];
}

// Union two arrays by record `id`. Records lacking an `id` are kept from
// both sides (no dedup possible). Tombstones is a Set of ids to drop.
export function unionById(localArr, remoteArr, tombstones) {
  return unionByItemId(localArr, remoteArr, tombstones, item => (
    item && typeof item.id === 'string' ? item.id : null
  ));
}

// Merge tombstones plus explicit "clear" markers. The clear metadata is what
// lets a later re-import of an already-deleted lab date beat an older tombstone
// from another device instead of being silently erased on the next pull.
// Capped so a tampered remote payload can't ship 10⁶ fabricated ids and bloat
// every device's localStorage / pull cost.
const TOMBSTONE_CAP_PER_PATH = 5000;
function readMetaAt(importedData, metaKey, path, id) {
  const n = importedData?.[metaKey]?.[path]?.[id];
  return Number.isFinite(n) ? n : 0;
}

function readPathMeta(importedData, metaKey, path) {
  const meta = importedData?.[metaKey]?.[path];
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function ensurePathMeta(importedData, metaKey, path) {
  if (!importedData[metaKey] || typeof importedData[metaKey] !== 'object' || Array.isArray(importedData[metaKey])) {
    importedData[metaKey] = {};
  }
  if (!importedData[metaKey][path] || typeof importedData[metaKey][path] !== 'object' || Array.isArray(importedData[metaKey][path])) {
    importedData[metaKey][path] = {};
  }
  return importedData[metaKey][path];
}

function deletePathMeta(importedData, metaKey, path, id) {
  const root = importedData?.[metaKey];
  const meta = root?.[path];
  if (!meta || typeof meta !== 'object') return;
  delete meta[id];
  if (Object.keys(meta).length === 0) delete root[path];
  if (Object.keys(root).length === 0) delete importedData[metaKey];
}

function mergeTombstoneState(path, local, remote) {
  const localT = local?._deleted?.[path];
  const remoteT = remote?._deleted?.[path];
  const ids = new Set();
  if (Array.isArray(localT))  for (const id of localT)  if (typeof id === 'string') ids.add(id);
  if (Array.isArray(remoteT)) for (const id of remoteT) if (typeof id === 'string') ids.add(id);

  const clearIds = new Set([
    ...Object.keys(readPathMeta(local, TOMBSTONE_CLEAR_META_KEY, path)),
    ...Object.keys(readPathMeta(remote, TOMBSTONE_CLEAR_META_KEY, path)),
  ].filter(id => typeof id === 'string' && id));

  const tombstones = [];
  const tombstoneMeta = Object.create(null);
  const clearMeta = Object.create(null);

  for (const id of ids) {
    const tombAt = Math.max(
      readMetaAt(local, TOMBSTONE_META_KEY, path, id),
      readMetaAt(remote, TOMBSTONE_META_KEY, path, id)
    );
    const clearAt = Math.max(
      readMetaAt(local, TOMBSTONE_CLEAR_META_KEY, path, id),
      readMetaAt(remote, TOMBSTONE_CLEAR_META_KEY, path, id)
    );
    if (clearAt > tombAt) {
      clearMeta[id] = clearAt;
      continue;
    }
    tombstones.push(id);
    if (tombAt) tombstoneMeta[id] = tombAt;
  }

  for (const id of clearIds) {
    if (Object.prototype.hasOwnProperty.call(clearMeta, id)) continue;
    if (ids.has(id)) continue;
    const clearAt = Math.max(
      readMetaAt(local, TOMBSTONE_CLEAR_META_KEY, path, id),
      readMetaAt(remote, TOMBSTONE_CLEAR_META_KEY, path, id)
    );
    if (clearAt) clearMeta[id] = clearAt;
  }

  const cappedTombstones = tombstones.slice(0, TOMBSTONE_CAP_PER_PATH);
  const cappedSet = new Set(cappedTombstones);
  for (const id of Object.keys(tombstoneMeta)) {
    if (!cappedSet.has(id)) delete tombstoneMeta[id];
  }

  const clearEntries = Object.entries(clearMeta)
    .filter(([, ts]) => Number.isFinite(ts) && ts > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOMBSTONE_CAP_PER_PATH);
  const cappedClearMeta = Object.create(null);
  for (const [id, ts] of clearEntries) cappedClearMeta[id] = ts;

  return { tombstones: cappedTombstones, tombstoneMeta, clearMeta: cappedClearMeta };
}

// Dangerous keys that, if reached via bracket-assignment, mutate the
// prototype chain or shadow built-ins. The merge only writes to keys
// that pass this filter.
const SAFE_PATH_RE = /^[a-zA-Z][a-zA-Z0-9_.]*$/;
function isSafeArrayPath(path) {
  if (typeof path !== 'string' || !SAFE_PATH_RE.test(path)) return false;
  if (path === '__proto__' || path === 'constructor' || path === 'prototype') return false;
  return true;
}

// Merge two `importedData` blobs into one. `local` is what's already on this
// device, `remote` is what just arrived from sync. Returns a new object —
// neither input is mutated. Single-object subtrees (everything not listed in
// ID_KEYED_ARRAYS) come from `remote` (LWW), preserving the v1 behavior for
// scalars / configs / id-less arrays.
export function mergeImportedData(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  if (!local  || typeof local  !== 'object') return remote;

  // Start from a shallow clone of remote — picks up new keys + LWW for
  // non-id-keyed scalars and arrays.
  const out = { ...remote };
  preserveLocalGeneticsSnps(local, remote, out);

  const mergedEntries = mergeLabEntriesByDate(local.entries, remote.entries);
  if (mergedEntries) out.entries = mergedEntries;

  for (const field of LOCAL_WINS_MAP_FIELDS) {
    const mergedMap = mergePlainMap(local[field], remote[field]);
    if (mergedMap) out[field] = mergedMap;
  }

  // Tombstones — union both sides' deletes. Restricted to paths in
  // TOMBSTONE_ARRAY_PATHS to prevent (a) prototype-pollution via `__proto__`
  // / `constructor` keys from a tampered remote payload, and (b) unbounded
  // accumulation of unrelated keys. mergeTombstoneState itself caps each
  // path's tombstone list at TOMBSTONE_CAP_PER_PATH to limit DoS bloat.
  const mergedDel = Object.create(null); // null-prototype so __proto__ key cannot mutate the chain
  const mergedDeletedAt = Object.create(null);
  const mergedDeletedClearedAt = Object.create(null);
  for (const path of TOMBSTONE_ARRAY_PATHS) {
    if (!isSafeArrayPath(path)) continue; // guard against future tombstone path additions
    const merged = mergeTombstoneState(path, local, remote);
    if (merged.tombstones.length) mergedDel[path] = merged.tombstones;
    if (Object.keys(merged.tombstoneMeta).length) mergedDeletedAt[path] = merged.tombstoneMeta;
    if (Object.keys(merged.clearMeta).length) mergedDeletedClearedAt[path] = merged.clearMeta;
  }
  if (Object.keys(mergedDel).length) out._deleted = mergedDel;
  else delete out._deleted;
  if (Object.keys(mergedDeletedAt).length) out[TOMBSTONE_META_KEY] = mergedDeletedAt;
  else delete out[TOMBSTONE_META_KEY];
  if (Object.keys(mergedDeletedClearedAt).length) out[TOMBSTONE_CLEAR_META_KEY] = mergedDeletedClearedAt;
  else delete out[TOMBSTONE_CLEAR_META_KEY];

  if (Array.isArray(out.entries) && Array.isArray(mergedDel.entries) && mergedDel.entries.length) {
    const deletedDates = new Set(mergedDel.entries);
    out.entries = out.entries.filter(entry => !deletedDates.has(entry?.date));
  }

  // For each id-keyed array path, do union-by-id with tombstones applied.
  for (const path of ID_KEYED_ARRAYS) {
    const localArr  = getAt(local,  path);
    const remoteArr = getAt(remote, path);
    if (!Array.isArray(localArr) && !Array.isArray(remoteArr)) continue;

    const tomb = new Set(mergedDel[path] || []);
    const merged = unionById(localArr, remoteArr, tomb);

    // Only set if at least one side had the array — avoids creating empty
    // arrays where neither side has one.
    if (Array.isArray(localArr) || Array.isArray(remoteArr)) {
      // Need to ensure the parent object exists when setting a nested path.
      // setAt handles that. But for `lightEnvironment.rooms`, we want to
      // preserve other lightEnvironment fields from remote (LWW for scalars).
      setAt(out, path, merged);
    }
  }

  // Natural-keyed per-row arrays (supplements, goals, notes, chat summaries)
  // lack `.id` but do have stable itemIdFn definitions in the delta registry.
  // Merge them before the itemRow overlay so a stale remote blob cannot wipe a
  // fresher local edit before the row-level freshness guard sees it.
  for (const path of NATURAL_KEYED_ARRAYS) {
    const localArr  = getAt(local,  path);
    const remoteArr = getAt(remote, path);
    if (!Array.isArray(localArr) && !Array.isArray(remoteArr)) continue;

    const tomb = new Set(mergedDel[path] || []);
    const merged = unionByItemId(localArr, remoteArr, tomb, item => naturalItemId(path, item));
    setAt(out, path, merged);
  }

  // Composite-keyed arrays (changeHistory etc.) — dedup by composite key,
  // cap to the configured per-array max. Without this, the merge would
  // double the array on every cross-device pull (no `id` for unionById to
  // dedup on) and blow past the per-site caps applied at write time.
  for (const { path, key, cap } of COMPOSITE_KEYED_ARRAYS) {
    const localArr  = getAt(local,  path);
    const remoteArr = getAt(remote, path);
    if (!Array.isArray(localArr) && !Array.isArray(remoteArr)) continue;
    const seen = new Map(); // composite-key → entry
    const noKey = []; // entries that can't produce a key — kept as-is
    function consume(arr) {
      if (!Array.isArray(arr)) return;
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const k = key(e);
        if (!k) { noKey.push(e); continue; }
        const existing = seen.get(k);
        if (!existing) { seen.set(k, e); continue; }
        // Conflict: same composite key on both sides. Prefer the entry
        // with an explicit edit timestamp first; if both (or neither)
        // have one, compare via pickTimestamp.
        const eExp = hasExplicitTimestamp(e);
        const xExp = hasExplicitTimestamp(existing);
        if (eExp && !xExp) { seen.set(k, e); continue; }
        if (!eExp && xExp) continue;
        const eTs = pickTimestamp(e);
        const xTs = pickTimestamp(existing);
        if (eTs > xTs) seen.set(k, e);
      }
    }
    consume(localArr);
    consume(remoteArr);
    let merged = [...seen.values(), ...noKey];
    if (Number.isFinite(cap) && merged.length > cap) {
      // Sort by timestamp desc, keep newest `cap` entries. pickTimestamp
      // already falls back through updatedAt → date — works for the
      // changeHistory `{field, date, snapshot}` shape via the date string
      // fallback in pickTimestamp.
      merged.sort((a, b) => pickTimestamp(b) - pickTimestamp(a));
      merged = merged.slice(0, cap);
    }
    setAt(out, path, merged);
  }

  return out;
}

// True iff `local` has anything `remote` doesn't reflect — used after a
// pull-and-merge to decide whether to rebroadcast our union back to the
// relay. Three triggers:
//
//  1. New ids: local has a record id remote lacks.
//  2. Within-id timestamp wins: local AND remote both have a record with
//     the same id, but local's pickTimestamp is strictly higher (meaning
//     after merge the local copy is the canonical one and the remote's
//     copy is stale). Without this branch, the cross-device "I ended
//     this session at 41min, the other device ended it at 26min" race
//     leaves desktop with the right value but never republishes — phone
//     stays stale forever even after pulling. Symptom matched the live
//     bug today.
//  3. Tombstones local has that remote lacks (delete propagation).
//
// Order-independent — uses Sets / pickTimestamp, not JSON-string
// comparison, so different merge insertion orders across devices don't
// trigger a rebroadcast loop.
export function localHasRowsRemoteLacks(local, remote) {
  if (!local || typeof local !== 'object') return false;
  if (!remote || typeof remote !== 'object') return true; // no remote, all local is news
  if (Array.isArray(local.entries)) {
    const remoteEntries = new Map();
    if (Array.isArray(remote.entries)) {
      for (const entry of remote.entries) {
        if (entry?.date) remoteEntries.set(entry.date, entry);
      }
    }
    for (const entry of local.entries) {
      if (!entry?.date) continue;
      const remoteEntry = remoteEntries.get(entry.date);
      if (!remoteEntry) return true;
      const localMarkers = entry.markers && typeof entry.markers === 'object' ? entry.markers : {};
      const remoteMarkers = remoteEntry.markers && typeof remoteEntry.markers === 'object' ? remoteEntry.markers : {};
      for (const [key, value] of Object.entries(localMarkers)) {
        if (!Object.prototype.hasOwnProperty.call(remoteMarkers, key)) return true;
        if (JSON.stringify(value) !== JSON.stringify(remoteMarkers[key])) return true;
      }
    }
  }
  for (const field of LOCAL_WINS_MAP_FIELDS) {
    const localMap = local[field];
    if (!localMap || typeof localMap !== 'object' || Array.isArray(localMap)) continue;
    const remoteMap = remote[field] && typeof remote[field] === 'object' && !Array.isArray(remote[field])
      ? remote[field]
      : {};
    for (const [key, value] of Object.entries(localMap)) {
      if (!Object.prototype.hasOwnProperty.call(remoteMap, key)) return true;
      if (JSON.stringify(value) !== JSON.stringify(remoteMap[key])) return true;
    }
  }
  for (const path of ID_KEYED_ARRAYS) {
    const lArr = getAt(local, path);
    const rArr = getAt(remote, path);
    if (!Array.isArray(lArr)) continue;
    const remoteById = new Map();
    if (Array.isArray(rArr)) {
      for (const item of rArr) {
        if (item && typeof item.id === 'string') remoteById.set(item.id, item);
      }
    }
    for (const item of lArr) {
      if (!item || typeof item.id !== 'string') continue;
      const remoteItem = remoteById.get(item.id);
      // (1) new id — local has it, remote doesn't
      if (!remoteItem) return true;
      // (2) within-id conflict — same id, but local's record has a
      //     strictly higher canonical timestamp. Same logic mergeImportedData
      //     uses to pick a winner; mirroring it here keeps the rebroadcast
      //     decision aligned with what the merge actually did.
      if (compareRecordFreshness(item, remoteItem) > 0) return true;
    }
  }
  for (const path of NATURAL_KEYED_ARRAYS) {
    const lArr = getAt(local, path);
    const rArr = getAt(remote, path);
    if (!Array.isArray(lArr)) continue;
    const remoteById = new Map();
    if (Array.isArray(rArr)) {
      for (const item of rArr) {
        const id = naturalItemId(path, item);
        if (id) remoteById.set(id, item);
      }
    }
    for (const item of lArr) {
      const id = naturalItemId(path, item);
      if (!id) continue;
      const remoteItem = remoteById.get(id);
      if (!remoteItem) return true;
      if (compareRecordFreshness(item, remoteItem) > 0) return true;
    }
  }
  // (3) Tombstones on local but not on remote also need rebroadcast so
  // the delete propagates. Restricted to TOMBSTONE_ARRAY_PATHS paths — same
  // guard as mergeImportedData's tombstone block; prevents an attacker-
  // injected path from forcing an infinite rebroadcast.
  const lDel = (local._deleted && typeof local._deleted === 'object') ? local._deleted : {};
  const rDel = (remote._deleted && typeof remote._deleted === 'object') ? remote._deleted : {};
  for (const path of TOMBSTONE_ARRAY_PATHS) {
    if (!Object.prototype.hasOwnProperty.call(lDel, path)) continue;
    const remoteSet = new Set(Array.isArray(rDel[path]) ? rDel[path] : []);
    for (const id of (lDel[path] || [])) {
      if (typeof id === 'string' && !remoteSet.has(id)) return true;
      if (typeof id === 'string'
        && readMetaAt(local, TOMBSTONE_META_KEY, path, id) > readMetaAt(remote, TOMBSTONE_META_KEY, path, id)) {
        return true;
      }
    }
  }
  for (const path of TOMBSTONE_ARRAY_PATHS) {
    const localClears = readPathMeta(local, TOMBSTONE_CLEAR_META_KEY, path);
    for (const [id, ts] of Object.entries(localClears)) {
      if (typeof id === 'string' && Number.isFinite(ts)
        && ts > readMetaAt(remote, TOMBSTONE_CLEAR_META_KEY, path, id)) {
        return true;
      }
    }
  }
  return false;
}

// Record a delete for a known sync row. Mutates the importedData blob in place.
// Callers (delete sites in sun.js, light-devices.js, pdf-import.js, etc.)
// should run this BEFORE the array.filter() that removes the row, so the
// tombstone survives even if the row is gone before the next sync push.
export function recordTombstone(importedData, arrayPath, id) {
  if (!importedData || typeof importedData !== 'object') return;
  if (typeof id !== 'string' || !id) return;
  if (!importedData._deleted || typeof importedData._deleted !== 'object') {
    importedData._deleted = {};
  }
  const list = importedData._deleted[arrayPath];
  if (Array.isArray(list)) {
    if (!list.includes(id)) list.push(id);
  } else {
    importedData._deleted[arrayPath] = [id];
  }
  ensurePathMeta(importedData, TOMBSTONE_META_KEY, arrayPath)[id] = Date.now();
  deletePathMeta(importedData, TOMBSTONE_CLEAR_META_KEY, arrayPath, id);
}

export function clearTombstone(importedData, arrayPath, id) {
  if (!importedData || typeof importedData !== 'object') return;
  if (typeof id !== 'string' || !id) return;
  ensurePathMeta(importedData, TOMBSTONE_CLEAR_META_KEY, arrayPath)[id] = Date.now();
  deletePathMeta(importedData, TOMBSTONE_META_KEY, arrayPath, id);
  const deleted = importedData._deleted;
  if (!deleted || typeof deleted !== 'object') return;
  const list = deleted[arrayPath];
  if (!Array.isArray(list)) return;
  const next = list.filter(x => x !== id);
  if (next.length) deleted[arrayPath] = next;
  else delete deleted[arrayPath];
  if (Object.keys(deleted).length === 0) delete importedData._deleted;
}
