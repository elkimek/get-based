import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

/** Serve only the assembled public artifact, with the deployed CSP and isolated releases. */
export type KitServerRoute = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;
export async function startKitServer(artifact: string, routes: KitServerRoute[] = []) {
  const deployment = JSON.parse(await fs.readFile('vercel.json', 'utf8')) as { routes: { headers?: Record<string, string> }[] };
  const csp = deployment.routes.map(route => route.headers?.['Content-Security-Policy']).find(Boolean)!;
  const state = { buildId: 'kit-test-a', offline: false, failPath: '' };
  const sockets = new Set<Socket>();
  const types: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
    '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
  const server = http.createServer(async (req, res) => {
    if (state.offline) { req.socket.destroy(); return; }
    try {
      for (const route of routes) if (await route(req, res)) return;
      let pathname = new URL(req.url!, 'http://localhost').pathname;
      if (pathname === state.failPath) { res.writeHead(503); res.end('Unavailable'); return; }
      if (pathname === '/js/bundle-legacy-probe-AAA.js') {
        if (state.buildId !== 'kit-test-a') { res.writeHead(404); res.end('Removed from the new build'); return; }
        res.setHeader('Content-Type', 'text/javascript'); res.end('export const legacyProbe = "old-tab-code";'); return;
      }
      if (pathname === '/api/commit') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ cacheKey: state.buildId })); return;
      }
      if (['/', '/app', '/app/'].includes(pathname)) pathname = '/index.html';
      const file = path.resolve(artifact, '.' + pathname);
      if (!file.startsWith(path.resolve(artifact) + path.sep)) throw new Error('Invalid artifact path');
      let body = await fs.readFile(file);
      if (pathname === '/service-worker.js') {
        let source = body.toString().replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${state.buildId}';`);
        if (state.buildId === 'kit-test-a') source = source.replace('const APP_SHELL = [', 'const APP_SHELL = [\n  \'/js/bundle-legacy-probe-AAA.js\',');
        body = Buffer.from(source);
      }
      if (pathname === '/version.js') body = Buffer.from(body.toString().replace(/self.APP_BUILD_ID = '[^']*';/, `self.APP_BUILD_ID = '${state.buildId}';`));
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Content-Security-Policy', csp); res.setHeader('Cache-Control', 'no-store'); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() { state.offline = true; const closed = new Promise<void>(resolve => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy(); await closed; },
  };
}
