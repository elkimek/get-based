import { beforeEach, expect, it, vi } from 'vitest';
import { encryptedSetItem } from '../js/crypto.js';
import { getCachedCustomPersonalities, saveCustomPersonalitiesToStorage } from '../js/chat-personality-storage.js';
vi.mock('../js/crypto.js', async original => ({ ...await original<typeof import('../js/crypto.js')>(), encryptedSetItem: vi.fn() }));
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const persona = (id: string) => ({ id: 'custom_' + id, name: id, icon: '🌿', promptText: 'Instructions ' + id });
async function tick() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
it('serializes accepted profile writes and keeps the latest optimistic catalog visible', async () => {
  const first = deferred(), second = deferred(); vi.mocked(encryptedSetItem).mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const a = saveCustomPersonalitiesToStorage([persona('a')], 'ordered'); await tick();
  const b = saveCustomPersonalitiesToStorage([...getCachedCustomPersonalities('ordered'), persona('b')], 'ordered'); await tick();
  expect(encryptedSetItem).toHaveBeenCalledTimes(1); expect(getCachedCustomPersonalities('ordered').map(p => p.name)).toEqual(['a', 'b']);
  first.resolve(); await a; await tick(); expect(encryptedSetItem).toHaveBeenCalledTimes(2); expect(getCachedCustomPersonalities('ordered').map(p => p.name)).toEqual(['a', 'b']);
  second.resolve(); await b; expect(JSON.parse(vi.mocked(encryptedSetItem).mock.calls[1]![1]).map((p: { name: string; }) => p.name)).toEqual(['a', 'b']);
});
it('restores the latest committed catalog when the next queued save fails', async () => {
  const first = deferred(), second = deferred(); vi.mocked(encryptedSetItem).mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const a = saveCustomPersonalitiesToStorage([persona('a')], 'rollback'); const b = saveCustomPersonalitiesToStorage([persona('a'), persona('b')], 'rollback'); const failed = expect(b).rejects.toThrow('Write failed');
  first.resolve(); await a; await tick(); second.reject(new Error('Write failed')); await failed;
  expect(getCachedCustomPersonalities('rollback').map(p => p.name)).toEqual(['a']);
});
it('does not serialize unrelated profiles behind a pending write', async () => {
  const first = deferred(); vi.mocked(encryptedSetItem).mockImplementationOnce(() => first.promise).mockResolvedValueOnce(undefined);
  const a = saveCustomPersonalitiesToStorage([persona('a')], 'blocked-origin'); await tick();
  await saveCustomPersonalitiesToStorage([persona('b')], 'independent'); expect(encryptedSetItem).toHaveBeenCalledTimes(2); first.resolve(); await a;
});
