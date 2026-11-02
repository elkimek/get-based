// Browser-wide configuration writes share one queue and cross-tab Web Lock.
import { getBlob, setBlob } from './blob-storage.js';
import { createUniqueId } from './unique-id.js';
export const LENS_CONFIG_STORAGE_KEY = 'labcharts-lens-config';
export const LENS_CONFIG_COMMIT_KEY = 'labcharts-lens-config-commit-v1';
interface ConfigCommit { version: 1; id: string; raw: string | null }
type LegacyIntent = { read: Promise<{ ok: true; value: ConfigCommit | null } | { ok: false; error: unknown }> };
let legacyIntent: LegacyIntent | null = null;
let pending: Promise<unknown> = Promise.resolve();
export function queueLensConfigWrite<T>(write: () => T | Promise<T>): Promise<T> {
  const run = () => typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('getbased-knowledge-settings', write) : write();
  const result = pending.then(run, run); pending = result.then(() => undefined, () => undefined); return result;
}
export function knowledgeSettingsConflict(): Error & { noChangeApplied: true } {
  return Object.assign(new Error('Knowledge Base settings or the open settings draft changed. Review a fresh proposal. Nothing was applied.'), { noChangeApplied: true as const });
}

async function readCommit(): Promise<ConfigCommit | null> {
  const record = await getBlob<unknown>(LENS_CONFIG_COMMIT_KEY);
  if (record === null) return null;
  if (!record || typeof record !== 'object' || !('version' in record) || record.version !== 1 || !('id' in record) || typeof record.id !== 'string' || !record.id || record.id.length > 128 || !('raw' in record) || record.raw !== null && (typeof record.raw !== 'string' || record.raw.length > 128 * 1024)) throw new Error('Knowledge Base settings history needs review before another save.');
  return record as ConfigCommit;
}
/** Compatibility writes remain synchronous; capture their preceding committed
 * source so a later maintained save can distinguish an explicit local change
 * from an asynchronously replicated, stale cross-process Storage snapshot. */
export function noteLegacyLensConfigWrite() {
  legacyIntent = { read: readCommit().then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })) };
}
function writeMirror(raw: string | null) {
  if (raw === null) localStorage.removeItem(LENS_CONFIG_STORAGE_KEY);
  else localStorage.setItem(LENS_CONFIG_STORAGE_KEY, raw);
}
export function readCommittedLensConfigRaw(): Promise<string | null> {
  const intent = legacyIntent;
  return queueLensConfigWrite(async () => {
    const legacy = intent ? await intent.read : null; if (legacy && !legacy.ok) throw legacy.error;
    const durable = await readCommit(), local = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
    if (durable && local !== durable.raw && !(legacy?.ok && (legacy.value?.id ?? null) === durable.id)) { writeMirror(durable.raw); return durable.raw; }
    return local;
  });
}
export function commitLensConfigValue<T>(prepare: () => { raw: string | null; value: T; publish(): void }, options: { expectedRaw?: string | null; canCommit?: () => boolean; afterCommit?: () => Promise<unknown> } = {}): Promise<T> {
  const intent = legacyIntent;
  return queueLensConfigWrite(async () => {
    const durable = await readCommit(), legacy = Object.hasOwn(options, 'expectedRaw') && intent ? await intent.read : null;
    if (legacy && !legacy.ok) throw legacy.error;
    const before = localStorage.getItem(LENS_CONFIG_STORAGE_KEY);
    if (options.canCommit && !options.canCommit() || Object.hasOwn(options, 'expectedRaw') && before !== options.expectedRaw) throw knowledgeSettingsConflict();
    const explicitLocal = legacy?.ok && (durable?.id ?? null) === (legacy.value?.id ?? null);
    if (Object.hasOwn(options, 'expectedRaw') && durable && durable.raw !== options.expectedRaw && !explicitLocal) {
      // Publish the already accepted peer value into this stale Storage mirror.
      // All maintained raw restores/sync writes enter this same owner.
      writeMirror(durable.raw); throw knowledgeSettingsConflict();
    }
    const next = prepare();
    if (next.raw !== null && next.raw.length > 128 * 1024) throw new Error('Knowledge Base settings exceed the supported save size.');
    const receipt: ConfigCommit = { version: 1, id: createUniqueId('lens-config-'), raw: next.raw };
    if (options.canCommit && !options.canCommit() || localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== before) throw knowledgeSettingsConflict();
    try { next.publish(); }
    catch (error) { if (localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== next.raw) throw error; }
    if (localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== next.raw) throw new Error('Knowledge Base settings changed during the save. Review them before retrying.');
    try { await setBlob(LENS_CONFIG_COMMIT_KEY, receipt); }
    catch (error) {
      let accepted = false; try { accepted = (await readCommit())?.id === receipt.id; } catch { /* Retain the failed acknowledgement. */ }
      if (!accepted) {
        try { if (localStorage.getItem(LENS_CONFIG_STORAGE_KEY) === next.raw) { writeMirror(before); if (localStorage.getItem(LENS_CONFIG_STORAGE_KEY) !== before) throw new Error('Settings changed during rollback'); } }
        catch (rollbackError) {
          if (legacyIntent === intent) legacyIntent = null;
          throw Object.assign(new Error('Knowledge Base save could not be confirmed. Reopen settings to review before retrying.', { cause: new AggregateError([error, rollbackError]) }), { requiresReview: true as const });
        }
        throw error;
      }
    }
    if (legacyIntent === intent) legacyIntent = null;
    await options.afterCommit?.();
    return next.value;
  });
}
/** Explicit restore/sync input supersedes the whole browser configuration. */
export function replaceLensConfigRaw(raw: string | null) {
  return commitLensConfigValue(() => ({ raw, value: undefined, publish: () => writeMirror(raw) }));
}
