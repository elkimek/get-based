// sync-delta-scalar-merge.js - Pull-side scalar row overlay helper.

import { setAt } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-observability.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';

export async function mergeScalarRowsIntoImported(imported, arrayName, arrRows) {
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
      const parsed = await decodeRowPayload(row);
      if (!parsed || typeof parsed !== 'object') continue;
      // Prefer the most-recently-synced live row when multiples exist.
      const ts = String(row.syncedAt || '');
      if (ts > chosenAt) { chosen = parsed; chosenAt = ts; }
      live++;
    } catch {}
  }
  // Latest write wins between live + tombstone: tombstone only
  // overwrites when its syncedAt is at-or-newer than the chosen
  // live row (otherwise an old delete would obliterate a fresh edit).
  const isNestedScalar = arrayName.includes('.');
  if (tombstoned && tombstonedAt >= chosenAt) {
    // Symmetric snps preservation: the live branch below restores
    // imported.genetics.snps when the map merge ran first; the tombstone
    // branch needs the same guard or `genetics.snps` rows get silently
    // wiped whenever the per-row map merger happens to run before this
    // scalar branch (byArray iteration order is determined by relay row
    // ordering, so it's racy).
    if (arrayName === 'genetics'
        && imported.genetics && typeof imported.genetics === 'object'
        && imported.genetics.snps && typeof imported.genetics.snps === 'object'
        && Object.keys(imported.genetics.snps).length > 0) {
      imported.genetics = { snps: imported.genetics.snps };
    } else if (isNestedScalar) {
      // Dotted-path scalar tombstone clears just the leaf, not the parent.
      setAt(imported, arrayName, null);
    } else {
      imported[arrayName] = null;
    }
  } else if (chosen) {
    // Preserve nested fields owned by a DELTA_MAPS dotted path. The
    // scalar payload is metadata-only by contract, so a remote scalar
    // must not blow away the local map.
    if (arrayName === 'genetics'
        && imported.genetics && typeof imported.genetics === 'object'
        && imported.genetics.snps && typeof imported.genetics.snps === 'object') {
      const localSnps = imported.genetics.snps;
      imported.genetics = chosen.v;
      if (imported.genetics && typeof imported.genetics === 'object') {
        imported.genetics.snps = localSnps;
      }
    } else if (isNestedScalar) {
      // Dotted-path scalar write: only the leaf, not the parent.
      setAt(imported, arrayName, chosen.v);
    } else {
      imported[arrayName] = chosen.v;
    }
  }
  recordPullDeltaSurface(arrayName, { live, tombstones: tombs });
}
