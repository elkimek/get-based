// sync-push-deltas.js - Push-side delta planning and post-commit application.

import type { DeltaImportedData, DeltaPlan } from './sync-delta-row-codec.js';

export interface NamedDeltaPlan { arrayName: string; plan: DeltaPlan }

import { getErrorMessage } from './caught-error.js';
import { getAt } from './data-merge.js';
import {
  DELTA_ARRAYS, DELTA_MAPS, DELTA_SCALARS,
  _applyArrayDelta, _planArrayDelta, _planKeyedMapDelta,
  _planScalarDelta, _recordPushTelemetry, _writeDeltaSnapshot,
} from './sync-delta.js';

export async function planProfileDeltas(profileId: string, importedData: DeltaImportedData | null | undefined) {
  const deltaPlans: NamedDeltaPlan[] = [];
  let deltaOpCount = 0;
  if (!importedData || typeof importedData !== 'object') {
    return { deltaPlans, deltaOpCount };
  }

  // Plan against the same local view as the blob. Commit rows and snapshots only
  // from onComplete so an incomplete blob write remains eligible for retry.
  for (const arrayName of DELTA_ARRAYS) {
    // arrayName may be a dotted path (`lightEnvironment.rooms`); the
    // planner reads via getAt so flat and nested paths share the
    // same code path.
    const raw = arrayName.includes('.')
      ? getAt(importedData, arrayName)
      : importedData[arrayName];
    const items = Array.isArray(raw) ? raw : [];
    const deletedAtPath = importedData._deleted?.[arrayName];
    const explicitTombstoneIds = Array.isArray(deletedAtPath) ? deletedAtPath : [];
    try {
      const plan = await _planArrayDelta(profileId, arrayName, items, { explicitTombstoneIds });
      if (plan.ops.length > 0) {
        deltaPlans.push({ arrayName, plan });
        deltaOpCount += plan.ops.length;
      }
    } catch (e) {
      console.warn(`[sync] delta-plan ${arrayName} failed:`, getErrorMessage(e, e));
    }
  }

  // Keyed maps share itemRow storage and surface names with the array path.
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
      console.warn(`[sync] delta-plan map ${mapName} failed:`, getErrorMessage(e, e));
    }
  }

  // Singleton and nested fields must also survive the blob-free cutover.
  for (const scalarName of DELTA_SCALARS) {
    // Dotted-path scalars (e.g. `lightEnvironment.burdenAI`) read via
    // getAt so a nested singleton can ride the scalar planner without
    // colliding with its sibling arrays/maps on the same parent.
    let value = scalarName.includes('.')
      ? getAt(importedData, scalarName)
      : importedData[scalarName];
    // SNP membership belongs to per-key rows; genetics carries metadata only.
    if (scalarName === 'genetics' && value && typeof value === 'object' && !Array.isArray(value)) {
      const { snps, ...metadata } = value as Record<string, unknown>;
      value = metadata;
    }
    try {
      const plan = await _planScalarDelta(profileId, scalarName, value);
      if (plan.ops.length > 0) {
        deltaPlans.push({ arrayName: scalarName, plan });
        deltaOpCount += plan.ops.length;
      }
    } catch (e) {
      console.warn(`[sync] delta-plan scalar ${scalarName} failed:`, getErrorMessage(e, e));
    }
  }

  return { deltaPlans, deltaOpCount };
}

export function applyCommittedDeltas(
  profileId: string, dataJson: string | null | undefined,
  deltaPlans: readonly NamedDeltaPlan[], deltaOpCount: number, debug: unknown,
) {
  const _debug = typeof debug === 'function' ? debug : () => {};
  // Advance a surface snapshot only after all its row mutations succeed.
  if (deltaPlans.length > 0) {
    let snapshotsAdvanced = 0;
    for (const { arrayName, plan } of deltaPlans) {
      // A failed row must remain eligible for the next diff.
      const allOk = _applyArrayDelta(arrayName, plan);
      if (allOk) {
        // A delayed completion cannot overwrite a fresher committed snapshot.
        const wrote = _writeDeltaSnapshot(profileId, arrayName, plan.next, plan.plannedAt);
        if (wrote) snapshotsAdvanced++;
      }
    }
    _debug(`Applied ${deltaOpCount} delta ops across ${deltaPlans.length} array(s) - ${snapshotsAdvanced}/${deltaPlans.length} snapshots advanced`);
  }
  // Empty plans still measure the overhead of shipping an unchanged blob.
  _recordPushTelemetry(profileId, (dataJson || '').length, deltaPlans);
}
