import { createDeltaQueryAccess } from './sync-delta-observability-context.js';
import type { DeltaQueryOptions } from './sync-delta-observability-context.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-merge.js - Pull-side per-row delta merge overlay.

import { resetPullDeltaSnapshot } from './sync-delta-pull-snapshot.js';
import { DELTA_MAPS, DELTA_SCALARS } from './sync-delta-surfaces.js';
import { getAt } from './data-merge.js';
import { mergeArrayRowsIntoImported } from './sync-delta-array-merge.js';
import { mergeMapRowsIntoImported } from './sync-delta-map-merge.js';
import { mergeScalarRowsIntoImported } from './sync-delta-scalar-merge.js';

const mergeQueryAccess = createDeltaQueryAccess();

export function configureSyncDeltaMerge({ getEvolu, getItemRowQuery }: DeltaQueryOptions = {}) {
  mergeQueryAccess.configure({ getEvolu, getItemRowQuery });
}

function _currentEvolu() {
  return mergeQueryAccess.currentEvolu();
}

function _currentItemRowQuery() {
  return mergeQueryAccess.currentItemRowQuery();
}

// Pull-side row overlay. A newer canonical profile blob can bound stale
// array tombstones left in an old replica after compaction.
export async function _mergeItemRowsIntoImported<Data extends DeltaImportedData>(
  profileId: unknown, imported: Data,
  options: { baselineImported?: unknown; baselineSyncedAt?: number | undefined } = {},
): Promise<Data> {
  const evolu = _currentEvolu();
  const itemRowQuery = _currentItemRowQuery();
  if (!evolu || !itemRowQuery) return imported;
  const rows = evolu.getQueryRows(itemRowQuery) || [];
  const byArray = new Map<string | undefined, DeltaItemRow[]>();
  for (const row of rows) {
    if (!row || row.profileId !== profileId) continue;
    if (!byArray.has(row.arrayName)) byArray.set(row.arrayName, []);
    byArray.get(row.arrayName)!.push(row);
  }
  // Reset the pull-side telemetry snapshot for this merge — only keep
  // counts for arrays still present in the relay's row set so a profile
  // switch doesn't carry stale counts forward.
  resetPullDeltaSnapshot(profileId);
  const _DELTA_MAPS_SET = new Set(DELTA_MAPS);
  const _DELTA_SCALARS_SET = new Set(DELTA_SCALARS);
  for (const [arrayName, arrRows] of byArray) {
    if (_DELTA_SCALARS_SET.has(arrayName!)) {
      const baselineValue = options.baselineImported
        ? getAt(options.baselineImported, arrayName)
        : undefined;
      await mergeScalarRowsIntoImported(imported, arrayName!, arrRows, {
        hasBaseline: baselineValue !== undefined,
        baselineSyncedAt: options.baselineSyncedAt,
      });
      continue;
    }
    if (_DELTA_MAPS_SET.has(arrayName!)) {
      await mergeMapRowsIntoImported(imported, arrayName!, arrRows);
      continue;
    }
    const baselineItems = options.baselineImported
      ? getAt(options.baselineImported, arrayName)
      : null;
    await mergeArrayRowsIntoImported(imported, arrayName!, arrRows, {
      baselineItems: Array.isArray(baselineItems) ? baselineItems : [],
      baselineSyncedAt: options.baselineSyncedAt,
    });
  }
  return imported;
}
