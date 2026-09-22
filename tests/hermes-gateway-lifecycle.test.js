// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HermesGatewayClient } from '../lib/hermes-gateway-client.js';

class Socket extends EventEmitter {
  static instances = [];
  readyState = 0;
  frames = [];
  constructor() { super(); Socket.instances.push(this); }
  addEventListener(type, fn, options) { options?.once ? this.once(type, fn) : this.on(type, fn); }
  open() { this.readyState = 1; this.emit('open'); }
  send(raw) { this.frames.push(JSON.parse(raw)); }
  reply(frame, result = {}) { this.emit('message', { data: JSON.stringify({ id: frame.id, result }) }); }
  event(type, payload = {}, session_id = 'runtime') {
    this.emit('message', { data: JSON.stringify({ method: 'event', params: { type, payload, session_id } }) });
  }
  close() { this.readyState = 3; this.emit('close'); }
}
const clients = [];
function client(options = {}) {
  const instance = new HermesGatewayClient({ baseUrl: 'https://gateway.example', token: 'secret', WebSocketImpl: Socket, ...options });
  clients.push(instance);
  return instance;
}
async function connected() {
  const instance = client();
  const connecting = instance.connect();
  const socket = Socket.instances.at(-1);
  socket.open();
  await connecting;
  return { instance, socket };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => { Socket.instances = []; vi.useFakeTimers(); });
afterEach(async () => { for (const instance of clients.splice(0)) await instance.close(); vi.useRealTimers(); });

describe('Hermes connection lifecycle', () => {
  it('shares a pending handshake and reuses an open connection', async () => {
    const instance = client();
    const first = instance.connect(); const second = instance.connect();
    expect(Socket.instances).toHaveLength(1);
    Socket.instances[0].open();
    await Promise.all([first, second]); await instance.connect();
    expect(Socket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['close', 'error'])('rejects a handshake immediately on %s and allows retry', async event => {
    const instance = client();
    const result = expect(instance.connect()).rejects.toThrow(event === 'close' ? 'closed' : 'reached');
    Socket.instances[0].emit(event);
    await result;
    expect(vi.getTimerCount()).toBe(0);
    const retry = instance.connect(); Socket.instances[1].open(); await retry;
  });
  it('times out the handshake and ignores a late open', async () => {
    const instance = client();
    const result = expect(instance.connect()).rejects.toThrow('did not accept');
    await vi.advanceTimersByTimeAsync(10_000); await result;
    Socket.instances[0].open();
    expect(instance.socket).toBeNull();
  });
  it('cancels a handshake on restart without clearing the replacement handshake', async () => {
    const instance = client();
    const result = expect(instance.connect()).rejects.toThrow('closed');
    const old = Socket.instances[0];
    await instance.restart();
    const replacement = instance.connect();
    await result;
    old.open();
    const shared = instance.connect();
    expect(Socket.instances).toHaveLength(2);
    Socket.instances[1].open(); await Promise.all([replacement, shared]);
    expect(instance.socket).toBe(Socket.instances[1]);
  });
  it('ignores stale close and message events after reconnecting', async () => {
    const { instance, socket: old } = await connected();
    old.close();
    const pending = instance.request('health'); const socket = Socket.instances[1];
    socket.open(); await flush();
    const frame = socket.frames[0];
    old.reply(frame, { stale: true }); old.emit('close');
    expect(instance.pending.size).toBe(1);
    socket.reply(frame, { fresh: true });
    await expect(pending).resolves.toEqual({ fresh: true });
  });
  it('rejects in-flight RPC on close and removes its timeout', async () => {
    const { instance, socket } = await connected();
    const result = expect(instance.request('health')).rejects.toThrow('closed'); await flush();
    socket.close(); await result;
    expect(instance.pending.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans pending work even if socket.close throws', async () => {
    const { instance, socket } = await connected();
    const result = expect(instance.request('health')).rejects.toThrow('closed'); await flush();
    socket.close = () => { throw new Error('broken close'); };
    await instance.restart(); await result;
    expect(instance.pending.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('times out an RPC and ignores a late response', async () => {
    const { instance, socket } = await connected();
    const result = expect(instance.request('health', {}, 25)).rejects.toThrow('health timed out');
    await vi.advanceTimersByTimeAsync(25); await result;
    socket.reply(socket.frames[0]); expect(instance.pending.size).toBe(0);
  });
  it('cleans up a synchronous send failure', async () => {
    const { instance, socket } = await connected();
    socket.send = () => { throw new Error('send failed'); };
    await expect(instance.request('health')).rejects.toThrow('send failed');
    expect(instance.pending.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores malformed frames and rejects an RPC error', async () => {
    const { instance, socket } = await connected();
    const result = expect(instance.request('health')).rejects.toThrow('denied'); await flush();
    for (const data of ['{', 'null', '{}', '{"id":"unknown"}']) socket.emit('message', { data });
    expect(instance.pending.size).toBe(1);
    socket.emit('message', { data: JSON.stringify({ id: socket.frames[0].id, error: { message: 'denied' } }) });
    await result;
  });
});

async function turn(options = {}) {
  const { instance, socket } = await connected();
  instance.sessions.set('chat', { runtimeSessionId: 'runtime', model: '', effort: '' });
  const events = [];
  const promise = instance.prompt({ sessionId: 'chat', prompt: [{ type: 'text', text: 'Hello' }], onEvent: event => events.push(event), ...options });
  const outcome = promise.then(value => ({ value }), error => ({ error }));
  await flush();
  return { instance, socket, events, outcome };
}
describe('Hermes turn failures', () => {
  it('rejects an already cancelled prompt before opening a connection', async () => {
    const instance = client(); const controller = new AbortController(); controller.abort();
    await expect(instance.prompt({ prompt: [{ type: 'text', text: 'Hello' }], signal: controller.signal, onEvent: vi.fn() })).rejects.toHaveProperty('name', 'AbortError');
    expect(Socket.instances).toHaveLength(0);
  });
  it('stops after cancellation during handshake without creating a session', async () => {
    const instance = client(); const controller = new AbortController();
    const result = expect(instance.prompt({ prompt: [{ type: 'text', text: 'Hello' }], signal: controller.signal, onEvent: vi.fn() })).rejects.toHaveProperty('name', 'AbortError');
    controller.abort(); Socket.instances[0].open(); await result;
    expect(Socket.instances[0].frames).toEqual([]);
  });
  it.each(['close', 'restart'])('rejects a streaming turn immediately on %s', async mode => {
    const { instance, socket, outcome } = await turn();
    socket.reply(socket.frames[0]); await flush();
    if (mode === 'close') socket.close(); else await instance.restart();
    expect((await outcome).error.message).toContain('closed');
    expect(instance.listeners.size).toBe(0); expect(instance.turnFailures.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['approval.request', 'clarify.request', 'sudo.request', 'secret.request', 'error'])('settles %s before submission acknowledgment', async type => {
    const { socket, outcome, instance } = await turn();
    socket.event(type, { message: 'upstream failed' });
    expect((await outcome).error.message).toContain(type === 'error' ? 'upstream failed' : 'needs input');
    expect(instance.listeners.size).toBe(0); expect(instance.pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    socket.reply(socket.frames[0]);
  });
  it('rejects consumer callback failures and cleans the turn listener', async () => {
    const { instance, socket, outcome } = await turn({ onEvent: event => { if (event.type === 'text_delta') throw new Error('consumer failed'); } });
    socket.reply(socket.frames[0]); socket.event('message.delta', { text: 'Hi' });
    expect((await outcome).error.message).toBe('consumer failed');
    expect(instance.listeners.size).toBe(0);
  });
  it('interrupts cancellation before submission acknowledgment', async () => {
    const controller = new AbortController();
    const { socket, outcome, instance } = await turn({ signal: controller.signal });
    controller.abort();
    expect((await outcome).error.name).toBe('AbortError');
    await flush();
    expect(socket.frames.map(frame => frame.method)).toEqual(['prompt.submit', 'session.interrupt']);
    for (const frame of socket.frames) socket.reply(frame);
    expect(instance.listeners.size).toBe(0);
  });
  it('times out a turn even after the submit RPC succeeds', async () => {
    const { socket, outcome, instance } = await turn();
    socket.reply(socket.frames[0]);
    await vi.advanceTimersByTimeAsync(600_000);
    expect((await outcome).error.message).toContain('turn timed out');
    expect(instance.listeners.size).toBe(0);
  });
  it('ignores other sessions and emits fallback text, tools and usage', async () => {
    const { socket, outcome, events } = await turn();
    socket.reply(socket.frames[0]); socket.event('error', {}, 'other');
    for (const type of ['tool.start', 'tool.progress', 'tool.complete']) socket.event(type, { name: 'search' });
    socket.event('message.complete', { text: 'Final', usage: { input: 4, output: 2 } });
    expect((await outcome).value).toEqual({ sessionId: 'chat' });
    expect(events).toContainEqual({ type: 'usage', inputTokens: 4, outputTokens: 2 });
    expect(events.filter(event => event.type === 'activity')).toHaveLength(3);
    expect(events.filter(event => event.type === 'text_delta')).toEqual([{ type: 'text_delta', delta: 'Final' }]);
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });
});

describe('Hermes catalog failures', () => {
  it.each([401, 500])('rejects HTTP %s without caching the failure', async status => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status }));
    const instance = client({ fetchImpl });
    await expect(instance.getModelCatalog()).rejects.toThrow('could not load');
    await expect(instance.getModelCatalog()).rejects.toThrow('could not load');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each(['{', '{}', '{"providers":[]}'])('rejects malformed or empty model catalog %s', async body => {
    const instance = client({ fetchImpl: async () => new Response(body) });
    await expect(instance.getModelCatalog()).rejects.toThrow();
  });
  it('does not let an old failed load evict a refreshed catalog', async () => {
    let rejectOld;
    const models = [{ id: 'model' }];
    const instance = client();
    const load = vi.spyOn(instance, 'loadModelCatalog').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; })).mockResolvedValue(models);
    const old = expect(instance.getModelCatalog()).rejects.toThrow('old load');
    await expect(instance.getModelCatalog({ refresh: true })).resolves.toBe(models);
    rejectOld(new Error('old load')); await old;
    await expect(instance.getModelCatalog()).resolves.toBe(models);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

it.each([[], [{ type: 'image', data: 'x' }]])('rejects unsupported or empty prompt %j before opening a socket', async prompt => {
  await expect(client().prompt({ prompt, onEvent: vi.fn() })).rejects.toThrow(); expect(Socket.instances).toHaveLength(0);
});
it('does not mutate the selected model when gateway confirmation is required', async () => {
  const instance = client(); const state = { runtimeSessionId: 'runtime', model: 'old', effort: '' };
  vi.spyOn(instance, 'request').mockResolvedValue({ confirm_required: true, warning: 'Confirm in Desktop' });
  await expect(instance.configureSession(state, 'new', '')).rejects.toThrow('Confirm in Desktop'); expect(state.model).toBe('old');
});
it('does not cache a session when creation returns no ID', async () => {
  const instance = client(); vi.spyOn(instance, 'request').mockResolvedValue({});
  await expect(instance.createSession('chat', 'model', '')).rejects.toThrow('did not create'); expect(instance.sessions.size).toBe(0);
});
it('uses inherited default reasoning when the profile returns no value', async () => {
  const instance = client(); const request = vi.spyOn(instance, 'request').mockResolvedValue({});
  const state = { runtimeSessionId: 'runtime', model: '', effort: 'high' };
  await instance.configureSession(state, '', '');
  expect(request).toHaveBeenLastCalledWith('config.set', { key: 'reasoning', value: 'medium', session_id: 'runtime' }); expect(state.effort).toBe('');
});
it('completes an empty reply and preserves schema instructions', async () => {
  const { socket, outcome, events } = await turn({ instructions: 'Use schema', outputSchema: { type: 'object' } });
  expect(socket.frames[0].params.text).toContain('Return only JSON matching this schema: {"type":"object"}');
  socket.reply(socket.frames[0]); socket.event('message.complete');
  expect((await outcome).value).toEqual({ sessionId: 'chat' }); expect(events.at(-1).type).toBe('done');
});
