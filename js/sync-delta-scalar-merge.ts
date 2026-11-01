import type {DeltaItemRow, DeltaImportedData} from './sync-delta-row-codec.js';
import type {ScalarVersion} from './sync-scalar-snapshot.js';
import {getAt, setAt} from './data-merge.js';
import {recordPullDeltaSurface} from './sync-delta-pull-snapshot.js';
import {decodeRowPayload} from './sync-delta-row-codec.js';
import {readScalarVersion, scalarValue, scalarValueHash} from './sync-scalar-snapshot.js';

export async function mergeScalarRowsIntoImported(
  imported: DeltaImportedData, arrayName: string, arrRows: readonly DeltaItemRow[],
  options: {hasBaseline?: boolean | undefined; baselineSyncedAt?: number | undefined;
    clockedBaseline?: boolean; baselineValue?: unknown; profileId?: string | undefined; localValue?: unknown; hasLocal?: boolean;
    onVersion?: (version: ScalarVersion) => void} = {},
) {
  let live = 0, tombs = 0, chosenAt = '', tombstonedAt = '';
  let chosen: {v?: unknown} | null = null;
  for (const row of arrRows) {
    if (row.itemId !== arrayName) continue;
    if (row.isDeleted) {tombs++; if (String(row.syncedAt || '') > tombstonedAt) tombstonedAt = String(row.syncedAt || ''); continue;}
    try {
      const parsed = await decodeRowPayload(row) as {v?: unknown} | null;
      if (!parsed || !Object.hasOwn(parsed, 'v')) continue;
      live++;
      if (!chosen || String(row.syncedAt || '') > chosenAt) {chosen = parsed; chosenAt = String(row.syncedAt || '');}
    } catch { /* Malformed rows cannot replace valid data. */ }
  }
  let selected: {value: unknown; clock: number} | null = null;
  const deleted = !!tombstonedAt && tombstonedAt >= chosenAt;
  if (deleted || chosen) selected = {value: deleted ? null : chosen!.v,
    clock: Date.parse(deleted ? tombstonedAt : chosenAt) || 0};
  const baselineAt = options.hasBaseline ? options.baselineSyncedAt || 0 : 0;
  if (options.hasBaseline && baselineAt > 0 && baselineAt >= (selected?.clock || 0)) {
    selected = {value: options.clockedBaseline ? options.baselineValue : getAt(imported, arrayName), clock: baselineAt};
  }
  // Successful local edits can precede both query subscriptions. Preserve only
  // the exact durably committed value, never an unrelated unsaved draft.
  const local = options.profileId ? readScalarVersion(options.profileId, arrayName) : null;
  if (options.hasLocal && local && local.hash === scalarValueHash(arrayName, options.localValue) && local.clock > (selected?.clock || 0)) {
    selected = {value: scalarValue(arrayName, options.localValue), clock: local.clock};
  }
  if (selected) {
    let value = selected.value;
    if (arrayName === 'genetics' && imported.genetics?.snps && typeof imported.genetics.snps === 'object') {
      const snps = imported.genetics.snps;
      value = value && typeof value === 'object' ? {...value, snps} : {snps};
    }
    setAt(imported, arrayName, value);
    if (selected.clock > 0) options.onVersion?.({clock: selected.clock, hash: scalarValueHash(arrayName, selected.value)});
  }
  if (arrRows.length) recordPullDeltaSurface(arrayName, {live, tombstones: tombs});
}
