// Translate loopback HTTP requests into the companion service Fetch contract.
import type { EventEmitter } from 'node:events';

export interface CompanionIncomingRequest extends Pick<EventEmitter, 'once'>, AsyncIterable<unknown> {
  method?: string | undefined;
  url?: string | undefined;
  headers: Record<string, unknown>;
  destroy: () => unknown;
}

export interface CompanionOutgoingResponse extends Pick<EventEmitter, 'once'> {
  headersSent: boolean;
  writableEnded: boolean;
  writeHead: (status: number, headers: Record<string, string>) => unknown;
  write: (chunk: Uint8Array) => unknown;
  end: (body?: string) => unknown;
}

export interface CompanionRequestHandlerOptions {
  handleRequest: (request: Request) => Promise<Response>;
  host: string;
  getPort: () => number;
  maxRequestBytes: number;
  maxImageRequestBytes: number;
}

export function createCompanionRequestHandler(
  { handleRequest, host, getPort, maxRequestBytes, maxImageRequestBytes }: CompanionRequestHandlerOptions,
): (incoming: CompanionIncomingRequest, outgoing: CompanionOutgoingResponse) => Promise<void> {
  return async (incoming, outgoing) => {
    try {
      const abortController = new AbortController();
      incoming.once('aborted', () => abortController.abort());
      outgoing.once('close', () => { if (!outgoing.writableEnded) abortController.abort(); });
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) headers.set(name, value.join(', '));
        else if (typeof value === 'string') headers.set(name, value);
      }
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      const requestLimit = String(incoming.url || '').split('?')[0] === '/v1/uploads'
        ? maxImageRequestBytes
        : maxRequestBytes;
      if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
        const declaredBytes = Number(incoming.headers['content-length'] || 0);
        if (Number.isFinite(declaredBytes) && declaredBytes > requestLimit) {
          outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          outgoing.end('{"error":"request_too_large"}');
          incoming.destroy();
          return;
        }
        for await (const chunk of incoming) {
          const buffer = Buffer.from(chunk as Uint8Array);
          receivedBytes += buffer.byteLength;
          if (receivedBytes > requestLimit) {
            outgoing.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
            outgoing.end('{"error":"request_too_large"}');
            incoming.destroy();
            return;
          }
          chunks.push(buffer);
        }
      }
      const request = new Request(`http://${host}:${getPort()}${incoming.url || '/'}`, {
        method: incoming.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        signal: abortController.signal,
        // Node's Request accepts undefined optional fields and Buffer bodies.
      } as RequestInit);
      const response = await handleRequest(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (!response.body) {
        outgoing.end();
        return;
      }
      for await (const chunk of response.body) outgoing.write(chunk);
      outgoing.end();
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      outgoing.end('{"error":"internal_error"}');
    }
  };
}
