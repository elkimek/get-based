// Profile snapshots are merged against the version the caller actually read.
// Web Locks order read/merge/write across tabs; the queue also covers test and
// older runtimes without Web Locks. Record arrays merge by stable identity.
import { DELTA_ARRAY_CONFIG } from './sync-delta-surface-config.js';
const baselines = new WeakMap();
const queues = new Map();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class ProfileWriteConflict extends Error {}

export function rememberProfileData(data, persisted = data) {
  if (object(data)) baselines.set(data, structuredClone(persisted));
}

export function profileDataBaseline(data) { return baselines.get(data); }

export function mergeProfileMutation(base, next, latest, path = '') {
  if (equal(base, next)) return structuredClone(latest);
  if (Array.isArray(next)) return mergeRecordArray(base, next, latest, path);
  if (!object(next)) return structuredClone(next);
  base = object(base) ? base : {};
  const merged = object(latest) ? structuredClone(latest) : {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || equal(base[key], next[key])) continue;
    if (!Object.hasOwn(next, key)) delete merged[key];
    else merged[key] = mergeProfileMutation(base[key], next[key], merged[key], path ? `${path}.${key}` : key);
  }
  return merged;
}

function recordKey(item, path) {
  if (path.startsWith('_deleted.') && typeof item === 'string') return item;
  return DELTA_ARRAY_CONFIG[path]?.itemIdFn?.(item) || (object(item) && typeof item.id === 'string' ? item.id : null);
}

function mergeRecordArray(base, next, latest, path) {
  if (equal(base, latest) || /^(biologyScoreAI|biologyScoreContextAI)(\.|$)/.test(path)) return structuredClone(next);
  const arrays = [base || [], next, latest || []];
  const keyed = arrays.every(items => Array.isArray(items) && items.every(item => recordKey(item, path))
    && (path === 'entries' || new Set(items.map(item => recordKey(item, path))).size === items.length));
  if (!keyed) {
    if (base !== undefined && !equal(next, latest)) throw new ProfileWriteConflict(`Concurrent edits to ${path || 'an unkeyed list'} require a reload before saving.`);
    return structuredClone(next);
  }
  const [before, after, current] = arrays.map(items => {
    const rows = new Map();
    for (const item of items) {
      const key = recordKey(item, path);
      if (path === 'entries') rows.set(key, [...(rows.get(key) || []), item]);
      else rows.set(key, item);
    }
    return rows;
  });
  for (const [key, item] of before) {
    if (!after.has(key)) current.delete(key);
    else if (current.has(key)) current.set(key, path === 'entries'
      ? mergeEntryPanels(item, after.get(key), current.get(key))
      : mergeProfileMutation(item, after.get(key), current.get(key), `${path}[]`));
    // A concurrently deleted record stays deleted; stale edits cannot revive it.
  }
  for (const [key, item] of after) {
    if (!before.has(key)) current.set(key, path === 'entries'
      ? mergeEntryPanels([], item, current.get(key) || [])
      : mergeProfileMutation({}, item, current.get(key), `${path}[]`));
  }
  return (path === 'entries' ? [...current.values()].flat() : [...current.values()]).map(item => structuredClone(item));
}

// A date is the sync address, not proof of one specimen or collection. Keep
// split-day panels intact; ambiguous concurrent panel edits must not be guessed.
function mergeEntryPanels(base, next, latest) {
  if (equal(base, next)) return latest;
  if (equal(base, latest) || equal(next, latest)) return next;
  if (!base.length) return [...latest, ...next.filter(panel => !latest.some(item => equal(item, panel)))];
  if (base.length === 1 && next.length === 1 && latest.length === 1) {
    return [mergeProfileMutation(base[0], next[0], latest[0], 'entries[]')];
  }
  throw new ProfileWriteConflict('Concurrent changes to same-day panels cannot be combined safely.');
}

// After a successful write, preserve conflicting unsaved lists and their old
// baseline. A later save must still detect the conflict, not overwrite its peer.
export function rebaseLiveProfileData(base, live, committed, path = '') {
  try { return { data: mergeProfileMutation(base, live, committed, path), baseline: structuredClone(committed), conflict: false }; }
  catch (error) {
    if (!(error instanceof ProfileWriteConflict)) throw error;
    if (!object(live)) return { data: structuredClone(live), baseline: structuredClone(base), conflict: true };
    const data = object(committed) ? structuredClone(committed) : {};
    const baseline = structuredClone(data);
    for (const key of new Set([...Object.keys(base || {}), ...Object.keys(live)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || equal(base?.[key], live[key])) continue;
      if (!Object.hasOwn(live, key)) { delete data[key]; continue; }
      const result = rebaseLiveProfileData(base?.[key], live[key], committed?.[key], path ? `${path}.${key}` : key);
      data[key] = result.data;
      if (result.baseline === undefined) delete baseline[key]; else baseline[key] = result.baseline;
    }
    return { data, baseline, conflict: true };
  }
}

// Keep references held by open forms and running sessions attached to live data.
export function adoptProfileData(target, source, path = '') {
  if (Array.isArray(target) && Array.isArray(source)) {
    const records = new Map();
    for (const item of target) {
      const key = recordKey(item, path);
      if (key) { if (!records.has(key)) records.set(key, []); records.get(key).push(item); }
    }
    const items = source.map((item, index) => {
      const key = recordKey(item, path);
      const candidates = key ? records.get(key) || [] : [target[index]];
      const match = candidates.findIndex(candidate => equal(candidate, item));
      const previous = match >= 0 ? candidates.splice(match, 1)[0] : candidates.length === 1 ? candidates.shift() : undefined;
      return adoptProfileData(previous, item, `${path}[]`);
    });
    target.splice(0, target.length, ...items);
    return target;
  }
  if (!object(target) || !object(source)) return structuredClone(source);
  for (const key of Object.keys(target)) if (!Object.hasOwn(source, key)) delete target[key];
  for (const key of Object.keys(source)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    target[key] = adoptProfileData(target[key], source[key], path ? `${path}.${key}` : key);
  }
  return target;
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
