// sync-delta-merge.js - Pull-side per-row delta merge overlay.

import { resetPullDeltaSnapshot } from './sync-delta-observability.js';
import { DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
import {
  mergeArrayRowsIntoImported, mergeMapRowsIntoImported, mergeScalarRowsIntoImported,
} from './sync-delta-merge-shapes.js';

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
    if (_DELTA_SCALARS_SET.has(arrayName)) {
      await mergeScalarRowsIntoImported(imported, arrayName, arrRows);
      continue;
    }
    if (_DELTA_MAPS_SET.has(arrayName)) {
      await mergeMapRowsIntoImported(imported, arrayName, arrRows);
      continue;
    }
    await mergeArrayRowsIntoImported(imported, arrayName, arrRows);
  }
  return imported;
}
