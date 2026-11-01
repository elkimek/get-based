import {DELTA_SCALARS} from './sync-delta-surfaces.js';
import {_djb2} from './sync-delta-id.js';
import {getAt} from './data-merge.js';
import {parseSyncPayload} from './sync-payload-codec.js';
import {profileDataValuesEqual} from './profile-data-writes.js';
import type {DeltaPlan} from './sync-delta-row-codec.js';
export interface ScalarVersion {clock: number; hash: string | null}
export type ScalarVersions = Record<string, ScalarVersion>;
const versionKey = (profileId: string) => `labcharts-${profileId}-delta-scalarVersions`;
export function scalarValue(field: string, value: unknown): unknown {
  if (field === 'genetics' && value && typeof value === 'object' && !Array.isArray(value)) {
    const {snps: _snps, ...metadata} = value as Record<string, unknown>; return metadata;
  }
  return value;
}
export function scalarValueHash(field: string, value: unknown): string | null {
  value = scalarValue(field, value);
  return value === null || value === undefined || value === '' ? null : _djb2(JSON.stringify({v: value}));
}
export function readScalarVersion(profileId: string, field: string): ScalarVersion | null {
  try {
    const value = JSON.parse(localStorage.getItem(versionKey(profileId)) || '{}')?.[field];
    return value && Number.isSafeInteger(value.clock) && value.clock > 0 && (value.hash === null || typeof value.hash === 'string') ? value : null;
  } catch {return null;}
}
export function writeScalarVersion(profileId: string, field: string, version: ScalarVersion): boolean {
  if (!DELTA_SCALARS.includes(field) || !Number.isSafeInteger(version.clock) || version.clock <= 0) return false;
  try {
    const versions: ScalarVersions = Object.create(null);
    for (const name of DELTA_SCALARS) {const prior = readScalarVersion(profileId, name); if (prior) versions[name] = prior;}
    if ((versions[field]?.clock || 0) > version.clock) return true;
    if (versions[field]?.clock === version.clock && versions[field]?.hash === version.hash) return true;
    versions[field] = version;
    localStorage.setItem(versionKey(profileId), JSON.stringify(versions)); return true;
  } catch {return false;}
}
export function clearScalarVersion(profileId: string, field: string): boolean {
  try {
    const versions: ScalarVersions = Object.create(null);
    for (const name of DELTA_SCALARS) {const prior = readScalarVersion(profileId, name); if (prior && name !== field) versions[name] = prior;}
    if (Object.keys(versions).length) localStorage.setItem(versionKey(profileId), JSON.stringify(versions));
    else localStorage.removeItem(versionKey(profileId));
    return true;
  } catch {return false;}
}
/** Full scalar snapshots retain their field edit clocks across unrelated saves.
 * This protects peers whose profile and item-row queries arrive separately. */
export function scalarPayloadClocks(profileId: string, imported: unknown, plans: readonly {arrayName: string; plan: DeltaPlan}[], completeSnapshot = false) {
  const clocks: Record<string, number> = Object.create(null);
  for (const field of DELTA_SCALARS) {
    const version = readScalarVersion(profileId, field);
    clocks[field] = version && version.hash === scalarValueHash(field, getAt(imported, field)) ? version.clock : 0;
    const plan = plans.find(item => item.arrayName === field)?.plan;
    if (plan?.ops.length) clocks[field] = Math.max(...plan.ops.map(op => Date.parse(String(op.args.syncedAt || '')) || 0));
    else if (completeSnapshot) clocks[field] = Math.max(Date.now(), (version?.clock || 0) + 1);
  }
  return clocks;
}
export function commitScalarPayloadClocks(profileId: string, imported: unknown, clocks: Record<string, number>): boolean {
  let ok = true;
  for (const field of DELTA_SCALARS) if ((clocks[field] || 0) > 0) {
    if (!writeScalarVersion(profileId, field, {clock: clocks[field]!, hash: scalarValueHash(field, getAt(imported, field))})) ok = false;
  }
  return ok;
}
export async function equivalentSyncPayload(previous: unknown, next: unknown): Promise<boolean> {
  try {return profileDataValuesEqual(await parseSyncPayload(previous), await parseSyncPayload(next));} catch {return false;}
}
