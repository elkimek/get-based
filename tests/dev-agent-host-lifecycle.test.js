import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { startDevAgentHost } from '../lib/dev-agent-host.js';

function fixture(overrides = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), exitCode: null, signalCode: null, kill: vi.fn() });
  const execFileSyncImpl = vi.fn(command => { if (command === 'codex') return 'codex 1.0'; throw new Error('missing'); });
  const prepareStorage = vi.fn(() => ({ token: 'private-token' }));
  const spawnImpl = vi.fn(() => child);
  const controller = startDevAgentHost({ root: '/fixture', env: { GETBASED_OPENCLAW_COMMAND: 'missing-openclaw' }, platform: 'linux', execFileSyncImpl, prepareStorage, spawnImpl, ...overrides });
  return { child, controller, execFileSyncImpl, prepareStorage, spawnImpl };
}
const banner = 'getbased Companion listening at http://127.0.0.1:8325\n';
const state = f => f.controller.describe().agents[0];
it('disabled discovery never probes, prepares or spawns', () => {
  const f = fixture({ env: { GETBASED_AUTO_AGENT_HOST: ' 0 ' } });
  expect(f.controller.describe()).toEqual({ agents: [] }); expect(f.controller.refresh()).toEqual({ agents: [] }); f.controller.close();
  expect(f.execFileSyncImpl).not.toHaveBeenCalled(); expect(f.prepareStorage).not.toHaveBeenCalled(); expect(f.spawnImpl).not.toHaveBeenCalled();
});
it('empty discovery can refresh descriptors without unexpectedly spawning', () => {
  const exec = vi.fn(() => { throw new Error('missing'); }); const f = fixture({ execFileSyncImpl: exec });
  expect(f.controller.describe().agents).toEqual([]);
  exec.mockImplementation(command => { if(command === 'codex')return 'codex 1.1'; throw new Error('missing'); });
  expect(f.controller.refresh().agents[0].version).toBe('codex 1.1'); f.controller.close(); expect(f.spawnImpl).not.toHaveBeenCalled();
});
it.each([new Error('storage denied'), 'denied'])('keeps unavailable storage fail-closed on refresh: %s', failure => {
  const f = fixture({ prepareStorage: () => { throw failure; } });
  expect(state(f)).toMatchObject({ compatible: false, status: 'unavailable' });
  expect(f.controller.refresh().agents[0]).toMatchObject({ compatible: false, status: 'unavailable' });
  f.controller.close(); expect(f.spawnImpl).not.toHaveBeenCalled();
});
it('disables watch and preserves configured strict port', () => {
  const f = fixture({ env: { GETBASED_AGENT_HOST_WATCH: '0', GETBASED_AGENT_HOST_PORT: '9001' } });
  expect(f.spawnImpl.mock.calls[0][1]).toEqual(['/fixture/server/agent-host-server.js']);
  expect(f.spawnImpl.mock.calls[0][2].env).toMatchObject({ GETBASED_AGENT_HOST_PORT: '9001', GETBASED_AGENT_HOST_STRICT_PORT: '1' }); f.controller.close();
});
it.each([10, 51, 60])('recognizes a readiness banner split at byte %s', split => {
  const f = fixture(); f.child.stdout.emit('data', banner.slice(0, split)); f.child.stdout.emit('data', banner.slice(split));
  expect(state(f)).toMatchObject({ status: 'available', endpoint: 'http://127.0.0.1:8325', token: 'private-token' }); f.controller.close();
});
it('does not accept a partial port before the readiness line is complete', () => {
  const f = fixture(); f.child.stdout.emit('data', 'getbased Companion listening at http://127.0.0.1:8');
  expect(state(f).token).toBe(''); f.child.stdout.emit('data', '325\n'); expect(state(f).endpoint).toBe('http://127.0.0.1:8325'); f.controller.close();
});
it.each(['error', 'exit', 'close'])('does not re-expose credentials from late output after %s', event => {
  const f = fixture(); f.child.stdout.emit('data', banner);
  if(event === 'close') f.controller.close(); else f.child.emit(event, event === 'error' ? new Error('failed') : 1);
  f.child.stdout.emit('data', banner);
  expect(state(f)).toMatchObject({ status: 'unavailable', token: '' }); f.controller.close();
});
it('close is idempotent while SIGTERM is pending', () => {
  const f = fixture(); f.controller.close(); f.controller.close(); expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
});
it.each(['exitCode', 'signalCode'])('does not kill a terminated child with %s', property => {
  const f = fixture(); f.child[property] = property === 'exitCode' ? 0 : 'SIGTERM'; f.controller.close(); expect(f.child.kill).not.toHaveBeenCalled();
});
it('updates discovered versions without spawning another child', () => {
  const f = fixture(); f.child.stdout.emit('data', banner);
  f.execFileSyncImpl.mockImplementation(command => { if(command === 'codex')return 'codex 2.0'; throw new Error('missing'); });
  expect(f.controller.refresh().agents[0]).toMatchObject({ version: 'codex 2.0', status: 'available' });
  expect(f.spawnImpl).toHaveBeenCalledOnce(); f.controller.close();
});
it.each(['0','65536','8325suffix','8325/'])('rejects malformed readiness port %s', port => {
  const f = fixture(); f.child.stdout.emit('data', `getbased Companion listening at http://127.0.0.1:${port}\n`);
  expect(state(f).token).toBe(''); expect(state(f).status).toBe('starting'); f.controller.close();
});
it('accepts a legacy banner with CRLF amid unrelated output', () => {
  const f = fixture(); f.child.stdout.emit('data', 'starting\r\ngetbased Agent Host listening at http://127.0.0.1:8327\r\nready\n');
  expect(state(f)).toMatchObject({status:'available',endpoint:'http://127.0.0.1:8327'}); f.controller.close();
});
it('recovers after an oversized unterminated diagnostic line', () => {
  const f = fixture(); f.child.stdout.emit('data','x'.repeat(20000)); f.child.stdout.emit('data','\n'+banner);
  expect(state(f).endpoint).toBe('http://127.0.0.1:8325'); f.controller.close();
});
it('reports unverifiable Claude authentication without exposing a ready status', () => {
  const f = fixture({env:{GETBASED_ENABLE_CLAUDE_AGENT:'api-console'},execFileSyncImpl:(command,args)=>{
    if(command==='claude'&&args[0]==='--version')return 'Claude 2.1';throw new Error('auth unavailable');
  }});
  f.child.stdout.emit('data',banner); expect(state(f)).toMatchObject({status:'login_required',message:expect.stringContaining('could not be verified')}); f.controller.close();
});
