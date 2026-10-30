import { DELTA_SCALARS } from './sync-delta-surfaces.js';
import { parseSyncPayload } from './sync-payload-codec.js';
import { profileDataValuesEqual } from './profile-data-writes.js';

/** Ordinary v3 updates omit unchanged scalar shadows while retaining edited
 * scalars and non-scalar/extension snapshots. Rows carry field-level clocks. Repeating an untouched scalar in a newer
 * whole-profile blob would turn another device's note save into a scalar edit.
 * Complete first-publish, forced recovery and rebuild snapshots remain intact. */
export function withoutDeltaScalarSnapshots(value: unknown, keepScalars: readonly string[] = []): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = structuredClone(value) as Record<string, unknown>;
  for (const path of DELTA_SCALARS) {
    if (keepScalars.includes(path)) continue;
    const parts = path.split('.');
    let parent: Record<string, unknown> | undefined = result;
    for (const part of parts.slice(0, -1)) {
      const next: unknown = parent?.[part];
      parent = next && typeof next === 'object' && !Array.isArray(next) ? next as Record<string, unknown> : undefined;
    }
    if (parent) delete parent[parts.at(-1)!];
  }
  return result;
}

/** Used only with an empty delta plan: all scalar values are already
 * acknowledged. Compare every remaining payload channel, rather than emitting
 * a write merely because an older full snapshot included those scalar fields. */
export async function equivalentSyncPayloadWithoutScalars(previous: unknown, next: unknown): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([parseSyncPayload(previous), parseSyncPayload(next)]);
    return profileDataValuesEqual(
      { ...left, importedData: withoutDeltaScalarSnapshots(left.importedData) },
      { ...right, importedData: withoutDeltaScalarSnapshots(right.importedData) },
    );
  } catch { return false; }
}
