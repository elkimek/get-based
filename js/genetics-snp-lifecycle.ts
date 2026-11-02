// Monotonic per-call remove/restore state survives independent profile and row merges.
import type { GeneticsData } from './dna-runtime.js';
import { recalculateGenetics } from './genetics-summary.js';
import { reconcileGeneticsLifecycle, geneticsRecordAllowed, geneticsMetadataNeedsRebroadcast, mergeGeneticsLifecycle } from './genetics-lifecycle.js';

export interface GeneticsSnpState { deletedAt: number; restoredAt: number; updatedAt: number; }
export type GeneticsSnpStates = Record<string, GeneticsSnpState>;
export interface GeneticsSnpData { genetics?: unknown; geneticsSnpTombstones?: unknown; geneticsLifecycle?: unknown; }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const validGeneticsSnpId = (id: unknown): id is string => typeof id === 'string' && /^rs\d{1,15}$/.test(id);
const clock = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
export function parseGeneticsSnpState(id: string, value: unknown): GeneticsSnpState {
  if (!validGeneticsSnpId(id) || !object(value) || ![value.deletedAt, value.restoredAt, value.updatedAt].every(clock)
    || value.updatedAt !== Math.max(Number(value.deletedAt), Number(value.restoredAt))
    || Object.keys(value).some(key => !['deletedAt', 'restoredAt', 'updatedAt'].includes(key))) throw new Error('Review the SNP removal history before editing or merging it.');
  return value as unknown as GeneticsSnpState;
}
export function mergeGeneticsSnpState(id: string, a: unknown, b: unknown): GeneticsSnpState {
  const zero = { deletedAt: 0, restoredAt: 0, updatedAt: 0 }, left = a == null ? zero : parseGeneticsSnpState(id, a), right = b == null ? zero : parseGeneticsSnpState(id, b);
  const deletedAt = Math.max(left.deletedAt, right.deletedAt), restoredAt = Math.max(left.restoredAt, right.restoredAt);
  return { deletedAt, restoredAt, updatedAt: Math.max(deletedAt, restoredAt) };
}
export function mergeGeneticsSnpStates(a: unknown, b: unknown): GeneticsSnpStates {
  if (a != null && !object(a) || b != null && !object(b)) throw new Error('Review the SNP removal history before editing or merging it.');
  const left = a as Record<string, unknown> | undefined, right = b as Record<string, unknown> | undefined;
  return Object.fromEntries([...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].sort().map(id => [id, mergeGeneticsSnpState(id, left?.[id], right?.[id])]));
}
export function geneticsCallTime(value: unknown) {
  if (!object(value)) return 0;
  const sourceAt = object(value.source) && typeof value.source.addedAt === 'string' ? Date.parse(value.source.addedAt) : 0;
  return Math.max(clock(value.updatedAt) ? value.updatedAt : 0, clock(sourceAt) ? sourceAt : 0);
}
export function geneticsSnpRemoved(states: GeneticsSnpStates, id: string) {
  const state = states[id]; return !!state && state.deletedAt > 0 && state.deletedAt >= state.restoredAt;
}
export function geneticsSnpAllowed(states: GeneticsSnpStates, id: string, call: unknown) {
  if (geneticsSnpRemoved(states, id)) return false;
  const state = states[id]; return !state || !state.restoredAt || geneticsCallTime(call) >= state.restoredAt;
}
export function geneticsSnpMutationTime(data: GeneticsSnpData, id: string, call: unknown, at = Date.now()) {
  if (!validGeneticsSnpId(id) || !clock(at)) throw new Error('The SNP identity or change time is invalid.');
  const state = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null)[id];
  const time = Math.max(1, at, geneticsCallTime(call) + 1, (state?.updatedAt || 0) + 1);
  if (!clock(time)) throw new Error('The SNP change clock cannot be advanced safely.'); return time;
}
export function recordGeneticsSnpState(data: GeneticsSnpData, id: string, call: unknown, removed: boolean, at = Date.now()) {
  const states = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null), time = geneticsSnpMutationTime(data, id, call, at), before = states[id];
  states[id] = { deletedAt: removed ? time : before?.deletedAt || 0, restoredAt: removed ? before?.restoredAt || 0 : time, updatedAt: time };
  data.geneticsSnpTombstones = states; return time;
}
export function reconcileGeneticsSnpState(data: GeneticsSnpData) {
  reconcileGeneticsLifecycle(data);
  const states = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null);
  if (!object(data.genetics)) return;
  const genetics = data.genetics as GeneticsData;
  if (genetics.snps == null && Object.keys(states).length) genetics.snps = {};
  const calls = genetics.snps;
  if (!object(calls)) return;
  for (const id of Object.keys(calls)) if (!geneticsSnpAllowed(states, id, calls[id])) delete calls[id];
  // Legacy summary-only imports can lack call evidence. Recompute when actual
  // call ownership or explicit removal history establishes the inputs.
  if (Object.keys(states).length || Object.values(calls).some(call => geneticsCallTime(call) > 0) || calls.rs429358 && calls.rs7412) recalculateGenetics(genetics);
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export function fresherGeneticsCall(a: unknown, b: unknown) {
  if (a == null) return b; if (b == null) return a;
  const left = geneticsCallTime(a), right = geneticsCallTime(b);
  if (left !== right) return left > right ? a : b;
  // Keep legacy remote precedence, but make stamped same-clock peers converge.
  return left > 0 && canonical(a) > canonical(b) ? a : b;
}
export function mergeGeneticsCallMaps(a: unknown, b: unknown, states: GeneticsSnpStates, lifecycle?: unknown): Record<string, unknown> {
  const left = object(a) ? a : {}, right = object(b) ? b : {};
  return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].filter(id => !['__proto__', 'constructor', 'prototype'].includes(id)).sort().flatMap(id => {
    const call = fresherGeneticsCall(geneticsRecordAllowed(lifecycle, left[id]) ? left[id] : undefined, geneticsRecordAllowed(lifecycle, right[id]) ? right[id] : undefined);
    return call !== undefined && (!validGeneticsSnpId(id) || geneticsSnpAllowed(states, id, call)) ? [[id, structuredClone(call)]] : [];
  }));
}
export function geneticsStateNeedsRebroadcast(local: GeneticsSnpData, remote: GeneticsSnpData) {
  if (geneticsMetadataNeedsRebroadcast(local, remote)) return true;
  const left = mergeGeneticsSnpStates(local.geneticsSnpTombstones, null), right = mergeGeneticsSnpStates(remote.geneticsSnpTombstones, null), states = mergeGeneticsSnpStates(left, right);
  for (const [id, state] of Object.entries(left)) if (state.deletedAt > (right[id]?.deletedAt || 0) || state.restoredAt > (right[id]?.restoredAt || 0)) return true;
  const a = object(local.genetics) && object(local.genetics.snps) ? local.genetics.snps : {}, b = object(remote.genetics) && object(remote.genetics.snps) ? remote.genetics.snps : {};
  const lifecycle = mergeGeneticsLifecycle(local.geneticsLifecycle, remote.geneticsLifecycle);
  for (const [id, call] of Object.entries(a)) if (validGeneticsSnpId(id) && geneticsSnpAllowed(states, id, call) && geneticsRecordAllowed(lifecycle, call)
    && (b[id] == null || !geneticsRecordAllowed(lifecycle, b[id]) || geneticsCallTime(call) > geneticsCallTime(b[id]) || geneticsCallTime(call) > 0 && canonical(fresherGeneticsCall(call, b[id])) !== canonical(b[id]))) return true;
  return false;
}
