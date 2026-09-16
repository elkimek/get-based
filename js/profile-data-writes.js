// Profile snapshots are merged against the version the caller actually read.
// Web Locks order read/merge/write across tabs; the queue also covers test and
// older runtimes without Web Locks. Arrays are deliberate field replacements.
const baselines = new WeakMap();
const queues = new Map();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function rememberProfileData(data, persisted = data) {
  if (object(data)) baselines.set(data, structuredClone(persisted));
}

export function profileDataBaseline(data) { return baselines.get(data); }

export function mergeProfileMutation(base, next, latest) {
  if (equal(base, next)) return structuredClone(latest);
  if (!object(next)) return structuredClone(next);
  base = object(base) ? base : {};
  const merged = object(latest) ? structuredClone(latest) : {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || equal(base[key], next[key])) continue;
    if (!Object.hasOwn(next, key)) delete merged[key];
    else merged[key] = mergeProfileMutation(base[key], next[key], merged[key]);
  }
  return merged;
}

export function queueProfileDataWrite(profileId, write) {
  const run = () => globalThis.navigator?.locks?.request
    ? navigator.locks.request(`getbased-profile-data:${profileId}`, write) : write();
  const pending = (queues.get(profileId) || Promise.resolve()).then(run);
  const settled = pending.catch(() => {});
  queues.set(profileId, settled);
  void settled.then(() => { if (queues.get(profileId) === settled) queues.delete(profileId); });
  return pending;
}
