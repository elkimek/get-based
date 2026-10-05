// Tiny stdio MCP server that forwards only approved getbased tool calls to the
// loopback companion. The per-session token never reaches the browser.

import { createInterface } from 'node:readline';

export interface AgentMCPBridgeOptions {
  endpoint?: string;
  token?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

// Fields remain opaque until their existing protocol-specific coercions.
interface MCPMessage {
  id?: unknown;
  method?: unknown;
  params?: { protocolVersion?: unknown; name?: unknown; arguments?: unknown } | null;
}

const MAX_MESSAGE_BYTES = 1_100_000;

function cleanEndpoint(value: unknown) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('The getbased MCP bridge requires a loopback endpoint.');
  }
  return url.origin;
}

export async function runAgentMCPBridge(options: AgentMCPBridgeOptions = {}) {
  const endpoint = cleanEndpoint(options.endpoint || process.env.GETBASED_MCP_ENDPOINT);
  const token = String(options.token || process.env.GETBASED_MCP_TOKEN || '').trim();
  if (token.length < 16 || /[\r\n]/.test(token)) throw new Error('The getbased MCP bridge token is invalid.');
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const send = (value: unknown) => output.write(`${JSON.stringify(value)}\n`);
  const request = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${endpoint}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    } as RequestInit);
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String((payload as { error?: unknown } | null)?.error || `getbased returned HTTP ${response.status}`));
    return payload;
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) continue;
    let message: MCPMessage | null;
    try { message = JSON.parse(line); } catch { continue; }
    if (!message || typeof message !== 'object' || !Object.hasOwn(message, 'id')) continue;
    try {
      let result;
      if (message.method === 'initialize') {
        result = {
          protocolVersion: String(message.params?.protocolVersion || '2024-11-05'),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'getbased', version: '1.0.0' },
        };
      } else if (message.method === 'ping') result = {};
      else if (message.method === 'tools/list') result = await request('/internal/mcp/tools');
      else if (message.method === 'tools/call') result = await request('/internal/mcp/call', {
        name: message.params?.name, arguments: message.params?.arguments || {},
      });
      else throw Object.assign(new Error(`Unsupported MCP method: ${message.method}`), { code: -32601 });
      send({ jsonrpc: '2.0', id: message.id, result });
    } catch (error) {
      send({
        jsonrpc: '2.0', id: message.id,
        error: { code: Number((error as { code?: unknown } | null)?.code || -32603), message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}
