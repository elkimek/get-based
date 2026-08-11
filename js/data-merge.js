// @ts-check
// data-merge.js — per-array record merge for cross-device sync.

import { DELTA_ARRAY_CONFIG } from './sync-delta-surface-config.js';
import { _isAllowlistSafeId } from './sync-delta-id.js';
import { getLabEntryMarkerTombstones } from './lab-entry.js';
import {
  FRESH_LOCAL_LAB_ENTRY_TTL_MS,
  compareRecordFreshness,
  hasExplicitTimestamp,
  mergeLabEntriesByDate,
  mergeLabEntry,
  normalizeTimestamp,
  pickFresherRecord,
  pickTimestamp,
  preserveFreshLocalLabEntries,
} from './data-merge-lab-entries.js';

export {
  FRESH_LOCAL_LAB_ENTRY_TTL_MS,
  compareRecordFreshness,
  mergeLabEntry,
  pickFresherRecord,
  pickTimestamp,
  preserveFreshLocalLabEntries,
};
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
  'changeHistory',
];

// Arrays whose entries don't carry an `id` but have a stable composite
// key. Each entry: { path, key: (entry) => string, cap?: number }.
// During merge we union local + remote, dedup by composite key (later
// entry wins on tie via timestamp), then optionally cap the array.
//
// changeHistory: keyed by the same configured identity used by delta sync.
// Context edits use field+date; wearable anomalies use their stable event
// signature. Cap matches the per-site cap of 200 so a multi-device merge
// can never sneak past it.
// Exported so sync.js's per-row overlay can re-apply the cap after a
// v4 cutover pull (which bypasses mergeImportedData's natural cap step).
// Keep entries here in sync with consumer-side caps.
export const COMPOSITE_KEYED_ARRAYS = [
  { path: 'changeHistory', key: (e) => getConfiguredArrayItemId('changeHistory', e), cap: 200 },
];

const LOCAL_WINS_MAP_FIELDS = [
  'customMarkers',
  'markerPlacements',
  'refOverrides',
  'categoryLabels',
  'categoryIcons',
  'markerLabels',
  'markerNotes',
  'markerValueNotes',
  'manualValues',
];

const TOMBSTONE_META_KEY = '_deletedAt';
const TOMBSTONE_CLEAR_META_KEY = '_deletedClearedAt';

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


// Get/set helpers for the dotted path.
// Exported so sync.js can plan deltas at nested paths (e.g.
// `lightEnvironment.rooms`) without re-implementing the walk.
const _hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function _isSafePathSegment(segment) {
  return (
    typeof segment === 'string'
    && segment !== ''
    && segment !== '__proto__'
    && segment !== 'constructor'
    && segment !== 'prototype'
  );
}

function _splitSafePath(path) {
  if (typeof path !== 'string') return null;
  const parts = path.split('.');
  return parts.every(_isSafePathSegment) ? parts : null;
}

function _defineDataProperty(obj, key, value) {
  if (
    typeof key !== 'string'
    || key === '__proto__'
    || key === 'constructor'
    || key === 'prototype'
  ) {
    return false;
  }
  try {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function getAt(obj, path) {
  if (!obj) return undefined;
  const parts = _splitSafePath(path);
  if (!parts) return undefined;
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (!_hasOwn(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}
// Reject any path segment that would walk Object.prototype. setAt currently
// receives allowlisted importedData paths, but future caller mistakes should
// fail closed instead of creating attacker-controlled prototype properties.
export function setAt(obj, path, value) {
  const parts = _splitSafePath(path);
  if (!parts || !obj || typeof obj !== 'object') return false;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const existing = _hasOwn(cur, p) ? cur[p] : undefined;
    if (existing == null || typeof existing !== 'object') {
      if (!_defineDataProperty(cur, p, {})) return false;
    }
    cur = cur[p];
  }
  return _defineDataProperty(cur, parts[parts.length - 1], value);
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

export function recordArrayItemTombstone(importedData, arrayPath, item, { force = false } = {}) {
  if (DELTA_ARRAY_CONFIG[arrayPath]?.noTombstones && !force) return null;
  const id = getConfiguredArrayItemId(arrayPath, item);
  if (id) recordTombstone(importedData, arrayPath, id);
  return id;
}

export function ensureImportedArray(importedData, arrayPath) {
  if (!importedData || typeof importedData !== 'object') return [];
  const existing = getAt(importedData, arrayPath);
  if (Array.isArray(existing)) return existing;
  const next = [];
  setAt(importedData, arrayPath, next);
  return next;
}

export function restoreImportedArray(importedData, arrayPath, items) {
  const next = Array.isArray(items) ? items.slice() : [];
  setAt(importedData, arrayPath, next);
  return next;
}

function tombstoneChangedArrayIdentity(importedData, arrayPath, previousItem, nextItem) {
  const previousId = getConfiguredArrayItemId(arrayPath, previousItem);
  if (!previousId) return null;
  const nextId = getConfiguredArrayItemId(arrayPath, nextItem);
  if (previousId === nextId) return null;
  return recordArrayItemTombstone(importedData, arrayPath, previousItem);
}

export function appendImportedArrayItem(importedData, arrayPath, item) {
  const arr = ensureImportedArray(importedData, arrayPath);
  arr.push(item);
  return item;
}

export function replaceImportedArrayItem(importedData, arrayPath, index, nextItem) {
  const arr = ensureImportedArray(importedData, arrayPath);
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) return null;
  const previousItem = arr[index];
  const tombstonedId = tombstoneChangedArrayIdentity(importedData, arrayPath, previousItem, nextItem);
  arr[index] = nextItem;
  return { previousItem, nextItem, tombstonedId };
}

export function deleteImportedArrayItem(importedData, arrayPath, index) {
  const arr = getAt(importedData, arrayPath);
  if (!Array.isArray(arr)) return null;
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) return null;
  const [removedItem] = arr.splice(index, 1);
  const tombstonedId = recordArrayItemTombstone(importedData, arrayPath, removedItem);
  return { removedItem, tombstonedId };
}

export function deleteImportedArrayItems(importedData, arrayPath, predicate, { forceTombstones = false } = {}) {
  const arr = getAt(importedData, arrayPath);
  if (!Array.isArray(arr) || typeof predicate !== 'function') return [];
  const kept = [];
  const removed = [];
  arr.forEach((item, index) => {
    if (predicate(item, index, arr)) {
      recordArrayItemTombstone(importedData, arrayPath, item, { force: forceTombstones });
      removed.push(item);
    } else {
      kept.push(item);
    }
  });
  if (removed.length) setAt(importedData, arrayPath, kept);
  return removed;
}

export function clearImportedArray(importedData, arrayPath) {
  const arr = getAt(importedData, arrayPath);
  if (!Array.isArray(arr)) return [];
  const removed = arr.slice();
  for (const item of removed) recordArrayItemTombstone(importedData, arrayPath, item);
  setAt(importedData, arrayPath, []);
  return removed;
}

export function sortImportedArray(importedData, arrayPath, compareFn) {
  const arr = getAt(importedData, arrayPath);
  if (!Array.isArray(arr) || typeof compareFn !== 'function') return [];
  arr.sort(compareFn);
  return arr;
}

export function trimImportedArray(importedData, arrayPath, maxLength, opts = {}) {
  const arr = getAt(importedData, arrayPath);
  if (!Array.isArray(arr) || !Number.isInteger(maxLength) || maxLength < 0 || arr.length <= maxLength) return [];
  const keep = opts.keep === 'first' ? 'first' : 'last';
  const cut = arr.length - maxLength;
  const removed = keep === 'first' ? arr.slice(maxLength) : arr.slice(0, cut);
  const kept = keep === 'first' ? arr.slice(0, maxLength) : arr.slice(cut);
  for (const item of removed) recordArrayItemTombstone(importedData, arrayPath, item);
  setAt(importedData, arrayPath, kept);
  return removed;
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
    const tomb = new Set(mergedDel[path] || []);
    function consume(arr) {
      if (!Array.isArray(arr)) return;
      for (const e of arr) {
        if (!e || typeof e !== 'object') continue;
        const itemId = getConfiguredArrayItemId(path, e);
        if (itemId && tomb.has(itemId)) continue;
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
      const localMarkerTombs = getLabEntryMarkerTombstones(entry);
      const remoteMarkerTombs = getLabEntryMarkerTombstones(remoteEntry);
      for (const [key, ts] of Object.entries(localMarkerTombs)) {
        if (Number.isFinite(ts) && ts > (normalizeTimestamp(remoteMarkerTombs[key]) || 0)) return true;
      }
      if (compareRecordFreshness(entry, remoteEntry) > 0) return true;
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
