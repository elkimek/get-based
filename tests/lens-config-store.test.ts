// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as blobs from '../js/blob-storage.js';
import { commitLensConfigValue, replaceLensConfigRaw, readCommittedLensConfigRaw, noteLegacyLensConfigWrite, LENS_CONFIG_STORAGE_KEY as key, LENS_CONFIG_COMMIT_KEY as receiptKey } from '../js/lens-config-store.js';
const initial = '{"topK":5,"private":"private-source-sentinel"}', next = '{"topK":3,"private":"private-source-sentinel"}';
const write = (raw: string | null) => { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); };
const prepare = (raw: string | null) => ({ raw, value: raw, publish: () => write(raw) });
beforeEach(async () => { vi.restoreAllMocks(); await blobs.deleteBlob(receiptKey, { throwOnError: true }); await replaceLensConfigRaw(initial); });
afterEach(() => { vi.restoreAllMocks(); });
it('rejects a stale Storage snapshot using a fresh committed cross-process value', async () => {
  await commitLensConfigValue(() => prepare(next), { expectedRaw: initial }); const read = Storage.prototype.getItem, set = Storage.prototype.setItem; let stale = true;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, name) { return name === key && stale ? initial : read.call(this, name); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key) stale = false; set.call(this, name, value); });
  const proposed = vi.fn(() => prepare('{"topK":7}')); await expect(commitLensConfigValue(proposed, { expectedRaw: initial })).rejects.toMatchObject({ noChangeApplied: true }); expect(proposed).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBe(next); expect(await blobs.getBlob(receiptKey)).toMatchObject({ raw: next });
});
it('keeps mirror and durable source unchanged if publishing fails before a write', async () => {
  const before = await blobs.getBlob(receiptKey), original = Storage.prototype.setItem;
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key) throw new Error('Synthetic mirror blocked'); original.call(this, name, value); });
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).rejects.toThrow('Synthetic mirror blocked'); expect(await blobs.getBlob(receiptKey)).toEqual(before); expect(localStorage.getItem(key)).toBe(initial);
  failure.mockRestore(); await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).resolves.toBe(next);
});
it('rolls back its own mirror after failed durable acknowledgement and supports retry', async () => {
  const before = await blobs.getBlob(receiptKey), failure = vi.spyOn(blobs, 'setBlob').mockRejectedValue(new Error('Synthetic durable save failure'));
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).rejects.toThrow('Synthetic durable save failure'); expect(localStorage.getItem(key)).toBe(initial); expect(await blobs.getBlob(receiptKey)).toEqual(before);
  failure.mockRestore(); await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).resolves.toBe(next);
});
it('retains a positively acknowledged commit when a postcommit observer throws', async () => {
  const original = blobs.setBlob; vi.spyOn(blobs, 'setBlob').mockImplementation(async (name, value) => { await original(name, value); throw new Error('Synthetic postcommit observer'); });
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).resolves.toBe(next); expect(localStorage.getItem(key)).toBe(next); expect(await blobs.getBlob(receiptKey)).toMatchObject({ raw: next });
});
it('reports an unconfirmed save if failed durable acknowledgement cannot roll back the mirror', async () => {
  const before = await blobs.getBlob(receiptKey), original = Storage.prototype.setItem;
  vi.spyOn(blobs, 'setBlob').mockRejectedValue(new Error('Synthetic durable save failure'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) { if (name === key && value === initial) throw new Error('Synthetic rollback blocked'); original.call(this, name, value); });
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).rejects.toMatchObject({ requiresReview: true, message: expect.stringContaining('could not be confirmed') }); expect(localStorage.getItem(key)).toBe(next); expect(await blobs.getBlob(receiptKey)).toEqual(before);
});
it('accepts an explicit synchronous compatibility write only while its captured durable source is unchanged', async () => {
  const legacy = '{"topK":8}'; write(legacy); noteLegacyLensConfigWrite(); await blobs.getBlob(receiptKey);
  expect(await readCommittedLensConfigRaw()).toBe(legacy); await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: legacy })).resolves.toBe(next);
});
it('does not let an older compatibility intent overwrite a newer peer commit', async () => {
  const legacy = '{"topK":8}'; write(legacy); noteLegacyLensConfigWrite(); await blobs.getBlob(receiptKey);
  await blobs.setBlob(receiptKey, { version: 1, id: 'newer-peer', raw: next }); await expect(commitLensConfigValue(() => prepare('{"topK":9}'), { expectedRaw: legacy })).rejects.toMatchObject({ noChangeApplied: true }); expect(await blobs.getBlob(receiptKey)).toMatchObject({ id: 'newer-peer', raw: next }); expect(localStorage.getItem(key)).toBe(next);
});
it('treats removal as a committed state that stale peers cannot resurrect', async () => {
  await replaceLensConfigRaw(null); write(initial);
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).rejects.toMatchObject({ noChangeApplied: true }); expect(localStorage.getItem(key)).toBeNull(); expect(await blobs.getBlob(receiptKey)).toMatchObject({ raw: null });
});
it('holds the shared save owner through private cleanup before a replacement can commit', async () => {
  let release!: () => void, started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }); const events: string[] = [];
  const removing = commitLensConfigValue(() => prepare(null), { expectedRaw: initial, afterCommit: async () => { events.push('cleanup-start'); started(); await gate; events.push('cleanup-end'); } }); await ready;
  const replacing = commitLensConfigValue(() => ({ ...prepare(next), publish() { events.push('replacement'); write(next); } }));
  try { await Promise.resolve(); expect(events).toEqual(['cleanup-start']); } finally { release(); }
  await Promise.all([removing, replacing]); expect(events).toEqual(['cleanup-start', 'cleanup-end', 'replacement']);
});
it('refuses malformed commit history without disclosing or replacing its contents', async () => {
  const corrupt = { version: 999, private: 'private-journal-sentinel' }; await blobs.setBlob(receiptKey, corrupt);
  await expect(commitLensConfigValue(() => prepare(next), { expectedRaw: initial })).rejects.toThrow('settings history needs review'); expect(localStorage.getItem(key)).toBe(initial); expect(await blobs.getBlob(receiptKey)).toEqual(corrupt);
});
