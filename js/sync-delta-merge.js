// @ts-check
// sync-delta-merge.js - Pull-side per-row delta merge overlay.

import { resetPullDeltaSnapshot } from './sync-delta-observability.js';
import { DELTA_MAPS, DELTA_SCALARS } from './sync-delta-registry.js';
import { getAt } from './data-merge.js';
import {
  mergeArrayRowsIntoImported, mergeMapRowsIntoImported, mergeScalarRowsIntoImported,
} from './sync-delta-merge-shapes.js';

/** @type {() => any} */
let _getEvolu = () => null;
/** @type {() => any} */
let _getItemRowQuery = () => null;

/** @param {{ getEvolu?: () => any, getItemRowQuery?: () => any }} [deps] */
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

// Pull-side row overlay. A newer canonical profile blob can bound stale
// array tombstones left in an old replica after compaction.
/** @param {{ baselineImported?: any, baselineSyncedAt?: number }} [options] */
export async function _mergeItemRowsIntoImported(profileId, imported, options = {}) {
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
      const baselineValue = options.baselineImported
        ? getAt(options.baselineImported, arrayName)
        : undefined;
      await mergeScalarRowsIntoImported(imported, arrayName, arrRows, {
        hasBaseline: baselineValue !== undefined,
        baselineSyncedAt: options.baselineSyncedAt,
      });
      continue;
    }
    if (_DELTA_MAPS_SET.has(arrayName)) {
      await mergeMapRowsIntoImported(imported, arrayName, arrRows);
      continue;
    }
    const baselineItems = options.baselineImported
      ? getAt(options.baselineImported, arrayName)
      : null;
    await mergeArrayRowsIntoImported(imported, arrayName, arrRows, {
      baselineItems: Array.isArray(baselineItems) ? baselineItems : [],
      baselineSyncedAt: options.baselineSyncedAt,
    });
  }
  return imported;
}
