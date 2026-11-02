// Whole-genome and maternal generations are independent of individual SNP removals.
export type GeneticsScope = 'genome' | 'maternal';
export interface GeneticsScopeState { deletedAt: number; restoredAt: number; updatedAt: number; }
export type GeneticsLifecycle = Partial<Record<GeneticsScope, GeneticsScopeState>>;
export interface GeneticsLifecycleData { genetics?: unknown; geneticsLifecycle?: unknown; geneticsSnpTombstones?: unknown; }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const clock = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
export function parseGeneticsScopeState(id: string, value: unknown): GeneticsScopeState {
  if (!['genome', 'maternal'].includes(id) || !object(value) || ![value.deletedAt, value.restoredAt, value.updatedAt].every(clock)
    || value.updatedAt !== Math.max(Number(value.deletedAt), Number(value.restoredAt))
    || Object.keys(value).some(key => !['deletedAt', 'restoredAt', 'updatedAt'].includes(key))) throw new Error('Review the genetics removal history before editing or merging it.');
  return value as unknown as GeneticsScopeState;
}
export function mergeGeneticsScopeState(id: string, a: unknown, b: unknown): GeneticsScopeState {
  if (!['genome', 'maternal'].includes(id)) throw new Error('Review the genetics removal history before editing or merging it.');
  const zero = { deletedAt: 0, restoredAt: 0, updatedAt: 0 }, left = a == null ? zero : parseGeneticsScopeState(id, a), right = b == null ? zero : parseGeneticsScopeState(id, b);
  const deletedAt = Math.max(left.deletedAt, right.deletedAt), restoredAt = Math.max(left.restoredAt, right.restoredAt);
  return { deletedAt, restoredAt, updatedAt: Math.max(deletedAt, restoredAt) };
}
export function mergeGeneticsLifecycle(a: unknown, b: unknown): GeneticsLifecycle {
  if (a != null && !object(a) || b != null && !object(b)) throw new Error('Review the genetics removal history before editing or merging it.');
  const left = object(a) ? a : {}, right = object(b) ? b : {};
  return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].sort().map(id => [id, mergeGeneticsScopeState(id, left[id], right[id])]));
}
export function geneticsRecordTime(value: unknown) {
  if (!object(value)) return 0;
  const sourceAt = object(value.source) && typeof value.source.addedAt === 'string' ? Date.parse(value.source.addedAt) : 0;
  return Math.max(clock(value.updatedAt) ? value.updatedAt : 0, clock(sourceAt) ? sourceAt : 0);
}
export function geneticsScopeRemoved(lifecycle: unknown, scope: GeneticsScope) {
  const state = mergeGeneticsLifecycle(lifecycle, null)[scope]; return !!state && state.deletedAt > 0 && state.deletedAt >= state.restoredAt;
}
export function geneticsRecordAllowed(lifecycle: unknown, value: unknown, maternal = false) {
  const states = mergeGeneticsLifecycle(lifecycle, null);
  for (const scope of maternal ? ['genome', 'maternal'] as const : ['genome'] as const) {
    const state = states[scope];
    if (!state) continue;
    if (state.deletedAt > 0 && state.deletedAt >= state.restoredAt) return false;
    // A stale, even future-dated value cannot join a later restoration generation.
    if (state.restoredAt > 0 && (!object(value) || value[scope === 'genome' ? 'genomeGeneration' : 'maternalGeneration'] !== state.restoredAt)) return false;
  }
  return true;
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function fresher(a: unknown, b: unknown) {
  if (a == null) return b; if (b == null) return a;
  const left = geneticsRecordTime(a), right = geneticsRecordTime(b);
  return left !== right ? left > right ? a : b : left > 0 && canonical(a) > canonical(b) ? a : b;
}
export function mergeGeneticsMetadata(a: unknown, b: unknown, lifecycle: unknown) {
  const left = object(a) ? a : {}, right = object(b) ? b : {}, states = mergeGeneticsLifecycle(lifecycle, null);
  const allowedLeft = geneticsRecordAllowed(states, left), allowedRight = geneticsRecordAllowed(states, right);
  const metadata = fresher(allowedLeft ? left : undefined, allowedRight ? right : undefined);
  const result: Record<string, unknown> = structuredClone({ ...(allowedLeft ? left : {}), ...(allowedRight ? right : {}), ...(object(metadata) ? metadata : {}) });
  if (!['mtdna', 'mtdnaHistory'].some(key => Object.hasOwn(left, key) || Object.hasOwn(right, key)) && !states.maternal) return result;
  const current = fresher(geneticsRecordAllowed(states, left.mtdna, true) ? left.mtdna : undefined,
    geneticsRecordAllowed(states, right.mtdna, true) ? right.mtdna : undefined);
  if (current != null) {
    result.mtdna = structuredClone(current);
    const owner = current === left.mtdna ? left : right;
    if (Array.isArray(owner.mtdnaHistory)) result.mtdnaHistory = owner.mtdnaHistory.filter(report => geneticsRecordAllowed(states, report, true)).map(report => structuredClone(report));
    else delete result.mtdnaHistory;
  } else {
    if (states.maternal || left.mtdna === null || right.mtdna === null) result.mtdna = null; else delete result.mtdna;
    if (geneticsScopeRemoved(states, 'maternal')) delete result.mtdnaHistory;
    else if (Array.isArray(result.mtdnaHistory)) result.mtdnaHistory = result.mtdnaHistory.filter(report => geneticsRecordAllowed(states, report, true));
  }
  return result;
}
export function reconcileGeneticsLifecycle(data: GeneticsLifecycleData) {
  const states = mergeGeneticsLifecycle(data.geneticsLifecycle, null);
  if (!Object.keys(states).length) return;
  if (geneticsScopeRemoved(states, 'genome')) { delete data.genetics; return; }
  if (!object(data.genetics)) return;
  const before = data.genetics, calls = before.snps;
  const next = mergeGeneticsMetadata(before, before, states);
  if (object(calls)) next.snps = Object.fromEntries(Object.entries(calls).filter(([, call]) => geneticsRecordAllowed(states, call)));
  data.genetics = next;
}
function scopeMutationTime(data: GeneticsLifecycleData, at: number) {
  if (!clock(at)) throw new Error('The genetics change time is invalid.');
  const genetics = object(data.genetics) ? data.genetics : {}, snps = object(genetics.snps) ? genetics.snps : {};
  const lifecycle = mergeGeneticsLifecycle(data.geneticsLifecycle, null);
  let latest = Math.max(0, geneticsRecordTime(genetics), geneticsRecordTime(genetics.mtdna));
  for (const value of Object.values(snps)) latest = Math.max(latest, geneticsRecordTime(value));
  for (const value of Object.values(object(data.geneticsSnpTombstones) ? data.geneticsSnpTombstones : {})) if (object(value) && clock(value.updatedAt)) latest = Math.max(latest, value.updatedAt);
  for (const value of Object.values(lifecycle)) latest = Math.max(latest, value.updatedAt);
  const time = Math.max(1, at, latest + 1); if (!clock(time)) throw new Error('The genetics change clock cannot be advanced safely.'); return time;
}
export function removeGeneticsScope(data: GeneticsLifecycleData, scope: GeneticsScope, at = Date.now()) {
  const states = mergeGeneticsLifecycle(data.geneticsLifecycle, null), time = scopeMutationTime(data, at);
  states[scope] = { deletedAt: time, restoredAt: states[scope]?.restoredAt || 0, updatedAt: time }; data.geneticsLifecycle = states;
  if (scope === 'genome') delete data.genetics;
  else if (object(data.genetics)) { data.genetics.mtdna = null; delete data.genetics.mtdnaHistory; }
}
export function beginGeneticsMutation(data: GeneticsLifecycleData, scope: 'snp' | 'maternal', at: number, restore: boolean) {
  const states = mergeGeneticsLifecycle(data.geneticsLifecycle, null), genomeRemoved = geneticsScopeRemoved(states, 'genome'), maternalRemoved = scope === 'maternal' && geneticsScopeRemoved(states, 'maternal');
  if ((genomeRemoved || maternalRemoved) && !restore) throw new Error('This genetic data was removed. An explicit restoration review is required.');
  reconcileGeneticsLifecycle(data);
  const value = object(data.genetics) ? data.genetics : {}, previous = scope === 'maternal' ? geneticsRecordTime(value.mtdna) : 0;
  const time = Math.max(1, at, previous + 1, ...Object.values(states).map(state => state.updatedAt + 1));
  if (!clock(time)) throw new Error('The genetics change clock cannot be advanced safely.');
  for (const id of [genomeRemoved ? 'genome' : null, maternalRemoved ? 'maternal' : null] as const) if (id) states[id] = { deletedAt: states[id]!.deletedAt, restoredAt: time, updatedAt: time };
  if (Object.keys(states).length) data.geneticsLifecycle = states;
  const current: Record<string, unknown> = object(data.genetics) ? data.genetics : { source: null, importDate: null, coverage: { found: 0, total: 0 }, effects: {}, snps: {} };
  data.genetics = current; current.updatedAt = Math.max(geneticsRecordTime(current), time);
  if (states.genome?.restoredAt) current.genomeGeneration = states.genome.restoredAt;
  return time;
}
export function stampGeneticsRecord(data: GeneticsLifecycleData, record: object, maternal = false) {
  if (!object(record)) throw new Error('A genetics record must be an object.');
  const states = mergeGeneticsLifecycle(data.geneticsLifecycle, null);
  if (states.genome?.restoredAt) record.genomeGeneration = states.genome.restoredAt;
  if (maternal && states.maternal?.restoredAt) record.maternalGeneration = states.maternal.restoredAt;
}
export function geneticsMetadataNeedsRebroadcast(local: GeneticsLifecycleData, remote: GeneticsLifecycleData) {
  const left = mergeGeneticsLifecycle(local.geneticsLifecycle, null), right = mergeGeneticsLifecycle(remote.geneticsLifecycle, null), combined = mergeGeneticsLifecycle(left, right);
  if (Object.entries(left).some(([id, state]) => state.deletedAt > (right[id as GeneticsScope]?.deletedAt || 0) || state.restoredAt > (right[id as GeneticsScope]?.restoredAt || 0))) return true;
  const remoteMetadata = geneticsRecordAllowed(combined, remote.genetics) ? remote.genetics : null;
  const newer = (a: unknown, b: unknown) => geneticsRecordTime(a) > geneticsRecordTime(b)
    || geneticsRecordTime(a) > 0 && geneticsRecordTime(a) === geneticsRecordTime(b) && canonical(fresher(a, b)) !== canonical(b);
  if (geneticsRecordAllowed(combined, local.genetics) && newer(local.genetics, remoteMetadata)) return true;
  const a = object(local.genetics) ? local.genetics.mtdna : null, candidate = object(remote.genetics) ? remote.genetics.mtdna : null;
  const b = geneticsRecordAllowed(combined, candidate, true) ? candidate : null;
  return a != null && geneticsRecordAllowed(combined, a, true) && newer(a, b);
}
