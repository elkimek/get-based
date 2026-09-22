import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { observeAgentProcess, assertAgentNotAborted } from '../lib/agent-process-lifecycle.js';
function child() { return Object.assign(new EventEmitter(), { stdin: new EventEmitter(), kill: vi.fn() }); }
it.each([0, 2, null])('reports process exit %s without killing an exited child', async code => {
  const process = child(), observer = observeAgentProcess(process);
  process.emit('exit', code);
  await expect(observer.completion).resolves.toBe(code);
  observer.dispose(); expect(process.kill).not.toHaveBeenCalled();
});
it.each(['process', 'stdin'])('observes %s errors before a caller starts awaiting', async kind => {
  const process = child(), observer = observeAgentProcess(process);
  const failure = new Error('pipe failure');
  (kind === 'stdin' ? process.stdin : process).emit('error', failure);
  await Promise.resolve();
  await expect(observer.completion).rejects.toBe(failure);
  observer.dispose(); expect(process.kill).toHaveBeenCalledOnce();
});
it('kills only once despite abort, repeated stop and dispose', async () => {
  const process = child(), controller = new AbortController();
  const observer = observeAgentProcess(process, controller.signal);
  controller.abort(); observer.stop(); observer.dispose();
  await expect(observer.completion).rejects.toMatchObject({ name: 'AbortError' });
  expect(process.kill).toHaveBeenCalledOnce();
  expect(() => process.emit('error', new Error('late failure'))).not.toThrow();
});
it('settles cancellation even if kill itself throws', async () => {
  const process = child(); process.kill.mockImplementation(() => { throw new Error('kill failed'); });
  const observer = observeAgentProcess(process); observer.stop();
  await expect(observer.completion).rejects.toMatchObject({ name: 'AbortError' }); observer.dispose();
});
it('recognizes cancellation before subscribing', async () => {
  const process = child(), controller = new AbortController(); controller.abort();
  expect(() => assertAgentNotAborted(controller.signal)).toThrow('cancelled');
  const observer = observeAgentProcess(process, controller.signal);
  await expect(observer.completion).rejects.toMatchObject({ name: 'AbortError' });
  observer.dispose(); expect(process.kill).toHaveBeenCalledOnce();
});
it('accepts absent cancellation and children without piped stdin', async () => {
  expect(() => assertAgentNotAborted()).not.toThrow();
  const process = child(); delete process.stdin;
  const observer = observeAgentProcess(process); process.emit('exit', 0);
  await expect(observer.completion).resolves.toBe(0); observer.dispose();
});
it('retries cleanup after child stdio closes without delaying cancellation', async () => {
  const process = child(), observer = observeAgentProcess(process);
  const cleanup = vi.fn().mockResolvedValue(undefined);
  observer.dispose(cleanup);
  await expect(observer.completion).rejects.toMatchObject({ name: 'AbortError' });
  expect(cleanup).not.toHaveBeenCalled();
  process.emit('close', null); process.emit('close', null);
  expect(cleanup).toHaveBeenCalledOnce();
});
it('does not retain a cleanup listener for an already closed child', async () => {
  const process = child(), observer = observeAgentProcess(process);
  process.emit('exit', 0); process.emit('close', 0);
  await observer.completion;
  observer.dispose(vi.fn());
  expect(process.listenerCount('close')).toBe(0);
});
it('handles a failed deferred cleanup without an unhandled rejection', async () => {
  const process = child(), observer = observeAgentProcess(process);
  const cleanup = vi.fn().mockRejectedValue(new Error('still locked'));
  observer.dispose(cleanup); process.emit('close', null);
  await expect(observer.completion).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve(); expect(cleanup).toHaveBeenCalledOnce();
});
