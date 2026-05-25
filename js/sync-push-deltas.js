// sync-push-deltas.js - Push-side delta planning and post-commit application.

import { getAt } from './data-merge.js';
import {
  DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS,
  _applyArrayDelta, _planArrayDelta, _planKeyedMapDelta,
  _planScalarDelta, _recordPushTelemetry, _writeDeltaSnapshot,
} from './sync-delta.js';

export async function planProfileDeltas(profileId, importedData) {
  const deltaPlans = [];
  let deltaOpCount = 0;
  if (!importedData || typeof importedData !== 'object') {
    return { deltaPlans, deltaOpCount };
  }

  // Phase 1 of CRDT-delta refactor: plan per-array deltas BEFORE the
  // blob update so the diff is computed against the same importedData
  // snapshot we're about to ship. Apply runs from onComplete so a
  // wedged blob push doesn't strand the snapshot pointer past the
  // unmerged delta.
  for (const arrayName of DELTA_ARRAYS) {
    // arrayName may be a dotted path (`lightEnvironment.rooms`); the
    // planner reads via getAt so flat and nested paths share the
    // same code path.
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    try {
      const plan = await _planArrayDelta(profileId, arrayName, items);
      if (plan.ops.length > 0) {
        deltaPlans.push({ arrayName, plan });
        deltaOpCount += plan.ops.length;
      }
    } catch (e) {
      console.warn(`[sync] delta-plan ${arrayName} failed:`, e?.message || e);
    }
  }

  // Keyed-map shapes (markerNotes etc) - same itemRow table, different
  // enumeration. Tagged with the same arrayName field on the row so
  // telemetry + the diagnose UI render them uniformly with the array
  // arrays.
  for (const mapName of DELTA_MAPS) {
    // Dotted-path support (e.g. `genetics.snps`) - same getAt walk
    // as the array planner. Flat names hit the obvious top-level.
    const obj = mapName.includes('.') ? getAt(importedData, mapName) : importedData[mapName];
    try {
      const plan = await _planKeyedMapDelta(profileId, mapName, obj);
      if (plan.ops.length > 0) {
        deltaPlans.push({ arrayName: mapName, plan });
        deltaOpCount += plan.ops.length;
      }
    } catch (e) {
      console.warn(`[sync] delta-plan map ${mapName} failed:`, e?.message || e);
    }
  }

  // Scalars (menstrualCycle / context cards / DNA / etc) - one row
  // per scalar. Without this loop, Phase 2 (drop blob writes) would
  // silently stop syncing all 18 scalar fields. Same plan/apply
  // contract so telemetry + cap watchdog cover them uniformly.
  for (const scalarName of DELTA_SCALARS) {
    // Dotted-path scalars (e.g. `lightEnvironment.burdenAI`) read via
    // getAt so a nested singleton can ride the scalar planner without
    // colliding with its sibling arrays/maps on the same parent.
    let value = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    // Strip nested fields that ride a DELTA_MAPS dotted path so the
    // scalar carries only metadata, not a stale copy of the per-key
    // map. Without this, the relay's `genetics` scalar row keeps
    // re-applying the old whole-snps blob on every pull, beating
    // the per-row genetics.snps merge that's actually the source
    // of truth for SNP membership.
    if (scalarName === 'genetics' && value && typeof value === 'object' && !Array.isArray(value)) {
      const { snps, ...metadata } = value;
      value = metadata;
    }
    try {
      const plan = await _planScalarDelta(profileId, scalarName, value);
      if (plan.ops.length > 0) {
        deltaPlans.push({ arrayName: scalarName, plan });
        deltaOpCount += plan.ops.length;
      }
    } catch (e) {
      console.warn(`[sync] delta-plan scalar ${scalarName} failed:`, e?.message || e);
    }
  }

  return { deltaPlans, deltaOpCount };
}

export function applyCommittedDeltas(profileId, dataJson, deltaPlans, deltaOpCount, debug) {
  const _debug = typeof debug === 'function' ? debug : () => {};
  // Phase 1 of CRDT-delta refactor: apply the planned per-array
  // deltas now that the blob committed. Snapshot is committed only
  // after the per-row mutations are queued - failure to apply a
  // delta will retry on the next push since the snapshot still
  // reflects what was last successfully reflected to the relay.
  if (deltaPlans.length > 0) {
    let snapshotsAdvanced = 0;
    for (const { arrayName, plan } of deltaPlans) {
      // v1.7.12 audit fix: only advance the snapshot when every op in
      // the plan succeeded. A partial failure (e.g. one row's evolu.insert
      // throwing on duplicate-id) used to advance the snapshot anyway,
      // so the next push diff'd against state that didn't match the
      // relay; failed items got silently skipped forever.
      const allOk = _applyArrayDelta(arrayName, plan);
      if (allOk) {
        // v1.7.16: thread plannedAt so a stale onComplete (push A
        // arriving after push B has already written its snapshot)
        // doesn't clobber the fresher view.
        const wrote = _writeDeltaSnapshot(profileId, arrayName, plan.next, plan.plannedAt);
        if (wrote) snapshotsAdvanced++;
      }
    }
    _debug(`Applied ${deltaOpCount} delta ops across ${deltaPlans.length} array(s) - ${snapshotsAdvanced}/${deltaPlans.length} snapshots advanced`);
  }
  // Phase 1 telemetry: record blob size + per-array delta breakdown.
  // Always recorded - even when deltaPlans is empty (a no-delta push
  // is a valid signal: the user is online but didn't change anything,
  // and the still-shipped blob is pure overhead Phase 2 will remove).
  _recordPushTelemetry(profileId, (dataJson || '').length, deltaPlans);
}
