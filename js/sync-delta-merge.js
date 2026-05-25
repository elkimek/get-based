// sync-delta-merge.js - Pull-side per-row delta merge overlay.

import { COMPOSITE_KEYED_ARRAYS, pickTimestamp, getAt, setAt } from './data-merge.js';
import { _base64ToBytes, _gunzipToStringCapped } from './sync-payload.js';
import {
  recordPullDeltaSurface, resetPullDeltaSnapshot,
} from './sync-delta-observability.js';
import {
  DELTA_ARRAY_CONFIG, DELTA_MAP_CONFIG, DELTA_MAPS, DELTA_SCALARS,
  _isAllowlistSafeId, _isProtoPollutionKey,
} from './sync-delta-registry.js';

let _getEvolu = () => null;
let _getItemRowQuery = () => null;

export function configureSyncDeltaMerge({ getEvolu, getItemRowQuery } = {}) {
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
}

function _currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

function _currentItemRowQuery() {
  try { return _getItemRowQuery?.() || null; } catch { return null; }
}

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
  resetPullDeltaSnapshot(profileId);
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
      recordPullDeltaSurface(arrayName, { live, tombstones: tombs });
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
      // — the cost is one predicate call per live entry; the win is
      // closing a prototype-pollution sink on imported.manualValues.
      for (const [rawKey, entry] of liveByRawKey) {
        if (_isProtoPollutionKey(rawKey)) continue;
        curMap[rawKey] = entry.v;
      }
      recordPullDeltaSurface(arrayName, { live: liveByRawKey.size, tombstones: tombItemIds.size });
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
    const cappedArr = readArr();
    if (cap && cappedArr.length > cap) {
      const trimmed = cappedArr.slice().sort((a, b) => {
        const ta = a?.updatedAt ?? a?.createdAt ?? a?.at ?? (typeof a?.date === 'string' ? Date.parse(a.date) : 0) ?? 0;
        const tb = b?.updatedAt ?? b?.createdAt ?? b?.at ?? (typeof b?.date === 'string' ? Date.parse(b.date) : 0) ?? 0;
        return tb - ta;
      });
      writeArr(trimmed.slice(0, cap));
    }
    recordPullDeltaSurface(arrayName, { live: liveById.size, tombstones: tombs.size });
  }
  return imported;
}
