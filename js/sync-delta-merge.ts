import {PROFILE_METADATA_SURFACE} from './sync-profile-metadata.js';
import { createDeltaQueryAccess } from './sync-delta-observability-context.js';
import type { DeltaQueryOptions } from './sync-delta-observability-context.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-merge.js - Pull-side per-row delta merge overlay.

import { resetPullDeltaSnapshot } from './sync-delta-pull-snapshot.js';
import { DELTA_MAPS, DELTA_SCALARS } from './sync-delta-surfaces.js';
import { getAt } from './data-merge.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';
import { _djb2 } from './sync-delta-id.js';
import {scalarValueHash, readScalarVersion, writeScalarVersion} from './sync-scalar-snapshot.js';
import type {ScalarVersions} from './sync-scalar-snapshot.js';
import { _readDeltaSnapshot, _writeDeltaSnapshot } from './sync-delta-snapshot.js';
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

/** A durable pull also acknowledges a scalar's value. Without this, a device
 * which only received that value mistakes it for a local edit on its next
 * unrelated save. Never acknowledge a local edit that differs from the actual
 * row, or advance a snapshot before the profile write has succeeded. */
export async function acknowledgePulledScalarSnapshots(profileId: string, committed: DeltaImportedData, observedAt: number, versions?: ScalarVersions) {
  if (versions) {
    for (const [field, version] of Object.entries(versions)) {
      if (scalarValueHash(field, getAt(committed, field)) !== version.hash || (readScalarVersion(profileId, field)?.clock || 0) > version.clock) continue;
      if (!writeScalarVersion(profileId, field, version)) continue;
      const previous = _readDeltaSnapshot(profileId, field);
      if (version.hash ? previous[field] !== version.hash : Object.keys(previous).length > 0) {
        _writeDeltaSnapshot(profileId, field, version.hash ? {[field]: version.hash} : {}, observedAt);
      }
    }
    return;
  }
  const evolu = _currentEvolu(), query = _currentItemRowQuery();
  if (!evolu || !query) return;
  const rows = evolu.getQueryRows(query) || [];
  for (const scalarName of DELTA_SCALARS) {
    const matching = rows.filter(row => row?.profileId === profileId && row.arrayName === scalarName && row.itemId === scalarName);
    const canonical = matching.slice().sort((a, b) => String(b.syncedAt || '').localeCompare(String(a.syncedAt || ''))
      || Number(!!b.isDeleted) - Number(!!a.isDeleted))[0];
    if (!canonical || !canonical.syncedAt) continue;
    let value = getAt(committed, scalarName);
    if (scalarName === 'genetics' && value && typeof value === 'object' && !Array.isArray(value)) {
      const { snps: _snps, ...metadata } = value as Record<string, unknown>;
      value = metadata;
    }
    if (canonical.isDeleted) {
      if (value === null || value === undefined || value === '') {
        const clock = Date.parse(String(canonical.syncedAt));
        if (clock > 0) writeScalarVersion(profileId, scalarName, {clock, hash: null});
        _writeDeltaSnapshot(profileId, scalarName, {}, observedAt);
      }
      continue;
    }
    try {
      const payload = await decodeRowPayload(canonical) as { v?: unknown } | null;
      if (!payload || !Object.hasOwn(payload, 'v') || !profileDataValuesEqual(payload.v, value)) continue;
      const clock = Date.parse(String(canonical.syncedAt));
      if (clock > 0) writeScalarVersion(profileId, scalarName, {clock, hash: scalarValueHash(scalarName, value)});
      _writeDeltaSnapshot(profileId, scalarName, { [scalarName]: _djb2(JSON.stringify({ v: value })) }, observedAt);
    } catch { /* Invalid/incomplete rows remain eligible for a later push. */ }
  }
}

// Pull-side row overlay. A newer canonical profile blob can bound stale
// array tombstones left in an old replica after compaction.
export async function _mergeItemRowsIntoImported<Data extends DeltaImportedData>(
  profileId: unknown, imported: Data,
  options: { baselineImported?: unknown; baselineSyncedAt?: number | undefined; scalarClocks?: Record<string, number> | undefined; localImported?: unknown; scalarVersions?: ScalarVersions } = {},
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
    if (_DELTA_SCALARS_SET.has(arrayName!) || arrayName === PROFILE_METADATA_SURFACE) continue;
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
  for (const field of DELTA_SCALARS) {
    const baselineValue = getAt(options.baselineImported, field);
    await mergeScalarRowsIntoImported(imported, field, byArray.get(field) || [], {
      hasBaseline: baselineValue !== undefined,
      baselineSyncedAt: options.scalarClocks ? options.scalarClocks[field] || 0 : options.baselineSyncedAt,
      clockedBaseline: options.scalarClocks !== undefined, baselineValue,
      profileId: typeof profileId === 'string' ? profileId : undefined,
      localValue: getAt(options.localImported, field), hasLocal: !!options.localImported,
      onVersion: version => {if (options.scalarVersions) options.scalarVersions[field] = version;},
    });
  }
  return imported;
}
