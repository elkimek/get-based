import type { MapIdentityConfig } from './sync-delta-surface-config.js';
import { mergeLabOrderingRows } from './lab-ordering-delta.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-map-merge.js - Pull-side keyed-map row overlay helper.

import { getAt, setAt, pickTimestamp } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
import { DELTA_MAP_CONFIG } from './sync-delta-surface-config.js';
import { _isAllowlistSafeId, _isProtoPollutionKey } from './sync-delta-id.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';
import { filterRemovedLabPanels, mergeLabPanelTombstone } from './lab-panel-deletions.js';
import type { LabEntryDraft } from './lab-entry.js';
import { mergeGeneticsSnpStates, mergeGeneticsSnpState, reconcileGeneticsSnpState, geneticsSnpRemoved, fresherGeneticsCall, geneticsCallTime, validGeneticsSnpId } from './genetics-snp-lifecycle.js';
import { mergeGeneticsLifecycle, mergeGeneticsScopeState, geneticsRecordAllowed } from './genetics-lifecycle.js';

export async function mergeMapRowsIntoImported(
  imported: DeltaImportedData, arrayName: string, arrRows: readonly DeltaItemRow[],
) {
  if (arrayName === 'labOrdering') { await mergeLabOrderingRows(imported, arrRows); return; }
  // Dotted-path support: same getAt/setAt walk as the array path.
  // Required for entries like `genetics.snps` so per-key CRDT lands
  // in the nested object instead of clobbering it as a top-level
  // sibling. Defaults to flat for the common case.
  const isNestedMap = arrayName.includes('.');
  const readMap = () => (isNestedMap ? getAt(imported, arrayName) : imported[arrayName]) as Record<string, unknown> | null | undefined;
  const writeMap = (v: unknown) => isNestedMap ? setAt(imported, arrayName, v) : (imported[arrayName] = v);
  let curMap = readMap();
  if (arrayName === 'geneticsSnpTombstones') mergeGeneticsSnpStates(curMap, null);
  if (arrayName === 'geneticsLifecycle') mergeGeneticsLifecycle(curMap, null);
  if (!curMap || typeof curMap !== 'object' || Array.isArray(curMap)) {
    // Object.create(null) (no Object.prototype chain) so a relay-controlled
    // key like '__proto__' that somehow slipped past the checks below would
    // be a regular property write, not a prototype-pollution sink.
    curMap = Object.create(null);
    writeMap(curMap);
  }
  // Same keyIdFn as push so synth-id maps verify correctly.
  const mapCfg: Partial<MapIdentityConfig> = DELTA_MAP_CONFIG[arrayName] || {};
  const rawKeyIdFn: (k: unknown) => string | null = typeof mapCfg.keyIdFn === 'function'
    ? mapCfg.keyIdFn
    : (k => (_isAllowlistSafeId(k) ? k as string : null));
  const keyIdFn = (k: unknown) => { const id = rawKeyIdFn(k); return _isAllowlistSafeId(id) ? id : null; };
  // Build a tombstone-key set first so deletes can find the original raw
  // key in the current map even when the row only carries the synth itemId.
  const liveByRawKey = new Map<string, { v: unknown; syncedAt: string }>(); // rawKey -> { v, syncedAt }
  const tombItemIds = new Set<string>();
  const tombTimes = new Map<string, number>();
  for (const row of arrRows) {
    if (row.isDeleted) {
      tombItemIds.add(row.itemId); tombTimes.set(row.itemId, Math.max(tombTimes.get(row.itemId) || 0, Date.parse(String(row.syncedAt || '')) || 0));
      if (arrayName !== 'geneticsSnpTombstones' && arrayName !== 'geneticsLifecycle') continue;
    }
    try {
      const parsed = await decodeRowPayload(row) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string') continue;
      // Defence-in-depth: re-derive itemId from the payload's claimed k and
      // verify it matches the row column. Catches a relay swapping payloads
      // between rows even for synth-id maps.
      if (keyIdFn(parsed.k) !== row.itemId) continue;
      if (arrayName === 'genetics.snps' && (!validGeneticsSnpId(parsed.k) || !parsed.v || typeof parsed.v !== 'object' || Array.isArray(parsed.v))) continue;
      if (arrayName === 'genetics.snps' && !geneticsRecordAllowed(imported.geneticsLifecycle, parsed.v)) continue;
      // Iteration-order tiebreak hardening: prefer the row with the newer
      // relay-stamped syncedAt over whichever happened to come last in the
      // unordered SQLite scan.
      const sa = String(row.syncedAt || '');
      const cur = liveByRawKey.get(parsed.k);
      if (arrayName === 'labPanelTombstones') {
        liveByRawKey.set(parsed.k, { v: mergeLabPanelTombstone(parsed.k, cur?.v, parsed.v), syncedAt: sa });
        continue;
      }
      if (arrayName === 'geneticsSnpTombstones') {
        liveByRawKey.set(parsed.k, { v: mergeGeneticsSnpState(parsed.k, cur?.v, parsed.v), syncedAt: sa }); continue;
      }
      if (arrayName === 'geneticsLifecycle') {
        liveByRawKey.set(parsed.k, { v: mergeGeneticsScopeState(parsed.k, cur?.v, parsed.v), syncedAt: sa }); continue;
      }
      if (arrayName === 'genetics.snps' && cur && (geneticsCallTime(cur.v) || geneticsCallTime(parsed.v))) {
        liveByRawKey.set(parsed.k, { v: fresherGeneticsCall(cur.v, parsed.v), syncedAt: sa }); continue;
      }
      if (!cur || sa >= cur.syncedAt) {
        liveByRawKey.set(parsed.k, { v: parsed.v, syncedAt: sa });
      }
    } catch {}
  }
  // Apply tombstones: walk current map keys, drop any whose synth itemId is
  // in the tombstone set. Skips entries that just happened to be re-inserted
  // in this batch (liveByRawKey wins via overwrite).
  if (tombItemIds.size > 0 && arrayName !== 'labPanelTombstones' && arrayName !== 'geneticsSnpTombstones' && arrayName !== 'geneticsLifecycle') {
    for (const k of Object.keys(curMap!)) {
      if (liveByRawKey.has(k)) continue;
      const synth = keyIdFn(k);
      if (arrayName === 'genetics.snps') {
        const states = mergeGeneticsSnpStates(imported.geneticsSnpTombstones, null);
        if (mergeGeneticsLifecycle(imported.geneticsLifecycle, null).genome?.restoredAt && geneticsRecordAllowed(imported.geneticsLifecycle, curMap![k])) continue;
        if (states[k] && !geneticsSnpRemoved(states, k) || geneticsCallTime(curMap![k]) > (tombTimes.get(synth || '') || 0)) continue;
      }
      if (synth && tombItemIds.has(synth)) delete curMap![k];
    }
  }
  // Apply live entries under their original key (preserves `:` for
  // manualValues etc). Reject proto-pollution keys at assignment because the
  // raw `parsed.k` is what we write to curMap.
  const newerManualField = (key: string, incoming: unknown) => arrayName === 'manualBodyReadings'
    && pickTimestamp(curMap![key]) > pickTimestamp(incoming);
  for (const [rawKey, entry] of liveByRawKey) {
    if (_isProtoPollutionKey(rawKey)) continue;
    if (newerManualField(rawKey, entry.v)) continue;
    curMap![rawKey] = arrayName === 'labPanelTombstones' ? mergeLabPanelTombstone(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'geneticsSnpTombstones' ? mergeGeneticsSnpState(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'geneticsLifecycle' ? mergeGeneticsScopeState(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'genetics.snps' ? fresherGeneticsCall(geneticsRecordAllowed(imported.geneticsLifecycle, curMap![rawKey]) ? curMap![rawKey] : undefined, entry.v) : entry.v;
  }
  if (arrayName === 'labPanelTombstones' && Array.isArray(imported.entries)) imported.entries = filterRemovedLabPanels(imported.entries as LabEntryDraft[], curMap);
  if (arrayName === 'geneticsSnpTombstones' || arrayName === 'genetics.snps' || arrayName === 'geneticsLifecycle') reconcileGeneticsSnpState(imported);
  recordPullDeltaSurface(arrayName, { live: liveByRawKey.size, tombstones: tombItemIds.size });
}
