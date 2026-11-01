import {compareSyncRows} from './sync-conflict-order.js';
import type { MapIdentityConfig } from './sync-delta-surface-config.js';
import { mergeLabOrderingRows } from './lab-ordering-delta.js';
import type { DeltaItemRow, DeltaImportedData } from './sync-delta-row-codec.js';
// sync-delta-map-merge.js - Pull-side keyed-map row overlay helper.

import { getAt, setAt, pickTimestamp } from './data-merge.js';
import { recordPullDeltaSurface } from './sync-delta-pull-snapshot.js';
import { DELTA_MAP_CONFIG } from './sync-delta-surface-config.js';
import { _djb2, _isAllowlistSafeId, _isProtoPollutionKey } from './sync-delta-id.js';
import { decodeRowPayload } from './sync-delta-row-codec.js';
import { filterRemovedLabPanels, mergeLabPanelTombstone } from './lab-panel-deletions.js';
import type { LabEntryDraft } from './lab-entry.js';
import { mergeGeneticsSnpStates, mergeGeneticsSnpState, reconcileGeneticsSnpState, geneticsSnpRemoved, fresherGeneticsCall, geneticsCallTime, validGeneticsSnpId } from './genetics-snp-lifecycle.js';
import { mergeGeneticsLifecycle, mergeGeneticsScopeState, geneticsRecordAllowed } from './genetics-lifecycle.js';

export async function mergeMapRowsIntoImported(
  imported: DeltaImportedData, arrayName: string, arrRows: readonly DeltaItemRow[],
  options: {onValue?: (itemId: string, value: {key?: string; hash: string | null}) => void} = {},
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
  // Semantic removal histories survive transport tombstones; a missing
  // carrier cannot authorize restoring a specimen or genetics record.
  const historyCarrier = ['labPanelTombstones', 'geneticsSnpTombstones', 'geneticsLifecycle'].includes(arrayName);
  const liveByRawKey = new Map<string, { v: unknown; row: DeltaItemRow; wireHash: string }>();
  const tombRows = new Map<string, DeltaItemRow>();
  for (const row of arrRows) {
    if (row.isDeleted) {
      const prior = tombRows.get(row.itemId);
      if (!prior || compareSyncRows(row, prior) > 0) tombRows.set(row.itemId, row);
      if (!historyCarrier) continue;
    }
    try {
      const parsed = await decodeRowPayload(row) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.k !== 'string' || !Object.hasOwn(parsed, 'v')) continue;
      if (keyIdFn(parsed.k) !== row.itemId) continue;
      if (arrayName === 'genetics.snps' && (!validGeneticsSnpId(parsed.k) || !parsed.v || typeof parsed.v !== 'object' || Array.isArray(parsed.v))) continue;
      if (arrayName === 'genetics.snps' && !geneticsRecordAllowed(imported.geneticsLifecycle, parsed.v)) continue;
      const cur = liveByRawKey.get(parsed.k);
      const canonicalRow = !cur || compareSyncRows(row, cur.row) > 0 ? row : cur.row;
      const wireHash = canonicalRow === row ? _djb2(JSON.stringify({ k: parsed.k, v: parsed.v })) : cur!.wireHash;
      if (arrayName === 'labPanelTombstones') {
        liveByRawKey.set(parsed.k, { v: mergeLabPanelTombstone(parsed.k, cur?.v, parsed.v), row: canonicalRow, wireHash });
      } else if (arrayName === 'geneticsSnpTombstones') {
        liveByRawKey.set(parsed.k, { v: mergeGeneticsSnpState(parsed.k, cur?.v, parsed.v), row: canonicalRow, wireHash });
      } else if (arrayName === 'geneticsLifecycle') {
        liveByRawKey.set(parsed.k, { v: mergeGeneticsScopeState(parsed.k, cur?.v, parsed.v), row: canonicalRow, wireHash });
      } else if (arrayName === 'genetics.snps' && cur && (geneticsCallTime(cur.v) || geneticsCallTime(parsed.v))) {
        liveByRawKey.set(parsed.k, { v: fresherGeneticsCall(cur.v, parsed.v), row: canonicalRow, wireHash });
      } else if (!cur || canonicalRow === row) liveByRawKey.set(parsed.k, { v: parsed.v, row, wireHash });
    } catch { /* Malformed rows cannot erase known semantic history. */ }
  }
  const restoredGenetics = (key: string, value: unknown, tomb: DeltaItemRow) => {
    if (arrayName !== 'genetics.snps') return false;
    const states = mergeGeneticsSnpStates(imported.geneticsSnpTombstones, null);
    if (mergeGeneticsLifecycle(imported.geneticsLifecycle, null).genome?.restoredAt && geneticsRecordAllowed(imported.geneticsLifecycle, value)) return true;
    return !!states[key] && !geneticsSnpRemoved(states, key)
      || geneticsCallTime(value) > (Date.parse(String(tomb.syncedAt || '')) || 0);
  };
  // Ordinary maps use main's deterministic transport ordering. Genetics also
  // retains its explicit record/generation clocks across old envelopes.
  if (tombRows.size > 0 && !historyCarrier) {
    for (const k of Object.keys(curMap!)) {
      const synth = keyIdFn(k), tomb = synth ? tombRows.get(synth) : null, live = liveByRawKey.get(k);
      if (tomb && restoredGenetics(k, curMap![k], tomb)) continue;
      if (tomb && (!live || compareSyncRows(tomb, live.row) >= 0)) delete curMap![k];
    }
  }
  const newerManualField = (key: string, incoming: unknown) => arrayName === 'manualBodyReadings'
    && pickTimestamp(curMap![key]) > pickTimestamp(incoming);
  for (const [rawKey, entry] of liveByRawKey) {
    if (_isProtoPollutionKey(rawKey)) continue;
    const itemId = keyIdFn(rawKey), tomb = itemId ? tombRows.get(itemId) : null;
    if (!historyCarrier && tomb && compareSyncRows(tomb, entry.row) >= 0 && !restoredGenetics(rawKey, entry.v, tomb)) continue;
    if (newerManualField(rawKey, entry.v)) continue;
    curMap![rawKey] = arrayName === 'labPanelTombstones' ? mergeLabPanelTombstone(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'geneticsSnpTombstones' ? mergeGeneticsSnpState(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'geneticsLifecycle' ? mergeGeneticsScopeState(rawKey, curMap![rawKey], entry.v)
      : arrayName === 'genetics.snps' ? fresherGeneticsCall(geneticsRecordAllowed(imported.geneticsLifecycle, curMap![rawKey]) ? curMap![rawKey] : undefined, entry.v) : entry.v;
    if (itemId && !entry.row.isDeleted) options.onValue?.(itemId, { key: rawKey, hash: entry.wireHash });
  }
  for (const [id] of tombRows) {
    if (_isAllowlistSafeId(id) && !Object.keys(curMap!).some(key => keyIdFn(key) === id)) options.onValue?.(id, { hash: null });
  }
  if (arrayName === 'labPanelTombstones' && Array.isArray(imported.entries)) imported.entries = filterRemovedLabPanels(imported.entries as LabEntryDraft[], curMap);
  if (arrayName === 'geneticsSnpTombstones' || arrayName === 'genetics.snps' || arrayName === 'geneticsLifecycle') reconcileGeneticsSnpState(imported);
  recordPullDeltaSurface(arrayName, { live: liveByRawKey.size, tombstones: tombRows.size });
}
