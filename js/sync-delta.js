// sync-delta.js — Evolu per-row delta planning, merge overlay, and cutover telemetry.

import { state } from './state.js';
import { COMPOSITE_KEYED_ARRAYS, pickTimestamp, getAt, setAt } from './data-merge.js';
import { _base64ToBytes, _bytesToBase64, _gzipString, _gunzipToStringCapped } from './sync-payload.js';

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDelta({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
}

function _currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function _currentItemRowQuery() {
  try { return _getItemRowQuery?.() || null; } catch { return null; }
}

// ═══════════════════════════════════════════════
// PER-ARRAY DELTA SYNC — Phase 1 of CRDT-delta refactor
// ═══════════════════════════════════════════════
//
// See memory/project_evolu_delta_refactor_plan.md for full design + risk
// register. Short version: every pushProfile writes the entire ~200 KB
// importedData blob into one CRDT message. Evolu's per-owner relay quota
// fills in ~280 pushes (~few weeks of normal use), creating a recurring
// "phone says committed, desktop sees stale" wedge. The cure is to use
// Evolu the way it expects — many small rows mutated independently —
// so each push is a few KB of CRDT delta instead of half a megabyte of
// full-state snapshot.
//
// Phase 1 (v1.7.0–v1.7.6) is the additive datapath: per-row CRDT messages
// run alongside the existing fat-blob push so devices on older versions
// stay in sync. Pull-side: blob merge establishes the baseline first,
// then per-row state overlays on top — per-row wins on disagreement
// because each row carries its own LWW timestamp and reflects the
// up-to-the-moment state, while the blob may be a stale snapshot from
// before another device synced.
//
// Phase 2 (v1.7.10) introduces a per-profile cutover flag — when on,
// buildSyncPayload omits importedData entirely and per-row deltas
// become the only carrier. v1.7.9's getDeltaCutoverReadiness gates
// the flag so it can't be enabled while any surface still has local
// data without a per-row push (which would silently lose it).

// Arrays subject to delta sync. Highest-velocity first — these drive the
// fat-blob size that fills the quota. Adding to this list does NOT
// require schema migration since the itemRow table is generic.
// Dotted paths (e.g. `lightEnvironment.rooms`) are honored — getAt/setAt
// from data-merge.js walk them. The Phase 2 cutover (which drops the blob
// path entirely) requires nested-array surfaces ride the per-row planner;
// otherwise wholesale-LWW silently regresses cross-device room/screen
// edits to last-write-wins clobber.
export const DELTA_ARRAYS = [
  'sunSessions',         // 1–10/day, ~500 B each
  'lightDevices',        // rare add but per-device session logs are frequent
  'deviceSessions',
  'lightAudits',
  'lightMeasurements',
  'lightEnvironment.rooms',   // nested array — needs per-row CRDT, not whole-object LWW
  'lightEnvironment.screens', // same
  'entries',             // 1–4/month at lab cadence, ~2 KB each
  'notes',               // ad-hoc; user-driven cadence
  'supplements',         // editorial churn during routine tweaking
  'healthGoals',
  'changeHistory',       // composite-keyed (field|date), capped at 200, append+update only
  'chatSummaries',       // per-thread AI-generated summaries, keyed by threadId; 1–50 entries/profile
];

// Per-array overrides for arrays that don't fit the default
// `it.id` / tombstone-on-removal contract. Two knobs:
//   itemIdFn(item) — derive a stable allowlist-safe itemId for items
//     without a `.id` field (e.g. composite keys). Returning a string
//     that fails the allowlist regex causes the item to be skipped
//     defensively (same as malformed `.id` for default arrays).
//   noTombstones: true — don't emit tombstones when an item disappears
//     from the local array. Use for arrays where local eviction is
//     expected (capped lists like changeHistory) and a tombstone would
//     destroy the same item on a peer device whose window happens to
//     still include it. Cap is enforced consumer-side via data-merge.js,
//     so the relay accumulating extra rows is fine — they're harmless
//     until someone genuinely deletes the entry.
const DELTA_ARRAY_CONFIG = {
  // changeHistory entries are { field, date, snapshot, ... } with no `id`.
  // Synthesize a stable itemId from the same composite key data-merge.js
  // uses (`field|date`), but encoded in the allowlist alphabet — `.field`
  // is already category.markerKey shape, `Date.parse(date)` is numeric.
  // Sanitize defensively so a future schema add (e.g. unicode field names)
  // doesn't bypass the regex; replacement keeps uniqueness because `field`
  // and `date` are independent dimensions.
  changeHistory: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.field || !it.date) return null;
      const ts = Date.parse(it.date);
      if (!Number.isFinite(ts)) return null;
      return `${it.field}.${ts}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    },
    noTombstones: true,
  },
  // lightMeasurements: every deletion path (_supersedePriorMeasurement
  // on save, _collapseToLatestPerRoomTool one-time migration,
  // deleteMeasurement on user delete) explicitly writes to _deleted via
  // recordTombstone. Under Phase 1 (v3 blob) those tombstones ride the
  // fat blob. Under Phase 2 (v4, blob omitted) the planner's automatic
  // per-row tombstone emission is the ONLY carrier — so we MUST allow
  // it (no `noTombstones: true`). The storm guard upstream still blocks
  // a >50% drop from N>=20 rows, so a one-time migration that collapses
  // historical data won't broadcast accidental peer-wipes.
  // Lab entries — `{date, markers, ...}` with no `.id`. The import path
  // already enforces date-uniqueness (import-dedup filter on `date`), so
  // `date` is the natural composite-free key. `YYYY-MM-DD` matches the
  // allowlist regex directly. Without this, every entry produced by
  // PDF-import / JSON-import / manual entry was silently filtered out
  // of the per-row planner because the default itemIdFn requires
  // `it.id` as a string.
  entries: {
    itemIdFn: (it) => (it && typeof it.date === 'string' && _isAllowlistSafeId(it.date)) ? it.date : null,
  },
  // Supplements — `{name, dosage, type, startDate, endDate}` with no `.id`.
  // Use content hash over (name + startDate + type) so the same supplement
  // on the same start date with the same type lands on the same itemId
  // across devices. Different devices migrating identical pre-existing data
  // independently derive the same id — critical for preventing cross-device
  // duplication. Editing dosage / endDate flips the hash → tombstone old +
  // insert new, which presents as "delete + insert" cross-device. Acceptable
  // for this surface's append-mostly cadence (1-2 edits/year per supplement).
  supplements: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.name || ''}|${it.startDate || ''}|${it.type || ''}`;
      return sig === '||' ? null : `s_${_djb2(sig)}`;
    },
  },
  // Health goals — `{text, severity}` with no `.id`. Hash the user-typed
  // text — different goals have different texts; identical texts dedupe
  // by design (a user adding the same goal twice would expect one row).
  // Severity changes hash, but severity is rarely edited post-creation.
  healthGoals: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.text) return null;
      return `g_${_djb2(it.text)}`;
    },
  },
  // Notes — `{date, text}` with no `.id` (saveNote in js/notes.js). Without
  // this override the default itemIdFn requires `it.id`, returns null for
  // every note, and the planner emits zero rows. That's both an empty
  // delta AND a permanent Phase 2 cutover blocker (getDeltaCutoverReadiness
  // sees rowCount=0 vs localCount>0 and refuses to flip). Hash (date,text)
  // — same content-hash pattern as supplements/healthGoals. Note edits
  // tombstone the old hash + insert a new one (acceptable for the rare
  // edit cadence on this surface; Greptile re-review #175).
  notes: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.date || ''}|${it.text || ''}`;
      return sig === '|' ? null : `n_${_djb2(sig)}`;
    },
  },
  // chatSummaries — `{id, threadId, ...}` where `.id` is `s_<base36-timestamp>`
  // (chat.js:778). Default itemIdFn would key by `.id`, which is timestamp-
  // unique per device — so two devices summarising the same thread
  // independently each create a row with a different itemId, and
  // unionById in mergeImportedData keeps both as distinct objects (a
  // duplicate that the threadId-based local replacement logic in
  // chat.js:813 silently masks but never cleans up). Override to derive
  // the itemId from threadId so concurrent same-thread summaries collapse
  // to one row cross-device (LWW per the relay; whichever device's
  // summary lands last wins). Greptile re-review #175 caught this.
  chatSummaries: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.threadId) return null;
      return `cs_${_djb2(String(it.threadId))}`;
    },
  },
};

// Importance-scoped maps subject to delta sync. Parallel to DELTA_ARRAYS
// but for keyed-object shapes (`{ [key]: value }`) — markerNotes today,
// customMarkers a likely follow-up. The itemRow table is shape-agnostic
// (arrayName + itemId + payload), so the only difference vs the array
// path is how items are enumerated and reconstructed. Keys that fail
// the allowlist regex are silently skipped at the planner — same
// defence-in-depth posture as malformed `.id` fields on the array path.
export const DELTA_MAPS = [
  'markerNotes',         // user-attached freeform notes per marker, ~bytes per entry, frequent edits
  'markerValueNotes',    // user-attached freeform notes per (marker, date) — keyed `category.markerKey:date`
  'customMarkers',       // user-defined markers (PDF imports + manual creation), keyed by `category.markerKey`
  'manualValues',        // membership flags for manually-typed entry values, keyed `category.markerKey:date` (synth-id)
  'refOverrides',        // user-edited reference ranges per marker, keyed by `category.markerKey`
  'categoryLabels',      // user-renamed category labels, keyed by category key
  'categoryIcons',       // user-picked category icons, keyed by category key
  'markerLabels',        // user-renamed marker labels, keyed by `category.markerKey`
  'wearablePrimaryOverride', // per-metric primary-source override, keyed by canonical metricId
  // Dotted path: genetics.snps was DELTA_SCALARS via the parent `genetics`
  // object until 2026-05. Whole-blob LWW meant two devices each importing
  // a fresh raw DNA file in overlapping windows would lose one side's
  // additions — Brave wrote 43 SNPs, Chrome (open all day, kept saving)
  // overwrote the relay row with its stale 40-SNP blob. Per-key CRDT
  // here means each rsID is independently last-write-wins, so cross-
  // device adds compose instead of compete. The rest of `genetics`
  // (source, importDate, coverage, mtdna) stays in DELTA_SCALARS.
  'genetics.snps',
  // Light Today daily verdict — singleton-per-day map keyed by ISO date.
  // Each device generates a verdict from its own state; the LAST one wins
  // per date (acceptable: verdicts are deterministic-ish and the user
  // owns both devices). Without this entry, Phase 2 cutover would silently
  // drop every cached daily verdict on cross-device sync.
  'lightDailyVerdicts',
];

// Singleton-shape importedData fields (scalars — null/object/string defaults
// that flip wholesale on edit). Until v1.7.6 these were the entire reason
// menstrualCycle / context cards / DNA / etc still rode the fat blob path:
// they're not enumerable as items, so no array/map planner could touch
// them. Phase 2 cutover would have silently stopped syncing all of these.
//
// Each scalar gets ONE itemRow per profile, itemId = the scalar's field
// name. Payload is `{v: scalarValue}` so the value can be any JSON
// (object, string, number, null after delete). On edit, the row updates;
// on initial null→object transition, the row inserts; on object→null the
// row tombstones (semantically: "this scalar has been cleared").
export const DELTA_SCALARS = [
  // Context cards
  'diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian',
  'stress', 'loveLife', 'environment',
  // Free-form text on the dashboard
  'interpretiveLens', 'contextNotes',
  // Domain modules
  'menstrualCycle', 'emfAssessment', 'genetics', 'biometrics',
  // `lightEnvironment` itself is NOT a scalar — its rooms/screens arrays
  // ride the per-row CRDT path via DELTA_ARRAYS' nested-path entries
  // above. Earlier draft included it here, which would have caused
  // Phase 2 cutover to ship the whole object as one row and silently
  // regress cross-device room/screen edits to wholesale-LWW.
  // BUT: `lightEnvironment.burdenAI` IS a singleton AI verdict (one per
  // user, not per-room) and needs its own scalar slot. Dotted-path
  // entries are honored by _planScalarDelta + _mergeItemRowsIntoImported
  // via getAt/setAt — same pattern as DELTA_MAPS' `genetics.snps`.
  // Without this entry, Phase 2 cutover (v: 4) silently wipes burdenAI
  // on every cross-device pull (the per-row overlay rebuilds the
  // lightEnvironment object from rooms+screens only).
  'lightEnvironment.burdenAI',
  'sunCorrelations', 'lifelightProfile', 'sunDefaults',
  // Channel-mix AI verdict — the "Your light, by what it does" synthesis
  // that reasons across 6 biological light channels. Singleton object;
  // last-write-wins across devices is fine for the same reason as
  // lightDailyVerdicts. Earlier: shipped only via the legacy fat-blob
  // path, so Phase 2 cutover (v: 4) would have silently dropped it.
  'channelMixAI',
  // Wearable L2 derived state — wearableConnections is intentionally NOT
  // listed (refresh tokens stay per-device; see stripWearableCredentials).
  'wearableSummary', 'wearableCardOrder',
];

// Per-map overrides parallel to DELTA_ARRAY_CONFIG. `keyIdFn(rawKey)`
// derives the row's itemId from the map key when the raw key isn't
// allowlist-safe; the original raw key still travels in the payload's
// `k` field, so the pull side rebuilds the map under its real key.
const DELTA_MAP_CONFIG = {
  // manualValues keys are `category.markerKey:date` — `:` fails the
  // allowlist regex. Use a doubling-escape for unambiguous synthesis:
  // each original `_` becomes `__`, then each `:` becomes a single `_`.
  // Distinct rawKeys produce distinct synth itemIds (the v1.7.5 naive
  // `:` → `_` substitution could collide for marker keys containing
  // `_`; v1.7.13 audit fix). Pull side restores the original `:`-bearing
  // key from payload.k regardless.
  manualValues: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
  // Same `category.markerKey:date` shape as manualValues — share the escape.
  markerValueNotes: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
};

// Returns the localStorage key holding the last-pushed snapshot
// (`{itemId: contentHash}`) for one (profileId, arrayName). Snapshot is
// updated only after a successful onComplete so a wedged push doesn't
// strand future deltas behind a never-cleared diff.
function _deltaSnapshotKey(profileId, arrayName) {
  return `labcharts-${profileId}-delta-${arrayName}`;
}

function _readDeltaSnapshot(profileId, arrayName) {
  try {
    const raw = localStorage.getItem(_deltaSnapshotKey(profileId, arrayName));
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}

// v1.7.16 audit fix: snapshot write is now plannedAt-gated. The
// _syncing 60s in-flight guard plus delayed onComplete writing meant
// push A planned at T=0 could have its onComplete fire at T=70s
// AFTER push B started at T=65s and already wrote its snapshot —
// A's late onComplete would clobber B's fresher view, and the next
// push would diff against A's stale state, silently skipping items
// B had already added. Stamping each plan with its planning time
// and refusing to overwrite a snapshot whose plannedAt is newer
// than this plan's closes that race.
export function _writeDeltaSnapshot(profileId, arrayName, snap, plannedAt) {
  try {
    const metaKey = `${_deltaSnapshotKey(profileId, arrayName)}-meta`;
    if (Number.isFinite(plannedAt)) {
      const prevMetaRaw = localStorage.getItem(metaKey);
      if (prevMetaRaw) {
        try {
          const m = JSON.parse(prevMetaRaw);
          if (Number.isFinite(m?.plannedAt) && m.plannedAt >= plannedAt) {
            // `>=` (not `>`) so same-millisecond plannedAt collisions don't
            // let a slow-to-onComplete A clobber a faster-to-finish B that
            // already shipped fresher items. Date.now() granularity is 1ms.
            return false;
          }
        } catch {}
      }
      localStorage.setItem(metaKey, JSON.stringify({ plannedAt }));
    }
    localStorage.setItem(_deltaSnapshotKey(profileId, arrayName), JSON.stringify(snap));
    return true;
  } catch { return false; }
}

export function clearDeltaSnapshot(profileId, arrayName) {
  try {
    localStorage.removeItem(_deltaSnapshotKey(profileId, arrayName));
    localStorage.removeItem(`${_deltaSnapshotKey(profileId, arrayName)}-meta`);
    return true;
  } catch { return false; }
}

// Stable hash for content-equality detection. djb2 — fine for our
// purpose (ferret out unchanged items so we don't re-push). Scoped
// to this module; not exported.
function _djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Defence-in-depth against prototype pollution via relay-controlled itemId
// or map key. The allowlist regex `[a-zA-Z0-9_.-]+` accepts `__proto__`,
// `constructor`, and `prototype` — all three would set Object.prototype
// when used as a map write key (`imported[arrayName]['__proto__'] = v`).
// Reject these explicitly at every itemId-from-payload path: planner
// allowlist on push, _mergeItemRowsIntoImported on pull, getDeltaCutoverReadiness
// when iterating row.itemId. Net cost: O(1) per check.
const _PROTO_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function _isAllowlistSafeId(id) {
  return typeof id === 'string'
    && id.length > 0
    && /^[a-zA-Z0-9_.-]+$/.test(id)
    && !_PROTO_POLLUTION_KEYS.has(id);
}

// Push the diff between the current array state and the last-pushed
// snapshot. Returns the candidate-new snapshot (caller commits it from
// onComplete after the blob push lands successfully).
export async function _planArrayDelta(profileId, arrayName, items) {
  const plannedAt = Date.now();
  const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
  const itemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
  const prev = _readDeltaSnapshot(profileId, arrayName);
  const next = {};
  const ops = []; // collected pending evolu mutations

  // Index existing itemRow rows for this (profile, array) so we can
  // reuse their `id` on update instead of creating phantom duplicates.
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === arrayName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  // Build [item, itemId] tuples, dropping anything whose derived itemId
  // fails _isAllowlistSafeId (covers regex + proto-pollution rejection).
  const tuples = Array.isArray(items)
    ? items.map(it => [it, itemIdFn(it)]).filter(([, id]) => _isAllowlistSafeId(id))
    : [];
  for (const [item, itemId] of tuples) {
    const json = JSON.stringify(item);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue; // unchanged — skip push

    // Compress payload the same way buildSyncPayload does — itemRow.payload
    // is a NonEmptyString, gzip+base64 envelope keeps small items tiny.
    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: when the existing row is tombstoned (user deleted
    // the item, then re-added it), evolu.update without isDeleted leaves
    // the LWW register stuck at 1 — peers keep seeing it as a delete.
    // Explicitly set isDeleted to null so the resurrect wins LWW.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: items that were in the prev snapshot but no longer in
  // the array. Skip if the row is already tombstoned, or if no row
  // exists yet (could just be a snapshot/local-storage drift on a
  // fresh device; safer to no-op than to push a phantom delete).
  // Skipped entirely for arrays flagged noTombstones — capped lists where
  // local eviction is expected and a tombstone would destroy data on a
  // peer whose window happens to still include the item.
  //
  // Tombstone-storm guard (mirrors _planKeyedMapDelta): if the array went
  // from N>=20 items to <50% of that in a single push, refuse to emit
  // tombstones. A drop that large is almost always a transient state
  // issue (mid-import, mid-pull-merge, in-progress reset) rather than
  // the user genuinely deleting half their data. Letting it through
  // would propagate a wipe to peers via the relay. Concrete cases this
  // protects: sunSessions / deviceSessions / lightAudits / lightMeasurements
  // / entries — all user-owned, append-mostly, and rarely halve in normal
  // use. Logged at warn so debug mode surfaces when it fires; the user
  // can still genuinely empty an array (do it in two steps or via
  // explicit clear-data flows that bypass the planner).
  if (!cfg.noTombstones) {
    const prevCount = Object.keys(prev).length;
    const nextCount = Object.keys(next).length;
    const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
    if (wouldEmitMassiveTombstone) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[sync] _planArrayDelta refused tombstone storm for ${arrayName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
        }
      } catch {}
    } else {
      for (const prevId of Object.keys(prev)) {
        if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
        const row = rowByItemId.get(prevId);
        if (!row || row.isDeleted) continue;
        ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
      }
    }
  }

  return { ops, next, plannedAt };
}

// Keyed-map planner. Same shape as _planArrayDelta but iterates
// Object.entries() and uses the map key (sanitized) as itemId. Payload
// is `{k, v}` so the pull side can verify the key column matches the
// payload's claimed key — same defence-in-depth as itemIdFn(item) ===
// row.itemId on the array path. Tombstones DO emit (unlike changeHistory):
// markerNote keys are user-owned, `delete state.importedData.markerNotes[k]`
// is real intent that must propagate.
export async function _planKeyedMapDelta(profileId, mapName, mapObj) {
  const plannedAt = Date.now();
  const cfg = DELTA_MAP_CONFIG[mapName] || {};
  // keyIdFn: derive itemId from raw key. Default = identity-with-allowlist
  // (rejects unsafe keys including __proto__); custom fns may sanitize
  // colons etc but every result still goes through _isAllowlistSafeId
  // below for proto-pollution defence regardless of what the cfg returns.
  const keyIdFn = typeof cfg.keyIdFn === 'function'
    ? cfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k : null));
  const prev = _readDeltaSnapshot(profileId, mapName);
  const next = {};
  const ops = [];

  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === mapName);
  const rowByItemId = new Map(matching.map(r => [r.itemId, r]));

  const obj = (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) ? mapObj : {};
  for (const [rawKey, value] of Object.entries(obj)) {
    const itemId = keyIdFn(rawKey);
    // Defence-in-depth: even if cfg.keyIdFn returns a string that passes
    // its own check, re-validate via _isAllowlistSafeId so a buggy custom
    // fn can't smuggle __proto__/constructor through.
    if (!_isAllowlistSafeId(itemId)) continue;
    if (value === null || value === undefined) continue;
    // payload.k carries the ORIGINAL key — pull side rebuilds the map
    // under that key, not the synth itemId, so consumers reading the
    // raw `category.markerKey:date` form keep working.
    const payloadObj = { k: rawKey, v: value };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[itemId] = hash;
    if (prev[itemId] === hash) continue;

    let payload = json;
    if (typeof CompressionStream !== 'undefined' && json.length > 256) {
      try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
    }
    const existing = rowByItemId.get(itemId);
    const syncedAt = new Date().toISOString();
    // v1.7.11 audit fix: resurrect a tombstoned row by explicitly clearing
    // isDeleted (otherwise the LWW register stays 1 and peers keep seeing
    // a delete). Same fix as the array planner.
    const resurrect = existing?.isDeleted ? { isDeleted: null } : {};
    if (existing) {
      ops.push({ kind: 'update', args: { id: existing.id, profileId, arrayName: mapName, itemId, payload, syncedAt, ...resurrect } });
    } else {
      ops.push({ kind: 'insert', args: { profileId, arrayName: mapName, itemId, payload, syncedAt } });
    }
  }

  // Tombstones: keys present in prev snapshot but not in current map.
  // Same conservative guard as the array path — only emit if a row
  // actually exists for that itemId, and isn't already tombstoned.
  //
  // Tombstone-storm guard: if the map went from N>=20 keys to <50% of
  // that, refuse to emit tombstones for this push. A drop that large
  // is almost always a transient state issue (mid-import, mid-pull-
  // merge, in-progress reset) rather than the user genuinely deleting
  // half their map. Letting it through would propagate a wipe to
  // peers via the relay. Concrete instance this guards against:
  // genetics.snps had 43 keys, a pull-merge race momentarily set it
  // to 0, the next save's planner emitted 43 tombstones, every other
  // device pulled the wipe and lost their genetics.snps.
  // The user can still genuinely empty a map — they just have to do
  // it in two steps (or via explicit clear-data flows that bypass the
  // planner). Logged at info so debug mode shows when it fires.
  const prevCount = Object.keys(prev).length;
  const nextCount = Object.keys(next).length;
  const wouldEmitMassiveTombstone = prevCount >= 20 && nextCount < prevCount * 0.5;
  if (wouldEmitMassiveTombstone) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[sync] _planKeyedMapDelta refused tombstone storm for ${mapName}: prev=${prevCount} next=${nextCount}. Likely transient state during pull-merge — push deferred.`);
      }
    } catch {}
  } else {
    for (const prevId of Object.keys(prev)) {
      if (Object.prototype.hasOwnProperty.call(next, prevId)) continue;
      const row = rowByItemId.get(prevId);
      if (!row || row.isDeleted) continue;
      ops.push({ kind: 'tombstone', args: { id: row.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
    }
  }

  return { ops, next, plannedAt };
}

// Scalar planner. Singleton-shape fields (menstrualCycle, context cards,
// DNA, etc) — one itemRow per scalar, itemId = the scalar's field name.
// Payload is `{v: value}` for symmetry with the map shape (and so the
// pull side can defensively check `parsed` is an object before reading).
// Tombstones emit when the scalar transitions from non-null → null/undefined
// (real user intent: "I cleared this card"); they DON'T emit on initial
// load when the scalar has always been null (no prev snapshot row exists).
export async function _planScalarDelta(profileId, scalarName, scalarValue) {
  const plannedAt = Date.now();
  const prev = _readDeltaSnapshot(profileId, scalarName);
  const next = {};
  const ops = [];

  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const matching = allItemRows.filter(r => r.profileId === profileId && r.arrayName === scalarName);
  // Only one row per scalar; if multiples slipped in (e.g. a v1.7.5-era
  // race), use the most-recently-synced as canonical so the next update
  // overwrites that one and the others naturally fade.
  const canonical = matching.length === 0
    ? null
    : matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || '')))[0];
  // Empty / null / undefined treated as absence — same posture as the
  // existing blob path, where buildSyncPayload sends null and the merger
  // treats it as "no opinion this push".
  const hasValue = scalarValue !== null && scalarValue !== undefined
    && !(typeof scalarValue === 'string' && scalarValue.length === 0);

  if (hasValue) {
    const payloadObj = { v: scalarValue };
    const json = JSON.stringify(payloadObj);
    const hash = _djb2(json);
    next[scalarName] = hash;
    if (prev[scalarName] !== hash) {
      let payload = json;
      if (typeof CompressionStream !== 'undefined' && json.length > 256) {
        try { payload = `GZ|v1|${_bytesToBase64(await _gzipString(json))}`; } catch {}
      }
      const syncedAt = new Date().toISOString();
      // v1.7.11 audit fix: resurrect after delete (object→null→object).
      // canonical may be tombstoned if the user previously cleared the
      // scalar; reusing its id without isDeleted: null leaves the LWW
      // register stuck at 1 and peers keep treating the scalar as null.
      const resurrect = canonical?.isDeleted ? { isDeleted: null } : {};
      if (canonical) {
        ops.push({ kind: 'update', args: { id: canonical.id, profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt, ...resurrect } });
      } else {
        ops.push({ kind: 'insert', args: { profileId, arrayName: scalarName, itemId: scalarName, payload, syncedAt } });
      }
    }
  } else if (prev[scalarName] && canonical && !canonical.isDeleted) {
    // non-null → null transition. Conservative tombstone — only emit if
    // we previously pushed a value (prev hash exists) AND a row actually
    // exists for it. Skips the boot-with-default-null case.
    ops.push({ kind: 'tombstone', args: { id: canonical.id, isDeleted: 1, syncedAt: new Date().toISOString() } });
  }
  return { ops, next, plannedAt };
}

// Apply the planned ops via Evolu. Called from pushProfile's onComplete
// after the fat-blob push lands.
//
// v1.7.12 audit fix: returns true only when every op succeeded. The
// caller (`onComplete`) skips the snapshot advance when this returns
// false — a partial failure used to silently advance the snapshot,
// poisoning future pushes (next push thought the failed items were
// already shipped to the relay and skipped them).
export function _applyArrayDelta(arrayName, plan) {
  const evolu = _currentEvolu();
  if (!evolu) return false;
  let allOk = true;
  for (const op of plan.ops) {
    try {
      if (op.kind === 'insert') evolu.insert("itemRow", op.args);
      else if (op.kind === 'update') evolu.update("itemRow", op.args);
      else if (op.kind === 'tombstone') evolu.update("itemRow", op.args);
    } catch (e) {
      allOk = false;
      console.warn(`[sync] delta op ${op.kind} ${arrayName} failed:`, e?.message || e);
    }
  }
  return allOk;
}

// Pull-side row-count snapshot, refreshed on every _mergeItemRowsIntoImported
// run. Used by getDeltaTelemetry / Sync diagnose so a user comparing two
// devices can see whether the relay actually replicated per-row state evenly
// (e.g. desktop sees 14 sunSession rows, phone sees 12 → relay replication
// lag, not a local merge bug). In-memory only — re-derives on every merge,
// no localStorage churn.
const _pullDeltaSnapshot = { profileId: null, perArray: {}, mergedAt: 0 };

// Pull-side: walk every itemRow for this profileId, group by arrayName,
// apply tombstones (drop matching items from imported[arrayName]) and
// upsert live payloads (replace by item.id, or push if unseen). Per-row
// state is authoritative — a tombstone here removes an item even if the
// blob still has it, and a live payload here overrides the blob's copy.
export async function _mergeItemRowsIntoImported(profileId, imported) {
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  if (!evolu || !itemRowQuery) return imported;
  const rows = evolu.getQueryRows(itemRowQuery) || [];
  const byArray = new Map();
  for (const row of rows) {
    if (!row || row.profileId !== profileId) continue;
    if (!byArray.has(row.arrayName)) byArray.set(row.arrayName, []);
    byArray.get(row.arrayName).push(row);
  }
  // Reset the pull-side telemetry snapshot for this merge — only keep
  // counts for arrays still present in the relay's row set so a profile
  // switch doesn't carry stale counts forward.
  _pullDeltaSnapshot.profileId = profileId;
  _pullDeltaSnapshot.perArray = {};
  _pullDeltaSnapshot.mergedAt = Date.now();
  const _DELTA_MAPS_SET = new Set(DELTA_MAPS);
  const _DELTA_SCALARS_SET = new Set(DELTA_SCALARS);
  for (const [arrayName, arrRows] of byArray) {
    // Scalar shape (menstrualCycle, context cards, DNA, etc) — one row
    // per scalar field. Pick the most recent live row, set
    // imported[arrayName] = parsed.v. A tombstone clears the field
    // (sets to null) — same posture the blob path had when the user
    // explicitly cleared a card.
    if (_DELTA_SCALARS_SET.has(arrayName)) {
      let live = 0, tombs = 0;
      let chosen = null;
      let chosenAt = '';
      let tombstoned = false;
      let tombstonedAt = '';
      for (const row of arrRows) {
        if (row.itemId !== arrayName) continue; // defence: ignore foreign rows in this slot
        if (row.isDeleted) {
          if (String(row.syncedAt || '') > tombstonedAt) {
            tombstoned = true;
            tombstonedAt = String(row.syncedAt || '');
          }
          tombs++;
          continue;
        }
        try {
          let json = row.payload;
          if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
            if (typeof DecompressionStream === 'undefined') continue;
            json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
          }
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object') continue;
          // Prefer the most-recently-synced live row when multiples exist.
          const ts = String(row.syncedAt || '');
          if (ts > chosenAt) { chosen = parsed; chosenAt = ts; }
          live++;
        } catch {}
      }
      // Latest write wins between live + tombstone — tombstone only
      // overwrites when its syncedAt is at-or-newer than the chosen
      // live row (otherwise an old delete would obliterate a fresh edit).
      const isNestedScalar = arrayName.includes('.');
      if (tombstoned && tombstonedAt >= chosenAt) {
        // Symmetric snps preservation — the live branch below restores
        // imported.genetics.snps when the map merge ran first; the
        // tombstone branch needs the same guard or `genetics.snps` rows
        // get silently wiped whenever the per-row map merger happens to
        // run before this scalar branch (byArray iteration order is
        // determined by relay row ordering, so it's racy). Concrete
        // failure mode: device imports DNA, deletes it, re-imports —
        // the in-flight delete tombstone has a later syncedAt than the
        // re-import scalar update on a peer, the peer's map branch
        // populates 41 snps under imported.genetics, then this scalar
        // branch wipes imported.genetics = null. End state: peer shows
        // null genetics despite 41 live snps rows on the relay. This
        // guard keeps the per-row layer's snps independent.
        if (arrayName === 'genetics'
            && imported.genetics && typeof imported.genetics === 'object'
            && imported.genetics.snps && typeof imported.genetics.snps === 'object'
            && Object.keys(imported.genetics.snps).length > 0) {
          imported.genetics = { snps: imported.genetics.snps };
        } else if (isNestedScalar) {
          // Dotted-path scalar tombstone clears just the leaf, not the
          // parent — sibling fields (e.g. lightEnvironment.rooms) keep
          // riding their own DELTA_ARRAYS path independently.
          setAt(imported, arrayName, null);
        } else {
          imported[arrayName] = null;
        }
      } else if (chosen) {
        // Preserve nested fields owned by a DELTA_MAPS dotted path —
        // the scalar payload is metadata-only by contract, so a remote
        // scalar must not blow away the local map. The dotted-path
        // map merger that runs after this loop is authoritative for
        // those fields. Concrete instance: `genetics.snps` is a
        // DELTA_MAPS entry; the `genetics` scalar row carries source/
        // importDate/coverage/mtdna only. Restoring snps here keeps
        // the per-row layer's prior state intact for the moment until
        // the map branch below runs and re-applies the relay's rows.
        if (arrayName === 'genetics'
            && imported.genetics && typeof imported.genetics === 'object'
            && imported.genetics.snps && typeof imported.genetics.snps === 'object') {
          const localSnps = imported.genetics.snps;
          imported.genetics = chosen.v;
          if (imported.genetics && typeof imported.genetics === 'object') {
            imported.genetics.snps = localSnps;
          }
        } else if (isNestedScalar) {
          // Dotted-path scalar write — only the leaf, not the parent.
          setAt(imported, arrayName, chosen.v);
        } else {
          imported[arrayName] = chosen.v;
        }
      }
      _pullDeltaSnapshot.perArray[arrayName] = { live, tombstones: tombs };
      continue;
    }
    // Keyed-map shape (markerNotes etc) reconstructs an object, not an
    // array. Same itemRow source, different output container — payload
    // carries `{k, v}` so we can verify the row's itemId column matches
    // what the payload claims (defence-in-depth against a relay swapping
    // payloads between rows).
    if (_DELTA_MAPS_SET.has(arrayName)) {
      // Dotted-path support — same getAt/setAt walk as the array path.
      // Required for entries like `genetics.snps` so per-key CRDT lands
      // in the nested object instead of clobbering it as a top-level
      // sibling. Defaults to flat for the common case.
      const isNestedMap = arrayName.includes('.');
      const readMap = () => isNestedMap ? getAt(imported, arrayName) : imported[arrayName];
      const writeMap = (v) => isNestedMap ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
      let curMap = readMap();
      if (!curMap || typeof curMap !== 'object' || Array.isArray(curMap)) {
        // Object.create(null) (no Object.prototype chain) so a relay-
        // controlled key like '__proto__' that somehow slipped past the
        // _isAllowlistSafeId checks below would be a regular property
        // write, not a prototype-pollution sink. Defence-in-depth.
        curMap = Object.create(null);
        writeMap(curMap);
      }
      // Same keyIdFn as push so synth-id maps verify correctly. Default
      // (identity-with-allowlist) collapses to `parsed.k === row.itemId`
      // for the markerNotes / customMarkers case. Wrapped with
      // _isAllowlistSafeId so a misbehaving cfg.keyIdFn can't bypass
      // the proto-pollution rejection.
      const mapCfg = DELTA_MAP_CONFIG[arrayName] || {};
      const rawKeyIdFn = typeof mapCfg.keyIdFn === 'function'
        ? mapCfg.keyIdFn
        : (k => (_isAllowlistSafeId(k) ? k : null));
      const keyIdFn = (k) => { const id = rawKeyIdFn(k); return _isAllowlistSafeId(id) ? id : null; };
      // Build a tombstone-key set first so deletes can find the original
      // raw key in the current map even when the row only carries the
      // synth itemId (synth-id maps don't preserve the original key on
      // the row itself — it's only in the payload).
      const liveByRawKey = new Map(); // rawKey → { v, syncedAt }
      const tombItemIds = new Set();
      for (const row of arrRows) {
        if (row.isDeleted) { tombItemIds.add(row.itemId); continue; }
        try {
          let json = row.payload;
          if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
            if (typeof DecompressionStream === 'undefined') continue;
            json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
          }
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
          // Defence-in-depth: re-derive itemId from the payload's claimed
          // k and verify it matches the row column. Catches a relay
          // swapping payloads between rows even for synth-id maps.
          if (keyIdFn(parsed.k) !== row.itemId) continue;
          // Iteration-order tiebreak hardening (mirrors the array path):
          // when two devices race a same-key edit, prefer the row with the
          // newer relay-stamped syncedAt over whichever happened to come
          // last in the unordered SQLite scan.
          const sa = String(row.syncedAt || '');
          const cur = liveByRawKey.get(parsed.k);
          if (!cur || sa >= cur.syncedAt) {
            liveByRawKey.set(parsed.k, { v: parsed.v, syncedAt: sa });
          }
        } catch {}
      }
      // Apply tombstones: walk current map keys, drop any whose synth
      // itemId is in the tombstone set. Skips entries that just happened
      // to be re-inserted in this batch (liveByRawKey wins via overwrite).
      if (tombItemIds.size > 0) {
        for (const k of Object.keys(curMap)) {
          if (liveByRawKey.has(k)) continue;
          const synth = keyIdFn(k);
          if (synth && tombItemIds.has(synth)) delete curMap[k];
        }
      }
      // Apply live entries under their ORIGINAL key (preserves the `:`
      // for manualValues etc — consumers read the raw key, not the synth).
      // Defence-in-depth: even though the synth itemId path validates via
      // _isAllowlistSafeId, the raw `parsed.k` is what we WRITE to curMap.
      // For synth-id maps like manualValues, keyIdFn('__proto__') returns
      // '____proto____' (doubling-escape) which IS allowlist-safe, so a
      // hostile relay row could carry parsed.k='__proto__' through every
      // earlier check and reach this write. Reject at the assignment site
      // — the cost is one Set.has per live entry; the win is closing a
      // prototype-pollution sink on imported.manualValues.
      for (const [rawKey, entry] of liveByRawKey) {
        if (_PROTO_POLLUTION_KEYS.has(rawKey)) continue;
        curMap[rawKey] = entry.v;
      }
      _pullDeltaSnapshot.perArray[arrayName] = { live: liveByRawKey.size, tombstones: tombItemIds.size };
      continue;
    }
    // Read/write the target array — flat top-level for most surfaces,
    // dotted-path walk via getAt/setAt for nested ones (e.g.
    // `lightEnvironment.rooms`). Same code path either way so we don't
    // bifurcate the merger.
    const isNested = arrayName.includes('.');
    const readArr = () => isNested ? getAt(imported, arrayName) : imported[arrayName];
    const writeArr = (v) => isNested ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
    let curArr = readArr();
    if (!Array.isArray(curArr)) { curArr = []; writeArr(curArr); }
    // Same itemId derivation push side used. For arrays without `.id`
    // (composite-keyed like changeHistory) this matches the synth-id
    // path so replace-or-insert finds the right slot instead of always
    // appending and silently doubling. Wrap the itemIdFn so any result
    // failing _isAllowlistSafeId becomes null (proto-pollution defence)
    // even if a future cfg.itemIdFn returned __proto__ for some reason.
    const cfg = DELTA_ARRAY_CONFIG[arrayName] || {};
    const rawItemIdFn = typeof cfg.itemIdFn === 'function' ? cfg.itemIdFn : (it => (it && typeof it.id === 'string' ? it.id : null));
    const itemIdFn = (it) => { const id = rawItemIdFn(it); return _isAllowlistSafeId(id) ? id : null; };
    // Seed the tombstone set with the local blob's `_deleted[path]` list
    // BEFORE walking relay rows. The blob and per-row datapaths run in
    // parallel under Phase 1 dual-write, and a peer that hadn't pulled
    // our delete yet may push the row back as live — without this seed,
    // a deleted-here-then-pushed-back-by-peer item resurrects locally
    // because the relay row carries isDeleted=0 and the per-row merge
    // re-inserts it. Trust local user intent: if the deletion is in the
    // blob, the item stays dropped on this device until our own
    // tombstone push lands and the peer applies it.
    const tombs = new Set();
    try {
      const localDel = imported && imported._deleted;
      const localList = localDel && Array.isArray(localDel[arrayName]) ? localDel[arrayName] : null;
      if (localList) for (const id of localList) if (typeof id === 'string') tombs.add(id);
    } catch {}
    const liveById = new Map(); // itemId → { item, ts, syncedAt }
    for (const row of arrRows) {
      if (row.isDeleted) { tombs.add(row.itemId); continue; }
      try {
        let json = row.payload;
        if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
          if (typeof DecompressionStream === 'undefined') continue;
          json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
        }
        const item = JSON.parse(json);
        // Verify the payload's derived itemId matches the row column —
        // catches a compromised relay swapping payloads between rows.
        if (item && typeof item === 'object' && itemIdFn(item) === row.itemId) {
          // When a cross-device race produces multiple itemRow rows for the
          // same itemId (each device wrote its own row before seeing the
          // other), iteration-order winners can silently undo a stop / edit
          // — e.g. a freshly-stopped sun session loses to a still-active
          // copy from another device. Pick the higher embedded timestamp
          // first (mirrors data-merge.js unionById), syncedAt as secondary
          // tiebreak so two rows with identical embedded ts don't ping-pong.
          const ts = pickTimestamp(item);
          const sa = String(row.syncedAt || '');
          const cur = liveById.get(row.itemId);
          if (!cur || ts > cur.ts || (ts === cur.ts && sa > cur.syncedAt)) {
            liveById.set(row.itemId, { item, ts, syncedAt: sa });
          }
        }
      } catch {}
    }
    // Apply tombstones (drop) + live (replace or insert). Both sides key
    // on itemIdFn so changeHistory finds existing entries by their
    // synthesized field|date id rather than appending duplicates.
    let nextArr = curArr.filter(it => !tombs.has(itemIdFn(it)));
    // Dedup `nextArr` by itemIdFn BEFORE the liveById overlay. The blob
    // LWW merge can leave two items collapsing to the same synth itemId
    // (e.g. two chatSummaries on the same threadId carried from a peer).
    // The earlier code's `seen` Map only retained the LAST position, so
    // liveById would overwrite that slot but the EARLIER duplicate stayed
    // in nextArr untouched. End state: one stale duplicate per cross-
    // device race that the next push then re-emits as state truth. Keep
    // the FIRST occurrence and drop the rest — the live overlay below
    // will replace it with the relay-authoritative version anyway.
    const seen = new Map();
    nextArr = nextArr.filter((it, i) => {
      const k = itemIdFn(it);
      if (k == null) return true; // unkeyed items kept (legacy/no-id case)
      if (seen.has(k)) return false; // drop duplicate
      seen.set(k, i);
      return true;
    });
    // Re-index after the dedup filter so seen.get(itemId) maps to the
    // correct position in the trimmed nextArr.
    seen.clear();
    for (let i = 0; i < nextArr.length; i++) {
      const k = itemIdFn(nextArr[i]);
      if (k != null) seen.set(k, i);
    }
    for (const [itemId, entry] of liveById) {
      // Honour blob tombstones seeded above — a peer that pushed the row
      // back as live before pulling our delete would otherwise resurrect
      // it here via nextArr.push.
      if (tombs.has(itemId)) continue;
      const item = entry.item;
      const idx = seen.get(itemId);
      if (idx !== undefined) nextArr[idx] = item;
      else nextArr.push(item);
    }
    writeArr(nextArr);
    // v1.7.12 audit fix: re-apply COMPOSITE_KEYED_ARRAYS cap after the
    // per-row overlay. mergeImportedData (the blob path) caps automatically,
    // but v4 cutover skips the blob merge entirely — without this re-cap,
    // changeHistory would grow past 200 entries on a v4 device because
    // `noTombstones: true` means the relay accumulates rows forever and
    // the pull replays all of them. Sort by timestamp (newest first via
    // pickTimestamp-equivalent inline) and trim to cap.
    const cap = COMPOSITE_KEYED_ARRAYS.find(c => c.path === arrayName)?.cap;
    if (cap && imported[arrayName].length > cap) {
      imported[arrayName].sort((a, b) => {
        const ta = a?.updatedAt ?? a?.createdAt ?? a?.at ?? (typeof a?.date === 'string' ? Date.parse(a.date) : 0) ?? 0;
        const tb = b?.updatedAt ?? b?.createdAt ?? b?.at ?? (typeof b?.date === 'string' ? Date.parse(b.date) : 0) ?? 0;
        return tb - ta;
      });
      imported[arrayName] = imported[arrayName].slice(0, cap);
    }
    _pullDeltaSnapshot.perArray[arrayName] = { live: liveById.size, tombstones: tombs.size };
  }
  return imported;
}

// ═══════════════════════════════════════════════
// PHASE 1 DELTA TELEMETRY (observability for cutover decision)
// ═══════════════════════════════════════════════
//
// Phase 2 of the CRDT-delta refactor (drop blob writes entirely) is gated
// on ≥2 weeks of cross-device bake under real traffic with the per-row
// datapath proven healthy. "Healthy" = (a) per-push delta payload is a
// small fraction of the blob (proves we're not double-shipping the same
// content), and (b) every device's local Evolu DB shows the same per-array
// row counts (proves relay replication is propagating per-row state, not
// just blob updates). This module records both signals to localStorage
// and surfaces them in the Sync diagnose modal — no telemetry leaves the
// device, no extra network I/O. When the ratio sits at <0.05 across N
// devices and per-array counts converge, Phase 2 is safe to ship.

const _DELTA_TELEMETRY_CAP = 50; // last-N pushes; ~6 KB at p99 entry size
function _deltaTelemetryKey(profileId) {
  return `labcharts-${profileId}-delta-telemetry`;
}
function _readDeltaTelemetry(profileId) {
  try {
    const raw = localStorage.getItem(_deltaTelemetryKey(profileId));
    return raw ? (JSON.parse(raw) || { pushes: [] }) : { pushes: [] };
  } catch { return { pushes: []  }; }
}
export function _recordPushTelemetry(profileId, blobBytes, deltaPlans) {
  if (!profileId) return;
  const perArray = {};
  let totalDeltaBytes = 0;
  let totalOps = 0;
  for (const { arrayName, plan } of deltaPlans) {
    let ins = 0, upd = 0, tom = 0, bytes = 0;
    for (const op of plan.ops) {
      if (op.kind === 'insert') ins++;
      else if (op.kind === 'update') upd++;
      else if (op.kind === 'tombstone') tom++;
      bytes += (op.args?.payload || '').length;
    }
    perArray[arrayName] = { ins, upd, tom, bytes };
    totalDeltaBytes += bytes;
    totalOps += plan.ops.length;
  }
  const entry = { at: Date.now(), blobBytes: blobBytes | 0, totalDeltaBytes, totalOps, perArray };
  try {
    const cur = _readDeltaTelemetry(profileId);
    cur.pushes.push(entry);
    if (cur.pushes.length > _DELTA_TELEMETRY_CAP) cur.pushes.splice(0, cur.pushes.length - _DELTA_TELEMETRY_CAP);
    localStorage.setItem(_deltaTelemetryKey(profileId), JSON.stringify(cur));
  } catch {}
}
// Public read accessor — returns recent pushes + latest pull-side row
// counts for the active profile. Pull snapshot is in-memory (re-derived
// every merge), pushes persist across reloads.
export function getDeltaTelemetry(profileId) {
  if (!profileId) return null;
  const t = _readDeltaTelemetry(profileId);
  const pushes = Array.isArray(t.pushes) ? t.pushes : [];
  // Aggregate over the last N pushes for the diagnose summary row.
  let aggBlob = 0, aggDelta = 0, aggOps = 0;
  for (const p of pushes) {
    aggBlob += p.blobBytes || 0;
    aggDelta += p.totalDeltaBytes || 0;
    aggOps += p.totalOps || 0;
  }
  const ratio = aggBlob > 0 ? aggDelta / aggBlob : 0;
  return {
    pushes,
    pull: _pullDeltaSnapshot.profileId === profileId
      ? { perArray: { ..._pullDeltaSnapshot.perArray }, mergedAt: _pullDeltaSnapshot.mergedAt }
      : { perArray: {}, mergedAt: 0 },
    summary: { count: pushes.length, totalBlobBytes: aggBlob, totalDeltaBytes: aggDelta, totalOps: aggOps, ratio },
  };
}
export function resetDeltaTelemetry(profileId) {
  if (!profileId) return false;
  try { localStorage.removeItem(_deltaTelemetryKey(profileId)); return true; } catch { return false; }
}

// ═══════════════════════════════════════════════
// PHASE 2 CUTOVER READINESS (v1.7.9)
// ═══════════════════════════════════════════════
//
// Once cross-device bake completes (≥2 weeks of real traffic on v1.7.0+),
// dropping the fat-blob writes is a one-line change in buildSyncPayload.
// This check is the hard gate before that flip — it surveys every
// DELTA_ARRAYS / DELTA_MAPS / DELTA_SCALARS field for the active profile
// and reports whether each surface that has LOCAL data also has at least
// one corresponding itemRow in this device's Evolu DB. If any surface
// has data locally but no per-row row, the per-row datapath isn't
// carrying that surface yet — flipping Phase 2 would silently lose it.
//
// Returns a structured `{ ready: bool, surfaces: { [name]: { localCount,
// rowCount, status } } }` so the caller can render a per-surface table.
// status values: 'ok' (data on both sides), 'no-data' (nothing locally,
// nothing to verify), 'missing-rows' (local data exists but no rows
// shipped — BLOCKER), 'rows-only' (rows exist but no local data —
// fine: another device pushed, this one hasn't synced or had it).
export function getDeltaCutoverReadiness(profileId, importedData) {
  if (!profileId) return { ready: false, error: 'no-profile', surfaces: {} };
  if (!importedData) importedData = state.importedData || {};
  const surfaces = {};
  let blockers = 0;

  // Index existing itemRow rows for this profile so each surface check
  // is a Map lookup, not an O(n) scan.
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  const rowsByName = new Map();
  for (const r of allItemRows) {
    if (!r || r.profileId !== profileId) continue;
    if (!rowsByName.has(r.arrayName)) rowsByName.set(r.arrayName, []);
    rowsByName.get(r.arrayName).push(r);
  }

  function classify(name, localCount, rowCount) {
    let status;
    if (localCount === 0 && rowCount === 0) status = 'no-data';
    else if (localCount > 0 && rowCount === 0) { status = 'missing-rows'; blockers++; }
    else if (localCount === 0 && rowCount > 0) status = 'rows-only';
    else status = 'ok';
    surfaces[name] = { shape: undefined, localCount, rowCount, status };
  }

  for (const arrayName of DELTA_ARRAYS) {
    // Honor nested paths the same way the planner + merger do.
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    const rows = (rowsByName.get(arrayName) || []).filter(r => !r.isDeleted);
    classify(arrayName, items.length, rows.length);
    surfaces[arrayName].shape = 'array';
  }
  for (const mapName of DELTA_MAPS) {
    // Dotted-path entries (e.g. `genetics.snps`) walk via getAt so the
    // readiness check counts the nested map, not a flat top-level
    // sibling that doesn't exist. Without this, the gate would always
    // report `localCount=0` for nested maps and silently pass even
    // when the cutover would drop genuine data.
    const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
    const localCount = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? Object.keys(obj).length : 0;
    const rows = (rowsByName.get(mapName) || []).filter(r => !r.isDeleted);
    classify(mapName, localCount, rows.length);
    surfaces[mapName].shape = 'map';
  }
  for (const scalarName of DELTA_SCALARS) {
    // Dotted-path scalars walk via getAt so nested entries
    // (e.g. `lightEnvironment.burdenAI`) report local-presence accurately.
    const v = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    const hasValue = v !== null && v !== undefined && !(typeof v === 'string' && v.length === 0);
    const rows = (rowsByName.get(scalarName) || []).filter(r => !r.isDeleted);
    classify(scalarName, hasValue ? 1 : 0, rows.length);
    surfaces[scalarName].shape = 'scalar';
  }

  return {
    ready: blockers === 0,
    blockerCount: blockers,
    surfaceCount: Object.keys(surfaces).length,
    surfaces,
  };
}
