// @ts-check
// sync-delta-surface-config.js - Per-surface itemId/keyId overrides.

import { _djb2, _isAllowlistSafeId } from './sync-delta-id.js';

function unsafeMapKeyToHexId(rawKey, prefix) {
  if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
  if (_isAllowlistSafeId(rawKey)) return rawKey;
  let hex = '';
  for (let i = 0; i < rawKey.length; i++) hex += rawKey.charCodeAt(i).toString(16).padStart(4, '0');
  return `${prefix}${hex}`;
}

// Per-array overrides for arrays that do not fit the default
// `it.id` / tombstone-on-removal contract.
export const DELTA_ARRAY_CONFIG = {
  // changeHistory uses either the context `{ field, date }` shape or a
  // wearable anomaly `{ type, source, metricId, kind, ts }` shape. Both need
  // stable ids so explicit privacy deletions can survive cross-device sync.
  changeHistory: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      if (it.field && it.date) {
        const ts = Date.parse(it.date);
        return Number.isFinite(ts)
          ? `${it.field}.${ts}`.replace(/[^a-zA-Z0-9_.-]/g, '_')
          : null;
      }
      if (it.type !== 'wearable' || !it.source || !it.metricId) return null;
      const rawTs = typeof it.ts === 'number' ? it.ts : Date.parse(it.ts || '');
      const eventKey = Number.isFinite(rawTs)
        ? rawTs
        : _djb2([it.from || '', it.to || '', it.message || ''].join('|'));
      const sig = [it.source, it.metricId, it.kind || '', eventKey].join('|');
      return `wh_${_djb2(sig)}`;
    },
    // Array-cap eviction is maintenance, not user intent. Explicit deletion
    // records blob tombstones directly; snapshot diffs must not infer them.
    noTombstones: true,
  },
  // No lightMeasurements override on purpose: automatic per-row tombstones
  // are the Phase 2 carrier for superseded/deleted measurements.
  // Lab entries are date-unique and have no `.id`.
  entries: {
    itemIdFn: (it) => (it && typeof it.date === 'string' && _isAllowlistSafeId(it.date)) ? it.date : null,
  },
  // Import snapshots are user-visible per-file records with stable `id`s.
  // Keep them in the configured set so blob merge and row overlay share the
  // same tombstone-aware identity semantics.
  importSnapshots: {
    itemIdFn: (it) => (it && typeof it.id === 'string' && _isAllowlistSafeId(it.id)) ? it.id : null,
  },
  // V2 supplements carry a stable `.id`. Legacy records keep the original
  // deterministic natural key so old/new clients address the same sync row.
  supplements: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      if (typeof it.id === 'string' && _isAllowlistSafeId(it.id)) return it.id;
      const sig = `${it.name || ''}|${it.startDate || ''}|${it.type || ''}`;
      return sig === '||' ? null : `s_${_djb2(sig)}`;
    },
  },
  healthGoals: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.text) return null;
      return `g_${_djb2(it.text)}`;
    },
  },
  notes: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
      const sig = `${it.date || ''}|${it.text || ''}`;
      return sig === '|' ? null : `n_${_djb2(sig)}`;
    },
  },
  // Use threadId so independently generated summaries for the same thread
  // collapse to one cross-device LWW row.
  chatSummaries: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.threadId) return null;
      return `cs_${_djb2(String(it.threadId))}`;
    },
  },
};

// Per-map overrides parallel to DELTA_ARRAY_CONFIG. `keyIdFn(rawKey)`
// derives the row's itemId from the map key when the raw key is not
// allowlist-safe; the original raw key still travels in payload.k.
export const DELTA_MAP_CONFIG = {
  // manualValues keys are `category.markerKey:date`; `:` fails the
  // allowlist regex. Doubling `_` before replacing `:` prevents collisions.
  manualValues: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
  markerValueNotes: {
    keyIdFn: (rawKey) => {
      if (typeof rawKey !== 'string' || rawKey.length === 0) return null;
      const safe = rawKey.replace(/_/g, '__').replace(/:/g, '_');
      return /^[a-zA-Z0-9_.-]+$/.test(safe) ? safe : null;
    },
  },
  // Stable marker IDs contain `:`. Encode them into a collision-free safe row
  // ID while retaining the original marker ID in payload.k.
  markerPlacements: {
    keyIdFn: (rawKey) => unsafeMapKeyToHexId(rawKey, 'mpl_'),
  },
  contextSourceSettings: {
    keyIdFn: (rawKey) => unsafeMapKeyToHexId(rawKey, 'ctxu_'),
  },
};
