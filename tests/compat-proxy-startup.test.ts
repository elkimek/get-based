import { fileURLToPath } from 'node:url';
// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
type ServerFixture = EventEmitter & { listen: Mock<(port: number, host: string, callback: () => void) => void>; close: Mock<(callback: () => void) => void>; requestTimeout?: number; headersTimeout?: number; keepAliveTimeout?: number; maxRequestsPerSocket?: number };
type FixtureState = { server: ServerFixture | null; signals: Partial<Record<PropertyKey, (...args: unknown[]) => void>>; error: Error | null };
const state = vi.hoisted((): FixtureState => ({ server: null, signals: {}, error: null }));
vi.mock('node:http', () => ({ createServer: () => state.server }));
import { startCompatProxyServer } from '../server/compat-proxy-server.js';
beforeEach(() => {
  vi.useFakeTimers(); state.signals = {}; state.error = null;
  state.server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port: number, _host: string, callback: () => void) => { if (state.error) state.server!.emit('error', state.error); else callback(); }),
    close: vi.fn((callback: () => void) => callback()),
  });
  for (const key of ['COMPAT_PROXY_BIND', 'COMPAT_PROXY_PORT', 'COMPAT_PROXY_REQUEST_TIMEOUT_MS']) vi.stubEnv(key, '');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  (vi.spyOn(process, 'exit').mockImplementation as (implementation: (...args: Parameters<typeof process.exit>) => void) => unknown)(() => {});
  const once = process.once.bind(process);
  vi.spyOn(process, 'once').mockImplementation((event, callback) => {
    if (['SIGINT', 'SIGTERM'].includes(event as string)) { state.signals[event] = callback; return process; }
    return once(event, callback);
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('uses default bind, port and HTTP resource limits', async () => {
  const server = await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)();
  expect(server.listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
  expect(server).toMatchObject({ requestTimeout: 190000, headersTimeout: 10000, keepAliveTimeout: 5000, maxRequestsPerSocket: 1000 });
});
it('honors configured listener and request timeout', async () => {
  vi.stubEnv('COMPAT_PROXY_BIND', '127.0.0.1'); vi.stubEnv('COMPAT_PROXY_PORT', '9123'); vi.stubEnv('COMPAT_PROXY_REQUEST_TIMEOUT_MS', '4000');
  const server = await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)();
  expect(server.listen).toHaveBeenCalledWith(9123, '127.0.0.1', expect.any(Function)); expect(server.requestTimeout).toBe(4000);
});
it.each(['0', '65536', 'bad'])('falls back from invalid port %s', async port => {
  vi.stubEnv('COMPAT_PROXY_PORT', port); await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)();
  expect(state.server!.listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
});
it.each(['999', '190001', 'bad'])('falls back from invalid timeout %s', async timeout => {
  vi.stubEnv('COMPAT_PROXY_REQUEST_TIMEOUT_MS', timeout);
  expect((await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)()).requestTimeout).toBe(190000);
});
it('propagates bind failure without installing shutdown handlers', async () => {
  state.error = new Error('port busy'); await expect(startCompatProxyServer()).rejects.toThrow('port busy');
  expect(state.signals).toEqual({}); expect(vi.getTimerCount()).toBe(0);
});
it.each(['SIGINT', 'SIGTERM'])('drains exactly once on %s and cancels the forced exit', async signal => {
  await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)(); state.signals[signal]!(); state.signals.SIGINT!(); state.signals.SIGTERM!();
  expect(state.server!.close).toHaveBeenCalledOnce(); expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(10000); expect(process.exit).toHaveBeenCalledOnce();
});
it('forces exit when an active response never drains', async () => {
  await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)(); state.server!.close.mockImplementation(() => {});
  state.signals.SIGTERM!(); await vi.advanceTimersByTimeAsync(10000); expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
});
it.each([true, false])('handles parser errors with socket writable=%s', async writable => {
  await (startCompatProxyServer as () => Promise<{ listen: unknown; requestTimeout?: number }>)(); const socket = { writable, end: vi.fn() };
  state.server!.emit('clientError', new Error('private payload'), socket);
  if (writable) expect(socket.end).toHaveBeenCalledExactlyOnceWith('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  else expect(socket.end).not.toHaveBeenCalled();
});


it('masks a direct executable startup failure and exits unsuccessfully', async () => {
  state.error = new Error('private bind failure');
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const previousArgv = process.argv;
  process.argv = [previousArgv[0]!, fileURLToPath(new URL('../server/compat-proxy-server.js', import.meta.url))];
  try {
    vi.resetModules();
    await import('../server/compat-proxy-server.js');
    await vi.dynamicImportSettled();
    expect(stderr).toHaveBeenCalledExactlyOnceWith('Compatibility relay failed to start\n');
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(state.signals).toEqual({});
  } finally { process.argv = previousArgv; }
});
