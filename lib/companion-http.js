// @ts-check
// Translate loopback HTTP requests into the companion service Fetch contract.
/**
 * @param {{
 *   handleRequest: (request: Request) => Promise<Response>,
 *   host: string,
 *   getPort: () => number,
 *   maxRequestBytes: number,
 *   maxImageRequestBytes: number,
 * }} options
 * @returns {import('node:http').RequestListener}
 */
export function createCompanionRequestHandler({ handleRequest, host, getPort, maxRequestBytes, maxImageRequestBytes }) {
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
      const chunks = [];
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
          const buffer = Buffer.from(chunk);
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
      });
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
