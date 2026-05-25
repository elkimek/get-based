// sync-delta-registry.js - Per-row sync surfaces and identity helpers.

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
export const DELTA_ARRAY_CONFIG = {
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
export const DELTA_MAP_CONFIG = {
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

// Stable hash for content-equality detection. djb2 — fine for our
// purpose (ferret out unchanged items so we don't re-push).
export function _djb2(str) {
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
export function _isProtoPollutionKey(id) {
  return _PROTO_POLLUTION_KEYS.has(id);
}

export function _isAllowlistSafeId(id) {
  return typeof id === 'string'
    && id.length > 0
    && /^[a-zA-Z0-9_.-]+$/.test(id)
    && !_isProtoPollutionKey(id);
}
