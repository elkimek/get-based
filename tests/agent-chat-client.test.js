// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAgentHost, listAgentModels, streamAgentTurn, uploadAgentImage } from '../js/agent-chat-client.js';

function ndjsonResponse(events) {
  const body = events.map(event => `${JSON.stringify(event)}\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('agent chat client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('streams deltas and posts browser-executed tool results', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ndjsonResponse([
        { type: 'session', threadId: 'thread-1', turnId: 'turn-1', model: 'gpt-5.4' },
        { type: 'tool_call', responseId: 'response-1', tool: 'getbased_section', namespace: null, arguments: { section: 'lipids' } },
        { type: 'text_delta', delta: 'ApoB ' },
        { type: 'text_delta', delta: 'improved.' },
        { type: 'usage', inputTokens: 10, outputTokens: 3 },
        { type: 'done', finishReason: 'stop' },
      ]))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const onStream = vi.fn();
    const toolRuntime = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        contentItems: [{ type: 'inputText', text: '[lipids]\nApoB: 80 mg/dL' }],
      }),
    };

    const result = await streamAgentTurn({
      endpoint: 'http://127.0.0.1:8324',
      token: 'secret-token',
      prompt: 'How are my lipids?',
      tools: [],
      toolRuntime,
      onStream,
    });

    expect(result).toEqual({
      text: 'ApoB improved.',
      threadId: 'thread-1',
      model: 'gpt-5.4',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 3 },
      toolCalls: [{ tool: 'getbased_section', arguments: { section: 'lipids' } }],
      webSearches: [],
    });
    expect(onStream).toHaveBeenLastCalledWith('ApoB improved.');
    expect(toolRuntime.execute).toHaveBeenCalledWith({
      tool: 'getbased_section', namespace: null, arguments: { section: 'lipids' },
    });
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:8324/v1/responses/response-1');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer secret-token');
  });

  it('rejects non-loopback endpoints before sending health data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(streamAgentTurn({
      endpoint: 'https://attacker.example', token: 'x', prompt: 'secret', tools: [],
      toolRuntime: { execute: vi.fn() },
    })).rejects.toThrow('loopback');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the local agent model catalog with bearer authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ id: 'gpt-5.6-sol' }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listAgentModels({ endpoint: 'http://127.0.0.1:8324', token: 'secret-token' }))
      .resolves.toEqual([{ id: 'gpt-5.6-sol' }]);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8324/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer secret-token' },
    }));
  });

  it('normalizes versioned Agent Host status capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      service: 'getbased-agent-host', protocolVersion: 2,
      capabilities: ['chat-stream', 'chat-stream', 'image-upload'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(checkAgentHost({ endpoint: 'http://127.0.0.1:8324', token: 'secret-token' }))
      .resolves.toMatchObject({ protocolVersion: 2, capabilities: ['chat-stream', 'image-upload'] });
  });

  it('uploads image bytes only to the authenticated loopback host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uploadId: 'upload-1' }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    await expect(uploadAgentImage({ endpoint: 'http://127.0.0.1:8324', token: 'secret-token', file }))
      .resolves.toBe('upload-1');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8324/v1/uploads', expect.objectContaining({
      method: 'POST', body: file,
      headers: expect.objectContaining({ Authorization: 'Bearer secret-token', 'Content-Type': 'image/png' }),
    }));
  });

  it('turns an outdated image endpoint into an actionable restart error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"not_found"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })));
    const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const promise = uploadAgentImage({ endpoint: 'http://127.0.0.1:8324', token: 'secret-token', file });
    await expect(promise).rejects.toMatchObject({ code: 'agent_host_upgrade_required' });
    await expect(promise).rejects.toThrow('Restart it to enable image support');
  });

  it('records model reroutes and web-search activity for answer provenance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      { type: 'session', threadId: 'thread-2', turnId: 'turn-2', model: 'gpt-5.6-sol' },
      { type: 'model', model: 'gpt-5.6-terra' },
      { type: 'activity', activity: 'web_search', status: 'started', query: 'generic health research' },
      { type: 'text_delta', delta: 'Answer' },
      { type: 'done', finishReason: 'stop' },
    ])));
    await expect(streamAgentTurn({
      endpoint: 'http://127.0.0.1:8324', token: 'secret-token', prompt: 'Research this', tools: [],
    })).resolves.toMatchObject({
      model: 'gpt-5.6-terra',
      webSearches: [{ status: 'started', query: 'generic health research' }],
    });
  });
});
