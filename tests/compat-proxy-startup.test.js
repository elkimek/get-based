// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ server: null, signals: {}, error: null }));
vi.mock('node:http', () => ({ createServer: () => state.server }));
import { startCompatProxyServer } from '../server/compat-proxy-server.js';
beforeEach(() => {
  vi.useFakeTimers(); state.signals = {}; state.error = null;
  state.server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port, _host, callback) => { if (state.error) state.server.emit('error', state.error); else callback(); }),
    close: vi.fn(callback => callback()),
  });
  for (const key of ['COMPAT_PROXY_BIND', 'COMPAT_PROXY_PORT', 'COMPAT_PROXY_REQUEST_TIMEOUT_MS']) vi.stubEnv(key, '');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process, 'exit').mockImplementation(() => {});
  const once = process.once.bind(process);
  vi.spyOn(process, 'once').mockImplementation((event, callback) => {
    if (['SIGINT', 'SIGTERM'].includes(event)) { state.signals[event] = callback; return process; }
    return once(event, callback);
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it('uses default bind, port and HTTP resource limits', async () => {
  const server = await startCompatProxyServer();
  expect(server.listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
  expect(server).toMatchObject({ requestTimeout: 190000, headersTimeout: 10000, keepAliveTimeout: 5000, maxRequestsPerSocket: 1000 });
});
it('honors configured listener and request timeout', async () => {
  vi.stubEnv('COMPAT_PROXY_BIND', '127.0.0.1'); vi.stubEnv('COMPAT_PROXY_PORT', '9123'); vi.stubEnv('COMPAT_PROXY_REQUEST_TIMEOUT_MS', '4000');
  const server = await startCompatProxyServer();
  expect(server.listen).toHaveBeenCalledWith(9123, '127.0.0.1', expect.any(Function)); expect(server.requestTimeout).toBe(4000);
});
it.each(['0', '65536', 'bad'])('falls back from invalid port %s', async port => {
  vi.stubEnv('COMPAT_PROXY_PORT', port); await startCompatProxyServer();
  expect(state.server.listen).toHaveBeenCalledWith(8787, '0.0.0.0', expect.any(Function));
});
it.each(['999', '190001', 'bad'])('falls back from invalid timeout %s', async timeout => {
  vi.stubEnv('COMPAT_PROXY_REQUEST_TIMEOUT_MS', timeout);
  expect((await startCompatProxyServer()).requestTimeout).toBe(190000);
});
it('propagates bind failure without installing shutdown handlers', async () => {
  state.error = new Error('port busy'); await expect(startCompatProxyServer()).rejects.toThrow('port busy');
  expect(state.signals).toEqual({}); expect(vi.getTimerCount()).toBe(0);
});
it.each(['SIGINT', 'SIGTERM'])('drains exactly once on %s and cancels the forced exit', async signal => {
  await startCompatProxyServer(); state.signals[signal](); state.signals.SIGINT(); state.signals.SIGTERM();
  expect(state.server.close).toHaveBeenCalledOnce(); expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(10000); expect(process.exit).toHaveBeenCalledOnce();
});
it('forces exit when an active response never drains', async () => {
  await startCompatProxyServer(); state.server.close.mockImplementation(() => {});
  state.signals.SIGTERM(); await vi.advanceTimersByTimeAsync(10000); expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
});
it.each([true, false])('handles parser errors with socket writable=%s', async writable => {
  await startCompatProxyServer(); const socket = { writable, end: vi.fn() };
  state.server.emit('clientError', new Error('private payload'), socket);
  if (writable) expect(socket.end).toHaveBeenCalledExactlyOnceWith('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  else expect(socket.end).not.toHaveBeenCalled();
});
