// @vitest-environment node

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHermesGatewayWebSocketUrl,
  createHermesGatewayRouteProvider,
  HermesGatewayClient,
  hermesDesktopRegistryPath,
  normalizeHermesGatewayBaseUrl,
  normalizeHermesGatewayModelCatalog,
} from '../lib/hermes-gateway-client.js';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

class FakeWebSocket extends EventEmitter {
  static urls = [];
  static frames = [];
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    FakeWebSocket.urls.push(url);
    queueMicrotask(() => { this.readyState = 1; this.emit('open', {}); });
  }
  addEventListener(type, handler) { this.on(type, handler); }
  removeEventListener(type, handler) { this.off(type, handler); }
  send(raw) {
    const frame = JSON.parse(raw);
    FakeWebSocket.frames.push(frame);
    if (frame.method === 'session.create') {
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { session_id: 'hermes-live-1' } }) }));
    } else if (frame.method === 'config.get') {
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { value: 'medium' } }) }));
    } else if (frame.method === 'config.set') {
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { key: frame.params.key, value: frame.params.value } }) }));
    } else if (frame.method === 'prompt.submit') {
      queueMicrotask(() => {
        this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { status: 'streaming' } }) });
        this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'hermes-live-1', payload: { text: 'Personal reply' } } }) });
        this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.complete', session_id: 'hermes-live-1', payload: { text: 'Personal reply', usage: { input_tokens: 12, output_tokens: 2 } } } }) });
      });
    }
  }
  close() { this.readyState = 3; this.emit('close', {}); }
}

const modelPayload = {
  provider: 'openai-codex', model: 'gpt-5.6-sol',
  providers: [{ slug: 'openai-codex', name: 'ChatGPT or Codex subscription', authenticated: true, models: ['gpt-5.6-sol', 'gpt-5.6-luna'] }],
};

describe('Hermes personal gateway adapter', () => {
  it('uses platform-specific Desktop registry paths and rejects insecure remote HTTP', () => {
    expect(hermesDesktopRegistryPath('linux', { HOME: '/home/alice' })).toBe('/home/alice/.config/Hermes/connections.json');
    expect(hermesDesktopRegistryPath('darwin', { HOME: '/Users/alice' })).toBe('/Users/alice/Library/Application Support/Hermes/connections.json');
    expect(hermesDesktopRegistryPath('win32', { USERPROFILE: 'C:\\Users\\alice', APPDATA: 'C:\\Users\\alice\\AppData\\Roaming' }))
      .toContain('Hermes');
    expect(normalizeHermesGatewayBaseUrl('http://127.0.0.1:9119/')).toBe('http://127.0.0.1:9119');
    expect(() => normalizeHermesGatewayBaseUrl('http://gateway.example')).toThrow('HTTPS');
    expect(buildHermesGatewayWebSocketUrl('https://gateway.example/hermes', 'a/b c'))
      .toBe('wss://gateway.example/hermes/api/ws?token=a%2Fb+c');
  });

  it('normalizes the profile-scoped provider catalog for GetBase', () => {
    const catalog = normalizeHermesGatewayModelCatalog(modelPayload);
    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      id: 'openai-codex:gpt-5.6-sol', isDefault: true, inputModalities: ['text'],
    });
    expect(catalog[0].supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  });

  it('discovers profiles without serializing the Desktop token', async () => {
    const root = mkdtempSync(join(tmpdir(), 'getbased-hermes-routes-'));
    roots.push(root);
    const registryPath = join(root, 'connections.json');
    writeFileSync(registryPath, JSON.stringify({ connections: [{
      id: 'homelab', kind: 'remote', label: 'Homelab', url: 'https://hermes.example',
      authMode: 'token', token: { encoding: 'plain', value: 'desktop-secret-token' },
    }] }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ profiles: [{
      name: 'omer', display_name: 'Omer', description: 'Personal assistant',
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const provider = createHermesGatewayRouteProvider({ registryPath, fetchImpl, WebSocketImpl: FakeWebSocket });
    const routes = await provider.listRoutes();
    expect(routes).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^gateway-/), label: 'Omer · Homelab', profile: 'omer', status: 'available',
    })]);
    expect(JSON.stringify(routes)).not.toContain('desktop-secret-token');
    await expect(provider.resolve(routes[0].id)).resolves.toHaveProperty('client');
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ 'X-Hermes-Session-Token': 'desktop-secret-token' });
  });

  it('creates a profile-scoped session and streams the personal reply', async () => {
    FakeWebSocket.urls = [];
    FakeWebSocket.frames = [];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(modelPayload), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const client = new HermesGatewayClient({
      baseUrl: 'https://hermes.example', token: 'private-token', profile: 'omer', label: 'Homelab',
      fetchImpl, WebSocketImpl: FakeWebSocket,
    });
    await expect(client.getModelCatalog()).resolves.toHaveLength(2);
    const events = [];
    await client.prompt({
      sessionId: 'getbased-chat-1', model: 'openai-codex:gpt-5.6-sol', effort: 'high', instructions: 'Keep your identity.',
      prompt: [{ type: 'text', text: 'Who is there?' }], onEvent: event => events.push(event),
    });
    expect(FakeWebSocket.urls[0]).toContain('/api/ws?token=private-token');
    expect(events).toEqual([
      expect.objectContaining({ type: 'session', model: 'openai-codex:gpt-5.6-sol' }),
      { type: 'text_delta', delta: 'Personal reply' },
      { type: 'usage', inputTokens: 12, outputTokens: 2 },
      { type: 'done', finishReason: 'stop' },
    ]);
    await client.prompt({
      sessionId: 'getbased-chat-1', model: 'openai-codex:gpt-5.6-luna', effort: '', instructions: 'Keep your identity.',
      prompt: [{ type: 'text', text: 'And now?' }], onEvent: () => {},
    });
    expect(FakeWebSocket.frames.filter(frame => frame.method === 'session.create')).toHaveLength(1);
    expect(FakeWebSocket.frames).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'config.set', params: expect.objectContaining({ key: 'model', value: 'openai-codex:gpt-5.6-luna', session_id: 'hermes-live-1' }) }),
      expect.objectContaining({ method: 'config.get', params: { key: 'reasoning', profile: 'omer' } }),
      expect.objectContaining({ method: 'config.set', params: expect.objectContaining({ key: 'reasoning', value: 'medium', session_id: 'hermes-live-1' }) }),
    ]));
    await client.close();
  });
});
