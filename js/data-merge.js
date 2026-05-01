// data-merge.js — per-array union-by-id merge for cross-device sync.
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
// record with the higher `updatedAt` / `endedAt` / `startedAt` / `capturedAt`
// (whichever exists). Tombstones in `_deleted[arrayPath]` filter resurrected
// rows so deletes don't undo themselves on the device that didn't issue them.
//
// Single-object subtrees (lifelightProfile, sunDefaults, sunCorrelations,
// lightEnvironment top-level scalars) stay LWW — they're not multi-record.
//
// Other id-less arrays (entries by date, notes by date, supplements by name)
// fall through to LWW for now — separate refactor; the sun feature is the
// scope of this fix.

// id-keyed arrays inside importedData. Each key is a dotted path; nested
// arrays inside lightEnvironment go through a tiny accessor helper.
export const ID_KEYED_ARRAYS = [
  'sunSessions',
  'deviceSessions',
  'lightDevices',
  'lightMeasurements',
  'changeHistory',
  'lightEnvironment.rooms',
  'lightEnvironment.screens',
];

// Pick a comparable timestamp for conflict resolution. Higher wins.
// Tries the most recently-edited signal first, falls back through the
// usual creation timestamps. Returns 0 if nothing recognizable found —
// the function is permissive so foreign records (older schemas) merge
// instead of throwing.
function pickTimestamp(rec) {
  if (!rec || typeof rec !== 'object') return 0;
  const t = rec.updatedAt
    ?? rec.endedAt
    ?? rec.startedAt
    ?? rec.capturedAt
    ?? rec.loggedAt
    ?? rec.createdAt
    ?? rec.at;
  if (Number.isFinite(t)) return t;
  if (typeof rec.date === 'string') {
    const parsed = Date.parse(rec.date);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Get/set helpers for the dotted path.
function getAt(obj, path) {
  if (!obj) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}
function setAt(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// Union two arrays by record `id`. Records lacking an `id` are kept from
// both sides (no dedup possible). Tombstones is a Set of ids to drop.
export function unionById(localArr, remoteArr, tombstones) {
  const tomb = tombstones instanceof Set ? tombstones : new Set(tombstones || []);
  const byId = new Map();
  const noId = [];

  function consider(item) {
    if (!item || typeof item !== 'object') return;
    if (typeof item.id === 'string') {
      if (tomb.has(item.id)) return; // tombstoned — drop
      const existing = byId.get(item.id);
      if (!existing) { byId.set(item.id, item); return; }
      // Conflict — pick the record with the higher timestamp.
      const lTs = pickTimestamp(existing);
      const rTs = pickTimestamp(item);
      byId.set(item.id, rTs > lTs ? item : existing);
    } else {
      noId.push(item);
    }
  }

  if (Array.isArray(localArr))  for (const it of localArr)  consider(it);
  if (Array.isArray(remoteArr)) for (const it of remoteArr) consider(it);

  return [...byId.values(), ...noId];
}

// Union two tombstone arrays — order-insensitive set union. Capped so a
// tampered remote payload can't ship 10⁶ fabricated ids and bloat every
// device's localStorage / pull cost. Real workloads should stay well below
// this — a user deleting 50 rows/month for a year is 600 entries.
const TOMBSTONE_CAP_PER_PATH = 5000;
function mergeTombstones(localT, remoteT) {
  const out = new Set();
  if (Array.isArray(localT))  for (const id of localT)  if (typeof id === 'string') out.add(id);
  if (Array.isArray(remoteT)) for (const id of remoteT) if (typeof id === 'string') out.add(id);
  if (out.size <= TOMBSTONE_CAP_PER_PATH) return [...out];
  return [...out].slice(0, TOMBSTONE_CAP_PER_PATH);
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

  // Tombstones — union both sides' deletes. Restricted to paths in
  // ID_KEYED_ARRAYS to prevent (a) prototype-pollution via `__proto__`
  // / `constructor` keys from a tampered remote payload, and (b) unbounded
  // accumulation of unrelated keys. mergeTombstones itself caps each
  // path's tombstone list at TOMBSTONE_CAP_PER_PATH to limit DoS bloat.
  const localDel  = (local._deleted  && typeof local._deleted  === 'object') ? local._deleted  : {};
  const remoteDel = (remote._deleted && typeof remote._deleted === 'object') ? remote._deleted : {};
  const mergedDel = Object.create(null); // null-prototype so __proto__ key cannot mutate the chain
  for (const path of ID_KEYED_ARRAYS) {
    if (!isSafeArrayPath(path)) continue; // guard against future ID_KEYED_ARRAYS entries
    const merged = mergeTombstones(localDel[path], remoteDel[path]);
    if (merged.length) mergedDel[path] = merged;
  }
  if (Object.keys(mergedDel).length) out._deleted = mergedDel;
  else delete out._deleted;

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

  return out;
}

// True iff `local` has any record id (in any ID_KEYED_ARRAYS array) that
// `remote` lacks, OR has a tombstone `remote` lacks. Used after a pull-and-
// merge to decide whether to rebroadcast our union back to the relay.
// Order-independent — uses Sets, not JSON-string comparison, so different
// merge insertion orders across devices don't trigger a rebroadcast loop.
export function localHasRowsRemoteLacks(local, remote) {
  if (!local || typeof local !== 'object') return false;
  if (!remote || typeof remote !== 'object') return true; // no remote, all local is news
  for (const path of ID_KEYED_ARRAYS) {
    const lArr = getAt(local, path);
    const rArr = getAt(remote, path);
    if (!Array.isArray(lArr)) continue;
    const remoteIds = new Set(
      Array.isArray(rArr) ? rArr.filter(x => x && typeof x.id === 'string').map(x => x.id) : []
    );
    for (const item of lArr) {
      if (item && typeof item.id === 'string' && !remoteIds.has(item.id)) return true;
    }
  }
  // Tombstones on local but not on remote also need rebroadcast so the
  // delete propagates. Restricted to ID_KEYED_ARRAYS paths — same guard
  // as mergeImportedData's tombstone block; prevents an attacker-injected
  // path from forcing an infinite rebroadcast.
  const lDel = (local._deleted && typeof local._deleted === 'object') ? local._deleted : {};
  const rDel = (remote._deleted && typeof remote._deleted === 'object') ? remote._deleted : {};
  for (const path of ID_KEYED_ARRAYS) {
    if (!Object.prototype.hasOwnProperty.call(lDel, path)) continue;
    const remoteSet = new Set(Array.isArray(rDel[path]) ? rDel[path] : []);
    for (const id of (lDel[path] || [])) {
      if (typeof id === 'string' && !remoteSet.has(id)) return true;
    }
  }
  return false;
}

// Record a delete for a known id-keyed array. Mutates the importedData blob
// in place. Callers (delete sites in sun.js, light-devices.js, etc.) should
// run this BEFORE the array.filter() that removes the row, so the tombstone
// survives even if the row is gone before the next sync push.
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
}
