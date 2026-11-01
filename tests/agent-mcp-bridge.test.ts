// @vitest-environment node

import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAgentMCPBridge } from '../lib/agent-mcp-bridge.js';

interface BridgeReply { result: { serverInfo: { name: string }; tools: { name: string }[] } }

describe('getbased MCP bridge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes only the host-provided catalog and relays calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: { headers: { Authorization: string }; body: string }) => {
      expect(options.headers.Authorization).toBe('Bearer 1234567890123456');
      if (String(url).endsWith('/internal/mcp/tools')) return Response.json({ tools: [{
        name: 'getbased_lab_context', description: 'Read labs', inputSchema: { type: 'object' },
      }] });
      expect(JSON.parse(options.body)).toEqual({ name: 'getbased_lab_context', arguments: {} });
      return Response.json({ content: [{ type: 'text', text: 'ApoB 80' }], isError: false });
    }));
    const input = new PassThrough();
    const output = new PassThrough();
    let rendered = '';
    output.on('data', chunk => { rendered += String(chunk); });
    const running = runAgentMCPBridge({
      endpoint: 'http://127.0.0.1:8324', token: '1234567890123456', input, output,
    });
    input.end([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'getbased_lab_context', arguments: {} } }),
    ].join('\n'));
    await running;
    const messages = rendered.trim().split('\n').map(JSON.parse as unknown as (value: string, index: number) => BridgeReply);
    expect(messages).toHaveLength(3);
    expect(messages[0]!.result.serverInfo.name).toBe('getbased');
    expect(messages[1]!.result.tools[0]!.name).toBe('getbased_lab_context');
    expect(messages[2]!.result).toEqual({ content: [{ type: 'text', text: 'ApoB 80' }], isError: false });
  });
  it('announces readiness only after the client acknowledges the catalog round trip', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith('/tools') ? {tools:[]} : {ok:true}));
    vi.stubGlobal('fetch', fetcher);
    const input = new PassThrough(), output = new PassThrough();
    let rendered = '';
    output.on('data', chunk => { rendered += String(chunk); });
    const running = runAgentMCPBridge({endpoint:'http://127.0.0.1:8324', token:'1234567890123456', input, output, notifyReady:true});
    input.write(JSON.stringify({jsonrpc:'2.0', id:1, method:'tools/list'})+'\n');
    await vi.waitFor(() => expect(rendered).toContain('getbased-catalog-ready-1'));
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8324/internal/mcp/tools']);
    input.write(JSON.stringify({jsonrpc:'2.0', id:'unrelated', result:{}})+'\n');
    input.end(JSON.stringify({jsonrpc:'2.0', id:'getbased-catalog-ready-1', result:{}})+'\n');
    await running;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:8324/internal/mcp/tools','http://127.0.0.1:8324/internal/mcp/ready']);
  });

});
