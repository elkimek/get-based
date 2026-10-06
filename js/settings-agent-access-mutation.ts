// Awaited UI actions own only their Agent Access field changes and originating data.
import { saveImportedDataForProfile } from './data.js';
import { state } from './state.js';
import { profileDataBaseline } from './profile-data-writes.js';
import type { AgentAccessOperationScope } from './sync-messenger.js';
import { captureAgentAccessOperationScope, isAgentAccessMigrationDirty } from './sync-messenger.js';
const pending = new WeakSet<object>();
const fields = ['agentAccess', 'agentAccessWearableSeriesDays'] as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function canonical(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) => record(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
const equal = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
interface AgentAccessMutation {
  readonly scope: AgentAccessOperationScope;
  readonly persisted: boolean;
  captureApplied(): void;
  confirmPersisted(): void;
  save(reason: string): Promise<boolean>;
  isCurrent(): boolean;
  rollback(): void;
  release(): void;
}
function snapshot(data: typeof state.importedData): Record<string, unknown> {
  return Object.fromEntries(fields.map(field => [field, structuredClone(data[field])]));
}
function undo(before: unknown, applied: unknown, live: unknown): unknown {
  if (equal(before, applied)) return live;
  if (equal(applied, live)) return structuredClone(before);
  if (!record(applied) || !record(live)) return live;
  const base = record(before) ? before : {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(applied)])) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || equal(base[key], applied[key])) continue;
    const restored = undo(base[key], applied[key], live[key]);
    if (restored === undefined) delete live[key]; else live[key] = restored;
  }
  return live;
}
export function isAgentAccessMutationPending(): boolean { return pending.has(state.importedData); }
export function beginAgentAccessMutation(): AgentAccessMutation | null {
  const origin = state.importedData;
  if (pending.has(origin)) return null;
  const profileId = state.currentProfile;
  const baseData = structuredClone(origin);
  // A legacy record may still be awaiting its first durable write. Diff these
  // fields against the persisted baseline so a failed migration cannot make a
  // later credential save omit the unchanged context key or enabled state.
  const persistedData = profileDataBaseline(origin);
  if (isAgentAccessMigrationDirty() && persistedData) {
    for (const field of fields) {
      if (persistedData[field] === undefined) delete baseData[field];
      else baseData[field] = structuredClone(persistedData[field]);
    }
  }
  const before = snapshot(origin);
  const scope = captureAgentAccessOperationScope();
  let applied = before;
  let intent: typeof origin | null = null;
  let persisted = false;
  pending.add(origin);
  return {
    scope,
    get persisted() { return persisted; },
    confirmPersisted() {
      persisted = true;
      // The service adopts active data; preserve the committed change on a
      // detached origin too, without replacing later edits to the same fields.
      for (const field of fields) {
        const committed = undo(applied[field], before[field], origin[field]);
        if (committed === undefined) delete origin[field]; else origin[field] = committed;
      }
    },
    captureApplied() {
      applied = snapshot(origin);
      intent = structuredClone(baseData);
      for (const field of fields) {
        if (applied[field] === undefined) delete intent[field]; else intent[field] = structuredClone(applied[field]);
        const restored = undo(before[field], applied[field], origin[field]);
        if (restored === undefined) delete origin[field]; else origin[field] = restored;
      }
    },
    async save(reason) {
      if (!intent) throw new Error('Agent Access changes must be captured before saving');
      return saveImportedDataForProfile(profileId, intent, { baseData, forceProfileScope: true, reason });
    },
    isCurrent() { return scope.isCurrent() && fields.every(field => equal(origin[field], applied[field])); },
    rollback() {
      if (persisted) return;
      for (const field of fields) {
        const restored = undo(before[field], applied[field], origin[field]);
        if (restored === undefined) delete origin[field]; else origin[field] = restored;
      }
    },
    release() { pending.delete(origin); },
  };
}
