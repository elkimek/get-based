import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION } from '../../shared/agent-host-protocol.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../../shared/agent-tool-contract.js';
export const syntheticMealAnalysis = { mealName: 'Synthetic meal', components: [{ name: 'Rice', quantityG: 100, confidence: 0.75, nutrients: { energyKcal: 130 } }], nutrients: { energyKcal: 130 } };
export interface MealTransferRequest { path: string; bytes: number; model?: string; agent?: string; target?: string; closed: boolean; aborted: boolean; images?: number }
/** A real loopback transport; no fixture endpoint is added to the production app. */
export async function startMealTransferServer(hold: 'api' | 'upload' | 'turn' | null = null) {
  const requests: MealTransferRequest[] = [], held = new Set<ServerResponse>(); let origin = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8000'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); response.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    const path = new URL(request.url || '/', 'http://fixture').pathname;
    const metadata = { ok: true, service: 'getbased-agent-host', protocolVersion: AGENT_HOST_PROTOCOL_VERSION, toolContractVersion: AGENT_TOOL_CONTRACT_VERSION, capabilities: AGENT_HOST_CAPABILITY_LIST, paused: false, state: 'running', endpoint: origin, token: 'synthetic-refreshed-companion-token', agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }] };
    const json = (value: unknown) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    if (path === '/v1/discovery' || path === '/v1/status') { json(metadata); return; }
    const entry: MealTransferRequest = { path, bytes: 0, closed: false, aborted: false }; requests.push(entry);
    response.on('close', () => { entry.closed = true; entry.aborted = !response.writableEnded; held.delete(response); });
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks); entry.bytes = body.length;
      if (path !== '/v1/uploads' && body.length) { const value = JSON.parse(body.toString()); entry.model = value.model; entry.agent = value.agent; entry.target = value.target; entry.images = value.imageUploadIds?.length ?? value.messages?.flatMap((row: { content?: unknown }) => Array.isArray(row.content) ? row.content.filter((block: { type?: string }) => block.type === 'image_url') : []).length; }
      if (hold === 'api' && path === '/v1/chat/completions' || hold === 'upload' && path === '/v1/uploads' || hold === 'turn' && path === '/v1/turns') { held.add(response); return; }
      if (path === '/v1/uploads') { json({ uploadId: randomUUID() }); return; }
      if (path === '/v1/turns') { response.setHeader('Content-Type', 'application/x-ndjson'); response.end([ { type: 'session', threadId: 'synthetic-feature-thread', turnId: 'synthetic-feature-turn', model: entry.model }, { type: 'text_delta', delta: JSON.stringify(syntheticMealAnalysis) }, { type: 'done', finishReason: 'stop' } ].map(row => JSON.stringify(row) + '\n').join('')); return; }
      if (path === '/v1/chat/completions') { json({ choices: [{ message: { content: JSON.stringify(syntheticMealAnalysis) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); return; }
      response.writeHead(404).end();
    } catch { if (!response.destroyed) response.writeHead(400).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Synthetic transport did not bind'); origin = `http://127.0.0.1:${address.port}`;
  return { origin, requests, async close() { for (const response of held) response.destroy(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
