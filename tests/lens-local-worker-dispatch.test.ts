import { afterEach, expect, it, vi } from 'vitest';
import { installLensLocalWorkerDispatch, LENS_LOCAL_STORAGE_LOCK } from '../js/lens-local-worker-dispatch.js';
import type { WorkerRequest, WorkerReply } from '../js/lens-local-protocol.js';
afterEach(() => vi.unstubAllGlobals());
it('serializes storage ownership, releases failed requests, and services ingest acknowledgement and abort while locked', async () => {
  let receive!: (event: MessageEvent<WorkerRequest>) => void, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), calls: string[] = [], replies: WorkerReply[] = [];
  let locked = false;
  vi.stubGlobal('navigator', { locks: { async request(name: string, operation: () => Promise<void>) { expect(name).toBe(LENS_LOCAL_STORAGE_LOCK); expect(locked).toBe(false); locked = true; try { await operation(); } finally { locked = false; } } } });
  installLensLocalWorkerDispatch({ location: { origin: 'http://fixture' }, addEventListener: (_: string, listener: unknown) => { receive = listener as typeof receive; }, postMessage: reply => replies.push(reply) } as Parameters<typeof installLensLocalWorkerDispatch>[0], {
    refresh: async message => { expect(locked).toBe(true); calls.push(`refresh:${message.type}`); },
    dispatch: async message => { calls.push(`start:${message.type}`); if (message.type === 'ingest') { await gate; throw Object.assign(new Error('Synthetic failed write'), { requiresReload: true }); } calls.push(`finish:${message.type}`); },
    abort: () => { expect(locked).toBe(true); calls.push('abort'); },
    acknowledgeIngest: () => { expect(locked).toBe(true); calls.push('commit'); release(); },
  });
  const send = (type: string, origin = '') => receive({ data: { type }, origin } as MessageEvent<WorkerRequest>);
  send('ingest'); send('list_libraries'); await vi.waitFor(() => expect(calls).toContain('start:ingest'));
  send('query', 'http://foreign'); send('abort'); send('commit_ingest'); await vi.waitFor(() => expect(calls).toContain('finish:list_libraries'));
  expect(calls).toEqual(['refresh:ingest', 'start:ingest', 'abort', 'commit', 'refresh:list_libraries', 'start:list_libraries', 'finish:list_libraries']); expect(locked).toBe(false); expect(replies).toEqual([{ type: 'error', message: 'Synthetic failed write', requiresReload: true }]);
});
it('retains cancellation received while an ingest waits for another tab to release storage', async () => {
  let receive!: (event: MessageEvent<WorkerRequest>) => void, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); let cancelled = false, finished = false;
  vi.stubGlobal('navigator', { locks: { async request(_: string, operation: () => Promise<void>) { await gate; await operation(); } } });
  installLensLocalWorkerDispatch({ location: { origin: 'http://fixture' }, addEventListener: (_type, listener) => { receive = listener; }, postMessage: () => {} }, {
    begin: (_message, aborted) => { cancelled = aborted; }, refresh: async () => {}, dispatch: async () => { expect(cancelled).toBe(true); finished = true; }, abort: () => {}, acknowledgeIngest: () => {},
  });
  receive({ data: { type: 'ingest' }, origin: '' } as MessageEvent<WorkerRequest>); receive({ data: { type: 'abort' }, origin: '' } as MessageEvent<WorkerRequest>); release(); await vi.waitFor(() => expect(finished).toBe(true));
});
