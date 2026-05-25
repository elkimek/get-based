// sync-delta-surface-config.js - Per-surface itemId/keyId overrides.

import { _djb2, _isAllowlistSafeId } from './sync-delta-id.js';

// Per-array overrides for arrays that do not fit the default
// `it.id` / tombstone-on-removal contract.
export const DELTA_ARRAY_CONFIG = {
  // changeHistory entries are { field, date, snapshot, ... } with no `id`.
  // Synthesize a stable itemId from the same composite key data-merge.js
  // uses (`field|date`), but encoded in the allowlist alphabet.
  changeHistory: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object' || !it.field || !it.date) return null;
      const ts = Date.parse(it.date);
      if (!Number.isFinite(ts)) return null;
      return `${it.field}.${ts}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    },
    noTombstones: true,
  },
  // No lightMeasurements override on purpose: automatic per-row tombstones
  // are the Phase 2 carrier for superseded/deleted measurements.
  // Lab entries are date-unique and have no `.id`.
  entries: {
    itemIdFn: (it) => (it && typeof it.date === 'string' && _isAllowlistSafeId(it.date)) ? it.date : null,
  },
  // Supplements have no `.id`; hash stable identity fields so identical
  // pre-existing data derives the same itemId on each device.
  supplements: {
    itemIdFn: (it) => {
      if (!it || typeof it !== 'object') return null;
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
};
