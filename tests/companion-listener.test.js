// @vitest-environment node
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { recoverCompanionListener } from '../lib/companion-listener.js';

describe('Companion listener recovery', () => {
  it('retries occupied ports then removes listeners on success', async () => {
    const server = new EventEmitter();
    server.listen = vi.fn(port => queueMicrotask(() => {
      if (port < 8326) server.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' }));
      else server.emit('listening');
    }));
    const onPort = vi.fn();
    await recoverCompanionListener(server, { host: '127.0.0.1', port: 8324, lastPort: 8326, onPort });
    expect(onPort.mock.calls.flat()).toEqual([8324, 8325, 8326]);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });

  it.each(['EADDRINUSE', 'EACCES', 'throw'])('rejects and cleans up after %s', async code => {
    const server = new EventEmitter();
    const error = Object.assign(new Error('cannot listen'), { code });
    server.listen = vi.fn(() => {
      if (code === 'throw') throw error;
      queueMicrotask(() => server.emit('error', error));
    });
    await expect(recoverCompanionListener(server, {
      host: '127.0.0.1', port: 8324, lastPort: 8324, onPort: vi.fn(),
    })).rejects.toBe(error);
    expect(server.listen).toHaveBeenCalledOnce();
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });
});
