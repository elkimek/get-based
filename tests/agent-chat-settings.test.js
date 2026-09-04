// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectDetectedCodex, DEFAULT_AGENT_HOST_ENDPOINT, discoverLocalChatAgents, getAgentHostAgent,
  getAgentHostEffort, getAgentHostEndpoint, getAgentHostModel, getAgentHostToken, getChatBackend, normalizeAgentHostEndpoint,
  saveAgentChatSettings, setChatBackend,
} from '../js/agent-chat-settings.js';
import { clearKeyCache } from '../js/crypto-key-cache.js';

describe('agent chat settings', () => {
  beforeEach(() => { localStorage.clear(); clearKeyCache(); });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts only loopback HTTP endpoints', () => {
    expect(normalizeAgentHostEndpoint('http://localhost:8324/')).toBe('http://localhost:8324');
    expect(normalizeAgentHostEndpoint(DEFAULT_AGENT_HOST_ENDPOINT)).toBe(DEFAULT_AGENT_HOST_ENDPOINT);
    expect(() => normalizeAgentHostEndpoint('https://getbased.health')).toThrow('loopback');
    expect(() => normalizeAgentHostEndpoint('http://192.168.1.20:8324')).toThrow('loopback');
    expect(() => normalizeAgentHostEndpoint('http://user:pass@localhost:8324')).toThrow('loopback');
  });

  it('keeps the existing direct provider as the default chat backend', () => {
    expect(getChatBackend()).toBe('direct');
    expect(setChatBackend('codex')).toBe('codex');
    expect(getChatBackend()).toBe('codex');
    expect(setChatBackend('unexpected')).toBe('direct');
  });

  it('normalizes local CLI discovery and requests a real rescan when asked', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ agents: [{
      id: 'codex', name: 'Codex CLI', description: 'OpenAI official CLI', version: '0.150.1',
      status: 'available', compatible: true, endpoint: DEFAULT_AGENT_HOST_ENDPOINT, token: 'private-token-value',
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const agents = await discoverLocalChatAgents({ refresh: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/local-agents?refresh=1', expect.objectContaining({ cache: 'no-store' }));
    expect(agents[0]).toMatchObject({ id: 'codex', description: 'OpenAI official CLI', compatible: true });
  });

  it('discovers a standalone companion without manual endpoint or token input', async () => {
    const fetchMock = vi.fn(async input => {
      const url = String(input);
      if (url === '/api/local-agents') return new Response('{"error":"not_found"}', { status: 404 });
      if (url === 'http://127.0.0.1:8326/v1/discovery') {
        return new Response(JSON.stringify({
          service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8326',
          token: 'automatic-companion-token', protocolVersion: 2,
          capabilities: ['chat-stream', 'image-upload'],
          agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new TypeError('connection refused');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(discoverLocalChatAgents()).resolves.toEqual([expect.objectContaining({
      id: 'codex', endpoint: 'http://127.0.0.1:8326', token: 'automatic-companion-token',
      protocolVersion: 2, capabilities: ['chat-stream', 'image-upload'],
    })]);
    expect(fetchMock).not.toHaveBeenCalledWith('http://127.0.0.1:8327/v1/discovery', expect.anything());
  });

  it('recovers from an outdated saved host by switching to a capable companion', async () => {
    localStorage.setItem('labcharts-agent-host-token', 'outdated-companion-token');
    localStorage.setItem('labcharts-agent-host-endpoint', 'http://127.0.0.1:8326');
    const fetchMock = vi.fn(async input => {
      const url = String(input);
      if (url === '/api/local-agents') return new Response(JSON.stringify({ agents: [{
        id: 'codex', name: 'Codex CLI', status: 'available', compatible: true,
        endpoint: 'http://127.0.0.1:8326', token: 'outdated-companion-token',
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url === 'http://127.0.0.1:8326/v1/status') return new Response(JSON.stringify({
        service: 'getbased-agent-host', protocolVersion: 0, capabilities: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url === 'http://127.0.0.1:8324/v1/discovery') return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324',
        token: 'current-companion-token', protocolVersion: 2,
        capabilities: ['chat-stream', 'dynamic-tools', 'image-upload'],
        agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url === 'http://127.0.0.1:8324/v1/status') return new Response(JSON.stringify({
        service: 'getbased-agent-host', protocolVersion: 2,
        capabilities: ['chat-stream', 'dynamic-tools', 'image-upload'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      throw new TypeError('connection refused');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectDetectedCodex({ requiredCapabilities: ['chat-stream', 'image-upload'] }))
      .resolves.toMatchObject({ endpoint: 'http://127.0.0.1:8324', protocolVersion: 2 });
    expect(getAgentHostEndpoint()).toBe('http://127.0.0.1:8324');
    expect(getAgentHostToken()).toBe('current-companion-token');
  });

  it('stores model and reasoning choices without exposing connection controls', async () => {
    await saveAgentChatSettings({ model: 'gpt-5.6-sol', effort: 'high' });
    expect(getAgentHostModel()).toBe('gpt-5.6-sol');
    expect(getAgentHostEffort()).toBe('high');
  });

  it('remembers model and reasoning choices independently for each CLI agent', async () => {
    await saveAgentChatSettings({ agent: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
    await saveAgentChatSettings({ agent: 'opencode' });
    expect(getAgentHostAgent()).toBe('opencode');
    expect(getAgentHostModel()).toBe('');
    expect(getAgentHostEffort()).toBe('');

    await saveAgentChatSettings({ model: 'openrouter/model-a', effort: 'xhigh' });
    await saveAgentChatSettings({ agent: 'codex' });
    expect(getAgentHostModel()).toBe('gpt-5.6-sol');
    expect(getAgentHostEffort()).toBe('medium');

    await saveAgentChatSettings({ agent: 'opencode' });
    expect(getAgentHostModel()).toBe('openrouter/model-a');
    expect(getAgentHostEffort()).toBe('xhigh');
  });

  it('remembers reasoning independently for each model within a CLI agent', async () => {
    await saveAgentChatSettings({ agent: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
    await saveAgentChatSettings({ model: 'gpt-5.6-luna' });
    expect(getAgentHostEffort()).toBe('');
    await saveAgentChatSettings({ effort: 'low' });

    await saveAgentChatSettings({ model: 'gpt-5.6-sol' });
    expect(getAgentHostEffort()).toBe('medium');
    await saveAgentChatSettings({ model: 'gpt-5.6-luna' });
    expect(getAgentHostEffort()).toBe('low');
  });

  it('retains full provider-qualified model IDs for catalog rehydration', async () => {
    const model = `openrouter/${'provider-segment/'.repeat(7)}model-name`;
    expect(model.length).toBeGreaterThan(100);
    await saveAgentChatSettings({ model });
    expect(getAgentHostModel()).toBe(model);
  });
});
